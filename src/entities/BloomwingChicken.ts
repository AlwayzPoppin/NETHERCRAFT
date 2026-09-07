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

export enum ChickenState {
  PECKING = 'PECKING',
  WANDERING = 'WANDERING',
  IDLE = 'IDLE',
  FLEE = 'FLEE',
}

export class BloomwingChicken {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  private time = Math.random() * 100;
  private healthBar: EntityHealthBar;

  // AI & State
  public state: ChickenState = ChickenState.PECKING;
  private stateTimer = 1.5 + Math.random() * 2.5;
  private wanderTarget = new THREE.Vector3();
  private homePosition = new THREE.Vector3();
  private moveSpeed = 0;

  // Health
  public health = 12;
  public maxHealth = 12;
  public isDead = false;
  public isDisposed: boolean = false;

  // Cluck timer for ambient sound
  private cluckTimer = 3.0 + Math.random() * 5.0;

  // Skeletal Bones (mapped from inspection of BLOOMWING CHICKEN.glb)
  private headBone: THREE.Bone | null = null;
  private neckBone: THREE.Bone | null = null;
  private neckBase: THREE.Bone | null = null;
  private leftLeg: THREE.Bone | null = null;
  private leftFoot: THREE.Bone | null = null;
  private rightLeg: THREE.Bone | null = null;
  private rightFoot: THREE.Bone | null = null;
  private leftWingA: THREE.Bone | null = null;
  private leftWingB: THREE.Bone | null = null;
  private rightWingA: THREE.Bone | null = null;
  private rightWingB: THREE.Bone | null = null;
  private tailBone: THREE.Bone | null = null;

