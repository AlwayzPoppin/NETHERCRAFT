import * as THREE from 'three';
import { BloomwingChicken } from './BloomwingChicken';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';

export class BloomwingChickenManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public chickens: BloomwingChicken[] = [];
  private spawnCheckTimer = 0;

  // Spawning & Density Parameters
  private readonly MAX_TOTAL_CHICKENS = 16;
  private readonly MIN_NEARBY_CHICKENS = 5;
  private readonly DESPAWN_DISTANCE = 100.0;
  private readonly MIN_SPAWN_DIST = 20.0;
  private readonly MAX_SPAWN_DIST = 65.0;

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

  // Check if coordinates belong to Emerald Grove
  private isEmeraldGrove(worldX: number, worldZ: number): boolean {
    const warpX = this.world.noise.octaveNoise2D(worldX, worldZ, 2, 0.5, 0.01) * 22;
    const warpZ = this.world.noise.octaveNoise2D(worldX + 400, worldZ + 400, 2, 0.5, 0.01) * 22;
    const effectiveX = worldX + warpX;
    const effectiveZ = worldZ + warpZ;
    return effectiveX >= -50 && effectiveZ >= -50 && effectiveZ <= 50;
  }

  // Find a valid, solid surface coordinate in Emerald Grove
  private findValidSurfaceSpawn(centerPos: THREE.Vector3, minRadius: number, maxRadius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const testX = Math.floor(centerPos.x + Math.cos(angle) * dist);
      const testZ = Math.floor(centerPos.z + Math.sin(angle) * dist);

      if (!this.isEmeraldGrove(testX, testZ)) continue;

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
        (block === BlockType.GRASS || block === BlockType.DIRT) &&
        above1 === BlockType.AIR &&
        above2 === BlockType.AIR
      ) {
        const surfaceY = (gy + 1) * 0.5;
        return new THREE.Vector3(testX + 0.5, surfaceY, testZ + 0.5);
      }
    }
    return null;
  }

  // Initial natural world distribution across Emerald Grove
  public populateInitialFlocks(): void {
    const seedPoints = [
      new THREE.Vector3(0, 20, 0),
      new THREE.Vector3(20, 20, 15),
      new THREE.Vector3(-20, 20, -10),
      new THREE.Vector3(30, 20, -20),
      new THREE.Vector3(-10, 20, 30),
      new THREE.Vector3(40, 20, 10),
    ];

    for (const seed of seedPoints) {
      this.spawnFlockNear(seed, 2 + Math.floor(Math.random() * 3));
    }
  }

  // Spawn a small flock of chickens near a location
  private spawnFlockNear(center: THREE.Vector3, flockSize: number): void {
    if (this.chickens.length >= this.MAX_TOTAL_CHICKENS) return;

    const baseSpawn = this.findValidSurfaceSpawn(center, 2, 15);
    if (!baseSpawn) return;

    for (let i = 0; i < flockSize; i++) {
      if (this.chickens.length >= this.MAX_TOTAL_CHICKENS) break;

      const offsetRadius = i === 0 ? 0 : 2.0 + Math.random() * 3.0;
      const offsetAngle = Math.random() * Math.PI * 2;
      const chickenPos = this.findValidSurfaceSpawn(
        new THREE.Vector3(baseSpawn.x + Math.cos(offsetAngle) * offsetRadius, baseSpawn.y, baseSpawn.z + Math.sin(offsetAngle) * offsetRadius),
        0,
        3
      ) || baseSpawn.clone();

      const chicken = new BloomwingChicken(
        this.scene,
        this.particleManager,
        this.sound,
        this.world,
        this.itemManager,
        chickenPos
      );
      this.chickens.push(chicken);
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    // 1. Update and cull distant / dead chickens
    for (let i = this.chickens.length - 1; i >= 0; i--) {
      const chicken = this.chickens[i];
      if (chicken.isDead) {
        chicken.dispose();
        this.chickens.splice(i, 1);
        continue;
      }

      const dist = chicken.root.position.distanceTo(playerPos);
      if (dist > this.DESPAWN_DISTANCE) {
        chicken.dispose();
        this.chickens.splice(i, 1);
        continue;
      }

      chicken.update(dt, playerPos, playerPhysics);
    }

    // 2. Periodic Procedural Dynamic Spawning
    this.spawnCheckTimer += dt;
    if (this.spawnCheckTimer >= 2.5) {
      this.spawnCheckTimer = 0;

      // Only dynamically spawn if player is within/near Emerald Grove
      if (this.isEmeraldGrove(playerPos.x, playerPos.z) && this.chickens.length < this.MAX_TOTAL_CHICKENS) {
        const nearbyChickens = this.chickens.filter(c => c.root.position.distanceTo(playerPos) < this.MAX_SPAWN_DIST);

        if (nearbyChickens.length < this.MIN_NEARBY_CHICKENS) {
          const spawnCenter = this.findValidSurfaceSpawn(playerPos, this.MIN_SPAWN_DIST, this.MAX_SPAWN_DIST);
          if (spawnCenter) {
            const flockSize = 2 + Math.floor(Math.random() * 2);
            this.spawnFlockNear(spawnCenter, flockSize);
          }
        }
      }
    }
  }

  public disposeAll(): void {
    for (const chicken of this.chickens) {
      chicken.dispose();
    }
    this.chickens = [];
  }
}
