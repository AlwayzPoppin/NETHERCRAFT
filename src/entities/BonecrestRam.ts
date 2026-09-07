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

export enum RamState {
  GRAZING = 'GRAZING',
  WANDERING = 'WANDERING',
  ALERT = 'ALERT',
  HEADBUTT_CHARGE = 'HEADBUTT_CHARGE',
  FLEE = 'FLEE',
  RETREAT_TREAT = 'RETREAT_TREAT',
  BURNING_PANIC = 'BURNING_PANIC',
}

export class BonecrestRam {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  // Frame-sliced LoS Scheduling & Zero-Garbage Scratch Vectors
  private static nextEntityId: number = 0;
  private readonly entityId: number = ++BonecrestRam.nextEntityId;
  private static readonly SCRATCH_RAM_EYE = new THREE.Vector3();
  private static readonly SCRATCH_PLAYER_EYE = new THREE.Vector3();

  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  private time = Math.random() * 100;
  private healthBar: EntityHealthBar;

  // AI & State Machine
  public state: RamState = RamState.GRAZING;
  private stateTimer = 2.0 + Math.random() * 3.0;
  private wanderTarget = new THREE.Vector3();
  private homePosition = new THREE.Vector3();
  private moveSpeed = 0;
  private chargeDirection = new THREE.Vector3();
  private hasDealtChargeDamage = false;

  // Health & Treatment
  public health = 45;
  public maxHealth = 45;
  public isDead = false;
  public isDisposed = false;
  private healTickTimer = 0;

  // Magma Burn Hazard
  private magmaBurnTimer = 0;
  public isBurning = false;

