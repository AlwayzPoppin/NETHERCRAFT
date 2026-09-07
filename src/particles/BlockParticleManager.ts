import * as THREE from 'three';
import { BlockType } from '../textures/TextureGenerator';

export interface ParticleSlot {
  index: number;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotVx: number;
  rotVy: number;
  rotVz: number;
  scale: number;
  baseScale: number;
  life: number;
  maxLife: number;
  type: 'debris' | 'smoke' | 'ash' | 'cloud' | 'bubble';
}

export class BlockParticleManager {
  private scene: THREE.Scene;
  private static readonly MAX_PARTICLES = 256;

  private instancedMesh: THREE.InstancedMesh;
  private particleGeometry: THREE.BoxGeometry;
  private particleMaterial: THREE.MeshLambertMaterial;

  private particles: ParticleSlot[];
  private activeIndices: number[] = [];
  private freeIndices: number[] = [];
  private needsColorUpdate: boolean = false;

  // Pre-allocated scratch objects to eliminate per-frame GC allocations
  private dummyMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private dummyPos: THREE.Vector3 = new THREE.Vector3();
  private dummyQuat: THREE.Quaternion = new THREE.Quaternion();
  private dummyScale: THREE.Vector3 = new THREE.Vector3();
  private dummyEuler: THREE.Euler = new THREE.Euler();
  private tempColor: THREE.Color = new THREE.Color();

  // Multi-tone microvoxel color palettes for authentic stylized block fracture
  private blockColors: Partial<Record<BlockType, number[]>> = {
    [BlockType.GRASS]: [0x4ade80, 0x22c55e, 0x15803d, 0x78350f, 0x92400e],
    [BlockType.DIRT]: [0x78350f, 0x92400e, 0x57260c, 0x451a03],
    [BlockType.STONE]: [0x64748b, 0x475569, 0x334155, 0x94a3b8],
    [BlockType.OAK_LOG]: [0x854d0e, 0x713f12, 0xa16207, 0xca8a04],
    [BlockType.OAK_LEAVES]: [0x15803d, 0x16a34a, 0x22c55e, 0x14532d],
    [BlockType.SAND]: [0xfde047, 0xfacc15, 0xeab308, 0xca8a04],
    [BlockType.SNOW]: [0xf8fafc, 0xf1f5f9, 0xe2e8f0, 0xbae6fd],
    [BlockType.ICE]: [0x38bdf8, 0x7dd3fc, 0x0284c7, 0xe0f2fe],
    [BlockType.COAL_ORE]: [0x334155, 0x1e293b, 0x0f172a, 0x64748b],
    [BlockType.IRON_ORE]: [0x64748b, 0xd97706, 0xf59e0b, 0xb45309],
    [BlockType.GOLD_ORE]: [0x64748b, 0xeab308, 0xfacc15, 0xca8a04],
    [BlockType.FROST_STONE]: [0x94a3b8, 0x64748b, 0x38bdf8, 0x0284c7],
    [BlockType.PACKED_SNOW]: [0xe2e8f0, 0xcbd5e1, 0x94a3b8, 0xf8fafc],
    [BlockType.FROZEN_LOG]: [0x475569, 0x334155, 0x1e293b, 0x38bdf8],
    [BlockType.FROST_LEAVES]: [0x0284c7, 0x0369a1, 0x38bdf8, 0xbae6fd],
    [BlockType.NETHER_STONE]: [0x7f1d1d, 0x991b1b, 0x450a0a, 0x18181b],
    [BlockType.ASHEN_SOIL]: [0x334155, 0x1f2937, 0x111827, 0x7f1d1d],
    [BlockType.CORRUPTED_GROWTH]: [0x581c87, 0x7e22ce, 0x9333ea, 0x3b0764],
    [BlockType.CINDER_SAND]: [0x991b1b, 0x7f1d1d, 0xd97706, 0x450a0a],
    [BlockType.CORRUPTED_ORE]: [0x7f1d1d, 0x9333ea, 0xa855f7, 0x581c87],
    [BlockType.ASHEN_COPPER_ORE]: [0x334155, 0xb45309, 0xd97706, 0x0d9488],
    [BlockType.ASHEN_SILVER_ORE]: [0x334155, 0xe2e8f0, 0xf8fafc, 0x94a3b8],
    [BlockType.ASHEN_GOLD_ORE]: [0x334155, 0xf59e0b, 0xfacc15, 0xd97706],
    [BlockType.ASHEN_ABYSSAL_PRIMORDIUM]: [0x18181b, 0x10b981, 0x34d399, 0x059669],
    [BlockType.SUNSCORCHED_SANDSTONE]: [0xd97706, 0xb45309, 0x92400e, 0xf59e0b],
    [BlockType.CRACKED_CLAY]: [0xb45309, 0x92400e, 0x78350f, 0xd97706],
    [BlockType.TEAL_LEAVES]: [0x0d9488, 0x14b8a6, 0x2dd4bf, 0x115e59],
    [BlockType.BLUE_LEAVES]: [0x2563eb, 0x3b82f6, 0x60a5fa, 0x1d4ed8],
    [BlockType.PURPLE_LEAVES]: [0x9333ea, 0xa855f7, 0xc084fc, 0x7e22ce],
    [BlockType.SCRUBGRASS]: [0xa16207, 0xca8a04, 0x854d0e, 0x713f12],
    [BlockType.DESERT_SAND]: [0xf59e0b, 0xfbbf24, 0xd97706, 0xb45309],
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    this.particleMaterial = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    this.instancedMesh = new THREE.InstancedMesh(
      this.particleGeometry,
      this.particleMaterial,
      BlockParticleManager.MAX_PARTICLES
    );
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(BlockParticleManager.MAX_PARTICLES * 3),
      3
    );
    this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.name = 'InstancedBlockParticles';

