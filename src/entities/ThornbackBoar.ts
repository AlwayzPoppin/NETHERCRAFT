import * as THREE from 'three';
import { ModelCache } from '../utils/ModelCache';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { BlockType } from '../textures/TextureGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { ItemManager } from '../items/ItemManager';
import { EntityHealthBar } from '../ui/EntityHealthBar';
import { disposeHierarchy } from '../utils/DisposeUtils';
import { EntityCuller } from '../utils/EntityCuller';

export enum BoarState {
  GRAZING = 'GRAZING',
  WANDERING = 'WANDERING',
  ALERT = 'ALERT',
  CHARGE = 'CHARGE',
  FLEE = 'FLEE',
  RETREAT_TREAT = 'RETREAT_TREAT',
}

export class ThornbackBoar {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  // Frame-sliced LoS Scheduling & Zero-Garbage Scratch Vectors
  private static nextEntityId: number = 0;
  private readonly entityId: number = ++ThornbackBoar.nextEntityId;
  private static readonly SCRATCH_BOAR_EYE = new THREE.Vector3();
  private static readonly SCRATCH_PLAYER_EYE = new THREE.Vector3();

  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  private time = Math.random() * 100;
  private healthBar: EntityHealthBar;

  // AI & State Machine
  public state: BoarState = BoarState.GRAZING;
  private stateTimer = 2.0 + Math.random() * 3.0;
  private wanderTarget = new THREE.Vector3();
  private homePosition = new THREE.Vector3();
  private moveSpeed = 0;
  private chargeDirection = new THREE.Vector3();
  private hasDealtChargeDamage = false;
  private aggroCooldown = 0; // Time remaining before boar calms down

  // Health & Treatment
  public health = 38;
  public maxHealth = 38;
  public isDead = false;
  public isDisposed = false;
  private healTickTimer = 0;

