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

export enum SerpentType {
  EMERALD = 'EMERALD',
  FROST = 'FROST',
  SAND = 'SAND',
  ASHEN = 'ASHEN',
}

export enum SerpentState {
  PATROLLING = 'PATROLLING',
  STALKING = 'STALKING',
  DEVISTATING_SLAM = 'DEVISTATING_SLAM',
  BIOME_BLAST = 'BIOME_BLAST',
  HURT = 'HURT',
  DEAD = 'DEAD',
}

export interface SerpentConfig {
  type: SerpentType;
  name: string;
  icon: string;
  themeColor: string;
  modelPath: string;
  maxHealth: number;
  scale: number;
  slitherSpeed: number;
  slamDamage: number;
  blastDamage: number;
  blastColor: number;
  eyeLightColor: number;
  hasVenomSpit?: boolean;
}

export const SERPENT_CONFIGS: Record<SerpentType, SerpentConfig> = {
  [SerpentType.EMERALD]: {
    type: SerpentType.EMERALD,
    name: 'Emerald Canopy Serpent (Biome Boss)',
    icon: '🐍 👑',
    themeColor: '#10b981',
    modelPath: '/entities/EMERALD SERPENT.glb',
    maxHealth: 280,
    scale: 1.0,
    slitherSpeed: 2.4,
    slamDamage: 24,
    blastDamage: 18,
    blastColor: 0x22c55e,
    eyeLightColor: 0x34d399,
    hasVenomSpit: true, // Occasional secondary venom spit
  },
  [SerpentType.FROST]: {
    type: SerpentType.FROST,
    name: 'Frostfang Glacial Serpent (Biome Boss)',
    icon: '❄️ 👑',
    themeColor: '#38bdf8',
    modelPath: '/entities/FROST SERPENT.glb',
    maxHealth: 300,
    scale: 1.0,
    slitherSpeed: 2.2,
    slamDamage: 26,
    blastDamage: 0,
    blastColor: 0x38bdf8,
    eyeLightColor: 0x7dd3fc,
    hasVenomSpit: false, // Melee boss only
  },
  [SerpentType.SAND]: {
    type: SerpentType.SAND,
    name: 'Cinderdune Sand Serpent (Biome Boss)',
    icon: '🏜️ 👑',
    themeColor: '#f59e0b',
    modelPath: '/entities/SAND SERPENT.glb',
    maxHealth: 320,
    scale: 1.0,
    slitherSpeed: 2.6,
    slamDamage: 28,
    blastDamage: 0,
    blastColor: 0xf59e0b,
    eyeLightColor: 0xfbbf24,
    hasVenomSpit: false, // Melee boss only
  },
  [SerpentType.ASHEN]: {
    type: SerpentType.ASHEN,
    name: 'Abyssal Ashen Serpent (Biome Boss)',
    icon: '🔥 👑',
    themeColor: '#ef4444',
    modelPath: '/entities/ASHEN SERPENT.glb',
    maxHealth: 350,
    scale: 1.0,
    slitherSpeed: 2.3,
    slamDamage: 30,
    blastDamage: 0,
    blastColor: 0xef4444,
    eyeLightColor: 0xf87171,
    hasVenomSpit: false, // Melee boss only
  },
};

export class BiomeSerpent {
  public scene: THREE.Scene;
  public particleManager: BlockParticleManager;
  public sound: SoundManager;
  public world: VoxelWorld;
  public itemManager: ItemManager;

  // Frame-sliced LoS Scheduling & Zero-Garbage Scratch Vectors
  private static nextEntityId: number = 0;
  private readonly entityId: number = ++BiomeSerpent.nextEntityId;
  private static readonly SCRATCH_SERPENT_EYE = new THREE.Vector3();
  private static readonly SCRATCH_PLAYER_EYE = new THREE.Vector3();

  public config: SerpentConfig;
  public root: THREE.Group;
  public model: THREE.Object3D | null = null;
  public healthBar: EntityHealthBar;

