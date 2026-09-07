import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';
import { VoxelWorld } from './VoxelWorld';
import { Chunk } from './Chunk';
import { ItemManager } from '../items/ItemManager';
import { UIManager } from '../ui/UIManager';
import { SoundManager } from '../audio/SoundManager';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { disposeHierarchy } from '../utils/DisposeUtils';

export interface GroundResourceNode {
  type: BlockType;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  chunkKey: string;
  chunkX: number;
  chunkZ: number;
  collected: boolean;
  respawnTimer: number;
}

export class GroundResourceManager {
  private scene: THREE.Scene;
  private world: VoxelWorld;
  private itemManager: ItemManager;
  private ui: UIManager;
  private sound: SoundManager;
  private particleManager: BlockParticleManager;

  // O(1) Spatial Hash Grid: Chunk Key -> List of Resource Nodes
  private chunkNodes: Map<string, GroundResourceNode[]> = new Map();
  private populatedChunks: Set<string> = new Set();
  private scanTimer: number = 0;
  public onPickup?: () => void;

  constructor(
    scene: THREE.Scene,
    world: VoxelWorld,
    itemManager: ItemManager,
    ui: UIManager,
    sound: SoundManager,
    particleManager: BlockParticleManager
  ) {
    this.scene = scene;
    this.world = world;
    this.itemManager = itemManager;
    this.ui = ui;
    this.sound = sound;
    this.particleManager = particleManager;
  }

  private isLiquidWater(b: BlockType): boolean {
    return b === BlockType.WATER || b === BlockType.OASIS_WATER || b === BlockType.JUNGLE_WATER;
  }

  private isNonSolidLiquidOrIce(b: BlockType): boolean {
    return (
      b === BlockType.WATER ||
      b === BlockType.OASIS_WATER ||
      b === BlockType.JUNGLE_WATER ||
      b === BlockType.ICE ||
      b === BlockType.MOLTEN_CORRUPTION
    );
  }

  private isNearTree(wx: number, wz: number): boolean {
    return this.world.isNearTree(wx, wz, 4.5);
  }

