import * as THREE from 'three';

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  OAK_LOG = 4,
  OAK_LEAVES = 5,
  SAND = 6,
  WATER = 7,
  GLASS = 8,
  BRICK = 9,
  COBBLESTONE = 10,
  COAL_ORE = 11,
  IRON_ORE = 12,
  GOLD_ORE = 13,
  DIAMOND_ORE = 14,
  PLANKS = 15,
  TNT = 16,
  BEDROCK = 17,
  // Ice Biome Blocks
  SNOW = 18,
  FROST_STONE = 19,
  PACKED_SNOW = 20,
  FROZEN_LOG = 21,
  FROST_LEAVES = 22,
  FROST_ORE = 23,
  FROZEN_PLANKS = 24,
  ICE = 25,
  FROST_BLOOM = 26,
  // Ashen Ruins Blocks
  NETHER_STONE = 27,
  ASHEN_SOIL = 28,
  CORRUPTED_GROWTH = 29,
  CINDER_SAND = 30,
  PETRIFIED_LOG = 31,
  WITHERED_THORNS = 32,
  CORRUPTED_ORE = 33,
  RUINED_PLANKS = 34,
  CORRUPTION_BLOOM = 35,
  MOLTEN_CORRUPTION = 36,
  // Sunscorched Ruins Blocks
  SUNSCORCHED_SANDSTONE = 37,
  CRACKED_CLAY = 38,
  SCRUBGRASS = 39,
  DESERT_SAND = 40,
  PETRIFIED_SUNWOOD = 41,
  PALM_FRONDS = 42,
  SUNSTONE_ORE = 43,
  TEMPLE_PLANKS = 44,
  DESERT_BLOOM = 45,
  OASIS_WATER = 46,
  // Horizontal Log Variants
  OAK_LOG_X = 47,
  OAK_LOG_Z = 48,
  FROZEN_LOG_X = 49,
  FROZEN_LOG_Z = 50,
  PETRIFIED_LOG_X = 51,
  PETRIFIED_LOG_Z = 52,
  PETRIFIED_SUNWOOD_X = 53,
  PETRIFIED_SUNWOOD_Z = 54,
  // Craftable Workstation Blocks
  WORKBENCH = 55,
  SMITHING_FORGE = 56,
  ARMOR_STATION = 57,
  NETHER_ALTAR = 58,
  // Fantasy Foliage Leaf Variants
  TEAL_LEAVES = 59,
  BLUE_LEAVES = 60,
  PURPLE_LEAVES = 61,
  CHARRED_LEAVES = 62,
  // Biome Boundary Transition Blocks (Straight and Diagonal Tapas)
  TRANSITION_NETHER_GRASS_STRAIGHT = 63,
  TRANSITION_NETHER_GRASS_DIAGONAL = 64,
  TRANSITION_DESERT_GRASS_STRAIGHT = 65,
  TRANSITION_DESERT_GRASS_DIAGONAL = 66,
  TRANSITION_FROST_GRASS_STRAIGHT = 67,
  TRANSITION_FROST_GRASS_DIAGONAL = 68,
  TRANSITION_DESERT_NETHER_DIAGONAL = 69,
  TRANSITION_FROST_NETHER_DIAGONAL = 70,
  TRANSITION_FROST_NETHER_STRAIGHT = 71,
  TRANSITION_DESERT_NETHER_STRAIGHT = 72,
  // Ashen Cave Ore Variants
  ASHEN_COPPER_ORE = 73,
  ASHEN_SILVER_ORE = 74,
  ASHEN_GOLD_ORE = 75,
  ASHEN_ABYSSAL_PRIMORDIUM = 76,
  FLOWER = 77,
  // Mossveil Jungle Biome Blocks
  RAINFOREST_GRASS = 78,
  RAINFOREST_SOIL = 79,
  MOSSVEIL_MUD = 80,
  JUNGLE_LOG = 81,
  JUNGLE_LOG_X = 82,
  JUNGLE_LOG_Z = 83,
  JUNGLE_LEAVES = 84,
  MOSSVEIL_MOSSY_STONE = 85,
  MOSSVEIL_ROOT_TANGLE = 86,
  MOSSVEIL_THORNED_UNDERGROWTH = 87,
  JUNGLE_PLANKS = 88,
  JUNGLE_ROOT_POS_X = 89,
  JUNGLE_ROOT_NEG_X = 90,
  JUNGLE_ROOT_POS_Z = 91,
  JUNGLE_ROOT_NEG_Z = 92,
  JUNGLE_VINES = 93,
  JUNGLE_ROPE = 94,
  HUNTING_BOW = 95,
  JUNGLE_WATER = 96,
  MUDDY_QUICKSAND = 97,
  // Animal & Monster Resource Drops
  BONECREST_HORN = 100,
  UNCOOKED_MEAT = 101,
  ANIMAL_HIDE = 102,
  // Foraging & Ground Pickups
  APPLES = 103,
  REEDS = 104,
  BRANCHES = 105,
  FLINT = 106,
  STONE_PEBBLE = 107,
  ASHEN_EMBERPOD = 108,
  CARROT = 109,
  // Additional Animal & Monster Drops
  THORNSPIKE_CLUSTER = 110,
  BLOOMWING_FEATHER = 111,
  DUNESTING_BARB = 112,
  DUNESTING_PINCER_CLAW = 113,
  DUNESTING_SHELL = 114,
  // Tools & Weapons
  FLIMSY_AXE = 115,
  FLIMSY_PICKAXE = 116,
  TORCH = 117,

  // Progressive Tapered Branch Variants (Step 1: 0.75m, Step 2: 0.50m, Step 3+: 0.25m)
  OAK_BRANCH_1 = 118,
  OAK_BRANCH_2 = 119,
  OAK_BRANCH_3 = 120,
  JUNGLE_BRANCH_1 = 121,
  JUNGLE_BRANCH_2 = 122,
  JUNGLE_BRANCH_3 = 123,
  FROZEN_BRANCH_1 = 124,
  FROZEN_BRANCH_2 = 125,
  FROZEN_BRANCH_3 = 126,
  PETRIFIED_BRANCH_1 = 127,
  PETRIFIED_BRANCH_2 = 128,
  PETRIFIED_BRANCH_3 = 129,
  SUNWOOD_BRANCH_1 = 130,
  SUNWOOD_BRANCH_2 = 131,
  SUNWOOD_BRANCH_3 = 132,
  // Additional Tools & Monster Drops
  STONE_AXE = 133,
  BONECREST_HAMMER = 134,
  BONECREST_SHIELD = 135,
  COOKED_MEAT = 136,

  // Discrete Sub-Block Shapes: Slabs (0.25m Half-Height)
  GRASS_SLAB = 140,
  DIRT_SLAB = 141,
  STONE_SLAB = 142,
  SAND_SLAB = 143,
  SNOW_SLAB = 144,
  MOSSVEIL_MUD_SLAB = 145,
  COBBLESTONE_SLAB = 146,
  PLANKS_SLAB = 147,
  ASHEN_SOIL_SLAB = 148,

  // Discrete Sub-Block Shapes: 90-Degree Right-Angled Stepped Micro-Blocks
  GRASS_STEP_POS_X = 150,
  GRASS_STEP_NEG_X = 151,
  GRASS_STEP_POS_Z = 152,
  GRASS_STEP_NEG_Z = 153,

  DIRT_STEP_POS_X = 154,
  DIRT_STEP_NEG_X = 155,
  DIRT_STEP_POS_Z = 156,
  DIRT_STEP_NEG_Z = 157,

  STONE_STEP_POS_X = 158,
  STONE_STEP_NEG_X = 159,
  STONE_STEP_POS_Z = 160,
  STONE_STEP_NEG_Z = 161,

  SAND_STEP_POS_X = 162,
  SAND_STEP_NEG_X = 163,
  SAND_STEP_POS_Z = 164,
  SAND_STEP_NEG_Z = 165,

  SNOW_STEP_POS_X = 166,
  SNOW_STEP_NEG_X = 167,
  SNOW_STEP_POS_Z = 168,
  SNOW_STEP_NEG_Z = 169,

  MOSSVEIL_MUD_STEP_POS_X = 170,
  MOSSVEIL_MUD_STEP_NEG_X = 171,
  MOSSVEIL_MUD_STEP_POS_Z = 172,
  MOSSVEIL_MUD_STEP_NEG_Z = 173,

  ASHEN_SOIL_STEP_POS_X = 174,
  ASHEN_SOIL_STEP_NEG_X = 175,
  ASHEN_SOIL_STEP_POS_Z = 176,
  ASHEN_SOIL_STEP_NEG_Z = 177,

  COBBLESTONE_STEP_POS_X = 178,
  COBBLESTONE_STEP_NEG_X = 179,
  COBBLESTONE_STEP_POS_Z = 180,
  COBBLESTONE_STEP_NEG_Z = 181,

  UNLOADED = 255,
}

export enum BlockShape {
  CUBE = 'cube',
  SLAB = 'slab',
  STEP_POS_X = 'step_pos_x',
  STEP_NEG_X = 'step_neg_x',
  STEP_POS_Z = 'step_pos_z',
  STEP_NEG_Z = 'step_neg_z',
  CUSTOM = 'custom',
}

export interface BlockDefinition {
  id: BlockType;
  name: string;
  shape?: BlockShape;
  isTransparent?: boolean;
  isLiquid?: boolean;
  topTextureIndex: number;
  bottomTextureIndex: number;
  sideTextureIndex: number;
  xTextureIndex?: number;
  zTextureIndex?: number;
}

export class TextureGenerator {
  public static readonly TILE_RESOLUTION = 512; // High-definition 512x512 texture tile resolution
  public static readonly TOTAL_TEXTURES = 104; // 8x13 atlas grid
  public static atlasCanvasRef: HTMLCanvasElement | null = null;

  private static canvasCache: Map<number, HTMLCanvasElement> = new Map();
  private static customOverrides: Map<number, HTMLImageElement | HTMLCanvasElement> = new Map();

  private static createPixelCanvas(drawFn: (ctx: CanvasRenderingContext2D, size: number) => void): HTMLCanvasElement {
    const size = TextureGenerator.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    drawFn(ctx, size);
    return canvas;
  }

