import * as THREE from 'three';
import { GoblinMinion } from './GoblinMinion';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';
import { PlayerPhysics } from '../physics/PlayerPhysics';

export class GoblinMinionManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public goblins: GoblinMinion[] = [];
  private spawnCheckTimer = 0;

  // Spawning & Density Parameters
  private readonly MAX_TOTAL_GOBLINS = 12;
  private readonly MIN_NEARBY_GOBLINS = 4;
  private readonly DESPAWN_DISTANCE = 110.0;
  private readonly MIN_SPAWN_DIST = 26.0;
  private readonly MAX_SPAWN_DIST = 70.0;

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

  // Check if coordinates belong to valid non-frost, non-desert, non-ashen biomes
  private isValidGoblinBiome(worldX: number, worldZ: number): boolean {
    const warpX = this.world.noise.octaveNoise2D(worldX, worldZ, 2, 0.5, 0.008) * 24;
    const warpZ = this.world.noise.octaveNoise2D(worldX + 400, worldZ + 400, 2, 0.5, 0.008) * 24;
    const effectiveX = worldX + warpX;
    const effectiveZ = worldZ + warpZ;

    // Ashen Ruins (West): effectiveX < -160 -> EXCLUDED
    if (effectiveX < -160) return false;

    // Glacial Frost (North): effectiveX >= -160 && effectiveZ < -160 -> EXCLUDED
    if (effectiveZ < -160) return false;

    // Sunscorched Desert (South): effectiveX >= -160 && effectiveZ > 220 -> EXCLUDED
    if (effectiveZ > 220) return false;

    // Allowed: Grove (-160 <= Z < 40) and Rainforest / Jungle (40 <= Z <= 220)
    return true;
  }

  // Find a valid, solid surface coordinate in allowed biomes
  private findValidSurfaceSpawn(centerPos: THREE.Vector3, minRadius: number, maxRadius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 35; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const testX = Math.floor(centerPos.x + Math.cos(angle) * dist);
      const testZ = Math.floor(centerPos.z + Math.sin(angle) * dist);

      if (!this.isValidGoblinBiome(testX, testZ)) continue;

      const cx = Math.floor(testX / 16);
      const cz = Math.floor(testZ / 16);
      const chunk = this.world.getChunk(cx, cz);
      if (!chunk) continue;

      const lx = ((testX % 16) + 16) % 16;
      const lz = ((testZ % 16) + 16) % 16;
      const gy = chunk.getHeight(lx, lz);
      if (gy < 4 || gy >= 62) continue;

      const block = this.world.getBlock(testX, gy, testZ);
      const above1 = this.world.getBlock(testX, gy + 1, testZ);
      const above2 = this.world.getBlock(testX, gy + 2, testZ);

      if (
        (block === BlockType.GRASS ||
         block === BlockType.DIRT ||
         block === BlockType.MOSSVEIL_MUD ||
         block === BlockType.RAINFOREST_GRASS ||
         block === BlockType.RAINFOREST_SOIL ||
         block === BlockType.MOSSVEIL_MOSSY_STONE ||
         block === BlockType.STONE) &&
        above1 === BlockType.AIR &&
        above2 === BlockType.AIR
      ) {
        const surfaceY = (gy + 1) * 0.5;
        return new THREE.Vector3(testX + 0.5, surfaceY, testZ + 0.5);
      }
    }
    return null;
  }

  // Initial natural world distribution across Grove and Jungle biomes
  public populateInitialSpawns(): void {
    const seedPoints = [
      new THREE.Vector3(10, 20, -60),
      new THREE.Vector3(-50, 20, -20),
      new THREE.Vector3(40, 20, 20),
      new THREE.Vector3(-20, 20, 80),
      new THREE.Vector3(60, 20, 140),
    ];

    for (const seed of seedPoints) {
      this.spawnPackNear(seed, 2 + Math.floor(Math.random() * 2));
    }
  }

  // Spawn a goblin raiding pack near a location
  private spawnPackNear(center: THREE.Vector3, packSize: number): void {
    const leaderPos = this.findValidSurfaceSpawn(center, 0, 15);
    if (!leaderPos) return;

    for (let i = 0; i < packSize; i++) {
      if (this.goblins.length >= this.MAX_TOTAL_GOBLINS) break;

      const offset = i === 0 ? new THREE.Vector3() : new THREE.Vector3(
        (Math.random() - 0.5) * 6.0,
        0,
        (Math.random() - 0.5) * 6.0
      );
      const spawnPos = leaderPos.clone().add(offset);
      // Align ground Y using O(1) Chunk.getHeight
      const cx = Math.floor(spawnPos.x / 16);
      const cz = Math.floor(spawnPos.z / 16);
      const chunk = this.world.getChunk(cx, cz);
      if (chunk) {
        const lx = ((Math.floor(spawnPos.x) % 16) + 16) % 16;
        const lz = ((Math.floor(spawnPos.z) % 16) + 16) % 16;
        const gy = chunk.getHeight(lx, lz);
        if (gy > 0) {
          spawnPos.y = (gy + 1) * 0.5;
        }
      }

      const goblin = new GoblinMinion(
        this.scene,
        this.particleManager,
        this.sound,
        this.world,
        this.itemManager,
        spawnPos
      );
      this.goblins.push(goblin);
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    // 1. Update all active goblins
    for (let i = this.goblins.length - 1; i >= 0; i--) {
      const goblin = this.goblins[i];
      goblin.update(dt, playerPos, playerPhysics);

      // Despawn if disposed or too far away from player
      if (goblin.isDisposed) {
        this.goblins.splice(i, 1);
        continue;
      }

      const dist = goblin.root.position.distanceTo(playerPos);
      if (dist > this.DESPAWN_DISTANCE && !goblin.isDead) {
        goblin.dispose();
        this.goblins.splice(i, 1);
      }
    }

    // 2. Dynamic Spawning Check
    this.spawnCheckTimer += dt;
    if (this.spawnCheckTimer >= 3.5) {
      this.spawnCheckTimer = 0;

      // Count nearby goblins
      let nearbyCount = 0;
      for (const g of this.goblins) {
        if (g.root.position.distanceTo(playerPos) <= this.MAX_SPAWN_DIST) {
          nearbyCount++;
        }
      }

      // If player is in a valid biome and nearby count is low, spawn a pack
      if (this.isValidGoblinBiome(playerPos.x, playerPos.z)) {
        if (nearbyCount < this.MIN_NEARBY_GOBLINS && this.goblins.length < this.MAX_TOTAL_GOBLINS) {
          const spawnLoc = this.findValidSurfaceSpawn(playerPos, this.MIN_SPAWN_DIST, this.MAX_SPAWN_DIST);
          if (spawnLoc) {
            this.spawnPackNear(spawnLoc, 2 + Math.floor(Math.random() * 2));
          }
        }
      }
    }
  }

  public getGoblins(): GoblinMinion[] {
    return this.goblins;
  }

  public dispose(): void {
    for (const g of this.goblins) {
      g.dispose();
    }
    this.goblins = [];
  }
}
