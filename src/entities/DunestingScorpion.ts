import * as THREE from 'three';
import { ModelCache } from '../utils/ModelCache';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { BlockType } from '../textures/TextureGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { ItemManager } from '../items/ItemManager';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { EntityHealthBar } from '../ui/EntityHealthBar';
import { disposeHierarchy } from '../utils/DisposeUtils';
import { EntityCuller } from '../utils/EntityCuller';

export enum DunestingState {
  WANDERING = 'WANDERING',
  STALKING = 'STALKING',
  PINCER_ATTACK = 'PINCER_ATTACK',
  STINGER_STRIKE = 'STINGER_STRIKE',
  HURT = 'HURT',
  DEAD = 'DEAD',
}

export class DunestingScorpion {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  // Frame-sliced LoS Scheduling & Zero-Garbage Scratch Vectors
  private static nextEntityId: number = 0;
  private readonly entityId: number = ++DunestingScorpion.nextEntityId;
  private static readonly SCRATCH_SCORPION_EYE = new THREE.Vector3();
  private static readonly SCRATCH_PLAYER_EYE = new THREE.Vector3();

  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  private time = Math.random() * 100;
  private healthBar: EntityHealthBar;

  // AI State & Combat Timers
  public state: DunestingState = DunestingState.WANDERING;
  private stateTimer = 2.0 + Math.random() * 3.0;
  private wanderTarget = new THREE.Vector3();
  private homePosition = new THREE.Vector3();
  private moveSpeed = 0;
  private attackCooldown = 0;
  private aggroCooldown = 0;
  private unreachableTimer = 0;
  private stingerCooldown = 1.0 + Math.random() * 2.0;
  private attackAnimProgress = 0;
  private hasDealtDamageThisAttack = false;

  // Health & Stats
  public health = 45;
  public maxHealth = 45;
  public isDead = false;
  public isDisposed = false;
  private deathTimer = 0;

  // Bioluminescent Glow & Venom Lighting
  private stingerLight: THREE.PointLight | null = null;
  private venomDripTimer = 0;

  // Skeletal Bones (mapped from DUNESTING SCORPION.glb)
  private rootBone: THREE.Bone | null = null;
  private pelvisBone: THREE.Bone | null = null;
  private chestBone: THREE.Bone | null = null;
  
  // 8-Segment Stinger Tail Chain (Bone_021 -> Bone_014)
  private tailBones: THREE.Bone[] = [];
  private stingerTipBone: THREE.Bone | null = null;

  // 8 Articulated Legs
  private legs: THREE.Bone[] = [];

  // Pincers / Pedipalps
  private leftPincer: THREE.Bone | null = null;
  private rightPincer: THREE.Bone | null = null;
  private pincerClaws: THREE.Bone[] = [];

  private initialRotations = new Map<THREE.Bone, THREE.Euler>();

  // Throttled Line-of-Sight Evaluation (5Hz to 10Hz to prevent 60Hz DDA CPU bottleneck)
  private losTimer: number = Math.random() * 0.15;
  private cachedLosResult: boolean = false;

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

    this.healthBar = new EntityHealthBar(this.root, {
      name: 'Dunesting Scorpion',
      icon: '🦂',
      maxHealth: this.maxHealth,
      heightOffset: 1.35,
      themeColor: '#f97316',
    });