  public populateChunk(chunkX: number, chunkZ: number): void {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (this.populatedChunks.has(chunkKey)) return;
    this.populatedChunks.add(chunkKey);

    const chunk = this.world.getChunk(chunkX, chunkZ);
    if (!chunk) return;

    const startX = chunkX * 16;
    const startZ = chunkZ * 16;

    // ─── PASS 1: DEDICATED SHORELINE & RIVERBANK REED PASS (O(1) from POI Cache) ───
    let reedsSpawned = 0;
    const maxReedsInChunk = 4;

    if (chunk.poi.shorelines.length > 0) {
      const step = Math.max(1, Math.floor(chunk.poi.shorelines.length / maxReedsInChunk));
      for (let i = 0; i < chunk.poi.shorelines.length && reedsSpawned < maxReedsInChunk; i += step) {
        const shore = chunk.poi.shorelines[i];
        const above1 = this.world.getBlock(shore.x, shore.y + 1, shore.z);
        const above2 = this.world.getBlock(shore.x, shore.y + 2, shore.z);
        if (above1 === BlockType.AIR && above2 === BlockType.AIR) {
          const groundY = (shore.y + 1) * 0.5;
          const pos = new THREE.Vector3(shore.x + 0.5, groundY, shore.z + 0.5);
          this.spawnNode(BlockType.REEDS, pos, chunkX, chunkZ, chunkKey);
          reedsSpawned++;
        }
      }
    }

    // ─── PASS 2: TERRESTRIAL GROUND FORAGING & DROPS PASS ───
    const maxItemsInChunk = 4;
    let itemsSpawned = 0;

    const sampleOffsets = [
      { x: 2, z: 3 },
      { x: 11, z: 4 },
      { x: 7, z: 9 },
      { x: 13, z: 12 },
      { x: 4, z: 13 },
      { x: 9, z: 6 },
      { x: 14, z: 2 },
      { x: 2, z: 14 },
      { x: 6, z: 2 },
      { x: 12, z: 8 },
    ];

    for (const offset of sampleOffsets) {
      if (itemsSpawned >= maxItemsInChunk) break;

      const wx = startX + offset.x;
      const wz = startZ + offset.z;

      // Instant O(1) surface height from chunk height map
      const gy = chunk.getHeight(offset.x, offset.z);
      if (gy < 4 || gy >= Chunk.HEIGHT - 2) continue;

      const block = this.world.getBlock(wx, gy, wz);
      const above1 = this.world.getBlock(wx, gy + 1, wz);
      const above2 = this.world.getBlock(wx, gy + 2, wz);

      // Never spawn on Air, Water, Magma, Quicksand, or Ice
      if (
        block !== BlockType.AIR &&
        block !== BlockType.MUDDY_QUICKSAND &&
        !this.isNonSolidLiquidOrIce(block)
      ) {
        if (above1 === BlockType.AIR && above2 === BlockType.AIR) {
          const groundY = (gy + 1) * 0.5;
          const pos = new THREE.Vector3(wx + 0.5, groundY, wz + 0.5);

          // Hash deterministic random
          const hash = Math.abs((wx * 73856093 ^ wz * 19349663 ^ chunkX * 83492791) % 10000) / 10000;

          // 1. APPLES: Under / near canopy trees & oak trees (Instant O(1) 2D distance lookup from POI Tree Cache)
          if (this.isNearTree(wx, wz)) {
            if (hash < 0.22) {
              this.spawnNode(BlockType.APPLES, pos, chunkX, chunkZ, chunkKey);
              itemsSpawned++;
              continue;
            }
          }

          // 2. General Ground Pickups (Fallen Branches, Loose Stones, Flint)
          if (hash < 0.32) {
            this.spawnNode(BlockType.BRANCHES, pos, chunkX, chunkZ, chunkKey);
            itemsSpawned++;
          } else if (hash >= 0.32 && hash < 0.54) {
            this.spawnNode(BlockType.STONE_PEBBLE, pos, chunkX, chunkZ, chunkKey);
            itemsSpawned++;
          } else if (hash >= 0.54 && hash < 0.72) {
            this.spawnNode(BlockType.FLINT, pos, chunkX, chunkZ, chunkKey);
            itemsSpawned++;
          } else if (wx < -160 && hash >= 0.72 && hash < 0.85) {
            // Ashen Emberpod exclusively in Ashen Ruins
            this.spawnNode(BlockType.ASHEN_EMBERPOD, pos, chunkX, chunkZ, chunkKey);
            itemsSpawned++;
          } else {
            // 3. WILD CARROTS: Found in Emerald Grove & fertile soils
            const isNonFrostCoord = wz >= -150;
            const isNonDesertCoord = wz <= 35;
            const isNonRuinsCoord = wx >= -150;
            const isFertileSoil =
              block === BlockType.GRASS ||
              block === BlockType.DIRT ||
              block === BlockType.RAINFOREST_GRASS;

            if (
              isNonFrostCoord &&
              isNonDesertCoord &&
              isNonRuinsCoord &&
              isFertileSoil &&
              hash >= 0.85 &&
              hash < 0.96
            ) {
              this.spawnNode(BlockType.CARROT, pos, chunkX, chunkZ, chunkKey);
              itemsSpawned++;
            }
          }
        }
      }
    }
  }

  private spawnNode(
    type: BlockType,
    pos: THREE.Vector3,
    chunkX: number,
    chunkZ: number,
    chunkKey: string
  ): void {
    let mesh: THREE.Object3D;
    const template = this.itemManager.glbTemplates.get(type);

    if (template) {
      mesh = template.clone(true);
    } else {
      const geo = this.itemManager.getMiniBlockGeometry(type);
      mesh = new THREE.Mesh(geo, (this.itemManager as any).material);
    }

    // Firmly grounded on terrain surface with static natural yaw rotation
    mesh.position.copy(pos);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.scene.add(mesh);

    const node: GroundResourceNode = {
      type,
      position: pos.clone(),
      mesh,
      chunkKey,
      chunkX,
      chunkZ,
      collected: false,
      respawnTimer: 0,
    };

    let bucket = this.chunkNodes.get(chunkKey);
    if (!bucket) {
      bucket = [];
      this.chunkNodes.set(chunkKey, bucket);
    }
    bucket.push(node);
  }

  public isHarvestableType(type: BlockType): boolean {
    return (
      type === BlockType.REEDS ||
      type === BlockType.CORRUPTION_BLOOM ||
      type === BlockType.DESERT_BLOOM ||
      type === BlockType.FROST_BLOOM ||
      type === BlockType.WITHERED_THORNS ||
      type === BlockType.PALM_FRONDS ||
      type === BlockType.OAK_LEAVES ||
      type === BlockType.FROST_LEAVES
    );
  }

