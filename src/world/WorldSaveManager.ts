import { BlockType } from '../textures/TextureGenerator';
import { VoxelWorld } from './VoxelWorld';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { InputManager } from '../controls/InputManager';
import { UIManager, HotbarSlotData } from '../ui/UIManager';

export interface WorldSaveData {
  version: number;
  seed: number;
  timestamp: string;
  formattedDate: string;
  modifiedBlocksCount: number;
  playerPos: { x: number; y: number; z: number };
  playerYaw: number;
  playerPitch: number;
  hotbar: HotbarSlotData[];
  userEdits: Record<string, BlockType>; // "x,y,z" => BlockType
}

// Lightweight metadata kept in memory so hasSave/getSaveInfo are synchronous
interface SaveMeta {
  seed: number;
  timestamp: string;
  formattedDate: string;
  blockCount: number;
}

/**
 * Async world persistence layer backed by IndexedDB.
 *
 * Key design decisions:
 * - `save()` is debounced: rapid calls (e.g. autosave on every pause toggle)
 *   are coalesced into a single write after a 500ms quiet period.
 * - `JSON.stringify` runs synchronously but is unavoidable; the heavy part
 *   (the actual I/O) is offloaded to IndexedDB's async transaction API,
 *   which doesn't block the main thread the way localStorage.setItem does.
 * - A lightweight in-memory `saveMeta` cache keeps `hasSave()` and
 *   `getSaveInfo()` synchronous for UI badge rendering.
 * - On first access the DB is opened lazily and the meta cache is hydrated
 *   from any existing record.
 */
export class WorldSaveManager {
  private static readonly DB_NAME = 'nethercraft_db';
  private static readonly STORE_NAME = 'saves';
  private static readonly SAVE_KEY = 'nethercraft_save_v1';
  private static readonly DEBOUNCE_MS = 500;

  // In-memory meta cache (hydrated on init or after save/load)
  private static saveMeta: SaveMeta | null | undefined = undefined; // undefined = not yet hydrated
  private static dbPromise: Promise<IDBDatabase> | null = null;
  private static debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static pendingSaveSnapshot: {
    world: VoxelWorld;
    seed: number;
    timestamp: string;
    formattedDate: string;
    modifiedBlocksCount: number;
    playerPos: { x: number; y: number; z: number };
    playerYaw: number;
    playerPitch: number;
    hotbar: any[];
  } | null = null;

  // ---------- IndexedDB helpers ----------

  private static openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private static async idbGet<T>(key: string): Promise<T | undefined> {
    const db = await this.openDB();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private static async idbPut(key: string, value: any): Promise<void> {
    const db = await this.openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private static async idbDelete(key: string): Promise<void> {
    const db = await this.openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- Meta cache hydration ----------

  /**
   * Call once during app startup (before the first frame) to hydrate
   * the in-memory meta cache from IndexedDB so that `hasSave()` and
   * `getSaveInfo()` return correct values synchronously.
   */
  public static async init(): Promise<void> {
    // Hydrate meta cache directly from IndexedDB
    try {
      const data = await this.idbGet<WorldSaveData>(this.SAVE_KEY);
      if (data) {
        this.saveMeta = {
          seed: data.seed || 1337,
          timestamp: data.timestamp,
          formattedDate: data.formattedDate || new Date(data.timestamp).toLocaleString(),
          blockCount: data.modifiedBlocksCount || Object.keys(data.userEdits || {}).length,
        };
      } else {
        this.saveMeta = null;
      }
    } catch {
      this.saveMeta = null;
    }
  }

  // ---------- Synchronous queries (UI) ----------

  public static hasSave(): boolean {
    // If init() hasn't been awaited yet, fall through to false
    return this.saveMeta != null;
  }

  public static getSaveInfo(): { seed: number; timestamp: string; formattedDate: string; blockCount: number } | null {
    return this.saveMeta ?? null;
  }

  // ---------- Async persistence ----------

  /**
   * Debounced async save. Collects the save payload immediately (cheap
   * object construction from live game state) and schedules the actual
   * IndexedDB write after DEBOUNCE_MS of inactivity.
   *
   * Returns `true` synchronously to indicate the save was accepted.
   * The actual write happens in the background; errors are logged.
   */
  public static save(world: VoxelWorld, player: PlayerPhysics, input: InputManager, ui: UIManager): boolean {
    try {
      const now = new Date();
      const iso = now.toISOString();
      const formatted = now.toLocaleString();
      const count = world.userEdits.size;

      // Capture lightweight references without allocating dictionary
      this.pendingSaveSnapshot = {
        world,
        seed: world.seed,
        timestamp: iso,
        formattedDate: formatted,
        modifiedBlocksCount: count,
        playerPos: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
        },
        playerYaw: input.yaw,
        playerPitch: input.pitch,
        hotbar: ui.hotbarSlots,
      };

      // Update meta cache immediately so UI reflects new state
      this.saveMeta = {
        seed: world.seed,
        timestamp: iso,
        formattedDate: formatted,
        blockCount: count,
      };

      // Debounce: reset timer on each call
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.flushSave();
      }, this.DEBOUNCE_MS);

      return true;
    } catch (e) {
      console.warn('Failed to prepare world save data:', e);
      return false;
    }
  }

  /** Immediately writes the pending save payload to IndexedDB. */
  private static async flushSave(): Promise<void> {
    const snapshot = this.pendingSaveSnapshot;
    if (!snapshot) return;
    this.pendingSaveSnapshot = null;

    try {
      // Serialize user edits only when actually writing to IndexedDB
      const userEditsObj: Record<string, BlockType> = {};
      for (const [key, type] of snapshot.world.userEdits.entries()) {
        userEditsObj[key] = type;
      }

      const saveData: WorldSaveData = {
        version: 1,
        seed: snapshot.seed,
        timestamp: snapshot.timestamp,
        formattedDate: snapshot.formattedDate,
        modifiedBlocksCount: snapshot.modifiedBlocksCount,
        playerPos: snapshot.playerPos,
        playerYaw: snapshot.playerYaw,
        playerPitch: snapshot.playerPitch,
        hotbar: snapshot.hotbar,
        userEdits: userEditsObj,
      };

      await this.idbPut(this.SAVE_KEY, saveData);
    } catch (e) {
      console.warn('Failed to write world save to IndexedDB:', e);
    }
  }

  /**
   * Force-flushes any pending debounced save and returns only after
   * the write completes. Call this before page unload or explicit
   * "Save & Quit" actions.
   */
  public static async flushPendingSave(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.flushSave();
  }

  public static async load(): Promise<WorldSaveData | null> {
    try {
      const data = await this.idbGet<WorldSaveData>(this.SAVE_KEY);
      if (!data) return null;

      // Keep meta cache in sync
      this.saveMeta = {
        seed: data.seed || 1337,
        timestamp: data.timestamp,
        formattedDate: data.formattedDate || new Date(data.timestamp).toLocaleString(),
        blockCount: data.modifiedBlocksCount || Object.keys(data.userEdits || {}).length,
      };

      return data;
    } catch (e) {
      console.warn('Failed to load world save from IndexedDB:', e);
      return null;
    }
  }

  public static async deleteSave(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingSaveSnapshot = null;
    this.saveMeta = null;

    try {
      await this.idbDelete(this.SAVE_KEY);
    } catch (e) {
      console.warn('Failed to delete world save from IndexedDB:', e);
    }
  }
}