  public static createOakFoliageCanvas(
    width = 128,
    height = 128,
    tintColor = '#15803d'
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = tintColor;
    ctx.fillRect(0, 0, 1, 1);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    const tr = pixel[0], tg = pixel[1], tb = pixel[2];

    // 1. Deep shadow under-layer
    ctx.fillStyle = `rgb(${Math.round(tr * 0.28)}, ${Math.round(tg * 0.28)}, ${Math.round(tb * 0.28)})`;
    ctx.fillRect(0, 0, width, height);

    const rand = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    // 2. Multi-layered clustered small oak leaves
    const numLeaves = 48;
    for (let i = 0; i < numLeaves; i++) {
      const lx = rand(i * 1.37) * width;
      const ly = rand(i * 2.81) * height;
      const lw = 7 + rand(i * 3.19) * 8;
      const lh = 10 + rand(i * 4.43) * 10;
      const angle = rand(i * 5.67) * Math.PI * 2;
      const shade = 0.45 + rand(i * 7.13) * 0.60;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle);

      ctx.fillStyle = `rgb(${Math.min(255, Math.round(tr * shade))}, ${Math.min(255, Math.round(tg * shade))}, ${Math.min(255, Math.round(tb * shade))})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, lw * 0.5, lh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${Math.min(255, Math.round(tr * (shade + 0.3)))}, ${Math.min(255, Math.round(tg * (shade + 0.3)))}, ${Math.min(255, Math.round(tb * (shade + 0.3)))}, 0.5)`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, -lh * 0.35);
      ctx.lineTo(0, lh * 0.35);
      ctx.stroke();

