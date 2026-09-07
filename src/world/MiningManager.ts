import * as THREE from 'three';
import { BlockType } from '../textures/TextureGenerator';
import { VoxelWorld } from './VoxelWorld';
import { SoundManager } from '../audio/SoundManager';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { ItemManager } from '../items/ItemManager';
import { Chunk } from './Chunk';

import { TreeFellingManager, isLogBlock } from './TreeFellingManager';

export class MiningManager {
  private scene: THREE.Scene;
  private world: VoxelWorld;
  private sound: SoundManager;
  private particleManager: BlockParticleManager;
  private itemManager: ItemManager;
  private treeFellingManager: TreeFellingManager | null = null;

  // 3D crack mesh overlay
  private crackMesh: THREE.Mesh;
  private crackMaterials: THREE.MeshBasicMaterial[] = [];

  // 3D Physical Sub-Voxel Chipping Mesh (8 sub-voxels: 2x2x2)
  private chippingMesh: THREE.InstancedMesh;
  private chippingDummy: THREE.Object3D = new THREE.Object3D();

  private static readonly SUB_VOXEL_OFFSETS: Array<[number, number, number]> = [
    // Top 4 sub-voxels (+Y = +0.125)
    [0.25, 0.125, 0.25],
    [-0.25, 0.125, 0.25],
    [0.25, 0.125, -0.25],
    [-0.25, 0.125, -0.25],
    // Bottom 4 sub-voxels (-Y = -0.125)
    [0.25, -0.125, 0.25],
    [-0.25, -0.125, 0.25],
    [0.25, -0.125, -0.25],
    [-0.25, -0.125, -0.25],
  ];

  // Current mining state
  private currentTargetKey: string | null = null;
  private miningProgress: number = 0; // 0.0 to 1.0
  private hitTimer: number = 0;

  // 2D Crosshair Radial Progress Ring Elements
  private ringEl: HTMLElement | null = null;
  private ringFillEl: SVGCircleElement | null = null;
  private readonly RING_CIRCUMFERENCE = 106.814;

  // Block Hardness Values (bare-handed seconds required to break)
  private readonly blockHardness: Partial<Record<BlockType, number>> = {
    // Soft blocks (~0.3s)
    [BlockType.OAK_LEAVES]: 0.30,
    [BlockType.FROST_LEAVES]: 0.30,
    [BlockType.PALM_FRONDS]: 0.30,
    [BlockType.WITHERED_THORNS]: 0.30,
    [BlockType.JUNGLE_LEAVES]: 0.30,
    [BlockType.JUNGLE_VINES]: 0.20,
    [BlockType.MOSSVEIL_THORNED_UNDERGROWTH]: 0.25,
    [BlockType.FLOWER]: 0.20,
    [BlockType.FROST_BLOOM]: 0.20,
    [BlockType.CORRUPTION_BLOOM]: 0.20,
    [BlockType.DESERT_BLOOM]: 0.20,

    // Soil & Sand (~0.8s bare-handed)
    [BlockType.DIRT]: 0.80,
    [BlockType.GRASS]: 0.80,
    [BlockType.SAND]: 0.80,
    [BlockType.SNOW]: 0.40,
    [BlockType.PACKED_SNOW]: 0.70,
    [BlockType.ASHEN_SOIL]: 0.80,
    [BlockType.CINDER_SAND]: 0.80,
    [BlockType.CRACKED_CLAY]: 0.90,
    [BlockType.SCRUBGRASS]: 0.80,
    [BlockType.DESERT_SAND]: 0.80,

    // Wood & Planks (~2.5s bare-handed)
    [BlockType.OAK_LOG]: 2.50,
    [BlockType.OAK_LOG_X]: 2.50,
    [BlockType.OAK_LOG_Z]: 2.50,
    [BlockType.FROZEN_LOG]: 2.50,
    [BlockType.FROZEN_LOG_X]: 2.50,
    [BlockType.FROZEN_LOG_Z]: 2.50,
    [BlockType.PETRIFIED_LOG]: 2.50,
    [BlockType.PETRIFIED_LOG_X]: 2.50,
    [BlockType.PETRIFIED_LOG_Z]: 2.50,
    [BlockType.PETRIFIED_SUNWOOD]: 2.50,
    [BlockType.PETRIFIED_SUNWOOD_X]: 2.50,
    [BlockType.PETRIFIED_SUNWOOD_Z]: 2.50,
    [BlockType.PLANKS]: 2.00,
    [BlockType.FROZEN_PLANKS]: 2.00,
    [BlockType.RUINED_PLANKS]: 2.00,
    [BlockType.TEMPLE_PLANKS]: 2.00,

    // Stone (~4.0s bare-handed)
    [BlockType.STONE]: 4.00,
    [BlockType.FROST_STONE]: 4.00,
    [BlockType.NETHER_STONE]: 4.20,
    [BlockType.SUNSCORCHED_SANDSTONE]: 3.80,
    [BlockType.ICE]: 1.20,

    // Ores & Magic Ore (~5.5s bare-handed)
    [BlockType.COAL_ORE]: 4.50,
    [BlockType.IRON_ORE]: 5.00,
    [BlockType.GOLD_ORE]: 5.20,
    [BlockType.FROST_ORE]: 5.20,
    [BlockType.CORRUPTED_ORE]: 5.80,
    [BlockType.SUNSTONE_ORE]: 5.30,
    [BlockType.ASHEN_COPPER_ORE]: 4.50,
    [BlockType.ASHEN_SILVER_ORE]: 5.00,
    [BlockType.ASHEN_GOLD_ORE]: 5.20,
    [BlockType.ASHEN_ABYSSAL_PRIMORDIUM]: 7.00,
  };

