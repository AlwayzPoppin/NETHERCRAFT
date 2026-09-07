import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';

export interface TextureAtlasPair {
  diffuse: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

interface SharedTextureEntry {
  texture: THREE.Texture;
  name: string;
  refCount: number;
  isPermanent: boolean; // Permanent shared textures (like the main atlas) aren't destroyed on refCount=0 unless explicitly disposed
}

/**
 * Global Texture Atlas & Shared Texture Manager
 *
 * Provides a centralized registry with reference counting to ensure shared
 * textures (terrain atlas, ore emissive atlas, shared entity palettes) are never
 * destroyed prematurely by generic scene hierarchy disposers (DisposeUtils).
 */
export class TextureAtlasManager {
  private static sharedRegistry: Map<string | THREE.Texture, SharedTextureEntry> = new Map();
  private static globalAtlas: TextureAtlasPair | null = null;

  /**
   * Registers a texture into the centralized shared registry with reference counting.
   * @param texture The Three.js texture to register.
   * @param name Unique key/name for the texture.
   * @param isPermanent If true, texture is treated as a global singleton and won't be auto-disposed when refCount hits 0.
   */
  public static registerSharedTexture(
    texture: THREE.Texture,
    name: string = `tex_${texture.id}`,
    isPermanent: boolean = false
  ): void {
    if (!texture) return;

    let entry = this.sharedRegistry.get(texture);
    if (!entry) {
      entry = {
        texture,
        name,
        refCount: 1,
        isPermanent,
      };
      this.sharedRegistry.set(texture, entry);
      this.sharedRegistry.set(name, entry);
    } else {
      entry.refCount++;
      if (isPermanent) entry.isPermanent = true;
    }
  }

  /**
   * Checks whether a texture is registered in the shared registry.
   */
  public static isShared(texture: THREE.Texture | null | undefined): boolean {
    if (!texture) return false;
    return this.sharedRegistry.has(texture);
  }

  /**
   * Increments the reference count for a shared texture.
   */
  public static retain(texture: THREE.Texture): number {
    const entry = this.sharedRegistry.get(texture);
    if (entry) {
      entry.refCount++;
      return entry.refCount;
    }
    this.registerSharedTexture(texture);
    return 1;
  }

  /**
   * Decrements reference count for a shared texture.
   * If refCount reaches 0 and the texture is not permanent, it is safely disposed and unregistered.
   * Returns true if the texture was actually disposed.
   */
  public static release(texture: THREE.Texture): boolean {
    const entry = this.sharedRegistry.get(texture);
    if (!entry) return false;

    entry.refCount = Math.max(0, entry.refCount - 1);

    if (entry.refCount === 0 && !entry.isPermanent) {
      this.sharedRegistry.delete(texture);
      this.sharedRegistry.delete(entry.name);
      if (typeof texture.dispose === 'function') {
        texture.dispose();
      }
      return true;
    }

    return false;
  }

  /**
   * Returns the global terrain texture atlas (diffuse & emissive).
   * Generates and registers the singleton atlas on first call.
   */
  public static getGlobalAtlas(): TextureAtlasPair {
    if (!this.globalAtlas) {
      this.globalAtlas = TextureGenerator.createTextureAtlas();
      this.registerSharedTexture(this.globalAtlas.diffuse, 'global_diffuse_atlas', true);
      this.registerSharedTexture(this.globalAtlas.emissive, 'global_emissive_atlas', true);
    }
    return this.globalAtlas;
  }

  /**
   * Safely rebuilds the global atlas textures when external HD texture packs load.
   */
  public static reloadGlobalAtlas(): TextureAtlasPair {
    const oldAtlas = this.globalAtlas;
    const newAtlas = TextureGenerator.createTextureAtlas();

    this.registerSharedTexture(newAtlas.diffuse, 'global_diffuse_atlas', true);
    this.registerSharedTexture(newAtlas.emissive, 'global_emissive_atlas', true);

    this.globalAtlas = newAtlas;

    if (oldAtlas) {
      // Unregister old textures as permanent so they can be disposed
      const diffEntry = this.sharedRegistry.get(oldAtlas.diffuse);
      if (diffEntry) diffEntry.isPermanent = false;
      const emEntry = this.sharedRegistry.get(oldAtlas.emissive);
      if (emEntry) emEntry.isPermanent = false;

      this.release(oldAtlas.diffuse);
      this.release(oldAtlas.emissive);
    }

    return newAtlas;
  }

  /**
   * Cleans up all managed textures upon full application exit.
   */
  public static disposeAll(): void {
    if (this.globalAtlas) {
      const diffEntry = this.sharedRegistry.get(this.globalAtlas.diffuse);
      if (diffEntry) diffEntry.isPermanent = false;
      const emEntry = this.sharedRegistry.get(this.globalAtlas.emissive);
      if (emEntry) emEntry.isPermanent = false;

      this.release(this.globalAtlas.diffuse);
      this.release(this.globalAtlas.emissive);
      this.globalAtlas = null;
    }

    for (const [key, entry] of this.sharedRegistry.entries()) {
      if (typeof key !== 'string') {
        if (typeof entry.texture.dispose === 'function') {
          entry.texture.dispose();
        }
      }
    }
    this.sharedRegistry.clear();
  }
}