  // Skeletal Bones (mapped from inspection of THORNBACK BOAR.glb)
  // Bone hierarchy: Bone_000 (root) -> Bone_001 (spine/pelvis)
  //   -> Bone_003 (neck) -> Bone_002 (head)
  //   -> Bone_005 (tail root) -> Bone_004 (tail tip) -> ...
  //   -> Bone_007 (spine mid) -> Bone_006 (chest/ribcage)
  //     -> Bone_015 -> Bone_014 (front-left leg pair)
  //     -> Bone_018 -> Bone_017 -> Bone_016 (front-right leg chain)
  //     -> Bone_021 -> Bone_020 -> Bone_019 (back-right leg chain)
  //     -> Bone_010 -> Bone_009 -> Bone_008 (back-left leg chain)
  //     -> Bone_013 -> Bone_012 -> Bone_011 (spine ridge / bramble spikes)
  private headBone: THREE.Bone | null = null;
  private neckBone: THREE.Bone | null = null;
  private spineBone: THREE.Bone | null = null;
  private tailRoot: THREE.Bone | null = null;
  private tailTip: THREE.Bone | null = null;
  private frontLeftHip: THREE.Bone | null = null;
  private frontLeftKnee: THREE.Bone | null = null;
  private frontRightHip: THREE.Bone | null = null;
  private frontRightKnee: THREE.Bone | null = null;
  private backLeftHip: THREE.Bone | null = null;
  private backLeftKnee: THREE.Bone | null = null;
  private backRightHip: THREE.Bone | null = null;
  private backRightKnee: THREE.Bone | null = null;

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
      name: 'Thornback Boar',
      icon: '🐗',
      maxHealth: this.maxHealth,
      heightOffset: 1.30,
      themeColor: '#fbbf24',
    });

    this.loadModel();
  }

  private loadModel(): void {
    const clone = ModelCache.getClone('/ANIMALS/THORNBACK BOAR.glb');
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
    this.model.scale.set(1.1, 1.1, 1.1);

    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.9;
          mat.metalness = 0.1;
          if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
          mat.emissiveIntensity = 0.0;
          mat.emissiveMap = null;
          mat.side = THREE.FrontSide;
        }
      }

      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        this.initialRotations.set(bone, bone.rotation.clone());

        switch (bone.name) {
          case 'Bone_002': this.headBone = bone; break;
          case 'Bone_003': this.neckBone = bone; break;
          case 'Bone_001': this.spineBone = bone; break;
          case 'Bone_005': this.tailRoot = bone; break;
          case 'Bone_004': this.tailTip = bone; break;
          case 'Bone_015': this.frontLeftHip = bone; break;
          case 'Bone_014': this.frontLeftKnee = bone; break;
          case 'Bone_018': this.frontRightHip = bone; break;
          case 'Bone_017': this.frontRightKnee = bone; break;
          case 'Bone_010': this.backLeftHip = bone; break;
          case 'Bone_009': this.backLeftKnee = bone; break;
          case 'Bone_021': this.backRightHip = bone; break;
          case 'Bone_020': this.backRightKnee = bone; break;
        }
      }
    });

    this.root.add(this.model);
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    if (this.isDead) return;
    this.time += dt;

    // Decay aggro cooldown and tick LOS throttle timer
    if (this.aggroCooldown > 0) this.aggroCooldown -= dt;
    this.losTimer -= dt;

    // --- TERRAIN GROUNDING ---
    const currentGroundY = this.getSmoothGroundHeight(this.root.position.x, this.root.position.z);
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, currentGroundY, dt * 8.0);

    const distToPlayer = this.root.position.distanceTo(playerPos);

    // --- LOW-HEALTH RETREAT ---
    if (this.health <= 18 && this.state !== BoarState.RETREAT_TREAT && !this.isDead) {
      if (distToPlayer < 14.0) {
        this.state = BoarState.FLEE;
        this.stateTimer = 3.5;
      } else {
        this.state = BoarState.RETREAT_TREAT;
        this.stateTimer = 5.0;
        this.healTickTimer = 0;
      }
    }

    // --- AI STATE MACHINE ---
    this.stateTimer -= dt;

    switch (this.state) {
      case BoarState.GRAZING: {
        this.moveSpeed = 0;

        // Docile: Only become alert if player is in vision cone / close proximity while provoked
        if (this.aggroCooldown > 0 && this.canSensePlayer(playerPos, 12.0, 110, 2.5)) {
          this.state = BoarState.ALERT;
          this.stateTimer = 2.0 + Math.random() * 2.0;
          break;
        }

        if (this.stateTimer <= 0) {
          if (Math.random() < 0.6) {
            this.state = BoarState.WANDERING;
            this.stateTimer = 3.5 + Math.random() * 4.0;
            const wanderRadius = 12.0;
            const angle = Math.random() * Math.PI * 2;
            this.wanderTarget.set(
              this.homePosition.x + Math.cos(angle) * wanderRadius,
              0,
              this.homePosition.z + Math.sin(angle) * wanderRadius
            );
          } else {
            this.stateTimer = 2.5 + Math.random() * 3.5;
          }
        }
        break;
      }

      case BoarState.WANDERING: {
        this.moveSpeed = 1.6;

        // Only alert if provoked and sensing player
        if (this.aggroCooldown > 0 && this.canSensePlayer(playerPos, 10.0, 110, 2.5)) {
          this.state = BoarState.ALERT;
          this.stateTimer = 2.0 + Math.random() * 2.0;
          break;
        }

        const dirToTarget = new THREE.Vector3().subVectors(this.wanderTarget, this.root.position);
        dirToTarget.y = 0;
        const distToTarget = dirToTarget.length();

        if (distToTarget > 1.2) {
          dirToTarget.normalize();
          this.root.position.addScaledVector(dirToTarget, this.moveSpeed * dt);
          const lookTarget = new THREE.Vector3().addVectors(this.root.position, dirToTarget);
          this.root.up.set(0, 1, 0);
          this.root.lookAt(lookTarget);
        } else {
          this.state = BoarState.GRAZING;
          this.stateTimer = 3.0 + Math.random() * 4.0;
        }

        if (this.stateTimer <= 0) {
          this.state = BoarState.GRAZING;
          this.stateTimer = 2.5 + Math.random() * 3.0;
        }
        break;
      }

      case BoarState.ALERT: {
        this.moveSpeed = 0;
        const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        // Snort/huff particles
        if (Math.floor(this.time * 60) % 35 === 0) {
          try {
            const snortPos = this.root.position.clone().add(new THREE.Vector3(0, 0.8, 0.6));
            this.particleManager.spawnSmokePuff(snortPos, false);
          } catch (e) {}
        }

        const verticalDist = Math.abs(playerPos.y - this.root.position.y);
        // Charge when player gets close and within reach
        if (distToPlayer < 5.0 && verticalDist <= 2.5) {
          this.state = BoarState.CHARGE;
          this.stateTimer = 1.6;
          this.hasDealtChargeDamage = false;
          this.chargeDirection.subVectors(playerPos, this.root.position).normalize();
          this.chargeDirection.y = 0;
          try {
            if (typeof this.sound.playBlockBreak === 'function') {
              this.sound.playBlockBreak();
            }
          } catch (e) {}
          break;
        }

        if (distToPlayer > 12.0 || verticalDist > 4.0 || this.stateTimer <= 0) {
          this.state = BoarState.GRAZING;
          this.stateTimer = 3.0 + Math.random() * 3.0;
          this.aggroCooldown = 0;
        }
        break;
      }

      case BoarState.CHARGE: {
        this.moveSpeed = 10.5; // Boars are fast chargers
        this.root.position.addScaledVector(this.chargeDirection, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, this.chargeDirection);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        // Dust kick-up
        if (Math.floor(this.time * 60) % 4 === 0) {
          try {
            this.particleManager.spawnBlockDebris(BlockType.GRASS, this.root.position, 1);
          } catch (e) {}
        }

        if (!this.hasDealtChargeDamage && distToPlayer < 2.6 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
          this.hasDealtChargeDamage = true;
          const damage = 10 + Math.floor(Math.random() * 5);
          const knockback = this.chargeDirection.clone().multiplyScalar(1.4);
          knockback.y = 0.4;
          playerPhysics.takeDamage(damage, knockback);

          try {
            this.particleManager.spawnBlockDebris(BlockType.GRASS, this.root.position, 4);
            if (typeof this.sound.playBlockHit === 'function') {
              this.sound.playBlockHit();
            }
          } catch (e) {}
        }

        if (this.stateTimer <= 0) {
          this.state = BoarState.ALERT;
          this.stateTimer = 2.0;
        }
        break;
      }

      case BoarState.FLEE: {
        this.moveSpeed = 6.5;
        const fleeDir = new THREE.Vector3().subVectors(this.root.position, playerPos).normalize();
        fleeDir.y = 0;
        this.root.position.addScaledVector(fleeDir, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, fleeDir);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        if (distToPlayer > 15.0 && this.health <= 18) {
          this.state = BoarState.RETREAT_TREAT;
          this.stateTimer = 6.0;
          this.healTickTimer = 0;
          break;
        }

        if (distToPlayer > 20.0 || this.stateTimer <= 0) {
          this.state = (this.health <= 18) ? BoarState.RETREAT_TREAT : BoarState.GRAZING;
          this.stateTimer = 4.0;
        }
        break;
      }

      case BoarState.RETREAT_TREAT: {
        this.moveSpeed = 0;

        if (distToPlayer < 8.0) {
          this.state = BoarState.FLEE;
          this.stateTimer = 4.0;
          break;
        }

        this.healTickTimer += dt;
        if (this.healTickTimer >= 1.0) {
          this.healTickTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 6);

          try {
            const mouthPos = this.root.position.clone().add(new THREE.Vector3(0, 0.3, 0.5));
            this.particleManager.spawnBlockDebris(BlockType.CORRUPTED_GROWTH, mouthPos, 2);
            this.particleManager.spawnSmokePuff(mouthPos, false);
          } catch (e) {}

          if (this.health >= this.maxHealth) {
            this.state = BoarState.GRAZING;
            this.stateTimer = 3.5;
            this.aggroCooldown = 0;
          }
        }

        if (this.stateTimer <= 0) {
          if (this.health < this.maxHealth) {
            this.stateTimer = 3.0;
          } else {
            this.state = BoarState.GRAZING;
            this.stateTimer = 3.0;
          }
        }
        break;
      }
    }

    // --- PROCEDURAL ANIMATIONS (Frustum & Distance Culled) ---
    if (EntityCuller.getInstance().shouldAnimate(this.root.position, 1.8, 48.0)) {
      this.animateBones(dt);
    }

    if (this.healthBar) {
      this.healthBar.update(dt, this.root.position, playerPos);
    }
  }

  /**
   * Evaluates if the player is within the Boar's forward vision cone or close proximity.
   * - Forward Vision Cone: 110° FOV (±55°), range up to 12.0m.
   * - Proximity Hearing: 2.5m radius (senses immediate footsteps even from behind).
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

      // Forward direction from Three.js lookAt (-Z in local coords)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion).setY(0).normalize();

      const dot = forward.dot(toPlayer);
      const minDot = Math.cos(THREE.MathUtils.degToRad(fovDegrees * 0.5));

      if (dot < minDot) return false;
    }

    // Distance & FOV checks passed. Evaluate raycast distributed across frames via frame-counter modulo
    const frameIndex = this.world?.frameCounter ?? 0;
    const isMyTimeSlot = (frameIndex + this.entityId) % 5 === 0;

    if (this.losTimer <= 0 && isMyTimeSlot) {
      this.losTimer = 0.12 + Math.random() * 0.04;
      const boarEye = ThornbackBoar.SCRATCH_BOAR_EYE.set(this.root.position.x, this.root.position.y + 0.8, this.root.position.z);
      const playerEye = ThornbackBoar.SCRATCH_PLAYER_EYE.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
      this.cachedLosResult = this.world
        ? this.world.hasLineOfSight(boarEye, playerEye, isProximity ? proximityRadius + 1.0 : visionRange)
        : true;
    }

    return this.cachedLosResult;
  }

  private animateBones(dt: number): void {
    if (!this.model) return;

    const isMoving = (
      this.state === BoarState.WANDERING ||
      this.state === BoarState.CHARGE ||
      this.state === BoarState.FLEE
    );
    const walkFreq = (this.state === BoarState.CHARGE) ? 13.0 : (this.state === BoarState.FLEE ? 10.0 : 5.0);
    const walkPhase = this.time * walkFreq;

    const legSwing = Math.sin(walkPhase) * (isMoving ? 0.60 : 0.0);
    const kneeBend = Math.max(0, Math.cos(walkPhase)) * (isMoving ? 0.40 : 0.0);

    // Diagonal quadruped gait
    if (this.frontLeftHip) {
      const init = this.initialRotations.get(this.frontLeftHip);
      if (init) this.frontLeftHip.rotation.x = init.x + legSwing;
    }
    if (this.frontLeftKnee) {
      const init = this.initialRotations.get(this.frontLeftKnee);
      if (init) this.frontLeftKnee.rotation.x = init.x + kneeBend;
    }
    if (this.backRightHip) {
      const init = this.initialRotations.get(this.backRightHip);
      if (init) this.backRightHip.rotation.x = init.x + legSwing;
    }

    if (this.frontRightHip) {
      const init = this.initialRotations.get(this.frontRightHip);
      if (init) this.frontRightHip.rotation.x = init.x - legSwing;
    }
    if (this.frontRightKnee) {
      const init = this.initialRotations.get(this.frontRightKnee);
      if (init) this.frontRightKnee.rotation.x = init.x + Math.max(0, -Math.cos(walkPhase)) * (isMoving ? 0.40 : 0.0);
    }
    if (this.backLeftHip) {
      const init = this.initialRotations.get(this.backLeftHip);
      if (init) this.backLeftHip.rotation.x = init.x - legSwing;
    }

    // Head & Neck
    if (this.headBone) {
      const init = this.initialRotations.get(this.headBone);
      if (init) {
        if (this.state === BoarState.GRAZING || this.state === BoarState.RETREAT_TREAT) {
          const grazeBob = Math.sin(this.time * 2.2) * 0.12;
          this.headBone.rotation.x = init.x + 0.55 + grazeBob; // Head down to root/graze
        } else if (this.state === BoarState.CHARGE) {
          this.headBone.rotation.x = init.x + 0.75; // Head lowered for tusk charge
        } else if (this.state === BoarState.ALERT) {
          this.headBone.rotation.x = init.x - 0.15; // Head raised, alert
        } else {
          const walkBob = Math.sin(walkPhase) * 0.06;
          this.headBone.rotation.x = init.x + walkBob;
        }
      }
    }

    // Tail wag
    if (this.tailRoot) {
      const init = this.initialRotations.get(this.tailRoot);
      if (init) {
        const speed = this.state === BoarState.CHARGE ? 10.0 : 3.0;
        const tailFlick = Math.sin(this.time * speed) * (this.state === BoarState.CHARGE ? 0.45 : 0.20);
        this.tailRoot.rotation.y = init.y + tailFlick;
      }
    }
    if (this.tailTip) {
      const init = this.initialRotations.get(this.tailTip);
      if (init) {
        const tailWag = Math.sin(this.time * 4.5) * 0.15;
        this.tailTip.rotation.z = init.z + tailWag;
      }
    }

    // Spine body sway while walking
    if (this.spineBone && isMoving) {
      const init = this.initialRotations.get(this.spineBone);
      if (init) {
        const sway = Math.sin(walkPhase * 0.5) * 0.04;
        this.spineBone.rotation.y = init.y + sway;
      }
    }
  }

  private getSmoothGroundHeight(worldX: number, worldZ: number): number {
    const fx = Math.floor(worldX);
    const fz = Math.floor(worldZ);
    const u = worldX - fx;
    const v = worldZ - fz;

    const h00 = this.getAdjustedGroundY(fx, fz, 20);
    const h10 = this.getAdjustedGroundY(fx + 1, fz, 20);
    const h01 = this.getAdjustedGroundY(fx, fz + 1, 20);
    const h11 = this.getAdjustedGroundY(fx + 1, fz + 1, 20);

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

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.healthBar?.dispose();
    if (this.model) {
      disposeHierarchy(this.model);
      this.model = null;
    }
    disposeHierarchy(this.root);
    this.scene.remove(this.root);

    this.initialRotations.clear();
    this.headBone = null;
    this.neckBone = null;
    this.spineBone = null;
    this.tailRoot = null;
    this.tailTip = null;
  }

  public takeDamage(amount: number): void {
    this.health -= amount;
    this.aggroCooldown = 15.0; // Stay aggressive for 15 seconds after being hit

    if (this.healthBar) {
      this.healthBar.setHealth(this.health);
    }

    try {
      if (typeof this.sound.playBlockHit === 'function') {
        this.sound.playBlockHit();
      }
    } catch (e) {}

    if (this.health <= 0) {
      this.isDead = true;
      try {
        this.particleManager.spawnBlockDebris(BlockType.GRASS, this.root.position, 6);
      } catch (e) {}

      // Resource drops: Animal Hide, Uncooked Meat, Thornspike Cluster
      if (this.itemManager) {
        // 1. Thornspike Cluster (1-2)
        const thornCount = 1 + (Math.random() < 0.4 ? 1 : 0);
        this.itemManager.spawnResourcePickup(BlockType.THORNSPIKE_CLUSTER, this.root.position, thornCount);

        // 2. Uncooked Meat (2-4)
        const meatCount = 2 + Math.floor(Math.random() * 3);
        this.itemManager.spawnResourcePickup(BlockType.UNCOOKED_MEAT, this.root.position, meatCount);

        // 3. Animal Hide (1-2)
        const hideCount = 1 + (Math.random() < 0.5 ? 1 : 0);
        this.itemManager.spawnResourcePickup(BlockType.ANIMAL_HIDE, this.root.position, hideCount);
      }

      this.dispose();
    } else {
      // Provoked! Charge at attacker
      if (this.state !== BoarState.CHARGE && this.state !== BoarState.FLEE) {
        this.state = BoarState.ALERT;
        this.stateTimer = 1.0; // Quick alert before charging
      }
    }
  }
}
