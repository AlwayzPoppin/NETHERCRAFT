import * as THREE from 'three';
import { DunestingScorpion } from './DunestingScorpion';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';
import { PlayerPhysics } from '../physics/PlayerPhysics';

export class DunestingScorpionManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public scorpions: DunestingScorpion[] = [];
  private spawnCheckTimer = 0;

  // Spawning & Population Parameters (Solitary, menacing desert predator)
  private readonly MAX_TOTAL_SCORPIONS = 4;
  private readonly MIN_NEARBY_SCORPIONS = 1;
  private readonly DESPAWN_DISTANCE = 110.0;
  private readonly MIN_SPAWN_DIST = 45.0;
  private readonly MAX_SPAWN_DIST = 85.0;

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

  // Check if coordinates belong strictly to Cinderdune Wastes (Desert Biome: Z >= 220, X >= -160)
  private isCinderduneWastes(worldX: number, worldZ: number): boolean {
    const warpX = this.world.noise.octaveNoise2D(worldX, worldZ, 2, 0.5, 0.008) * 32;
    const warpZ = this.world.noise.octaveNoise2D(worldX + 400, worldZ + 400, 2, 0.5, 0.008) * 32;
    const effectiveX = worldX + warpX;
    const effectiveZ = worldZ + warpZ;
    return effectiveZ >= 220 && effectiveX >= -160;
  }

  // Find a valid, solid desert surface coordinate in Cinderdune Wastes
  private findValidSurfaceSpawn(centerPos: THREE.Vector3, minRadius: number, maxRadius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 35; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const testX = Math.floor(centerPos.x + Math.cos(angle) * dist);
      const testZ = Math.floor(centerPos.z + Math.sin(angle) * dist);

      if (!this.isCinderduneWastes(testX, testZ)) continue;

      // Scan downward from maximum terrain height to find solid surface
      for (let y = 60; y >= 10; y--) {
        const block = this.world.getBlock(testX, y, testZ);
        const above1 = this.world.getBlock(testX, y + 1, testZ);
        const above2 = this.world.getBlock(testX, y + 2, testZ);

        const isSolidSurface = (
          block === BlockType.DESERT_SAND ||
          block === BlockType.SUNSCORCHED_SANDSTONE ||
          block === BlockType.CRACKED_CLAY ||
          block === BlockType.SCRUBGRASS ||
          block === BlockType.SAND
        );

        if (isSolidSurface && above1 === BlockType.AIR && above2 === BlockType.AIR) {
          return new THREE.Vector3(testX + 0.5, (y + 1.0) * 0.5, testZ + 0.5);
        }
      }
    }
    return null;
  }

  public populateInitialNests(): void {
    const origin = new THREE.Vector3(20, 20, 260); // Deep Cinderdune Wastes origin

    for (let i = 0; i < 2; i++) {
      const spawnPos = this.findValidSurfaceSpawn(origin, 30.0, 70.0);
      if (spawnPos) {
        const scorpion = new DunestingScorpion(
          this.scene,
          this.particleManager,
          this.sound,
          this.world,
          this.itemManager,
          spawnPos
        );
        this.scorpions.push(scorpion);
      }
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: PlayerPhysics): void {
    // 1. Update active scorpions & cull dead/distant/out-of-bounds
    for (let i = this.scorpions.length - 1; i >= 0; i--) {
      const scorpion = this.scorpions[i];

      if (scorpion.isDisposed) {
        this.scorpions.splice(i, 1);
        continue;
      }

      // Despawn if scorpion wandered out of Cinderdune Wastes
      if (!this.isCinderduneWastes(scorpion.root.position.x, scorpion.root.position.z)) {
        scorpion.dispose();
        this.scorpions.splice(i, 1);
        continue;
      }

      const dist = scorpion.root.position.distanceTo(playerPos);
      if (dist > this.DESPAWN_DISTANCE) {
        scorpion.dispose();
        this.scorpions.splice(i, 1);
        continue;
      }

      scorpion.update(dt, playerPos, playerPhysics);
    }

    // 2. Dynamic Spawning in Cinderdune Wastes (Low frequency, solitary)
    this.spawnCheckTimer += dt;
    if (this.spawnCheckTimer >= 10.0) {
      this.spawnCheckTimer = 0;

      if (this.isCinderduneWastes(playerPos.x, playerPos.z) && this.scorpions.length < this.MAX_TOTAL_SCORPIONS) {
        const nearbyScorpions = this.scorpions.filter((s) => s.root.position.distanceTo(playerPos) < this.MAX_SPAWN_DIST);

        if (nearbyScorpions.length < this.MIN_NEARBY_SCORPIONS) {
          const spawnPos = this.findValidSurfaceSpawn(playerPos, this.MIN_SPAWN_DIST, this.MAX_SPAWN_DIST);
          if (spawnPos) {
            const scorpion = new DunestingScorpion(
              this.scene,
              this.particleManager,
              this.sound,
              this.world,
              this.itemManager,
              spawnPos
            );
            this.scorpions.push(scorpion);
          }
        }
      }
    }
  }

  public disposeAll(): void {
    for (const scorpion of this.scorpions) {
      scorpion.dispose();
    }
    this.scorpions = [];
  }

  public dispose(): void {
    this.disposeAll();
  }
}