    this.particles = new Array(BlockParticleManager.MAX_PARTICLES);

    // Initialize all particle slots and hide instances initially
    this.dummyMatrix.makeScale(0, 0, 0);
    this.tempColor.setHex(0xffffff);

    for (let i = 0; i < BlockParticleManager.MAX_PARTICLES; i++) {
      this.particles[i] = {
        index: i,
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        rotVx: 0,
        rotVy: 0,
        rotVz: 0,
        scale: 0,
        baseScale: 1.0,
        life: 0,
        maxLife: 1.0,
        type: 'debris',
      };

      this.freeIndices.push(i);
      this.instancedMesh.setMatrixAt(i, this.dummyMatrix);
      this.instancedMesh.setColorAt(i, this.tempColor);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.scene.add(this.instancedMesh);
  }

  /**
   * Acquire a pooled particle slot without garbage collection
   */
  private acquireSlot(): ParticleSlot {
    if (this.freeIndices.length > 0) {
      const idx = this.freeIndices.pop()!;
      const slot = this.particles[idx];
      slot.active = true;
      this.activeIndices.push(idx);
      return slot;
    }

    // Pool at max capacity: steal and recycle the oldest active particle (FIFO)
    const oldestIdx = this.activeIndices.shift()!;
    const slot = this.particles[oldestIdx];
    slot.active = true;
    this.activeIndices.push(oldestIdx);
    return slot;
  }

