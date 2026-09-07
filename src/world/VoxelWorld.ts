import * as THREE from 'three';
import { Chunk, TreePOI, ShorelinePOI, ChunkPOIMetadata } from './Chunk';
import { TerrainNoise } from './Noise';
import { BlockType, BLOCK_DEFINITIONS, TextureGenerator } from '../textures/TextureGenerator';
import { TextureAtlasManager } from '../textures/TextureAtlasManager';
import { BlockModelManager } from './BlockModelManager';
import { ModelCache } from '../utils/ModelCache';

export interface FluidFlowTask {
  x: number;
  y: number;
  z: number;
  fallX: number;
  fallZ: number;
  horizDist: number;
  liquidType: BlockType;
}

export class VoxelWorld {
  public scene: THREE.Scene;
  public noise: TerrainNoise;
  public seed: number = 1337;
  public chunks: Map<string, Chunk> = new Map();
  public atlasTexture: THREE.CanvasTexture;
  public emissiveAtlasTexture: THREE.CanvasTexture;
  public renderDistance: number = 2; // Default to 25 active chunks
  public leafOpacity: number = 0.88;
  public blockModelManager: BlockModelManager;
  public userEdits: Map<string, BlockType> = new Map();
  public customBlockMeshes: Map<string, THREE.Object3D> = new Map();
  public customBlockRotations: Map<string, number> = new Map();
  public frameCounter: number = 0;

  // Zero-allocation static scratch vectors for line-of-sight raycasting
  private static readonly SCRATCH_LOS_ORIGIN = new THREE.Vector3();
  private static readonly SCRATCH_LOS_TARGET = new THREE.Vector3();
  private static readonly SCRATCH_LOS_DIR = new THREE.Vector3();

