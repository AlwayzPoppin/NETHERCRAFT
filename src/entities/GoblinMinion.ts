import * as THREE from 'three';
import { ModelCache } from '../utils/ModelCache';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { ItemManager } from '../items/ItemManager';
import { EntityHealthBar } from '../ui/EntityHealthBar';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { BlockType } from '../textures/TextureGenerator';
import { disposeHierarchy } from '../utils/DisposeUtils';

export enum GoblinState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  CHASE = 'CHASE',
  CLIMB = 'CLIMB',
  ATTACK = 'ATTACK',
  HEAVY_STAB = 'HEAVY_STAB',
  BLOCK = 'BLOCK',
  DODGE = 'DODGE',
  RETREAT_SPACE = 'RETREAT_SPACE',
  HURT = 'HURT',
  DYING = 'DYING',
}

const GOBLIN_ANIM_PATHS = {
  idle: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Idle_1.glb',
  walk: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Walking_Scan_with_Sudden_Look_Back.glb',
  run: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_RUNNING.glb',
  climb: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_climbing_up_wall.glb',
  attack: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Attack.glb',
  heavy_stab: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_HEAVY_STAB.glb',
  block: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Block_1.glb',
  dodge: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Roll_Dodge.glb',
  walk_back: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Walk_Backward_with_Sword.glb',
  death: '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Dying_Backwards.glb',
};

export class GoblinMinion {
  public scene: THREE.Scene;
  public particleManager: BlockParticleManager;
  public sound: SoundManager;
  public world: VoxelWorld;
  public itemManager: ItemManager;

  // Frame-sliced LoS Scheduling & Zero-Garbage Scratch Vectors
  private static nextEntityId: number = 0;
  private readonly entityId: number = ++GoblinMinion.nextEntityId;
  private static readonly SCRATCH_GOBLIN_EYE = new THREE.Vector3();
  private static readonly SCRATCH_PLAYER_EYE = new THREE.Vector3();

  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  public actions: Map<string, THREE.AnimationAction> = new Map();
  public currentActionName: string = '';

  // Stats
  public health: number = 45;
  public maxHealth: number = 45;
  public isDead: boolean = false;
  public isDisposed: boolean = false;

  // AI & States
  public state: GoblinState = GoblinState.IDLE;
  private stateTimer: number = 2.0 + Math.random() * 2.0;
  private wanderTarget: THREE.Vector3 = new THREE.Vector3();
  public homePosition: THREE.Vector3 = new THREE.Vector3();
  private currentMoveSpeed: number = 0;
  private currentYaw: number = Math.random() * Math.PI * 2;
  private targetYaw: number = 0;
  private attackCooldown: number = 1.5;
  private aggroCooldown: number = 0;
  private unreachableTimer: number = 0;
  private attackProgress: number = 0;
  private hasDealtDamageThisAttack: boolean = false;
  private deathSinkTimer: number = 0;

  // Climbing mechanics
  private climbTargetY: number = 0;
  private climbSpeed: number = 1.1; // Slow, deliberate climbing speed (not fast)
  private climbDustTimer: number = 0;

  // Throttled Line-of-Sight Evaluation (5Hz to 10Hz to prevent 60Hz DDA CPU bottleneck)
  private losTimer: number = Math.random() * 0.15;
  private cachedLosResult: boolean = false;

  // Visual Health Bar
  public healthBar: EntityHealthBar;

  constructor(
    scene: THREE.Scene,
    particleManager: BlockParticleManager,
    sound: SoundManager,
    world: VoxelWorld,
    itemManager: ItemManager,
    spawnPos: THREE.Vector3
  ) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.sound = sound;
    this.world = world;
    this.itemManager = itemManager;

    this.root = new THREE.Group();
    this.root.position.copy(spawnPos);
    this.homePosition.copy(spawnPos);
    this.wanderTarget.copy(spawnPos);
    this.scene.add(this.root);