  private initialRotations = new Map<THREE.Bone, THREE.Euler>();

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
      name: 'Bloomwing Chicken',
      icon: '🐔',
      maxHealth: this.maxHealth,
      heightOffset: 0.95,
      scale: 0.85,
      themeColor: '#4ade80',
    });

    this.loadModel();
  }

  private loadModel(): void {
    const clone = ModelCache.getClone('/ANIMALS/BLOOMWING CHICKEN.glb');
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
    this.model.scale.set(0.75, 0.75, 0.75);

    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.85;
          mat.metalness = 0.08;
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
          case 'Bone_004': this.neckBase = bone; break;
          case 'Bone_017': this.leftLeg = bone; break;
          case 'Bone_016': this.leftFoot = bone; break;
          case 'Bone_019': this.rightLeg = bone; break;
          case 'Bone_018': this.rightFoot = bone; break;
          // Left wing chain
          case 'Bone_012': this.leftWingA = bone; break;
          case 'Bone_011': this.leftWingB = bone; break;
          // Right wing
          case 'Bone_021': this.rightWingA = bone; break;
          case 'Bone_020': this.rightWingB = bone; break;
          // Tail
          case 'Bone_015': this.tailBone = bone; break;
        }
      }
    });

    this.root.add(this.model);
  }

  public update(dt: number, playerPos: THREE.Vector3, _playerPhysics?: any): void {
    if (this.isDead) return;
    this.time += dt;

    // --- TERRAIN GROUNDING (Strictly on the ground, does not fly) ---
    const currentGroundY = this.getAdjustedGroundY(this.root.position.x, this.root.position.z, 20);
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, currentGroundY, dt * 10.0);

    const distToPlayer = this.root.position.distanceTo(playerPos);

    // --- AI STATE MACHINE ---
    this.stateTimer -= dt;

    // Ambient cluck
    this.cluckTimer -= dt;
    if (this.cluckTimer <= 0) {
      this.cluckTimer = 4.0 + Math.random() * 6.0;
      try {
        const cluckPos = this.root.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.particleManager.spawnSmokePuff(cluckPos, false);
      } catch (e) {}
    }

    switch (this.state) {
      case ChickenState.PECKING: {
        this.moveSpeed = 0;

        // Flee if player enters vision cone or close proximity
        if (this.canSensePlayer(playerPos, 6.5, 140, 1.8)) {
          this.state = ChickenState.FLEE;
          this.stateTimer = 2.5 + Math.random() * 2.0;
          break;
        }

        if (this.stateTimer <= 0) {
          const roll = Math.random();
          if (roll < 0.5) {
            this.state = ChickenState.WANDERING;
            this.stateTimer = 2.0 + Math.random() * 3.0;
            const wanderRadius = 8.0;
            const angle = Math.random() * Math.PI * 2;
            this.wanderTarget.set(
              this.homePosition.x + Math.cos(angle) * wanderRadius,
              0,
              this.homePosition.z + Math.sin(angle) * wanderRadius
            );
          } else if (roll < 0.75) {
            this.state = ChickenState.IDLE;
            this.stateTimer = 1.0 + Math.random() * 2.0;
          } else {
            this.stateTimer = 1.5 + Math.random() * 2.5;
          }
        }
        break;
      }

      case ChickenState.IDLE: {
        this.moveSpeed = 0;

        if (this.canSensePlayer(playerPos, 6.5, 140, 1.8)) {
          this.state = ChickenState.FLEE;
          this.stateTimer = 2.5 + Math.random() * 2.0;
          break;
        }

        if (this.stateTimer <= 0) {
          this.state = Math.random() < 0.6 ? ChickenState.PECKING : ChickenState.WANDERING;
          this.stateTimer = 2.0 + Math.random() * 3.0;
          if (this.state === ChickenState.WANDERING) {
            const wanderRadius = 7.0;
            const angle = Math.random() * Math.PI * 2;
            this.wanderTarget.set(
              this.homePosition.x + Math.cos(angle) * wanderRadius,
              0,
              this.homePosition.z + Math.sin(angle) * wanderRadius
            );
          }
        }
        break;
      }

      case ChickenState.WANDERING: {
        this.moveSpeed = 1.2;

        if (this.canSensePlayer(playerPos, 5.5, 140, 1.8)) {
          this.state = ChickenState.FLEE;
          this.stateTimer = 2.5 + Math.random() * 2.0;
          break;
        }

        const dirToTarget = new THREE.Vector3().subVectors(this.wanderTarget, this.root.position);
        dirToTarget.y = 0;
        const distToTarget = dirToTarget.length();

        if (distToTarget > 0.8) {
          dirToTarget.normalize();
          this.root.position.addScaledVector(dirToTarget, this.moveSpeed * dt);
          const lookTarget = new THREE.Vector3().addVectors(this.root.position, dirToTarget);
          this.root.up.set(0, 1, 0);
          this.root.lookAt(lookTarget);
        } else {
          this.state = ChickenState.PECKING;
          this.stateTimer = 2.0 + Math.random() * 3.0;
        }

        if (this.stateTimer <= 0) {
          this.state = ChickenState.PECKING;
          this.stateTimer = 2.0 + Math.random() * 2.5;
        }
        break;
      }

      case ChickenState.FLEE: {
        this.moveSpeed = 5.2; // Rapid ground scurry
        const fleeDir = new THREE.Vector3().subVectors(this.root.position, playerPos).normalize();
        fleeDir.y = 0;
        this.root.position.addScaledVector(fleeDir, this.moveSpeed * dt);

        const lookTarget = new THREE.Vector3().addVectors(this.root.position, fleeDir);
        this.root.up.set(0, 1, 0);
        this.root.lookAt(lookTarget);

        if (distToPlayer > 12.0 || this.stateTimer <= 0) {
          this.state = ChickenState.PECKING;
          this.stateTimer = 2.5 + Math.random() * 3.0;
        }
        break;
      }
    }

    // --- PROCEDURAL ANIMATIONS (Frustum & Distance Culled) ---
    if (EntityCuller.getInstance().shouldAnimate(this.root.position, 1.2, 44.0)) {
      this.animateBones(dt);
    }

    if (this.healthBar) {
      this.healthBar.update(dt, this.root.position, playerPos);
    }
  }

  /**
   * Evaluates if the player is within the Chicken's peripheral vision cone or close proximity.
   * - Wide Peripheral Vision Cone: 140° FOV (±70°), range up to 6.5m.
   * - Proximity Hearing: 1.8m radius (senses immediate footsteps even from behind).
   */
  public canSensePlayer(playerPos: THREE.Vector3, visionRange = 6.5, fovDegrees = 140, proximityRadius = 1.8): boolean {
    const toPlayer = new THREE.Vector3(
      playerPos.x - this.root.position.x,
      0,
      playerPos.z - this.root.position.z
    );
    const dist = toPlayer.length();
    if (dist > visionRange) return false;

    if (dist <= proximityRadius) return true;

    toPlayer.normalize();

    // Forward direction from Three.js lookAt (-Z in local coords)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion).setY(0).normalize();

    const dot = forward.dot(toPlayer);
    const minDot = Math.cos(THREE.MathUtils.degToRad(fovDegrees * 0.5));

    return dot >= minDot;
  }

  private animateBones(_dt: number): void {
    if (!this.model) return;

    const isMoving = (
      this.state === ChickenState.WANDERING ||
      this.state === ChickenState.FLEE
    );
    const isFleeing = this.state === ChickenState.FLEE;
    const walkFreq = isFleeing ? 14.0 : 6.0;
    const walkPhase = this.time * walkFreq;

    // Leg animation — chicken strut
    const legSwing = Math.sin(walkPhase) * (isMoving ? 0.55 : 0.0);

    if (this.leftLeg) {
      const init = this.initialRotations.get(this.leftLeg);
      if (init) this.leftLeg.rotation.x = init.x + legSwing;
    }
    if (this.rightLeg) {
      const init = this.initialRotations.get(this.rightLeg);
      if (init) this.rightLeg.rotation.x = init.x - legSwing;
    }
    if (this.leftFoot) {
      const init = this.initialRotations.get(this.leftFoot);
      if (init) this.leftFoot.rotation.x = init.x + Math.max(0, Math.cos(walkPhase)) * (isMoving ? 0.3 : 0.0);
    }
    if (this.rightFoot) {
      const init = this.initialRotations.get(this.rightFoot);
      if (init) this.rightFoot.rotation.x = init.x + Math.max(0, -Math.cos(walkPhase)) * (isMoving ? 0.3 : 0.0);
    }

    // Head bob
    if (this.headBone) {
      const init = this.initialRotations.get(this.headBone);
      if (init) {
        if (this.state === ChickenState.PECKING) {
          const peckBob = Math.abs(Math.sin(this.time * 4.0)) * 0.45;
          this.headBone.rotation.x = init.x + peckBob;
        } else if (isMoving) {
          const headThrust = Math.sin(walkPhase) * 0.20;
          this.headBone.rotation.x = init.x + headThrust;
        } else {
          const idleBob = Math.sin(this.time * 1.8) * 0.08;
          this.headBone.rotation.x = init.x + idleBob;
          if (this.neckBone) {
            const initN = this.initialRotations.get(this.neckBone);
            if (initN) this.neckBone.rotation.y = initN.y + Math.sin(this.time * 0.7) * 0.15;
          }
        }
      }
    }

    // Neck bob with walking
    if (this.neckBase && isMoving) {
      const init = this.initialRotations.get(this.neckBase);
      if (init) {
        const neckBob = Math.sin(walkPhase + 0.5) * 0.12;
        this.neckBase.rotation.x = init.x + neckBob;
      }
    }

    // Wings — flap at sides when fleeing on the ground
    const wingFlap = isFleeing
      ? Math.sin(this.time * 18.0) * 0.60
      : Math.sin(this.time * 1.5) * 0.04;

    if (this.leftWingA) {
      const init = this.initialRotations.get(this.leftWingA);
      if (init) this.leftWingA.rotation.z = init.z - wingFlap;
    }
    if (this.leftWingB) {
      const init = this.initialRotations.get(this.leftWingB);
      if (init) this.leftWingB.rotation.z = init.z - wingFlap * 0.6;
    }
    if (this.rightWingA) {
      const init = this.initialRotations.get(this.rightWingA);
      if (init) this.rightWingA.rotation.z = init.z + wingFlap;
    }
    if (this.rightWingB) {
      const init = this.initialRotations.get(this.rightWingB);
      if (init) this.rightWingB.rotation.z = init.z + wingFlap * 0.6;
    }

    // Tail feather waggle
    if (this.tailBone) {
      const init = this.initialRotations.get(this.tailBone);
      if (init) {
        const tailWag = Math.sin(this.time * 2.5) * 0.12;
        this.tailBone.rotation.y = init.y + tailWag;
      }
    }
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
    this.neckBase = null;
    this.leftLeg = null;
    this.leftFoot = null;
    this.rightLeg = null;
    this.rightFoot = null;
    this.leftWingA = null;
    this.leftWingB = null;
    this.rightWingA = null;
    this.rightWingB = null;
    this.tailBone = null;
  }

  public takeDamage(amount: number): void {
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
        this.particleManager.spawnBlockDebris(BlockType.GRASS, this.root.position, 4);
      } catch (e) {}

      // Resource drops: Feather, Uncooked Meat
      if (this.itemManager) {
        // 1. Bloomwing Feather (1-3)
        const featherCount = 1 + Math.floor(Math.random() * 3);
        this.itemManager.spawnResourcePickup(BlockType.BLOOMWING_FEATHER, this.root.position, featherCount);

        // 2. Uncooked Meat (1-2)
        const meatCount = 1 + (Math.random() < 0.5 ? 1 : 0);
        this.itemManager.spawnResourcePickup(BlockType.UNCOOKED_MEAT, this.root.position, meatCount);
      }

      this.dispose();
    } else {
      // Scurry away on the ground (no flying)
      this.state = ChickenState.FLEE;
      this.stateTimer = 3.5;
    }
  }
}
