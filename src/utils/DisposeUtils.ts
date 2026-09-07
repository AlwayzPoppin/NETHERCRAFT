import * as THREE from 'three';
import { TextureAtlasManager } from '../textures/TextureAtlasManager';

/**
 * Recursively traverses a Three.js Object3D hierarchy and properly disposes all:
 * - BufferGeometries
 * - Materials (single & multi-material arrays)
 * - Material textures (map, normalMap, roughnessMap, metalnessMap, emissiveMap, alphaMap, etc.)
 *   with reference-counting protection for shared texture atlases.
 * - Lights (PointLight, SpotLight, DirectionalLight, etc.)
 */
export function disposeHierarchy(obj: THREE.Object3D | null | undefined): void {
  if (!obj) return;

  obj.traverse((child) => {
    // 1. Dispose Mesh Geometries & Materials
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (!mat) return;
          // Dispose textures attached to material if unique and not shared
          const textureKeys: (keyof THREE.Material)[] = [
            'map' as any,
            'lightMap' as any,
            'bumpMap' as any,
            'normalMap' as any,
            'specularMap' as any,
            'envMap' as any,
            'emissiveMap' as any,
            'roughnessMap' as any,
            'metalnessMap' as any,
            'alphaMap' as any,
          ];
          textureKeys.forEach((key) => {
            const tex = (mat as any)[key] as THREE.Texture | undefined;
            if (tex && typeof tex.dispose === 'function') {
              if (TextureAtlasManager.isShared(tex)) {
                TextureAtlasManager.release(tex);
              } else {
                tex.dispose();
              }
            }
          });
          mat.dispose();
        });
      }
    }

    // 2. Dispose Dynamic Lights
    if ((child as THREE.Light).isLight) {
      const light = child as THREE.Light;
      if (typeof light.dispose === 'function') {
        light.dispose();
      }
    }
  });

  // Remove from parent if still attached
  if (obj.parent) {
    obj.parent.remove(obj);
  }
}