    // Overhead Billboard Health Bar
    this.healthBar = new EntityHealthBar(this.root, {
      name: 'Goblin Minion',
      icon: '👺',
      maxHealth: this.maxHealth,
      heightOffset: 2.1,
      themeColor: '#f97316',
      scale: 1.0,
    });

    this.loadModel();
  }

  private loadModel(): void {
    const clone = ModelCache.getClone('/entities/GOBLIN MINION.glb');
    if (!clone) {
      setTimeout(() => {
        if (!this.isDisposed && !this.model) {
          this.loadModel();
        }
      }, 300);
      return;
    }

    if (this.isDisposed) {
      disposeHierarchy(clone);
      return;
    }

    this.model = clone;
    this.model.scale.set(1.0, 1.0, 1.0);

    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.material) {
          const origMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          const mat = origMat.clone();
          mat.roughness = 0.75;
          mat.metalness = 0.20;
          if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
          mat.emissiveIntensity = 0.0;
          mat.emissiveMap = null;
          mesh.material = mat;
        }
      }
    });

    // Initialize Animation Mixer
    this.mixer = new THREE.AnimationMixer(this.model);
    this.setupAnimations();

    this.root.add(this.model);
    this.playAnimation('idle', 0.2);
  }

  private setupAnimations(): void {
    if (!this.mixer) return;

    for (const [name, path] of Object.entries(GOBLIN_ANIM_PATHS)) {
      const clip = ModelCache.getAnimationClip(path);
      if (clip) {
        const action = this.mixer.clipAction(clip);
        if (name === 'attack' || name === 'heavy_stab' || name === 'dodge') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else if (name === 'death') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        this.actions.set(name, action);
      }
    }
  }

  public playAnimation(name: string, fadeDuration: number = 0.25): void {
    if (this.currentActionName === name) return;

    const newAction = this.actions.get(name);
    if (!newAction) return;

    const oldAction = this.actions.get(this.currentActionName);
    if (oldAction) {
      oldAction.fadeOut(fadeDuration);
    }

    newAction.reset();
    newAction.fadeIn(fadeDuration);
    newAction.play();
    this.currentActionName = name;
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    if (this.isDisposed) return;

    // Update Animation Mixer
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Death Handling
    if (this.isDead) {
      this.deathSinkTimer += dt;
      if (this.deathSinkTimer > 2.5) {
        this.root.position.y -= dt * 0.4;
      }
      if (this.deathSinkTimer > 5.0) {
        this.dispose();
      }
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.aggroCooldown = Math.max(0, this.aggroCooldown - dt);
    this.losTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position);
    const verticalDist = Math.abs(playerPos.y - this.root.position.y);
    const dist3D = this.root.position.distanceTo(playerPos);
    toPlayer.y = 0;
    const horizontalDist = toPlayer.length();

    // ─── 1. GOBLIN MINION AI STATE MACHINE ───
    switch (this.state) {
      case GoblinState.IDLE: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, dt * 4.0);
        this.playAnimation('idle');
        this.stateTimer -= dt;

        // Spot player within 11m awareness radius, 100° vision peripheral, and unobstructed Line of Sight
        if (this.aggroCooldown <= 0 && this.canSensePlayer(playerPos, 11.0, 100, 1.5)) {
          this.state = GoblinState.CHASE;
          this.unreachableTimer = 0;
          this.sound?.playMonsterHurt?.();
          break;
        }

        if (this.stateTimer <= 0) {
          this.pickNewWanderTarget();
          this.state = GoblinState.PATROL;
          this.stateTimer = 4.0 + Math.random() * 4.0;
        }
        break;
      }

      case GoblinState.PATROL: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 1.2, dt * 3.0);
        this.playAnimation('walk');
        this.stateTimer -= dt;

        // Spot player within 11m awareness radius, 100° vision peripheral, and unobstructed Line of Sight
        if (this.aggroCooldown <= 0 && this.canSensePlayer(playerPos, 11.0, 100, 1.5)) {
          this.state = GoblinState.CHASE;
          this.unreachableTimer = 0;
          this.sound?.playMonsterHurt?.();
          break;
        }

        // Check for vertical wall / ledge in front of goblin to climb
        const checkDist = 0.65;
        const aheadX = this.root.position.x + Math.sin(this.currentYaw) * checkDist;
        const aheadZ = this.root.position.z + Math.cos(this.currentYaw) * checkDist;
        const aheadGroundY = this.getSmoothGroundHeight(aheadX, aheadZ);
        const heightDiff = aheadGroundY - this.root.position.y;

        if (heightDiff > 0.55 && heightDiff <= 4.5) {
          this.state = GoblinState.CLIMB;
          this.climbTargetY = aheadGroundY;
          this.climbSpeed = 1.1; // Slow, deliberate climbing speed
          this.stateTimer = (heightDiff / this.climbSpeed) + 1.2;
          this.climbDustTimer = 0;
          this.playAnimation('climb', 0.15);
          break;
        }

        const toTarget = new THREE.Vector3().subVectors(this.wanderTarget, this.root.position);
        toTarget.y = 0;
        if (toTarget.length() < 1.5 || this.stateTimer <= 0) {
          this.state = GoblinState.IDLE;
          this.stateTimer = 2.0 + Math.random() * 3.0;
        } else {
          this.targetYaw = Math.atan2(toTarget.x, toTarget.z);
        }
        break;
      }

      case GoblinState.CHASE: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 3.0, dt * 4.0);
        this.playAnimation('run');

        // Check if player fled far away (>14m) or flew/climbed out of vertical reach (>4.5m)
        if (dist3D > 14.0 || verticalDist > 4.5) {
          this.unreachableTimer += dt;
          if (this.unreachableTimer >= 0.8 || dist3D > 18.0 || verticalDist > 6.0) {
            // Disengage: stop chasing, apply aggro cooldown so mob doesn't re-track, and pick a wander target
            this.state = GoblinState.PATROL;
            this.stateTimer = 4.0 + Math.random() * 3.0;
            this.aggroCooldown = 5.0;
            this.unreachableTimer = 0;
            this.pickNewWanderTarget();
            break;
          }
        } else {
          this.unreachableTimer = 0;
          if (horizontalDist > 0.05) {
            this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
          }
        }

        // Check for vertical wall / ledge in front of goblin to climb up towards player
        const checkDist = 0.65;
        const aheadX = this.root.position.x + Math.sin(this.currentYaw) * checkDist;
        const aheadZ = this.root.position.z + Math.cos(this.currentYaw) * checkDist;
        const aheadGroundY = this.getSmoothGroundHeight(aheadX, aheadZ);
        const heightDiff = aheadGroundY - this.root.position.y;

        if (heightDiff > 0.55 && heightDiff <= 4.5) {
          this.state = GoblinState.CLIMB;
          this.climbTargetY = aheadGroundY;
          this.climbSpeed = 1.1; // Slow, deliberate climbing speed
          this.stateTimer = (heightDiff / this.climbSpeed) + 1.2;
          this.climbDustTimer = 0;
          this.playAnimation('climb', 0.15);
          break;
        }

        // Close melee range: attack
        if (dist3D <= 2.2 && verticalDist <= 1.8 && this.attackCooldown <= 0) {
          if (Math.random() < 0.35) {
            this.state = GoblinState.HEAVY_STAB;
          } else {
            this.state = GoblinState.ATTACK;
          }
          this.attackProgress = 0;
          this.hasDealtDamageThisAttack = false;
          break;
        }

        // Mid-range tactical dodge if player is charging
        if (dist3D <= 4.0 && verticalDist <= 2.0 && Math.random() < 0.015) {
          this.state = GoblinState.DODGE;
          this.stateTimer = 0.8;
          break;
        }
        break;
      }

      case GoblinState.CLIMB: {
        this.currentMoveSpeed = 0.1; // Slow forward cling
        this.playAnimation('climb', 0.15);
        this.stateTimer -= dt;
        this.climbDustTimer += dt;

        // Ascend vertically at deliberate, slow climbing speed
        this.root.position.y += this.climbSpeed * dt;

        // Visual & audio climbing feedback (hand debris + step rustle)
        if (this.climbDustTimer >= 0.40) {
          this.climbDustTimer = 0;
          const handPos = this.root.position.clone().add(new THREE.Vector3(
            Math.sin(this.currentYaw) * 0.35,
            0.8,
            Math.cos(this.currentYaw) * 0.35
          ));
          this.particleManager.spawnBlockDebris(BlockType.DIRT, handPos, 2);
          this.sound?.playFootstep?.();
        }

        // Reached top of wall or ledge
        if (this.root.position.y >= this.climbTargetY - 0.05 || this.stateTimer <= 0) {
          // Vault onto ledge
          this.root.position.x += Math.sin(this.currentYaw) * 0.45;
          this.root.position.z += Math.cos(this.currentYaw) * 0.45;
          this.root.position.y = this.climbTargetY;

          // Transition back to chase or patrol
          if (dist3D < 14.0 && verticalDist < 3.2) {
            this.state = GoblinState.CHASE;
            this.playAnimation('run', 0.2);
          } else {
            this.state = GoblinState.PATROL;
            this.stateTimer = 3.0 + Math.random() * 3.0;
            this.playAnimation('walk', 0.2);
          }
        }
        break;
      }

      case GoblinState.ATTACK: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0.4, dt * 5.0);
        this.playAnimation('attack', 0.1);
        this.attackProgress += dt * 1.5;

        // Damage delivery around mid-swing (progress ~0.45) - strictly requiring 3D contact
        if (this.attackProgress >= 0.45 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;
          if (this.root.position.distanceTo(playerPos) <= 2.8 && verticalDist <= 1.8 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = playerPos.clone().sub(this.root.position).normalize().multiplyScalar(7.0);
            knockback.y = 2.5;
            playerPhysics.takeDamage(10, knockback);
            this.sound?.playBlockBreak?.();
            this.particleManager.spawnBlockDebris(BlockType.FLINT, playerPos, 6);
          }
        }

        if (this.attackProgress >= 1.0) {
          this.state = GoblinState.RETREAT_SPACE;
          this.stateTimer = 1.2 + Math.random() * 0.8;
          this.attackCooldown = 1.0 + Math.random() * 1.0;
        }
        break;
      }

      case GoblinState.HEAVY_STAB: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 1.2, dt * 3.0);
        this.playAnimation('heavy_stab', 0.1);
        this.attackProgress += dt * 1.2;

        if (this.attackProgress >= 0.50 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;
          if (this.root.position.distanceTo(playerPos) <= 3.2 && verticalDist <= 2.0 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = playerPos.clone().sub(this.root.position).normalize().multiplyScalar(10.0);
            knockback.y = 3.5;
            playerPhysics.takeDamage(16, knockback);
            this.sound?.playBlockBreak?.();
            this.particleManager.spawnBlockDebris(BlockType.FLINT, playerPos, 10);
          }
        }

        if (this.attackProgress >= 1.0) {
          this.state = GoblinState.RETREAT_SPACE;
          this.stateTimer = 1.5 + Math.random() * 0.8;
          this.attackCooldown = 1.8 + Math.random() * 1.0;
        }
        break;
      }

      case GoblinState.RETREAT_SPACE: {
        // Walk backward while facing the player to reset spacing
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, -1.6, dt * 3.0);
        this.playAnimation('walk_back');
        if (horizontalDist > 0.05) {
          this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        }
        this.stateTimer -= dt;

        if (this.stateTimer <= 0 || dist3D >= 5.5 || verticalDist > 3.5) {
          if (dist3D > 14.0 || verticalDist > 3.5) {
            this.state = GoblinState.PATROL;
            this.stateTimer = 4.0;
            this.aggroCooldown = 5.0;
            this.pickNewWanderTarget();
          } else {
            this.state = GoblinState.CHASE;
            this.stateTimer = 4.0;
          }
        }
        break;
      }

      case GoblinState.BLOCK: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, dt * 6.0);
        this.playAnimation('block');
        this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        this.stateTimer -= dt;

        if (this.stateTimer <= 0) {
          this.state = GoblinState.CHASE;
        }
        break;
      }

      case GoblinState.DODGE: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 3.5, dt * 5.0);
        this.playAnimation('dodge', 0.1);
        this.stateTimer -= dt;

        if (this.stateTimer <= 0) {
          this.state = GoblinState.CHASE;
        }
        break;
      }

      case GoblinState.HURT: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, dt * 6.0);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = GoblinState.CHASE;
        }
        break;
      }
    }

    // ─── 2. SMOOTH ROTATION & MOVEMENT PHYSICS ───
    let diff = (this.targetYaw - this.currentYaw) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    this.currentYaw += diff * Math.min(1.0, dt * 6.0);

    this.root.rotation.y = this.currentYaw;

    if (Math.abs(this.currentMoveSpeed) > 0.05) {
      const moveX = Math.sin(this.currentYaw) * this.currentMoveSpeed * dt;
      const moveZ = Math.cos(this.currentYaw) * this.currentMoveSpeed * dt;
      this.root.position.x += moveX;
      this.root.position.z += moveZ;
    }

    // Continuous Bilinear Smooth Ground Height & Ramp Alignment (only when not climbing)
    if (this.state !== GoblinState.CLIMB) {
      const currentGroundY = this.getSmoothGroundHeight(this.root.position.x, this.root.position.z);
      this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, currentGroundY, dt * 10.0);
    }

    // Update Overhead Health Bar
    this.healthBar.update(dt, this.root.position, playerPos);
  }

  public getSmoothGroundHeight(worldX: number, worldZ: number): number {
    const fx = Math.floor(worldX);
    const fz = Math.floor(worldZ);
    const u = worldX - fx;
    const v = worldZ - fz;

    const h00 = this.getAdjustedGroundY(fx, fz, this.root.position.y);
    const h10 = this.getAdjustedGroundY(fx + 1, fz, this.root.position.y);
    const h01 = this.getAdjustedGroundY(fx, fz + 1, this.root.position.y);
    const h11 = this.getAdjustedGroundY(fx + 1, fz + 1, this.root.position.y);

    return (1 - u) * (1 - v) * h00 + u * (1 - v) * h10 + (1 - u) * v * h01 + u * v * h11;
  }

  private getAdjustedGroundY(worldX: number, worldZ: number, defaultY: number): number {
    const blockX = Math.floor(worldX);
    const blockZ = Math.floor(worldZ);
    const cx = Math.floor(blockX / 16);
    const cz = Math.floor(blockZ / 16);
    const chunk = this.world.getChunk(cx, cz);
    if (chunk) {
      const lx = ((blockX % 16) + 16) % 16;
      const lz = ((blockZ % 16) + 16) % 16;
      const h = chunk.getHeight(lx, lz);
      if (h > 0) {
        return (h + 1.0) * 0.5;
      }
    }
    return defaultY;
  }

  private pickNewWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 6.0 + Math.random() * 14.0;
    this.wanderTarget.set(
      this.homePosition.x + Math.cos(angle) * dist,
      this.homePosition.y,
      this.homePosition.z + Math.sin(angle) * dist
    );
  }

  /**
   * Evaluates if the player is visible within the Goblin's forward vision peripheral cone (100° FOV)
   * and ensures there is an unobstructed Line of Sight (LOS) through walls and terrain blocks.
   */
  public canSensePlayer(playerPos: THREE.Vector3, visionRange = 11.0, fovDegrees = 100, proximityRadius = 1.5): boolean {
    const verticalDist = Math.abs(playerPos.y - this.root.position.y);
    if (verticalDist > 3.2) return false;

    const toPlayer = new THREE.Vector3(
      playerPos.x - this.root.position.x,
      0,
      playerPos.z - this.root.position.z
    );
    const dist = toPlayer.length();
    if (dist > visionRange) return false;

    const isProximity = dist <= proximityRadius;

    if (!isProximity) {
      toPlayer.normalize();

      // Goblin facing forward vector (based on currentYaw where sin = X, cos = Z)
      const forward = new THREE.Vector3(
        Math.sin(this.currentYaw),
        0,
        Math.cos(this.currentYaw)
      );

      const dot = forward.dot(toPlayer);
      const minDot = Math.cos(THREE.MathUtils.degToRad(fovDegrees * 0.5)); // ~0.64 for 100° FOV

      if (dot < minDot) return false;
    }

    // Distance & FOV checks passed. Evaluate raycast distributed across frames via frame-counter modulo
    const frameIndex = this.world?.frameCounter ?? 0;
    const isMyTimeSlot = (frameIndex + this.entityId) % 5 === 0;

    if (this.losTimer <= 0 && isMyTimeSlot) {
      this.losTimer = 0.12 + Math.random() * 0.04;
      const goblinEye = GoblinMinion.SCRATCH_GOBLIN_EYE.set(this.root.position.x, this.root.position.y + 1.2, this.root.position.z);
      const playerEye = GoblinMinion.SCRATCH_PLAYER_EYE.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
      this.cachedLosResult = this.world
        ? this.world.hasLineOfSight(goblinEye, playerEye, isProximity ? proximityRadius + 1.0 : visionRange)
        : true;
    }

    return this.cachedLosResult;
  }

  public takeDamage(amount: number): void {
    if (this.isDead || this.isDisposed) return;

    // Blocking reduces damage by 60%
    let actualDamage = amount;
    if (this.state === GoblinState.BLOCK) {
      actualDamage = Math.max(1, Math.floor(amount * 0.4));
      this.particleManager.spawnBlockDebris(BlockType.STONE, this.root.position, 6);
      this.sound?.playBlockBreak?.();
    }

    this.health = Math.max(0, this.health - actualDamage);
    this.healthBar.setHealth(this.health, this.maxHealth);

    // Particle blood/sparks
    this.particleManager.spawnBlockDebris(BlockType.FLINT, this.root.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 8);
    this.sound?.playMonsterHurt?.();

    if (this.health <= 0) {
      this.die();
    } else {
      // If hit while climbing, interrupt the climb and trigger hurt
      if (this.state === GoblinState.CLIMB) {
        this.state = GoblinState.HURT;
        this.stateTimer = 0.5;
        this.playAnimation('idle', 0.1);
      } else if (Math.random() < 0.35 && this.state !== GoblinState.BLOCK) {
        this.state = GoblinState.BLOCK;
        this.stateTimer = 1.0;
      } else if (Math.random() < 0.25) {
        this.state = GoblinState.DODGE;
        this.stateTimer = 0.8;
      } else {
        this.state = GoblinState.HURT;
        this.stateTimer = 0.3;
      }
    }
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.playAnimation('death', 0.15);

    // Spawn Goblin Loot Drops
    this.dropLoot();
  }

  private dropLoot(): void {
    const dropPos = this.root.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    
    // Always drop 1-2 flint / stones
    this.itemManager.spawnResourcePickup(BlockType.FLINT, dropPos, 1 + Math.floor(Math.random() * 2));
    
    // 50% chance for leather / branch
    if (Math.random() < 0.5) {
      this.itemManager.spawnResourcePickup(BlockType.BRANCHES, dropPos, 2);
    }
    // 35% chance for pebbles / stone
    if (Math.random() < 0.35) {
      this.itemManager.spawnResourcePickup(BlockType.STONE_PEBBLE, dropPos, 2);
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.model) {
      disposeHierarchy(this.model);
      this.root.remove(this.model);
      this.model = null;
    }

    this.healthBar.dispose();
    this.scene.remove(this.root);
  }
}
