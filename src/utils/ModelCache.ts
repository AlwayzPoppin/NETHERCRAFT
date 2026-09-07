import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type AssetErrorListener = (url: string, error: any) => void;

/**
 * Centralized ModelCache for all 3D entity models in NetherCraft.
 *
 * Preloads all mob & entity GLB files once during the loading screen phase.
 * Includes a Global Asset Loading Error Boundary with automatic retry logic,
 * stylized procedural fallback proxy meshes, and UI error event notifications.
 */
export class ModelCache {
  public static models: Map<string, THREE.Object3D> = new Map();
  public static gltfs: Map<string, GLTF> = new Map();
  private static failedUrls: Set<string> = new Set();
  private static errorListeners: AssetErrorListener[] = [];

  public static registerErrorListener(listener: AssetErrorListener): void {
    this.errorListeners.push(listener);
  }

  private static notifyError(url: string, error: any): void {
    this.failedUrls.add(url);
    for (const listener of this.errorListeners) {
      try {
        listener(url, error);
      } catch (err) {
        console.error('Error in ModelCache error listener:', err);
      }
    }
  }

  public static async preloadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const urls = [
      '/ANIMALS/THORNBACK BOAR.glb',
      '/ANIMALS/BONECREST RAM.glb',
      '/ANIMALS/BLOOMWING CHICKEN.glb',
      '/entities/DUNESTING SCORPION.glb',
      '/entities/EMBERWYNN_RIGGED.glb',
      '/entities/EMBERWYNN DRAGON_Animation_Walking.glb',
      '/TOOLS-WEAPONS/CRAFTING TABLE.glb',
      '/TOOLS-WEAPONS/FLIMSY AXE.glb',
      '/TOOLS-WEAPONS/FLIMSY PICKAXE.glb',
      '/TOOLS-WEAPONS/TORCH.glb',
      '/entities/EMERALD SERPENT.glb',
      '/entities/FROST SERPENT.glb',
      '/entities/SAND SERPENT.glb',
      '/entities/ASHEN SERPENT.glb',
      '/entities/GOBLIN MINION.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Idle_1.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Walking_Scan_with_Sudden_Look_Back.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_RUNNING.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Attack.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_HEAVY_STAB.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Block_1.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Roll_Dodge.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Walk_Backward_with_Sword.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_Dying_Backwards.glb',
      '/entities/ENTITY ANIMATIONS/GOBLIN MINION ANIMATIONS/Animation_climbing_up_wall.glb',
    ];

    const CONCURRENT_LOADS = 4;
    let cursor = 0;
    let loaded = 0;

    const worker = async () => {
      while (cursor < urls.length) {
        const index = cursor++;
        const url = urls[index];
        const cleanUrl = encodeURI(url);

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const gltf = await loader.loadAsync(cleanUrl);
            sanitizeModelMaterials(gltf.scene);
            ModelCache.models.set(url, gltf.scene);
            ModelCache.models.set(cleanUrl, gltf.scene);
            ModelCache.gltfs.set(url, gltf);
            ModelCache.gltfs.set(cleanUrl, gltf);
            break;
          } catch (err) {
            if (attempt === 2) {
              console.warn(`[ModelCache ErrorBoundary] Failed to preload ${url} after 3 attempts:`, err);
              ModelCache.notifyError(url, err);
              // Pre-seed a fallback model in cache so synchronous getClone never returns null
              const fallback = ModelCache.createFallbackModel(url);
              ModelCache.models.set(url, fallback);
              ModelCache.models.set(cleanUrl, fallback);
            } else {
              await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
            }
          }
        }

        loaded++;
        if (onProgress) {
          onProgress(loaded, urls.length);
        }