  // Boss Stats & Health
  public health: number;
  public maxHealth: number;
  public isDead = false;
  public isDisposed = false;
  private deathTimer = 0;

  // AI & States
  public state: SerpentState = SerpentState.PATROLLING;
  private stateTimer = 3.0 + Math.random() * 4.0;
  private wanderTarget = new THREE.Vector3();
  public homePosition = new THREE.Vector3();
  private currentMoveSpeed = 0;
  private currentYaw = 0;
  private targetYaw = 0;
  private currentPitch = 0;
  private currentRoll = 0;
  private attackCooldown = 2.0;
  private aggroCooldown = 0;
  private unreachableTimer = 0;
  private attackProgress = 0;
  private hasDealtDamageThisAttack = false;

  // Screen shake callback when heavy ground slam lands
  public onSlamImpact?: (pos: THREE.Vector3, intensity: number) => void;

  // Skeletal Spine Bone Chain for Physics Trail Follower IK
  private spineBones: THREE.Bone[] = [];
  private initialBoneRotations = new Map<THREE.Bone, THREE.Euler>();
  private slitherTime = Math.random() * 50;

  // Fixed-size Circular Path Buffer for Zero-GC Multi-Vertebra IK Simulation (No Planking)
  private static readonly MAX_PATH_POINTS = 200;
  private pathBufferX = new Float32Array(BiomeSerpent.MAX_PATH_POINTS);
  private pathBufferY = new Float32Array(BiomeSerpent.MAX_PATH_POINTS);
  private pathBufferZ = new Float32Array(BiomeSerpent.MAX_PATH_POINTS);
  private pathHeadIndex = 0;
  private pathCount = 0;
  private isPathInitialized = false;

  // Visual Aura & Eye Light
  private eyeLight: THREE.PointLight | null = null;

  // Throttled Line-of-Sight Evaluation (5Hz to 10Hz to prevent 60Hz DDA CPU bottleneck)
  private losTimer: number = Math.random() * 0.15;
  private cachedLosResult: boolean = false;

  constructor(
    scene: THREE.Scene,
    particleManager: BlockParticleManager,
    sound: SoundManager,
    world: VoxelWorld,
    itemManager: ItemManager,
    type: SerpentType,
    spawnPos: THREE.Vector3
  ) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.sound = sound;
    this.world = world;
    this.itemManager = itemManager;
    this.config = SERPENT_CONFIGS[type];

    this.health = this.config.maxHealth;
    this.maxHealth = this.config.maxHealth;

    this.root = new THREE.Group();
    this.root.position.copy(spawnPos);
    this.homePosition.copy(spawnPos);
    this.wanderTarget.copy(spawnPos);
    this.scene.add(this.root);

    // Large GPU Billboard Boss Health Bar
    this.healthBar = new EntityHealthBar(this.root, {
      name: this.config.name,
      icon: this.config.icon,
      maxHealth: this.maxHealth,
      heightOffset: 4.2,
      themeColor: this.config.themeColor,
      scale: 1.4,
    });

    // Glowing Bioluminescent Eye Light
    this.eyeLight = new THREE.PointLight(this.config.eyeLightColor, 2.2, 14, 1.2);
    this.eyeLight.position.set(0, 2.5, 3.5);
    this.root.add(this.eyeLight);