  constructor(
    scene: THREE.Scene,
    world: VoxelWorld,
    sound: SoundManager,
    particleManager: BlockParticleManager,
    itemManager: ItemManager,
    treeFellingManager?: TreeFellingManager
  ) {
    this.scene = scene;
    this.world = world;
    this.sound = sound;
    this.particleManager = particleManager;
    this.itemManager = itemManager;
    if (treeFellingManager) this.treeFellingManager = treeFellingManager;

    // Generate 10 progressive crack textures & materials
    this.initCrackMaterials();

    // Create 3D crack overlay mesh box
    const geo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.crackMesh = new THREE.Mesh(geo, this.crackMaterials[0]);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // Create 3D Physical Sub-Voxel Chipping Mesh
    const subGeo = new THREE.BoxGeometry(0.49, 0.245, 0.49);
    const subMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: true,
    });
    this.chippingMesh = new THREE.InstancedMesh(subGeo, subMat, 8);
    this.chippingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chippingMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.chippingMesh.visible = false;
    this.scene.add(this.chippingMesh);
  }

  public setTreeFellingManager(mgr: TreeFellingManager): void {
    this.treeFellingManager = mgr;
  }

  private initCrackMaterials(): void {
    // 7 Jagged fracture branches radiating from impact center (32, 32)
    const numBranches = 7;
    const branchAngles = [0.25, 1.15, 2.05, 2.95, 3.85, 4.75, 5.65];

    // Generate jagged path nodes for each branch
    const branches: Array<Array<{ x: number; y: number }>> = [];

    for (let b = 0; b < numBranches; b++) {
      const angle = branchAngles[b];
      const nodes: Array<{ x: number; y: number }> = [{ x: 32, y: 32 }];

      let currX = 32;
      let currY = 32;
      const steps = 6;
      const stepLength = 5.2;

      for (let s = 1; s <= steps; s++) {
        // Jagged zig-zag offset
        const jitter = (Math.sin(b * 17 + s * 23) * 0.65 - 0.15);
        const currAngle = angle + jitter;
        currX += Math.cos(currAngle) * stepLength;
        currY += Math.sin(currAngle) * stepLength;
        nodes.push({ x: currX, y: currY });
      }
      branches.push(nodes);
    }

    // Secondary splinter micro-cracks
    const splinters: Array<{ fromBranch: number; fromNode: number; toX: number; toY: number }> = [
      { fromBranch: 0, fromNode: 2, toX: 44, toY: 18 },
      { fromBranch: 1, fromNode: 3, toX: 54, toY: 38 },
      { fromBranch: 2, fromNode: 2, toX: 38, toY: 56 },
      { fromBranch: 3, fromNode: 3, toX: 18, toY: 52 },
      { fromBranch: 4, fromNode: 2, toX: 10, toY: 36 },
      { fromBranch: 5, fromNode: 3, toX: 16, toY: 14 },
      { fromBranch: 6, fromNode: 2, toX: 28, toY: 8 },
    ];

    const totalStages = 10;
    for (let stage = 0; stage < totalStages; stage++) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, 64, 64);

      // Deep dark pixel-art crack stroke
      ctx.strokeStyle = '#050508';
      ctx.lineWidth = 1.8 + stage * 0.25;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';

      // How far along the nodes the crack extends in this stage (1 to 6 nodes)
      const maxNodeIndex = Math.min(6, Math.floor(1 + (stage / (totalStages - 1)) * 5));

      // Draw main jagged fracture lines
      for (let b = 0; b < numBranches; b++) {
        const nodes = branches[b];
        ctx.beginPath();
        ctx.moveTo(nodes[0].x, nodes[0].y);

        for (let n = 1; n <= maxNodeIndex; n++) {
          if (n < nodes.length) {
            ctx.lineTo(nodes[n].x, nodes[n].y);
          }
        }
        ctx.stroke();
      }

      // Draw secondary splinter cracks as stage advances
      if (stage >= 2) {
        const activeSplinters = Math.min(splinters.length, Math.floor((stage - 1) * 1.3));
        ctx.lineWidth = 1.2;
        for (let sp = 0; sp < activeSplinters; sp++) {
          const sInfo = splinters[sp];
          const startNode = branches[sInfo.fromBranch][sInfo.fromNode];
          if (startNode) {
            ctx.beginPath();
            ctx.moveTo(startNode.x, startNode.y);
            ctx.lineTo(sInfo.toX, sInfo.toY);
            ctx.stroke();
          }
        }
      }

      // Impact center pit
      ctx.fillStyle = '#050508';
      ctx.beginPath();
      ctx.arc(32, 32, 1.2 + stage * 0.35, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;

      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });

      this.crackMaterials.push(mat);
    }
  }

  public update(
    dt: number,
    isLeftMouseDown: boolean,
    targetedBlockInfo: { blockPos: THREE.Vector3; placePos: THREE.Vector3; type: BlockType } | null,
    cameraDir?: THREE.Vector3,
    playerPos?: THREE.Vector3,
    heldItemType?: BlockType | null
  ): void {
    if (!isLeftMouseDown || !targetedBlockInfo) {
      this.resetMining();
      return;
    }

    const { blockPos, type } = targetedBlockInfo;

    // Unbreakable bedrock, liquids, or molten magma
    if (type === BlockType.AIR || type === BlockType.WATER || type === BlockType.OASIS_WATER || type === BlockType.JUNGLE_WATER || type === BlockType.MOLTEN_CORRUPTION || type === BlockType.BEDROCK) {
      this.resetMining();
      return;
    }

    const key = `${blockPos.x},${blockPos.y},${blockPos.z}`;

    // Target block switched — reset progress
    if (this.currentTargetKey !== key) {
      this.currentTargetKey = key;
      this.miningProgress = 0;
      this.hitTimer = 0;
      this.lastFractureStep = 0;
    }

    // Get hardness duration & apply tool harvest speed multipliers
    const baseHardness = this.blockHardness[type] || 0.8;
    let toolMultiplier = 1.0;

    if (heldItemType === BlockType.FLIMSY_PICKAXE && this.isPickaxeEffective(type)) {
      toolMultiplier = 2.8; // 2.8x faster rock and ore mining
    } else if (heldItemType === BlockType.FLIMSY_AXE && this.isAxeEffective(type)) {
      toolMultiplier = 2.8; // 2.8x faster tree and timber chopping
    }

    this.miningProgress += (dt * toolMultiplier) / baseHardness;
    this.hitTimer += dt * toolMultiplier;

    // Periodic mining hit feedback (hit particles + hit sound)
    if (this.hitTimer >= 0.16) {
      this.hitTimer = 0;
      this.particleManager.spawnBlockDebris(type, blockPos.clone(), 3);
      this.sound.playBlockHit();
    }

    // Progressive Micro-Chunk Fracturing at 25%, 50%, and 75% milestones
    const currentStep = Math.floor(this.miningProgress * 4);
    if (currentStep > this.lastFractureStep && currentStep < 4) {
      this.lastFractureStep = currentStep;
      // Dislodge physical micro-voxel chunks
      this.particleManager.spawnBlockDebris(type, blockPos.clone(), 8);
      this.sound.playBlockHit();
    }

    // Update 3D Physical Sub-Voxel Chipping Crater Mesh
    this.updateChippingMesh(blockPos, type, this.miningProgress);

    // Update 3D crack mesh overlay position and stage material
    const maxStages = this.crackMaterials.length;
    const stage = Math.min(maxStages - 1, Math.floor(this.miningProgress * maxStages));
    this.crackMesh.material = this.crackMaterials[stage];
    this.crackMesh.position.set(blockPos.x + 0.5, blockPos.y * 0.5 + 0.25, blockPos.z + 0.5);
    this.crackMesh.visible = true;

    // Update 2D Crosshair Radial Progress Ring
    this.updateCrosshairRing(this.miningProgress);

    // Block Broken! (Shatters into full physical 3D microvoxels)
    if (this.miningProgress >= 1.0) {
      this.breakBlock(blockPos, type, cameraDir, playerPos);
      this.resetMining();
    }
  }

  private updateChippingMesh(blockPos: THREE.Vector3, type: BlockType, progress: number): void {
    const center = new THREE.Vector3(blockPos.x + 0.5, blockPos.y * 0.5 + 0.25, blockPos.z + 0.5);

    // Number of remaining sub-voxels based on progress:
    // 0.00 .. 0.25 -> 8 sub-voxels (100% volume)
    // 0.25 .. 0.50 -> 6 sub-voxels (75% volume)
    // 0.50 .. 0.75 -> 4 sub-voxels (50% volume)
    // 0.75 .. 0.99 -> 2 sub-voxels (25% volume)
    let activeCount = 8;
    if (progress >= 0.75) activeCount = 2;
    else if (progress >= 0.50) activeCount = 4;
    else if (progress >= 0.25) activeCount = 6;

    const hex = this.getBlockPrimaryColor(type);
    const color = new THREE.Color(hex);

    for (let i = 0; i < 8; i++) {
      if (i < activeCount) {
        const off = MiningManager.SUB_VOXEL_OFFSETS[i];
        const shake = progress > 0.1 ? (Math.sin(Date.now() * 0.04 + i) * 0.008) : 0;
        this.chippingDummy.position.set(
          center.x + off[0] + shake,
          center.y + off[1],
          center.z + off[2] + shake
        );
        this.chippingDummy.scale.set(1, 1, 1);
        this.chippingDummy.updateMatrix();
        this.chippingMesh.setMatrixAt(i, this.chippingDummy.matrix);
        const tone = 0.85 + (i % 2) * 0.15;
        this.chippingMesh.setColorAt(i, new THREE.Color(color.r * tone, color.g * tone, color.b * tone));
      } else {
        this.chippingDummy.scale.set(0, 0, 0);
        this.chippingDummy.updateMatrix();
        this.chippingMesh.setMatrixAt(i, this.chippingDummy.matrix);
      }
    }

    this.chippingMesh.instanceMatrix.needsUpdate = true;
    if (this.chippingMesh.instanceColor) this.chippingMesh.instanceColor.needsUpdate = true;
    this.chippingMesh.visible = true;
  }

  private getBlockPrimaryColor(type: BlockType): number {
    switch (type) {
      case BlockType.GRASS: return 0x22c55e;
      case BlockType.DIRT: return 0x78350f;
      case BlockType.STONE: return 0x64748b;
      case BlockType.SAND: return 0xfacc15;
      case BlockType.SNOW: return 0xf8fafc;
      case BlockType.ICE: return 0x38bdf8;
      case BlockType.OAK_LOG: return 0x854d0e;
      case BlockType.OAK_LEAVES: return 0x15803d;
      case BlockType.COAL_ORE: return 0x334155;
      case BlockType.IRON_ORE: return 0xd97706;
      case BlockType.GOLD_ORE: return 0xf59e0b;
      case BlockType.DIAMOND_ORE: return 0x06b6d4;
      case BlockType.FROST_STONE: return 0x94a3b8;
      case BlockType.ASHEN_SOIL: return 0x1f2937;
      case BlockType.NETHER_STONE: return 0x7f1d1d;
      case BlockType.MOSSVEIL_MUD: return 0x3f2e1e;
      case BlockType.JUNGLE_LOG: return 0x451a03;
      case BlockType.JUNGLE_LEAVES: return 0x16a34a;
      default: return 0x64748b;
    }
  }

  private lastFractureStep: number = 0;

  private breakBlock(
    pos: THREE.Vector3,
    type: BlockType,
    cameraDir?: THREE.Vector3,
    playerPos?: THREE.Vector3
  ): void {
    // If block is a log, check if it triggers dynamic tree felling!
    if (isLogBlock(type) && this.treeFellingManager && cameraDir && playerPos) {
      const felled = this.treeFellingManager.tryFellTree(pos, cameraDir, playerPos);
      if (felled) {
        return; // Tree fell dynamically! Skip single block breaking.
      }
    }

    this.world.setBlock(pos.x, pos.y, pos.z, BlockType.AIR);

    this.itemManager.spawnPickup(type, new THREE.Vector3(pos.x + 0.5, pos.y * 0.5 + 0.25, pos.z + 0.5));
    this.particleManager.spawnMicrovoxelShatter(type, pos.clone());
    this.sound.playBlockBreak();
  }

  public resetMining(): void {
    this.currentTargetKey = null;
    this.miningProgress = 0;
    this.hitTimer = 0;
    this.lastFractureStep = 0;
    this.hitTimer = 0;
    this.crackMesh.visible = false;
    this.chippingMesh.visible = false;
    this.updateCrosshairRing(0);
  }

  public getMiningProgress(): number {
    return this.miningProgress;
  }

  private updateCrosshairRing(progress: number): void {
    if (!this.ringEl) {
      this.ringEl = document.getElementById('crosshair-radial-ring');
    }
    if (!this.ringFillEl) {
      this.ringFillEl = document.getElementById('crosshair-ring-fill') as unknown as SVGCircleElement;
    }

    if (!this.ringEl || !this.ringFillEl) return;

    if (progress <= 0.001) {
      this.ringEl.classList.add('hidden');
      this.ringFillEl.style.transition = 'none';
      this.ringFillEl.style.strokeDashoffset = `${this.RING_CIRCUMFERENCE}`;
      this.ringFillEl.classList.remove('near-break');
    } else {
      this.ringEl.classList.remove('hidden');
      this.ringFillEl.style.transition = '';
      const clamped = Math.min(1.0, Math.max(0.0, progress));
      const offset = this.RING_CIRCUMFERENCE * (1.0 - clamped);
      this.ringFillEl.style.strokeDashoffset = `${offset}`;

      if (clamped >= 0.8) {
        this.ringFillEl.classList.add('near-break');
      } else {
        this.ringFillEl.classList.remove('near-break');
      }
    }
  }

  public isPickaxeEffective(type: BlockType): boolean {
    return (
      type === BlockType.STONE ||
      type === BlockType.COBBLESTONE ||
      type === BlockType.BRICK ||
      type === BlockType.FROST_STONE ||
      type === BlockType.NETHER_STONE ||
      type === BlockType.SUNSCORCHED_SANDSTONE ||
      type === BlockType.MOSSVEIL_MOSSY_STONE ||
      type === BlockType.ICE ||
      type === BlockType.COAL_ORE ||
      type === BlockType.IRON_ORE ||
      type === BlockType.GOLD_ORE ||
      type === BlockType.DIAMOND_ORE ||
      type === BlockType.FROST_ORE ||
      type === BlockType.CORRUPTED_ORE ||
      type === BlockType.SUNSTONE_ORE ||
      type === BlockType.ASHEN_COPPER_ORE ||
      type === BlockType.ASHEN_SILVER_ORE ||
      type === BlockType.ASHEN_GOLD_ORE ||
      type === BlockType.ASHEN_ABYSSAL_PRIMORDIUM
    );
  }

  public isAxeEffective(type: BlockType): boolean {
    return (
      isLogBlock(type) ||
      type === BlockType.PLANKS ||
      type === BlockType.FROZEN_PLANKS ||
      type === BlockType.RUINED_PLANKS ||
      type === BlockType.TEMPLE_PLANKS ||
      type === BlockType.JUNGLE_PLANKS ||
      type === BlockType.WORKBENCH ||
      type === BlockType.SMITHING_FORGE ||
      type === BlockType.ARMOR_STATION
    );
  }
}