  public spawnBlockDebris(blockType: BlockType, pos: THREE.Vector3, count: number = 14): void {
    const palette = this.blockColors[blockType] || [0x94a3b8, 0x64748b, 0x475569];
    const spawnCount = Math.min(count, 32);

    for (let i = 0; i < spawnCount; i++) {
      const p = this.acquireSlot();
      p.x = pos.x + 0.5 + (Math.random() - 0.5) * 0.6;
      p.y = pos.y + 0.5 + (Math.random() - 0.5) * 0.6;
      p.z = pos.z + 0.5 + (Math.random() - 0.5) * 0.6;

      p.vx = (Math.random() - 0.5) * 4.5;
      p.vy = Math.random() * 3.5 + 1.5;
      p.vz = (Math.random() - 0.5) * 4.5;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 10;
      p.rotVy = (Math.random() - 0.5) * 10;
      p.rotVz = (Math.random() - 0.5) * 10;

      p.baseScale = 1.0;
      p.scale = 1.0;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.25;
      p.type = 'debris';

      const colorHex = palette[Math.floor(Math.random() * palette.length)];
      this.tempColor.setHex(colorHex);
      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  /**
   * Spawns an authentic 3D physical Microvoxel Shatter Explosion.
   * Dismantles the targeted 1m block into its constituent 4x4 sub-voxel micro-cubes.
   */
  public spawnMicrovoxelShatter(blockType: BlockType, pos: THREE.Vector3): void {
    const palette = this.blockColors[blockType] || [0x94a3b8, 0x64748b, 0x475569];

    // Subdivide 1x1x0.5 block space into physical micro-cubes
    for (let gx = 0; gx < 4; gx++) {
      for (let gz = 0; gz < 4; gz++) {
        for (let gy = 0; gy < 2; gy++) {
          const p = this.acquireSlot();
          const offsetX = (gx + 0.5) / 4.0;
          const offsetY = (gy + 0.5) / 4.0; // 0.5 height block
          const offsetZ = (gz + 0.5) / 4.0;

          p.x = pos.x + offsetX;
          p.y = pos.y * 0.5 + offsetY;
          p.z = pos.z + offsetZ;

          // Outward velocity vector from block center
          const dirX = (offsetX - 0.5);
          const dirZ = (offsetZ - 0.5);
          const dirY = (offsetY - 0.25);

          p.vx = dirX * 6.5 + (Math.random() - 0.5) * 2.0;
          p.vy = Math.max(1.8, dirY * 7.0 + Math.random() * 3.5 + 2.0);
          p.vz = dirZ * 6.5 + (Math.random() - 0.5) * 2.0;

          p.rotX = Math.random() * Math.PI * 2;
          p.rotY = Math.random() * Math.PI * 2;
          p.rotZ = Math.random() * Math.PI * 2;
          p.rotVx = (Math.random() - 0.5) * 16;
          p.rotVy = (Math.random() - 0.5) * 16;
          p.rotVz = (Math.random() - 0.5) * 16;

          p.baseScale = 1.25 + Math.random() * 0.35;
          p.scale = p.baseScale;
          p.life = 0;
          p.maxLife = 0.65 + Math.random() * 0.35;
          p.type = 'debris';

          const colorHex = palette[Math.floor(Math.random() * palette.length)];
          this.tempColor.setHex(colorHex);
          this.instancedMesh.setColorAt(p.index, this.tempColor);
        }
      }
    }
    this.needsColorUpdate = true;
  }

  public spawnBreakBlockParticles(pos: THREE.Vector3, blockType: BlockType, count: number = 8): void {
    this.spawnMicrovoxelShatter(blockType, pos);
  }

  public spawnSmokePuff(pos: THREE.Vector3, isDenseBlack: boolean = false): void {
    const count = isDenseBlack ? 2 : 1;
    const colorHex = isDenseBlack ? 0x18181b : 0x71717a;
    this.tempColor.setHex(colorHex);

    for (let i = 0; i < count; i++) {
      const p = this.acquireSlot();
      const scale = isDenseBlack ? 1.5 + Math.random() * 1.2 : 1.0 + Math.random() * 0.8;

      p.x = pos.x + (Math.random() - 0.5) * 1.8;
      p.y = pos.y + (Math.random() - 0.5) * 0.8;
      p.z = pos.z + (Math.random() - 0.5) * 1.8;

      p.vx = (Math.random() - 0.5) * 0.8;
      p.vy = Math.random() * 1.8 + 1.2;
      p.vz = (Math.random() - 0.5) * 0.8;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 2;
      p.rotVy = (Math.random() - 0.5) * 2;
      p.rotVz = (Math.random() - 0.5) * 2;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = isDenseBlack ? 2.0 + Math.random() * 1.0 : 1.4 + Math.random() * 0.8;
      p.type = 'smoke';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnAmbientAsh(playerPos: THREE.Vector3, count: number = 3): void {
    for (let i = 0; i < count; i++) {
      const isEmber = Math.random() > 0.5;
      const colorHex = isEmber ? 0xf97316 : 0x1c1917;
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = isEmber ? 0.6 + Math.random() * 0.4 : 1.0 + Math.random() * 0.5;

      p.x = playerPos.x + (Math.random() - 0.5) * 40;
      p.y = playerPos.y + Math.random() * 20 + 15;
      p.z = playerPos.z + (Math.random() - 0.5) * 40;

      p.vx = (Math.random() - 0.5) * 2.0;
      p.vy = -(Math.random() * 2.5 + 1.5);
      p.vz = (Math.random() - 0.5) * 2.0;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 3;
      p.rotVy = (Math.random() - 0.5) * 3;
      p.rotVz = (Math.random() - 0.5) * 3;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = 6.0 + Math.random() * 4.0;
      p.type = 'ash';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnTorchEmber(pos: THREE.Vector3, count: number = 1): void {
    for (let i = 0; i < count; i++) {
      const isFire = Math.random() > 0.35;
      const colorHex = isFire ? (Math.random() > 0.5 ? 0xff8811 : 0xfacc15) : 0x52525b;
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = isFire ? 0.10 + Math.random() * 0.12 : 0.14 + Math.random() * 0.12;

      p.x = pos.x + (Math.random() - 0.5) * 0.08;
      p.y = pos.y + (Math.random() - 0.5) * 0.05;
      p.z = pos.z + (Math.random() - 0.5) * 0.08;

      p.vx = (Math.random() - 0.5) * 0.18;
      p.vy = Math.random() * 0.5 + 0.35; // Gentle upward drift
      p.vz = (Math.random() - 0.5) * 0.18;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 3;
      p.rotVy = (Math.random() - 0.5) * 3;
      p.rotVz = (Math.random() - 0.5) * 3;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = 0.5 + Math.random() * 0.35;
      p.type = 'smoke';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnCloudPuff(pos: THREE.Vector3, count: number = 24, isGold: boolean = false): void {
    const requestedNewCount = Math.min(count, 32);

    for (let i = 0; i < requestedNewCount; i++) {
      const isGoldParticle = isGold && Math.random() < 0.35;
      const colorHex = isGoldParticle ? 0xfacc15 : 0xf8fafc;
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = 0.8 + Math.random() * 0.9;
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.2 + Math.random() * 0.5;
      const speed = 1.8 + Math.random() * 2.5;

      p.x = pos.x + Math.cos(angle) * radius;
      p.y = pos.y + (Math.random() - 0.5) * 0.3;
      p.z = pos.z + Math.sin(angle) * radius;

      p.vx = Math.cos(angle) * speed;
      p.vy = Math.random() * 1.5 + 0.4;
      p.vz = Math.sin(angle) * speed;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 4;
      p.rotVy = (Math.random() - 0.5) * 4;
      p.rotVz = (Math.random() - 0.5) * 4;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.35;
      p.type = 'cloud';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnNimbusTrail(pos: THREE.Vector3, dir: THREE.Vector3, isTurbo: boolean = false): void {
    const count = isTurbo ? 3 : 2;

    for (let i = 0; i < count; i++) {
      const isGoldParticle = Math.random() < (isTurbo ? 0.45 : 0.2);
      const colorHex = isGoldParticle ? 0xfacc15 : 0xf8fafc;
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = (isTurbo ? 1.0 : 0.7) + Math.random() * 0.6;
      const speed = 0.8 + Math.random() * 1.2;

      p.x = pos.x + (Math.random() - 0.5) * 0.4;
      p.y = pos.y + (Math.random() - 0.5) * 0.2;
      p.z = pos.z + (Math.random() - 0.5) * 0.4;

      p.vx = dir.x * speed;
      p.vy = dir.y * speed + 0.3 + Math.random() * 0.4;
      p.vz = dir.z * speed;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 2;
      p.rotVy = (Math.random() - 0.5) * 2;
      p.rotVz = (Math.random() - 0.5) * 2;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = isTurbo ? 0.75 : 0.55;
      p.type = 'cloud';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnQuicksandBubble(pos: THREE.Vector3, count: number = 1): void {
    for (let i = 0; i < count; i++) {
      // Muddy viscous bubble colors (warm wet mud, murky olive/brown slime)
      const colorChoices = [0x5c381e, 0x4a2c14, 0x6e4324, 0x3d2410, 0x7c4f2b];
      const colorHex = colorChoices[Math.floor(Math.random() * colorChoices.length)];
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = 0.16 + Math.random() * 0.16; // Bubble diameter

      p.x = pos.x + (Math.random() - 0.5) * 0.75;
      p.y = pos.y + 0.02 + Math.random() * 0.05;
      p.z = pos.z + (Math.random() - 0.5) * 0.75;

      p.vx = (Math.random() - 0.5) * 0.04;
      p.vy = 0.08 + Math.random() * 0.14; // Slow buoyant swelling
      p.vz = (Math.random() - 0.5) * 0.04;

      p.rotX = (Math.random() - 0.5) * 0.5;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = (Math.random() - 0.5) * 0.5;
      p.rotVx = (Math.random() - 0.5) * 1.0;
      p.rotVy = (Math.random() - 0.5) * 1.0;
      p.rotVz = (Math.random() - 0.5) * 1.0;

      p.baseScale = scale;
      p.scale = scale * 0.3;
      p.life = 0;
      p.maxLife = 0.9 + Math.random() * 0.7; // 0.9s to 1.6s life cycle
      p.type = 'bubble';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public spawnQuicksandSplash(pos: THREE.Vector3, count: number = 4): void {
    for (let i = 0; i < count; i++) {
      const colorChoices = [0x4a2c14, 0x5c381e, 0x3d2410, 0x6e4324];
      const colorHex = colorChoices[Math.floor(Math.random() * colorChoices.length)];
      this.tempColor.setHex(colorHex);

      const p = this.acquireSlot();
      const scale = 0.12 + Math.random() * 0.14;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.8;

      p.x = pos.x + (Math.random() - 0.5) * 0.4;
      p.y = pos.y + 0.05 + Math.random() * 0.1;
      p.z = pos.z + (Math.random() - 0.5) * 0.4;

      p.vx = Math.cos(angle) * speed;
      p.vy = 0.8 + Math.random() * 1.2; // Squelch pop splash upwards
      p.vz = Math.sin(angle) * speed;

      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.rotVx = (Math.random() - 0.5) * 6;
      p.rotVy = (Math.random() - 0.5) * 6;
      p.rotVz = (Math.random() - 0.5) * 6;

      p.baseScale = scale;
      p.scale = scale;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.3;
      p.type = 'debris';

      this.instancedMesh.setColorAt(p.index, this.tempColor);
      this.needsColorUpdate = true;
    }
  }

  public update(dt: number): void {
    const delta = Math.min(dt, 0.05);
    const matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;

    for (let i = this.activeIndices.length - 1; i >= 0; i--) {
      const idx = this.activeIndices[i];
      const p = this.particles[idx];

      p.life += delta;

      if (p.life >= p.maxLife) {
        p.active = false;
        // Hide instance by setting scale to 0 off-screen in matrix array
        const offset = idx * 16;
        matrixArray[offset + 0] = 0; matrixArray[offset + 4] = 0; matrixArray[offset + 8] = 0; matrixArray[offset + 12] = 0;
        matrixArray[offset + 1] = 0; matrixArray[offset + 5] = 0; matrixArray[offset + 9] = 0; matrixArray[offset + 13] = -9999;
        matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0; matrixArray[offset + 10] = 0; matrixArray[offset + 14] = 0;
        matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0; matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;

        // O(1) swap-and-pop removal from active list
        const last = this.activeIndices.pop()!;
        if (i < this.activeIndices.length) {
          this.activeIndices[i] = last;
        }
        this.freeIndices.push(idx);
        continue;
      }

      const progress = p.life / p.maxLife;

      if (p.type === 'bubble') {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;

        p.rotX += p.rotVx * delta;
        p.rotY += p.rotVy * delta;
        p.rotZ += p.rotVz * delta;

        // Inflate over first 70% of life, then burst pop in final 30%
        let currentScale: number;
        if (progress < 0.70) {
          const inflate = Math.sin((progress / 0.70) * (Math.PI / 2));
          currentScale = p.baseScale * (0.3 + inflate * 0.9);
        } else {
          const popProgress = (progress - 0.70) / 0.30;
          currentScale = p.baseScale * (1.2 - popProgress * 1.2);
        }
        p.scale = Math.max(0, currentScale);
      } else if (p.type === 'cloud') {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;
        p.vx *= Math.pow(0.88, delta * 60);
        p.vy *= Math.pow(0.88, delta * 60);
        p.vz *= Math.pow(0.88, delta * 60);

        p.rotX += p.rotVx * delta;
        p.rotY += p.rotVy * delta;
        p.rotZ += p.rotVz * delta;

        // Fluffy expansion and cubic fade scale
        const currentScale = p.baseScale * (1.0 + progress * 0.8) * Math.max(0, 1.0 - progress * progress);
        p.scale = currentScale;
      } else if (p.type === 'smoke') {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;

        p.rotX += p.rotVx * delta;
        p.rotY += p.rotVy * delta;
        p.rotZ += p.rotVz * delta;

        // Rise and shrink
        const currentScale = p.baseScale * (1.0 + progress * 0.5) * Math.max(0, 1.0 - progress);
        p.scale = currentScale;
      } else if (p.type === 'ash') {
        p.vx += (Math.random() - 0.5) * 3.0 * delta;
        p.vz += (Math.random() - 0.5) * 3.0 * delta;
        p.vx = THREE.MathUtils.clamp(p.vx, -2, 2);
        p.vz = THREE.MathUtils.clamp(p.vz, -2, 2);

        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;

        p.rotX += p.rotVx * delta;
        p.rotY += p.rotVy * delta;
        p.rotZ += p.rotVz * delta;

        const fadeScale = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1.0 - progress) / 0.2 : 1.0;
        p.scale = p.baseScale * Math.max(0.01, fadeScale);
      } else {
        // Debris Physics: Gravity, tumbling, scaling down
        p.vy -= 16.0 * delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;

        p.rotX += p.rotVx * delta;
        p.rotY += p.rotVy * delta;
        p.rotZ += p.rotVz * delta;

        p.scale = p.baseScale * Math.max(0, 1.0 - progress);
      }

      // Fast direct Float32Array column-major matrix transform write (Zero Matrix4/compose GC overhead)
      this.dummyEuler.set(p.rotX, p.rotY, p.rotZ);
      this.dummyQuat.setFromEuler(this.dummyEuler);
      const qx = this.dummyQuat.x, qy = this.dummyQuat.y, qz = this.dummyQuat.z, qw = this.dummyQuat.w;
      const s = p.scale;
      const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
      const xx = qx * x2, xy = qx * y2, xz = qx * z2;
      const yy = qy * y2, yz = qy * z2, zz = qz * z2;
      const wx = qw * x2, wy = qw * y2, wz = qw * z2;

      const offset = idx * 16;
      matrixArray[offset + 0] = (1 - (yy + zz)) * s;
      matrixArray[offset + 1] = (xy + wz) * s;
      matrixArray[offset + 2] = (xz - wy) * s;
      matrixArray[offset + 3] = 0;

      matrixArray[offset + 4] = (xy - wz) * s;
      matrixArray[offset + 5] = (1 - (xx + zz)) * s;
      matrixArray[offset + 6] = (yz + wx) * s;
      matrixArray[offset + 7] = 0;

      matrixArray[offset + 8] = (xz + wy) * s;
      matrixArray[offset + 9] = (yz - wx) * s;
      matrixArray[offset + 10] = (1 - (xx + yy)) * s;
      matrixArray[offset + 11] = 0;

      matrixArray[offset + 12] = p.x;
      matrixArray[offset + 13] = p.y;
      matrixArray[offset + 14] = p.z;
      matrixArray[offset + 15] = 1;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.needsColorUpdate && this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
      this.needsColorUpdate = false;
    }
  }

  public dispose(): void {
    this.scene.remove(this.instancedMesh);
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.particles = [];
    this.activeIndices = [];
    this.freeIndices = [];
  }
}