    this.loadModel();
  }

  private loadModel(): void {
    const clone = ModelCache.getClone('/entities/DUNESTING SCORPION.glb');
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

        // Apply Sandstone Exoskeleton with Bioluminescent Venom Sac Materials
        if (mesh.material) {
          const origMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          const desertMat = origMat.clone();
          desertMat.roughness = 0.65;
          desertMat.metalness = 0.15;
          if (desertMat.emissive) desertMat.emissive.setRGB(0, 0, 0);
          desertMat.emissiveIntensity = 0.0;
          desertMat.emissiveMap = null;
          mesh.material = desertMat;
        }
      }

      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        this.initialRotations.set(bone, bone.rotation.clone());

        const name = bone.name;
        if (name === 'Bone_000') this.rootBone = bone;
        else if (name === 'Bone_001') this.pelvisBone = bone;
        else if (name === 'Bone_002') this.chestBone = bone;

        // Map Tail Bones (Bone_021 down to Bone_014)
        const tailNames = ['Bone_021', 'Bone_020', 'Bone_019', 'Bone_018', 'Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'];
        if (tailNames.includes(name)) {
          this.tailBones.push(bone);
          if (name === 'Bone_014') {
            this.stingerTipBone = bone;
          }
        }

        // Map Legs
        const legNames = ['Bone_008', 'Bone_013', 'Bone_036', 'Bone_041', 'Bone_046', 'Bone_051', 'Bone_056', 'Bone_061'];
        if (legNames.includes(name)) {
          this.legs.push(bone);
        }

        // Map Pincers
        if (name === 'Bone_028') this.leftPincer = bone;
        if (name === 'Bone_033') this.rightPincer = bone;
        if (['Bone_034', 'Bone_063', 'Bone_065', 'Bone_070', 'Bone_075'].includes(name)) {
          this.pincerClaws.push(bone);
        }
      }
    });

    // Ensure bilateral symmetry: If only one pincer bone was found, clone/mirror the other
    if (this.leftPincer && !this.rightPincer && this.chestBone) {
      const rightPincerClone = this.leftPincer.clone(true);
      rightPincerClone.scale.x = -1;
      this.chestBone.add(rightPincerClone);
      this.rightPincer = rightPincerClone as unknown as THREE.Bone;
    }

    // Attach Bioluminescent Green PointLight to Stinger Tip
    this.stingerLight = new THREE.PointLight(0x22ff44, 2.2, 4.5);
    if (this.stingerTipBone) {
      this.stingerTipBone.add(this.stingerLight);
    } else {
      this.root.add(this.stingerLight);
      this.stingerLight.position.set(0, 1.2, -0.6);
    }

    this.root.add(this.model);
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    if (this.isDisposed) return;

    if (this.isDead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.dispose();
      }
      return;
    }

    this.time += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stingerCooldown = Math.max(0, this.stingerCooldown - dt);
    this.venomDripTimer += dt;

    // Emit green venom particles from glowing stinger
    if (this.venomDripTimer >= 0.25) {
      this.venomDripTimer = 0;
      if (this.stingerTipBone) {
        const tipPos = new THREE.Vector3();
        this.stingerTipBone.getWorldPosition(tipPos);
        this.particleManager.spawnBlockDebris(BlockType.CORRUPTED_GROWTH, tipPos, 2);
      }
    }

    this.aggroCooldown = Math.max(0, this.aggroCooldown - dt);
    this.losTimer -= dt;
    const verticalDist = Math.abs(playerPos.y - this.root.position.y);
    const distToPlayer = this.root.position.distanceTo(playerPos);
    const aggroRange = 13.0; // Balanced hostile mob detection distance

    // --- State Machine & Aggressive AI ---
    switch (this.state) {
      case DunestingState.WANDERING: {
        this.moveSpeed = 1.5;
        this.stateTimer -= dt;

        // Player detected within forward vision cone (110° FOV) or close proximity (3m) -> Stalk
        if (this.aggroCooldown <= 0 && this.canSensePlayer(playerPos, aggroRange, 110, 3.0)) {
          this.state = DunestingState.STALKING;
          this.unreachableTimer = 0;
          this.sound?.playMonsterHurt?.();
          break;
        }

        if (this.stateTimer <= 0) {
          this.pickNewWanderTarget();
          this.stateTimer = 3.0 + Math.random() * 4.0;
        }

        this.moveTowards(this.wanderTarget, dt);
        break;
      }

      case DunestingState.STALKING: {
        this.moveSpeed = 3.4; // Controlled desert skitter chase (slower than player sprint)

        // Lost player tracking if they flee beyond 15 blocks or fly/climb out of reach (>3.5m)
        if (distToPlayer > 15.0 || verticalDist > 3.5) {
          this.unreachableTimer += dt;
          if (this.unreachableTimer >= 0.8 || distToPlayer > 18.0 || verticalDist > 5.0) {
            this.state = DunestingState.WANDERING;
            this.stateTimer = 4.0 + Math.random() * 3.0;
            this.aggroCooldown = 5.0;
            this.unreachableTimer = 0;
            this.pickNewWanderTarget();
            break;
          }
        } else {
          this.unreachableTimer = 0;
        }

        // Close melee range -> Trigger Pincer Strike or Venom Stinger Strike
        if (distToPlayer <= 3.2 && verticalDist <= 2.2 && this.stingerCooldown <= 0) {
          this.state = DunestingState.STINGER_STRIKE;
          this.attackAnimProgress = 0;
          this.hasDealtDamageThisAttack = false;
          this.stingerCooldown = 4.5 + Math.random() * 2.0;
          break;
        } else if (distToPlayer <= 2.2 && verticalDist <= 1.8 && this.attackCooldown <= 0) {
          this.state = DunestingState.PINCER_ATTACK;
          this.attackAnimProgress = 0;
          this.hasDealtDamageThisAttack = false;
          this.attackCooldown = 1.2;
          break;
        }

        this.moveTowards(playerPos, dt);
        break;
      }

      case DunestingState.PINCER_ATTACK: {
        this.moveSpeed = 1.0;
        this.attackAnimProgress += dt * 3.5; // Fast snapping animation

        // Deal melee damage at midpoint of swing
        if (this.attackAnimProgress >= 0.45 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;
          if (distToPlayer <= 2.6 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = new THREE.Vector3()
              .subVectors(playerPos, this.root.position)
              .normalize()
              .multiplyScalar(0.4);
            playerPhysics.takeDamage(12, knockback);
          }
        }

        if (this.attackAnimProgress >= 1.0) {
          this.state = DunestingState.STALKING;
        }
        break;
      }

      case DunestingState.STINGER_STRIKE: {
        this.moveSpeed = 0.5;
        this.attackAnimProgress += dt * 2.8;

        // Deal venomous damage & apply poison debuff at strike impact
        if (this.attackAnimProgress >= 0.50 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;
          if (distToPlayer <= 3.4 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = new THREE.Vector3()
              .subVectors(playerPos, this.root.position)
              .normalize()
              .multiplyScalar(0.6);
            
            // 14 Initial Physical + 6s Poison Debuff (3 DPS)
            playerPhysics.takeDamage(14, knockback);
            if (typeof playerPhysics.applyPoison === 'function') {
              playerPhysics.applyPoison(6.0, 3.0);
            }
          }
        }

        if (this.attackAnimProgress >= 1.0) {
          this.state = DunestingState.STALKING;
        }
        break;
      }

      case DunestingState.HURT: {
        this.moveSpeed = 0;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = DunestingState.STALKING;
        }
        break;
      }
    }

    // Adjust Vertical Ground Height
    this.adjustHeightToGround(dt);

    // Drive Procedural Skeletal Animations (Frustum & Distance Culled)
    if (EntityCuller.getInstance().shouldAnimate(this.root.position, 2.0, 48.0)) {
      this.animateSkeleton(dt);
    }

    if (this.healthBar) {
      this.healthBar.update(dt, this.root.position, playerPos);
    }
  }

  /**
   * Evaluates if the player is within the Dunesting Scorpion's forward vision cone or immediate hearing radius.
   * - Forward Vision Cone: 110° FOV (±55° from facing angle), up to 24m range.
   * - Proximity Hearing: 3.0m radius (senses immediate footsteps even from behind).
   */
  public canSensePlayer(playerPos: THREE.Vector3, visionRange = 12.0, fovDegrees = 100, proximityRadius = 1.6): boolean {
    const verticalDist = Math.abs(playerPos.y - this.root.position.y);
    if (verticalDist > 3.5) return false;

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

      // Scorpion facing forward vector (based on root rotation Y)
      const forward = new THREE.Vector3(
        Math.sin(this.root.rotation.y),
        0,
        Math.cos(this.root.rotation.y)
      );

      const dot = forward.dot(toPlayer);
      const minDot = Math.cos(THREE.MathUtils.degToRad(fovDegrees * 0.5));

      if (dot < minDot) return false;
    }

    // Distance & FOV checks passed. Evaluate raycast distributed across frames via frame-counter modulo
    const frameIndex = this.world?.frameCounter ?? 0;
    const isMyTimeSlot = (frameIndex + this.entityId) % 5 === 0;

    if (this.losTimer <= 0 && isMyTimeSlot) {
      this.losTimer = 0.12 + Math.random() * 0.04;
      const scorpionEye = DunestingScorpion.SCRATCH_SCORPION_EYE.set(this.root.position.x, this.root.position.y + 0.8, this.root.position.z);
      const playerEye = DunestingScorpion.SCRATCH_PLAYER_EYE.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
      this.cachedLosResult = this.world
        ? this.world.hasLineOfSight(scorpionEye, playerEye, isProximity ? proximityRadius + 1.0 : visionRange)
        : true;
    }

    return this.cachedLosResult;
  }

  private moveTowards(target: THREE.Vector3, dt: number): void {
    const dir = new THREE.Vector3().subVectors(target, this.root.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist > 0.3) {
      dir.normalize();

      // Smooth Yaw Rotation towards target
      const targetAngle = Math.atan2(dir.x, dir.z);
      const currentAngle = this.root.rotation.y;
      let angleDiff = targetAngle - currentAngle;

      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      this.root.rotation.y += angleDiff * Math.min(dt * 8.0, 1.0);

      // Move Forward
      const moveDist = this.moveSpeed * dt;
      this.root.position.x += dir.x * moveDist;
      this.root.position.z += dir.z * moveDist;
    }
  }

  private pickNewWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 6.0 + Math.random() * 12.0;
    this.wanderTarget.set(
      this.homePosition.x + Math.cos(angle) * dist,
      this.root.position.y,
      this.homePosition.z + Math.sin(angle) * dist
    );
  }

  private getSmoothGroundHeight(worldX: number, worldZ: number): number {
    const fx = Math.floor(worldX);
    const fz = Math.floor(worldZ);
    const u = worldX - fx;
    const v = worldZ - fz;

    const h00 = this.getAdjustedGroundY(fx, fz);
    const h10 = this.getAdjustedGroundY(fx + 1, fz);
    const h01 = this.getAdjustedGroundY(fx, fz + 1);
    const h11 = this.getAdjustedGroundY(fx + 1, fz + 1);

    return (1 - u) * (1 - v) * h00 + u * (1 - v) * h10 + (1 - u) * v * h01 + u * v * h11;
  }

  private getAdjustedGroundY(blockX: number, blockZ: number): number {
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
    return this.root.position.y;
  }

  private adjustHeightToGround(dt: number): void {
    const targetGroundY = this.getSmoothGroundHeight(this.root.position.x, this.root.position.z);
    this.root.position.y += (targetGroundY - this.root.position.y) * Math.min(dt * 10.0, 1.0);
  }

  private animateSkeleton(dt: number): void {
    if (!this.model) return;

    const isMoving = this.moveSpeed > 0.5;
    const legFreq = isMoving ? 14.0 : 0; // Rapid skitter frequency

    // 1. Rapid 8-Legged Skitter Gait
    this.legs.forEach((leg, index) => {
      const init = this.initialRotations.get(leg);
      if (!init) return;

      const legPhase = (index % 2 === 0 ? 0 : Math.PI) + (index * 0.4);
      const swing = isMoving ? Math.sin(this.time * legFreq + legPhase) * 0.35 : 0;
      const lift = isMoving ? Math.max(0, Math.cos(this.time * legFreq + legPhase)) * 0.20 : 0;

      leg.rotation.x = init.x + swing;
      leg.rotation.y = init.y + swing * 0.2;
      leg.rotation.z = init.z + lift;
    });

    // 2. Articulated 8-Segment Arched Stinger Tail
    const isStingerStriking = this.state === DunestingState.STINGER_STRIKE;
    const stingerProgress = Math.sin(this.attackAnimProgress * Math.PI); // 0 -> 1 -> 0

    this.tailBones.forEach((tailBone, segIdx) => {
      const init = this.initialRotations.get(tailBone);
      if (!init) return;

      const sway = Math.sin(this.time * 3.0 + segIdx * 0.5) * 0.08;

      if (isStingerStriking) {
        // Dramatic overhead thrust strike
        const thrustPitch = -0.45 * stingerProgress;
        tailBone.rotation.x = init.x + thrustPitch;
        tailBone.rotation.y = init.y + sway * 0.3;
      } else {
        // Natural arched scorpion curve
        const arch = -0.22 - Math.sin(this.time * 2.0) * 0.05;
        tailBone.rotation.x = init.x + arch;
        tailBone.rotation.y = init.y + sway;
      }
    });

    // 3. Pincer Snapping Action
    const isPincerStriking = this.state === DunestingState.PINCER_ATTACK;
    const pincerSnap = isPincerStriking ? Math.sin(this.attackAnimProgress * Math.PI * 2) * 0.6 : 0;

    if (this.leftPincer) {
      const initL = this.initialRotations.get(this.leftPincer);
      if (initL) {
        this.leftPincer.rotation.y = initL.y + 0.2 + pincerSnap + Math.sin(this.time * 2.5) * 0.1;
      }
    }

    if (this.rightPincer) {
      const initR = this.initialRotations.get(this.rightPincer);
      if (initR) {
        this.rightPincer.rotation.y = initR.y - 0.2 - pincerSnap - Math.sin(this.time * 2.5) * 0.1;
      }
    }

    // 4. Claws Flexing
    this.pincerClaws.forEach((claw, idx) => {
      const init = this.initialRotations.get(claw);
      if (!init) return;
      const clawFlex = isPincerStriking ? (idx % 2 === 0 ? 0.4 : -0.4) : Math.sin(this.time * 3.0 + idx) * 0.15;
      claw.rotation.z = init.z + clawFlex;
    });
  }

  public takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);

    if (this.healthBar) {
      this.healthBar.setHealth(this.health);
    }

    this.state = DunestingState.HURT;
    this.stateTimer = 0.25;
    this.aggroCooldown = 0;
    this.unreachableTimer = 0;

    // Flinch recoil
    this.root.position.y += 0.2;
    this.particleManager.spawnBlockDebris(BlockType.DESERT_SAND, this.root.position, 8);
    this.particleManager.spawnBlockDebris(BlockType.CORRUPTED_GROWTH, this.root.position, 4);

    if (this.health <= 0) {
      this.die();
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.healthBar?.dispose();

    if (this.stingerLight) {
      this.stingerLight.dispose();
      this.stingerLight = null;
    }

    if (this.model) {
      disposeHierarchy(this.model);
      this.model = null;
    }

    disposeHierarchy(this.root);
    this.scene.remove(this.root);

    this.initialRotations.clear();
    this.tailBones = [];
    this.legs = [];
    this.pincerClaws = [];
    this.rootBone = null;
    this.pelvisBone = null;
    this.chestBone = null;
    this.leftPincer = null;
    this.rightPincer = null;
    this.stingerTipBone = null;
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.state = DunestingState.DEAD;
    this.deathTimer = 0.35;

    // Death sand and green venom burst
    this.particleManager.spawnBlockDebris(BlockType.DESERT_SAND, this.root.position, 20);
    this.particleManager.spawnBlockDebris(BlockType.CORRUPTED_GROWTH, this.root.position, 15);

    // Drop Dunesting Resources
    const barbCount = 1 + Math.floor(Math.random() * 2);        // 1-2 Dunesting Barbs
    const clawCount = 1 + Math.floor(Math.random() * 2);        // 1-2 Dunesting Pincer Claws
    const shellCount = 1 + Math.floor(Math.random() * 3);       // 1-3 Dunesting Shells

    this.itemManager.spawnResourcePickup(BlockType.DUNESTING_BARB, this.root.position, barbCount);
    this.itemManager.spawnResourcePickup(BlockType.DUNESTING_PINCER_CLAW, this.root.position, clawCount);
    this.itemManager.spawnResourcePickup(BlockType.DUNESTING_SHELL, this.root.position, shellCount);
  }
}