  private worldGroup: THREE.Group;
  private transparentGroup: THREE.Group;
  private oreLightPool: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, seed: number = 1337) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new TerrainNoise(seed);

    this.worldGroup = new THREE.Group();
    this.transparentGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.scene.add(this.transparentGroup);

    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight(0xff4500, 0, 6, 2.0);
      light.visible = false;
      this.worldGroup.add(light);
      this.oreLightPool.push(light);
    }

    const atlases = TextureAtlasManager.getGlobalAtlas();
    this.atlasTexture = atlases.diffuse;
    this.emissiveAtlasTexture = atlases.emissive;
    
    this.blockModelManager = new BlockModelManager();

    this.blockModelManager.onReady(() => {
      this.markAllChunksDirty();
    });
  }

  public resetWorld(seed: number): void {
    this.seed = seed;
    for (const [key, chunk] of this.chunks.entries()) {
      if (chunk.mesh) {
        this.worldGroup.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
      }
      if (chunk.transparentMesh) {
        this.transparentGroup.remove(chunk.transparentMesh);
        chunk.transparentMesh.geometry.dispose();
      }
      if (chunk.emissiveMesh) {
        this.worldGroup.remove(chunk.emissiveMesh);
        chunk.emissiveMesh.geometry.dispose();
      }
      for (const instMesh of chunk.instancedMeshes) {
        this.worldGroup.remove(instMesh);
        instMesh.dispose();
      }
    }
    for (const [, mesh] of this.customBlockMeshes.entries()) {
      this.worldGroup.remove(mesh);
    }
    this.customBlockMeshes.clear();
    this.customBlockRotations.clear();
    this.chunks.clear();
    this.userEdits.clear();
    this.fluidQueue = [];
    this.fluidQueueHead = 0;
    this.fluidVisited.clear();
    this.markAllChunksDirty();

    this.noise = new TerrainNoise(seed);
  }

  public async initialGeneration(
    centerChunkX: number,
    centerChunkZ: number,
    radius: number,
    onProgress: (loaded: number, total: number, msg: string) => void
  ): Promise<void> {
    const totalChunks = (radius * 2 + 1) ** 2;
    let chunksGenerated = 0;

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const cx = centerChunkX + x;
        const cz = centerChunkZ + z;
        const chunk = new Chunk(cx, cz);
        await chunk.generateTerrainAsync(this.noise);
        this.chunks.set(this.getChunkKey(cx, cz), chunk);
        chunksGenerated++;
        onProgress(chunksGenerated, totalChunks, `GENERATING BASE TERRAIN (${chunksGenerated} / ${totalChunks})...`);
        await new Promise<void>((resolve) => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
    }

    chunksGenerated = 0;
    const getNeighbor = (wx: number, wy: number, wz: number) => this.getBlock(wx, wy, wz);

    onProgress(0, totalChunks, `INITIALIZING BIOME WATERFALLS & LIQUID PASSES...`);
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const cx = centerChunkX + x;
        const cz = centerChunkZ + z;
        this.runFluidPassForChunk(cx, cz);
      }
    }

    // Drain initial fluid physics with cooperative 15ms frame yielding to prevent loading UI freezes
    onProgress(0, totalChunks, `SETTLING INITIAL BIOME WATERFALLS & FLUID PHYSICS...`);
    await this.drainFluidQueueAsync(15);

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const cx = centerChunkX + x;
        const cz = centerChunkZ + z;
        const chunk = this.getChunk(cx, cz)!;
        const initialLod = Math.max(Math.abs(x), Math.abs(z)) > 2 ? 1 : 0;
        this.rebuildChunkMesh(chunk, getNeighbor, initialLod);
        
        chunksGenerated++;
        onProgress(
          chunksGenerated,
          totalChunks,
          `BUILDING WORLD MESHES (${chunksGenerated} / ${totalChunks})...`
        );
        await new Promise<void>((resolve) => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
    }
  }

  public setLeafOpacity(opacity: number): void {
    if (this.leafOpacity === opacity) return;
    this.leafOpacity = opacity;
    if (this.blockModelManager) {
      this.blockModelManager.setLeafOpacity(opacity);
    }
  }

  public async preloadAllAssetsAsync(
    playerX: number,
    playerZ: number,
    radius: number,
    onProgress: (percent: number, statusText: string) => void
  ): Promise<void> {
    onProgress(5, 'LOADING CUSTOM TEXTURES & ATLAS...');
    await TextureGenerator.loadExternalTextures();
    this.refreshAtlas();
    onProgress(15, 'TEXTURE ATLAS SYNTHESIZED.');

    onProgress(20, 'LOADING 3D GLB BLOCK MODELS...');
    this.blockModelManager.onProgress((p) => {
      const glbPercent = 20 + Math.round((p.loaded / p.total) * 40);
      onProgress(glbPercent, `PARSING 3D MESH: ${p.currentName.toUpperCase()} (${p.loaded}/${p.total})`);
    });
    await this.blockModelManager.waitUntilReady();
    onProgress(60, 'ALL 3D GLB BLOCK MODELS CACHED.');

    await this.preloadSpawnChunksAsync(playerX, playerZ, radius, (loaded, total, statusText) => {
      const chunkPercent = 60 + Math.round((loaded / total) * 40);
      onProgress(chunkPercent, statusText);
    });

    onProgress(100, 'WORLD READY!');
  }

  public async preloadSpawnChunksAsync(
    playerX: number,
    playerZ: number,
    radius: number,
    onProgress: (loaded: number, total: number, statusText: string) => void
  ): Promise<void> {
    const centerChunkX = Math.floor(playerX / Chunk.SIZE);
    const centerChunkZ = Math.floor(playerZ / Chunk.SIZE);

    const keysToLoad: Array<{ x: number; z: number }> = [];
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        keysToLoad.push({ x: centerChunkX + x, z: centerChunkZ + z });
      }
    }

    const total = keysToLoad.length;
    let loaded = 0;

    const getNeighbor = (wx: number, wy: number, wz: number) => this.getBlock(wx, wy, wz);

    for (let i = 0; i < keysToLoad.length; i++) {
      const { x, z } = keysToLoad[i];
      let chunk = this.getChunk(x, z);
      if (!chunk) {
        chunk = new Chunk(x, z);
        await chunk.generateTerrainAsync(this.noise);
        this.chunks.set(this.getChunkKey(x, z), chunk);
        this.runFluidPassForChunk(x, z);
      }

      if (chunk.isDirty) {
        const targetLod = Math.max(Math.abs(x - centerChunkX), Math.abs(z - centerChunkZ)) > 2 ? 1 : 0;
        this.rebuildChunkMesh(chunk, getNeighbor, targetLod);
      }
      loaded++;
      onProgress(
        loaded,
        total,
        `GENERATING EXTENDED EXPLORATION REGION (${loaded} / ${total} CHUNKS)...`
      );
      // Yield to browser event loop via requestAnimationFrame for buttery smooth UI rendering
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  public async extendGenerationAsync(
    centerChunkX: number,
    centerChunkZ: number,
    radius: number,
    onProgress: (loaded: number, total: number, msg: string) => void
  ): Promise<void> {

    const keysToLoad: Array<{ x: number; z: number }> = [];
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        keysToLoad.push({ x: centerChunkX + x, z: centerChunkZ + z });
      }
    }

    const total = keysToLoad.length;
    let loaded = 0;

    const getNeighbor = (wx: number, wy: number, wz: number) => this.getBlock(wx, wy, wz);

    for (let i = 0; i < keysToLoad.length; i++) {
      const { x, z } = keysToLoad[i];
      let chunk = this.getChunk(x, z);
      if (!chunk) {
        chunk = new Chunk(x, z);
        await chunk.generateTerrainAsync(this.noise);
        this.chunks.set(this.getChunkKey(x, z), chunk);
        this.runFluidPassForChunk(x, z);
      }

      if (chunk.isDirty) {
        const targetLod = Math.max(Math.abs(x - centerChunkX), Math.abs(z - centerChunkZ)) > 2 ? 1 : 0;
        this.rebuildChunkMesh(chunk, getNeighbor, targetLod);
      }
      loaded++;
      onProgress(
        loaded,
        total,
        `GENERATING EXTENDED EXPLORATION REGION (${loaded} / ${total} CHUNKS)...`
      );
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  public markAllChunksDirty(): void {
    for (const chunk of this.chunks.values()) {
      chunk.isDirty = true;
    }
  }

  public refreshAtlas(): void {
    const atlases = TextureAtlasManager.reloadGlobalAtlas();
    this.atlasTexture = atlases.diffuse;
    this.emissiveAtlasTexture = atlases.emissive;
    this.markAllChunksDirty();
  }

  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  public getChunk(chunkX: number, chunkZ: number): Chunk | undefined {
    return this.chunks.get(this.getChunkKey(chunkX, chunkZ));
  }

  public getChunkPOI(chunkX: number, chunkZ: number): ChunkPOIMetadata | undefined {
    return this.getChunk(chunkX, chunkZ)?.poi;
  }

  /**
   * Fast O(1) check across chunk boundaries for nearby Tree POIs
   */
  public isNearTree(wx: number, wz: number, radius: number = 4.5): boolean {
    const minCX = Math.floor((wx - radius) / Chunk.SIZE);
    const maxCX = Math.floor((wx + radius) / Chunk.SIZE);
    const minCZ = Math.floor((wz - radius) / Chunk.SIZE);
    const maxCZ = Math.floor((wz + radius) / Chunk.SIZE);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const chunk = this.getChunk(cx, cz);
        if (chunk && chunk.isNearTree(wx, wz, radius)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns all Tree POIs within radius of (wx, wz)
   */
  public getNearbyTrees(wx: number, wz: number, radius: number = 16.0): TreePOI[] {
    const minCX = Math.floor((wx - radius) / Chunk.SIZE);
    const maxCX = Math.floor((wx + radius) / Chunk.SIZE);
    const minCZ = Math.floor((wz - radius) / Chunk.SIZE);
    const maxCZ = Math.floor((wz + radius) / Chunk.SIZE);
    const rSq = radius * radius;
    const results: TreePOI[] = [];

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const chunk = this.getChunk(cx, cz);
        if (chunk) {
          for (let i = 0; i < chunk.poi.trees.length; i++) {
            const tree = chunk.poi.trees[i];
            const dx = tree.x - wx;
            const dz = tree.z - wz;
            if (dx * dx + dz * dz <= rSq) {
              results.push(tree);
            }
          }
        }
      }
    }
    return results;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= Chunk.HEIGHT) return BlockType.AIR;

    const chunkX = Math.floor(wx / Chunk.SIZE);
    const chunkZ = Math.floor(wz / Chunk.SIZE);

    const chunk = this.getChunk(chunkX, chunkZ);
    if (!chunk) return BlockType.UNLOADED;

    const lx = ((wx % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;
    const lz = ((wz % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;

    return chunk.getBlock(lx, wy, lz);
  }

  public isSolidBlockAt(wx: number, wy: number, wz: number): boolean {
    const type = this.getBlock(wx, wy, wz);
    if (type === BlockType.AIR || type === BlockType.WATER || type === BlockType.UNLOADED) return false;
    const def = BLOCK_DEFINITIONS[type];
    return def ? !def.isLiquid : true;
  }

  public isSolidForAnimals(blockType: BlockType): boolean {
    if (
      blockType === BlockType.AIR ||
      blockType === BlockType.WATER ||
      blockType === BlockType.OASIS_WATER ||
      blockType === BlockType.JUNGLE_WATER ||
      blockType === BlockType.MOLTEN_CORRUPTION ||
      blockType === BlockType.MUDDY_QUICKSAND ||
      blockType === BlockType.UNLOADED ||
      blockType === BlockType.OAK_LEAVES ||
      blockType === BlockType.FROST_LEAVES ||
      blockType === BlockType.WITHERED_THORNS ||
      blockType === BlockType.PALM_FRONDS ||
      blockType === BlockType.JUNGLE_LEAVES ||
      blockType === BlockType.JUNGLE_VINES ||
      blockType === BlockType.MOSSVEIL_THORNED_UNDERGROWTH ||
      blockType === BlockType.TEAL_LEAVES ||
      blockType === BlockType.BLUE_LEAVES ||
      blockType === BlockType.PURPLE_LEAVES ||
      blockType === BlockType.CHARRED_LEAVES ||
      blockType === BlockType.FLOWER ||
      blockType === BlockType.FROST_BLOOM ||
      blockType === BlockType.CORRUPTION_BLOOM ||
      blockType === BlockType.DESERT_BLOOM ||
      blockType === BlockType.SCRUBGRASS ||
      blockType === BlockType.REEDS ||
      blockType === BlockType.BRANCHES ||
      blockType === BlockType.FLINT ||
      blockType === BlockType.STONE_PEBBLE ||
      blockType === BlockType.APPLES ||
      blockType === BlockType.ASHEN_EMBERPOD ||
      blockType === BlockType.CARROT ||
      blockType === BlockType.THORNSPIKE_CLUSTER ||
      blockType === BlockType.BLOOMWING_FEATHER ||
      blockType === BlockType.DUNESTING_BARB ||
      blockType === BlockType.DUNESTING_PINCER_CLAW ||
      blockType === BlockType.DUNESTING_SHELL
    ) {
      return false;
    }
    return true;
  }

  public getUndergroundFactor(playerPos: THREE.Vector3): number {
    const px = Math.floor(playerPos.x);
    const py = Math.floor(playerPos.y * 2.0);
    const pz = Math.floor(playerPos.z);

    // Only true subterranean stone/rock bedrock ceilings define an underground cave.
    // Surface tree logs, branches, leaves, vines, and planks must NEVER trigger cave darkness!
    const CAVE_CEILING_BLOCKS = new Set<BlockType>([
      BlockType.STONE,
      BlockType.BEDROCK,
      BlockType.NETHER_STONE,
      BlockType.FROST_STONE,
      BlockType.SUNSCORCHED_SANDSTONE,
      BlockType.MOSSVEIL_MOSSY_STONE,
    ]);

    let solidRoofCount = 0;
    for (let dy = 1; dy <= 18; dy++) {
      const block = this.getBlock(px, py + dy, pz);
      if (CAVE_CEILING_BLOCKS.has(block)) {
        solidRoofCount++;
      }
    }

    if (solidRoofCount >= 4) return 1.0;   // Deep inside subterranean cavern under thick rock roof
    if (solidRoofCount === 3) return 0.70;  // Cavern room
    if (solidRoofCount === 2) return 0.40;  // Cave entrance overhang
    if (solidRoofCount === 1) return 0.15;
    return 0.0;                            // Open sky / outdoor surface / beneath tree canopies
  }

  public getWaterProximityFactor(px: number, py: number, pz: number, _maxRadius: number = 30): number {
    // 1. Direct submerge check
    const block = this.getBlock(Math.floor(px), Math.floor(py * 2.0), Math.floor(pz));
    if (block === BlockType.WATER || block === BlockType.JUNGLE_WATER || block === BlockType.OASIS_WATER) {
      return 1.0;
    }

    // 2. Continuous bilinear interpolation between pre-cached chunk water proximity bytes
    // (Chunk centers are located at cx * 16 + 8, cz * 16 + 8)
    const fx = (px - 8.0) / Chunk.SIZE;
    const fz = (pz - 8.0) / Chunk.SIZE;
    const c0x = Math.floor(fx);
    const c0z = Math.floor(fz);
    const c1x = c0x + 1;
    const c1z = c0z + 1;

    const tx = Math.max(0, Math.min(1, fx - c0x));
    const tz = Math.max(0, Math.min(1, fz - c0z));

    // Hermite smoothstep interpolation curve: 3t² - 2t³
    const sx = tx * tx * (3.0 - 2.0 * tx);
    const sz = tz * tz * (3.0 - 2.0 * tz);

    const w00 = this.getChunk(c0x, c0z)?.getWaterProximity() ?? 0;
    const w10 = this.getChunk(c1x, c0z)?.getWaterProximity() ?? 0;
    const w01 = this.getChunk(c0x, c1z)?.getWaterProximity() ?? 0;
    const w11 = this.getChunk(c1x, c1z)?.getWaterProximity() ?? 0;

    const w0 = w00 * (1.0 - sx) + w10 * sx;
    const w1 = w01 * (1.0 - sx) + w11 * sx;
    const waterFactor = w0 * (1.0 - sz) + w1 * sz;

    // Smooth height attenuation if high above terrain
    const heightAtten = Math.max(0, Math.min(1.0, 1.0 - Math.max(0, py - 20) / 40.0));
    return Math.min(1.0, waterFactor * heightAtten);
  }

  public isNearWater(px: number, py: number, pz: number, radius: number = 30): boolean {
    return this.getWaterProximityFactor(px, py, pz, radius) > 0;
  }

  private isFlowingWater: boolean = false;
  private isProcessingFluidQueue: boolean = false;
  private fluidQueue: FluidFlowTask[] = [];
  private fluidQueueHead: number = 0;
  private fluidVisited: Set<string> = new Set();
  private readonly MAX_PLUNGE_POOL_RADIUS = 3.5;

  public setBlock(wx: number, wy: number, wz: number, type: BlockType, rotationY?: number): boolean {
    if (wy < 0 || wy >= Chunk.HEIGHT) return false;

    const chunkX = Math.floor(wx / Chunk.SIZE);
    const chunkZ = Math.floor(wz / Chunk.SIZE);

    const chunk = this.getChunk(chunkX, chunkZ);
    if (!chunk) return false;

    const lx = ((wx % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;
    const lz = ((wz % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;

    chunk.setBlock(lx, wy, lz, type);
    this.userEdits.set(`${wx},${wy},${wz}`, type);

    const blockKey = `${wx},${wy},${wz}`;
    if (rotationY !== undefined) {
      this.customBlockRotations.set(blockKey, rotationY);
    }

    if (type === BlockType.WORKBENCH || type === BlockType.TORCH) {
      if (!this.customBlockMeshes.has(blockKey)) {
        const rot = rotationY ?? this.customBlockRotations.get(blockKey) ?? 0;
        const mesh = this.createWorkstationMesh(type, wx, wy, wz, rot);
        if (mesh) {
          this.worldGroup.add(mesh);
          this.customBlockMeshes.set(blockKey, mesh);
        }
      }
    } else if (this.customBlockMeshes.has(blockKey)) {
      const oldMesh = this.customBlockMeshes.get(blockKey)!;
      this.worldGroup.remove(oldMesh);
      this.customBlockMeshes.delete(blockKey);
      this.customBlockRotations.delete(blockKey);
    }

    if (lx === 0) this.markChunkDirty(chunkX - 1, chunkZ);
    if (lx === Chunk.SIZE - 1) this.markChunkDirty(chunkX + 1, chunkZ);
    if (lz === 0) this.markChunkDirty(chunkX, chunkZ - 1);
    if (lz === Chunk.SIZE - 1) this.markChunkDirty(chunkX, chunkZ + 1);

    if (type === BlockType.AIR && !this.isFlowingWater) {
      this.handleBlockBreakWaterFlow(wx, wy, wz);
    }

    return true;
  }

  /**
   * Fluid Physics, Vertical Waterfalls & Bounded Plunge Pool Simulation:
   * 1. Vertical Column Preservation: Water drops straight down (cy - 1) through AIR voxels as a vertical curtain.
   * 2. Bounded Plunge Pool Spreading: When water hits solid ground at the bottom of a drop,
   *    it expands horizontally up to a maximum radius of 3.5 blocks from the vertical fall point,
   *    creating clean, self-contained plunge pools without flooding deep cave networks.
   * 3. Time-Sliced Queue: Flow tasks are enqueued and processed across multiple animation frames.
   */
  public propagateWaterFlow(wx: number, wy: number, wz: number): void {
    if (wy < 0 || wy >= Chunk.HEIGHT) return;

    let activeLiquid = this.getBlock(wx, wy, wz);

    // If starting position is AIR, check 5 neighbors (above & sides) for a liquid source
    if (activeLiquid !== BlockType.WATER && activeLiquid !== BlockType.OASIS_WATER && activeLiquid !== BlockType.JUNGLE_WATER) {
      const liquidSources = [
        { x: wx, y: wy + 1, z: wz },
        { x: wx + 1, y: wy, z: wz },
        { x: wx - 1, y: wy, z: wz },
        { x: wx, y: wy, z: wz + 1 },
        { x: wx, y: wy, z: wz - 1 }
      ];
      for (const src of liquidSources) {
        const t = this.getBlock(src.x, src.y, src.z);
        if (t === BlockType.WATER || t === BlockType.OASIS_WATER || t === BlockType.JUNGLE_WATER) {
          activeLiquid = t;
          this.isFlowingWater = true;
          this.setBlock(wx, wy, wz, activeLiquid);
          this.isFlowingWater = false;
          break;
        }
      }
    }

    if (activeLiquid !== BlockType.WATER && activeLiquid !== BlockType.OASIS_WATER && activeLiquid !== BlockType.JUNGLE_WATER) return;

    const key = `${wx},${wy},${wz}`;
    if (!this.fluidVisited.has(key)) {
      this.fluidVisited.add(key);
      this.fluidQueue.push({
        x: wx,
        y: wy,
        z: wz,
        fallX: wx,
        fallZ: wz,
        horizDist: 0,
        liquidType: activeLiquid,
      });
    }
  }

  /**
   * Time-sliced tick for fluid physics propagation with O(1) queue indexing.
   * Processes a bounded budget of fluid expansion steps per frame to guarantee 60 FPS without UI stutter.
   */
  public processFluidQueue(budgetMs: number = 1.5, maxSteps: number = 32): void {
    if (this.fluidQueue.length - this.fluidQueueHead <= 0 || this.isProcessingFluidQueue) return;
    this.isProcessingFluidQueue = true;

    const startTime = performance.now();
    let steps = 0;

    try {
      while (this.fluidQueueHead < this.fluidQueue.length && steps < maxSteps) {
        if (performance.now() - startTime >= budgetMs && steps > 0) {
          break; // Yield remaining fluid expansion steps to next animation frame
        }

        steps++;
        const current = this.fluidQueue[this.fluidQueueHead++];
        if (!current) continue;

        const cx = current.x;
        const cy = current.y;
        const cz = current.z;
        const fallX = current.fallX;
        const fallZ = current.fallZ;
        const activeLiquid = current.liquidType;

        if (cy <= 0) continue;

        // 1. VERTICAL GRAVITY STEP: Check directly below (cy - 1) first!
        const blockBelow = this.getBlock(cx, cy - 1, cz);
        if (blockBelow === BlockType.AIR) {
          this.isFlowingWater = true;
          this.setBlock(cx, cy - 1, cz, activeLiquid);
          this.isFlowingWater = false;

          const downKey = `${cx},${cy - 1},${cz}`;
          if (!this.fluidVisited.has(downKey)) {
            this.fluidVisited.add(downKey);
            // Reset fall origin line to this vertical drop column
            this.fluidQueue.push({
              x: cx,
              y: cy - 1,
              z: cz,
              fallX: cx,
              fallZ: cz,
              horizDist: 0,
              liquidType: activeLiquid,
            });
          }
          // Continue falling straight down as a vertical curtain before horizontal spreading
          continue;
        }

        // 2. BOUNDED PLUNGE POOL HORIZONTAL EXPANSION:
        // When water lands on solid ground (or water pool), expand horizontally up to MAX_PLUNGE_POOL_RADIUS
        if (current.horizDist >= this.MAX_PLUNGE_POOL_RADIUS) continue;

        const horizontalNeighbors = [
          { x: cx + 1, y: cy, z: cz },
          { x: cx - 1, y: cy, z: cz },
          { x: cx, y: cy, z: cz + 1 },
          { x: cx, y: cy, z: cz - 1 }
        ];

        for (const hn of horizontalNeighbors) {
          const dx = hn.x - fallX;
          const dz = hn.z - fallZ;
          const distFromFallLine = Math.sqrt(dx * dx + dz * dz);

          if (distFromFallLine <= this.MAX_PLUNGE_POOL_RADIUS) {
            const key = `${hn.x},${hn.y},${hn.z}`;
            if (!this.fluidVisited.has(key) && hn.y >= 0 && hn.y < Chunk.HEIGHT) {
              const hType = this.getBlock(hn.x, hn.y, hn.z);
              if (hType === BlockType.AIR) {
                this.isFlowingWater = true;
                this.setBlock(hn.x, hn.y, hn.z, activeLiquid);
                this.isFlowingWater = false;

                this.fluidVisited.add(key);
                this.fluidQueue.push({
                  x: hn.x,
                  y: hn.y,
                  z: hn.z,
                  fallX: fallX,
                  fallZ: fallZ,
                  horizDist: current.horizDist + 1,
                  liquidType: activeLiquid,
                });
              }
            }
          }
        }
      }
    } finally {
      this.isProcessingFluidQueue = false;

      // Reset visited cache & compact array when queue is drained or head exceeds threshold
      if (this.fluidQueueHead >= this.fluidQueue.length) {
        this.fluidQueue.length = 0;
        this.fluidQueueHead = 0;
        if (this.fluidVisited.size > 2000) {
          this.fluidVisited.clear();
        }
      } else if (this.fluidQueueHead > 2048) {
        this.fluidQueue = this.fluidQueue.slice(this.fluidQueueHead);
        this.fluidQueueHead = 0;
      }
    }
  }

  /**
   * Drain fluid queue with cooperative yielding to the main thread (15ms budget per slice)
   * to guarantee zero UI lockup or progress bar freeze during world generation.
   */
  public async drainFluidQueueAsync(maxTimeBudgetMs: number = 15): Promise<void> {
    const startTime = performance.now();
    let lastYield = performance.now();

    while (this.fluidQueue.length - this.fluidQueueHead > 0) {
      this.processFluidQueue(15.0, 128);

      const now = performance.now();
      if (now - lastYield >= maxTimeBudgetMs) {
        await new Promise<void>((resolve) => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
        lastYield = performance.now();
      }

      // Hard timeout safety guard (3.0s max) to guarantee world loading always finishes
      if (now - startTime > 3000) {
        break;
      }
    }
  }

  /**
   * Drain fluid queue synchronously during initial world generation / loading screen with batch limit.
   */
  public drainFluidQueueSync(maxBatches: number = 256): void {
    let batches = 0;
    while (this.fluidQueue.length - this.fluidQueueHead > 0 && batches < maxBatches) {
      this.processFluidQueue(50.0, 128);
      batches++;
    }
  }

  public handleBlockBreakWaterFlow(wx: number, wy: number, wz: number): void {
    this.propagateWaterFlow(wx, wy, wz);
  }

  /**
   * Run fluid simulation pass across newly loaded or generated chunk to queue mid-air water.
   */
  public runFluidPassForChunk(chunkX: number, chunkZ: number): void {
    const chunk = this.getChunk(chunkX, chunkZ);
    if (!chunk) return;

    const startX = chunkX * Chunk.SIZE;
    const startZ = chunkZ * Chunk.SIZE;

    for (let lx = 0; lx < Chunk.SIZE; lx++) {
      for (let lz = 0; lz < Chunk.SIZE; lz++) {
        for (let y = Chunk.HEIGHT - 1; y >= 0; y--) {
          const type = chunk.getBlock(lx, y, lz);
          if (type === BlockType.WATER || type === BlockType.OASIS_WATER || type === BlockType.JUNGLE_WATER) {
            const wx = startX + lx;
            const wz = startZ + lz;
            if (y > 0 && (this.getBlock(wx, y - 1, wz) === BlockType.AIR ||
                          this.getBlock(wx + 1, y, wz) === BlockType.AIR ||
                          this.getBlock(wx - 1, y, wz) === BlockType.AIR ||
                          this.getBlock(wx, y, wz + 1) === BlockType.AIR ||
                          this.getBlock(wx, y, wz - 1) === BlockType.AIR)) {
              this.propagateWaterFlow(wx, y, wz);
            }
          }
        }
      }
    }
  }

  private markChunkDirty(chunkX: number, chunkZ: number): void {
    const neighbor = this.getChunk(chunkX, chunkZ);
    if (neighbor) neighbor.isDirty = true;
  }

  private rebuildChunkMesh(
    chunk: Chunk,
    getNeighbor: (wx: number, wy: number, wz: number) => BlockType,
    targetLod: number = 0
  ): void {
    if (chunk.mesh) {
      this.worldGroup.remove(chunk.mesh);
    }
    if (chunk.transparentMesh) {
      this.transparentGroup.remove(chunk.transparentMesh);
    }
    if (chunk.emissiveMesh) {
      this.worldGroup.remove(chunk.emissiveMesh);
    }
    for (const instMesh of chunk.instancedMeshes) {
      this.worldGroup.remove(instMesh);
    }

    // Explicitly dispose old geometries and compiled material programs to prevent WebGL memory fragmentation
    chunk.dispose();

    const { solid, transparent, emissive, instanced } = chunk.buildMesh(
      this.atlasTexture,
      this.emissiveAtlasTexture,
      getNeighbor,
      this.leafOpacity,
      this.blockModelManager,
      targetLod
    );

    if (solid) this.worldGroup.add(solid);
    if (transparent) this.transparentGroup.add(transparent);
    if (emissive) this.worldGroup.add(emissive);
    for (const instMesh of instanced) {
      this.worldGroup.add(instMesh);
    }

    // Scan and spawn any 3D workstation & torch models in this chunk
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let y = 0; y < Chunk.HEIGHT; y++) {
        for (let z = 0; z < Chunk.SIZE; z++) {
          const blk = chunk.getBlock(x, y, z);
          if (blk === BlockType.WORKBENCH || blk === BlockType.TORCH) {
            const wx = chunk.worldX + x;
            const wy = y;
            const wz = chunk.worldZ + z;
            const bKey = `${wx},${wy},${wz}`;
            if (!this.customBlockMeshes.has(bKey)) {
              const rot = this.customBlockRotations.get(bKey) ?? 0;
              const mesh = this.createWorkstationMesh(blk, wx, wy, wz, rot);
              if (mesh) {
                this.worldGroup.add(mesh);
                this.customBlockMeshes.set(bKey, mesh);
              }
            }
          }
        }
      }
    }
  }

  public isSolidForTorch(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= Chunk.HEIGHT) return false;
    const type = this.getBlock(wx, wy, wz);
    return type !== BlockType.AIR &&
      type !== BlockType.WATER &&
      type !== BlockType.JUNGLE_WATER &&
      type !== BlockType.OASIS_WATER &&
      type !== BlockType.MOLTEN_CORRUPTION &&
      type !== BlockType.UNLOADED &&
      type !== BlockType.TORCH &&
      type !== BlockType.FLOWER &&
      type !== BlockType.APPLES &&
      type !== BlockType.REEDS &&
      type !== BlockType.BRANCHES &&
      type !== BlockType.CARROT &&
      type !== BlockType.FLINT &&
      type !== BlockType.STONE_PEBBLE &&
      type !== BlockType.ASHEN_EMBERPOD &&
      type !== BlockType.THORNSPIKE_CLUSTER &&
      type !== BlockType.BLOOMWING_FEATHER &&
      type !== BlockType.DUNESTING_BARB;
  }

  public createWorkstationMesh(type: BlockType, wx: number, wy: number, wz: number, rotationY: number = 0): THREE.Object3D | null {
    if (type === BlockType.WORKBENCH) {
      const rawModel = ModelCache.getClone('/TOOLS-WEAPONS/CRAFTING TABLE.glb');
      if (!rawModel) return null;

      const group = new THREE.Group();
      group.name = `workbench_${wx}_${wy}_${wz}`;

      // Compute bounding box of the raw GLB model
      const bbox = new THREE.Box3().setFromObject(rawModel);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      // Target footprint: ~0.88 wide x ~0.50 high x ~0.88 deep (fits squarely within 1.0 x 0.5 x 1.0 voxel space)
      const maxHorizDim = Math.max(size.x, size.z) || 1;
      const targetScale = 0.88 / maxHorizDim;

      rawModel.scale.set(targetScale, targetScale, targetScale);
      // Center horizontally and align bottom to y = 0
      rawModel.position.set(
        -center.x * targetScale,
        -bbox.min.y * targetScale,
        -center.z * targetScale
      );

      rawModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      group.add(rawModel);
      group.position.set(wx + 0.5, wy * 0.5, wz + 0.5);
      group.rotation.y = rotationY;
      return group;
    }

    if (type === BlockType.TORCH) {
      const rawModel = ModelCache.getClone('/TOOLS-WEAPONS/TORCH.glb');
      if (!rawModel) return null;

      const group = new THREE.Group();
      group.name = `torch_${wx}_${wy}_${wz}`;

      const bbox = new THREE.Box3().setFromObject(rawModel);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      const targetHeight = 0.46;
      const targetScale = targetHeight / (size.y || 1);

      rawModel.scale.set(targetScale, targetScale, targetScale);
      rawModel.position.set(
        -center.x * targetScale,
        -bbox.min.y * targetScale,
        -center.z * targetScale
      );

      rawModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          if (mesh.name === 'tripo_part_2' || mesh.name.includes('flame')) {
            if (mesh.material) {
              const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
              mat.emissive = new THREE.Color(0xff8822);
              mat.emissiveIntensity = 1.4;
              mesh.material = mat;
            }
          }
        }
      });

      group.add(rawModel);

      // Determine orientation: 0 = Floor, 1 = West wall, 2 = East wall, 3 = North wall, 4 = South wall
      let orient = rotationY;
      if (orient === undefined || orient < 0 || orient > 4) {
        if (this.isSolidForTorch(wx, wy - 1, wz)) {
          orient = 0;
        } else if (this.isSolidForTorch(wx - 1, wy, wz)) {
          orient = 1;
        } else if (this.isSolidForTorch(wx + 1, wy, wz)) {
          orient = 2;
        } else if (this.isSolidForTorch(wx, wy, wz - 1)) {
          orient = 3;
        } else if (this.isSolidForTorch(wx, wy, wz + 1)) {
          orient = 4;
        } else {
          orient = 0;
        }
      }

      if (orient === 1) {
        // Attached to West wall (at x = wx)
        group.position.set(wx + 0.08, wy * 0.5 + 0.08, wz + 0.5);
        group.rotation.set(0, 0, -0.32);
      } else if (orient === 2) {
        // Attached to East wall (at x = wx + 1)
        group.position.set(wx + 0.92, wy * 0.5 + 0.08, wz + 0.5);
        group.rotation.set(0, 0, 0.32);
      } else if (orient === 3) {
        // Attached to North wall (at z = wz)
        group.position.set(wx + 0.5, wy * 0.5 + 0.08, wz + 0.08);
        group.rotation.set(0.32, 0, 0);
      } else if (orient === 4) {
        // Attached to South wall (at z = wz + 1)
        group.position.set(wx + 0.5, wy * 0.5 + 0.08, wz + 0.92);
        group.rotation.set(-0.32, 0, 0);
      } else {
        // Floor mount: centered, upright
        group.position.set(wx + 0.5, wy * 0.5, wz + 0.5);
        group.rotation.set(0, 0, 0);
      }

      // Warm torch point light to illuminate surrounding blocks with extended range
      const torchLight = new THREE.PointLight(0xffaa44, 3.8, 50, 0.85);
      torchLight.position.set(0, 0.44, 0);
      group.add(torchLight);

      return group;
    }
    return null;
  }

  public updateTorchAnimations(time: number, playerPos: THREE.Vector3, particleManager?: any): void {
    const px = playerPos.x;
    const pz = playerPos.z;

    for (const [, mesh] of this.customBlockMeshes.entries()) {
      if (mesh.name.startsWith('torch_')) {
        const dx = mesh.position.x - px;
        const dz = mesh.position.z - pz;
        const distSq = dx * dx + dz * dz;

        // Animate torches within 48m of player
        if (distSq < 2304) {
          const light = mesh.children.find((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight;
          if (light) {
            const offset = mesh.position.x * 7.1 + mesh.position.z * 13.3;
            const flicker = Math.sin((time * 0.001 + offset) * 14.0) * 0.36 + Math.sin((time * 0.001 + offset) * 29.0) * 0.20 + (Math.random() - 0.5) * 0.10;
            light.intensity = 3.8 + flicker;
          }

          // Rising ember particles directly from the flame head
          if (particleManager && distSq < 576 && Math.random() < 0.06) {
            const flamePos = new THREE.Vector3(0, 0.44, 0);
            mesh.localToWorld(flamePos);
            particleManager.spawnTorchEmber(flamePos, 1);
          }
        }
      }
    }
  }

  private unloadChunk(key: string, chunk: Chunk): void {
    if (chunk.mesh) {
      this.worldGroup.remove(chunk.mesh);
    }
    if (chunk.transparentMesh) {
      this.transparentGroup.remove(chunk.transparentMesh);
    }
    if (chunk.emissiveMesh) {
      this.worldGroup.remove(chunk.emissiveMesh);
    }
    for (const instMesh of chunk.instancedMeshes) {
      this.worldGroup.remove(instMesh);
    }
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let y = 0; y < Chunk.HEIGHT; y++) {
        for (let z = 0; z < Chunk.SIZE; z++) {
          const wx = chunk.worldX + x;
          const wy = y;
          const wz = chunk.worldZ + z;
          const bKey = `${wx},${wy},${wz}`;
          const mesh = this.customBlockMeshes.get(bKey);
          if (mesh) {
            this.worldGroup.remove(mesh);
            this.customBlockMeshes.delete(bKey);
          }
        }
      }
    }
    chunk.dispose();
    this.chunks.delete(key);
  }

  public isChunkLoaded(wx: number, wz: number): boolean {
    const cx = Math.floor(wx / Chunk.SIZE);
    const cz = Math.floor(wz / Chunk.SIZE);
    const chunk = this.getChunk(cx, cz);
    return !!(chunk && !chunk.isDirty && (chunk.mesh || chunk.instancedMeshes.length > 0));
  }

  public updateChunksAroundPlayer(playerPos: THREE.Vector3): void {
    const pChunkX = Math.floor(playerPos.x / Chunk.SIZE);
    const pChunkZ = Math.floor(playerPos.z / Chunk.SIZE);

    // 1. Unload distant chunks outside renderDistance
    const maxDistSq = (this.renderDistance + 1) * (this.renderDistance + 1);
    for (const [key, chunk] of this.chunks.entries()) {
      const dx = chunk.chunkX - pChunkX;
      const dz = chunk.chunkZ - pChunkZ;
      if (dx * dx + dz * dz > maxDistSq) {
        this.unloadChunk(key, chunk);
      }
    }

    // 2. Collect missing chunk candidates and sort by proximity (closest to player generated first!)
    const missing: Array<{ cx: number; cz: number; distSq: number }> = [];
    for (let cx = pChunkX - this.renderDistance; cx <= pChunkX + this.renderDistance; cx++) {
      for (let cz = pChunkZ - this.renderDistance; cz <= pChunkZ + this.renderDistance; cz++) {
        const dx = cx - pChunkX;
        const dz = cz - pChunkZ;
        const distSq = dx * dx + dz * dz;
        if (distSq <= (this.renderDistance + 0.5) * (this.renderDistance + 0.5)) {
          const key = this.getChunkKey(cx, cz);
          if (!this.chunks.has(key)) {
            missing.push({ cx, cz, distSq });
          }
        }
      }
    }
    missing.sort((a, b) => a.distSq - b.distSq);

    // 2. Time-Sliced Chunk Generation with Strict Frame Budget (max 3.5ms per frame)
    const frameStartTime = performance.now();
    const MAX_CHUNK_FRAME_BUDGET_MS = 3.5;

    for (let i = 0; i < missing.length && i < 1; i++) {
      const { cx, cz } = missing[i];
      const key = this.getChunkKey(cx, cz);
      const chunk = new Chunk(cx, cz);
      chunk.generateTerrain(this.noise);
      this.chunks.set(key, chunk);
      this.runFluidPassForChunk(cx, cz);

      this.markChunkDirty(cx - 1, cz);
      this.markChunkDirty(cx + 1, cz);
      this.markChunkDirty(cx, cz - 1);
      this.markChunkDirty(cx, cz + 1);
      this.markChunkDirty(cx - 1, cz - 1);
      this.markChunkDirty(cx + 1, cz - 1);
      this.markChunkDirty(cx - 1, cz + 1);
      this.markChunkDirty(cx + 1, cz + 1);
      break; // High priority time-slice (max 1 chunk per frame during active gameplay)
    }

    // 3. Dynamic Chunk Level of Detail (LOD) & Time-Sliced Rebuilding
    const getNeighbor = (wx: number, wy: number, wz: number) => this.getBlock(wx, wy, wz);
    const dirtyChunks: Array<{ chunk: Chunk; distSq: number; targetLod: number }> = [];

    for (const chunk of this.chunks.values()) {
      const dx = chunk.chunkX - pChunkX;
      const dz = chunk.chunkZ - pChunkZ;
      const chebyshevDist = Math.max(Math.abs(dx), Math.abs(dz));
      const targetLod = chebyshevDist > 2 ? 1 : 0;

      if (chunk.currentLOD !== targetLod) {
        chunk.isDirty = true;
      }

      if (chunk.isDirty) {
        dirtyChunks.push({ chunk, distSq: dx * dx + dz * dz, targetLod });
      }
    }
    dirtyChunks.sort((a, b) => a.distSq - b.distSq);

    const maxRebuilds = Math.min(2, dirtyChunks.length);
    for (let i = 0; i < maxRebuilds; i++) {
      if (i > 0 && performance.now() - frameStartTime >= MAX_CHUNK_FRAME_BUDGET_MS) {
        break; // Yield remaining chunk meshing to next animation frame
      }
      this.rebuildChunkMesh(dirtyChunks[i].chunk, getNeighbor, dirtyChunks[i].targetLod);
    }

    // 4. Time-Sliced Fluid Physics Propagation Queue (strict 1.5ms / 32 steps per frame)
    this.processFluidQueue(1.5, 32);

    this.updateGlowingOreLights(playerPos);
  }

  private updateGlowingOreLights(playerPos: THREE.Vector3): void {
    const candidates: Array<{ x: number; y: number; z: number; type: BlockType; distSq: number }> = [];
    const maxSearchDistSq = 18 * 18;

    for (const chunk of this.chunks.values()) {
      const cdx = (chunk.worldX + 8) - playerPos.x;
      const cdz = (chunk.worldZ + 8) - playerPos.z;
      if (cdx * cdx + cdz * cdz > maxSearchDistSq * 1.5) continue;

      for (const ore of chunk.glowingOrePositions) {
        const dx = ore.x - playerPos.x;
        const dy = ore.y - playerPos.y;
        const dz = ore.z - playerPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < maxSearchDistSq) {
          candidates.push({ ...ore, distSq });
        }
      }
    }

    candidates.sort((a, b) => a.distSq - b.distSq);

    const ORE_LIGHT_CONFIGS: Record<number, { color: number; intensity: number; distance: number }> = {
      // Molten Corruption (Magma): Gentle, subtle ambient orange glow
      [BlockType.MOLTEN_CORRUPTION]: { color: 0xff4500, intensity: 2.2, distance: 4.8 },
    };

    // Filter candidates to ensure high-density liquid magma streams space out lights across the river
    const selectedCandidates: typeof candidates = [];
    for (const cand of candidates) {
      if (cand.type === BlockType.MOLTEN_CORRUPTION) {
        // Enforce min 5.0 block distance separation between magma lights
        const tooClose = selectedCandidates.some(sel => {
          const dx = sel.x - cand.x;
          const dy = sel.y - cand.y;
          const dz = sel.z - cand.z;
          return (dx * dx + dy * dy + dz * dz) < 25.0;
        });
        if (tooClose) continue;
      }
      selectedCandidates.push(cand);
      if (selectedCandidates.length >= this.oreLightPool.length) break;
    }

    for (let i = 0; i < this.oreLightPool.length; i++) {
      const light = this.oreLightPool[i];
      if (i < selectedCandidates.length) {
        const ore = selectedCandidates[i];
        const cfg = ORE_LIGHT_CONFIGS[ore.type] || { color: 0xff4500, intensity: 2.0, distance: 4.5 };
        light.position.set(ore.x, ore.y + 0.2, ore.z);
        light.color.setHex(cfg.color);
        light.intensity = cfg.intensity;
        light.distance = cfg.distance;
        light.decay = 2.0;
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  }

  // Fast DDA Voxel Raycaster
  public raycastBlock(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number = 6
  ): { blockPos: THREE.Vector3; placePos: THREE.Vector3; faceNormal: THREE.Vector3; type: BlockType } | null {
    const scaledOrigin = new THREE.Vector3(origin.x, origin.y * 2.0, origin.z);
    const dir = new THREE.Vector3(direction.x, direction.y * 2.0, direction.z).normalize();
    let x = Math.floor(scaledOrigin.x);
    let y = Math.floor(scaledOrigin.y);
    let z = Math.floor(scaledOrigin.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / dir.x);
    const tDeltaY = Math.abs(1 / dir.y);
    const tDeltaZ = Math.abs(1 / dir.z);

    let tMaxX = dir.x >= 0 ? (x + 1 - scaledOrigin.x) * tDeltaX : (scaledOrigin.x - x) * tDeltaX;
    let tMaxY = dir.y >= 0 ? (y + 1 - scaledOrigin.y) * tDeltaY : (scaledOrigin.y - y) * tDeltaY;
    let tMaxZ = dir.z >= 0 ? (z + 1 - scaledOrigin.z) * tDeltaZ : (scaledOrigin.z - z) * tDeltaZ;

    let norm = new THREE.Vector3(0, 0, 0);
    let dist = 0;

    while (dist < maxDistance) {
      const type = this.getBlock(x, y, z);
      if (type !== BlockType.AIR && type !== BlockType.WATER) {
        return {
          blockPos: new THREE.Vector3(x, y, z),
          placePos: new THREE.Vector3(x + norm.x, y + norm.y, z + norm.z),
          faceNormal: norm.clone(),
          type,
        };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          dist = tMaxX;
          tMaxX += tDeltaX;
          x += stepX;
          norm.set(-stepX, 0, 0);
        } else {
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          z += stepZ;
          norm.set(0, 0, -stepZ);
        }
      } else {
        if (tMaxY < tMaxZ) {
          dist = tMaxY;
          tMaxY += tDeltaY;
          y += stepY;
          norm.set(0, -stepY, 0);
        } else {
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          z += stepZ;
          norm.set(0, 0, -stepZ);
        }
      }
    }

    return null;
  }

  /**
   * Fast line-of-sight raycast check between two world positions.
   * Returns true if there is an unobstructed path (no opaque solid blocks), false if blocked by walls or terrain.
   */
  public hasLineOfSight(origin: THREE.Vector3, target: THREE.Vector3, maxDist: number = 32): boolean {
    const totalDist = origin.distanceTo(target);
    if (totalDist < 0.05) return true;
    if (totalDist > maxDist) return false;

    const scaledOrigin = VoxelWorld.SCRATCH_LOS_ORIGIN.set(origin.x, origin.y * 2.0, origin.z);
    const scaledTarget = VoxelWorld.SCRATCH_LOS_TARGET.set(target.x, target.y * 2.0, target.z);
    const dir = VoxelWorld.SCRATCH_LOS_DIR.subVectors(scaledTarget, scaledOrigin).normalize();

    let x = Math.floor(scaledOrigin.x);
    let y = Math.floor(scaledOrigin.y);
    let z = Math.floor(scaledOrigin.z);

    const targetX = Math.floor(scaledTarget.x);
    const targetY = Math.floor(scaledTarget.y);
    const targetZ = Math.floor(scaledTarget.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(dir.x) > 1e-6 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = Math.abs(dir.y) > 1e-6 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = Math.abs(dir.z) > 1e-6 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = Math.abs(dir.x) > 1e-6 ? (dir.x >= 0 ? (x + 1 - scaledOrigin.x) * tDeltaX : (scaledOrigin.x - x) * tDeltaX) : Infinity;
    let tMaxY = Math.abs(dir.y) > 1e-6 ? (dir.y >= 0 ? (y + 1 - scaledOrigin.y) * tDeltaY : (scaledOrigin.y - y) * tDeltaY) : Infinity;
    let tMaxZ = Math.abs(dir.z) > 1e-6 ? (dir.z >= 0 ? (z + 1 - scaledOrigin.z) * tDeltaZ : (scaledOrigin.z - z) * tDeltaZ) : Infinity;

    const maxSteps = Math.ceil(totalDist * 2.5) + 4;
    let steps = 0;

    while (steps < maxSteps) {
      if (x === targetX && y === targetY && z === targetZ) {
        return true;
      }

      const type = this.getBlock(x, y, z);
      const isPassThrough = 
        type === BlockType.AIR ||
        type === BlockType.WATER ||
        type === BlockType.OASIS_WATER ||
        type === BlockType.JUNGLE_WATER ||
        type === BlockType.FLOWER ||
        type === BlockType.FROST_BLOOM ||
        type === BlockType.DESERT_BLOOM ||
        type === BlockType.CORRUPTION_BLOOM ||
        type === BlockType.CORRUPTED_GROWTH ||
        type === BlockType.TORCH;

      if (!isPassThrough) {
        return false;
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          tMaxX += tDeltaX;
          x += stepX;
        } else {
          tMaxZ += tDeltaZ;
          z += stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          tMaxY += tDeltaY;
          y += stepY;
        } else {
          tMaxZ += tDeltaZ;
          z += stepZ;
        }
      }
      steps++;
    }

    return true;
  }

  public dispose(): void {
    for (const [key, chunk] of this.chunks.entries()) {
      if (chunk.mesh) this.worldGroup.remove(chunk.mesh);
      if (chunk.transparentMesh) this.transparentGroup.remove(chunk.transparentMesh);
      if (chunk.emissiveMesh) this.worldGroup.remove(chunk.emissiveMesh);
      for (const instMesh of chunk.instancedMeshes) {
        this.worldGroup.remove(instMesh);
      }
      chunk.dispose();
    }
    this.chunks.clear();
    TextureAtlasManager.release(this.atlasTexture);
    TextureAtlasManager.release(this.emissiveAtlasTexture);
  }
}