  /**
   * O(1) Spatial Hash Query for Interactable Nodes around the Player.
   * Only iterates over the 9 immediate neighboring chunk buckets (max ~25-36 nodes)
   * with zero runtime Vector allocations.
   */
  public getInteractableNode(
    playerPos: THREE.Vector3,
    lookDir?: THREE.Vector3
  ): { node: GroundResourceNode; isHarvest: boolean; prompt: string } | null {
    const centerCx = Math.floor(playerPos.x / 16);
    const centerCz = Math.floor(playerPos.z / 16);
    const maxInteractRadiusSq = 3.2 * 3.2; // 3.2m interactive radius (10.24m²)

    let bestNode: GroundResourceNode | null = null;
    let bestScore = -Infinity;

    const hasLookDir = !!lookDir && (lookDir.x !== 0 || lookDir.y !== 0 || lookDir.z !== 0);

    for (let cx = centerCx - 1; cx <= centerCx + 1; cx++) {
      for (let cz = centerCz - 1; cz <= centerCz + 1; cz++) {
        const key = `${cx},${cz}`;
        const nodes = this.chunkNodes.get(key);
        if (!nodes || nodes.length === 0) continue;

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node.collected || !node.mesh.visible) continue;

          const dx = node.position.x - playerPos.x;
          const dy = node.position.y - playerPos.y;
          const dz = node.position.z - playerPos.z;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq > maxInteractRadiusSq) continue;

          const dist = Math.sqrt(distSq);
          let score = 10.0 - dist;

          if (hasLookDir) {
            const invDist = 1.0 / Math.max(0.0001, dist);
            const dot = (dx * lookDir.x + dy * lookDir.y + dz * lookDir.z) * invDist;
            score += dot * 6.0;
          }

          if (score > bestScore) {
            bestScore = score;
            bestNode = node;
          }
        }
      }
    }

    if (!bestNode) return null;

    const isHarvest = this.isHarvestableType(bestNode.type);
    const defName = BLOCK_DEFINITIONS[bestNode.type]?.name || 'Resource';
    const prompt = isHarvest ? `Harvest ${defName}` : `Pick Up ${defName}`;

    return {
      node: bestNode,
      isHarvest,
      prompt,
    };
  }

  public collectNode(node: GroundResourceNode): { isHarvest: boolean; name: string; count: number } {
    node.collected = true;
    node.mesh.visible = false;
    node.respawnTimer = 120.0; // 120s regrowth / respawn

    const count = node.type === BlockType.REEDS ? (1 + (Math.random() < 0.5 ? 1 : 0)) : 1;
    this.ui.addResourceToHotbar(node.type, count);

    try {
      this.sound.playPop();
      this.particleManager.spawnBlockDebris(node.type, node.position, 2);
    } catch (e) {}

    const defName = BLOCK_DEFINITIONS[node.type]?.name || 'Resource';
    this.ui.showNotification(`+${count} ${defName}`);

    if (this.onPickup) {
      this.onPickup();
    }

    const isHarvest = this.isHarvestableType(node.type);
    return {
      isHarvest,
      name: defName,
      count,
    };
  }

  public update(dt: number, playerPos: THREE.Vector3): void {
    const centerChunkX = Math.floor(playerPos.x / 16);
    const centerChunkZ = Math.floor(playerPos.z / 16);

    // 1. Periodic Chunk Population Check (every 1.0s)
    this.scanTimer += dt;
    if (this.scanTimer >= 1.0) {
      this.scanTimer = 0;
      const radius = 3;

      for (let cx = centerChunkX - radius; cx <= centerChunkX + radius; cx++) {
        for (let cz = centerChunkZ - radius; cz <= centerChunkZ + radius; cz++) {
          this.populateChunk(cx, cz);
        }
      }
    }

    // 2. Spatial Distance Culling & Respawn Updates across active chunks
    const cullRadius = 4;
    for (const [key, nodes] of this.chunkNodes.entries()) {
      if (nodes.length === 0) continue;
      const sample = nodes[0];
      const distCx = Math.abs(sample.chunkX - centerChunkX);
      const distCz = Math.abs(sample.chunkZ - centerChunkZ);
      const isNearby = distCx <= cullRadius && distCz <= cullRadius;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (node.collected) {
          node.respawnTimer -= dt;
          if (node.respawnTimer <= 0) {
            node.collected = false;
            node.mesh.visible = isNearby;
          }
          continue;
        }

        // Distance cull far chunks to save WebGL draw call and culling overhead
        node.mesh.visible = isNearby;
      }
    }
  }

  public clearAll(): void {
    for (const nodes of this.chunkNodes.values()) {
      for (const node of nodes) {
        disposeHierarchy(node.mesh);
        this.scene.remove(node.mesh);
      }
    }
    this.chunkNodes.clear();
    this.populatedChunks.clear();
  }

  public dispose(): void {
    this.clearAll();
  }
}