      ctx.restore();
    }

    // 3. Crisp alpha cutouts
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const n = rand(x * 11.3 + y * 19.7);
        if (n < 0.12) {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    return canvas;
  }

  public static createTintedLeafTexture(
    baseCanvas: HTMLImageElement | HTMLCanvasElement,
    tintColor: string
  ): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    // 1. Draw original base leaf texture (preserves all leaf shapes and transparency)
    ctx.drawImage(baseCanvas, 0, 0, size, size);

    // 2. Apply tint color fill restricted to non-transparent leaf pixels
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tintColor;
    ctx.globalAlpha = 0.85; // Rich fantasy color blend
    ctx.fillRect(0, 0, size, size);

    // 3. Reset composite settings
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
  }

  public static createAshenOreComposite(
    baseStone: HTMLImageElement | HTMLCanvasElement,
    oreTex: HTMLImageElement | HTMLCanvasElement
  ): { composited: HTMLCanvasElement; emissive: HTMLCanvasElement } {
    const size = this.TILE_RESOLUTION;
    
    const compCanvas = document.createElement('canvas');
    compCanvas.width = size;
    compCanvas.height = size;
    const cctx = compCanvas.getContext('2d')!;
    
    const emCanvas = document.createElement('canvas');
    emCanvas.width = size;
    emCanvas.height = size;
    const ectx = emCanvas.getContext('2d')!;
    
    // Draw base stone (NETHER_STONE dark basalt with glowing lava veins)
    cctx.drawImage(baseStone, 0, 0, size, size);
    
    // Draw ore to temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tctx = tempCanvas.getContext('2d')!;
    tctx.drawImage(oreTex, 0, 0, size, size);
    
    const imgData = tctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    const emImgData = ectx.createImageData(size, size);
    const emData = emImgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

      // Precision classifier: Isolate metallic ore nuggets / crystals from grey marble background
      let isOreVein = false;

      // 1. Silver specular highlight / radiant crystal: extremely high luminance or bright cool white
      if (lum >= 195 || (r > 185 && g > 185 && b > 185)) {
        isOreVein = true;
      }
      // 2. Gold nugget: warm golden yellow color
      else if (r > 135 && g > 85 && r > g + 12 && b < g + 25) {
        isOreVein = true;
      }
      // 3. Copper chunk: metallic teal / green / copper hue
      else if ((g > r + 10 || b > r + 10) && lum > 60) {
        isOreVein = true;
      }
      // 4. Corrupted / Primordium crystals: rich red / orange saturation
      else if (r > 130 && (r > g + 30 || r > b + 30)) {
        isOreVein = true;
      }
      // 5. Significant color saturation (non-grey)
      else if (maxDiff > 28 && lum > 70) {
        isOreVein = true;
      }

      if (isOreVein) {
        // Keep ore nugget pixel and add to emissive glow atlas
        emData[i] = r;
        emData[i + 1] = g;
        emData[i + 2] = b;
        emData[i + 3] = 255;
      } else {
        // Discard grey marble background so base ASHEN STONE (dark basalt & lava veins) shows through 100%!
        data[i + 3] = 0;
        // Pure black in emissive map so stone background emits ZERO light in dark!
        emData[i] = 0;
        emData[i + 1] = 0;
        emData[i + 2] = 0;
        emData[i + 3] = 255;
      }
    }
    
    tctx.putImageData(imgData, 0, 0);
    ectx.putImageData(emImgData, 0, 0);
    
    cctx.drawImage(tempCanvas, 0, 0, size, size);
    
    return { composited: compCanvas, emissive: emCanvas };
  }

  public static createAshyGreyTexture(
    baseCanvas: HTMLImageElement | HTMLCanvasElement
  ): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(baseCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;

      // Luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Lift pitch-black to ashy charcoal grey, keep defined highlights
      const ashyBase = Math.min(255, Math.floor(lum * 0.75 + 70));

      // Cool volcanic ash tinting (silver/slate grey)
      data[i] = Math.min(255, Math.floor(ashyBase * 0.92));     // R
      data[i + 1] = Math.min(255, Math.floor(ashyBase * 0.96)); // G
      data[i + 2] = Math.min(255, Math.floor(ashyBase * 1.04)); // B
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  public static createEnhancedJungleTexture(
    baseCanvas: HTMLImageElement | HTMLCanvasElement,
    liftFactor: number = 1.45,
    gamma: number = 0.80
  ): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
  
    ctx.drawImage(baseCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
  
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
  
      let r = data[i] / 255.0;
      let g = data[i + 1] / 255.0;
      let b = data[i + 2] / 255.0;
  
      // Gamma lift to uncrush dark shadows and reveal rich surface detail
      r = Math.pow(r, gamma) * liftFactor;
      g = Math.pow(g, gamma) * liftFactor;
      b = Math.pow(b, gamma) * liftFactor;
  
      // Rich tropical saturation boost
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.min(1.0, Math.max(0.0, lum + (r - lum) * 1.20));
      g = Math.min(1.0, Math.max(0.0, lum + (g - lum) * 1.20));
      b = Math.min(1.0, Math.max(0.0, lum + (b - lum) * 1.20));
  
      data[i]     = Math.min(255, Math.max(0, Math.floor(r * 255)));
      data[i + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
      data[i + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
    }
  
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }


  public static createJungleLeafTexture(
    baseCanvas: HTMLImageElement | HTMLCanvasElement
  ): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(baseCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      let r = data[i] / 255.0;
      let g = data[i + 1] / 255.0;
      let b = data[i + 2] / 255.0;

      // Darker rich emerald green grading:
      // Controlled lift with slight darkening on red & blue for deep jungle canopy
      r = Math.pow(r, 0.88) * 0.95;
      g = Math.pow(g, 0.82) * 1.12;
      b = Math.pow(b, 0.88) * 0.90;

      // Rich deep emerald forest tone
      r *= 0.62; // Deep shadow tone
      g *= 0.78; // Slightly darker lush green
      b *= 0.52;

      data[i]     = Math.min(255, Math.max(0, Math.floor(r * 255)));
      data[i + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
      data[i + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  public static createQuicksandTexture(
    baseCanvas: HTMLImageElement | HTMLCanvasElement
  ): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(baseCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      let r = data[i] / 255.0;
      let g = data[i + 1] / 255.0;
      let b = data[i + 2] / 255.0;

      // Enhance the swirl bubbles and dark murky rings with distinct contrast
      r = Math.pow(r, 0.78) * 1.35;
      g = Math.pow(g, 0.78) * 1.15;
      b = Math.pow(b, 0.82) * 0.95;

      // Warm viscous mud tone
      r *= 1.05;
      g *= 0.90;
      b *= 0.72;

      data[i]     = Math.min(255, Math.max(0, Math.floor(r * 255)));
      data[i + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
      data[i + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
    }

    ctx.putImageData(imgData, 0, 0);

    // Subtle mud bubble surface accents on quicksand
    ctx.strokeStyle = 'rgba(180, 140, 90, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size * 0.35, size * 0.38, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(size * 0.72, size * 0.68, 10, 0, Math.PI * 2);
    ctx.stroke();

    return canvas;
  }

  public static getTextureCanvas(textureIndex: number): HTMLCanvasElement {
    const size = this.TILE_RESOLUTION;
    if (this.customOverrides.has(textureIndex)) {
      const override = this.customOverrides.get(textureIndex)!;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(override, 0, 0, size, size);
      return canvas;
    }

    // Dynamic Leaf Tinting Fallback for Indices 63 (Teal), 64 (Blue), 65 (Purple)
    if (textureIndex === 63 || textureIndex === 64 || textureIndex === 65) {
      const baseLeafCanvas = this.getTextureCanvas(6);
      const color = textureIndex === 63 ? '#14b8a6' : textureIndex === 64 ? '#3b82f6' : '#c084fc';
      return this.createTintedLeafTexture(baseLeafCanvas, color);
    }

    if (this.canvasCache.has(textureIndex)) {
      return this.canvasCache.get(textureIndex)!;
    }

    const canvas = this.generateProceduralTexture(textureIndex);
    this.canvasCache.set(textureIndex, canvas);
    return canvas;
  }

  public static setCustomTexture(textureIndex: number, image: HTMLImageElement | HTMLCanvasElement) {
    this.customOverrides.set(textureIndex, image);
  }

  public static clearCustomTextures() {
    this.customOverrides.clear();
  }

  // Preloads high-resolution replacement PNG textures from /textures/
  public static async loadExternalTextures(): Promise<boolean> {
    const externalTextures: Array<{ index: number; url: string }> = [
      { index: 0, url: '/textures/ground/GRASS TEXTURE.png' },
      { index: 1, url: '/textures/ground/DIRT TEXTURE.png' },
      { index: 2, url: '/textures/ground/DIRT WITH GRASS TOP (SIDE VIEWS).png' },
      { index: 3, url: '/textures/ground/STONE TEXTURE.png' },
      { index: 4, url: '/textures/trees/WOOD TEXTURE.png' },
      { index: 5, url: '/textures/trees/TOP FACE WOOD TEXTURE.png' },
      { index: 6, url: '/textures/trees/TREE LEAVES TEXTURE.png' },
      { index: 7, url: '/textures/ground/SAND TEXURE.png' },
      { index: 8, url: '/textures/water/WATER TEXTURE.png' },
      // Ice Biome Textures
      { index: 19, url: '/textures/ground/SNOW TOP.png' },
      { index: 20, url: '/textures/ground/FROSTED STONE SIDE VIEW.png' },
      { index: 21, url: '/textures/ground/FROST STONE.png' },
      { index: 22, url: '/textures/ground/PACKED SNOW.png' },
      { index: 23, url: '/textures/trees/FROZEN PINE LOG TOP FACE.png' },
      { index: 24, url: '/textures/trees/FROZEN PINE BARK.png' },
      { index: 25, url: '/textures/trees/FROSTED PINE NEEDLES.png' },
      { index: 26, url: '/textures/ores/FROST CRYSTAL ORE.png' },
      { index: 27, url: '/textures/trees/FROZEN PINE PLANKS.png' },
      { index: 28, url: '/textures/water/ICE BLOCK.png' },
      { index: 29, url: '/textures/water/ICE.png' },
      { index: 30, url: '/textures/vegetation/FROSTED BLOOM.png' },
      // Ashen Ruins Textures
      { index: 31, url: '/textures/ground/ASHEN STONE.png' },
      { index: 32, url: '/textures/ground/ASHEN SOIL.png' },
      { index: 33, url: '/textures/vegetation/CORRUPTED GROWTH TOP.png' },
      { index: 34, url: '/textures/vegetation/CORRUPTED GROWTH.png' },
      { index: 35, url: '/textures/ground/CINDER SAND.png' },
      { index: 36, url: '/textures/trees/PETRIFIED WOOD TOP.png' },
      { index: 37, url: '/textures/trees/PETRIFIED WOOD SIDE.png' },
      { index: 39, url: '/textures/ores/ASHEN CORRUPTED CRYSTAL ORE SUPER RARE.png' },
      { index: 40, url: '/textures/trees/RUNIED PLANKS.png' },
      { index: 42, url: '/textures/water/MAGMA.png' },
      // Ashen Cave Ore Rarity Textures
      { index: 76, url: '/textures/ores/ASHEN STONE WITH COPPER UNCOMMON.png' },
      { index: 77, url: '/textures/ores/ASHEN STONE WITH SILVER RARE.png' },
      { index: 78, url: '/textures/ores/ASHEN STONE WITH GOLD RARE.png' },
      { index: 79, url: '/textures/ores/ASHEN Abyssal Primordium LEGENDARY.png' },
      // Sunscorched Ruins Textures
      { index: 43, url: '/textures/ground/SUNSCORCHED SANDSTONE.png' },
      { index: 44, url: '/textures/ground/CRACKED CLAY SOIL.png' },
      { index: 45, url: '/textures/ground/SCRUBGRASS TOP.png' },
      { index: 46, url: '/textures/ground/SCRUBGRASS SIDE.png' },
      { index: 47, url: '/textures/ground/DESERT SAND.png' },
      { index: 48, url: '/textures/trees/PETRIFIED SUNWOOD TOP.png' },
      { index: 49, url: '/textures/trees/PETRIFIED SUNWOOD SIDE.png' },
      { index: 50, url: '/textures/vegetation/WITHERED PALM FRONDS.png' },
      { index: 51, url: '/textures/ores/SUNSTONE ORE.png' },
      { index: 52, url: '/textures/trees/TEMPLE PLANKS.png' },
      { index: 53, url: '/textures/vegetation/DESERT BLOOM.png' },
      { index: 54, url: '/textures/water/OASIS WATER.png' },
      // Mossveil Jungle Textures
      { index: 80, url: '/textures/vegetation/Mossveil-jungle-mud.png' },
      { index: 82, url: '/textures/vegetation/Mossveil-canopy-tree-leaf.png' },
      { index: 83, url: '/textures/vegetation/Mossveil-canopy-tree-bark.png' },
      { index: 85, url: '/textures/vegetation/mossveil-mossy-stone-texture.png' },
      { index: 86, url: '/textures/vegetation/Mossveil-root-tangled-ground.png' },
      { index: 87, url: '/textures/vegetation/Mossveil-thorned-undergrowth.png' },
      { index: 89, url: '/textures/vegetation/Mossveil-jungle-vine-texture.png' },
      { index: 92, url: '/textures/water/Mossveil-jungle-water-texture.png' },
      { index: 93, url: '/textures/ground/Mossveil-muddy-quicksand.png' },
      // Craftable Workstation Textures (Basic Workbench)
      { index: 55, url: '/textures/ui/previews/CRAFT BENCH.png' },
      { index: 56, url: '/textures/ui/previews/CRAFT BENCH.png' },
    ];

    let loadedCount = 0;
    const promises = externalTextures.map(({ index, url }) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.setCustomTexture(index, img);
          loadedCount++;
          resolve();
        };
        img.onerror = () => {
          console.warn(`Could not load custom texture from ${url}`);
          resolve();
        };
        img.src = url;
      });
    });

    await Promise.all(promises);

    // Fantasy Tint Variations generated directly from authentic high-res TREE LEAVES TEXTURE (Index 6)
    if (this.customOverrides.has(6)) {
      const baseOak = this.customOverrides.get(6)!;
      this.setCustomTexture(63, this.createTintedLeafTexture(baseOak, '#14b8a6')); // Vibrant Teal
      this.setCustomTexture(64, this.createTintedLeafTexture(baseOak, '#3b82f6')); // Royal Blue
      this.setCustomTexture(65, this.createTintedLeafTexture(baseOak, '#c084fc')); // Magenta Purple
    }

    // Ashy Grey Tinting for Ashen Ruins Environment (Soil, Growth, Logs)
    const netherIndices = [32, 33, 34, 35, 36, 37];
    for (const idx of netherIndices) {
      if (this.customOverrides.has(idx)) {
        const baseTex = this.customOverrides.get(idx)!;
        this.setCustomTexture(idx, this.createAshyGreyTexture(baseTex));
      }
    }

    // Magma Emissive Mask Generation for MOLTEN_CORRUPTION (Index 42)
    if (this.customOverrides.has(42)) {
      const magmaTex = this.customOverrides.get(42)!;
      const emMagmaCanvas = document.createElement('canvas');
      emMagmaCanvas.width = this.TILE_RESOLUTION;
      emMagmaCanvas.height = this.TILE_RESOLUTION;
      const emCtx = emMagmaCanvas.getContext('2d')!;
      emCtx.drawImage(magmaTex, 0, 0, this.TILE_RESOLUTION, this.TILE_RESOLUTION);
      const imgData = emCtx.getImageData(0, 0, this.TILE_RESOLUTION, this.TILE_RESOLUTION);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (r > 110 || (r > g + 15 && r > b + 15) || lum > 140) {
          data[i+3] = 255;
        } else {
          data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255;
        }
      }
      emCtx.putImageData(imgData, 0, 0);
      this.setCustomTexture(1042, emMagmaCanvas);
    }

    // Ashen Ore Compositing and Emissive Mask Generation
    const ashenOreIndices = [39, 76, 77, 78, 79];
    const baseStoneIdx = this.customOverrides.has(31) ? 31 : (this.customOverrides.has(32) ? 32 : 3);
    if (this.customOverrides.has(baseStoneIdx)) {
      const baseStone = this.customOverrides.get(baseStoneIdx)!;
      for (const idx of ashenOreIndices) {
        if (this.customOverrides.has(idx)) {
          const oreTex = this.customOverrides.get(idx)!;
          const { composited, emissive } = this.createAshenOreComposite(baseStone, oreTex);
          this.setCustomTexture(idx, composited);
          // Store emissive mask at an offset index (1000+) so we can read it later in createTextureAtlas
          this.setCustomTexture(idx + 1000, emissive);
        }
      }
    }

    // Mossveil Jungle Texture Brightness & Vibrance Enhancement (Mud, Bark, Stone, Roots, Vines)
    const jungleIndices = [80, 83, 85, 86, 87, 89];
    for (const idx of jungleIndices) {
      if (this.customOverrides.has(idx)) {
        const baseTex = this.customOverrides.get(idx)!;
        this.setCustomTexture(idx, this.createEnhancedJungleTexture(baseTex, 1.45, 0.80));
      }
    }

    // Muddy Quicksand (Index 93): Enhanced bubbling mud rings and viscous sheen
    if (this.customOverrides.has(93)) {
      const baseQuicksand = this.customOverrides.get(93)!;
      this.setCustomTexture(93, this.createQuicksandTexture(baseQuicksand));
    }

    // Jungle Tree Leaves (Index 82): Darker, rich emerald green canopy foliage
    if (this.customOverrides.has(82)) {
      const baseLeaves = this.customOverrides.get(82)!;
      this.setCustomTexture(82, this.createJungleLeafTexture(baseLeaves));
    }

    return loadedCount > 0;
  }

  private static generateProceduralTexture(index: number): HTMLCanvasElement {
    return this.createPixelCanvas((ctx, s) => {
      const rand = (x: number, y: number) => {
        const n = Math.sin(x * 12.9898 + y * 78.233 + index * 45.164) * 43758.5453;
        return n - Math.floor(n);
      };

      switch (index) {
        case 0: // Grass Top
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const g = Math.floor(160 + n * 60);
              const r = Math.floor(40 + n * 30);
              const b = Math.floor(20 + n * 20);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 1: // Dirt
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const r = Math.floor(120 + n * 35);
              const g = Math.floor(80 + n * 25);
              const b = Math.floor(45 + n * 15);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 2: // Grass Side
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const grassHeight = Math.floor(s * 0.25) + Math.floor(rand(x, 99) * (s * 0.15));
              if (y < grassHeight) {
                const g = Math.floor(150 + n * 50);
                const r = Math.floor(40 + n * 30);
                ctx.fillStyle = `rgb(${r}, ${g}, 30)`;
              } else {
                const r = Math.floor(120 + n * 35);
                const g = Math.floor(80 + n * 25);
                const b = Math.floor(45 + n * 15);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 3: // Stone
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const v = Math.floor(100 + n * 50);
              ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 4: // Oak Log Side
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const stripe = Math.sin(x * 0.1) * 20;
              const n = rand(x, y);
              const r = Math.floor(100 + stripe + n * 20);
              const g = Math.floor(65 + stripe * 0.7 + n * 15);
              const b = Math.floor(35 + stripe * 0.5 + n * 10);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 5: // Oak Log Top
          const center = s / 2;
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
              const ring = Math.sin(dist * 0.1) * 25;
              const n = rand(x, y);
              const r = Math.floor(160 + ring + n * 20);
              const g = Math.floor(125 + ring * 0.8 + n * 15);
              const b = Math.floor(75 + ring * 0.5 + n * 10);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 6: // Leaves
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              if (n < 0.15) {
                ctx.clearRect(x, y, 4, 4);
              } else {
                const g = Math.floor(120 + n * 70);
                const r = Math.floor(25 + n * 30);
                const b = Math.floor(20 + n * 20);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 63: // Teal / Cyan Leaves
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              if (n < 0.12) {
                ctx.clearRect(x, y, 4, 4);
              } else {
                const r = Math.floor(15 + n * 30);
                const g = Math.floor(160 + n * 75);
                const b = Math.floor(150 + n * 70);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 64: // Royal Blue Leaves
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              if (n < 0.12) {
                ctx.clearRect(x, y, 4, 4);
              } else {
                const r = Math.floor(25 + n * 35);
                const g = Math.floor(80 + n * 70);
                const b = Math.floor(220 + n * 35);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 65: // Purple / Magenta Leaves
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              if (n < 0.12) {
                ctx.clearRect(x, y, 4, 4);
              } else {
                const r = Math.floor(170 + n * 70);
                const g = Math.floor(40 + n * 50);
                const b = Math.floor(210 + n * 45);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 7: // Sand
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const r = Math.floor(215 + n * 30);
              const g = Math.floor(195 + n * 25);
              const b = Math.floor(140 + n * 20);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 8: // Water
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const b = Math.floor(200 + n * 40);
              const g = Math.floor(100 + n * 30);
              ctx.fillStyle = `rgba(30, ${g}, ${b}, 0.75)`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 80: // Rainforest Grass Top (Deep Dark Emerald Green)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const g = Math.floor(105 + n * 55);
              const r = Math.floor(18 + n * 25);
              const b = Math.floor(25 + n * 30);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 81: // Rainforest Grass Side (Dark Lush Grass Overhang + Damp Humus Loam)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const grassHeight = Math.floor(s * 0.30) + Math.floor(rand(x, 77) * (s * 0.15));
              if (y < grassHeight) {
                const g = Math.floor(100 + n * 50);
                const r = Math.floor(18 + n * 25);
                const b = Math.floor(25 + n * 30);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else {
                const r = Math.floor(65 + n * 25);
                const g = Math.floor(45 + n * 20);
                const b = Math.floor(28 + n * 15);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 82: // Rainforest Soil / Damp Humus Loam
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const r = Math.floor(65 + n * 25);
              const g = Math.floor(45 + n * 20);
              const b = Math.floor(28 + n * 15);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 83: // Jungle Log Side (Dark Tropical Hardwood with Moss Streaks)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const stripe = Math.sin(x * 0.12) * 18;
              const n = rand(x, y);
              const isMoss = (x % 32 < 10) && (y % 48 < 20) && (n > 0.4);
              if (isMoss) {
                const r = Math.floor(35 + n * 25);
                const g = Math.floor(95 + n * 45);
                const b = Math.floor(35 + n * 25);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else {
                const r = Math.floor(75 + stripe + n * 18);
                const g = Math.floor(48 + stripe * 0.7 + n * 14);
                const b = Math.floor(28 + stripe * 0.5 + n * 10);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 84: // Jungle Log Top (Rich Amber Growth Rings)
          const jCenter = s / 2;
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const dist = Math.sqrt((x - jCenter) ** 2 + (y - jCenter) ** 2);
              const ring = Math.sin(dist * 0.12) * 22;
              const n = rand(x, y);
              const r = Math.floor(135 + ring + n * 18);
              const g = Math.floor(90 + ring * 0.75 + n * 14);
              const b = Math.floor(45 + ring * 0.5 + n * 10);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 85: // Jungle Leaves (Dense, Dark Forest Green Foliage)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              if (n < 0.12) {
                ctx.clearRect(x, y, 4, 4);
              } else {
                const r = Math.floor(14 + n * 25);
                const g = Math.floor(92 + n * 60);
                const b = Math.floor(22 + n * 28);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 86: // Rainforest Fern (Giant Tropical Fern Fronds)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const normX = Math.abs(x - s / 2) / (s / 2);
              const fernCurve = (1 - y / s) * 0.85;
              if (normX < fernCurve && n > 0.15) {
                const r = Math.floor(18 + n * 25);
                const g = Math.floor(115 + n * 65);
                const b = Math.floor(28 + n * 30);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              } else {
                ctx.clearRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 87: // Rainforest Bloom (Exotic Tropical Bromeliad/Orchid)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const dCenter = Math.sqrt((x - s / 2) ** 2 + (y - s / 2) ** 2);
              if (dCenter < s * 0.38) {
                const r = Math.floor(210 + n * 45);
                const g = Math.floor(35 + n * 40);
                const b = Math.floor(110 + n * 65);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              } else if (y > s * 0.5 && Math.abs(x - s / 2) < s * 0.15) {
                const r = Math.floor(20 + n * 20);
                const g = Math.floor(110 + n * 40);
                const b = Math.floor(30 + n * 20);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              } else {
                ctx.clearRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 88: // Jungle Planks (Warm Amber Tropical Hardwood Planks)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const isSeam = y % 64 < 4 || (y % 128 < 64 && x % 128 < 4) || (y % 128 >= 64 && (x + 64) % 128 < 4);
              const n = rand(x, y);
              if (isSeam) {
                ctx.fillStyle = 'rgb(45, 28, 14)';
              } else {
                const r = Math.floor(125 + n * 25);
                const g = Math.floor(78 + n * 20);
                const b = Math.floor(38 + n * 15);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 89: // Mossveil Hanging Vines (Procedural fallback)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const strand = Math.sin(x * 0.15 + y * 0.08) * 12;
              const isVine = Math.abs((x % 64) - 32) < (12 + strand) && n > 0.18;
              if (isVine) {
                const r = Math.floor(22 + n * 25);
                const g = Math.floor(125 + n * 55);
                const b = Math.floor(35 + n * 25);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              } else {
                ctx.clearRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 90: // Braided Jungle Rope Icon
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isBraid = Math.abs(x - y) < s * 0.35 && Math.abs(x + y - s) < s * 0.65;
              const weave = Math.sin((x + y) * 0.18) * 20;
              if (isBraid && n > 0.1) {
                const r = Math.floor(180 + weave + n * 25);
                const g = Math.floor(140 + weave * 0.8 + n * 20);
                const b = Math.floor(80 + weave * 0.5 + n * 15);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 4, 4);
              } else {
                ctx.clearRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 91: // Hunting Bow Icon
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const normX = (x - s / 2) / (s / 2);
              const normY = (y - s / 2) / (s / 2);
              const bowCurve = Math.abs(normX - (1 - normY * normY) * 0.45);
              const isBowString = Math.abs(normX + 0.35) < 0.05 && Math.abs(normY) < 0.85;
              if (bowCurve < 0.12) {
                ctx.fillStyle = `rgb(${130 + n * 20}, ${75 + n * 15}, ${35 + n * 10})`;
                ctx.fillRect(x, y, 4, 4);
              } else if (isBowString) {
                ctx.fillStyle = 'rgba(240, 240, 240, 0.9)';
                ctx.fillRect(x, y, 4, 4);
              } else {
                ctx.clearRect(x, y, 4, 4);
              }
            }
          }
          break;

        case 92: // Mossveil Jungle Water (Deep Tropical Rainforest Murky River)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const wave = Math.sin((x + y) * 0.06) * 10 + Math.cos((x - y) * 0.08) * 6;
              const r = Math.floor(16 + wave * 0.3 + n * 10);
              const g = Math.floor(62 + wave * 0.8 + n * 16);
              const b = Math.floor(48 + wave * 0.6 + n * 14);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 93: // MUDDY_QUICKSAND
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x * 0.05, y * 0.05);
              const swirl = Math.sin(x * 0.08 + y * 0.08 + n * 4.0);
              const r = Math.floor(40 + n * 14 + swirl * 6);
              const g = Math.floor(32 + n * 10 + swirl * 5);
              const b = Math.floor(20 + n * 8 + swirl * 3);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 55: // BASIC WORKBENCH TOP (Artisan Crafting Table Surface)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isBorder = x < 28 || x >= s - 28 || y < 28 || y >= s - 28;
              const inGrid = x >= 72 && x <= s - 72 && y >= 72 && y <= s - 72;
              const isGridLine = inGrid && (
                Math.abs((x - 72) % Math.floor((s - 144) / 3)) < 6 ||
                Math.abs((y - 72) % Math.floor((s - 144) / 3)) < 6 ||
                x === 72 || x === s - 72 || y === 72 || y === s - 72
              );
              const isCorner = (x < 56 && y < 56) || (x >= s - 56 && y < 56) || (x < 56 && y >= s - 56) || (x >= s - 56 && y >= s - 56);
              const isRivet = (
                (Math.abs(x - 38) < 6 && Math.abs(y - 38) < 6) ||
                (Math.abs(x - (s - 38)) < 6 && Math.abs(y - 38) < 6) ||
                (Math.abs(x - 38) < 6 && Math.abs(y - (s - 38)) < 6) ||
                (Math.abs(x - (s - 38)) < 6 && Math.abs(y - (s - 38)) < 6)
              );

              if (isRivet) {
                ctx.fillStyle = 'rgb(35, 38, 42)';
              } else if (isCorner) {
                const m = Math.floor(135 + n * 30);
                ctx.fillStyle = `rgb(${m}, ${m + 6}, ${m + 12})`;
              } else if (isGridLine) {
                ctx.fillStyle = 'rgb(75, 45, 20)';
              } else if (isBorder) {
                const r = Math.floor(135 + n * 20);
                const g = Math.floor(85 + n * 15);
                const b = Math.floor(45 + n * 12);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else {
                const grain = Math.sin(x * 0.15 + n * 2.0) * 12;
                const r = Math.floor(175 + grain + n * 22);
                const g = Math.floor(120 + grain * 0.8 + n * 18);
                const b = Math.floor(68 + grain * 0.5 + n * 14);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 56: // BASIC WORKBENCH SIDE (Artisan Crafting Table Side with Tools & Drawers)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isTabletop = y < 52;
              const isLeg = x < 56 || x >= s - 56;
              const isShelf = y >= s - 68 && y < s - 30;
              const isVise = x < 48 && y >= 65 && y <= 150;
              const isSawBlade = x >= 130 && x <= 210 && Math.abs(y - 170 + (x - 130) * 0.25) < 7;
              const isHammerHandle = Math.abs(x - 300) < 7 && y >= 100 && y <= 220;
              const isHammerHead = Math.abs(x - 300) < 24 && Math.abs(y - 108) < 12;

              if (isVise) {
                const m = Math.floor(110 + n * 30);
                ctx.fillStyle = `rgb(${m}, ${m + 5}, ${m + 15})`;
              } else if (isHammerHead || isSawBlade) {
                const m = Math.floor(170 + n * 35);
                ctx.fillStyle = `rgb(${m}, ${m + 5}, ${m + 10})`;
              } else if (isHammerHandle) {
                ctx.fillStyle = 'rgb(180, 120, 60)';
              } else if (isTabletop) {
                const r = Math.floor(145 + n * 20);
                const g = Math.floor(95 + n * 15);
                const b = Math.floor(52 + n * 12);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else if (isLeg || isShelf) {
                const r = Math.floor(125 + n * 20);
                const g = Math.floor(80 + n * 15);
                const b = Math.floor(42 + n * 10);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else {
                const r = Math.floor(95 + n * 18);
                const g = Math.floor(62 + n * 14);
                const b = Math.floor(35 + n * 10);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 57: // SMITHING FORGE TOP
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const dCenter = Math.sqrt((x - s / 2) ** 2 + (y - s / 2) ** 2);
              if (dCenter < s * 0.28) {
                const r = Math.floor(235 + n * 20);
                const g = Math.floor(110 + n * 40);
                const b = Math.floor(25 + n * 20);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              } else {
                const m = Math.floor(55 + n * 25);
                ctx.fillStyle = `rgb(${m}, ${m + 2}, ${m + 4})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 58: // SMITHING FORGE SIDE
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isBand = y >= 110 && y <= 140 || y >= s - 140 && y <= s - 110;
              if (isBand) {
                const m = Math.floor(115 + n * 30);
                ctx.fillStyle = `rgb(${m + 10}, ${m + 5}, ${m})`;
              } else {
                const m = Math.floor(58 + n * 22);
                ctx.fillStyle = `rgb(${m}, ${m + 2}, ${m + 4})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 59: // ARMOR STATION TOP
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isStud = (x % 64 < 8) && (y % 64 < 8);
              if (isStud) {
                ctx.fillStyle = 'rgb(210, 165, 55)';
              } else {
                const r = Math.floor(115 + n * 20);
                const g = Math.floor(65 + n * 15);
                const b = Math.floor(35 + n * 10);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 60: // ARMOR STATION SIDE
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const r = Math.floor(100 + n * 18);
              const g = Math.floor(65 + n * 14);
              const b = Math.floor(38 + n * 10);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 61: // NETHER ALTAR TOP
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const dCenter = Math.sqrt((x - s / 2) ** 2 + (y - s / 2) ** 2);
              const isRuneRing = Math.abs(dCenter - s * 0.32) < 8;
              if (isRuneRing) {
                ctx.fillStyle = 'rgb(245, 65, 45)';
              } else {
                const m = Math.floor(35 + n * 20);
                ctx.fillStyle = `rgb(${m + 10}, ${m}, ${m + 8})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        case 62: // NETHER ALTAR SIDE
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const isGlowCrack = Math.abs(Math.sin(x * 0.08 + y * 0.06) * 16) < 4 && n > 0.3;
              if (isGlowCrack) {
                ctx.fillStyle = 'rgb(250, 75, 35)';
              } else {
                const m = Math.floor(35 + n * 18);
                ctx.fillStyle = `rgb(${m + 8}, ${m}, ${m + 6})`;
              }
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;

        default:
          // Natural dark earth tone for all unused/fallback atlas slots (never bright pink/magenta)
          for (let x = 0; x < s; x += 4) {
            for (let y = 0; y < s; y += 4) {
              const n = rand(x, y);
              const r = Math.floor(38 + n * 10);
              const g = Math.floor(30 + n * 8);
              const b = Math.floor(22 + n * 6);
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fillRect(x, y, 4, 4);
            }
          }
          break;
      }
    });
  }

  public static createTextureAtlas(): { diffuse: THREE.CanvasTexture, emissive: THREE.CanvasTexture } {
    const tileRes = this.TILE_RESOLUTION;
    const cols = 8;
    const rows = Math.ceil(this.TOTAL_TEXTURES / cols);
    
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = cols * tileRes;
    atlasCanvas.height = rows * tileRes;
    const ctx = atlasCanvas.getContext('2d')!;
    
    const emissiveCanvas = document.createElement('canvas');
    emissiveCanvas.width = cols * tileRes;
    emissiveCanvas.height = rows * tileRes;
    const ectx = emissiveCanvas.getContext('2d')!;

    // Diffuse background (Seamless dark forest soil)
    ctx.fillStyle = '#28231d';
    ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    ctx.imageSmoothingEnabled = true;
    
    // Emissive background (pitch black)
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, emissiveCanvas.width, emissiveCanvas.height);
    ectx.imageSmoothingEnabled = true;

    for (let i = 0; i < this.TOTAL_TEXTURES; i++) {
      const tileCanvas = this.getTextureCanvas(i);
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      const x = col * tileRes;
      const y = row * tileRes;
      
      ctx.drawImage(tileCanvas, x, y, tileRes, tileRes);
      
      // If we stored an emissive mask at index + 1000 during compositing, draw it!
      if (this.customOverrides.has(i + 1000)) {
        const emissiveMask = this.customOverrides.get(i + 1000)!;
        ectx.drawImage(emissiveMask, x, y, tileRes, tileRes);
      }
    }

    const diffuseTex = new THREE.CanvasTexture(atlasCanvas);
    diffuseTex.magFilter = THREE.NearestFilter;
    diffuseTex.minFilter = THREE.NearestMipmapLinearFilter;
    diffuseTex.generateMipmaps = true;
    diffuseTex.anisotropy = 8;
    diffuseTex.colorSpace = THREE.SRGBColorSpace;
    
    const emissiveTex = new THREE.CanvasTexture(emissiveCanvas);
    emissiveTex.magFilter = THREE.NearestFilter;
    emissiveTex.minFilter = THREE.NearestMipmapLinearFilter;
    emissiveTex.generateMipmaps = true;
    emissiveTex.anisotropy = 8;
    emissiveTex.colorSpace = THREE.SRGBColorSpace;

    this.atlasCanvasRef = atlasCanvas;
    return { diffuse: diffuseTex, emissive: emissiveTex };
  }

  public static magmaUniforms = {
    uTime: { value: 0 },
  };

  public static animateMagma(dt: number): void {
    this.magmaUniforms.uTime.value += dt;
  }
}

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  [BlockType.AIR]: { id: BlockType.AIR, name: 'Air', topTextureIndex: -1, bottomTextureIndex: -1, sideTextureIndex: -1 },
  [BlockType.GRASS]: { id: BlockType.GRASS, name: 'Grass', topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },
  [BlockType.DIRT]: { id: BlockType.DIRT, name: 'Dirt', topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },
  [BlockType.STONE]: { id: BlockType.STONE, name: 'Stone', topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.OAK_LOG]: { id: BlockType.OAK_LOG, name: 'Oak Log', topTextureIndex: 5, bottomTextureIndex: 5, sideTextureIndex: 4 },
  [BlockType.OAK_LEAVES]: { id: BlockType.OAK_LEAVES, name: 'Leaves', isTransparent: true, topTextureIndex: 6, bottomTextureIndex: 6, sideTextureIndex: 6 },
  [BlockType.SAND]: { id: BlockType.SAND, name: 'Sand', topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },
  [BlockType.WATER]: { id: BlockType.WATER, name: 'Water', isLiquid: true, isTransparent: true, topTextureIndex: 8, bottomTextureIndex: 8, sideTextureIndex: 8 },
  [BlockType.GLASS]: { id: BlockType.GLASS, name: 'Glass', isTransparent: true, topTextureIndex: 9, bottomTextureIndex: 9, sideTextureIndex: 9 },
  [BlockType.BRICK]: { id: BlockType.BRICK, name: 'Brick', topTextureIndex: 10, bottomTextureIndex: 10, sideTextureIndex: 10 },
  [BlockType.COBBLESTONE]: { id: BlockType.COBBLESTONE, name: 'Cobblestone', topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },
  [BlockType.COAL_ORE]: { id: BlockType.COAL_ORE, name: 'Coal Ore', topTextureIndex: 12, bottomTextureIndex: 12, sideTextureIndex: 12 },
  [BlockType.IRON_ORE]: { id: BlockType.IRON_ORE, name: 'Iron Ore', topTextureIndex: 13, bottomTextureIndex: 13, sideTextureIndex: 13 },
  [BlockType.GOLD_ORE]: { id: BlockType.GOLD_ORE, name: 'Gold Ore', topTextureIndex: 14, bottomTextureIndex: 14, sideTextureIndex: 14 },
  [BlockType.DIAMOND_ORE]: { id: BlockType.DIAMOND_ORE, name: 'Magical Ore', topTextureIndex: 15, bottomTextureIndex: 15, sideTextureIndex: 15 },
  [BlockType.PLANKS]: { id: BlockType.PLANKS, name: 'Planks', topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.TNT]: { id: BlockType.TNT, name: 'TNT', topTextureIndex: 16, bottomTextureIndex: 16, sideTextureIndex: 17 },
  [BlockType.BEDROCK]: { id: BlockType.BEDROCK, name: 'Bedrock', topTextureIndex: 18, bottomTextureIndex: 18, sideTextureIndex: 18 },
  // Ice Biome Definitions
  [BlockType.SNOW]: { id: BlockType.SNOW, name: 'Snow Ground', topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },
  [BlockType.FROST_STONE]: { id: BlockType.FROST_STONE, name: 'Frost Stone', topTextureIndex: 21, bottomTextureIndex: 21, sideTextureIndex: 21 },
  [BlockType.PACKED_SNOW]: { id: BlockType.PACKED_SNOW, name: 'Packed Snow', topTextureIndex: 22, bottomTextureIndex: 22, sideTextureIndex: 22 },
  [BlockType.FROZEN_LOG]: { id: BlockType.FROZEN_LOG, name: 'Frozen Log', topTextureIndex: 23, bottomTextureIndex: 23, sideTextureIndex: 24 },
  [BlockType.FROST_LEAVES]: { id: BlockType.FROST_LEAVES, name: 'Frost Needles', isTransparent: true, topTextureIndex: 25, bottomTextureIndex: 25, sideTextureIndex: 25 },
  [BlockType.FROST_ORE]: { id: BlockType.FROST_ORE, name: 'Frost Crystal Ore', topTextureIndex: 26, bottomTextureIndex: 26, sideTextureIndex: 26 },
  [BlockType.FROZEN_PLANKS]: { id: BlockType.FROZEN_PLANKS, name: 'Frost Planks', topTextureIndex: 27, bottomTextureIndex: 27, sideTextureIndex: 27 },
  [BlockType.ICE]: { id: BlockType.ICE, name: 'Ice Block', isTransparent: true, topTextureIndex: 28, bottomTextureIndex: 28, sideTextureIndex: 28 },
  [BlockType.FROST_BLOOM]: { id: BlockType.FROST_BLOOM, name: 'Frost Bloom', isTransparent: true, topTextureIndex: 30, bottomTextureIndex: 30, sideTextureIndex: 30 },
  // Ashen Ruins Definitions
  [BlockType.NETHER_STONE]: { id: BlockType.NETHER_STONE, name: 'Ruin Stone', topTextureIndex: 31, bottomTextureIndex: 31, sideTextureIndex: 31 },
  [BlockType.ASHEN_SOIL]: { id: BlockType.ASHEN_SOIL, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.CORRUPTED_GROWTH]: { id: BlockType.CORRUPTED_GROWTH, name: 'Corrupted Ground', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.CINDER_SAND]: { id: BlockType.CINDER_SAND, name: 'Cinder Sand', topTextureIndex: 35, bottomTextureIndex: 35, sideTextureIndex: 35 },
  [BlockType.PETRIFIED_LOG]: { id: BlockType.PETRIFIED_LOG, name: 'Petrified Wood', topTextureIndex: 36, bottomTextureIndex: 36, sideTextureIndex: 37 },
  [BlockType.WITHERED_THORNS]: { id: BlockType.WITHERED_THORNS, name: 'Withered Thorns', isTransparent: true, topTextureIndex: 34, bottomTextureIndex: 34, sideTextureIndex: 34 },
  [BlockType.CORRUPTED_ORE]: { id: BlockType.CORRUPTED_ORE, name: 'Corrupted Crystal Ore', topTextureIndex: 39, bottomTextureIndex: 39, sideTextureIndex: 39 },
  [BlockType.ASHEN_COPPER_ORE]: { id: BlockType.ASHEN_COPPER_ORE, name: 'Ashen Copper Ore', topTextureIndex: 76, bottomTextureIndex: 76, sideTextureIndex: 76 },
  [BlockType.ASHEN_SILVER_ORE]: { id: BlockType.ASHEN_SILVER_ORE, name: 'Ashen Silver Ore', topTextureIndex: 77, bottomTextureIndex: 77, sideTextureIndex: 77 },
  [BlockType.ASHEN_GOLD_ORE]: { id: BlockType.ASHEN_GOLD_ORE, name: 'Ashen Gold Ore', topTextureIndex: 78, bottomTextureIndex: 78, sideTextureIndex: 78 },
  [BlockType.ASHEN_ABYSSAL_PRIMORDIUM]: { id: BlockType.ASHEN_ABYSSAL_PRIMORDIUM, name: 'Abyssal Primordium', topTextureIndex: 79, bottomTextureIndex: 79, sideTextureIndex: 79 },
  [BlockType.RUINED_PLANKS]: { id: BlockType.RUINED_PLANKS, name: 'Ruined Planks', topTextureIndex: 40, bottomTextureIndex: 40, sideTextureIndex: 40 },
  [BlockType.CORRUPTION_BLOOM]: { id: BlockType.CORRUPTION_BLOOM, name: 'Corruption Bloom', isTransparent: true, topTextureIndex: 34, bottomTextureIndex: 34, sideTextureIndex: 34 },
  [BlockType.MOLTEN_CORRUPTION]: { id: BlockType.MOLTEN_CORRUPTION, name: 'Molten Corruption', isLiquid: true, topTextureIndex: 42, bottomTextureIndex: 42, sideTextureIndex: 42 },
  // Sunscorched Ruins Definitions
  [BlockType.SUNSCORCHED_SANDSTONE]: { id: BlockType.SUNSCORCHED_SANDSTONE, name: 'Sunscorched Sandstone', topTextureIndex: 43, bottomTextureIndex: 43, sideTextureIndex: 43 },
  [BlockType.CRACKED_CLAY]: { id: BlockType.CRACKED_CLAY, name: 'Cracked Clay Soil', topTextureIndex: 44, bottomTextureIndex: 44, sideTextureIndex: 44 },
  [BlockType.SCRUBGRASS]: { id: BlockType.SCRUBGRASS, name: 'Scrubgrass Ground', topTextureIndex: 47, bottomTextureIndex: 47, sideTextureIndex: 47 },
  [BlockType.DESERT_SAND]: { id: BlockType.DESERT_SAND, name: 'Desert Sand', topTextureIndex: 47, bottomTextureIndex: 47, sideTextureIndex: 47 },
  [BlockType.PETRIFIED_SUNWOOD]: { id: BlockType.PETRIFIED_SUNWOOD, name: 'Petrified Sunwood', topTextureIndex: 48, bottomTextureIndex: 48, sideTextureIndex: 49 },
  [BlockType.PALM_FRONDS]: { id: BlockType.PALM_FRONDS, name: 'Palm Fronds', isTransparent: true, topTextureIndex: 50, bottomTextureIndex: 50, sideTextureIndex: 50 },
  [BlockType.SUNSTONE_ORE]: { id: BlockType.SUNSTONE_ORE, name: 'Sunstone Ore', topTextureIndex: 51, bottomTextureIndex: 51, sideTextureIndex: 51 },
  [BlockType.TEMPLE_PLANKS]: { id: BlockType.TEMPLE_PLANKS, name: 'Temple Planks', topTextureIndex: 52, bottomTextureIndex: 52, sideTextureIndex: 52 },
  [BlockType.DESERT_BLOOM]: { id: BlockType.DESERT_BLOOM, name: 'Sacred Lotus Bloom', isTransparent: true, topTextureIndex: 53, bottomTextureIndex: 53, sideTextureIndex: 53 },
  [BlockType.OASIS_WATER]: { id: BlockType.OASIS_WATER, name: 'Oasis Water', isLiquid: true, isTransparent: true, topTextureIndex: 54, bottomTextureIndex: 54, sideTextureIndex: 54 },
  
  // Horizontal Log Definitions
  [BlockType.OAK_LOG_X]: { id: BlockType.OAK_LOG_X, name: 'Oak Log (X)', topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4, xTextureIndex: 5, zTextureIndex: 4 },
  [BlockType.OAK_LOG_Z]: { id: BlockType.OAK_LOG_Z, name: 'Oak Log (Z)', topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4, xTextureIndex: 4, zTextureIndex: 5 },
  [BlockType.FROZEN_LOG_X]: { id: BlockType.FROZEN_LOG_X, name: 'Frozen Log (X)', topTextureIndex: 24, bottomTextureIndex: 24, sideTextureIndex: 24, xTextureIndex: 23, zTextureIndex: 24 },
  [BlockType.FROZEN_LOG_Z]: { id: BlockType.FROZEN_LOG_Z, name: 'Frozen Log (Z)', topTextureIndex: 24, bottomTextureIndex: 24, sideTextureIndex: 24, xTextureIndex: 24, zTextureIndex: 23 },
  [BlockType.PETRIFIED_LOG_X]: { id: BlockType.PETRIFIED_LOG_X, name: 'Petrified Log (X)', topTextureIndex: 37, bottomTextureIndex: 37, sideTextureIndex: 37, xTextureIndex: 36, zTextureIndex: 37 },
  [BlockType.PETRIFIED_LOG_Z]: { id: BlockType.PETRIFIED_LOG_Z, name: 'Petrified Log (Z)', topTextureIndex: 37, bottomTextureIndex: 37, sideTextureIndex: 37, xTextureIndex: 37, zTextureIndex: 36 },
  [BlockType.PETRIFIED_SUNWOOD_X]: { id: BlockType.PETRIFIED_SUNWOOD_X, name: 'Petrified Sunwood (X)', topTextureIndex: 49, bottomTextureIndex: 49, sideTextureIndex: 49, xTextureIndex: 48, zTextureIndex: 49 },
  [BlockType.PETRIFIED_SUNWOOD_Z]: { id: BlockType.PETRIFIED_SUNWOOD_Z, name: 'Petrified Sunwood (Z)', topTextureIndex: 49, bottomTextureIndex: 49, sideTextureIndex: 49, xTextureIndex: 49, zTextureIndex: 48 },

  // Progressive Tapered Branch Definitions (Bark texture on all faces, custom sub-block shape, solid opaque)
  [BlockType.OAK_BRANCH_1]: { id: BlockType.OAK_BRANCH_1, name: 'Oak Branch (Base)', shape: BlockShape.CUSTOM, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.OAK_BRANCH_2]: { id: BlockType.OAK_BRANCH_2, name: 'Oak Branch (Mid)', shape: BlockShape.CUSTOM, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.OAK_BRANCH_3]: { id: BlockType.OAK_BRANCH_3, name: 'Oak Branch (Tip)', shape: BlockShape.CUSTOM, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.JUNGLE_BRANCH_1]: { id: BlockType.JUNGLE_BRANCH_1, name: 'Jungle Branch (Base)', shape: BlockShape.CUSTOM, topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_BRANCH_2]: { id: BlockType.JUNGLE_BRANCH_2, name: 'Jungle Branch (Mid)', shape: BlockShape.CUSTOM, topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_BRANCH_3]: { id: BlockType.JUNGLE_BRANCH_3, name: 'Jungle Branch (Tip)', shape: BlockShape.CUSTOM, topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.FROZEN_BRANCH_1]: { id: BlockType.FROZEN_BRANCH_1, name: 'Frozen Branch (Base)', shape: BlockShape.CUSTOM, topTextureIndex: 24, bottomTextureIndex: 24, sideTextureIndex: 24 },
  [BlockType.FROZEN_BRANCH_2]: { id: BlockType.FROZEN_BRANCH_2, name: 'Frozen Branch (Mid)', shape: BlockShape.CUSTOM, topTextureIndex: 24, bottomTextureIndex: 24, sideTextureIndex: 24 },
  [BlockType.FROZEN_BRANCH_3]: { id: BlockType.FROZEN_BRANCH_3, name: 'Frozen Branch (Tip)', shape: BlockShape.CUSTOM, topTextureIndex: 24, bottomTextureIndex: 24, sideTextureIndex: 24 },
  [BlockType.PETRIFIED_BRANCH_1]: { id: BlockType.PETRIFIED_BRANCH_1, name: 'Petrified Branch (Base)', shape: BlockShape.CUSTOM, topTextureIndex: 37, bottomTextureIndex: 37, sideTextureIndex: 37 },
  [BlockType.PETRIFIED_BRANCH_2]: { id: BlockType.PETRIFIED_BRANCH_2, name: 'Petrified Branch (Mid)', shape: BlockShape.CUSTOM, topTextureIndex: 37, bottomTextureIndex: 37, sideTextureIndex: 37 },
  [BlockType.PETRIFIED_BRANCH_3]: { id: BlockType.PETRIFIED_BRANCH_3, name: 'Petrified Branch (Tip)', shape: BlockShape.CUSTOM, topTextureIndex: 37, bottomTextureIndex: 37, sideTextureIndex: 37 },
  [BlockType.SUNWOOD_BRANCH_1]: { id: BlockType.SUNWOOD_BRANCH_1, name: 'Sunwood Branch (Base)', shape: BlockShape.CUSTOM, topTextureIndex: 49, bottomTextureIndex: 49, sideTextureIndex: 49 },
  [BlockType.SUNWOOD_BRANCH_2]: { id: BlockType.SUNWOOD_BRANCH_2, name: 'Sunwood Branch (Mid)', shape: BlockShape.CUSTOM, topTextureIndex: 49, bottomTextureIndex: 49, sideTextureIndex: 49 },
  [BlockType.SUNWOOD_BRANCH_3]: { id: BlockType.SUNWOOD_BRANCH_3, name: 'Sunwood Branch (Tip)', shape: BlockShape.CUSTOM, topTextureIndex: 49, bottomTextureIndex: 49, sideTextureIndex: 49 },

  // Craftable Workstation Definitions
  [BlockType.WORKBENCH]: { id: BlockType.WORKBENCH, name: 'Basic Workbench', isTransparent: true, topTextureIndex: 55, bottomTextureIndex: 4, sideTextureIndex: 56 },
  [BlockType.SMITHING_FORGE]: { id: BlockType.SMITHING_FORGE, name: 'Smithing Forge & Anvil', topTextureIndex: 57, bottomTextureIndex: 11, sideTextureIndex: 58 },
  [BlockType.ARMOR_STATION]: { id: BlockType.ARMOR_STATION, name: 'Armor Fitting Station', topTextureIndex: 59, bottomTextureIndex: 4, sideTextureIndex: 60 },
  [BlockType.NETHER_ALTAR]: { id: BlockType.NETHER_ALTAR, name: 'Arcane Nether Altar', topTextureIndex: 61, bottomTextureIndex: 31, sideTextureIndex: 62 },

  // Fantasy Foliage Leaf Definitions
  [BlockType.TEAL_LEAVES]: { id: BlockType.TEAL_LEAVES, name: 'Teal Foliage', isTransparent: true, topTextureIndex: 63, bottomTextureIndex: 63, sideTextureIndex: 63 },
  [BlockType.BLUE_LEAVES]: { id: BlockType.BLUE_LEAVES, name: 'Royal Blue Foliage', isTransparent: true, topTextureIndex: 64, bottomTextureIndex: 64, sideTextureIndex: 64 },
  [BlockType.PURPLE_LEAVES]: { id: BlockType.PURPLE_LEAVES, name: 'Magenta Foliage', isTransparent: true, topTextureIndex: 65, bottomTextureIndex: 65, sideTextureIndex: 65 },
  [BlockType.CHARRED_LEAVES]: { id: BlockType.CHARRED_LEAVES, name: 'Charred Leaves', isTransparent: true, topTextureIndex: 34, bottomTextureIndex: 34, sideTextureIndex: 34 },
  // Legacy Transition Block Fallbacks (Mapped directly to solid primary textures)
  [BlockType.TRANSITION_NETHER_GRASS_STRAIGHT]: { id: BlockType.TRANSITION_NETHER_GRASS_STRAIGHT, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.TRANSITION_NETHER_GRASS_DIAGONAL]: { id: BlockType.TRANSITION_NETHER_GRASS_DIAGONAL, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.TRANSITION_DESERT_GRASS_STRAIGHT]: { id: BlockType.TRANSITION_DESERT_GRASS_STRAIGHT, name: 'Desert Sand', topTextureIndex: 47, bottomTextureIndex: 47, sideTextureIndex: 47 },
  [BlockType.TRANSITION_DESERT_GRASS_DIAGONAL]: { id: BlockType.TRANSITION_DESERT_GRASS_DIAGONAL, name: 'Desert Sand', topTextureIndex: 47, bottomTextureIndex: 47, sideTextureIndex: 47 },
  [BlockType.TRANSITION_FROST_GRASS_STRAIGHT]: { id: BlockType.TRANSITION_FROST_GRASS_STRAIGHT, name: 'Snow', topTextureIndex: 19, bottomTextureIndex: 19, sideTextureIndex: 19 },
  [BlockType.TRANSITION_FROST_GRASS_DIAGONAL]: { id: BlockType.TRANSITION_FROST_GRASS_DIAGONAL, name: 'Snow', topTextureIndex: 19, bottomTextureIndex: 19, sideTextureIndex: 19 },
  [BlockType.TRANSITION_DESERT_NETHER_DIAGONAL]: { id: BlockType.TRANSITION_DESERT_NETHER_DIAGONAL, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.TRANSITION_DESERT_NETHER_STRAIGHT]: { id: BlockType.TRANSITION_DESERT_NETHER_STRAIGHT, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.TRANSITION_FROST_NETHER_DIAGONAL]: { id: BlockType.TRANSITION_FROST_NETHER_DIAGONAL, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.TRANSITION_FROST_NETHER_STRAIGHT]: { id: BlockType.TRANSITION_FROST_NETHER_STRAIGHT, name: 'Ashen Soil', topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  // Mossveil Jungle Biome Definitions
  [BlockType.RAINFOREST_GRASS]: { id: BlockType.RAINFOREST_GRASS, name: 'Mossveil Jungle Mud', topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.RAINFOREST_SOIL]: { id: BlockType.RAINFOREST_SOIL, name: 'Mossveil Jungle Mud', topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.MOSSVEIL_MUD]: { id: BlockType.MOSSVEIL_MUD, name: 'Mossveil Jungle Mud', topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.JUNGLE_LOG]: { id: BlockType.JUNGLE_LOG, name: 'Jungle Log', topTextureIndex: 84, bottomTextureIndex: 84, sideTextureIndex: 83 },
  [BlockType.JUNGLE_LOG_X]: { id: BlockType.JUNGLE_LOG_X, name: 'Jungle Log (X)', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83, xTextureIndex: 84, zTextureIndex: 83 },
  [BlockType.JUNGLE_LOG_Z]: { id: BlockType.JUNGLE_LOG_Z, name: 'Jungle Log (Z)', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83, xTextureIndex: 83, zTextureIndex: 84 },
  [BlockType.JUNGLE_LEAVES]: { id: BlockType.JUNGLE_LEAVES, name: 'Jungle Canopy Leaves', isTransparent: true, topTextureIndex: 82, bottomTextureIndex: 82, sideTextureIndex: 82 },
  [BlockType.MOSSVEIL_MOSSY_STONE]: { id: BlockType.MOSSVEIL_MOSSY_STONE, name: 'Mossveil Mossy Stone', topTextureIndex: 85, bottomTextureIndex: 85, sideTextureIndex: 85 },
  [BlockType.MOSSVEIL_ROOT_TANGLE]: { id: BlockType.MOSSVEIL_ROOT_TANGLE, name: 'Mossveil Root Tangle', topTextureIndex: 86, bottomTextureIndex: 86, sideTextureIndex: 86 },
  [BlockType.MOSSVEIL_THORNED_UNDERGROWTH]: { id: BlockType.MOSSVEIL_THORNED_UNDERGROWTH, name: 'Mossveil Thorned Undergrowth', isTransparent: true, topTextureIndex: 87, bottomTextureIndex: 87, sideTextureIndex: 87 },
  [BlockType.JUNGLE_PLANKS]: { id: BlockType.JUNGLE_PLANKS, name: 'Jungle Planks', topTextureIndex: 88, bottomTextureIndex: 88, sideTextureIndex: 88 },
  [BlockType.JUNGLE_ROOT_POS_X]: { id: BlockType.JUNGLE_ROOT_POS_X, name: 'Jungle Tree Root', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_ROOT_NEG_X]: { id: BlockType.JUNGLE_ROOT_NEG_X, name: 'Jungle Tree Root', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_ROOT_POS_Z]: { id: BlockType.JUNGLE_ROOT_POS_Z, name: 'Jungle Tree Root', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_ROOT_NEG_Z]: { id: BlockType.JUNGLE_ROOT_NEG_Z, name: 'Jungle Tree Root', topTextureIndex: 83, bottomTextureIndex: 83, sideTextureIndex: 83 },
  [BlockType.JUNGLE_VINES]: { id: BlockType.JUNGLE_VINES, name: 'Mossveil Hanging Vines', isTransparent: true, topTextureIndex: 89, bottomTextureIndex: 89, sideTextureIndex: 89 },
  [BlockType.JUNGLE_ROPE]: { id: BlockType.JUNGLE_ROPE, name: 'Braided Jungle Rope', topTextureIndex: 90, bottomTextureIndex: 90, sideTextureIndex: 90 },
  [BlockType.HUNTING_BOW]: { id: BlockType.HUNTING_BOW, name: 'Jungle Hunting Bow', topTextureIndex: 91, bottomTextureIndex: 91, sideTextureIndex: 91 },
  [BlockType.JUNGLE_WATER]: { id: BlockType.JUNGLE_WATER, name: 'Mossveil Jungle Water', isLiquid: true, isTransparent: true, topTextureIndex: 92, bottomTextureIndex: 92, sideTextureIndex: 92 },
  [BlockType.MUDDY_QUICKSAND]: { id: BlockType.MUDDY_QUICKSAND, name: '⚠ Muddy Quicksand (Hazard)', topTextureIndex: 93, bottomTextureIndex: 93, sideTextureIndex: 93 },
  // Animal & Monster Resource Definitions
  [BlockType.BONECREST_HORN]: { id: BlockType.BONECREST_HORN, name: 'Bonecrest Horn', topTextureIndex: 73, bottomTextureIndex: 73, sideTextureIndex: 73 },
  [BlockType.UNCOOKED_MEAT]: { id: BlockType.UNCOOKED_MEAT, name: 'Uncooked Meat', topTextureIndex: 74, bottomTextureIndex: 74, sideTextureIndex: 74 },
  [BlockType.ANIMAL_HIDE]: { id: BlockType.ANIMAL_HIDE, name: 'Animal Hide', topTextureIndex: 75, bottomTextureIndex: 75, sideTextureIndex: 75 },
  [BlockType.FLOWER]: { id: BlockType.FLOWER, name: 'Wildflower', isTransparent: true, topTextureIndex: 30, bottomTextureIndex: 30, sideTextureIndex: 30 },
  // Foraging & Ground Pickup Definitions
  [BlockType.APPLES]: { id: BlockType.APPLES, name: 'Crisp Red Apple', isTransparent: true, topTextureIndex: 5, bottomTextureIndex: 5, sideTextureIndex: 5 },
  [BlockType.REEDS]: { id: BlockType.REEDS, name: 'River Reeds', isTransparent: true, topTextureIndex: 45, bottomTextureIndex: 45, sideTextureIndex: 45 },
  [BlockType.BRANCHES]: { id: BlockType.BRANCHES, name: 'Fallen Branches', isTransparent: true, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.FLINT]: { id: BlockType.FLINT, name: 'Flint', isTransparent: true, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.STONE_PEBBLE]: { id: BlockType.STONE_PEBBLE, name: 'Loose Stones', isTransparent: true, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.ASHEN_EMBERPOD]: { id: BlockType.ASHEN_EMBERPOD, name: 'Ashen Emberpod', isTransparent: true, topTextureIndex: 35, bottomTextureIndex: 35, sideTextureIndex: 35 },
  [BlockType.CARROT]: { id: BlockType.CARROT, name: 'Wild Carrot', isTransparent: true, topTextureIndex: 2, bottomTextureIndex: 2, sideTextureIndex: 2 },
  [BlockType.THORNSPIKE_CLUSTER]: { id: BlockType.THORNSPIKE_CLUSTER, name: 'Thornspike Cluster', isTransparent: true, topTextureIndex: 73, bottomTextureIndex: 73, sideTextureIndex: 73 },
  [BlockType.BLOOMWING_FEATHER]: { id: BlockType.BLOOMWING_FEATHER, name: 'Bloomwing Feather', isTransparent: true, topTextureIndex: 75, bottomTextureIndex: 75, sideTextureIndex: 75 },
  [BlockType.DUNESTING_BARB]: { id: BlockType.DUNESTING_BARB, name: 'Dunesting Barb', isTransparent: true, topTextureIndex: 73, bottomTextureIndex: 73, sideTextureIndex: 73 },
  [BlockType.DUNESTING_PINCER_CLAW]: { id: BlockType.DUNESTING_PINCER_CLAW, name: 'Dunesting Pincer Claw', isTransparent: true, topTextureIndex: 73, bottomTextureIndex: 73, sideTextureIndex: 73 },
  [BlockType.DUNESTING_SHELL]: { id: BlockType.DUNESTING_SHELL, name: 'Dunesting Shell', isTransparent: true, topTextureIndex: 43, bottomTextureIndex: 43, sideTextureIndex: 43 },
  // Tools & Weapons Definitions
  [BlockType.FLIMSY_AXE]: { id: BlockType.FLIMSY_AXE, name: 'Flimsy Wood Axe', isTransparent: true, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.FLIMSY_PICKAXE]: { id: BlockType.FLIMSY_PICKAXE, name: 'Flimsy Stone Pickaxe', isTransparent: true, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.TORCH]: { id: BlockType.TORCH, name: 'Survival Torch', isTransparent: true, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  
  // Discrete Sub-Block Shapes: Slabs (0.25m Half-Height)
  [BlockType.GRASS_SLAB]: { id: BlockType.GRASS_SLAB, name: 'Grass Slab', shape: BlockShape.SLAB, topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },
  [BlockType.DIRT_SLAB]: { id: BlockType.DIRT_SLAB, name: 'Dirt Slab', shape: BlockShape.SLAB, topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },
  [BlockType.STONE_SLAB]: { id: BlockType.STONE_SLAB, name: 'Stone Slab', shape: BlockShape.SLAB, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.SAND_SLAB]: { id: BlockType.SAND_SLAB, name: 'Sand Slab', shape: BlockShape.SLAB, topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },
  [BlockType.SNOW_SLAB]: { id: BlockType.SNOW_SLAB, name: 'Snow Slab', shape: BlockShape.SLAB, topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },
  [BlockType.MOSSVEIL_MUD_SLAB]: { id: BlockType.MOSSVEIL_MUD_SLAB, name: 'Jungle Mud Slab', shape: BlockShape.SLAB, topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.COBBLESTONE_SLAB]: { id: BlockType.COBBLESTONE_SLAB, name: 'Cobblestone Slab', shape: BlockShape.SLAB, topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },
  [BlockType.PLANKS_SLAB]: { id: BlockType.PLANKS_SLAB, name: 'Wood Planks Slab', shape: BlockShape.SLAB, topTextureIndex: 4, bottomTextureIndex: 4, sideTextureIndex: 4 },
  [BlockType.ASHEN_SOIL_SLAB]: { id: BlockType.ASHEN_SOIL_SLAB, name: 'Ashen Soil Slab', shape: BlockShape.SLAB, topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },

  // Discrete Sub-Block Shapes: Grass 90-Degree Stepped Micro-Blocks
  [BlockType.GRASS_STEP_POS_X]: { id: BlockType.GRASS_STEP_POS_X, name: 'Grass Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },
  [BlockType.GRASS_STEP_NEG_X]: { id: BlockType.GRASS_STEP_NEG_X, name: 'Grass Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },
  [BlockType.GRASS_STEP_POS_Z]: { id: BlockType.GRASS_STEP_POS_Z, name: 'Grass Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },
  [BlockType.GRASS_STEP_NEG_Z]: { id: BlockType.GRASS_STEP_NEG_Z, name: 'Grass Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 0, bottomTextureIndex: 1, sideTextureIndex: 2 },

  // Discrete Sub-Block Shapes: Dirt 90-Degree Stepped Micro-Blocks
  [BlockType.DIRT_STEP_POS_X]: { id: BlockType.DIRT_STEP_POS_X, name: 'Dirt Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },
  [BlockType.DIRT_STEP_NEG_X]: { id: BlockType.DIRT_STEP_NEG_X, name: 'Dirt Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },
  [BlockType.DIRT_STEP_POS_Z]: { id: BlockType.DIRT_STEP_POS_Z, name: 'Dirt Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },
  [BlockType.DIRT_STEP_NEG_Z]: { id: BlockType.DIRT_STEP_NEG_Z, name: 'Dirt Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 1, bottomTextureIndex: 1, sideTextureIndex: 1 },

  // Discrete Sub-Block Shapes: Stone 90-Degree Stepped Micro-Blocks
  [BlockType.STONE_STEP_POS_X]: { id: BlockType.STONE_STEP_POS_X, name: 'Stone Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.STONE_STEP_NEG_X]: { id: BlockType.STONE_STEP_NEG_X, name: 'Stone Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.STONE_STEP_POS_Z]: { id: BlockType.STONE_STEP_POS_Z, name: 'Stone Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },
  [BlockType.STONE_STEP_NEG_Z]: { id: BlockType.STONE_STEP_NEG_Z, name: 'Stone Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 3, bottomTextureIndex: 3, sideTextureIndex: 3 },

  // Discrete Sub-Block Shapes: Sand 90-Degree Stepped Micro-Blocks
  [BlockType.SAND_STEP_POS_X]: { id: BlockType.SAND_STEP_POS_X, name: 'Sand Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },
  [BlockType.SAND_STEP_NEG_X]: { id: BlockType.SAND_STEP_NEG_X, name: 'Sand Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },
  [BlockType.SAND_STEP_POS_Z]: { id: BlockType.SAND_STEP_POS_Z, name: 'Sand Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },
  [BlockType.SAND_STEP_NEG_Z]: { id: BlockType.SAND_STEP_NEG_Z, name: 'Sand Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 7, bottomTextureIndex: 7, sideTextureIndex: 7 },

  // Discrete Sub-Block Shapes: Snow 90-Degree Stepped Micro-Blocks
  [BlockType.SNOW_STEP_POS_X]: { id: BlockType.SNOW_STEP_POS_X, name: 'Snow Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },
  [BlockType.SNOW_STEP_NEG_X]: { id: BlockType.SNOW_STEP_NEG_X, name: 'Snow Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },
  [BlockType.SNOW_STEP_POS_Z]: { id: BlockType.SNOW_STEP_POS_Z, name: 'Snow Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },
  [BlockType.SNOW_STEP_NEG_Z]: { id: BlockType.SNOW_STEP_NEG_Z, name: 'Snow Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 19, bottomTextureIndex: 21, sideTextureIndex: 19 },

  // Discrete Sub-Block Shapes: Jungle Mud 90-Degree Stepped Micro-Blocks
  [BlockType.MOSSVEIL_MUD_STEP_POS_X]: { id: BlockType.MOSSVEIL_MUD_STEP_POS_X, name: 'Jungle Mud Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.MOSSVEIL_MUD_STEP_NEG_X]: { id: BlockType.MOSSVEIL_MUD_STEP_NEG_X, name: 'Jungle Mud Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.MOSSVEIL_MUD_STEP_POS_Z]: { id: BlockType.MOSSVEIL_MUD_STEP_POS_Z, name: 'Jungle Mud Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },
  [BlockType.MOSSVEIL_MUD_STEP_NEG_Z]: { id: BlockType.MOSSVEIL_MUD_STEP_NEG_Z, name: 'Jungle Mud Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 80, bottomTextureIndex: 80, sideTextureIndex: 80 },

  // Discrete Sub-Block Shapes: Ashen Soil 90-Degree Stepped Micro-Blocks
  [BlockType.ASHEN_SOIL_STEP_POS_X]: { id: BlockType.ASHEN_SOIL_STEP_POS_X, name: 'Ashen Soil Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.ASHEN_SOIL_STEP_NEG_X]: { id: BlockType.ASHEN_SOIL_STEP_NEG_X, name: 'Ashen Soil Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.ASHEN_SOIL_STEP_POS_Z]: { id: BlockType.ASHEN_SOIL_STEP_POS_Z, name: 'Ashen Soil Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },
  [BlockType.ASHEN_SOIL_STEP_NEG_Z]: { id: BlockType.ASHEN_SOIL_STEP_NEG_Z, name: 'Ashen Soil Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 32, bottomTextureIndex: 32, sideTextureIndex: 32 },

  // Discrete Sub-Block Shapes: Cobblestone 90-Degree Stepped Micro-Blocks
  [BlockType.COBBLESTONE_STEP_POS_X]: { id: BlockType.COBBLESTONE_STEP_POS_X, name: 'Cobblestone Stepped (+X)', shape: BlockShape.STEP_POS_X, topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },
  [BlockType.COBBLESTONE_STEP_NEG_X]: { id: BlockType.COBBLESTONE_STEP_NEG_X, name: 'Cobblestone Stepped (-X)', shape: BlockShape.STEP_NEG_X, topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },
  [BlockType.COBBLESTONE_STEP_POS_Z]: { id: BlockType.COBBLESTONE_STEP_POS_Z, name: 'Cobblestone Stepped (+Z)', shape: BlockShape.STEP_POS_Z, topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },
  [BlockType.COBBLESTONE_STEP_NEG_Z]: { id: BlockType.COBBLESTONE_STEP_NEG_Z, name: 'Cobblestone Stepped (-Z)', shape: BlockShape.STEP_NEG_Z, topTextureIndex: 11, bottomTextureIndex: 11, sideTextureIndex: 11 },

  [BlockType.STONE_AXE]: { id: BlockType.STONE_AXE, name: 'Stone Axe', topTextureIndex: 0, bottomTextureIndex: 0, sideTextureIndex: 0 },
  [BlockType.BONECREST_HAMMER]: { id: BlockType.BONECREST_HAMMER, name: 'Bonecrest Hammer', topTextureIndex: 0, bottomTextureIndex: 0, sideTextureIndex: 0 },
  [BlockType.BONECREST_SHIELD]: { id: BlockType.BONECREST_SHIELD, name: 'Bonecrest Shield', topTextureIndex: 0, bottomTextureIndex: 0, sideTextureIndex: 0 },
  [BlockType.COOKED_MEAT]: { id: BlockType.COOKED_MEAT, name: 'Cooked Meat', topTextureIndex: 0, bottomTextureIndex: 0, sideTextureIndex: 0 },

  [BlockType.UNLOADED]: { id: BlockType.UNLOADED, name: 'Unloaded', topTextureIndex: 0, bottomTextureIndex: 0, sideTextureIndex: 0 },
};

/**
 * Determines whether the given BlockType can be placed into the world grid as a solid block or functional object.
 * Excludes raw resources, tools, weapons, foraging items, monster drops, and uncontained liquids.
 */
export function isPlaceableBlock(type: BlockType | null): boolean {
  if (type === null || type === BlockType.AIR || type === BlockType.UNLOADED) return false;

  // Tools & Weapons
  if (
    type === BlockType.FLIMSY_AXE ||
    type === BlockType.FLIMSY_PICKAXE ||
    type === BlockType.HUNTING_BOW
  ) {
    return false;
  }

  // Animal & Monster Drops
  if (
    type === BlockType.BONECREST_HORN ||
    type === BlockType.UNCOOKED_MEAT ||
    type === BlockType.ANIMAL_HIDE ||
    type === BlockType.THORNSPIKE_CLUSTER ||
    type === BlockType.BLOOMWING_FEATHER ||
    type === BlockType.DUNESTING_BARB ||
    type === BlockType.DUNESTING_PINCER_CLAW ||
    type === BlockType.DUNESTING_SHELL
  ) {
    return false;
  }

  // Foraging & Raw Gathered Resources
  if (
    type === BlockType.APPLES ||
    type === BlockType.REEDS ||
    type === BlockType.BRANCHES ||
    type === BlockType.FLINT ||
    type === BlockType.STONE_PEBBLE ||
    type === BlockType.ASHEN_EMBERPOD ||
    type === BlockType.CARROT
  ) {
    return false;
  }

  // Pure liquid blocks
  const def = BLOCK_DEFINITIONS[type];
  if (def && def.isLiquid) return false;

  return true;
}