    this.loadModel();
  }

  private extractSpineChain(rootNode: THREE.Object3D): THREE.Bone[] {
    const allBones: THREE.Bone[] = [];
    rootNode.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        allBones.push(child as THREE.Bone);
      }
    });

    if (allBones.length === 0) return [];

    const boneSet = new Set(allBones);
    let rootBone = allBones.find((b) => !b.parent || !boneSet.has(b.parent as THREE.Bone));
    if (!rootBone) rootBone = allBones[0];

    const countDescendantBones = (bone: THREE.Bone): number => {
      let count = 1;
      for (const child of bone.children) {
        if ((child as THREE.Bone).isBone) {
          count += countDescendantBones(child as THREE.Bone);
        }
      }
      return count;
    };

    const spine: THREE.Bone[] = [];
    let current: THREE.Bone | null = rootBone;

    while (current) {
      spine.push(current);
      const boneChildren = current.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
      if (boneChildren.length === 0) break;
      if (boneChildren.length === 1) {
        current = boneChildren[0];
      } else {
        let bestChild = boneChildren[0];
        let maxDesc = -1;
        for (const child of boneChildren) {
          const desc = countDescendantBones(child);
          if (desc > maxDesc) {
            maxDesc = desc;
            bestChild = child;
          }
        }
        current = bestChild;
      }
    }

    return spine;
  }

  private loadModel(): void {
    const clone = ModelCache.getClone(this.config.modelPath);
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
    this.model.scale.set(this.config.scale, this.config.scale, this.config.scale);

    this.spineBones = [];
    this.initialBoneRotations.clear();

    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.material) {
          const origMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          const mat = origMat.clone();
          mat.roughness = 0.55;
          mat.metalness = 0.20;
          if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
          mat.emissiveIntensity = 0.0;
          mat.emissiveMap = null;
          mesh.material = mat;
        }
      }
    });

    // Extract true head-to-tail spine vertebrae chain
    this.spineBones = this.extractSpineChain(this.model);
    for (const bone of this.spineBones) {
      this.initialBoneRotations.set(bone, bone.rotation.clone());
    }

    this.root.add(this.model);
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    if (this.isDisposed) return;

    if (this.isDead) {
      this.deathTimer -= dt;
      // Smoothly sink / collapse into ground during defeat animation
      this.root.position.y -= dt * 0.15;
      if (this.deathTimer <= 0) {
        this.dispose();
      }
      return;
    }

    this.slitherTime += dt;
    this.attackCooldown -= dt;
    this.aggroCooldown = Math.max(0, this.aggroCooldown - dt);
    this.losTimer -= dt;

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position);
    const verticalDist = Math.abs(playerPos.y - this.root.position.y);
    const dist3D = this.root.position.distanceTo(playerPos);
    toPlayer.y = 0;
    const horizontalDist = toPlayer.length();

    // ─── 1. BOSS AI STATE MACHINE ───
    switch (this.state) {
      case SerpentState.PATROLLING: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, this.config.slitherSpeed * 0.45, dt * 2.0);
        this.stateTimer -= dt;

        // Check if player enters menacing aggro awareness radius (22m 3D) within reasonable height (< 6m) and unobstructed LOS
        if (this.aggroCooldown <= 0 && dist3D < 22.0 && verticalDist < 6.0) {
          const frameIndex = this.world?.frameCounter ?? 0;
          const isMyTimeSlot = (frameIndex + this.entityId) % 5 === 0;

          if (this.losTimer <= 0 && isMyTimeSlot) {
            this.losTimer = 0.14 + Math.random() * 0.05;
            const serpentEye = BiomeSerpent.SCRATCH_SERPENT_EYE.set(this.root.position.x, this.root.position.y + 2.5, this.root.position.z);
            const playerEye = BiomeSerpent.SCRATCH_PLAYER_EYE.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
            this.cachedLosResult = this.world ? this.world.hasLineOfSight(serpentEye, playerEye, 22.0) : true;
          }

          if (this.cachedLosResult) {
            this.state = SerpentState.STALKING;
            this.unreachableTimer = 0;
            this.stateTimer = 6.0 + Math.random() * 4.0;
            this.sound?.playMonsterHurt?.(); // Hiss alert
            break;
          }
        }

        if (this.stateTimer <= 0) {
          this.pickNewWanderTarget();
          this.stateTimer = 4.0 + Math.random() * 5.0;
        }

        const toTarget = new THREE.Vector3().subVectors(this.wanderTarget, this.root.position);
        toTarget.y = 0;
        if (toTarget.length() > 2.0) {
          this.targetYaw = Math.atan2(toTarget.x, toTarget.z);
        }
        break;
      }

      case SerpentState.STALKING: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, this.config.slitherSpeed, dt * 2.5);

        // Disengage if player flees away or flies far above (22m 3D leash, 6.5m vertical)
        if (dist3D > 22.0 || verticalDist > 6.5) {
          this.unreachableTimer += dt;
          if (this.unreachableTimer >= 1.0 || dist3D > 26.0 || verticalDist > 10.0) {
            this.state = SerpentState.PATROLLING;
            this.stateTimer = 4.0 + Math.random() * 3.0;
            this.aggroCooldown = 6.0;
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

        // Primary Close Combat Range: Devastating Melee Ground Slam
        if (dist3D <= 6.5 && verticalDist <= 4.5 && this.attackCooldown <= 0) {
          this.state = SerpentState.DEVISTATING_SLAM;
          this.attackProgress = 0;
          this.hasDealtDamageThisAttack = false;
          break;
        }

        // Emerald Serpent Rare Secondary Venom Spit (Harassment only when player is at distance)
        if (
          this.config.hasVenomSpit &&
          dist3D > 12.0 &&
          dist3D <= 22.0 &&
          verticalDist <= 6.0 &&
          this.attackCooldown <= 0 &&
          Math.random() < 0.02
        ) {
          this.state = SerpentState.BIOME_BLAST;
          this.attackProgress = 0;
          this.hasDealtDamageThisAttack = false;
          break;
        }
        break;
      }

      case SerpentState.DEVISTATING_SLAM: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, dt * 6.0);
        this.attackProgress += dt * 0.9; // ~1.1s total slam cycle

        // Impact moment at progress ~0.65
        if (this.attackProgress >= 0.65 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;

          // Impact location in front of serpent head
          const headForward = new THREE.Vector3(0, 0, 3.5).applyEuler(new THREE.Euler(0, this.currentYaw, 0));
          const impactPos = this.root.position.clone().add(headForward);

          // Spawn ground smash particles & sound
          this.particleManager.spawnBlockDebris(BlockType.STONE, impactPos, 20);
          this.sound?.playBlockBreak?.();

          // Screen shake
          if (this.onSlamImpact) {
            this.onSlamImpact(impactPos, 0.45);
          }

          // Devastating damage to player if within slam radius (5.5m 3D) and reachable vertical height
          const distToImpact = impactPos.distanceTo(playerPos);
          if (distToImpact <= 5.5 && Math.abs(playerPos.y - impactPos.y) <= 3.5 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = playerPos.clone().sub(impactPos).normalize().multiplyScalar(18.0);
            knockback.y = 7.0;
            playerPhysics.takeDamage(this.config.slamDamage, knockback);
          }
        }

        if (this.attackProgress >= 1.0) {
          this.state = SerpentState.STALKING;
          this.attackCooldown = 2.0 + Math.random() * 1.5;
        }
        break;
      }

      case SerpentState.BIOME_BLAST: {
        this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, dt * 5.0);
        this.attackProgress += dt * 0.8; // ~1.25s charge and fire

        // Particle charge up at mouth (green venom spores)
        if (this.attackProgress < 0.6) {
          const mouthPos = this.root.position.clone().add(new THREE.Vector3(0, 3.2, 2.5).applyEuler(new THREE.Euler(0, this.currentYaw, 0)));
          this.particleManager.spawnTorchEmber(mouthPos, 1);
        }

        // Venom projectile fire at progress ~0.65
        if (this.attackProgress >= 0.65 && !this.hasDealtDamageThisAttack) {
          this.hasDealtDamageThisAttack = true;

          const mouthPos = this.root.position.clone().add(new THREE.Vector3(0, 3.2, 2.5).applyEuler(new THREE.Euler(0, this.currentYaw, 0)));
          this.particleManager.spawnBlockDebris(BlockType.JUNGLE_LEAVES, mouthPos, 14);
          this.sound?.playMonsterHurt?.();

          // If player is in line of fire, hit with venom burst
          if (dist3D <= 26.0 && verticalDist <= 10.0 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
            const knockback = playerPos.clone().sub(mouthPos).normalize().multiplyScalar(10.0);
            knockback.y = 3.0;
            playerPhysics.takeDamage(this.config.blastDamage, knockback);
          }
        }

        if (this.attackProgress >= 1.0) {
          this.state = SerpentState.STALKING;
          this.attackCooldown = 9.0 + Math.random() * 4.0; // Long cooldown so primary melee slam is main focus
        }
        break;
      }

      case SerpentState.HURT: {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = SerpentState.STALKING;
        }
        break;
      }
    }

    // ─── 2. SMOOTH ROTATION & MOVEMENT PHYSICS ───
    // Smooth angle interpolation handling 2*PI wrap
    let diff = (this.targetYaw - this.currentYaw) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    this.currentYaw += diff * Math.min(1.0, dt * 2.2);

    if (this.currentMoveSpeed > 0.05) {
      const moveX = Math.sin(this.currentYaw) * this.currentMoveSpeed * dt;
      const moveZ = Math.cos(this.currentYaw) * this.currentMoveSpeed * dt;
      this.root.position.x += moveX;
      this.root.position.z += moveZ;
    }

    // Anchor head/root to smooth continuous ground terrain surface (+0.65m clearance)
    const currentGroundY = this.getSmoothGroundHeight(this.root.position.x, this.root.position.z) + 0.65;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, currentGroundY, dt * 10.0);

    const curX = this.root.position.x;
    const curY = this.root.position.y;
    const curZ = this.root.position.z;

    if (!this.isPathInitialized) {
      // Seed initial trail behind the serpent on spawn
      this.isPathInitialized = true;
      const fwdX = Math.sin(this.currentYaw);
      const fwdZ = Math.cos(this.currentYaw);
      this.pathHeadIndex = 0;
      this.pathCount = BiomeSerpent.MAX_PATH_POINTS;
      for (let i = 0; i < BiomeSerpent.MAX_PATH_POINTS; i++) {
        const d = i * 0.1; // 200 * 0.1 = 20 meters of trail
        const px = curX - fwdX * d;
        const pz = curZ - fwdZ * d;
        const py = this.getSmoothGroundHeight(px, pz) + 0.65;
        this.pathBufferX[i] = px;
        this.pathBufferY[i] = py;
        this.pathBufferZ[i] = pz;
      }
    } else {
      const hx = this.pathBufferX[this.pathHeadIndex];
      const hy = this.pathBufferY[this.pathHeadIndex];
      const hz = this.pathBufferZ[this.pathHeadIndex];
      const dx = curX - hx;
      const dy = curY - hy;
      const dz = curZ - hz;
      // Record new point when serpent moves >= 0.08m (0.08^2 = 0.0064)
      if (dx * dx + dy * dy + dz * dz >= 0.0064) {
        this.pathHeadIndex = (this.pathHeadIndex - 1 + BiomeSerpent.MAX_PATH_POINTS) % BiomeSerpent.MAX_PATH_POINTS;
        this.pathBufferX[this.pathHeadIndex] = curX;
        this.pathBufferY[this.pathHeadIndex] = curY;
        this.pathBufferZ[this.pathHeadIndex] = curZ;
        if (this.pathCount < BiomeSerpent.MAX_PATH_POINTS) {
          this.pathCount++;
        }
      }
    }

    // Align Head pitch to local slope
    const fwdX = Math.sin(this.currentYaw);
    const fwdZ = Math.cos(this.currentYaw);
    const hAhead = this.getSmoothGroundHeight(curX + fwdX * 2.0, curZ + fwdZ * 2.0);
    const hBehind = this.getSmoothGroundHeight(curX - fwdX * 2.0, curZ - fwdZ * 2.0);
    const targetPitch = -Math.atan2(hAhead - hBehind, 4.0);
    this.currentPitch += (targetPitch - this.currentPitch) * Math.min(1.0, dt * 5.0);

    this.root.rotation.set(this.currentPitch, this.currentYaw, 0, 'YXZ');

    // ─── 3. PROCEDURAL MULTI-VERTEBRA TRAIL IK & SLITHERING ───
    this.applyTrailSpineIK(dt);

    // Update Boss Health Bar Billboard
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
        return (h + 1.0) * 0.5; // Top of ground block
      }
    }
    return defaultY;
  }

  private samplePathAtDistance(distBehindHead: number): { x: number; y: number; z: number } {
    if (this.pathCount === 0) {
      return { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z };
    }
    const headIdx = this.pathHeadIndex;
    if (distBehindHead <= 0 || this.pathCount === 1) {
      return {
        x: this.pathBufferX[headIdx],
        y: this.pathBufferY[headIdx],
        z: this.pathBufferZ[headIdx],
      };
    }

    let accumulated = 0;
    const maxSegments = Math.min(this.pathCount - 1, BiomeSerpent.MAX_PATH_POINTS - 1);

    for (let k = 0; k < maxSegments; k++) {
      const i1 = (headIdx + k) % BiomeSerpent.MAX_PATH_POINTS;
      const i2 = (headIdx + k + 1) % BiomeSerpent.MAX_PATH_POINTS;
      const x1 = this.pathBufferX[i1];
      const y1 = this.pathBufferY[i1];
      const z1 = this.pathBufferZ[i1];
      const x2 = this.pathBufferX[i2];
      const y2 = this.pathBufferY[i2];
      const z2 = this.pathBufferZ[i2];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const segDist = Math.hypot(dx, dy, dz);

      if (accumulated + segDist >= distBehindHead) {
        const t = (distBehindHead - accumulated) / Math.max(0.0001, segDist);
        return {
          x: x1 + dx * t,
          y: y1 + dy * t,
          z: z1 + dz * t,
        };
      }
      accumulated += segDist;
    }

    // Return the tail-most recorded point
    const tailIdx = (headIdx + this.pathCount - 1) % BiomeSerpent.MAX_PATH_POINTS;
    return {
      x: this.pathBufferX[tailIdx],
      y: this.pathBufferY[tailIdx],
      z: this.pathBufferZ[tailIdx],
    };
  }

  private applyTrailSpineIK(dt: number): void {
    if (this.spineBones.length === 0) return;

    const speedRatio = Math.max(0.15, this.currentMoveSpeed / this.config.slitherSpeed);
    const slitherFreq = 3.2 * speedRatio;
    const slitherAmp = 0.09 * Math.min(1.0, speedRatio);

    // Head rearing pitch applied only to the leading 3 neck/head bones
    let headPitchOffset = 0;
    if (this.state === SerpentState.STALKING) {
      headPitchOffset = -0.15;
    } else if (this.state === SerpentState.DEVISTATING_SLAM) {
      headPitchOffset = this.attackProgress < 0.6 ? -0.28 : 0.20;
    } else if (this.state === SerpentState.BIOME_BLAST) {
      headPitchOffset = -0.22;
    }

    const boneCount = this.spineBones.length;
    const totalBodyLength = 11.0;
    const segSpacing = totalBodyLength / Math.max(1, boneCount - 1);

    // Sample 3D world positions along the physical trail for every vertebra
    const boneWorldPositions: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < boneCount; i++) {
      const dist = i * segSpacing;
      const sampled = this.samplePathAtDistance(dist);
      // Ensure each vertebra rests on top of local terrain contour
      const groundY = this.getSmoothGroundHeight(sampled.x, sampled.z) + 0.65;
      sampled.y = Math.max(sampled.y, groundY);
      boneWorldPositions.push(sampled);
    }

    // Compute segment world orientations (yaw & pitch)
    const worldYaws: number[] = [];
    const worldPitches: number[] = [];

    for (let i = 0; i < boneCount; i++) {
      if (i === 0) {
        worldYaws.push(this.currentYaw);
        worldPitches.push(this.currentPitch);
      } else {
        const prev = boneWorldPositions[i - 1];
        const curr = boneWorldPositions[i];
        const dx = prev.x - curr.x;
        const dy = prev.y - curr.y;
        const dz = prev.z - curr.z;
        const horizDist = Math.hypot(dx, dz);

        const yaw = Math.atan2(dx, dz);
        const pitch = -Math.atan2(dy, Math.max(0.001, horizDist));
        worldYaws.push(yaw);
        worldPitches.push(pitch);
      }
    }

    // Apply relative local rotations along the bone chain
    for (let i = 0; i < boneCount; i++) {
      const bone = this.spineBones[i];
      const initial = this.initialBoneRotations.get(bone);
      if (!initial) continue;

      const progressAlongSpine = i / Math.max(1, boneCount - 1);
      const waveYaw = Math.sin(this.slitherTime * slitherFreq - progressAlongSpine * Math.PI * 2.5) * slitherAmp;

      const neckFactor = Math.max(0, 1.0 - i / 3.0);
      const headRearedPitch = headPitchOffset * neckFactor;

      let deltaYaw = 0;
      let deltaPitch = 0;

      if (i === 0) {
        deltaYaw = 0;
        deltaPitch = headRearedPitch;
      } else {
        let yawDiff = (worldYaws[i] - worldYaws[i - 1]) % (Math.PI * 2);
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;

        deltaYaw = yawDiff;
        deltaPitch = (worldPitches[i] - worldPitches[i - 1]) + headRearedPitch;
      }

      deltaYaw = THREE.MathUtils.clamp(deltaYaw, -0.40, 0.40);
      deltaPitch = THREE.MathUtils.clamp(deltaPitch, -0.40, 0.40);

      bone.rotation.x = initial.x + deltaPitch;
      bone.rotation.y = initial.y;
      bone.rotation.z = initial.z + deltaYaw + waveYaw;
    }
  }

  private pickNewWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 10.0 + Math.random() * 25.0;
    this.wanderTarget.set(
      this.homePosition.x + Math.cos(angle) * dist,
      this.homePosition.y,
      this.homePosition.z + Math.sin(angle) * dist
    );
  }

  public takeDamage(amount: number): void {
    if (this.isDead || this.isDisposed) return;

    this.health = Math.max(0, this.health - amount);
    this.healthBar.setHealth(this.health, this.maxHealth);

    // Flash eyes and trigger particle debris
    this.particleManager.spawnBlockDebris(BlockType.STONE, this.root.position, 6);
    this.sound?.playMonsterHurt?.();

    if (this.health <= 0) {
      this.die();
    } else {
      this.aggroCooldown = 0;
      this.unreachableTimer = 0;
      this.state = SerpentState.STALKING; // Instantly aggro when struck
    }
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.state = SerpentState.DEAD;
    this.deathTimer = 4.5; // 4.5s defeat collapse / sink countdown

    // Defeat celebration: spawn burst particles & drops
    this.particleManager.spawnBlockDebris(BlockType.DIAMOND_ORE, this.root.position, 28);
    this.sound?.playBlockBreak?.();

    // Boss Loot Drops: Massive XP, Boss Scale Trophies, Rare Ores & Gems
    const dropPos = this.root.position.clone();
    dropPos.y += 0.5;

    this.itemManager.spawnPickup(BlockType.ANIMAL_HIDE, dropPos, 3);
    this.itemManager.spawnPickup(BlockType.BONECREST_HORN, dropPos, 2);
    this.itemManager.spawnPickup(BlockType.DIAMOND_ORE, dropPos, 2);

    if (this.config.type === SerpentType.ASHEN) {
      this.itemManager.spawnPickup(BlockType.ASHEN_EMBERPOD, dropPos, 3);
    } else if (this.config.type === SerpentType.SAND) {
      this.itemManager.spawnPickup(BlockType.DUNESTING_SHELL, dropPos, 2);
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.healthBar.dispose();
    if (this.eyeLight) {
      this.root.remove(this.eyeLight);
      this.eyeLight.dispose();
      this.eyeLight = null;
    }

    if (this.model) {
      disposeHierarchy(this.model);
      this.root.remove(this.model);
      this.model = null;
    }

    this.scene.remove(this.root);
  }
}
