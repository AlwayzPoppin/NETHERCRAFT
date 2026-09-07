import * as THREE from 'three';
import { BiomeSerpent, SerpentType } from './BiomeSerpent';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';
import { PlayerPhysics } from '../physics/PlayerPhysics';

export class BiomeSerpentManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public serpents: BiomeSerpent[] = [];
  public onSlamImpact?: (pos: THREE.Vector3, intensity: number) => void;

  // Biome Boss Coordinates & Zones
  private readonly BIOME_SPAWN_CENTERS: Record<SerpentType, { x: number; z: number }> = {
    [SerpentType.EMERALD]: { x: 120, z: 120 },   // Deep Mossveil Jungle / Emerald Grove
    [SerpentType.FROST]:   { x: 30,  z: -210 },  // Glacial Highlands of Frostfang Ridge
    [SerpentType.SAND]:    { x: 50,  z: 280 },   // Sunscorched Dunes of Cinderdune Wastes
    [SerpentType.ASHEN]:   { x: -230, z: 40 },   // Molten Volcano of Ashen Ruins
  };

  private respawnTimers: Record<SerpentType, number> = {
    [SerpentType.EMERALD]: 0,
    [SerpentType.FROST]: 0,
    [SerpentType.SAND]: 0,
    [SerpentType.ASHEN]: 0,
  };

  constructor(
    scene: THREE.Scene,
    particleManager: BlockParticleManager,
    sound: SoundManager,
    world: VoxelWorld,
    itemManager: ItemManager
  ) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.sound = sound;
    this.world = world;
    this.itemManager = itemManager;
  }

  // Find a solid, unobstructed surface coordinate near the target biome center
  private findValidSurfaceSpawn(centerX: number, centerZ: number, radius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const testX = Math.floor(centerX + Math.cos(angle) * dist);
      const testZ = Math.floor(centerZ + Math.sin(angle) * dist);

      // Scan downward from maximum terrain height to find solid surface
      for (let y = 65; y >= 6; y--) {
        const block = this.world.getBlock(testX, y, testZ);
        const above1 = this.world.getBlock(testX, y + 1, testZ);
        const above2 = this.world.getBlock(testX, y + 2, testZ);

        const isSolidSurface = (
          block !== BlockType.AIR &&
          block !== BlockType.WATER &&
          block !== BlockType.OASIS_WATER &&
          block !== BlockType.JUNGLE_WATER &&
          block !== BlockType.MOLTEN_CORRUPTION &&
          block !== BlockType.MUDDY_QUICKSAND
        );

        if (isSolidSurface && above1 === BlockType.AIR && above2 === BlockType.AIR) {
          return new THREE.Vector3(testX + 0.5, (y + 1.0) * 0.5, testZ + 0.5);
        }
      }
    }
    return null;
  }

  public populateInitialBosses(): void {
    const types = [
      SerpentType.EMERALD,
      SerpentType.FROST,
      SerpentType.SAND,
      SerpentType.ASHEN,
    ];

    for (const type of types) {
      const center = this.BIOME_SPAWN_CENTERS[type];
      const spawnPos = this.findValidSurfaceSpawn(center.x, center.z, 60.0) || new THREE.Vector3(center.x, 10, center.z);
      
      const serpent = new BiomeSerpent(
        this.scene,
        this.particleManager,
        this.sound,
        this.world,
        this.itemManager,
        type,
        spawnPos
      );

      serpent.onSlamImpact = (pos, intensity) => {
        if (this.onSlamImpact) this.onSlamImpact(pos, intensity);
      };

      this.serpents.push(serpent);
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    // 1. Update Active Bosses & Clean Dead/Disposed Instances
    for (let i = this.serpents.length - 1; i >= 0; i--) {
      const serpent = this.serpents[i];
      if (serpent.isDisposed) {
        // Boss defeated and disposed: start respawn timer (300 seconds / 5 minutes)
        this.respawnTimers[serpent.config.type] = 300.0;
        this.serpents.splice(i, 1);
        continue;
      }
      serpent.update(dt, playerPos, playerPhysics);
    }

    // 2. Respawn Boss Cycle
    const types = [SerpentType.EMERALD, SerpentType.FROST, SerpentType.SAND, SerpentType.ASHEN];
    for (const type of types) {
      if (!this.serpents.some((s) => s.config.type === type && !s.isDead)) {
        this.respawnTimers[type] -= dt;
        if (this.respawnTimers[type] <= 0) {
          this.respawnTimers[type] = 300.0;
          const center = this.BIOME_SPAWN_CENTERS[type];
          const spawnPos = this.findValidSurfaceSpawn(center.x, center.z, 70.0);
          if (spawnPos) {
            const serpent = new BiomeSerpent(
              this.scene,
              this.particleManager,
              this.sound,
              this.world,
              this.itemManager,
              type,
              spawnPos
            );
            serpent.onSlamImpact = (pos, intensity) => {
              if (this.onSlamImpact) this.onSlamImpact(pos, intensity);
            };
            this.serpents.push(serpent);
          }
        }
      }
    }
  }

  public clearAll(): void {
    for (const serpent of this.serpents) {
      serpent.dispose();
    }
    this.serpents = [];
  }

  public dispose(): void {
    this.clearAll();
  }
}