        // Cooperative micro-yield to keep UI progress bar responsive and prevent main-thread GC lockups
        await new Promise((r) => setTimeout(r, 0));
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENT_LOADS, urls.length) }, () => worker());
    await Promise.all(workers);
  }

  /**
   * Synchronously clone a cached model using SkeletonUtils.clone().
   * If the model failed to load or is not yet loaded, returns a stylized
   * procedural fallback mesh to prevent invisible ghost entities or game crashes.
   */
  public static getClone(url: string, returnFallbackOnFailure: boolean = true): THREE.Object3D | null {
    const cleanUrl = encodeURI(url);
    let template = this.models.get(url) || this.models.get(cleanUrl);

    if (!template) {
      if (!this.failedUrls.has(url) && !this.failedUrls.has(cleanUrl)) {
        // Lazy load fallback in background for resilience
        const loader = new GLTFLoader();
        loader.load(
          cleanUrl,
          (gltf) => {
            sanitizeModelMaterials(gltf.scene);
            this.models.set(url, gltf.scene);
            this.models.set(cleanUrl, gltf.scene);
            this.gltfs.set(url, gltf);
            this.gltfs.set(cleanUrl, gltf);
          },
          undefined,
          (err) => {
            console.warn(`[ModelCache ErrorBoundary] Background fetch failed for ${url}:`, err);
            this.notifyError(url, err);
          }
        );
      }

      if (returnFallbackOnFailure) {
        const fallback = this.createFallbackModel(url);
        this.models.set(url, fallback);
        this.models.set(cleanUrl, fallback);
        return fallback.clone(true);
      }
      return null;
    }

    const cloned = SkeletonUtils.clone(template);
    sanitizeModelMaterials(cloned);
    return cloned;
  }

  /**
   * Get the full preloaded GLTF object (including animations) for complex entities.
   */
  public static getGLTF(url: string): GLTF | null {
    const cleanUrl = encodeURI(url);
    return this.gltfs.get(url) || this.gltfs.get(cleanUrl) || null;
  }

  /**
   * Retrieve the preloaded animation clip from a GLTF file URL.
   */
  public static getAnimationClip(url: string): THREE.AnimationClip | null {
    const gltf = this.getGLTF(url);
    if (gltf && gltf.animations && gltf.animations.length > 0) {
      return gltf.animations[0];
    }
    return null;
  }

  /**
   * Generates a stylized procedural fallback proxy mesh matching the entity's
   * expected bounding volume, bone hierarchy, and visual silhouette.
   */
  public static createFallbackModel(url: string): THREE.Group {
    const group = new THREE.Group();
    const upperUrl = url.toUpperCase();

    const fallbackMat = new THREE.MeshLambertMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.88,
    });

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      wireframe: true,
    });

    if (upperUrl.includes('SERPENT')) {
      // Multi-segment Bone chain fallback for Biome Serpent IK
      const segmentCount = 12;
      let prevBone: THREE.Bone | null = null;
      const rootBone = new THREE.Bone();
      rootBone.name = 'Root_Spine';
      group.add(rootBone);
      prevBone = rootBone;

      for (let i = 0; i < segmentCount; i++) {
        const segGeo = new THREE.BoxGeometry(0.55, 0.55, 0.75);
        const segMesh = new THREE.Mesh(segGeo, fallbackMat);
        segMesh.position.set(0, 0, -i * 0.8);
        segMesh.castShadow = true;
        group.add(segMesh);

        const bone = new THREE.Bone();
        bone.name = `Spine_Bone_${i}`;
        bone.position.set(0, 0, -0.8);
        prevBone.add(bone);
        prevBone = bone;
      }
    } else if (upperUrl.includes('DRAGON')) {
      // Winged Dragon fallback
      const bodyGeo = new THREE.BoxGeometry(1.6, 1.2, 3.2);
      const bodyMesh = new THREE.Mesh(bodyGeo, fallbackMat);
      bodyMesh.position.set(0, 1.2, 0);
      group.add(bodyMesh);

      const headGeo = new THREE.BoxGeometry(0.9, 0.8, 1.2);
      const headMesh = new THREE.Mesh(headGeo, fallbackMat);
      headMesh.position.set(0, 1.8, 1.8);
      group.add(headMesh);

      const wingGeo = new THREE.BoxGeometry(3.0, 0.08, 1.5);
      const leftWing = new THREE.Mesh(wingGeo, fallbackMat);
      leftWing.position.set(2.0, 1.5, 0);
      const rightWing = new THREE.Mesh(wingGeo, fallbackMat);
      rightWing.position.set(-2.0, 1.5, 0);
      group.add(leftWing);
      group.add(rightWing);
    } else if (upperUrl.includes('BOAR') || upperUrl.includes('RAM')) {
      // Quadruped animal fallback
      const bodyGeo = new THREE.BoxGeometry(1.1, 0.9, 1.5);
      const bodyMesh = new THREE.Mesh(bodyGeo, fallbackMat);
      bodyMesh.position.set(0, 0.65, 0);
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      const headGeo = new THREE.BoxGeometry(0.65, 0.65, 0.7);
      const headMesh = new THREE.Mesh(headGeo, fallbackMat);
      headMesh.position.set(0, 0.9, 0.9);
      headMesh.castShadow = true;
      group.add(headMesh);
    } else if (upperUrl.includes('CHICKEN')) {
      // Avian fallback
      const bodyGeo = new THREE.BoxGeometry(0.55, 0.55, 0.65);
      const bodyMesh = new THREE.Mesh(bodyGeo, fallbackMat);
      bodyMesh.position.set(0, 0.4, 0);
      bodyMesh.castShadow = true;
      group.add(bodyMesh);
    } else if (upperUrl.includes('TORCH') || upperUrl.includes('TABLE') || upperUrl.includes('AXE') || upperUrl.includes('PICKAXE')) {
      // Tool / Item block fallback
      const itemGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const itemMesh = new THREE.Mesh(itemGeo, fallbackMat);
      itemMesh.position.set(0, 0.2, 0);
      itemMesh.castShadow = true;
      group.add(itemMesh);
    } else {
      // Generic humanoid / mob fallback
      const bodyGeo = new THREE.BoxGeometry(0.7, 1.2, 0.5);
      const bodyMesh = new THREE.Mesh(bodyGeo, fallbackMat);
      bodyMesh.position.set(0, 0.8, 0);
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const headMesh = new THREE.Mesh(headGeo, fallbackMat);
      headMesh.position.set(0, 1.6, 0);
      headMesh.castShadow = true;
      group.add(headMesh);
    }

    // Add subtle warning wireframe bounding indicator
    const boundsGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
    const wireMesh = new THREE.Mesh(boundsGeo, wireMat);
    wireMesh.scale.set(1.02, 1.02, 1.02);
    group.add(wireMesh);

    return group;
  }
}

/**
 * Strips accidental baked full-white emissive maps/factors exported by Blender/Meshy
 * that cause characters, mobs, animals, and items to remain full bright at night.
 * Ensures all models properly react to dynamic sun, moon, ambient, and torchlight.
 */
export function sanitizeModelMaterials(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        if (
          (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
          (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial
        ) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.emissive) {
            std.emissive.setRGB(0, 0, 0);
          }
          std.emissiveIntensity = 0.0;
          std.emissiveMap = null;
          std.needsUpdate = true;
        }
      }
    }
  });
}
