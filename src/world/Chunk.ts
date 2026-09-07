import * as THREE from 'three';
import { BlockType, BlockShape, BLOCK_DEFINITIONS, TextureGenerator } from '../textures/TextureGenerator';
import { TerrainNoise } from './Noise';
import { BlockModelManager } from './BlockModelManager';

const EMISSIVE_ORES = new Set<BlockType>([
  BlockType.ASHEN_ABYSSAL_PRIMORDIUM,
  BlockType.CORRUPTED_ORE,
  BlockType.ASHEN_GOLD_ORE,
  BlockType.ASHEN_SILVER_ORE,
  BlockType.ASHEN_COPPER_ORE,
  BlockType.FROST_ORE,
  BlockType.SUNSTONE_ORE,
  BlockType.MOLTEN_CORRUPTION,
]);

const BIOME_NAMES: Array<'grove' | 'frost' | 'ruins' | 'sunscorched' | 'rainforest'> = [
  'grove',        // 0
  'frost',        // 1
  'ruins',        // 2
  'sunscorched',  // 3
  'rainforest'    // 4
];

function applyLiquidShader(material: THREE.Material, isTransparent: boolean = false): void {
  const cols = 8;
  const rows = Math.ceil(TextureGenerator.TOTAL_TEXTURES / cols);
  const tileSizeX = 1 / cols;
  const tileSizeY = 1 / rows;

  // Molten Corruption (Index 42)
  const magmaCol = 42 % cols;
  const magmaRow = Math.floor(42 / cols);
  const magmaU0 = magmaCol * tileSizeX;
  const magmaU1 = (magmaCol + 1) * tileSizeX;
  const magmaV0 = 1.0 - (magmaRow + 1) * tileSizeY;
  const magmaV1 = 1.0 - magmaRow * tileSizeY;

  // Water (Index 8)
  const waterCol = 8 % cols;
  const waterRow = Math.floor(8 / cols);
  const waterU0 = waterCol * tileSizeX;
  const waterU1 = (waterCol + 1) * tileSizeX;
  const waterV0 = 1.0 - (waterRow + 1) * tileSizeY;
  const waterV1 = 1.0 - waterRow * tileSizeY;

  // Oasis Water (Index 54)
  const oasisCol = 54 % cols;
  const oasisRow = Math.floor(54 / cols);
  const oasisU0 = oasisCol * tileSizeX;
  const oasisU1 = (oasisCol + 1) * tileSizeX;
  const oasisV0 = 1.0 - (oasisRow + 1) * tileSizeY;
  const oasisV1 = 1.0 - oasisRow * tileSizeY;

  // Jungle Water (Index 92)
  const jungleWaterCol = 92 % cols;
  const jungleWaterRow = Math.floor(92 / cols);
  const jungleWaterU0 = jungleWaterCol * tileSizeX;
  const jungleWaterU1 = (jungleWaterCol + 1) * tileSizeX;
  const jungleWaterV0 = 1.0 - (jungleWaterRow + 1) * tileSizeY;
  const jungleWaterV1 = 1.0 - jungleWaterRow * tileSizeY;

  material.onBeforeCompile = (shader) => {
    // We reuse magmaUniforms for all liquid animation (time is time)
    shader.uniforms.uMagmaTime = TextureGenerator.magmaUniforms.uTime;

    shader.vertexShader = `
      attribute vec2 aUv2;
      attribute float aBlendWeight;
      varying vec2 vMapUv2;
      varying float vBlendWeight;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `
      #include <uv_vertex>
      vMapUv2 = aUv2;
      vBlendWeight = aBlendWeight;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vec4 wPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wPos = instanceMatrix * wPos;
      #endif
      wPos = modelMatrix * wPos;
      vWorldPos = wPos.xyz;
      #ifdef USE_INSTANCING
        vWorldNormal = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz);
      #else
        vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
      #endif
      `
    );

    shader.fragmentShader = `
      uniform float uMagmaTime;
      varying vec2 vMapUv2;
      varying float vBlendWeight;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        vec2 liquid_vMapUv = vMapUv;
        vec2 liquid_vMapUv2 = vMapUv2;
        // Molten Corruption (Index 42)
        if (liquid_vMapUv.x >= ${magmaU0.toFixed(6)} && liquid_vMapUv.x <= ${magmaU1.toFixed(6)} && liquid_vMapUv.y >= ${magmaV0.toFixed(6)} && liquid_vMapUv.y <= ${magmaV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.05, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.6) * 0.003;
          liquid_vMapUv.y = ${magmaV0.toFixed(6)} + mod(liquid_vMapUv.y - ${magmaV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vMapUv.x = ${magmaU0.toFixed(6)} + mod(liquid_vMapUv.x - ${magmaU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Normal Water (Index 8)
        else if (liquid_vMapUv.x >= ${waterU0.toFixed(6)} && liquid_vMapUv.x <= ${waterU1.toFixed(6)} && liquid_vMapUv.y >= ${waterV0.toFixed(6)} && liquid_vMapUv.y <= ${waterV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.03, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.5) * 0.004;
          liquid_vMapUv.y = ${waterV0.toFixed(6)} + mod(liquid_vMapUv.y - ${waterV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vMapUv.x = ${waterU0.toFixed(6)} + mod(liquid_vMapUv.x - ${waterU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Oasis Water (Index 54)
        else if (liquid_vMapUv.x >= ${oasisU0.toFixed(6)} && liquid_vMapUv.x <= ${oasisU1.toFixed(6)} && liquid_vMapUv.y >= ${oasisV0.toFixed(6)} && liquid_vMapUv.y <= ${oasisV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.03, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.5) * 0.004;
          liquid_vMapUv.y = ${oasisV0.toFixed(6)} + mod(liquid_vMapUv.y - ${oasisV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vMapUv.x = ${oasisU0.toFixed(6)} + mod(liquid_vMapUv.x - ${oasisU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Jungle Water (Index 92)
        else if (liquid_vMapUv.x >= ${jungleWaterU0.toFixed(6)} && liquid_vMapUv.x <= ${jungleWaterU1.toFixed(6)} && liquid_vMapUv.y >= ${jungleWaterV0.toFixed(6)} && liquid_vMapUv.y <= ${jungleWaterV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.035, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.55) * 0.004;
          liquid_vMapUv.y = ${jungleWaterV0.toFixed(6)} + mod(liquid_vMapUv.y - ${jungleWaterV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vMapUv.x = ${jungleWaterU0.toFixed(6)} + mod(liquid_vMapUv.x - ${jungleWaterU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        ${isTransparent ? '' : `
        // Continuous Triplanar World-Space Texture Mapping for Terrain
        else {
          vec2 cTileSize = vec2(${tileSizeX.toFixed(6)}, ${tileSizeY.toFixed(6)});
          vec2 tileOrigin = floor(liquid_vMapUv / cTileSize) * cTileSize;
          vec3 aNorm = abs(vWorldNormal);
          vec2 subUv;

          if (aNorm.y >= aNorm.x && aNorm.y >= aNorm.z) {
            // Horizontal Top / Tread Face (+Y / -Y)
            subUv = vec2(fract(vWorldPos.x), fract(-vWorldPos.z));
          } else if (aNorm.x >= aNorm.z) {
            // Vertical Riser / Wall (+X / -X)
            subUv = vec2(fract(vWorldPos.z), fract(vWorldPos.y * 2.0));
          } else {
            // Vertical Riser / Wall (+Z / -Z)
            subUv = vec2(fract(vWorldPos.x), fract(vWorldPos.y * 2.0));
          }

          liquid_vMapUv = tileOrigin + clamp(subUv, 0.002, 0.998) * cTileSize;

          if (vBlendWeight > 0.005) {
            vec2 secTileOrigin = floor(liquid_vMapUv2 / cTileSize) * cTileSize;
            liquid_vMapUv2 = secTileOrigin + clamp(subUv, 0.002, 0.998) * cTileSize;
          }
        }
        `}
        #define vMapUv liquid_vMapUv
      #endif
      
      #include <map_fragment>
      
      #ifdef USE_MAP
        #undef vMapUv
        if (vBlendWeight > 0.005) {
          vec4 texB = texture2D(map, liquid_vMapUv2);
          diffuseColor.rgb = mix(diffuseColor.rgb, texB.rgb, clamp(vBlendWeight, 0.0, 1.0));
        }
      #endif
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #ifdef USE_EMISSIVEMAP
        vec2 liquid_vEmissiveMapUv = vEmissiveMapUv;
        // Molten Corruption (Index 42)
        if (liquid_vEmissiveMapUv.x >= ${magmaU0.toFixed(6)} && liquid_vEmissiveMapUv.x <= ${magmaU1.toFixed(6)} && liquid_vEmissiveMapUv.y >= ${magmaV0.toFixed(6)} && liquid_vEmissiveMapUv.y <= ${magmaV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.05, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.6) * 0.003;
          liquid_vEmissiveMapUv.y = ${magmaV0.toFixed(6)} + mod(liquid_vEmissiveMapUv.y - ${magmaV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vEmissiveMapUv.x = ${magmaU0.toFixed(6)} + mod(liquid_vEmissiveMapUv.x - ${magmaU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Normal Water (Index 8)
        else if (liquid_vEmissiveMapUv.x >= ${waterU0.toFixed(6)} && liquid_vEmissiveMapUv.x <= ${waterU1.toFixed(6)} && liquid_vEmissiveMapUv.y >= ${waterV0.toFixed(6)} && liquid_vEmissiveMapUv.y <= ${waterV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.03, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.5) * 0.004;
          liquid_vEmissiveMapUv.y = ${waterV0.toFixed(6)} + mod(liquid_vEmissiveMapUv.y - ${waterV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vEmissiveMapUv.x = ${waterU0.toFixed(6)} + mod(liquid_vEmissiveMapUv.x - ${waterU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Oasis Water (Index 54)
        else if (liquid_vEmissiveMapUv.x >= ${oasisU0.toFixed(6)} && liquid_vEmissiveMapUv.x <= ${oasisU1.toFixed(6)} && liquid_vEmissiveMapUv.y >= ${oasisV0.toFixed(6)} && liquid_vEmissiveMapUv.y <= ${oasisV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.03, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.5) * 0.004;
          liquid_vEmissiveMapUv.y = ${oasisV0.toFixed(6)} + mod(liquid_vEmissiveMapUv.y - ${oasisV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vEmissiveMapUv.x = ${oasisU0.toFixed(6)} + mod(liquid_vEmissiveMapUv.x - ${oasisU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        // Jungle Water (Index 92)
        else if (liquid_vEmissiveMapUv.x >= ${jungleWaterU0.toFixed(6)} && liquid_vEmissiveMapUv.x <= ${jungleWaterU1.toFixed(6)} && liquid_vEmissiveMapUv.y >= ${jungleWaterV0.toFixed(6)} && liquid_vEmissiveMapUv.y <= ${jungleWaterV1.toFixed(6)}) {
          float flowY = mod(uMagmaTime * 0.035, ${tileSizeY.toFixed(6)});
          float flowX = sin(uMagmaTime * 0.55) * 0.004;
          liquid_vEmissiveMapUv.y = ${jungleWaterV0.toFixed(6)} + mod(liquid_vEmissiveMapUv.y - ${jungleWaterV0.toFixed(6)} + flowY, ${tileSizeY.toFixed(6)});
          liquid_vEmissiveMapUv.x = ${jungleWaterU0.toFixed(6)} + mod(liquid_vEmissiveMapUv.x - ${jungleWaterU0.toFixed(6)} + flowX, ${tileSizeX.toFixed(6)});
        }
        ${isTransparent ? '' : `
        else {
          vec2 cTileSize = vec2(${tileSizeX.toFixed(6)}, ${tileSizeY.toFixed(6)});
          vec2 tileOrigin = floor(liquid_vEmissiveMapUv / cTileSize) * cTileSize;
          vec3 aNorm = abs(vWorldNormal);
          vec2 subUv;

          if (aNorm.y >= aNorm.x && aNorm.y >= aNorm.z) {
            subUv = vec2(fract(vWorldPos.x), fract(-vWorldPos.z));
          } else if (aNorm.x >= aNorm.z) {
            subUv = vec2(fract(vWorldPos.z), fract(vWorldPos.y * 2.0));
          } else {
            subUv = vec2(fract(vWorldPos.x), fract(vWorldPos.y * 2.0));
          }

          liquid_vEmissiveMapUv = tileOrigin + clamp(subUv, 0.002, 0.998) * cTileSize;
        }
        `}
        #define vEmissiveMapUv liquid_vEmissiveMapUv
      #endif
      
      #include <emissivemap_fragment>
      
      #ifdef USE_EMISSIVEMAP
        #undef vEmissiveMapUv
      #endif
      `
    );
  };
}

export interface TreePOI {
  x: number; // World X
  y: number; // Base ground Y
  z: number; // World Z
  localX: number;
  localZ: number;
  type: 'oak' | 'frost' | 'petrified' | 'rainforest' | 'sunwood';
  trunkHeight: number;
  canopyRadius: number;
}

export interface ShorelinePOI {
  x: number; // World X
  y: number; // Soil surface Y
  z: number; // World Z
  localX: number;
  localZ: number;
  soilType: BlockType;
}

export interface ChunkPOIMetadata {
  trees: TreePOI[];
  shorelines: ShorelinePOI[];
  hasWater: boolean;
  hasLava: boolean;
  hasQuicksand: boolean;
  waterSurfaceY: number | null;
}

export class Chunk {
  public static readonly SIZE = 16;
  public static readonly HEIGHT = 64;
  public static readonly WATER_LEVEL = 18;

  public readonly chunkX: number;
  public readonly chunkZ: number;
  public readonly worldX: number;
  public readonly worldZ: number;

  public blocks: Uint8Array;
  public isDirty: boolean = true;
  public mesh: THREE.Mesh | null = null;
  public transparentMesh: THREE.Mesh | null = null;
  public emissiveMesh: THREE.Mesh | null = null;
  public glowingOrePositions: Array<{ x: number; y: number; z: number; type: BlockType }> = [];

  public heightMap: Uint8Array;
  public transitionSecondaryBlocks: Uint8Array;
  public transitionWeights: Float32Array;
  public instancedMeshes: THREE.InstancedMesh[] = [];
  public currentLOD: number = 0;

  // Spatial POI Metadata Cache (Fast O(1) lookups for resources, trees, shorelines, liquids)
  public poi: ChunkPOIMetadata = {
    trees: [],
    shorelines: [],
    hasWater: false,
    hasLava: false,
    hasQuicksand: false,
    waterSurfaceY: null,
  };

  // Water proximity stored as a single byte (0-255) computed once upon Chunk generation/loading
  public waterProximityByte: number = 0;

  // Pre-allocated static scratch buffers for Zero-GC 60 FPS chunk meshing
  private static readonly MAX_SOLID_FLOATS = 800000;
  private static scratchPositions = new Float32Array(Chunk.MAX_SOLID_FLOATS);
  private static scratchNormals = new Float32Array(Chunk.MAX_SOLID_FLOATS);
  private static scratchUvs = new Float32Array((Chunk.MAX_SOLID_FLOATS / 3) * 2);
  private static scratchUv2s = new Float32Array((Chunk.MAX_SOLID_FLOATS / 3) * 2);
  private static scratchBlendWeights = new Float32Array(Chunk.MAX_SOLID_FLOATS / 3);
  private static scratchColors = new Float32Array(Chunk.MAX_SOLID_FLOATS);

  private static readonly MAX_TRANS_FLOATS = 250000;
  private static scratchTransPositions = new Float32Array(Chunk.MAX_TRANS_FLOATS);
  private static scratchTransNormals = new Float32Array(Chunk.MAX_TRANS_FLOATS);
  private static scratchTransUvs = new Float32Array((Chunk.MAX_TRANS_FLOATS / 3) * 2);
  private static scratchTransUv2s = new Float32Array((Chunk.MAX_TRANS_FLOATS / 3) * 2);
  private static scratchTransBlendWeights = new Float32Array(Chunk.MAX_TRANS_FLOATS / 3);
  private static scratchTransColors = new Float32Array(Chunk.MAX_TRANS_FLOATS);

  private static readonly MAX_EMISSIVE_FLOATS = 150000;
  private static scratchEmissivePositions = new Float32Array(Chunk.MAX_EMISSIVE_FLOATS);
  private static scratchEmissiveNormals = new Float32Array(Chunk.MAX_EMISSIVE_FLOATS);
  private static scratchEmissiveUvs = new Float32Array((Chunk.MAX_EMISSIVE_FLOATS / 3) * 2);
  private static scratchEmissiveUv2s = new Float32Array((Chunk.MAX_EMISSIVE_FLOATS / 3) * 2);
  private static scratchEmissiveBlendWeights = new Float32Array(Chunk.MAX_EMISSIVE_FLOATS / 3);
  private static scratchEmissiveColors = new Float32Array(Chunk.MAX_EMISSIVE_FLOATS);

  constructor(chunkX: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.worldX = chunkX * Chunk.SIZE;
    this.worldZ = chunkZ * Chunk.SIZE;
    this.blocks = new Uint8Array(Chunk.SIZE * Chunk.HEIGHT * Chunk.SIZE);
    this.heightMap = new Uint8Array(Chunk.SIZE * Chunk.SIZE);
    this.transitionSecondaryBlocks = new Uint8Array(Chunk.SIZE * Chunk.SIZE);
    this.transitionWeights = new Float32Array(Chunk.SIZE * Chunk.SIZE);
  }

  public getWaterProximity(): number {
    return this.waterProximityByte / 255.0;
  }

  public getHeight(x: number, z: number): number {
    if (x < 0 || x >= Chunk.SIZE || z < 0 || z >= Chunk.SIZE) {
      return 0;
    }
    return this.heightMap[x * Chunk.SIZE + z];
  }

  private getIndex(x: number, y: number, z: number): number {
    return (y * Chunk.SIZE * Chunk.SIZE) + (z * Chunk.SIZE) + x;
  }

  public getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
      return BlockType.AIR;
    }
    return this.blocks[this.getIndex(x, y, z)] as BlockType;
  }

  public setBlock(x: number, y: number, z: number, type: BlockType): boolean {
    if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
      return false;
    }
    const idx = this.getIndex(x, y, z);
    if (this.blocks[idx] === type) return false;
    this.blocks[idx] = type;
    this.isDirty = true;
    if (type === BlockType.WATER || type === BlockType.JUNGLE_WATER || type === BlockType.OASIS_WATER) {
      this.waterProximityByte = Math.max(this.waterProximityByte, 128);
    }
    return true;
  }

  /**
   * Fast O(1) spatial check against cached Tree POIs in this chunk
   */
  public isNearTree(wx: number, wz: number, radius: number = 4.5): boolean {
    const rSq = radius * radius;
    for (let i = 0; i < this.poi.trees.length; i++) {
      const tree = this.poi.trees[i];
      const dx = tree.x - wx;
      const dz = tree.z - wz;
      if (dx * dx + dz * dz <= rSq) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns nearest Tree POI within maxDist
   */
  public getNearestTree(wx: number, wz: number, maxDist: number = 16.0): TreePOI | null {
    let nearest: TreePOI | null = null;
    let minDistSq = maxDist * maxDist;
    for (let i = 0; i < this.poi.trees.length; i++) {
      const tree = this.poi.trees[i];
      const dx = tree.x - wx;
      const dz = tree.z - wz;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearest = tree;
      }
    }
    return nearest;
  }

  /**
   * Checks if local chunk coordinate is a registered shoreline block
   */
  public isShoreline(localX: number, localZ: number): boolean {
    for (let i = 0; i < this.poi.shorelines.length; i++) {
      const shore = this.poi.shorelines[i];
      if (shore.localX === localX && shore.localZ === localZ) {
        return true;
      }
    }
    return false;
  }

  public generateTerrain(noise: TerrainNoise): void {
    const gen = this.generateTerrainGenerator(noise);
    let res = gen.next();
    while (!res.done) {
      res = gen.next();
    }
  }

  public async generateTerrainAsync(noise: TerrainNoise): Promise<void> {
    const gen = this.generateTerrainGenerator(noise);
    let res = gen.next();
    while (!res.done) {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
      res = gen.next();
    }
  }

  public *generateTerrainGenerator(noise: TerrainNoise): Generator<void, void, unknown> {
    this.poi = {
      trees: [],
      shorelines: [],
      hasWater: false,
      hasLava: false,
      hasQuicksand: false,
      waterSurfaceY: null,
    };

    // Flat 1D typed arrays for zero-GC, cache-friendly terrain generation
    const biomeTypeMap = new Uint8Array(Chunk.SIZE * Chunk.SIZE);
    const borderDistMap = new Float32Array(Chunk.SIZE * Chunk.SIZE);

    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let z = 0; z < Chunk.SIZE; z++) {
        const colIdx = x * Chunk.SIZE + z;
        const wx = this.worldX + x;
        const wz = this.worldZ + z;

        // Domain warping noise for organic natural biome boundaries (scaled for larger world)
        const warpX = noise.octaveNoise2D(wx, wz, 2, 0.5, 0.008) * 24;
        const warpZ = noise.octaveNoise2D(wx + 400, wz + 400, 2, 0.5, 0.008) * 24;

        const effectiveX = wx + warpX;
        const effectiveZ = wz + warpZ;

        // Boundaries: West = -160, North = -160, Central Grove = -160..40, Rainforest = 40..220, South Desert = 220+
        const isWestRuins = effectiveX < -160;
        const isNorthFrost = effectiveZ < -160 && !isWestRuins;
        const isSouthDesert = effectiveZ >= 220 && !isWestRuins;
        const isRainforest = effectiveZ >= 40 && effectiveZ < 220 && !isWestRuins;

        // Calculate distance to nearest biome boundary line
        const distWest = Math.abs(effectiveX - -160);
        const distNorth = Math.abs(effectiveZ - -160);
        const distRainforest = Math.abs(effectiveZ - 40);
        const distDesert = Math.abs(effectiveZ - 220);

        let borderDist = distWest;
        if (effectiveX >= -160) {
          borderDist = Math.min(distNorth, distRainforest, distDesert);
        }
        borderDistMap[colIdx] = borderDist;

        let biomeId = 0; // 'grove'
        if (isWestRuins) {
          biomeId = 2; // 'ruins'
        } else if (isNorthFrost) {
          biomeId = 1; // 'frost'
        } else if (isSouthDesert) {
          biomeId = 3; // 'sunscorched'
        } else if (isRainforest) {
          biomeId = 4; // 'rainforest'
        } else {
          biomeId = 0; // 'grove'
        }

        biomeTypeMap[colIdx] = biomeId;

        // Multi-Texture Crossfade Opacity Calculation (8-block natural transition corridor)
        const TRANSITION_HALF_WIDTH = 4.0;
        const dxWest = effectiveX - -160;
        const dzNorth = effectiveZ - -160;
        const dzRainforest = effectiveZ - 40;
        const dzDesert = effectiveZ - 220;

        let secBiome: 'frost' | 'ruins' | 'sunscorched' | 'grove' | 'rainforest' | null = null;
        let blendWeight = 0.0;

        // 1. West Boundary (Ashen Ruins at X = -160)
        if (Math.abs(dxWest) <= TRANSITION_HALF_WIDTH) {
          let eastBiome: 'frost' | 'sunscorched' | 'grove' | 'rainforest' = 'grove';
          if (effectiveZ < -160) eastBiome = 'frost';
          else if (effectiveZ >= 220) eastBiome = 'sunscorched';
          else if (effectiveZ >= 40) eastBiome = 'rainforest';
          else eastBiome = 'grove';

          if (dxWest < 0) {
            secBiome = eastBiome;
            blendWeight = (dxWest + TRANSITION_HALF_WIDTH) / (2.0 * TRANSITION_HALF_WIDTH);
          } else {
            secBiome = 'ruins';
            blendWeight = (TRANSITION_HALF_WIDTH - dxWest) / (2.0 * TRANSITION_HALF_WIDTH);
          }
        }
        // 2. North Boundary (Frost vs Grove at Z = -160, only for Eastern biomes X >= -160)
        else if (effectiveX >= -160 && Math.abs(dzNorth) <= TRANSITION_HALF_WIDTH) {
          if (dzNorth < 0) {
            secBiome = 'grove';
            blendWeight = (dzNorth + TRANSITION_HALF_WIDTH) / (2.0 * TRANSITION_HALF_WIDTH);
          } else {
            secBiome = 'frost';
            blendWeight = (TRANSITION_HALF_WIDTH - dzNorth) / (2.0 * TRANSITION_HALF_WIDTH);
          }
        }
        // 3. Rainforest Boundary (Grove vs Rainforest at Z = 40, only for Eastern biomes X >= -160)
        else if (effectiveX >= -160 && Math.abs(dzRainforest) <= TRANSITION_HALF_WIDTH) {
          if (dzRainforest < 0) {
            secBiome = 'rainforest';
            blendWeight = (dzRainforest + TRANSITION_HALF_WIDTH) / (2.0 * TRANSITION_HALF_WIDTH);
          } else {
            secBiome = 'grove';
            blendWeight = (TRANSITION_HALF_WIDTH - dzRainforest) / (2.0 * TRANSITION_HALF_WIDTH);
          }
        }
        // 4. Desert Boundary (Rainforest vs Desert at Z = 220, only for Eastern biomes X >= -160)
        else if (effectiveX >= -160 && Math.abs(dzDesert) <= TRANSITION_HALF_WIDTH) {
          if (dzDesert < 0) {
            secBiome = 'sunscorched';
            blendWeight = (dzDesert + TRANSITION_HALF_WIDTH) / (2.0 * TRANSITION_HALF_WIDTH);
          } else {
            secBiome = 'rainforest';
            blendWeight = (TRANSITION_HALF_WIDTH - dzDesert) / (2.0 * TRANSITION_HALF_WIDTH);
          }
        }

        let secBlock: BlockType = BlockType.AIR;
        if (secBiome === 'grove') secBlock = BlockType.GRASS;
        else if (secBiome === 'rainforest') secBlock = BlockType.MOSSVEIL_MUD;
        else if (secBiome === 'sunscorched') secBlock = BlockType.DESERT_SAND;
        else if (secBiome === 'frost') secBlock = BlockType.SNOW;
        else if (secBiome === 'ruins') secBlock = BlockType.ASHEN_SOIL;

        this.transitionSecondaryBlocks[colIdx] = secBlock;
        this.transitionWeights[colIdx] = secBlock !== BlockType.AIR ? Math.min(Math.max(blendWeight, 0.0), 1.0) : 0.0;
      }
    }

    // Micro-task yield after Biome boundary pass
    yield;

    // Pass 2: Terrain & Voxel Block Placement
    for (let x = 0; x < Chunk.SIZE; x++) {
      if (x > 0 && x % 4 === 0) {
        // Micro-task yield every 4 X slices to keep browser UI frame rate at 60 FPS
        yield;
      }
      for (let z = 0; z < Chunk.SIZE; z++) {
        const colIdx = x * Chunk.SIZE + z;
        const wx = this.worldX + x;
        const wz = this.worldZ + z;
        const biome = BIOME_NAMES[biomeTypeMap[colIdx]];
        // 1. Continental noise: determines WHERE mountain ranges vs plains exist
        const continentalRaw = noise.octaveNoise2D(wx, wz, 2, 0.5, 0.0012);
        const mountainRegion = (continentalRaw + 1.0) * 0.5; // 0.0 (flat plains) to 1.0 (mountain core)

        // 2. Base detail noise (small-scale hills and undulation)
        const baseDetail = noise.octaveNoise2D(wx, wz, 4, 0.5, 0.008);

        // 3. Sharp mountain ridge noise (exponential peaks)
        const ridgeRaw = 1.0 - Math.abs(noise.octaveNoise2D(wx, wz, 3, 0.5, 0.004));
        const steepPeaks = Math.pow(ridgeRaw, 3) * 35; // Exponential scaling for jagged peaks

        // 4. Final uncarved height: Plains Y=20-28, Mountains Y=40-58
        const mountainBonus = Math.floor(mountainRegion * (baseDetail * 8 + steepPeaks));
        let height = Chunk.WATER_LEVEL + 2 + Math.floor(baseDetail * 5) + mountainBonus;

        // Clamp to world height limits
        height = Math.min(height, Chunk.HEIGHT - 6);

        // --- DESERT BIOME: Clamp terrain ABOVE sea level (dry arid landscape) ---
        if (biome === 'sunscorched') {
          height = Math.max(height, Chunk.WATER_LEVEL + 2);
        }

        // --- PRECISE RIVER CARVING (only affects non-desert biomes) ---
        if (biome !== 'sunscorched') {
          const riverRaw = Math.abs(noise.octaveNoise2D(wx, wz, 2, 0.5, 0.005));
          const riverWidth = 0.06;

          if (riverRaw < riverWidth) {
            const norm = riverRaw / riverWidth;
            const uShape = Math.cos(norm * Math.PI * 0.5);
            const targetRiverY = Chunk.WATER_LEVEL - 3;
            const carvedHeight = Math.floor(height - uShape * (height - targetRiverY));
            height = Math.max(targetRiverY, carvedHeight);
          }
        }
        this.heightMap[colIdx] = height;

        // --- DEEP UNDERWORLD CAVERN & CHAMBER GENERATION ---
        const uwCeilingBase = 26;
        const uwFloorBase = 4;
        
        // 1. Rolling cavern floor landscape
        const uwContinental = noise.octaveNoise2D(wx, wz, 2, 0.5, 0.006);
        const uwMountains = Math.floor(((uwContinental + 1.0) * 0.5) * 12); // +0..12
        const uwDetail = noise.octaveNoise2D(wx + 500, wz - 500, 4, 0.5, 0.015);
        const uwFloorHeight = uwFloorBase + uwMountains + Math.floor(uwDetail * 3);
        
        // 2. Undulating cavern ceiling (sealed well below surface)
        const uwCeilDetail = noise.octaveNoise2D(wx - 200, wz + 200, 3, 0.5, 0.01);
        const uwCeilingHeight = Math.min(
          uwCeilingBase - Math.floor(((uwCeilDetail + 1.0) * 0.5) * 6),
          height - 8
        );

        // 3. Regional Cavern Chamber Mask: Creates distinct cavern rooms, halls, and solid dividing walls
        const chamberMask = (noise.octaveNoise2D(wx + 1337, wz - 1337, 2, 0.5, 0.007) + 1.0) * 0.5; // 0.0 to 1.0

        // 4. Biome Boundary Separation Wall: Creates a thick solid rock partition wall separating different biome caverns
        const borderDist = borderDistMap[colIdx];
        const isBiomeBoundaryWall = borderDist < 8.0; // ~16 block thick solid dividing mountain wall between biomes

        for (let y = 0; y < Chunk.HEIGHT; y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BlockType.BEDROCK);
          } else if (y < height - 3) {
            let isAir = false;
            
            // A) Cavern Chambers (tightened threshold with robust pillar/arch support structure)
            if (!isBiomeBoundaryWall && chamberMask > 0.50 && y > uwFloorHeight && y < uwCeilingHeight && y < height - 8) {
              // 3D Pillar / Column Noise: forms thick rock pillars, stalactites, and arches inside chambers
              const pillarNoise = noise.noise3DVal(wx, y, wz, 0.035);
              if (pillarNoise <= 0.38) {
                isAir = true;
              }
            }
            
            // B) 3D Winding Cave Tunnels & Tight Passages
            const caveVal = noise.noise3DVal(wx, y, wz, 0.048);
            if (caveVal > 0.50 && y > 3 && y < height - 7) {
              isAir = true;
            }

            if (isAir) {
              this.setBlock(x, y, z, BlockType.AIR);
            } else {
              const oreRand = Math.random();
              // Helper: Determine stone type with 3D dithered noise blending near biome boundaries
              // Eliminates sharp vertical material seams along cavern walls where biomes meet
              const getDitheredStone = (primaryStone: BlockType): BlockType => {
                if (borderDist < 6.0) {
                  const ditherNoise = noise.noise3DVal(wx, y, wz, 0.14);
                  const effectiveX = wx + (noise.octaveNoise2D(wx, wz, 2, 0.5, 0.008) * 32);
                  const distFromRuins = effectiveX - (-160);
                  const ashenWeight = THREE.MathUtils.clamp(0.5 - distFromRuins / 10.0, 0.0, 1.0);
                  if (ditherNoise < (ashenWeight * 2.0 - 1.0)) {
                    return BlockType.NETHER_STONE;
                  } else {
                    return primaryStone === BlockType.NETHER_STONE ? BlockType.STONE : primaryStone;
                  }
                }
                return primaryStone;
              };

              if (biome === 'frost') {
                if (oreRand < 0.08) {
                  this.setBlock(x, y, z, BlockType.FROST_ORE);
                } else {
                  this.setBlock(x, y, z, getDitheredStone(BlockType.FROST_STONE));
                }
              } else if (biome === 'ruins') {
                // --- STRICT HIGH-FREQUENCY DEPTH-STRATIFIED ORE BALANCING ---
                // Silver Ore = RARE (y <= 16, small high-frequency 2-3 block veins)
                // Gold Ore   = SUPER RARE (y <= 10, deep isolated 1-2 block nodes)
                // Primordium = LEGENDARY (y <= 5, solitary bedrock node)
                // Corrupted  = ULTRA RARE (y <= 8, tiny deep crevice node)
                // Copper     = UNCOMMON (y >= 12, standalone patches, suppressed near high-tier ores)

                let oreType: BlockType | null = null;

                // Legendary — Abyssal Primordium: Restricted to deepest bedrock floor (y <= 5), solitary single node
                if (y <= 5) {
                  const abyssalNoise = noise.noise3DVal(wx - 25000, y + 900, wz - 25000, 0.12);
                  if (abyssalNoise > 0.87) {
                    oreType = BlockType.ASHEN_ABYSSAL_PRIMORDIUM;
                  }
                }
                // Ultra Rare — Corrupted Crystal Ore: Deep abyssal crevices (y <= 8), tiny 1-2 block nodes
                if (oreType === null && y <= 8) {
                  const corruptNoise = noise.noise3DVal(wx + 20000, y - 700, wz + 20000, 0.15);
                  if (corruptNoise > 0.84) {
                    oreType = BlockType.CORRUPTED_ORE;
                  }
                }
                // SUPER RARE — Ashen Gold Ore: Deep cave pockets (y <= 10), small scarce 1-2 block nodes
                if (oreType === null && y <= 10) {
                  const goldNoise = noise.noise3DVal(wx - 9000, y + 500, wz + 15000, 0.20);
                  if (goldNoise > 0.85) {
                    oreType = BlockType.ASHEN_GOLD_ORE;
                  }
                }
                // RARE — Ashen Silver Ore: Mid-to-lower cave depths (y <= 16), small clean 2-3 block veins
                if (oreType === null && y <= 16) {
                  const silverNoise = noise.noise3DVal(wx + 12000, y + 300, wz - 8000, 0.18);
                  if (silverNoise > 0.81) {
                    oreType = BlockType.ASHEN_SILVER_ORE;
                  }
                }
                // UNCOMMON — Copper Ore: Mid/upper caverns (y >= 12), standalone patches
                if (oreType === null && y >= 12) {
                  const copperNoise = noise.noise3DVal(wx + 5000, y + 100, wz + 5000, 0.14);
                  if (copperNoise > 0.72) {
                    oreType = BlockType.ASHEN_COPPER_ORE;
                  }
                }

                if (oreType !== null) {
                  this.setBlock(x, y, z, oreType);
                } else {
                  this.setBlock(x, y, z, getDitheredStone(BlockType.NETHER_STONE));
                }
              } else if (biome === 'sunscorched') {
                if (oreRand < 0.08) {
                  this.setBlock(x, y, z, BlockType.SUNSTONE_ORE);
                } else {
                  this.setBlock(x, y, z, getDitheredStone(BlockType.SUNSCORCHED_SANDSTONE));
                }
              } else if (biome === 'rainforest') {
                if (y < 25 && oreRand < 0.04) {
                  this.setBlock(x, y, z, BlockType.GOLD_ORE);
                } else if (y < 35 && oreRand < 0.06) {
                  this.setBlock(x, y, z, BlockType.IRON_ORE);
                } else if (oreRand < 0.08) {
                  this.setBlock(x, y, z, BlockType.COAL_ORE);
                } else {
                  this.setBlock(x, y, z, getDitheredStone(BlockType.MOSSVEIL_MOSSY_STONE));
                }
              } else {
                if (y < 25 && oreRand < 0.04) {
                  this.setBlock(x, y, z, BlockType.GOLD_ORE);
                } else if (y < 35 && oreRand < 0.06) {
                  this.setBlock(x, y, z, BlockType.IRON_ORE);
                } else if (oreRand < 0.08) {
                  this.setBlock(x, y, z, BlockType.COAL_ORE);
                } else {
                  this.setBlock(x, y, z, getDitheredStone(BlockType.STONE));
                }
              }
            }
          } else if (y < height) {
            if (biome === 'frost') {
              this.setBlock(x, y, z, BlockType.PACKED_SNOW);
            } else if (biome === 'ruins') {
              this.setBlock(x, y, z, BlockType.ASHEN_SOIL);
            } else if (biome === 'sunscorched') {
              this.setBlock(x, y, z, BlockType.CRACKED_CLAY);
            } else if (biome === 'rainforest') {
              this.setBlock(x, y, z, BlockType.MOSSVEIL_MUD);
            } else {
              this.setBlock(x, y, z, BlockType.DIRT);
            }
          } else if (y === height) {
            if (height < Chunk.WATER_LEVEL) {
              if (biome === 'frost') {
                this.setBlock(x, y, z, BlockType.PACKED_SNOW);
              } else if (biome === 'ruins') {
                this.setBlock(x, y, z, BlockType.CINDER_SAND);
              } else if (biome === 'sunscorched') {
                this.setBlock(x, y, z, BlockType.DESERT_SAND);
              } else if (biome === 'rainforest') {
                this.setBlock(x, y, z, BlockType.MOSSVEIL_MUD);
              } else {
                this.setBlock(x, y, z, BlockType.SAND);
              }
            } else {
              if (biome === 'frost') {
                this.setBlock(x, y, z, BlockType.SNOW);
              } else if (biome === 'ruins') {
                this.setBlock(x, y, z, BlockType.ASHEN_SOIL);
              } else if (biome === 'sunscorched') {
                this.setBlock(x, y, z, BlockType.DESERT_SAND);
              } else if (biome === 'rainforest') {
                this.setBlock(x, y, z, BlockType.MOSSVEIL_MUD);
              } else {
                this.setBlock(x, y, z, BlockType.GRASS);
              }
            }
          } else if (y <= Chunk.WATER_LEVEL) {
            // Desert biome: NO global water fill (stays dry, oases added in Pass 4)
            if (biome === 'sunscorched') {
              this.setBlock(x, y, z, BlockType.AIR);
            } else if (biome === 'frost') {
              // Sub-zero frost biome: surface and subsurface are frozen solid Ice (never raw liquid water)
              this.setBlock(x, y, z, BlockType.ICE);
            } else if (biome === 'ruins') {
              this.setBlock(x, y, z, BlockType.MOLTEN_CORRUPTION);
            } else if (biome === 'rainforest') {
              this.setBlock(x, y, z, BlockType.JUNGLE_WATER);
            } else {
              this.setBlock(x, y, z, BlockType.WATER);
            }
          } else {
            this.setBlock(x, y, z, BlockType.AIR);
          }
        }
      }
    }

    // Pass 2b: Stepped Micro-Cubic Terrain & Stone Strata Ledges (Hytale/Stonehearth Style)
    // Replaces abrupt 1-block steps with crisp 90-degree stepped micro-cubes (0.25m / 0.50m) and stone shelves
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let z = 0; z < Chunk.SIZE; z++) {
        const colIdx = x * Chunk.SIZE + z;
        const h = this.heightMap[colIdx];
        if (h <= Chunk.WATER_LEVEL) continue; // Keep underwater beds as standard blocks

        const h_px = x < Chunk.SIZE - 1 ? this.heightMap[(x + 1) * Chunk.SIZE + z] : h;
        const h_nx = x > 0 ? this.heightMap[(x - 1) * Chunk.SIZE + z] : h;
        const h_pz = z < Chunk.SIZE - 1 ? this.heightMap[x * Chunk.SIZE + (z + 1)] : h;
        const h_nz = z > 0 ? this.heightMap[x * Chunk.SIZE + (z - 1)] : h;

        const currentBlock = this.getBlock(x, h, z);
        let subBlock: BlockType | null = null;

        // 1. Hillside Drops & Weathered Ridge Ledges (Place 90-degree Stepped Micro-Blocks)
        const d_nx = h - h_nx;
        const d_px = h - h_px;
        const d_nz = h - h_nz;
        const d_pz = h - h_pz;

        const maxDrop = Math.max(d_nx, d_px, d_nz, d_pz);
        if (maxDrop >= 1) {
          // Determine primary drop direction
          const dx = d_nx - d_px;
          const dz = d_nz - d_pz;

          if (Math.abs(dx) >= Math.abs(dz) && Math.abs(dx) > 0) {
            if (dx > 0) {
              // Drops towards -X
              if (currentBlock === BlockType.GRASS) subBlock = BlockType.GRASS_STEP_POS_X;
              else if (currentBlock === BlockType.DIRT) subBlock = BlockType.DIRT_STEP_POS_X;
              else if (currentBlock === BlockType.SAND || currentBlock === BlockType.DESERT_SAND) subBlock = BlockType.SAND_STEP_POS_X;
              else if (currentBlock === BlockType.SNOW || currentBlock === BlockType.PACKED_SNOW) subBlock = BlockType.SNOW_STEP_POS_X;
              else if (currentBlock === BlockType.MOSSVEIL_MUD || currentBlock === BlockType.RAINFOREST_GRASS) subBlock = BlockType.MOSSVEIL_MUD_STEP_POS_X;
              else if (currentBlock === BlockType.ASHEN_SOIL) subBlock = BlockType.ASHEN_SOIL_STEP_POS_X;
              else if (currentBlock === BlockType.STONE || currentBlock === BlockType.COBBLESTONE) subBlock = BlockType.COBBLESTONE_STEP_POS_X;
            } else {
              // Drops towards +X
              if (currentBlock === BlockType.GRASS) subBlock = BlockType.GRASS_STEP_NEG_X;
              else if (currentBlock === BlockType.DIRT) subBlock = BlockType.DIRT_STEP_NEG_X;
              else if (currentBlock === BlockType.SAND || currentBlock === BlockType.DESERT_SAND) subBlock = BlockType.SAND_STEP_NEG_X;
              else if (currentBlock === BlockType.SNOW || currentBlock === BlockType.PACKED_SNOW) subBlock = BlockType.SNOW_STEP_NEG_X;
              else if (currentBlock === BlockType.MOSSVEIL_MUD || currentBlock === BlockType.RAINFOREST_GRASS) subBlock = BlockType.MOSSVEIL_MUD_STEP_NEG_X;
              else if (currentBlock === BlockType.ASHEN_SOIL) subBlock = BlockType.ASHEN_SOIL_STEP_NEG_X;
              else if (currentBlock === BlockType.STONE || currentBlock === BlockType.COBBLESTONE) subBlock = BlockType.COBBLESTONE_STEP_NEG_X;
            }
          } else if (Math.abs(dz) > 0) {
            if (dz > 0) {
              // Drops towards -Z
              if (currentBlock === BlockType.GRASS) subBlock = BlockType.GRASS_STEP_POS_Z;
              else if (currentBlock === BlockType.DIRT) subBlock = BlockType.DIRT_STEP_POS_Z;
              else if (currentBlock === BlockType.SAND || currentBlock === BlockType.DESERT_SAND) subBlock = BlockType.SAND_STEP_POS_Z;
              else if (currentBlock === BlockType.SNOW || currentBlock === BlockType.PACKED_SNOW) subBlock = BlockType.SNOW_STEP_POS_Z;
              else if (currentBlock === BlockType.MOSSVEIL_MUD || currentBlock === BlockType.RAINFOREST_GRASS) subBlock = BlockType.MOSSVEIL_MUD_STEP_POS_Z;
              else if (currentBlock === BlockType.ASHEN_SOIL) subBlock = BlockType.ASHEN_SOIL_STEP_POS_Z;
              else if (currentBlock === BlockType.STONE || currentBlock === BlockType.COBBLESTONE) subBlock = BlockType.COBBLESTONE_STEP_POS_Z;
            } else {
              // Drops towards +Z
              if (currentBlock === BlockType.GRASS) subBlock = BlockType.GRASS_STEP_NEG_Z;
              else if (currentBlock === BlockType.DIRT) subBlock = BlockType.DIRT_STEP_NEG_Z;
              else if (currentBlock === BlockType.SAND || currentBlock === BlockType.DESERT_SAND) subBlock = BlockType.SAND_STEP_NEG_Z;
              else if (currentBlock === BlockType.SNOW || currentBlock === BlockType.PACKED_SNOW) subBlock = BlockType.SNOW_STEP_NEG_Z;
              else if (currentBlock === BlockType.MOSSVEIL_MUD || currentBlock === BlockType.RAINFOREST_GRASS) subBlock = BlockType.MOSSVEIL_MUD_STEP_NEG_Z;
              else if (currentBlock === BlockType.ASHEN_SOIL) subBlock = BlockType.ASHEN_SOIL_STEP_NEG_Z;
              else if (currentBlock === BlockType.STONE || currentBlock === BlockType.COBBLESTONE) subBlock = BlockType.COBBLESTONE_STEP_NEG_Z;
            }
          }
        } else if (h === Chunk.WATER_LEVEL + 1) {
          // 3. Shorelines & Coastline Ledges (Clean 0.25m Half-Slabs stepping into water)
          if (h_px <= Chunk.WATER_LEVEL || h_nx <= Chunk.WATER_LEVEL || h_pz <= Chunk.WATER_LEVEL || h_nz <= Chunk.WATER_LEVEL) {
            if (currentBlock === BlockType.GRASS) subBlock = BlockType.GRASS_SLAB;
            else if (currentBlock === BlockType.SAND || currentBlock === BlockType.DESERT_SAND) subBlock = BlockType.SAND_SLAB;
            else if (currentBlock === BlockType.MOSSVEIL_MUD) subBlock = BlockType.MOSSVEIL_MUD_SLAB;
            else if (currentBlock === BlockType.SNOW) subBlock = BlockType.SNOW_SLAB;
            else if (currentBlock === BlockType.ASHEN_SOIL) subBlock = BlockType.ASHEN_SOIL_SLAB;
          }
        }

        if (subBlock !== null) {
          this.setBlock(x, h, z, subBlock);
        }
      }
    }

    // Record Shoreline POIs where land meets water for instant O(1) resource population
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let z = 0; z < Chunk.SIZE; z++) {
        const colIdx = x * Chunk.SIZE + z;
        const h = this.heightMap[colIdx];
        if (h < Chunk.WATER_LEVEL) {
          const biome = BIOME_NAMES[biomeTypeMap[colIdx]];
          if (biome === 'ruins') {
            this.poi.hasLava = true;
          } else if (biome !== 'sunscorched') {
            this.poi.hasWater = true;
            this.poi.waterSurfaceY = Chunk.WATER_LEVEL;
          }
        } else if (h >= Chunk.WATER_LEVEL - 1 && h <= Chunk.WATER_LEVEL + 4) {
          const topBlock = this.getBlock(x, h, z);
          if (
            topBlock === BlockType.GRASS ||
            topBlock === BlockType.DIRT ||
            topBlock === BlockType.SAND ||
            topBlock === BlockType.MOSSVEIL_MUD ||
            topBlock === BlockType.RAINFOREST_GRASS ||
            topBlock === BlockType.RAINFOREST_SOIL ||
            topBlock === BlockType.MOSSVEIL_ROOT_TANGLE ||
            topBlock === BlockType.CRACKED_CLAY ||
            topBlock === BlockType.SCRUBGRASS
          ) {
            let isNearWater = false;
            const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dz] of offsets) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx >= 0 && nx < Chunk.SIZE && nz >= 0 && nz < Chunk.SIZE) {
                if (this.heightMap[nx * Chunk.SIZE + nz] < Chunk.WATER_LEVEL) {
                  isNearWater = true;
                  break;
                }
              } else {
                isNearWater = true;
                break;
              }
            }
            if (isNearWater) {
              this.poi.shorelines.push({
                x: this.worldX + x,
                y: h,
                z: this.worldZ + z,
                localX: x,
                localZ: z,
                soilType: topBlock,
              });
            }
          }
        }
      }
    }

    // Helper to evaluate terrain height, biome, and surface block for trees that cross chunk boundaries
    const sampleTerrain = (sampleWx: number, sampleWz: number): { height: number; biome: 'frost' | 'ruins' | 'sunscorched' | 'grove' | 'rainforest'; surfaceBlock: BlockType } => {
      const warpX = noise.octaveNoise2D(sampleWx, sampleWz, 2, 0.5, 0.008) * 24;
      const warpZ = noise.octaveNoise2D(sampleWx + 400, sampleWz + 400, 2, 0.5, 0.008) * 24;
      const effectiveX = sampleWx + warpX;
      const effectiveZ = sampleWz + warpZ;

      const isWestRuins = effectiveX < -160;
      const isNorthFrost = effectiveZ < -160 && !isWestRuins;
      const isSouthDesert = effectiveZ >= 220 && !isWestRuins;
      const isRainforest = effectiveZ >= 40 && effectiveZ < 220 && !isWestRuins;

      let biome: 'frost' | 'ruins' | 'sunscorched' | 'grove' | 'rainforest' = 'grove';
      if (isWestRuins) biome = 'ruins';
      else if (isNorthFrost) biome = 'frost';
      else if (isSouthDesert) biome = 'sunscorched';
      else if (isRainforest) biome = 'rainforest';

      const continentalRaw = noise.octaveNoise2D(sampleWx, sampleWz, 2, 0.5, 0.0012);
      const mountainRegion = (continentalRaw + 1.0) * 0.5;
      const baseDetail = noise.octaveNoise2D(sampleWx, sampleWz, 4, 0.5, 0.008);
      const ridgeRaw = 1.0 - Math.abs(noise.octaveNoise2D(sampleWx, sampleWz, 3, 0.5, 0.004));
      const steepPeaks = Math.pow(ridgeRaw, 3) * 35;
      const mountainBonus = Math.floor(mountainRegion * (baseDetail * 8 + steepPeaks));
      let height = Chunk.WATER_LEVEL + 2 + Math.floor(baseDetail * 5) + mountainBonus;
      height = Math.min(height, Chunk.HEIGHT - 6);

      if (biome === 'sunscorched') {
        height = Math.max(height, Chunk.WATER_LEVEL + 2);
      } else {
        const riverRaw = Math.abs(noise.octaveNoise2D(sampleWx, sampleWz, 2, 0.5, 0.005));
        const riverWidth = 0.06;
        if (riverRaw < riverWidth) {
          const norm = riverRaw / riverWidth;
          const uShape = Math.cos(norm * Math.PI * 0.5);
          const targetRiverY = Chunk.WATER_LEVEL - 3;
          const carvedHeight = Math.floor(height - uShape * (height - targetRiverY));
          height = Math.max(targetRiverY, carvedHeight);
        }
      }

      let surfaceBlock = BlockType.GRASS;
      if (biome === 'frost') surfaceBlock = BlockType.SNOW;
      else if (biome === 'ruins') surfaceBlock = BlockType.ASHEN_SOIL;
      else if (biome === 'sunscorched') surfaceBlock = BlockType.DESERT_SAND;
      else if (biome === 'rainforest') surfaceBlock = BlockType.MOSSVEIL_MUD;

      return { height, biome, surfaceBlock };
    };

    // Pass 2: Plant trees across all biomes using global deterministic spatial cells
    // Tree canopies spread up to 6 blocks wide, so we scan world cells overlapping [this.worldX - 7 .. this.worldX + 22]
    const CELL_SIZE = 6;
    const minCellX = Math.floor((this.worldX - 7) / CELL_SIZE);
    const maxCellX = Math.floor((this.worldX + Chunk.SIZE + 7) / CELL_SIZE);
    const minCellZ = Math.floor((this.worldZ - 7) / CELL_SIZE);
    const maxCellZ = Math.floor((this.worldZ + Chunk.SIZE + 7) / CELL_SIZE);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        // Global deterministic hash per cell coordinates
        const cellHash = Math.abs(Math.sin(cx * 374761393 + cz * 668265263) * 43758.5453);
        const ox = Math.floor(((cellHash * 100) % 1) * (CELL_SIZE - 1));
        const oz = Math.floor(((cellHash * 1000) % 1) * (CELL_SIZE - 1));

        const treeWx = cx * CELL_SIZE + ox;
        const treeWz = cz * CELL_SIZE + oz;

        const localX = treeWx - this.worldX;
        const localZ = treeWz - this.worldZ;

        // Sample terrain height, biome, and surface block at tree trunk coordinate
        let height: number;
        let biome: string;
        let surfaceBlock: BlockType;

        if (localX >= 0 && localX < Chunk.SIZE && localZ >= 0 && localZ < Chunk.SIZE) {
          const colIdx = localX * Chunk.SIZE + localZ;
          height = this.heightMap[colIdx];
          biome = BIOME_NAMES[biomeTypeMap[colIdx]];
          surfaceBlock = this.getBlock(localX, height, localZ);
        } else {
          const samp = sampleTerrain(treeWx, treeWz);
          height = samp.height;
          biome = samp.biome;
          surfaceBlock = samp.surfaceBlock;
        }

        if (height <= Chunk.WATER_LEVEL + 2 || height >= Chunk.HEIGHT - 12) continue;

        // Winding Pathway Noise: Avoid placing trees directly in walking trails
        const pathNoise = noise.octaveNoise2D(treeWx, treeWz, 2, 0.5, 0.025);
        if (Math.abs(pathNoise) < 0.075) continue;

        const treeNoise = noise.octaveNoise2D(treeWx, treeWz, 2, 0.5, 0.06);
        const chance = (cellHash * 10000) % 1;

        if (biome === 'grove') {
          if ((surfaceBlock === BlockType.GRASS || surfaceBlock === BlockType.DIRT) && treeNoise > 0.10 && chance < 0.65) {
            this.plantTree(localX, height + 1, localZ, treeWx, treeWz);
          }
        } else if (biome === 'frost') {
          if ((surfaceBlock === BlockType.SNOW || surfaceBlock === BlockType.PACKED_SNOW) && treeNoise > 0.12 && chance < 0.55) {
            this.plantFrozenPineTree(localX, height + 1, localZ, treeWx, treeWz);
          }
        } else if (biome === 'ruins') {
          if ((surfaceBlock === BlockType.CORRUPTED_GROWTH || surfaceBlock === BlockType.ASHEN_SOIL) && treeNoise > 0.14 && chance < 0.50) {
            this.plantPetrifiedTree(localX, height + 1, localZ, treeWx, treeWz);
          }
        } else if (biome === 'rainforest') {
          if ((surfaceBlock === BlockType.MOSSVEIL_MUD || surfaceBlock === BlockType.RAINFOREST_GRASS || surfaceBlock === BlockType.RAINFOREST_SOIL) && treeNoise > 0.02 && chance < 0.85) {
            this.plantRainforestTree(localX, height + 1, localZ, treeWx, treeWz);
          }
        } else if (biome === 'sunscorched') {
          if ((surfaceBlock === BlockType.SCRUBGRASS || surfaceBlock === BlockType.DESERT_SAND || surfaceBlock === BlockType.CRACKED_CLAY) && treeNoise > 0.18 && chance < 0.40) {
            this.plantSunwoodTree(localX, height + 1, localZ, treeWx, treeWz);
          }
        }
      }
    }

    // Ground Flora & Bushes Pass (strictly within chunk bounds)
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let z = 0; z < Chunk.SIZE; z++) {
        const wx = this.worldX + x;
        const wz = this.worldZ + z;
        const colIdx = x * Chunk.SIZE + z;
        const height = this.heightMap[colIdx];
        const biome = BIOME_NAMES[biomeTypeMap[colIdx]];
        const surfaceBlock = this.getBlock(x, height, z);
        if (height <= Chunk.WATER_LEVEL + 2 || height >= Chunk.HEIGHT - 4) continue;

        const hashVal = Math.abs((wx * 73 + wz * 179 + (wx ^ wz) * 31) % 97);
        if (biome === 'grove') {
          if ((surfaceBlock === BlockType.GRASS || surfaceBlock === BlockType.DIRT) && (hashVal === 14 || hashVal === 33 || hashVal === 52)) {
            this.plantBushCluster(x, height + 1, z, BlockType.OAK_LEAVES, hashVal);
          }
        } else if (biome === 'frost') {
          if (hashVal === 15) {
            this.setBlock(x, height + 1, z, BlockType.FROST_BLOOM);
          } else if (hashVal === 41 || hashVal === 58) {
            this.plantBushCluster(x, height + 1, z, BlockType.FROST_LEAVES, hashVal);
          }
        } else if (biome === 'ruins') {
          if (hashVal === 37 || hashVal === 61 || hashVal === 19) {
            this.plantBushCluster(x, height + 1, z, BlockType.WITHERED_THORNS, hashVal);
          }
        } else if (biome === 'rainforest') {
          // Rare solitary undergrowth so the main forest paths remain open and clear
          if (hashVal === 14) {
            this.plantBushCluster(x, height + 1, z, BlockType.MOSSVEIL_THORNED_UNDERGROWTH, hashVal);
          }
        } else if (biome === 'sunscorched') {
          if (hashVal === 23) {
            this.setBlock(x, height + 1, z, BlockType.DESERT_BLOOM);
          } else if (hashVal === 45 || hashVal === 67) {
            this.plantBushCluster(x, height + 1, z, BlockType.PALM_FRONDS, hashVal);
          }
        }
      }
    }

    // Pass 3: Small Desert Oasis Pools (palm-shaded watering holes in Cinderdune Wastes)
    const chunkCenterBiome = BIOME_NAMES[biomeTypeMap[8 * Chunk.SIZE + 8]];
    if (chunkCenterBiome === 'sunscorched') {
      const chunkHash = Math.abs((this.worldX * 73856093 ^ this.worldZ * 19349663) % 100);
      // ~22% of desert chunks contain a small natural oasis watering hole
      if (chunkHash < 22) {
        const ox = 5 + (chunkHash % 6);
        const oz = 5 + ((chunkHash * 7) % 6);
        const baseH = this.heightMap[ox * Chunk.SIZE + oz];

        // Valid dune elevation
        if (baseH >= Chunk.WATER_LEVEL - 1 && baseH <= Chunk.WATER_LEVEL + 16) {
          const oasisRadius = 3.2 + (chunkHash % 3) * 0.4;
          const poolWaterY = baseH - 1;

          // 1. Carve basin and place Oasis Water & Sand/Clay bed
          for (let rdx = -5; rdx <= 5; rdx++) {
            for (let rdz = -5; rdz <= 5; rdz++) {
              const bx = ox + rdx;
              const bz = oz + rdz;
              if (bx < 0 || bx >= Chunk.SIZE || bz < 0 || bz >= Chunk.SIZE) continue;

              const dist = Math.sqrt(rdx * rdx + rdz * rdz);
              if (dist > oasisRadius + 1.2) continue;

              const localH = this.heightMap[bx * Chunk.SIZE + bz];

              if (dist <= oasisRadius - 0.7) {
                // Clear air above pool
                for (let y = Math.max(localH + 2, poolWaterY + 1); y > poolWaterY; y--) {
                  this.setBlock(bx, y, bz, BlockType.AIR);
                }
                // Pool Water
                this.setBlock(bx, poolWaterY, bz, BlockType.OASIS_WATER);
                this.setBlock(bx, poolWaterY - 1, bz, BlockType.OASIS_WATER);
                // Sand bed beneath pool
                this.setBlock(bx, poolWaterY - 2, bz, BlockType.DESERT_SAND);
              } else if (dist <= oasisRadius + 0.3) {
                // Bank rim: Scrubgrass & Clay
                this.setBlock(bx, poolWaterY, bz, (rdx + rdz) % 2 === 0 ? BlockType.SCRUBGRASS : BlockType.CRACKED_CLAY);
                for (let y = Math.max(localH + 2, poolWaterY + 1); y > poolWaterY; y--) {
                  this.setBlock(bx, y, bz, BlockType.AIR);
                }

                // River Reeds on the shallow bank
                if ((chunkHash + rdx * 3 + rdz) % 4 === 0) {
                  this.setBlock(bx, poolWaterY + 1, bz, BlockType.REEDS);
                }
              } else {
                // Outer ring transition: Cracked Clay
                this.setBlock(bx, localH, bz, BlockType.CRACKED_CLAY);
              }
            }
          }

          // 2. Place 1-2 Leaning Palm Trees on the oasis bank
          const palmAngles = [
            (chunkHash % 8) * (Math.PI / 4),
            ((chunkHash + 4) % 8) * (Math.PI / 4),
          ];
          const numPalms = 1 + (chunkHash % 2);

          for (let p = 0; p < numPalms; p++) {
            const angle = palmAngles[p];
            const px = Math.round(ox + Math.cos(angle) * (oasisRadius - 0.2));
            const pz = Math.round(oz + Math.sin(angle) * (oasisRadius - 0.2));
            if (px >= 1 && px < Chunk.SIZE - 1 && pz >= 1 && pz < Chunk.SIZE - 1) {
              const pWorldX = this.worldX + px;
              const pWorldZ = this.worldZ + pz;
              this.setBlock(px, poolWaterY, pz, BlockType.CRACKED_CLAY);
              this.plantSunwoodTree(px, poolWaterY + 1, pz, pWorldX, pWorldZ);
            }
          }

          // 3. Sacred Lotus Bloom floating on the water surface
          const bloomX = ox + ((chunkHash % 3) - 1);
          const bloomZ = oz + (((chunkHash * 3) % 3) - 1);
          if (bloomX >= 0 && bloomX < Chunk.SIZE && bloomZ >= 0 && bloomZ < Chunk.SIZE) {
            this.setBlock(bloomX, poolWaterY + 1, bloomZ, BlockType.DESERT_BLOOM);
          }
        }
      }
    }

    // Pass 4: Dedicated Mossveil Jungle Quicksand Puddle Pools with Thorn Bush Hazard Perimeter
    if (chunkCenterBiome === 'rainforest') {
      const chunkHash = Math.abs((this.worldX * 8191 ^ this.worldZ * 4093) % 100);
      // ~28% of rainforest chunks feature an isolated quicksand sinkhole hollow
      if (chunkHash < 28) {
        const px = 5 + (chunkHash % 6);
        const pz = 5 + ((chunkHash * 7) % 6);
        const baseH = this.heightMap[px * Chunk.SIZE + pz];

        if (baseH >= Chunk.WATER_LEVEL - 1 && baseH <= Chunk.WATER_LEVEL + 16) {
          const puddleRadius = 1.8 + (chunkHash % 3) * 0.4; // 1.8 to 2.6 blocks radius

          for (let rdx = -4; rdx <= 4; rdx++) {
            for (let rdz = -4; rdz <= 4; rdz++) {
              const bx = px + rdx;
              const bz = pz + rdz;
              if (bx < 0 || bx >= Chunk.SIZE || bz < 0 || bz >= Chunk.SIZE) continue;
              const dist = Math.sqrt(rdx * rdx + rdz * rdz);

              const localH = this.heightMap[bx * Chunk.SIZE + bz];
              if (dist <= puddleRadius) {
                // Quicksand core pit
                this.setBlock(bx, localH, bz, BlockType.MUDDY_QUICKSAND);
                if (localH > 1) this.setBlock(bx, localH - 1, bz, BlockType.MUDDY_QUICKSAND);
                if (localH > 2) this.setBlock(bx, localH - 2, bz, BlockType.MUDDY_QUICKSAND);
                if (localH > 3) this.setBlock(bx, localH - 3, bz, BlockType.MUDDY_QUICKSAND);
                if (localH > 4) this.setBlock(bx, localH - 4, bz, BlockType.MUDDY_QUICKSAND);
                // Clear any foliage directly above the quicksand
                this.setBlock(bx, localH + 1, bz, BlockType.AIR);
              } else if (dist <= puddleRadius + 1.6) {
                // Quicksand Perimeter: Spawn Thorned Undergrowth forming a tangled briar hazard rim
                const thornHash = Math.abs(((this.worldX + bx) * 47 + (this.worldZ + bz) * 89) % 100);
                if (thornHash < 60) {
                  if (this.getBlock(bx, localH + 1, bz) === BlockType.AIR) {
                    this.setBlock(bx, localH + 1, bz, BlockType.MOSSVEIL_THORNED_UNDERGROWTH);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Pre-calculate water proximity factor for this chunk (stored as a single byte 0-255)
    let waterBlocks = 0;
    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let z = 0; z < Chunk.SIZE; z++) {
        const colIdx = x * Chunk.SIZE + z;
        const h = this.heightMap[colIdx];
        if (h < Chunk.WATER_LEVEL) {
          const biome = BIOME_NAMES[biomeTypeMap[colIdx]];
          if (biome !== 'sunscorched' && biome !== 'ruins' && biome !== 'frost') {
            waterBlocks += (Chunk.WATER_LEVEL - h);
          }
        }
      }
    }
    if (this.poi.hasWater) {
      const factor = Math.min(1.0, Math.max(0.4, waterBlocks / 96.0));
      this.waterProximityByte = Math.round(factor * 255);
    } else if (this.poi.shorelines.length > 0) {
      const factor = Math.min(0.5, this.poi.shorelines.length / 16.0);
      this.waterProximityByte = Math.round(factor * 255);
    } else {
      this.waterProximityByte = 0;
    }
  }

  private plantSunwoodTree(tx: number, ty: number, tz: number, wx: number, wz: number): void {
    const randVal = Math.abs((wx * 1664525 + wz * 1013904223 + (wx ^ wz) * 31337)) % 100;

    let trunkHeight: number;
    if (randVal < 40) {
      // 40%: Small Palm (5 - 7 blocks)
      trunkHeight = 5 + (randVal % 3);
    } else if (randVal < 80) {
      // 40%: Medium Palm (8 - 10 blocks)
      trunkHeight = 8 + (randVal % 3);
    } else {
      // 20%: Tall Oasis Palm (11 - 15 blocks)
      trunkHeight = 11 + (randVal % 5);
    }

    let currX = tx;
    let currZ = tz;
    const slantX = trunkHeight >= 11 ? ((randVal % 2 === 0) ? 1 : -1) : 0;
    const slantZ = trunkHeight >= 11 ? ((randVal % 3 === 0) ? 1 : (randVal % 3 === 1) ? -1 : 0) : 0;

    for (let y = 0; y < trunkHeight; y++) {
      if (y > Math.floor(trunkHeight * 0.6)) {
        if (y === Math.floor(trunkHeight * 0.7)) currX += slantX;
        if (y === Math.floor(trunkHeight * 0.85)) currZ += slantZ;
      }

      if (ty + y < Chunk.HEIGHT) {
        this.setBlock(currX, ty + y, currZ, BlockType.PETRIFIED_SUNWOOD);
      }
    }

    const leafTop = ty + trunkHeight;
    const topX = currX;
    const topZ = currZ;

    const frondRadius = trunkHeight >= 11 ? 3 : 2;
    for (let ly = -2; ly <= 1; ly++) {
      const radius = ly <= 0 ? frondRadius : 1;
      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          if (radius === 2 && Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
          if (radius === 3 && (Math.abs(lx) + Math.abs(lz) > 4)) continue;
          const px = topX + lx;
          const py = leafTop + ly;
          const pz = topZ + lz;
          if (px >= 0 && px < Chunk.SIZE && py >= 0 && py < Chunk.HEIGHT && pz >= 0 && pz < Chunk.SIZE) {
            if (this.getBlock(px, py, pz) === BlockType.AIR) {
              this.setBlock(px, py, pz, BlockType.PALM_FRONDS);
            }
          }
        }
      }
    }

    // Register Tree POI
    this.poi.trees.push({
      x: wx,
      y: ty,
      z: wz,
      localX: tx,
      localZ: tz,
      type: 'sunwood',
      trunkHeight,
      canopyRadius: frondRadius + 0.5,
    });
  }

  public burningTreeSites: Array<{ x: number; y: number; z: number; dense: boolean }> = [];

  private plantPetrifiedTree(tx: number, ty: number, tz: number, wx: number, wz: number): void {
    const randVal = Math.abs((wx * 1664525 + wz * 1013904223 + (wx ^ wz) * 31337)) % 100;

    let trunkHeight: number;
    if (randVal < 40) {
      // 40%: Small Petrified (4 - 6 blocks)
      trunkHeight = 4 + (randVal % 3);
    } else if (randVal < 80) {
      // 40%: Medium Petrified (7 - 9 blocks)
      trunkHeight = 7 + (randVal % 3);
    } else {
      // 20%: Tall Petrified Spire (10 - 13 blocks)
      trunkHeight = 10 + (randVal % 4);
    }

    // Register Tree POI
    this.poi.trees.push({
      x: wx,
      y: ty,
      z: wz,
      localX: tx,
      localZ: tz,
      type: 'petrified',
      trunkHeight,
      canopyRadius: 2.5,
    });

    for (let y = 0; y < trunkHeight; y++) {
      if (ty + y < Chunk.HEIGHT) {
        this.setBlock(tx, ty + y, tz, BlockType.PETRIFIED_LOG);
      }
    }

    if (trunkHeight >= 6) {
      const bY = ty + Math.floor(trunkHeight * 0.65);
      if (bY < Chunk.HEIGHT) {
        this.setBlock(tx + 1, bY, tz, BlockType.PETRIFIED_BRANCH_1);
        this.setBlock(tx + 2, bY + 1, tz, BlockType.PETRIFIED_BRANCH_2);
        this.setBlock(tx - 1, bY + 1, tz, BlockType.PETRIFIED_BRANCH_1);
        this.setBlock(tx - 2, bY + 2, tz, BlockType.PETRIFIED_BRANCH_2);
        this.setBlock(tx, bY, tz + 1, BlockType.PETRIFIED_BRANCH_1);
        this.setBlock(tx, bY + 1, tz + 2, BlockType.PETRIFIED_BRANCH_2);
      }
    }

    // Tree Variation Selection for Nether Ruins:
    // - 40% (randVal < 40): Burning Trees with flaming ember leaves & smoke emitters
    // - 35% (randVal >= 40 && randVal < 75): Charred Grey Trees with dark charcoal ashy leaves
    // - 25% (randVal >= 75): Dead / Leafless Trees with bare petrified branches
    const treeVariant = randVal;
    if (treeVariant >= 75) {
      // Type C: Dead / Leafless Trees -> No leaves placed! Only bare petrified branches
      return;
    }

    const leafType = treeVariant < 40 ? BlockType.WITHERED_THORNS : BlockType.CHARRED_LEAVES;
    const leafTop = ty + trunkHeight;

    if (leafType === BlockType.WITHERED_THORNS) {
      // Register smoke particle emitter site at canopy top
      const isDenseSmoke = (randVal % 2 === 0);
      this.burningTreeSites.push({ x: wx, y: leafTop + 1, z: wz, dense: isDenseSmoke });
    }

    const minLy = trunkHeight >= 10 ? -3 : -2;
    for (let ly = minLy; ly <= 1; ly++) {
      const radius = ly <= 0 ? (trunkHeight >= 10 ? 3 : 2) : 1;
      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          if (radius >= 2 && Math.abs(lx) === radius && Math.abs(lz) === radius) continue;
          const px = tx + lx;
          const py = leafTop + ly;
          const pz = tz + lz;
          if (px >= 0 && px < Chunk.SIZE && py >= 0 && py < Chunk.HEIGHT && pz >= 0 && pz < Chunk.SIZE) {
            if (this.getBlock(px, py, pz) === BlockType.AIR) {
              this.setBlock(px, py, pz, leafType);
            }
          }
        }
      }
    }
  }

  private plantFrozenPineTree(tx: number, ty: number, tz: number, wx: number, wz: number): void {
    const randVal = Math.abs((wx * 1664525 + wz * 1013904223 + (wx ^ wz) * 31337)) % 100;

    let trunkHeight: number;
    let canopyClearance: number; // Clear walking headroom between ground and lowest needle layer

    if (randVal < 40) {
      // 40%: Medium Conifer (10 - 12 blocks tall -> 5.0m - 6.0m)
      trunkHeight = 10 + (randVal % 3);
      canopyClearance = 5; // 2.5m open headroom beneath canopy
    } else if (randVal < 80) {
      // 40%: Tall Frost Fir (13 - 16 blocks tall -> 6.5m - 8.0m)
      trunkHeight = 13 + (randVal % 4);
      canopyClearance = 5 + ((randVal >> 2) % 2); // 5 - 6 blocks (2.5m - 3.0m) clearance
    } else {
      // 20%: Grand Alpine Spire (17 - 22 blocks tall -> 8.5m - 11.0m)
      trunkHeight = 17 + (randVal % 6);
      canopyClearance = 6 + ((randVal >> 3) % 2); // 6 - 7 blocks (3.0m - 3.5m) clearance
    }

    // Register Tree POI
    this.poi.trees.push({
      x: wx,
      y: ty,
      z: wz,
      localX: tx,
      localZ: tz,
      type: 'frost',
      trunkHeight,
      canopyRadius: 3.0,
    });

    // Build vertical frozen wood trunk
    for (let y = 0; y < trunkHeight; y++) {
      if (ty + y < Chunk.HEIGHT) {
        this.setBlock(tx, ty + y, tz, BlockType.FROZEN_LOG);
      }
    }

    const leafTop = ty + trunkHeight;
    const leafBottom = ty + canopyClearance;

    // Generate layered pine tiers from leafTop down to leafBottom
    for (let py = leafBottom; py <= leafTop + 1; py++) {
      if (py < 0 || py >= Chunk.HEIGHT) continue;

      const layerFromTop = (leafTop + 1) - py; // 0 = topmost spire point, 1 = crown apex
      let radius = 0;

      if (layerFromTop === 0) {
        radius = 0; // Single needle spire tip on top of log
      } else if (layerFromTop === 1) {
        radius = 1; // 3x3 cross
      } else {
        // Tiered conical pattern with alternating layer expansion / waist indentation
        const tier = Math.floor((layerFromTop - 1) / 2);
        const isTierWaist = (layerFromTop % 2 === 0);
        const baseRadius = Math.min(3, 1 + tier);
        radius = isTierWaist ? Math.max(1, baseRadius - 1) : baseRadius;
      }

      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          // Cut outer corners for authentic coniferous evergreen shapes
          if (radius === 1 && Math.abs(lx) === 1 && Math.abs(lz) === 1 && layerFromTop <= 2) {
            continue; // Sharp point at top
          }
          if (radius >= 2 && Math.abs(lx) === radius && Math.abs(lz) === radius) {
            continue; // Cut 90-deg boxy corners
          }
          if (radius >= 3 && (Math.abs(lx) + Math.abs(lz) > 4)) {
            continue; // Cut outer diagonals
          }

          const px = tx + lx;
          const pz = tz + lz;
          if (px >= 0 && px < Chunk.SIZE && pz >= 0 && pz < Chunk.SIZE) {
            if (this.getBlock(px, py, pz) === BlockType.AIR) {
              this.setBlock(px, py, pz, BlockType.FROST_LEAVES);
            }
          }
        }
      }
    }
  }

  private plantSphereCanopy(cx: number, cy: number, cz: number, radius: number, leafType: BlockType, randSeed: number): void {
    const r2 = radius * radius;
    const ceilR = Math.ceil(radius);
    for (let dx = -ceilR; dx <= ceilR; dx++) {
      for (let dy = -ceilR; dy <= ceilR; dy++) {
        for (let dz = -ceilR; dz <= ceilR; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          // Organic corner jitter for natural foliage puffiness
          const jitter = ((dx * 3 + dy * 7 + dz * 11 + randSeed) % 3 === 0) ? 0.6 : 0.1;
          if (distSq <= r2 + jitter) {
            const px = cx + dx;
            const py = cy + dy;
            const pz = cz + dz;
            if (px >= 0 && px < Chunk.SIZE && py >= 0 && py < Chunk.HEIGHT && pz >= 0 && pz < Chunk.SIZE) {
              if (this.getBlock(px, py, pz) === BlockType.AIR) {
                this.setBlock(px, py, pz, leafType);
              }
            }
          }
        }
      }
    }
  }

  private plantBushCluster(bx: number, by: number, bz: number, leafType: BlockType, randSeed: number): void {
    if (bx >= 0 && bx < Chunk.SIZE && bz >= 0 && bz < Chunk.SIZE && by < Chunk.HEIGHT) {
      if (this.getBlock(bx, by, bz) === BlockType.AIR) {
        this.setBlock(bx, by, bz, leafType);
      }
    }

    const clusterShape = randSeed % 4;
    const offsets: Array<[number, number, number]> = [];

    if (clusterShape === 0) {
      offsets.push([1, 0, 0]);
    } else if (clusterShape === 1) {
      offsets.push([0, 0, 1]);
      offsets.push([-1, 0, 0]);
    } else if (clusterShape === 2) {
      offsets.push([-1, 0, 0]);
      offsets.push([0, 0, -1]);
    } else {
      offsets.push([1, 0, 0]);
      offsets.push([0, 0, 1]);
    }

    for (const [dx, dy, dz] of offsets) {
      const nx = bx + dx;
      const ny = by + dy;
      const nz = bz + dz;
      if (nx >= 1 && nx < Chunk.SIZE - 1 && nz >= 1 && nz < Chunk.SIZE - 1 && ny < Chunk.HEIGHT) {
        const groundType = this.getBlock(nx, ny - 1, nz);
        if (groundType !== BlockType.AIR && groundType !== BlockType.WATER && this.getBlock(nx, ny, nz) === BlockType.AIR) {
          this.setBlock(nx, ny, nz, leafType);
        }
      }
    }
  }

  private plantTree(tx: number, ty: number, tz: number, wx: number, wz: number): void {
    const randVal = Math.abs((wx * 1664525 + wz * 1013904223 + (wx ^ wz) * 31337)) % 100;

    // 1. Select Foliage Color Variant (Hytale Autumn & Fantasy Palettes)
    let leafType: BlockType = BlockType.OAK_LEAVES;
    if (randVal < 35) {
      leafType = BlockType.OAK_LEAVES;
    } else if (randVal < 55) {
      leafType = BlockType.TEAL_LEAVES;
    } else if (randVal < 75) {
      leafType = BlockType.BLUE_LEAVES;
    } else {
      leafType = BlockType.PURPLE_LEAVES;
    }

    // 2. Trunk Height (8 - 14 blocks -> 4.0m - 7.0m tall)
    const trunkHeight = 8 + (randVal % 7);

    // Register Tree POI
    this.poi.trees.push({
      x: wx,
      y: ty,
      z: wz,
      localX: tx,
      localZ: tz,
      type: 'oak',
      trunkHeight,
      canopyRadius: 4.2,
    });

    // 3. Build Sturdy Vertical Trunk
    for (let y = 0; y < trunkHeight; y++) {
      if (ty + y < Chunk.HEIGHT) {
        this.setBlock(tx, ty + y, tz, BlockType.OAK_LOG);
      }
    }

    // 4. Branching Skeleton (2 to 4 major spreading boughs, starting at ~60% height)
    const branchStartY = ty + Math.floor(trunkHeight * 0.60);
    const canopyNodes: Array<{ x: number; y: number; z: number; radius: number }> = [];

    // Central Crown Apex Node
    canopyNodes.push({ x: tx, y: ty + trunkHeight, z: tz, radius: 3.6 });

    const branchConfigs = [
      { dx: 1, dz: 0, logH: BlockType.OAK_LOG_X },
      { dx: -1, dz: 0, logH: BlockType.OAK_LOG_X },
      { dx: 0, dz: 1, logH: BlockType.OAK_LOG_Z },
      { dx: 0, dz: -1, logH: BlockType.OAK_LOG_Z },
      { dx: 1, dz: 1, logH: BlockType.OAK_LOG_X },
      { dx: -1, dz: 1, logH: BlockType.OAK_LOG_X },
      { dx: 1, dz: -1, logH: BlockType.OAK_LOG_Z },
      { dx: -1, dz: -1, logH: BlockType.OAK_LOG_Z },
    ];

    const numBranches = 2 + (randVal % 3); // 2 to 4 branches
    const startAngle = (randVal % 8);

    for (let b = 0; b < numBranches; b++) {
      const cfg = branchConfigs[(startAngle + b * 2) % branchConfigs.length];
      const branchReach = 2 + ((randVal + b) % 3); // 2 to 4 blocks reach
      const startH = branchStartY + (b % 3);

      let curX = tx;
      let curY = startH;
      let curZ = tz;

      for (let step = 1; step <= branchReach; step++) {
        const nextX = curX + cfg.dx;
        const nextZ = curZ + cfg.dz;

        // Progressive Tapering: Step 1 = 0.75m, Step 2 = 0.50m, Step 3+ = 0.25m
        const branchBlock = step === 1 ? BlockType.OAK_BRANCH_1 :
                            step === 2 ? BlockType.OAK_BRANCH_2 :
                            BlockType.OAK_BRANCH_3;

        // 1. Connect horizontally
        if (cfg.dx !== 0 && cfg.dz !== 0) {
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && curZ >= 0 && curZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, curZ, branchBlock);
          }
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        } else {
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        }

        // 2. Step upward with vertical riser branch
        if (step >= 1) {
          curY += 1;
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        }

        curX = nextX;
        curZ = nextZ;
      }

      canopyNodes.push({ x: curX, y: curY, z: curZ, radius: 2.8 + (b % 2) * 0.4 });
    }

    // 5. Plant Volumetric Billowing Cloud Canopy on all branch nodes (Hytale Image 2)
    for (let i = 0; i < canopyNodes.length; i++) {
      const node = canopyNodes[i];
      this.plantSphereCanopy(node.x, node.y, node.z, node.radius, leafType, randVal + i * 13);
    }
  }

  private plantRainforestTree(tx: number, ty: number, tz: number, wx: number, wz: number): void {
    const randVal = Math.abs((wx * 2246822507 + wz * 3266489917 + (wx ^ wz) * 668265263)) % 100;

    // 1. Grand Majestic Trunk Height (14 - 22 blocks tall -> 7.0m - 11.0m!)
    const trunkHeight = 14 + (randVal % 9);

    // Register Tree POI
    this.poi.trees.push({
      x: wx,
      y: ty,
      z: wz,
      localX: tx,
      localZ: tz,
      type: 'rainforest',
      trunkHeight,
      canopyRadius: 5.2,
    });

    // 2. Build Tall Vertical Rainforest Trunk
    for (let y = 0; y < trunkHeight; y++) {
      if (ty + y < Chunk.HEIGHT) {
        this.setBlock(tx, ty + y, tz, BlockType.JUNGLE_LOG);
      }
    }

    // 3. Wide Spreading Canopy Boughs (3 to 5 massive scaffold branches)
    const branchStartY = ty + Math.floor(trunkHeight * 0.65);
    const canopyNodes: Array<{ x: number; y: number; z: number; radius: number }> = [];

    // Central Crown Apex
    canopyNodes.push({ x: tx, y: ty + trunkHeight, z: tz, radius: 4.2 });

    const branchConfigs = [
      { dx: 1, dz: 0, logH: BlockType.JUNGLE_LOG_X },
      { dx: -1, dz: 0, logH: BlockType.JUNGLE_LOG_X },
      { dx: 0, dz: 1, logH: BlockType.JUNGLE_LOG_Z },
      { dx: 0, dz: -1, logH: BlockType.JUNGLE_LOG_Z },
      { dx: 1, dz: 1, logH: BlockType.JUNGLE_LOG_X },
      { dx: -1, dz: 1, logH: BlockType.JUNGLE_LOG_X },
      { dx: 1, dz: -1, logH: BlockType.JUNGLE_LOG_Z },
      { dx: -1, dz: -1, logH: BlockType.JUNGLE_LOG_Z },
    ];

    const numBranches = 3 + (randVal % 3); // 3 to 5 branches
    const startAngle = (randVal % 8);

    for (let b = 0; b < numBranches; b++) {
      const cfg = branchConfigs[(startAngle + b * 2) % branchConfigs.length];
      const branchReach = 3 + ((randVal + b) % 3); // 3 to 5 blocks reach
      const startH = branchStartY + (b % 4);

      let curX = tx;
      let curY = startH;
      let curZ = tz;

      for (let step = 1; step <= branchReach; step++) {
        const nextX = curX + cfg.dx;
        const nextZ = curZ + cfg.dz;

        // Progressive Tapering: Step 1 = 0.75m, Step 2 = 0.50m, Step 3+ = 0.25m
        const branchBlock = step === 1 ? BlockType.JUNGLE_BRANCH_1 :
                            step === 2 ? BlockType.JUNGLE_BRANCH_2 :
                            BlockType.JUNGLE_BRANCH_3;

        // Connect horizontally
        if (cfg.dx !== 0 && cfg.dz !== 0) {
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && curZ >= 0 && curZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, curZ, branchBlock);
          }
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        } else {
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        }

        // Step upward on alternating steps
        if (step % 2 === 1 || step === branchReach) {
          curY += 1;
          if (nextX >= 0 && nextX < Chunk.SIZE && curY < Chunk.HEIGHT && nextZ >= 0 && nextZ < Chunk.SIZE) {
            this.setBlock(nextX, curY, nextZ, branchBlock);
          }
        }

        curX = nextX;
        curZ = nextZ;
      }

      canopyNodes.push({ x: curX, y: curY, z: curZ, radius: 3.4 + (b % 2) * 0.5 });
    }

    // 4. Plant Broad Umbrella Canopies & Willow Drapes on all nodes (Hytale Image 1)
    for (let i = 0; i < canopyNodes.length; i++) {
      const node = canopyNodes[i];
      this.plantSphereCanopy(node.x, node.y, node.z, node.radius, BlockType.JUNGLE_LEAVES, randVal + i * 17);

      // Selective Hanging Vine Cords (Spawns 1-2 elegant harvestable vine cords on outer canopy boughs)
      if (i > 0) { // Skip trunk apex so central trunk remains clear and open
        const numDrapes = ((randVal + i * 5) % 3 === 0) ? 2 : 1;
        for (let d = 0; d < numDrapes; d++) {
          const angle = ((d / numDrapes) * Math.PI * 2) + ((randVal * 0.13) % 1.0);
          const drapeDist = node.radius * 0.80;
          const dx = Math.round(node.x + Math.cos(angle) * drapeDist);
          const dz = Math.round(node.z + Math.sin(angle) * drapeDist);
          const startDrapeY = node.y - Math.floor(node.radius * 0.4);
          // ~70% of vines hang down to player reach height (1-2 blocks above ground)
          const isLowReach = ((randVal + d * 7 + i * 11) % 10) < 7;
          const targetBottomY = isLowReach ? (ty + 1 + ((d + randVal) % 2)) : (ty + 3 + ((d + randVal) % 3));

          for (let vy = startDrapeY; vy >= targetBottomY; vy--) {
            if (vy > ty && vy < Chunk.HEIGHT) {
              if (dx >= 0 && dx < Chunk.SIZE && dz >= 0 && dz < Chunk.SIZE) {
                if (this.getBlock(dx, vy, dz) === BlockType.AIR) {
                  this.setBlock(dx, vy, dz, BlockType.JUNGLE_VINES);
                }
              }
            }
          }
        }
      }
    }
  }

  public buildMesh(
    atlasTexture: THREE.CanvasTexture,
    emissiveAtlasTexture: THREE.CanvasTexture,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType,
    leafOpacity: number,
    blockModelManager?: BlockModelManager,
    lod: number = 0
  ): { solid: THREE.Mesh | null; transparent: THREE.Mesh | null; emissive: THREE.Mesh | null; instanced: THREE.InstancedMesh[] } {
    this.currentLOD = lod;
    this.glowingOrePositions = [];

    // Pointer indices for pre-allocated static scratch buffers (Zero Garbage Collection)
    let vIdx = 0, uIdx = 0, wIdx = 0, cIdx = 0;
    let tvIdx = 0, tuIdx = 0, twIdx = 0, tcIdx = 0;
    let evIdx = 0, euIdx = 0, ewIdx = 0, ecIdx = 0;

    const sPos = Chunk.scratchPositions;
    const sNorm = Chunk.scratchNormals;
    const sUv = Chunk.scratchUvs;
    const sUv2 = Chunk.scratchUv2s;
    const sWeight = Chunk.scratchBlendWeights;
    const sColor = Chunk.scratchColors;

    const stPos = Chunk.scratchTransPositions;
    const stNorm = Chunk.scratchTransNormals;
    const stUv = Chunk.scratchTransUvs;
    const stUv2 = Chunk.scratchTransUv2s;
    const stWeight = Chunk.scratchTransBlendWeights;
    const stColor = Chunk.scratchTransColors;

    const sePos = Chunk.scratchEmissivePositions;
    const seNorm = Chunk.scratchEmissiveNormals;
    const seUv = Chunk.scratchEmissiveUvs;
    const seUv2 = Chunk.scratchEmissiveUv2s;
    const seWeight = Chunk.scratchEmissiveBlendWeights;
    const seColor = Chunk.scratchEmissiveColors;

    const customModelPositions: Map<BlockType, THREE.Matrix4[]> = new Map();

    const cols = 8;
    const rows = Math.ceil(TextureGenerator.TOTAL_TEXTURES / cols);
    const tileSizeX = 1 / cols;
    const tileSizeY = 1 / rows;

    // UV texel inset prevents linear-filter and mipmapping from sampling adjacent atlas tiles
    const UV_EPSILON = 0.0035;
    const halfTexelX = UV_EPSILON;
    const halfTexelY = UV_EPSILON;

    // --- VOXEL CORNER AMBIENT OCCLUSION (AO) ENGINE ---
    const getVertexAO = (side1: boolean, side2: boolean, corner: boolean): number => {
      if (side1 && side2) return 0.50; // Corner crevice shadow
      const count = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
      if (count === 3) return 0.50;
      if (count === 2) return 0.72;
      if (count === 1) return 0.88;
      return 1.0;
    };

    const isSolid = (wx: number, wy: number, wz: number): boolean => {
      const b = getNeighborBlock(wx, wy, wz);
      return b !== BlockType.AIR && b !== BlockType.WATER && b !== BlockType.OASIS_WATER && b !== BlockType.JUNGLE_WATER && b !== BlockType.MOLTEN_CORRUPTION && b !== BlockType.JUNGLE_VINES;
    };

    const calculateFaceAO = (wx: number, wy: number, wz: number, dir: [number, number, number]): [number, number, number, number] => {
      if (lod === 1) return [1.0, 1.0, 1.0, 1.0];
      const [nx, ny, nz] = dir;
      let ao0 = 1.0, ao1 = 1.0, ao2 = 1.0, ao3 = 1.0;

      if (ny === 1) {
        ao0 = getVertexAO(isSolid(wx - 1, wy + 1, wz), isSolid(wx, wy + 1, wz + 1), isSolid(wx - 1, wy + 1, wz + 1));
        ao1 = getVertexAO(isSolid(wx + 1, wy + 1, wz), isSolid(wx, wy + 1, wz + 1), isSolid(wx + 1, wy + 1, wz + 1));
        ao2 = getVertexAO(isSolid(wx + 1, wy + 1, wz), isSolid(wx, wy + 1, wz - 1), isSolid(wx + 1, wy + 1, wz - 1));
        ao3 = getVertexAO(isSolid(wx - 1, wy + 1, wz), isSolid(wx, wy + 1, wz - 1), isSolid(wx - 1, wy + 1, wz - 1));
      } else if (ny === -1) {
        ao0 = getVertexAO(isSolid(wx - 1, wy - 1, wz), isSolid(wx, wy - 1, wz - 1), isSolid(wx - 1, wy - 1, wz - 1));
        ao1 = getVertexAO(isSolid(wx + 1, wy - 1, wz), isSolid(wx, wy - 1, wz - 1), isSolid(wx + 1, wy - 1, wz - 1));
        ao2 = getVertexAO(isSolid(wx + 1, wy - 1, wz), isSolid(wx, wy - 1, wz + 1), isSolid(wx + 1, wy - 1, wz + 1));
        ao3 = getVertexAO(isSolid(wx - 1, wy - 1, wz), isSolid(wx, wy - 1, wz + 1), isSolid(wx - 1, wy - 1, wz + 1));
      } else if (nx === 1) {
        ao0 = getVertexAO(isSolid(wx + 1, wy - 1, wz), isSolid(wx + 1, wy, wz + 1), isSolid(wx + 1, wy - 1, wz + 1));
        ao1 = getVertexAO(isSolid(wx + 1, wy - 1, wz), isSolid(wx + 1, wy, wz - 1), isSolid(wx + 1, wy - 1, wz - 1));
        ao2 = getVertexAO(isSolid(wx + 1, wy + 1, wz), isSolid(wx + 1, wy, wz - 1), isSolid(wx + 1, wy + 1, wz - 1));
        ao3 = getVertexAO(isSolid(wx + 1, wy + 1, wz), isSolid(wx + 1, wy, wz + 1), isSolid(wx + 1, wy + 1, wz + 1));
      } else if (nx === -1) {
        ao0 = getVertexAO(isSolid(wx - 1, wy - 1, wz), isSolid(wx - 1, wy, wz - 1), isSolid(wx - 1, wy - 1, wz - 1));
        ao1 = getVertexAO(isSolid(wx - 1, wy - 1, wz), isSolid(wx - 1, wy, wz + 1), isSolid(wx - 1, wy - 1, wz + 1));
        ao2 = getVertexAO(isSolid(wx - 1, wy + 1, wz), isSolid(wx - 1, wy, wz + 1), isSolid(wx - 1, wy + 1, wz + 1));
        ao3 = getVertexAO(isSolid(wx - 1, wy + 1, wz), isSolid(wx - 1, wy, wz - 1), isSolid(wx - 1, wy + 1, wz - 1));
      } else if (nz === 1) {
        ao0 = getVertexAO(isSolid(wx - 1, wy, wz + 1), isSolid(wx, wy - 1, wz + 1), isSolid(wx - 1, wy - 1, wz + 1));
        ao1 = getVertexAO(isSolid(wx + 1, wy, wz + 1), isSolid(wx, wy - 1, wz + 1), isSolid(wx + 1, wy - 1, wz + 1));
        ao2 = getVertexAO(isSolid(wx + 1, wy, wz + 1), isSolid(wx, wy + 1, wz + 1), isSolid(wx + 1, wy + 1, wz + 1));
        ao3 = getVertexAO(isSolid(wx - 1, wy, wz + 1), isSolid(wx, wy + 1, wz + 1), isSolid(wx - 1, wy + 1, wz + 1));
      } else if (nz === -1) {
        ao0 = getVertexAO(isSolid(wx + 1, wy, wz - 1), isSolid(wx, wy - 1, wz - 1), isSolid(wx + 1, wy - 1, wz - 1));
        ao1 = getVertexAO(isSolid(wx - 1, wy, wz - 1), isSolid(wx, wy - 1, wz - 1), isSolid(wx - 1, wy - 1, wz - 1));
        ao2 = getVertexAO(isSolid(wx - 1, wy, wz - 1), isSolid(wx, wy + 1, wz - 1), isSolid(wx - 1, wy + 1, wz - 1));
        ao3 = getVertexAO(isSolid(wx + 1, wy, wz - 1), isSolid(wx, wy + 1, wz - 1), isSolid(wx + 1, wy + 1, wz - 1));
      }

      return [ao0, ao1, ao2, ao3];
    };

    const getUV = (texIndex: number) => {
      const col = texIndex % cols;
      const row = Math.floor(texIndex / cols);
      return {
        u0: col * tileSizeX + halfTexelX,
        u1: (col + 1) * tileSizeX - halfTexelX,
        vT: 1 - row * tileSizeY - halfTexelY,
        vB: 1 - (row + 1) * tileSizeY + halfTexelY,
      };
    };

    const pushQuad = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
      p3: [number, number, number],
      norm: [number, number, number],
      u0: number, v0: number, u1: number, v1: number,
      sec_u0?: number, sec_v0?: number, sec_u1?: number, sec_v1?: number,
      weight: number = 0.0,
      aoValues: [number, number, number, number] = [1, 1, 1, 1],
      brightness: number = 1.0,
      isTrans: boolean = false,
      isEmissive: boolean = false
    ) => {
      const su0 = sec_u0 !== undefined ? sec_u0 : u0;
      const sv0 = sec_v0 !== undefined ? sec_v0 : v0;
      const su1 = sec_u1 !== undefined ? sec_u1 : u1;
      const sv1 = sec_v1 !== undefined ? sec_v1 : v1;

      const c0 = brightness * aoValues[0];
      const c1 = brightness * aoValues[1];
      const c2 = brightness * aoValues[2];
      const c3 = brightness * aoValues[3];

      if (isTrans) {
        if (tvIdx + 18 >= Chunk.MAX_TRANS_FLOATS) return;
        stPos[tvIdx] = p0[0]; stPos[tvIdx+1] = p0[1]; stPos[tvIdx+2] = p0[2];
        stPos[tvIdx+3] = p1[0]; stPos[tvIdx+4] = p1[1]; stPos[tvIdx+5] = p1[2];
        stPos[tvIdx+6] = p2[0]; stPos[tvIdx+7] = p2[1]; stPos[tvIdx+8] = p2[2];
        for (let k = 0; k < 3; k++) {
          stNorm[tvIdx + k*3] = norm[0]; stNorm[tvIdx + k*3 + 1] = norm[1]; stNorm[tvIdx + k*3 + 2] = norm[2];
        }
        tvIdx += 9;
        stUv[tuIdx] = u0; stUv[tuIdx+1] = v0;
        stUv[tuIdx+2] = u1; stUv[tuIdx+3] = v0;
        stUv[tuIdx+4] = u1; stUv[tuIdx+5] = v1;
        stUv2[tuIdx] = su0; stUv2[tuIdx+1] = sv0;
        stUv2[tuIdx+2] = su1; stUv2[tuIdx+3] = sv0;
        stUv2[tuIdx+4] = su1; stUv2[tuIdx+5] = sv1;
        tuIdx += 6;
        stWeight[twIdx] = weight; stWeight[twIdx+1] = weight; stWeight[twIdx+2] = weight;
        twIdx += 3;
        stPos[tvIdx] = p0[0]; stPos[tvIdx+1] = p0[1]; stPos[tvIdx+2] = p0[2];
        stPos[tvIdx+3] = p2[0]; stPos[tvIdx+4] = p2[1]; stPos[tvIdx+5] = p2[2];
        stPos[tvIdx+6] = p3[0]; stPos[tvIdx+7] = p3[1]; stPos[tvIdx+8] = p3[2];
        for (let k = 0; k < 3; k++) {
          stNorm[tvIdx + k*3] = norm[0]; stNorm[tvIdx + k*3 + 1] = norm[1]; stNorm[tvIdx + k*3 + 2] = norm[2];
        }
        tvIdx += 9;
        stUv[tuIdx] = u0; stUv[tuIdx+1] = v0;
        stUv[tuIdx+2] = u1; stUv[tuIdx+3] = v1;
        stUv[tuIdx+4] = u0; stUv[tuIdx+5] = v1;
        stUv2[tuIdx] = su0; stUv2[tuIdx+1] = sv0;
        stUv2[tuIdx+2] = su1; stUv2[tuIdx+3] = sv1;
        stUv2[tuIdx+4] = su0; stUv2[tuIdx+5] = sv1;
        tuIdx += 6;
        stWeight[twIdx] = weight; stWeight[twIdx+1] = weight; stWeight[twIdx+2] = weight;
        twIdx += 3;
      } else if (isEmissive) {
        if (evIdx + 18 >= Chunk.MAX_EMISSIVE_FLOATS) return;
        sePos[evIdx] = p0[0]; sePos[evIdx+1] = p0[1]; sePos[evIdx+2] = p0[2];
        sePos[evIdx+3] = p1[0]; sePos[evIdx+4] = p1[1]; sePos[evIdx+5] = p1[2];
        sePos[evIdx+6] = p2[0]; sePos[evIdx+7] = p2[1]; sePos[evIdx+8] = p2[2];
        for (let k = 0; k < 3; k++) {
          seNorm[evIdx + k*3] = norm[0]; seNorm[evIdx + k*3 + 1] = norm[1]; seNorm[evIdx + k*3 + 2] = norm[2];
        }
        evIdx += 9;
        seUv[euIdx] = u0; seUv[euIdx+1] = v0;
        seUv[euIdx+2] = u1; seUv[euIdx+3] = v0;
        seUv[euIdx+4] = u1; seUv[euIdx+5] = v1;
        seUv2[euIdx] = su0; seUv2[euIdx+1] = sv0;
        seUv2[euIdx+2] = su1; seUv2[euIdx+3] = sv0;
        seUv2[euIdx+4] = su1; seUv2[euIdx+5] = sv1;
        euIdx += 6;
        seWeight[ewIdx] = weight; seWeight[ewIdx+1] = weight; seWeight[ewIdx+2] = weight;
        ewIdx += 3;
        seColor[ecIdx] = c0; seColor[ecIdx+1] = c0; seColor[ecIdx+2] = c0;
        seColor[ecIdx+3] = c1; seColor[ecIdx+4] = c1; seColor[ecIdx+5] = c1;
        seColor[ecIdx+6] = c2; seColor[ecIdx+7] = c2; seColor[ecIdx+8] = c2;
        ecIdx += 9;
        sePos[evIdx] = p0[0]; sePos[evIdx+1] = p0[1]; sePos[evIdx+2] = p0[2];
        sePos[evIdx+3] = p2[0]; sePos[evIdx+4] = p2[1]; sePos[evIdx+5] = p2[2];
        sePos[evIdx+6] = p3[0]; sePos[evIdx+7] = p3[1]; sePos[evIdx+8] = p3[2];
        for (let k = 0; k < 3; k++) {
          seNorm[evIdx + k*3] = norm[0]; seNorm[evIdx + k*3 + 1] = norm[1]; seNorm[evIdx + k*3 + 2] = norm[2];
        }
        evIdx += 9;
        seUv[euIdx] = u0; seUv[euIdx+1] = v0;
        seUv[euIdx+2] = u1; seUv[euIdx+3] = v1;
        seUv[euIdx+4] = u0; seUv[euIdx+5] = v1;
        seUv2[euIdx] = su0; seUv2[euIdx+1] = sv0;
        seUv2[euIdx+2] = su1; seUv2[euIdx+3] = sv1;
        seUv2[euIdx+4] = su0; seUv2[euIdx+5] = sv1;
        euIdx += 6;
        seWeight[ewIdx] = weight; seWeight[ewIdx+1] = weight; seWeight[ewIdx+2] = weight;
        ewIdx += 3;
        seColor[ecIdx] = c0; seColor[ecIdx+1] = c0; seColor[ecIdx+2] = c0;
        seColor[ecIdx+3] = c2; seColor[ecIdx+4] = c2; seColor[ecIdx+5] = c2;
        seColor[ecIdx+6] = c3; seColor[ecIdx+7] = c3; seColor[ecIdx+8] = c3;
        ecIdx += 9;
      } else {
        if (vIdx + 18 >= Chunk.MAX_SOLID_FLOATS) return;
        sPos[vIdx] = p0[0]; sPos[vIdx+1] = p0[1]; sPos[vIdx+2] = p0[2];
        sPos[vIdx+3] = p1[0]; sPos[vIdx+4] = p1[1]; sPos[vIdx+5] = p1[2];
        sPos[vIdx+6] = p2[0]; sPos[vIdx+7] = p2[1]; sPos[vIdx+8] = p2[2];
        for (let k = 0; k < 3; k++) {
          sNorm[vIdx + k*3] = norm[0]; sNorm[vIdx + k*3 + 1] = norm[1]; sNorm[vIdx + k*3 + 2] = norm[2];
        }
        vIdx += 9;
        sUv[uIdx] = u0; sUv[uIdx+1] = v0;
        sUv[uIdx+2] = u1; sUv[uIdx+3] = v0;
        sUv[uIdx+4] = u1; sUv[uIdx+5] = v1;
        sUv2[uIdx] = su0; sUv2[uIdx+1] = sv0;
        sUv2[uIdx+2] = su1; sUv2[uIdx+3] = sv0;
        sUv2[uIdx+4] = su1; sUv2[uIdx+5] = sv1;
        uIdx += 6;
        sWeight[wIdx] = weight; sWeight[wIdx+1] = weight; sWeight[wIdx+2] = weight;
        wIdx += 3;
        sColor[cIdx] = c0; sColor[cIdx+1] = c0; sColor[cIdx+2] = c0;
        sColor[cIdx+3] = c1; sColor[cIdx+4] = c1; sColor[cIdx+5] = c1;
        sColor[cIdx+6] = c2; sColor[cIdx+7] = c2; sColor[cIdx+8] = c2;
        cIdx += 9;
        sPos[vIdx] = p0[0]; sPos[vIdx+1] = p0[1]; sPos[vIdx+2] = p0[2];
        sPos[vIdx+3] = p2[0]; sPos[vIdx+4] = p2[1]; sPos[vIdx+5] = p2[2];
        sPos[vIdx+6] = p3[0]; sPos[vIdx+7] = p3[1]; sPos[vIdx+8] = p3[2];
        for (let k = 0; k < 3; k++) {
          sNorm[vIdx + k*3] = norm[0]; sNorm[vIdx + k*3 + 1] = norm[1]; sNorm[vIdx + k*3 + 2] = norm[2];
        }
        vIdx += 9;
        sUv[uIdx] = u0; sUv[uIdx+1] = v0;
        sUv[uIdx+2] = u1; sUv[uIdx+3] = v1;
        sUv[uIdx+4] = u0; sUv[uIdx+5] = v1;
        sUv2[uIdx] = su0; sUv2[uIdx+1] = sv0;
        sUv2[uIdx+2] = su1; sUv2[uIdx+3] = sv1;
        sUv2[uIdx+4] = su0; sUv2[uIdx+5] = sv1;
        uIdx += 6;
        sWeight[wIdx] = weight; sWeight[wIdx+1] = weight; sWeight[wIdx+2] = weight;
        wIdx += 3;
        sColor[cIdx] = c0; sColor[cIdx+1] = c0; sColor[cIdx+2] = c0;
        sColor[cIdx+3] = c2; sColor[cIdx+4] = c2; sColor[cIdx+5] = c2;
        sColor[cIdx+6] = c3; sColor[cIdx+7] = c3; sColor[cIdx+8] = c3;
        cIdx += 9;
      }
    };

    const pushTri = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
      norm: [number, number, number],
      u0: number, v0: number,
      u1: number, v1: number,
      u2: number, v2: number,
      brightness: number = 0.8,
      isTrans: boolean = false,
      isEmissive: boolean = false
    ) => {
      const c = brightness;
      if (isTrans) {
        if (tvIdx + 9 >= Chunk.MAX_TRANS_FLOATS) return;
        stPos[tvIdx] = p0[0]; stPos[tvIdx+1] = p0[1]; stPos[tvIdx+2] = p0[2];
        stPos[tvIdx+3] = p1[0]; stPos[tvIdx+4] = p1[1]; stPos[tvIdx+5] = p1[2];
        stPos[tvIdx+6] = p2[0]; stPos[tvIdx+7] = p2[1]; stPos[tvIdx+8] = p2[2];
        for (let k = 0; k < 3; k++) {
          stNorm[tvIdx + k*3] = norm[0]; stNorm[tvIdx + k*3 + 1] = norm[1]; stNorm[tvIdx + k*3 + 2] = norm[2];
        }
        tvIdx += 9;
        stUv[tuIdx] = u0; stUv[tuIdx+1] = v0;
        stUv[tuIdx+2] = u1; stUv[tuIdx+3] = v1;
        stUv[tuIdx+4] = u2; stUv[tuIdx+5] = v2;
        stUv2[tuIdx] = u0; stUv2[tuIdx+1] = v0;
        stUv2[tuIdx+2] = u1; stUv2[tuIdx+3] = v1;
        stUv2[tuIdx+4] = u2; stUv2[tuIdx+5] = v2;
        tuIdx += 6;
        stWeight[twIdx] = 0; stWeight[twIdx+1] = 0; stWeight[twIdx+2] = 0;
        twIdx += 3;
      } else {
        if (vIdx + 9 >= Chunk.MAX_SOLID_FLOATS) return;
        sPos[vIdx] = p0[0]; sPos[vIdx+1] = p0[1]; sPos[vIdx+2] = p0[2];
        sPos[vIdx+3] = p1[0]; sPos[vIdx+4] = p1[1]; sPos[vIdx+5] = p1[2];
        sPos[vIdx+6] = p2[0]; sPos[vIdx+7] = p2[1]; sPos[vIdx+8] = p2[2];
        for (let k = 0; k < 3; k++) {
          sNorm[vIdx + k*3] = norm[0]; sNorm[vIdx + k*3 + 1] = norm[1]; sNorm[vIdx + k*3 + 2] = norm[2];
        }
        vIdx += 9;
        sUv[uIdx] = u0; sUv[uIdx+1] = v0;
        sUv[uIdx+2] = u1; sUv[uIdx+3] = v1;
        sUv[uIdx+4] = u2; sUv[uIdx+5] = v2;
        sUv2[uIdx] = u0; sUv2[uIdx+1] = v0;
        sUv2[uIdx+2] = u1; sUv2[uIdx+3] = v1;
        sUv2[uIdx+4] = u2; sUv2[uIdx+5] = v2;
        uIdx += 6;
        sWeight[wIdx] = 0; sWeight[wIdx+1] = 0; sWeight[wIdx+2] = 0;
        wIdx += 3;
        sColor[cIdx] = c; sColor[cIdx+1] = c; sColor[cIdx+2] = c;
        sColor[cIdx+3] = c; sColor[cIdx+4] = c; sColor[cIdx+5] = c;
        sColor[cIdx+6] = c; sColor[cIdx+7] = c; sColor[cIdx+8] = c;
        cIdx += 9;
      }
    };

    const addFace = (
      px: number, py: number, pz: number,
      dir: [number, number, number],
      texIndex: number,
      isTrans: boolean,
      brightness: number,
      isEmissive: boolean = false,
      secTexIndex?: number,
      weight: number = 0.0
    ) => {
      let faceVerts: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
      let norm: [number, number, number];

      if (dir[0] === 1) {
        norm = [1, 0, 0];
        faceVerts = [
          [px + 1, (py + 0) * 0.5, pz + 1],
          [px + 1, (py + 0) * 0.5, pz + 0],
          [px + 1, (py + 1) * 0.5, pz + 0],
          [px + 1, (py + 1) * 0.5, pz + 1]
        ];
      } else if (dir[0] === -1) {
        norm = [-1, 0, 0];
        faceVerts = [
          [px + 0, (py + 0) * 0.5, pz + 0],
          [px + 0, (py + 0) * 0.5, pz + 1],
          [px + 0, (py + 1) * 0.5, pz + 1],
          [px + 0, (py + 1) * 0.5, pz + 0]
        ];
      } else if (dir[1] === 1) {
        norm = [0, 1, 0];
        faceVerts = [
          [px + 0, (py + 1) * 0.5, pz + 1],
          [px + 1, (py + 1) * 0.5, pz + 1],
          [px + 1, (py + 1) * 0.5, pz + 0],
          [px + 0, (py + 1) * 0.5, pz + 0]
        ];
      } else if (dir[1] === -1) {
        norm = [0, -1, 0];
        faceVerts = [
          [px + 0, (py + 0) * 0.5, pz + 0],
          [px + 1, (py + 0) * 0.5, pz + 0],
          [px + 1, (py + 0) * 0.5, pz + 1],
          [px + 0, (py + 0) * 0.5, pz + 1]
        ];
      } else if (dir[2] === 1) {
        norm = [0, 0, 1];
        faceVerts = [
          [px + 0, (py + 0) * 0.5, pz + 1],
          [px + 1, (py + 0) * 0.5, pz + 1],
          [px + 1, (py + 1) * 0.5, pz + 1],
          [px + 0, (py + 1) * 0.5, pz + 1]
        ];
      } else {
        norm = [0, 0, -1];
        faceVerts = [
          [px + 1, (py + 0) * 0.5, pz + 0],
          [px + 0, (py + 0) * 0.5, pz + 0],
          [px + 0, (py + 1) * 0.5, pz + 0],
          [px + 1, (py + 1) * 0.5, pz + 0]
        ];
      }

      const u = getUV(texIndex);
      const secU = secTexIndex !== undefined ? getUV(secTexIndex) : undefined;
      const ao = calculateFaceAO(px, py, pz, dir);

      pushQuad(
        faceVerts[0], faceVerts[1], faceVerts[2], faceVerts[3],
        norm, u.u0, u.vB, u.u1, u.vT,
        secU?.u0, secU?.vB, secU?.u1, secU?.vT,
        weight, ao, brightness, isTrans, isEmissive
      );
    };

    const isLeafBlock = (b: number) => {
      return b === BlockType.OAK_LEAVES || b === BlockType.FROST_LEAVES || 
             b === BlockType.WITHERED_THORNS || b === BlockType.PALM_FRONDS ||
             b === BlockType.JUNGLE_LEAVES ||
             b === BlockType.TEAL_LEAVES || b === BlockType.BLUE_LEAVES || b === BlockType.PURPLE_LEAVES ||
             b === BlockType.CHARRED_LEAVES ||
             b === BlockType.MOSSVEIL_THORNED_UNDERGROWTH;
    };

    const isBranchTier1 = (b: number): boolean => {
      return b === BlockType.OAK_BRANCH_1 || b === BlockType.JUNGLE_BRANCH_1 ||
             b === BlockType.FROZEN_BRANCH_1 || b === BlockType.PETRIFIED_BRANCH_1 ||
             b === BlockType.SUNWOOD_BRANCH_1;
    };

    const isBranchTier2 = (b: number): boolean => {
      return b === BlockType.OAK_BRANCH_2 || b === BlockType.JUNGLE_BRANCH_2 ||
             b === BlockType.FROZEN_BRANCH_2 || b === BlockType.PETRIFIED_BRANCH_2 ||
             b === BlockType.SUNWOOD_BRANCH_2 ||
             b === BlockType.OAK_LOG_X || b === BlockType.OAK_LOG_Z ||
             b === BlockType.JUNGLE_LOG_X || b === BlockType.JUNGLE_LOG_Z ||
             b === BlockType.FROZEN_LOG_X || b === BlockType.FROZEN_LOG_Z ||
             b === BlockType.PETRIFIED_LOG_X || b === BlockType.PETRIFIED_LOG_Z ||
             b === BlockType.PETRIFIED_SUNWOOD_X || b === BlockType.PETRIFIED_SUNWOOD_Z;
    };

    const isBranchTier3 = (b: number): boolean => {
      return b === BlockType.OAK_BRANCH_3 || b === BlockType.JUNGLE_BRANCH_3 ||
             b === BlockType.FROZEN_BRANCH_3 || b === BlockType.PETRIFIED_BRANCH_3 ||
             b === BlockType.SUNWOOD_BRANCH_3;
    };

    const isTrunkLog = (b: number): boolean => {
      return b === BlockType.OAK_LOG || b === BlockType.JUNGLE_LOG ||
             b === BlockType.FROZEN_LOG || b === BlockType.PETRIFIED_LOG ||
             b === BlockType.PETRIFIED_SUNWOOD;
    };

    const isLogOrBranchBlock = (b: number): boolean => {
      return isTrunkLog(b) || isBranchTier1(b) || isBranchTier2(b) || isBranchTier3(b);
    };

    const getWoodHalfWidth = (b: number): number => {
      if (isTrunkLog(b) || isBranchTier1(b)) return 0.375; // 0.75m width
      if (isBranchTier2(b)) return 0.25;                  // 0.50m width
      if (isBranchTier3(b)) return 0.125;                 // 0.25m width
      return 0;
    };

    const isLogBlock = (b: number) => {
      return isLogOrBranchBlock(b);
    };

    const isSubBlock = (b: number) => {
      const bDef = BLOCK_DEFINITIONS[b as BlockType];
      return !!(bDef && bDef.shape && bDef.shape !== BlockShape.CUBE) || isBranchTier1(b) || isBranchTier2(b) || isBranchTier3(b);
    };

    for (let x = 0; x < Chunk.SIZE; x++) {
      for (let y = 0; y < Chunk.HEIGHT; y++) {
        for (let z = 0; z < Chunk.SIZE; z++) {
          const type = this.getBlock(x, y, z);
          if (type === BlockType.AIR) continue;

          const wx = this.worldX + x;
          const wy = y;
          const wz = this.worldZ + z;

          const def = BLOCK_DEFINITIONS[type];
          if (!def) continue;

          const colIdx = x * Chunk.SIZE + z;
          const secBlock = this.transitionSecondaryBlocks ? this.transitionSecondaryBlocks[colIdx] : BlockType.AIR;
          const weight = this.transitionWeights ? this.transitionWeights[colIdx] : 0.0;
          const secDef = (secBlock !== BlockType.AIR && weight > 0.005) ? (BLOCK_DEFINITIONS as any)[secBlock] : null;

          const isTransparent = !!def.isTransparent;
          const isEmissive = EMISSIVE_ORES.has(type);
          if (type === BlockType.MOLTEN_CORRUPTION) {
            const topN = getNeighborBlock(wx, wy + 1, wz);
            if (topN === BlockType.AIR) {
              this.glowingOrePositions.push({ x: wx + 0.5, y: wy + 0.5, z: wz + 0.5, type });
            }
          }

          // --- 3D WORKSTATION & TORCH MODELS (Rendered as 3D GLB props in VoxelWorld, not voxel cubes) ---
          if (type === BlockType.WORKBENCH || type === BlockType.TORCH) {
            continue;
          }

          // --- LOD 1 DISTANT OPTIMIZATIONS (Skip distant micro-scatter collectibles) ---
          if (lod === 1 && (
            type === BlockType.BRANCHES || type === BlockType.STONE_PEBBLE || type === BlockType.FLINT ||
            type === BlockType.CARROT || type === BlockType.APPLES || type === BlockType.ASHEN_EMBERPOD ||
            type === BlockType.THORNSPIKE_CLUSTER || type === BlockType.BLOOMWING_FEATHER || type === BlockType.DUNESTING_BARB
          )) {
            continue;
          }

          // --- 0. CUSTOM INSTANCED FOLIAGE (LOD 0 NEAR-CAMERA ONLY) ---
          if (lod === 0 && blockModelManager && blockModelManager.hasCustomModel(type)) {
            let list = customModelPositions.get(type);
            if (!list) {
              list = [];
              customModelPositions.set(type, list);
            }
            const mat = new THREE.Matrix4();
            mat.setPosition(wx + 0.5, wy * 0.5 + 0.25, wz + 0.5);
            list.push(mat);
            continue;
          }

          // Fallback Volumetric Micro-Voxel Foliage Clusters (LOD 0 ONLY)
          if (lod === 0 && isLeafBlock(type)) {
            const cx = wx + 0.5;
            const cy = wy * 0.5 + 0.25;
            const cz = wz + 0.5;
            const uLeaf = getUV(def.topTextureIndex);
            const uWidth = uLeaf.u1 - uLeaf.u0;
            const vHeight = uLeaf.vT - uLeaf.vB;

            // Check neighbor occlusion to avoid rendering thousands of fully enclosed hidden leaf microcubes
            const nTop = getNeighborBlock(wx, wy + 1, wz);
            const nBot = getNeighborBlock(wx, wy - 1, wz);
            const nEast = getNeighborBlock(wx + 1, wy, wz);
            const nWest = getNeighborBlock(wx - 1, wy, wz);
            const nSouth = getNeighborBlock(wx, wy, wz + 1);
            const nNorth = getNeighborBlock(wx, wy, wz - 1);

            const hasTop = !isLeafBlock(nTop);
            const hasBot = !isLeafBlock(nBot);
            const hasEast = !isLeafBlock(nEast);
            const hasWest = !isLeafBlock(nWest);
            const hasSouth = !isLeafBlock(nSouth);
            const hasNorth = !isLeafBlock(nNorth);

            // If completely buried inside solid leaves, skip to eliminate internal clutter and z-fighting
            if (!hasTop && !hasBot && !hasEast && !hasWest && !hasSouth && !hasNorth) {
              continue;
            }

            // Deterministic spatial hash for organic micro-cube jitter per leaf block
            const lHash = Math.abs(Math.sin(wx * 19.123 + wy * 43.567 + wz * 71.891) * 43758.5453);
            const jx = (((lHash * 10.0) % 1) - 0.5) * 0.06;
            const jy = (((lHash * 23.0) % 1) - 0.5) * 0.05;
            const jz = (((lHash * 37.0) % 1) - 0.5) * 0.06;

            const addMicroCube = (ox: number, oy: number, oz: number, s: number, ao: number) => {
              const h = s * 0.5;
              const minX = cx + ox - h;
              const maxX = cx + ox + h;
              const minY = cy + oy - h;
              const maxY = cy + oy + h;
              const minZ = cz + oz - h;
              const maxZ = cz + oz + h;

              // Proportional block-aligned UV mapping: Maps micro-cube faces to continuous 1.0m block UV space
              // Prevents high-frequency texture tiling and eliminates staticky grain/aliasing!
              const u0_x = uLeaf.u0 + Math.max(0, Math.min(1, (minX - wx))) * uWidth;
              const u1_x = uLeaf.u0 + Math.max(0, Math.min(1, (maxX - wx))) * uWidth;
              const v0_z = uLeaf.vB + Math.max(0, Math.min(1, (minZ - wz))) * vHeight;
              const v1_z = uLeaf.vB + Math.max(0, Math.min(1, (maxZ - wz))) * vHeight;

              const v0_y = uLeaf.vB + Math.max(0, Math.min(1, ((minY - wy * 0.5) / 0.5))) * vHeight;
              const v1_y = uLeaf.vB + Math.max(0, Math.min(1, ((maxY - wy * 0.5) / 0.5))) * vHeight;
              const u0_z = uLeaf.u0 + Math.max(0, Math.min(1, (minZ - wz))) * uWidth;
              const u1_z = uLeaf.u0 + Math.max(0, Math.min(1, (maxZ - wz))) * uWidth;

              // Top (+Y)
              pushQuad(
                [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ],
                [0, 1, 0], u0_x, v0_z, u1_x, v1_z, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 1.0, true, false
              );
              // Bottom (-Y)
              pushQuad(
                [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ],
                [0, -1, 0], u0_x, v0_z, u1_x, v1_z, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 0.65, true, false
              );
              // +X (Facing East)
              pushQuad(
                [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ],
                [1, 0, 0], u0_z, v0_y, u1_z, v1_y, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 0.85, true, false
              );
              // -X (Facing West)
              pushQuad(
                [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ],
                [-1, 0, 0], u0_z, v0_y, u1_z, v1_y, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 0.85, true, false
              );
              // +Z (Facing South)
              pushQuad(
                [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
                [0, 0, 1], u0_x, v0_y, u1_x, v1_y, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 0.75, true, false
              );
              // -Z (Facing North)
              pushQuad(
                [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
                [0, 0, -1], u0_x, v0_y, u1_x, v1_y, undefined, undefined, undefined, undefined, 0, [1,1,1,1], ao * 0.75, true, false
              );
            };

            // 1. Central Core Micro-Cube (Dense core, inner shadow AO = 0.60)
            addMicroCube(0, 0, 0, 0.48, 0.60);

            // 2. Add outer fluff clusters only on exposed sides
            if (hasTop) addMicroCube(jx, 0.24 + jy, jz, 0.44, 1.0);
            if (hasBot) addMicroCube(-jx, -0.24 - jy, -jz, 0.42, 0.70);
            if (hasNorth) addMicroCube(0.04, 0.04, -0.28 + jz, 0.44, 0.85);
            if (hasSouth) addMicroCube(-0.04, 0.02, 0.28 - jz, 0.44, 0.85);
            if (hasEast) addMicroCube(0.28 + jx, 0.03, 0.02, 0.44, 0.88);
            if (hasWest) addMicroCube(-0.28 - jx, -0.03, -0.02, 0.44, 0.88);

            // Diagonal corner accents on exposed top/sides for organic canopy silhouette
            if (hasTop && hasNorth && hasEast) addMicroCube(0.22 + jx, 0.18 + jy, -0.22 - jz, 0.36, 0.95);
            if (hasTop && hasSouth && hasWest) addMicroCube(-0.22 + jx, 0.18 - jy, 0.22 - jz, 0.36, 0.95);
            if (hasTop && hasNorth && hasWest) addMicroCube(-0.22 - jx, 0.16 + jy, -0.22 + jz, 0.36, 0.90);
            if (hasTop && hasSouth && hasEast) addMicroCube(0.22 - jx, 0.16 - jy, 0.22 + jz, 0.36, 0.90);

            continue;
          }

          // --- 1. PROPORTIONAL PROGRESSIVE TAPERED TRUNKS & BRANCHES (HYTALE SPEC) ---
          if (isLogOrBranchBlock(type)) {
            const yBot = wy * 0.5;
            const yTop = (wy + 1) * 0.5;
            const sideTex = def.sideTextureIndex;
            const uSide = getUV(sideTex);

            const cx = wx + 0.5;
            const cz = wz + 0.5;
            const hw = getWoodHalfWidth(type); // 0.375 (0.75m), 0.25 (0.50m), 0.125 (0.25m)

            const nNx = getNeighborBlock(wx - 1, wy, wz);
            const nPx = getNeighborBlock(wx + 1, wy, wz);
            const nNz = getNeighborBlock(wx, wy, wz - 1);
            const nPz = getNeighborBlock(wx, wy, wz + 1);

            const hasNx = isLogOrBranchBlock(nNx);
            const hasPx = isLogOrBranchBlock(nPx);
            const hasNz = isLogOrBranchBlock(nNz);
            const hasPz = isLogOrBranchBlock(nPz);

            // Centered alignment with flush extensions toward connected horizontal neighbors
            let x0 = cx - hw;
            let x1 = cx + hw;
            let z0 = cz - hw;
            let z1 = cz + hw;
            const y0 = yBot;
            const y1 = yTop;

            if (hasNx) x0 = wx;
            if (hasPx) x1 = wx + 1.0;
            if (hasNz) z0 = wz;
            if (hasPz) z1 = wz + 1.0;

            // Render ALL 6 faces unconditionally for all tapered branches and logs (Solid Opaque pass)
            // 1. Top (+Y)
            pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 1.0, false, isEmissive);
            // 2. Bottom (-Y) - EXPLICITLY ALWAYS PUSHED FOR ALL BRANCHES
            pushQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.65, false, isEmissive);
            // 3. East (+X)
            pushQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.85, false, isEmissive);
            // 4. West (-X)
            pushQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.85, false, isEmissive);
            // 5. South (+Z)
            pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.8, false, isEmissive);
            // 6. North (-Z)
            pushQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.8, false, isEmissive);

            continue;
          }

          const shape = def.shape || BlockShape.CUBE;

          // --- 1. HALF-HEIGHT SLAB MESHING ---
          if (shape === BlockShape.SLAB) {
            const yBot = wy * 0.5;
            const yTop = (wy + 0.5) * 0.5;
            const topTex = def.topTextureIndex;
            const sideTex = def.sideTextureIndex;
            const botTex = def.bottomTextureIndex;

            // Top (+Y)
            const topN = getNeighborBlock(wx, wy + 1, wz);
            if (topN === BlockType.AIR || BLOCK_DEFINITIONS[topN]?.isTransparent) {
              const u = getUV(topTex);
              const secU = secDef ? getUV(secDef.topTextureIndex) : undefined;
              const ao = calculateFaceAO(wx, wy, wz, [0, 1, 0]);
              pushQuad(
                [wx, yTop, wz + 1], [wx + 1, yTop, wz + 1], [wx + 1, yTop, wz], [wx, yTop, wz],
                [0, 1, 0], u.u0, u.vB, u.u1, u.vT, secU?.u0, secU?.vB, secU?.u1, secU?.vT, weight, ao, 1.0, isTransparent, isEmissive
              );
            }
            // Bottom (-Y)
            const botN = getNeighborBlock(wx, wy - 1, wz);
            if (botN === BlockType.AIR || BLOCK_DEFINITIONS[botN]?.isTransparent) {
              const u = getUV(botTex);
              const ao = calculateFaceAO(wx, wy, wz, [0, -1, 0]);
              pushQuad(
                [wx, yBot, wz], [wx + 1, yBot, wz], [wx + 1, yBot, wz + 1], [wx, yBot, wz + 1],
                [0, -1, 0], u.u0, u.vB, u.u1, u.vT, undefined, undefined, undefined, undefined, 0, ao, 0.5, isTransparent, isEmissive
              );
            }
            // 4 Half-height Sides (+X, -X, +Z, -Z)
            const uSide = getUV(sideTex);
            const vMid = uSide.vB + 0.5 * (uSide.vT - uSide.vB);
            const secUSide = secDef ? getUV(secDef.sideTextureIndex) : undefined;
            const secVMid = secUSide ? secUSide.vB + 0.5 * (secUSide.vT - secUSide.vB) : undefined;
            // +X (Top half of texture: vMid .. vT to preserve top turf/grass overhang)
            pushQuad([wx + 1, yBot, wz + 1], [wx + 1, yBot, wz], [wx + 1, yTop, wz], [wx + 1, yTop, wz + 1], [1, 0, 0], uSide.u0, vMid, uSide.u1, uSide.vT, secUSide?.u0, secVMid, secUSide?.u1, secUSide?.vT, weight, [1,1,1,1], 0.8, isTransparent, isEmissive);
            // -X
            pushQuad([wx, yBot, wz], [wx, yBot, wz + 1], [wx, yTop, wz + 1], [wx, yTop, wz], [-1, 0, 0], uSide.u0, vMid, uSide.u1, uSide.vT, secUSide?.u0, secVMid, secUSide?.u1, secUSide?.vT, weight, [1,1,1,1], 0.8, isTransparent, isEmissive);
            // +Z
            pushQuad([wx, yBot, wz + 1], [wx + 1, yBot, wz + 1], [wx + 1, yTop, wz + 1], [wx, yTop, wz + 1], [0, 0, 1], uSide.u0, vMid, uSide.u1, uSide.vT, secUSide?.u0, secVMid, secUSide?.u1, secUSide?.vT, weight, [1,1,1,1], 0.7, isTransparent, isEmissive);
            // -Z
            pushQuad([wx + 1, yBot, wz], [wx, yBot, wz], [wx, yTop, wz], [wx + 1, yTop, wz], [0, 0, -1], uSide.u0, vMid, uSide.u1, uSide.vT, secUSide?.u0, secVMid, secUSide?.u1, secUSide?.vT, weight, [1,1,1,1], 0.7, isTransparent, isEmissive);
            continue;
          }

          // --- 2. ORGANIC 90-DEGREE STEPPED MICRO-BLOCK MESHING (NOISE-BASED WEATHERED CHIPPING) ---
          const isStepShape = (
            shape === BlockShape.STEP_POS_X ||
            shape === BlockShape.STEP_NEG_X ||
            shape === BlockShape.STEP_POS_Z ||
            shape === BlockShape.STEP_NEG_Z ||
            type === BlockType.JUNGLE_ROOT_POS_X ||
            type === BlockType.JUNGLE_ROOT_NEG_X ||
            type === BlockType.JUNGLE_ROOT_POS_Z ||
            type === BlockType.JUNGLE_ROOT_NEG_Z
          );

          if (isStepShape) {
            const yBot = wy * 0.5;
            const yMid = yBot + 0.25;
            const yTop = (wy + 1) * 0.5;
            const topTex = def.topTextureIndex;
            const sideTex = def.sideTextureIndex;
            const uTop = getUV(topTex);
            const uSide = getUV(sideTex);
            const secUTop = secDef ? getUV(secDef.topTextureIndex) : undefined;
            const secUSide = secDef ? getUV(secDef.sideTextureIndex) : undefined;
            const uSideMidV = uSide.vB + 0.5 * (uSide.vT - uSide.vB);
            const secSideMidV = secUSide ? secUSide.vB + 0.5 * (secUSide.vT - secUSide.vB) : undefined;

            // Deterministic high-frequency 3D hash for organic edge erosion & weathered chipping
            const nHash = (Math.abs(Math.sin(wx * 12.9898 + wy * 78.233 + wz * 37.719) * 43758.5453)) % 1;

            // Determine heights of the 4 sub-quadrants: Q00, Q10, Q01, Q11
            let h00 = yMid, h10 = yTop, h01 = yMid, h11 = yTop;

            if (shape === BlockShape.STEP_POS_X || type === BlockType.JUNGLE_ROOT_POS_X) {
              // Base: -X is yMid, +X is yTop
              h00 = yMid; h01 = yMid; h10 = yTop; h11 = yTop;
              if (nHash < 0.25) {
                h10 = yMid; // Corner quadrant (+X, -Z) chips back to lower step
              } else if (nHash > 0.75) {
                h11 = yMid; // Corner quadrant (+X, +Z) chips back to lower step
              } else if (nHash >= 0.45 && nHash <= 0.55) {
                h00 = yBot; // Lower corner quadrant (-X, -Z) erodes down to base tier
              }
            } else if (shape === BlockShape.STEP_NEG_X || type === BlockType.JUNGLE_ROOT_NEG_X) {
              // Base: -X is yTop, +X is yMid
              h00 = yTop; h01 = yTop; h10 = yMid; h11 = yMid;
              if (nHash < 0.25) {
                h00 = yMid; // Corner quadrant (-X, -Z) chips back to lower step
              } else if (nHash > 0.75) {
                h01 = yMid; // Corner quadrant (-X, +Z) chips back to lower step
              } else if (nHash >= 0.45 && nHash <= 0.55) {
                h10 = yBot; // Lower corner quadrant (+X, -Z) erodes down to base tier
              }
            } else if (shape === BlockShape.STEP_POS_Z || type === BlockType.JUNGLE_ROOT_POS_Z) {
              // Base: -Z is yMid, +Z is yTop
              h00 = yMid; h10 = yMid; h01 = yTop; h11 = yTop;
              if (nHash < 0.25) {
                h01 = yMid; // Corner quadrant (-X, +Z) chips back to lower step
              } else if (nHash > 0.75) {
                h11 = yMid; // Corner quadrant (+X, +Z) chips back to lower step
              } else if (nHash >= 0.45 && nHash <= 0.55) {
                h00 = yBot; // Lower corner quadrant (-X, -Z) erodes down to base tier
              }
            } else if (shape === BlockShape.STEP_NEG_Z || type === BlockType.JUNGLE_ROOT_NEG_Z) {
              // Base: -Z is yTop, +Z is yMid
              h00 = yTop; h10 = yTop; h01 = yMid; h11 = yMid;
              if (nHash < 0.25) {
                h00 = yMid; // Corner quadrant (-X, -Z) chips back to lower step
              } else if (nHash > 0.75) {
                h10 = yMid; // Corner quadrant (+X, -Z) chips back to lower step
              } else if (nHash >= 0.45 && nHash <= 0.55) {
                h01 = yBot; // Lower corner quadrant (-X, +Z) erodes down to base tier
              }
            }

            // Dedicated helper for Tread (+Y) quads with exact UV & AO parameter alignment
            const pushTread = (
              p0: [number, number, number],
              p1: [number, number, number],
              p2: [number, number, number],
              p3: [number, number, number],
              u_0: number, v_0: number, u_1: number, v_1: number,
              sec_u_0?: number, sec_v_0?: number, sec_u_1?: number, sec_v_1?: number
            ) => {
              const ao = calculateFaceAO(wx, wy, wz, [0, 1, 0]);
              pushQuad(
                p0, p1, p2, p3,
                [0, 1, 0],
                u_0, v_0, u_1, v_1,
                sec_u_0, sec_v_0, sec_u_1, sec_v_1,
                weight, ao, 1.0, isTransparent, isEmissive
              );
            };

            // 1. Treads (+Y) for each of the 4 sub-quadrants
            const quads = [
              { x0: wx, x1: wx + 0.5, z0: wz, z1: wz + 0.5, h: h00, qx: 0, qz: 0 },
              { x0: wx + 0.5, x1: wx + 1.0, z0: wz, z1: wz + 0.5, h: h10, qx: 1, qz: 0 },
              { x0: wx, x1: wx + 0.5, z0: wz + 0.5, z1: wz + 1.0, h: h01, qx: 0, qz: 1 },
              { x0: wx + 0.5, x1: wx + 1.0, z0: wz + 0.5, z1: wz + 1.0, h: h11, qx: 1, qz: 1 },
            ];

            for (const q of quads) {
              if (q.h > yBot) {
                const u0 = uTop.u0 + (q.qx * 0.5) * (uTop.u1 - uTop.u0);
                const u1 = uTop.u0 + ((q.qx + 1) * 0.5) * (uTop.u1 - uTop.u0);
                const v0 = uTop.vB + (q.qz * 0.5) * (uTop.vT - uTop.vB);
                const v1 = uTop.vB + ((q.qz + 1) * 0.5) * (uTop.vT - uTop.vB);

                const su0 = secUTop ? secUTop.u0 + (q.qx * 0.5) * (secUTop.u1 - secUTop.u0) : undefined;
                const su1 = secUTop ? secUTop.u0 + ((q.qx + 1) * 0.5) * (secUTop.u1 - secUTop.u0) : undefined;
                const sv0 = secUTop ? secUTop.vB + (q.qz * 0.5) * (secUTop.vT - secUTop.vB) : undefined;
                const sv1 = secUTop ? secUTop.vB + ((q.qz + 1) * 0.5) * (secUTop.vT - secUTop.vB) : undefined;

                pushTread(
                  [q.x0, q.h, q.z1], [q.x1, q.h, q.z1], [q.x1, q.h, q.z0], [q.x0, q.h, q.z0],
                  u0, v0, u1, v1,
                  su0, sv0, su1, sv1
                );
              }
            }

            // 2. Internal Step Risers between quadrants
            // Between Q00 & Q10 (at X = wx + 0.5, Z in [wz .. wz + 0.5])
            if (h00 < h10) {
              pushQuad(
                [wx + 0.5, h00, wz], [wx + 0.5, h00, wz + 0.5], [wx + 0.5, h10, wz + 0.5], [wx + 0.5, h10, wz],
                [-1, 0, 0],
                uSide.u0, uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                secUSide?.u0, secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                weight, [1,1,1,1], 0.8, isTransparent, isEmissive
              );
            } else if (h00 > h10) {
              pushQuad(
                [wx + 0.5, h10, wz + 0.5], [wx + 0.5, h10, wz], [wx + 0.5, h00, wz], [wx + 0.5, h00, wz + 0.5],
                [1, 0, 0],
                uSide.u0, uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                secUSide?.u0, secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                weight, [1,1,1,1], 0.8, isTransparent, isEmissive
              );
            }

            // Between Q01 & Q11 (at X = wx + 0.5, Z in [wz + 0.5 .. wz + 1.0])
            if (h01 < h11) {
              pushQuad(
                [wx + 0.5, h01, wz + 0.5], [wx + 0.5, h01, wz + 1.0], [wx + 0.5, h11, wz + 1.0], [wx + 0.5, h11, wz + 0.5],
                [-1, 0, 0],
                uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSideMidV, uSide.u1, uSide.vT,
                secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secSideMidV, secUSide?.u1, secUSide?.vT,
                weight, [1,1,1,1], 0.8, isTransparent, isEmissive
              );
            } else if (h01 > h11) {
              pushQuad(
                [wx + 0.5, h11, wz + 1.0], [wx + 0.5, h11, wz + 0.5], [wx + 0.5, h01, wz + 0.5], [wx + 0.5, h01, wz + 1.0],
                [1, 0, 0],
                uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSideMidV, uSide.u1, uSide.vT,
                secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secSideMidV, secUSide?.u1, secUSide?.vT,
                weight, [1,1,1,1], 0.8, isTransparent, isEmissive
              );
            }

            // Between Q00 & Q01 (at Z = wz + 0.5, X in [wx .. wx + 0.5])
            if (h00 < h01) {
              pushQuad(
                [wx + 0.5, h00, wz + 0.5], [wx, h00, wz + 0.5], [wx, h01, wz + 0.5], [wx + 0.5, h01, wz + 0.5],
                [0, 0, -1],
                uSide.u0, uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                secUSide?.u0, secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                weight, [1,1,1,1], 0.7, isTransparent, isEmissive
              );
            } else if (h00 > h01) {
              pushQuad(
                [wx, h01, wz + 0.5], [wx + 0.5, h01, wz + 0.5], [wx + 0.5, h00, wz + 0.5], [wx, h00, wz + 0.5],
                [0, 0, 1],
                uSide.u0, uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                secUSide?.u0, secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                weight, [1,1,1,1], 0.7, isTransparent, isEmissive
              );
            }

            // Between Q10 & Q11 (at Z = wz + 0.5, X in [wx + 0.5 .. wx + 1.0])
            if (h10 < h11) {
              pushQuad(
                [wx + 1.0, h10, wz + 0.5], [wx + 0.5, h10, wz + 0.5], [wx + 0.5, h11, wz + 0.5], [wx + 1.0, h11, wz + 0.5],
                [0, 0, -1],
                uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSideMidV, uSide.u1, uSide.vT,
                secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secSideMidV, secUSide?.u1, secUSide?.vT,
                weight, [1,1,1,1], 0.7, isTransparent, isEmissive
              );
            } else if (h10 > h11) {
              pushQuad(
                [wx + 0.5, h11, wz + 0.5], [wx + 1.0, h11, wz + 0.5], [wx + 1.0, h10, wz + 0.5], [wx + 0.5, h10, wz + 0.5],
                [0, 0, 1],
                uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSideMidV, uSide.u1, uSide.vT,
                secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secSideMidV, secUSide?.u1, secUSide?.vT,
                weight, [1,1,1,1], 0.7, isTransparent, isEmissive
              );
            }

            // 3. External Outer Walls (Bordering Adjacent Blocks)
            // Outer -X Wall (at X = wx)
            const nxBlock = getNeighborBlock(wx - 1, wy, wz);
            if (nxBlock === BlockType.AIR || BLOCK_DEFINITIONS[nxBlock]?.isTransparent || isSubBlock(nxBlock)) {
              if (h00 > yBot) {
                pushQuad(
                  [wx, yBot, wz], [wx, yBot, wz + 0.5], [wx, h00, wz + 0.5], [wx, h00, wz],
                  [-1, 0, 0],
                  uSide.u0, h00 >= yTop ? uSide.vB : uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                  secUSide?.u0, h00 >= yTop ? secUSide?.vB : secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                  weight, [1,1,1,1], 0.8, isTransparent, isEmissive
                );
              }
              if (h01 > yBot) {
                pushQuad(
                  [wx, yBot, wz + 0.5], [wx, yBot, wz + 1.0], [wx, h01, wz + 1.0], [wx, h01, wz + 0.5],
                  [-1, 0, 0],
                  uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), h01 >= yTop ? uSide.vB : uSideMidV, uSide.u1, uSide.vT,
                  secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, h01 >= yTop ? secUSide?.vB : secSideMidV, secUSide?.u1, secUSide?.vT,
                  weight, [1,1,1,1], 0.8, isTransparent, isEmissive
                );
              }
            }

            // Outer +X Wall (at X = wx + 1.0)
            const pxBlock = getNeighborBlock(wx + 1, wy, wz);
            if (pxBlock === BlockType.AIR || BLOCK_DEFINITIONS[pxBlock]?.isTransparent || isSubBlock(pxBlock)) {
              if (h10 > yBot) {
                pushQuad(
                  [wx + 1.0, yBot, wz + 0.5], [wx + 1.0, yBot, wz], [wx + 1.0, h10, wz], [wx + 1.0, h10, wz + 0.5],
                  [1, 0, 0],
                  uSide.u0, h10 >= yTop ? uSide.vB : uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                  secUSide?.u0, h10 >= yTop ? secUSide?.vB : secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                  weight, [1,1,1,1], 0.8, isTransparent, isEmissive
                );
              }
              if (h11 > yBot) {
                pushQuad(
                  [wx + 1.0, yBot, wz + 1.0], [wx + 1.0, yBot, wz + 0.5], [wx + 1.0, h11, wz + 0.5], [wx + 1.0, h11, wz + 1.0],
                  [1, 0, 0],
                  uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), h11 >= yTop ? uSide.vB : uSideMidV, uSide.u1, uSide.vT,
                  secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, h11 >= yTop ? secUSide?.vB : secSideMidV, secUSide?.u1, secUSide?.vT,
                  weight, [1,1,1,1], 0.8, isTransparent, isEmissive
                );
              }
            }

            // Outer -Z Wall (at Z = wz)
            const nzBlock = getNeighborBlock(wx, wy, wz - 1);
            if (nzBlock === BlockType.AIR || BLOCK_DEFINITIONS[nzBlock]?.isTransparent || isSubBlock(nzBlock)) {
              if (h00 > yBot) {
                pushQuad(
                  [wx + 0.5, yBot, wz], [wx, yBot, wz], [wx, h00, wz], [wx + 0.5, h00, wz],
                  [0, 0, -1],
                  uSide.u0, h00 >= yTop ? uSide.vB : uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                  secUSide?.u0, h00 >= yTop ? secUSide?.vB : secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                  weight, [1,1,1,1], 0.7, isTransparent, isEmissive
                );
              }
              if (h10 > yBot) {
                pushQuad(
                  [wx + 1.0, yBot, wz], [wx + 0.5, yBot, wz], [wx + 0.5, h10, wz], [wx + 1.0, h10, wz],
                  [0, 0, -1],
                  uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), h10 >= yTop ? uSide.vB : uSideMidV, uSide.u1, uSide.vT,
                  secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, h10 >= yTop ? secUSide?.vB : secSideMidV, secUSide?.u1, secUSide?.vT,
                  weight, [1,1,1,1], 0.7, isTransparent, isEmissive
                );
              }
            }

            // Outer +Z Wall (at Z = wz + 1.0)
            const pzBlock = getNeighborBlock(wx, wy, wz + 1);
            if (pzBlock === BlockType.AIR || BLOCK_DEFINITIONS[pzBlock]?.isTransparent || isSubBlock(pzBlock)) {
              if (h01 > yBot) {
                pushQuad(
                  [wx, yBot, wz + 1.0], [wx + 0.5, yBot, wz + 1.0], [wx + 0.5, h01, wz + 1.0], [wx, h01, wz + 1.0],
                  [0, 0, 1],
                  uSide.u0, h01 >= yTop ? uSide.vB : uSideMidV, uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), uSide.vT,
                  secUSide?.u0, h01 >= yTop ? secUSide?.vB : secSideMidV, secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, secUSide?.vT,
                  weight, [1,1,1,1], 0.7, isTransparent, isEmissive
                );
              }
              if (h11 > yBot) {
                pushQuad(
                  [wx + 0.5, yBot, wz + 1.0], [wx + 1.0, yBot, wz + 1.0], [wx + 1.0, h11, wz + 1.0], [wx + 0.5, h11, wz + 1.0],
                  [0, 0, 1],
                  uSide.u0 + 0.5 * (uSide.u1 - uSide.u0), h11 >= yTop ? uSide.vB : uSideMidV, uSide.u1, uSide.vT,
                  secUSide ? secUSide.u0 + 0.5 * (secUSide.u1 - secUSide.u0) : undefined, h11 >= yTop ? secUSide?.vB : secSideMidV, secUSide?.u1, secUSide?.vT,
                  weight, [1,1,1,1], 0.7, isTransparent, isEmissive
                );
              }
            }

            // 4. Bottom Face (-Y)
            const botN = getNeighborBlock(wx, wy - 1, wz);
            if (botN === BlockType.AIR || BLOCK_DEFINITIONS[botN]?.isTransparent) {
              const ao = calculateFaceAO(wx, wy, wz, [0, -1, 0]);
              pushQuad(
                [wx, yBot, wz], [wx + 1, yBot, wz], [wx + 1, yBot, wz + 1], [wx, yBot, wz + 1],
                [0, -1, 0], uSide.u0, uSide.vB, uSide.u1, uSide.vT, undefined, undefined, undefined, undefined, 0, ao, 0.5, isTransparent, isEmissive
              );
            }

            continue;
          }

          // --- 3. JUNGLE HANGING VINES (0.10m ultra-thin slender cord) ---
          if ((type as BlockType) === BlockType.JUNGLE_VINES) {
            const yBot = wy * 0.5;
            const yTop = (wy + 1) * 0.5;
            const u = getUV(def.sideTextureIndex);
            const uSpan = u.u1 - u.u0;
            const vineU0 = u.u0 + uSpan * 0.25;
            const vineU1 = u.u0 + uSpan * 0.75;
            const x0 = wx + 0.45, x1 = wx + 0.55; // Exactly 0.10m width
            const z0 = wz + 0.45, z1 = wz + 0.55; // Exactly 0.10m depth

            // 4 vertical slender vine cord faces (East, West, South, North)
            pushQuad([x1, yBot, z1], [x1, yBot, z0], [x1, yTop, z0], [x1, yTop, z1], [1, 0, 0], vineU0, u.vB, vineU1, u.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.85, true, false);
            pushQuad([x0, yBot, z0], [x0, yBot, z1], [x0, yTop, z1], [x0, yTop, z0], [-1, 0, 0], vineU0, u.vB, vineU1, u.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.85, true, false);
            pushQuad([x0, yBot, z1], [x1, yBot, z1], [x1, yTop, z1], [x0, yTop, z1], [0, 0, 1], vineU0, u.vB, vineU1, u.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.80, true, false);
            pushQuad([x1, yBot, z0], [x0, yBot, z0], [x0, yTop, z0], [x1, yTop, z0], [0, 0, -1], vineU0, u.vB, vineU1, u.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.80, true, false);

            const botN = getNeighborBlock(wx, wy - 1, wz);
            if (botN !== BlockType.JUNGLE_VINES) {
              pushQuad([x0, yBot, z0], [x1, yBot, z0], [x1, yBot, z1], [x0, yBot, z1], [0, -1, 0], vineU0, u.vB, vineU1, u.vT, undefined, undefined, undefined, undefined, 0, [1,1,1,1], 0.75, true, false);
            }
            continue;
          }

          // --- 4. STANDARD CUBE VOXEL MESHING ---
          const faces: Array<{ dir: [number, number, number]; tex: number; bright: number }> = [
            { dir: [1, 0, 0], tex: def.xTextureIndex ?? def.sideTextureIndex, bright: 0.8 },
            { dir: [-1, 0, 0], tex: def.xTextureIndex ?? def.sideTextureIndex, bright: 0.8 },
            { dir: [0, 1, 0], tex: def.topTextureIndex, bright: 1.0 },
            { dir: [0, -1, 0], tex: def.bottomTextureIndex, bright: 0.5 },
            { dir: [0, 0, 1], tex: def.zTextureIndex ?? def.sideTextureIndex, bright: 0.7 },
            { dir: [0, 0, -1], tex: def.zTextureIndex ?? def.sideTextureIndex, bright: 0.7 },
          ];

          for (const face of faces) {
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];
            const neighbor = getNeighborBlock(nx, ny, nz);
            const neighborDef = BLOCK_DEFINITIONS[neighbor];
            
            let shouldRender = false;
            if (def.isLiquid) {
              if (face.dir[1] === 1) {
                shouldRender = neighbor === BlockType.AIR;
              } else {
                const isNeighborLiquid = neighborDef && neighborDef.isLiquid;
                shouldRender = neighbor === BlockType.AIR || (!isNeighborLiquid && neighborDef && !!neighborDef.isTransparent);
              }
            } else {
              shouldRender = neighbor === BlockType.AIR || neighbor === BlockType.UNLOADED ||
                             !neighborDef ||
                             isSubBlock(neighbor) ||
                             (isLogBlock(type) && isLeafBlock(neighbor)) ||
                             !!(neighborDef && neighborDef.isTransparent && neighbor !== type);
            }

            if (shouldRender) {
              const isTop = face.dir[1] === 1;
              const secTex = secDef ? (isTop ? secDef.topTextureIndex : secDef.sideTextureIndex) : undefined;
              addFace(wx, wy, wz, face.dir, face.tex, isTransparent, face.bright, isEmissive, secTex, isTop ? weight : (weight * 0.7));
            }
          }
        }
      }
    }

    let solidMesh: THREE.Mesh | null = null;
    if (vIdx > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Chunk.scratchPositions.slice(0, vIdx), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(Chunk.scratchNormals.slice(0, vIdx), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(Chunk.scratchUvs.slice(0, uIdx), 2));
      geo.setAttribute('aUv2', new THREE.BufferAttribute(Chunk.scratchUv2s.slice(0, uIdx), 2));
      geo.setAttribute('aBlendWeight', new THREE.BufferAttribute(Chunk.scratchBlendWeights.slice(0, wIdx), 1));
      geo.setAttribute('color', new THREE.BufferAttribute(Chunk.scratchColors.slice(0, cIdx), 3));

      const mat = new THREE.MeshLambertMaterial({
        map: atlasTexture,
        vertexColors: true,
        side: THREE.FrontSide,
      });
      applyLiquidShader(mat);

      solidMesh = new THREE.Mesh(geo, mat);
      solidMesh.castShadow = true;
      solidMesh.receiveShadow = true;
    }

    let transMesh: THREE.Mesh | null = null;
    if (tvIdx > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Chunk.scratchTransPositions.slice(0, tvIdx), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(Chunk.scratchTransNormals.slice(0, tvIdx), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(Chunk.scratchTransUvs.slice(0, tuIdx), 2));
      geo.setAttribute('aUv2', new THREE.BufferAttribute(Chunk.scratchTransUv2s.slice(0, tuIdx), 2));
      geo.setAttribute('aBlendWeight', new THREE.BufferAttribute(Chunk.scratchTransBlendWeights.slice(0, twIdx), 1));

      const mat = new THREE.MeshLambertMaterial({
        map: atlasTexture,
        transparent: true,
        opacity: 0.85,
        alphaTest: 0.05,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      applyLiquidShader(mat, true);

      transMesh = new THREE.Mesh(geo, mat);
      transMesh.castShadow = true;
      transMesh.receiveShadow = true;
    }

    // Build InstancedMeshes for custom 3D GLB block types
    const instancedMeshes: THREE.InstancedMesh[] = [];
    if (blockModelManager) {
      for (const [type, matrices] of customModelPositions.entries()) {
        const geo = blockModelManager.customGeometries.get(type);
        const mat = blockModelManager.customMaterials.get(type);
        if (geo && mat && matrices.length > 0) {
          const instancedMesh = new THREE.InstancedMesh(geo, mat, matrices.length);
          instancedMesh.matrixAutoUpdate = false;

          // Enable shadows for all tree foliage types
          if (isLeafBlock(type) || isLogOrBranchBlock(type)) {
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
          } else {
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
          }

          for (let i = 0; i < matrices.length; i++) {
            instancedMesh.setMatrixAt(i, matrices[i]);
          }
          instancedMesh.instanceMatrix.needsUpdate = true;
          instancedMeshes.push(instancedMesh);
        }
      }
    }

    let emissiveMesh: THREE.Mesh | null = null;
    if (evIdx > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Chunk.scratchEmissivePositions.slice(0, evIdx), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(Chunk.scratchEmissiveNormals.slice(0, evIdx), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(Chunk.scratchEmissiveUvs.slice(0, euIdx), 2));
      geo.setAttribute('aUv2', new THREE.BufferAttribute(Chunk.scratchEmissiveUv2s.slice(0, euIdx), 2));
      geo.setAttribute('aBlendWeight', new THREE.BufferAttribute(Chunk.scratchEmissiveBlendWeights.slice(0, ewIdx), 1));
      geo.setAttribute('color', new THREE.BufferAttribute(Chunk.scratchEmissiveColors.slice(0, ecIdx), 3));

      // MeshLambertMaterial matches solidMesh terrain 100% perfectly without shiny specular gloss mismatch!
      // emissiveAtlasTexture is pure black over stone background, so ONLY metallic ore veins glow in the dark.
      const mat = new THREE.MeshLambertMaterial({
        map: atlasTexture,
        emissiveMap: emissiveAtlasTexture,
        emissive: new THREE.Color(0xffffff),
        vertexColors: true,
        side: THREE.FrontSide,
      });
      applyLiquidShader(mat, false);

      emissiveMesh = new THREE.Mesh(geo, mat);
      emissiveMesh.castShadow = true;
      emissiveMesh.receiveShadow = true;
    }

    this.mesh = solidMesh;
    this.transparentMesh = transMesh;
    this.emissiveMesh = emissiveMesh;
    this.instancedMeshes = instancedMeshes;
    this.isDirty = false;

    return { solid: solidMesh, transparent: transMesh, emissive: emissiveMesh, instanced: instancedMeshes };
  }

  public dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.material) {
        if (Array.isArray(this.mesh.material)) {
          this.mesh.material.forEach((m) => m.dispose());
        } else {
          (this.mesh.material as THREE.Material).dispose();
        }
      }
      this.mesh = null;
    }

    if (this.transparentMesh) {
      this.transparentMesh.geometry.dispose();
      if (this.transparentMesh.material) {
        if (Array.isArray(this.transparentMesh.material)) {
          this.transparentMesh.material.forEach((m) => m.dispose());
        } else {
          (this.transparentMesh.material as THREE.Material).dispose();
        }
      }
      this.transparentMesh = null;
    }

    if (this.emissiveMesh) {
      this.emissiveMesh.geometry.dispose();
      if (this.emissiveMesh.material) {
        if (Array.isArray(this.emissiveMesh.material)) {
          this.emissiveMesh.material.forEach((m) => m.dispose());
        } else {
          (this.emissiveMesh.material as THREE.Material).dispose();
        }
      }
      this.emissiveMesh = null;
    }

    for (const instMesh of this.instancedMeshes) {
      // Release WebGL instance buffer allocations without disposing shared GLTF geometries
      instMesh.dispose();
    }
    this.instancedMeshes = [];
    this.glowingOrePositions = [];
  }
}