  // Skeletal Bones
  private headBone: THREE.Bone | null = null;
  private neckBone: THREE.Bone | null = null;
  private spineBone: THREE.Bone | null = null;
  private frontLeftLeg: THREE.Bone | null = null;
  private frontLeftKnee: THREE.Bone | null = null;
  private frontRightLeg: THREE.Bone | null = null;
  private frontRightKnee: THREE.Bone | null = null;
  private backLeftLeg: THREE.Bone | null = null;
  private backLeftKnee: THREE.Bone | null = null;
  private backRightLeg: THREE.Bone | null = null;
  private backRightKnee: THREE.Bone | null = null;
  private tailBone: THREE.Bone | null = null;
  private leftHorn: THREE.Bone | null = null;
  private rightHorn: THREE.Bone | null = null;

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
      name: 'Bonecrest Ram',
      icon: '🐏',
      maxHealth: this.maxHealth,
      heightOffset: 1.35,
      themeColor: '#e11d48',
    });

    this.loadModel();
  }

  private loadModel(): void {
    const clone = ModelCache.getClone('/ANIMALS/BONECREST RAM.glb');
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
    this.model.scale.set(1.25, 1.25, 1.25);

    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.85;
          mat.metalness = 0.15;
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
          case 'Bone_018': this.headBone = bone; break;
          case 'Bone_002': this.neckBone = bone; break;
          case 'Bone_000':
          case 'Bone_001': this.spineBone = bone; break;
          case 'Bone_014': this.frontLeftLeg = bone; break;
          case 'Bone_013': this.frontLeftKnee = bone; break;
          case 'Bone_017': this.frontRightLeg = bone; break;
          case 'Bone_016': this.frontRightKnee = bone; break;
          case 'Bone_008': this.backLeftLeg = bone; break;
          case 'Bone_007': this.backLeftKnee = bone; break;
          case 'Bone_011': this.backRightLeg = bone; break;
          case 'Bone_010': this.backRightKnee = bone; break;
          case 'Bone_005': this.tailBone = bone; break;
          case 'Bone_023': this.leftHorn = bone; break;
          case 'Bone_026': this.rightHorn = bone; break;
        }
      }
    });

    this.root.add(this.model);
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    if (this.isDead) return;
    this.time += dt;
    this.losTimer -= dt;

    // --- 1. TERRAIN & MAGMA HAZARD CHECK ---
    const blockX = Math.floor(this.root.position.x);
    const gridY = Math.floor(this.root.position.y * 2.0);
    const blockZ = Math.floor(this.root.position.z);

    const feetBlock = this.world.getBlock(blockX, gridY, blockZ);
    const belowBlock = this.world.getBlock(blockX, Math.max(0, gridY - 1), blockZ);
    const isSteppingInMagma = (feetBlock === BlockType.MOLTEN_CORRUPTION || belowBlock === BlockType.MOLTEN_CORRUPTION);

    if (isSteppingInMagma) {
      this.isBurning = true;
      this.magmaBurnTimer += dt;

      // Magma burns for 6 damage every 0.4s
      if (this.magmaBurnTimer >= 0.40) {
        this.magmaBurnTimer = 0;
        this.takeDamage(6, true);

        try {
          // Flame & burning smoke particles at hooves
          for (let i = 0; i < 3; i++) {
            const flamePos = this.root.position.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 1.2,
              0.2,
              (Math.random() - 0.5) * 1.2
            ));
            this.particleManager.spawnSmokePuff(flamePos, true);
          }
        } catch (e) {}
      }

      // Burning Panic: immediately scramble away from magma towards solid ground
      if (this.state !== RamState.BURNING_PANIC && !this.isDead) {
        this.state = RamState.BURNING_PANIC;
        this.stateTimer = 2.5;
      }
    } else {
      this.isBurning = false;
    }

    const currentGroundY = this.getSmoothGroundHeight(this.root.position.x, this.root.position.z);
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, currentGroundY, dt * 8.0);

    const distToPlayer = this.root.position.distanceTo(playerPos);

    // --- 2. LOW-HEALTH RETREAT & TREATMENT CHECK ---
    // If health is below 50% (< 23 HP) and not already treating, attempt to retreat and treat wounds
    if (this.health <= 22 && this.state !== RamState.RETREAT_TREAT && this.state !== RamState.BURNING_PANIC && !this.isDead) {
      if (distToPlayer < 14.0) {
        // Player is nearby: flee to create safe distance
        this.state = RamState.FLEE;
        this.stateTimer = 3.5;
      } else {
        // Safe distance achieved: begin self-treatment / grazing on healing herbs
        this.state = RamState.RETREAT_TREAT;
        this.stateTimer = 5.0;
        this.healTickTimer = 0;
      }
    }

    // --- 3. AI STATE MACHINE ---
    this.stateTimer -= dt;

    switch (this.state) {
      case RamState.GRAZING: {
        this.moveSpeed = 0;
        if (this.canSensePlayer(playerPos, 10.0, 110, 2.5)) {
          this.state = RamState.ALERT;
          this.stateTimer = 2.0 + Math.random() * 2.0;
          break;
        }

        if (this.stateTimer <= 0) {
          if (Math.random() < 0.65) {
            this.state = RamState.WANDERING;
            this.stateTimer = 3.5 + Math.random() * 4.0;
            const wanderRadius = 14.0;
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

      case RamState.WANDERING: {
        this.moveSpeed = 1.8;
        if (this.canSensePlayer(playerPos, 9.0, 110, 2.5)) {
          this.state = RamState.ALERT;
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
          this.state = RamState.GRAZING;
          this.stateTimer = 3.0 + Math.random() * 4.0;
        }

        if (this.stateTimer <= 0) {
          this.state = RamState.GRAZING;
          this.stateTimer = 2.5 + Math.random() * 3.0;
        }
        break;
      }

      case RamState.ALERT: {
        this.moveSpeed = 0;
        const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        if (Math.floor(this.time * 60) % 45 === 0) {
          try {
            const snortPos = this.root.position.clone().add(new THREE.Vector3(0, 1.2, 0.8));
            this.particleManager.spawnSmokePuff(snortPos, false);
          } catch (e) {}
        }

        const verticalDist = Math.abs(playerPos.y - this.root.position.y);
        // If player enters melee range (<4.5m) and within reach, charge!
        if (distToPlayer < 4.5 && verticalDist <= 2.5) {
          this.state = RamState.HEADBUTT_CHARGE;
          this.stateTimer = 1.4;
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
          this.state = RamState.GRAZING;
          this.stateTimer = 3.0 + Math.random() * 3.0;
        }
        break;
      }

      case RamState.HEADBUTT_CHARGE: {
        this.moveSpeed = 9.0;
        this.root.position.addScaledVector(this.chargeDirection, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, this.chargeDirection);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        if (Math.floor(this.time * 60) % 5 === 0) {
          try {
            this.particleManager.spawnBlockDebris(BlockType.ASHEN_SOIL, this.root.position, 1);
          } catch (e) {}
        }

        if (!this.hasDealtChargeDamage && distToPlayer < 2.4 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
          this.hasDealtChargeDamage = true;
          const damage = 12 + Math.floor(Math.random() * 6);
          const knockback = this.chargeDirection.clone().multiplyScalar(1.2);
          knockback.y = 0.35;
          playerPhysics.takeDamage(damage, knockback);

          try {
            this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.root.position, 3);
            if (typeof this.sound.playBlockHit === 'function') {
              this.sound.playBlockHit();
            }
          } catch (e) {}
        }

        if (this.stateTimer <= 0) {
          this.state = RamState.ALERT;
          this.stateTimer = 2.5;
        }
        break;
      }

      case RamState.FLEE: {
        this.moveSpeed = 7.2;
        const fleeDir = new THREE.Vector3().subVectors(this.root.position, playerPos).normalize();
        fleeDir.y = 0;
        this.root.position.addScaledVector(fleeDir, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, fleeDir);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        // Safe retreat reached -> Treat wounds
        if (distToPlayer > 15.0 && this.health <= 22) {
          this.state = RamState.RETREAT_TREAT;
          this.stateTimer = 6.0;
          this.healTickTimer = 0;
          break;
        }

        if (distToPlayer > 18.0 || this.stateTimer <= 0) {
          this.state = (this.health <= 22) ? RamState.RETREAT_TREAT : RamState.GRAZING;
          this.stateTimer = 4.0;
        }
        break;
      }

      case RamState.RETREAT_TREAT: {
        // Safe treatment: Ram halts in sheltered spot, grazes deeply, and restores HP
        this.moveSpeed = 0;

        // If player interrupts or pursues while treating, resume fleeing
        if (distToPlayer < 8.0) {
          this.state = RamState.FLEE;
          this.stateTimer = 4.0;
          break;
        }

        // Regenerate +8 HP every 0.9 seconds while treating
        this.healTickTimer += dt;
        if (this.healTickTimer >= 0.9) {
          this.healTickTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 8);

          try {
            // Treatment healing particles
            const mouthPos = this.root.position.clone().add(new THREE.Vector3(0, 0.4, 0.6));
            this.particleManager.spawnBlockDebris(BlockType.CORRUPTED_GROWTH, mouthPos, 2);
            this.particleManager.spawnSmokePuff(mouthPos, false);
          } catch (e) {}

          // Full health restored!
          if (this.health >= this.maxHealth) {
            this.state = RamState.GRAZING;
            this.stateTimer = 3.5;
          }
        }

        if (this.stateTimer <= 0) {
          if (this.health < this.maxHealth) {
            this.stateTimer = 3.0; // Continue treating
          } else {
            this.state = RamState.GRAZING;
            this.stateTimer = 3.0;
          }
        }
        break;
      }

      case RamState.BURNING_PANIC: {
        // High speed scramble out of magma pool (8.5 m/s)
        this.moveSpeed = 8.5;
        const panicAngle = this.time * 2.0;
        const panicDir = new THREE.Vector3(Math.cos(panicAngle), 0, Math.sin(panicAngle)).normalize();
        this.root.position.addScaledVector(panicDir, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, panicDir);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        // Once out of magma, transition to flee or treat
        if (!isSteppingInMagma && this.stateTimer <= 0) {
          this.state = (this.health <= 22) ? RamState.RETREAT_TREAT : RamState.GRAZING;
          this.stateTimer = 3.5;
        }
        break;
      }
    }

    // --- 4. PROCEDURAL ANIMATIONS (Frustum & Distance Culled) ---
    if (EntityCuller.getInstance().shouldAnimate(this.root.position, 1.8, 48.0)) {
      this.animateBones(dt);
    }

    if (this.healthBar) {
      this.healthBar.update(dt, this.root.position, playerPos);
    }
  }

  /**
   * Evaluates if the player is within the Bonecrest Ram's forward vision cone or close proximity.
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
      const ramEye = BonecrestRam.SCRATCH_RAM_EYE.set(this.root.position.x, this.root.position.y + 1.0, this.root.position.z);
      const playerEye = BonecrestRam.SCRATCH_PLAYER_EYE.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
      this.cachedLosResult = this.world
        ? this.world.hasLineOfSight(ramEye, playerEye, isProximity ? proximityRadius + 1.0 : visionRange)
        : true;
    }

    return this.cachedLosResult;
  }

  private animateBones(dt: number): void {
    if (!this.model) return;

    const isMoving = (
      this.state === RamState.WANDERING ||
      this.state === RamState.HEADBUTT_CHARGE ||
      this.state === RamState.FLEE ||
      this.state === RamState.BURNING_PANIC
    );
    const walkFreq = (this.state === RamState.HEADBUTT_CHARGE || this.state === RamState.BURNING_PANIC) ? 12.0 : (this.state === RamState.FLEE ? 10.0 : 4.8);
    const walkPhase = this.time * walkFreq;

    const legSwing = Math.sin(walkPhase) * (isMoving ? 0.65 : 0.0);
    const kneeBend = Math.max(0, Math.cos(walkPhase)) * (isMoving ? 0.45 : 0.0);

    // 1. Diagonal Quadruped Gait:
    if (this.frontLeftLeg) {
      const init = this.initialRotations.get(this.frontLeftLeg);
      if (init) this.frontLeftLeg.rotation.x = init.x + legSwing;
    }
    if (this.frontLeftKnee) {
      const init = this.initialRotations.get(this.frontLeftKnee);
      if (init) this.frontLeftKnee.rotation.x = init.x + kneeBend;
    }
    if (this.backRightLeg) {
      const init = this.initialRotations.get(this.backRightLeg);
      if (init) this.backRightLeg.rotation.x = init.x + legSwing;
    }

    if (this.frontRightLeg) {
      const init = this.initialRotations.get(this.frontRightLeg);
      if (init) this.frontRightLeg.rotation.x = init.x - legSwing;
    }
    if (this.frontRightKnee) {
      const init = this.initialRotations.get(this.frontRightKnee);
      if (init) this.frontRightKnee.rotation.x = init.x + Math.max(0, -Math.cos(walkPhase)) * (isMoving ? 0.45 : 0.0);
    }
    if (this.backLeftLeg) {
      const init = this.initialRotations.get(this.backLeftLeg);
      if (init) this.backLeftLeg.rotation.x = init.x - legSwing;
    }

    // 2. Head & Neck Posture
    if (this.headBone) {
      const init = this.initialRotations.get(this.headBone);
      if (init) {
        if (this.state === RamState.GRAZING || this.state === RamState.RETREAT_TREAT) {
          // Head lowered to ground to graze / chew healing herbs
          const grazeBob = Math.sin(this.time * 2.0) * 0.14;
          this.headBone.rotation.x = init.x + 0.50 + grazeBob;
        } else if (this.state === RamState.HEADBUTT_CHARGE) {
          this.headBone.rotation.x = init.x + 0.70;
        } else if (this.state === RamState.ALERT) {
          this.headBone.rotation.x = init.x - 0.20;
        } else if (this.state === RamState.BURNING_PANIC) {
          // Thrashing head in pain while burning
          this.headBone.rotation.x = init.x - 0.35 + Math.sin(this.time * 16.0) * 0.25;
        } else {
          const walkBob = Math.sin(walkPhase) * 0.08;
          this.headBone.rotation.x = init.x + walkBob;
        }
      }
    }

    // 3. Tail Flick
    if (this.tailBone) {
      const init = this.initialRotations.get(this.tailBone);
      if (init) {
        const speed = this.isBurning ? 12.0 : 3.5;
        const tailFlick = Math.sin(this.time * speed) * (this.isBurning ? 0.55 : 0.25);
        this.tailBone.rotation.y = init.y + tailFlick;
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
        return (h + 1.0) * 0.5; // Surface top
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
    this.tailBone = null;
  }

  public takeDamage(amount: number, fromMagma: boolean = false): void {
    this.health -= amount;

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
        this.particleManager.spawnBlockDebris(BlockType.ASHEN_SOIL, this.root.position, 6);
        if (fromMagma) {
          this.particleManager.spawnSmokePuff(this.root.position, true);
        }
      } catch (e) {}

      // Spawn 3D Resource Drops for Player Harvesting
      if (this.itemManager) {
        // 1. Bonecrest Horn (1-2 horns)
        const hornCount = 1 + (Math.random() < 0.5 ? 1 : 0);
        this.itemManager.spawnResourcePickup(BlockType.BONECREST_HORN, this.root.position, hornCount);

        // 2. Raw Ram Meat (1-3 steaks)
        const meatCount = 1 + Math.floor(Math.random() * 3);
        this.itemManager.spawnResourcePickup(BlockType.UNCOOKED_MEAT, this.root.position, meatCount);

        // 3. Ashen Ram Pelt (1-2 hides with dark fleece tint)
        const hideCount = 1 + (Math.random() < 0.4 ? 1 : 0);
        this.itemManager.spawnResourcePickup(BlockType.ANIMAL_HIDE, this.root.position, hideCount);
      }

      this.dispose();
    } else {
      if (!fromMagma) {
        // Player damage causes panic flee / retreat to treat
        this.state = RamState.FLEE;
        this.stateTimer = 4.0;
      }
    }
  }
}
