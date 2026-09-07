import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { UIManager } from '../ui/UIManager';
import { SoundManager } from '../audio/SoundManager';
import { ModelCache } from '../utils/ModelCache';

export interface PickupEntity {
  mesh: THREE.Object3D;
  type: BlockType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spawnTime: number;
  age: number;
  count: number;
  baseY: number;
}

export class ItemManager {
  private scene: THREE.Scene;
  private items: PickupEntity[] = [];
  private material: THREE.MeshLambertMaterial;
  private geometryCache: Map<BlockType, THREE.BufferGeometry> = new Map();
  public glbTemplates: Map<BlockType, THREE.Object3D> = new Map();

  // Centralized Resource Pickup Mesh Pool (Zero-allocation lifecycle)
  private meshPool: Map<BlockType, THREE.Object3D[]> = new Map();
  private templateMaterials: Set<THREE.Material> = new Set();

  constructor(scene: THREE.Scene, atlasTexture: THREE.CanvasTexture) {
    this.scene = scene;
    this.material = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });

    this.preloadResourceGLBs();
  }

  private preloadResourceGLBs(): void {
    const loader = new GLTFLoader();

    const resourceConfigs: { type: BlockType; path: string; scale: number; tint?: number; emissive?: number; emissiveIntensity?: number }[] = [
      { type: BlockType.BONECREST_HORN, path: '/RESOURCES/BONECREST HORN.glb', scale: 0.30 },
      { type: BlockType.UNCOOKED_MEAT, path: '/RESOURCES/UNCOOKED MEAT.glb', scale: 0.32 },
      { type: BlockType.ANIMAL_HIDE, path: '/RESOURCES/ANIMAL HIDE.glb', scale: 0.28, tint: 0x28242c },
      { type: BlockType.APPLES, path: '/RESOURCES/APPLES.glb', scale: 0.30 },
      { type: BlockType.REEDS, path: '/RESOURCES/REEDS.glb', scale: 0.44 },
      { type: BlockType.BRANCHES, path: '/RESOURCES/BRANCHES.glb', scale: 0.32 },
      { type: BlockType.FLINT, path: '/RESOURCES/FLINT.glb', scale: 0.28 },
      { type: BlockType.STONE_PEBBLE, path: '/RESOURCES/STONE.glb', scale: 0.28 },
      { type: BlockType.ASHEN_EMBERPOD, path: '/RESOURCES/ASHEN RUIN EMBERPOD.glb', scale: 0.32 },
      { type: BlockType.CARROT, path: '/RESOURCES/CARROT.glb', scale: 0.30 },
      { type: BlockType.THORNSPIKE_CLUSTER, path: '/RESOURCES/THORNSPIKE CLUSTER.glb', scale: 0.30 },
      { type: BlockType.BLOOMWING_FEATHER, path: '/RESOURCES/BLOOMWING FEATHER.glb', scale: 0.32 },
      { type: BlockType.DUNESTING_BARB, path: '/RESOURCES/DUNESTING BARB.glb', scale: 0.35, emissive: 0x22ff44, emissiveIntensity: 1.2 },
      { type: BlockType.DUNESTING_PINCER_CLAW, path: '/RESOURCES/DUNESTING PINCER CLAW.glb', scale: 0.35 },
      { type: BlockType.DUNESTING_SHELL, path: '/RESOURCES/DUNESTING SHELL.glb', scale: 0.35 },
      { type: BlockType.WORKBENCH, path: '/TOOLS-WEAPONS/CRAFTING TABLE.glb', scale: 0.36 },
      { type: BlockType.FLIMSY_AXE, path: '/TOOLS-WEAPONS/FLIMSY AXE.glb', scale: 0.26 },
      { type: BlockType.FLIMSY_PICKAXE, path: '/TOOLS-WEAPONS/FLIMSY PICKAXE.glb', scale: 0.26 },
      { type: BlockType.TORCH, path: '/TOOLS-WEAPONS/TORCH.glb', scale: 0.38 },
    ];

    const setupModel = (cfg: (typeof resourceConfigs)[0], model: THREE.Object3D) => {
      model.scale.set(cfg.scale, cfg.scale, cfg.scale);
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const mesh = child as THREE.Mesh;
          if (cfg.tint && mesh.material) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.color.setHex(cfg.tint);
            mesh.material = mat;
            this.templateMaterials.add(mat);
          } else if (cfg.type === BlockType.TORCH && (mesh.name === 'tripo_part_2' || mesh.name.includes('flame'))) {
            // Torch flame head gets warm emissive glow
            if (mesh.material) {
              const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
              mat.emissive = new THREE.Color(0xff8822);
              mat.emissiveIntensity = 1.4;
              mesh.material = mat;
              this.templateMaterials.add(mat);
            }
          } else if (cfg.emissive && mesh.material) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.emissive = new THREE.Color(cfg.emissive);
            mat.emissiveIntensity = cfg.emissiveIntensity || 1.0;
            mesh.material = mat;
            this.templateMaterials.add(mat);
          } else if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
                const std = m as THREE.MeshStandardMaterial;
                if (std.emissive) std.emissive.setRGB(0, 0, 0);
                std.emissiveIntensity = 0.0;
                std.emissiveMap = null;
              }
              this.templateMaterials.add(m);
            });
          }
        }
      });
      this.glbTemplates.set(cfg.type, model);
    };

    const CONCURRENT_REQUESTS = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < resourceConfigs.length) {
        const cfg = resourceConfigs[cursor++];
        if (!cfg) break;

        // 1. Check if already preloaded in ModelCache
        const cached = ModelCache.models.get(cfg.path);
        if (cached) {
          setupModel(cfg, cached.clone(true));
          continue;
        }

        // 2. Load asynchronously with concurrency control
        try {
          const gltf = await loader.loadAsync(cfg.path);
          setupModel(cfg, gltf.scene);
        } catch {
          const model = ModelCache.getClone(cfg.path);
          if (model) {
            setupModel(cfg, model);
          }
        }

        // Cooperative micro-yield
        await new Promise((r) => setTimeout(r, 0));
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENT_REQUESTS, resourceConfigs.length) }, () => worker());
    Promise.all(workers);
  }

  public getMiniBlockGeometry(type: BlockType): THREE.BufferGeometry {
    if (this.geometryCache.has(type)) {
      return this.geometryCache.get(type)!;
    }

    const def = BLOCK_DEFINITIONS[type] || BLOCK_DEFINITIONS[BlockType.DIRT];
    const geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const uvs = new Float32Array(48);
    const cols = 8;
    const rows = 8;
    const tileSizeX = 1 / cols;
    const tileSizeY = 1 / rows;

    const faces = [
      def.sideTextureIndex,   // +X
      def.sideTextureIndex,   // -X
      def.topTextureIndex,    // +Y
      def.bottomTextureIndex, // -Y
      def.sideTextureIndex,   // +Z
      def.sideTextureIndex,   // -Z
    ];

    for (let f = 0; f < 6; f++) {
      const texIdx = faces[f];
      const col = texIdx % cols;
      const row = Math.floor(texIdx / cols);
      const u0 = col * tileSizeX + 0.002;
      const u1 = (col + 1) * tileSizeX - 0.002;
      const vTop = 1 - row * tileSizeY - 0.002;
      const vBottom = 1 - (row + 1) * tileSizeY + 0.002;

      const offset = f * 8;
      uvs[offset + 0] = u0; uvs[offset + 1] = vTop;
      uvs[offset + 2] = u1; uvs[offset + 3] = vTop;
      uvs[offset + 4] = u0; uvs[offset + 5] = vBottom;
      uvs[offset + 6] = u1; uvs[offset + 7] = vBottom;
    }

    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometryCache.set(type, geo);
    return geo;
  }

  public createMiniBlockMesh(type: BlockType): THREE.Object3D {
    const template = this.glbTemplates.get(type);
    if (template) {
      const clone = template.clone(true);
      clone.visible = true;
      return clone;
    }
    const geo = this.getMiniBlockGeometry(type);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  public is3DResource(type: BlockType): boolean {
    return (
      type === BlockType.BONECREST_HORN ||
      type === BlockType.UNCOOKED_MEAT ||
      type === BlockType.ANIMAL_HIDE ||
      type === BlockType.APPLES ||
      type === BlockType.REEDS ||
      type === BlockType.BRANCHES ||
      type === BlockType.FLINT ||
      type === BlockType.STONE_PEBBLE ||
      type === BlockType.ASHEN_EMBERPOD ||
      type === BlockType.CARROT ||
      type === BlockType.THORNSPIKE_CLUSTER ||
      type === BlockType.BLOOMWING_FEATHER ||
      type === BlockType.DUNESTING_BARB ||
      type === BlockType.DUNESTING_PINCER_CLAW ||
      type === BlockType.DUNESTING_SHELL ||
      type === BlockType.WORKBENCH ||
      type === BlockType.FLIMSY_AXE ||
      type === BlockType.FLIMSY_PICKAXE ||
      type === BlockType.TORCH
    );
  }

  /**
   * Acquires a pooled mesh instance for the given BlockType without allocating new materials.
   */
  private acquireMesh(type: BlockType): THREE.Object3D {
    const pool = this.meshPool.get(type);
    if (pool && pool.length > 0) {
      const mesh = pool.pop()!;
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      return mesh;
    }

    if (this.is3DResource(type)) {
      let template = this.glbTemplates.get(type);
      if (!template) {
        // Dynamic fallback lookup from ModelCache
        if (type === BlockType.TORCH) {
          template = ModelCache.getClone('/TOOLS-WEAPONS/TORCH.glb') || undefined;
        } else if (type === BlockType.WORKBENCH) {
          template = ModelCache.getClone('/TOOLS-WEAPONS/CRAFTING TABLE.glb') || undefined;
        } else if (type === BlockType.FLIMSY_AXE) {
          template = ModelCache.getClone('/TOOLS-WEAPONS/FLIMSY AXE.glb') || undefined;
        } else if (type === BlockType.FLIMSY_PICKAXE) {
          template = ModelCache.getClone('/TOOLS-WEAPONS/FLIMSY PICKAXE.glb') || undefined;
        }
      }
      if (template) {
        // Clone node hierarchy only; shares the template's pre-tinted material
        const mesh = template.clone(true);
        mesh.visible = true;
        return mesh;
      }
    }

    // Mini block mesh sharing atlas material
    const geo = this.getMiniBlockGeometry(type);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = true;
    return mesh;
  }

  /**
   * Recycles a mesh instance back into the pool.
   */
  private releaseMesh(type: BlockType, mesh: THREE.Object3D): void {
    this.scene.remove(mesh);
    mesh.visible = false;
    if (!this.meshPool.has(type)) {
      this.meshPool.set(type, []);
    }
    this.meshPool.get(type)!.push(mesh);
  }

  public spawnPickup(type: BlockType, pos: THREE.Vector3, count: number = 1): void {
    if (type === BlockType.AIR || type === BlockType.WATER || type === BlockType.BEDROCK) return;

    if (this.is3DResource(type)) {
      this.spawnResourcePickup(type, pos, count);
      return;
    }

    const mesh = this.acquireMesh(type);

    // Slight random pop velocity on spawn
    const vx = (Math.random() - 0.5) * 1.8;
    const vy = 2.2 + Math.random() * 0.8;
    const vz = (Math.random() - 0.5) * 1.8;

    const initialPos = pos.clone().add(new THREE.Vector3(0.5, 0.5, 0.5));
    mesh.position.copy(initialPos);

    this.scene.add(mesh);

    this.items.push({
      mesh,
      type,
      position: initialPos,
      velocity: new THREE.Vector3(vx, vy, vz),
      spawnTime: performance.now(),
      age: 0,
      count,
      baseY: initialPos.y,
    });
  }

  public spawnResourcePickup(type: BlockType, pos: THREE.Vector3, count: number = 1): void {
    const mesh = this.acquireMesh(type);

    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 1.4;
    const vx = Math.cos(angle) * speed;
    const vy = 2.8 + Math.random() * 1.0;
    const vz = Math.sin(angle) * speed;

    const initialPos = pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    mesh.position.copy(initialPos);

    this.scene.add(mesh);

    this.items.push({
      mesh,
      type,
      position: initialPos,
      velocity: new THREE.Vector3(vx, vy, vz),
      spawnTime: performance.now(),
      age: 0,
      count,
      baseY: initialPos.y,
    });
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    world: VoxelWorld,
    ui: UIManager,
    sound: SoundManager,
    isPlayerDead: boolean = false
  ): void {
    const now = performance.now();
    const magnetRadiusSq = 3.2 * 3.2;
    const collectRadiusSq = 0.85 * 0.85;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.age += dt;

      // 1. Gravity & Bounce Physics
      if (item.velocity.lengthSq() > 0.001) {
        item.velocity.y -= 12.0 * dt;
        item.position.x += item.velocity.x * dt;
        item.position.y += item.velocity.y * dt;
        item.position.z += item.velocity.z * dt;

        const blockBelow = world.getBlock(
          Math.floor(item.position.x),
          Math.floor(item.position.y * 2.0 - 0.2),
          Math.floor(item.position.z)
        );

        if (blockBelow !== BlockType.AIR && blockBelow !== BlockType.WATER && item.velocity.y < 0) {
          item.velocity.set(0, 0, 0);
          item.baseY = item.position.y;
        }
      }

      // 2. Idle Spin & Floating Bobbing
      item.mesh.rotation.y += dt * 2.2;
      if (item.velocity.lengthSq() <= 0.001) {
        item.mesh.position.y = item.baseY + Math.sin(now * 0.004 + i) * 0.08;
        item.mesh.position.x = item.position.x;
        item.mesh.position.z = item.position.z;
      } else {
        item.mesh.position.copy(item.position);
      }

      // 3. Player Magnet Vacuum & Pickup Collection (0.35s delay after spawn, only when player is alive)
      if (item.age > 0.35 && !isPlayerDead) {
        const distSq = item.position.distanceToSquared(playerPos);

        if (distSq < collectRadiusSq) {
          ui.addResourceToHotbar(item.type, item.count);
          try {
            sound.playPop();
          } catch (e) {}

          const defName = BLOCK_DEFINITIONS[item.type]?.name || 'Resource';
          ui.showNotification(`+${item.count} ${defName}`);

          // Recycle mesh back into the central pool without traversing/disposing shared materials
          this.releaseMesh(item.type, item.mesh);
          this.items.splice(i, 1);
          continue;
        } else if (distSq < magnetRadiusSq) {
          const flyDir = playerPos.clone().sub(item.position).normalize();
          item.position.add(flyDir.multiplyScalar(9.5 * dt));
          item.mesh.position.copy(item.position);
        }
      }
    }
  }

  public getNearbyItem(
    playerPos: THREE.Vector3,
    camDir: THREE.Vector3,
    maxDist: number = 4.0
  ): { index: number; item: PickupEntity } | null {
    let bestDist = maxDist;
    let bestResult: { index: number; item: PickupEntity } | null = null;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.age < 0.1) continue;
      const toItem = item.position.clone().sub(playerPos);
      const dist = toItem.length();
      if (dist < bestDist) {
        if (dist < 1.8 || camDir.angleTo(toItem.clone().normalize()) < 1.1) {
          bestDist = dist;
          bestResult = { index: i, item };
        }
      }
    }
    return bestResult;
  }

  public collectItemAtIndex(
    index: number,
    ui: UIManager,
    sound: SoundManager
  ): boolean {
    if (index < 0 || index >= this.items.length) return false;
    const item = this.items[index];
    ui.addResourceToHotbar(item.type, item.count);
    try {
      sound.playPop();
    } catch (e) {}

    const defName = BLOCK_DEFINITIONS[item.type]?.name || 'Resource';
    ui.showNotification(`+${item.count} ${defName}`);

    this.releaseMesh(item.type, item.mesh);
    this.items.splice(index, 1);
    return true;
  }

  public clearAll(): void {
    for (const item of this.items) {
      this.releaseMesh(item.type, item.mesh);
    }
    this.items = [];
  }

  public dispose(): void {
    this.clearAll();

    // Dispose all pooled meshes and template hierarchies
    this.meshPool.forEach((pool) => {
      pool.forEach((mesh) => {
        this.scene.remove(mesh);
      });
    });
    this.meshPool.clear();

    // Centrally dispose shared template materials
    this.templateMaterials.forEach((mat) => mat.dispose());
    this.templateMaterials.clear();

    // Dispose mini-block geometry cache and shared atlas material
    this.geometryCache.forEach((geo) => geo.dispose());
    this.geometryCache.clear();
    this.material.dispose();
  }
}
