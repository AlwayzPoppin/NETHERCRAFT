import * as THREE from 'three';
import { BlockType } from '../textures/TextureGenerator';

export interface ModelLoadProgress {
  loaded: number;
  total: number;
  currentName: string;
}

export class BlockModelManager {
  public isLoaded: boolean = false;
  public static leafUniforms = {
    uLeafOpacity: { value: 0.88 },
  };
  private onLoadCallbacks: Array<() => void> = [];
  private onProgressCallbacks: Array<(progress: ModelLoadProgress) => void> = [];
  private readyPromise: Promise<void>;

  public customGeometries: Map<BlockType, THREE.BufferGeometry> = new Map();
  public customMaterials: Map<BlockType, THREE.MeshLambertMaterial> = new Map();

  public static applyLeafDitherShader(mat: THREE.MeshLambertMaterial): void {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLeafOpacity = BlockModelManager.leafUniforms.uLeafOpacity;
      shader.fragmentShader = `
        uniform float uLeafOpacity;
        ${shader.fragmentShader}
      `;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        if (uLeafOpacity < 0.999) {
          int dX = int(mod(gl_FragCoord.x, 4.0));
          int dY = int(mod(gl_FragCoord.y, 4.0));
          float dThresh = 0.0;
          if (dX == 0) {
            if (dY == 0) dThresh = 0.0625;
            else if (dY == 1) dThresh = 0.8125;
            else if (dY == 2) dThresh = 0.25;
            else dThresh = 1.0;
          } else if (dX == 1) {
            if (dY == 0) dThresh = 0.5625;
            else if (dY == 1) dThresh = 0.3125;
            else if (dY == 2) dThresh = 0.75;
            else dThresh = 0.50;
          } else if (dX == 2) {
            if (dY == 0) dThresh = 0.1875;
            else if (dY == 1) dThresh = 0.9375;
            else if (dY == 2) dThresh = 0.125;
            else dThresh = 0.875;
          } else {
            if (dY == 0) dThresh = 0.6875;
            else if (dY == 1) dThresh = 0.4375;
            else if (dY == 2) dThresh = 0.625;
            else dThresh = 0.375;
          }
          if (dThresh > uLeafOpacity) {
            discard;
          }
        }
        `
      );
    };
  }

  constructor() {
    const compoundLeafGeo = this.createCompoundFoliageGeometry();

    const leafColors: Array<[BlockType, number]> = [
      [BlockType.OAK_LEAVES, 0x15803d],
      [BlockType.TEAL_LEAVES, 0x00ebd6],
      [BlockType.BLUE_LEAVES, 0x1e90ff],
      [BlockType.PURPLE_LEAVES, 0x9b30ff],
      [BlockType.CHARRED_LEAVES, 0x2d2d32],
      [BlockType.JUNGLE_LEAVES, 0x22c55e],
      [BlockType.FROST_LEAVES, 0x67e8f9],
      [BlockType.PALM_FRONDS, 0x84cc16],
      [BlockType.WITHERED_THORNS, 0x3f3f46],
    ];

    for (const [type, hex] of leafColors) {
      this.customGeometries.set(type, compoundLeafGeo);
      const mat = new THREE.MeshLambertMaterial({
        color: hex,
        transparent: false,
        alphaTest: 0.1,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide
      });
      BlockModelManager.applyLeafDitherShader(mat);
      this.customMaterials.set(type, mat);
    }

    this.readyPromise = this.initLeafModels();
  }

  public static createTintedLeafCanvas(
    baseImage: HTMLImageElement | HTMLCanvasElement,
    hexColor: number
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const width = (baseImage as any).width || 256;
    const height = (baseImage as any).height || 256;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(baseImage, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const tr = (hexColor >> 16) & 0xff;
    const tg = (hexColor >> 8) & 0xff;
    const tb = hexColor & 0xff;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255.0;
      data[i]     = Math.min(255, Math.round(tr * lum * 1.25));
      data[i + 1] = Math.min(255, Math.round(tg * lum * 1.25));
      data[i + 2] = Math.min(255, Math.round(tb * lum * 1.25));
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  private async initLeafModels(): Promise<void> {
    const loader = new THREE.TextureLoader();

    // 1. Load the authentic high-resolution Oak leaf texture for Grove biome
    try {
      const oakTex = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load('/textures/trees/TREE LEAVES TEXTURE.png', (t) => resolve(t), undefined, (err) => reject(err));
      });
      oakTex.magFilter = THREE.NearestFilter;
      oakTex.minFilter = THREE.NearestFilter;
      oakTex.colorSpace = THREE.SRGBColorSpace;

      const oakMat = this.customMaterials.get(BlockType.OAK_LEAVES);
      if (oakMat) {
        oakMat.map = oakTex;
        oakMat.color.setHex(0xffffff);
        oakMat.alphaTest = 0.1;
        oakMat.depthWrite = true;
        oakMat.depthTest = true;
        oakMat.transparent = false;
        BlockModelManager.applyLeafDitherShader(oakMat);
        oakMat.needsUpdate = true;
      }

      // Generate fantasy color variations (Teal, Blue, Purple, Withered) from the high-res oak texture
      const baseImg = oakTex.image;
      const fantasyTypes: Array<[BlockType, number]> = [
        [BlockType.TEAL_LEAVES, 0x14b8a6],
        [BlockType.BLUE_LEAVES, 0x3b82f6],
        [BlockType.PURPLE_LEAVES, 0xc084fc],
        [BlockType.WITHERED_THORNS, 0x71717a],
      ];

      for (const [type, hex] of fantasyTypes) {
        const tintedCanvas = BlockModelManager.createTintedLeafCanvas(baseImg, hex);
        const tex = new THREE.CanvasTexture(tintedCanvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;

        const mat = this.customMaterials.get(type);
        if (mat) {
          mat.map = tex;
          mat.color.setHex(0xffffff);
          mat.alphaTest = 0.1;
          mat.depthWrite = true;
          mat.depthTest = true;
          mat.transparent = false;
          BlockModelManager.applyLeafDitherShader(mat);
          mat.needsUpdate = true;
        }
      }
    } catch (e) {
      console.warn('Could not load base oak leaf texture:', e);
    }

    // 2. Load dedicated external textures for specialty biomes
    const specialtyLeaves: Array<{ type: BlockType; url: string }> = [
      { type: BlockType.JUNGLE_LEAVES, url: '/textures/vegetation/Mossveil-canopy-tree-leaf.png' },
      { type: BlockType.FROST_LEAVES, url: '/textures/trees/FROSTED PINE NEEDLES.png' },
      { type: BlockType.PALM_FRONDS, url: '/textures/vegetation/WITHERED PALM FRONDS.png' },
      { type: BlockType.CHARRED_LEAVES, url: '/textures/vegetation/CORRUPTED GROWTH.png' },
    ];

    await Promise.all(
      specialtyLeaves.map(async ({ type, url }) => {
        try {
          const tex = await new Promise<THREE.Texture>((resolve, reject) => {
            loader.load(url, (t) => resolve(t), undefined, (err) => reject(err));
          });
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;

          const mat = this.customMaterials.get(type);
          if (mat) {
            mat.map = tex;
            mat.color.setHex(0xffffff);
            mat.alphaTest = 0.1;
            mat.depthWrite = true;
            mat.depthTest = true;
            mat.transparent = false;
            BlockModelManager.applyLeafDitherShader(mat);
            mat.needsUpdate = true;
          }
        } catch (e) {
          console.warn(`Could not load specialty leaf texture for ${type}:`, e);
        }
      })
    );

    // Mark ready and fire any queued callbacks
    this.isLoaded = true;

    for (const cb of this.onProgressCallbacks) {
      cb({ loaded: 1, total: 1, currentName: 'Volumetric Foliage Models Loaded' });
    }
    for (const cb of this.onLoadCallbacks) {
      cb();
    }
  }

  private createCompoundFoliageGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const addQuad = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
      p3: [number, number, number],
      norm: [number, number, number],
      uv_u0: number = 0, uv_v0: number = 0,
      uv_u1: number = 1, uv_v1: number = 1
    ) => {
      // Tri 1: 0, 1, 2
      positions.push(...p0, ...p1, ...p2);
      normals.push(...norm, ...norm, ...norm);
      uvs.push(uv_u0, uv_v0, uv_u1, uv_v0, uv_u1, uv_v1);

      // Tri 2: 0, 2, 3
      positions.push(...p0, ...p2, ...p3);
      normals.push(...norm, ...norm, ...norm);
      uvs.push(uv_u0, uv_v0, uv_u1, uv_v1, uv_u0, uv_v1);
    };

    const addMicroCube = (ox: number, oy: number, oz: number, s: number) => {
      const h = s * 0.5;
      const minX = ox - h, maxX = ox + h;
      const minY = oy - h, maxY = oy + h;
      const minZ = oz - h, maxZ = oz + h;

      // Proportional UV mapping within unit block space [-0.5 .. 0.5]
      // Prevents extreme high-frequency texture repetition and eliminates grainy static!
      const u0_x = Math.max(0, Math.min(1, minX + 0.5));
      const u1_x = Math.max(0, Math.min(1, maxX + 0.5));
      const v0_z = Math.max(0, Math.min(1, minZ + 0.5));
      const v1_z = Math.max(0, Math.min(1, maxZ + 0.5));

      const v0_y = Math.max(0, Math.min(1, minY + 0.5));
      const v1_y = Math.max(0, Math.min(1, maxY + 0.5));
      const u0_z = Math.max(0, Math.min(1, minZ + 0.5));
      const u1_z = Math.max(0, Math.min(1, maxZ + 0.5));

      // +Y (Top)
      addQuad([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0], u0_x, v0_z, u1_x, v1_z);
      // -Y (Bottom)
      addQuad([minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0], u0_x, v0_z, u1_x, v1_z);
      // +X (Right)
      addQuad([maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [1, 0, 0], u0_z, v0_y, u1_z, v1_y);
      // -X (Left)
      addQuad([minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [-1, 0, 0], u0_z, v0_y, u1_z, v1_y);
      // +Z (Front)
      addQuad([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1], u0_x, v0_y, u1_x, v1_y);
      // -Z (Back)
      addQuad([maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1], u0_x, v0_y, u1_x, v1_y);
    };

    // 12 Distinct Equilateral Micro-Cubes in a Fluffy Cloud Cluster (Hytale Spec)
    // 1. Central Core Cube
    addMicroCube(0, 0, 0, 0.44);
    // 2. Top Sunlit Crown
    addMicroCube(0.02, 0.28, -0.02, 0.40);
    // 3. Bottom Underside
    addMicroCube(-0.02, -0.28, 0.02, 0.38);
    // 4. North Outer
    addMicroCube(0.04, 0.05, -0.35, 0.40);
    // 5. South Outer
    addMicroCube(-0.04, 0.03, 0.35, 0.40);
    // 6. East Outer
    addMicroCube(0.35, 0.04, 0.03, 0.40);
    // 7. West Outer
    addMicroCube(-0.35, -0.04, -0.03, 0.40);
    // 8. North-East Upper Corner
    addMicroCube(0.30, 0.20, -0.30, 0.36);
    // 9. North-West Lower Corner
    addMicroCube(-0.30, -0.16, -0.30, 0.36);
    // 10. South-East Lower Corner
    addMicroCube(0.30, -0.18, 0.30, 0.36);
    // 11. South-West Upper Corner
    addMicroCube(-0.30, 0.22, 0.30, 0.36);
    // 12. Organic Fluff Accents
    addMicroCube(0.18, 0.12, -0.18, 0.32);
    addMicroCube(-0.18, -0.12, 0.18, 0.32);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geo;
  }

  public onReady(callback: () => void): void {
    if (this.isLoaded) {
      callback();
    } else {
      this.onLoadCallbacks.push(callback);
    }
  }

  public onProgress(callback: (progress: ModelLoadProgress) => void): void {
    if (this.isLoaded) {
      callback({ loaded: 1, total: 1, currentName: 'High-Res Replacement Textures Loaded' });
    } else {
      this.onProgressCallbacks.push(callback);
    }
  }

  public async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  public hasCustomModel(type: BlockType): boolean {
    return this.customGeometries.has(type);
  }

  public setLeafOpacity(opacity: number): void {
    BlockModelManager.leafUniforms.uLeafOpacity.value = Math.max(0.05, Math.min(1.0, opacity));
  }
}

