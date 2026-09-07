import * as THREE from 'three';
import { ThornbackBoar } from './ThornbackBoar';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';

export class ThornbackBoarManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public boars: ThornbackBoar[] = [];
  private spawnCheckTimer = 0;

  // Spawning & Density Parameters
  private readonly MAX_TOTAL_BOARS = 12;
  private readonly MIN_NEARBY_BOARS = 4;
  private readonly DESPAWN_DISTANCE = 110.0;
  private readonly MIN_SPAWN_DIST = 28.0;
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

  // Check if coordinates belong to Mossveil Jungle (Rainforest)
  private isMossveilJungle(worldX: number, worldZ: number): boolean {
    const warpX = this.world.noise.octaveNoise2D(worldX, worldZ, 2, 0.5, 0.008) * 24;
    const warpZ = this.world.noise.octaveNoise2D(worldX + 400, worldZ + 400, 2, 0.5, 0.008) * 24;
    const effectiveX = worldX + warpX;
    const effectiveZ = worldZ + warpZ;
    return effectiveX >= -155 && effectiveZ >= 42 && effectiveZ <= 218;
  }

  // Find a valid, solid surface coordinate in Mossveil Jungle
  private findValidSurfaceSpawn(centerPos: THREE.Vector3, minRadius: number, maxRadius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 35; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const testX = Math.floor(centerPos.x + Math.cos(angle) * dist);
      const testZ = Math.floor(centerPos.z + Math.sin(angle) * dist);

      if (!this.isMossveilJungle(testX, testZ)) continue;

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
        (block === BlockType.MOSSVEIL_MUD ||
         block === BlockType.RAINFOREST_GRASS ||
         block === BlockType.RAINFOREST_SOIL ||
         block === BlockType.MOSSVEIL_ROOT_TANGLE ||
         block === BlockType.MOSSVEIL_MOSSY_STONE ||
         block === BlockType.GRASS ||
         block === BlockType.DIRT) &&
        above1 === BlockType.AIR &&
        above2 === BlockType.AIR
      ) {
        const surfaceY = (gy + 1) * 0.5;
        return new THREE.Vector3(testX + 0.5, surfaceY, testZ + 0.5);
      }
    }
    return null;
  }

  // Initial natural world distribution across Mossveil Jungle
  public populateInitialHerds(): void {
    const seedPoints = [
      new THREE.Vector3(0, 20, 70),
      new THREE.Vector3(-40, 20, 110),
      new THREE.Vector3(50, 20, 130),
      new THREE.Vector3(-30, 20, 160),
      new THREE.Vector3(40, 20, 190),
    ];

    for (const seed of seedPoints) {
      this.spawnHerdNear(seed, 1 + Math.floor(Math.random() * 2));
    }
  }

  // Spawn a sounder (boar family/group) near a location
  private spawnHerdNear(center: THREE.Vector3, herdSize: number): void {
    if (this.boars.length >= this.MAX_TOTAL_BOARS) return;

    const baseSpawn = this.findValidSurfaceSpawn(center, 2, 18);
    if (!baseSpawn) return;

    for (let i = 0; i < herdSize; i++) {
      if (this.boars.length >= this.MAX_TOTAL_BOARS) break;

      const offsetRadius = i === 0 ? 0 : 3.0 + Math.random() * 3.5;
      const offsetAngle = Math.random() * Math.PI * 2;
      const boarPos = this.findValidSurfaceSpawn(
        new THREE.Vector3(baseSpawn.x + Math.cos(offsetAngle) * offsetRadius, baseSpawn.y, baseSpawn.z + Math.sin(offsetAngle) * offsetRadius),
        0,
        4
      ) || baseSpawn.clone();

      const boar = new ThornbackBoar(
        this.scene,
        this.particleManager,
        this.sound,
        this.world,
        this.itemManager,
        boarPos
      );
      this.boars.push(boar);
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    // 1. Update and cull distant / dead boars
    for (let i = this.boars.length - 1; i >= 0; i--) {
      const boar = this.boars[i];
      if (boar.isDead) {
        boar.dispose();
        this.boars.splice(i, 1);
        continue;
      }

      const dist = boar.root.position.distanceTo(playerPos);
      if (dist > this.DESPAWN_DISTANCE) {
        boar.dispose();
        this.boars.splice(i, 1);
        continue;
      }

      boar.update(dt, playerPos, playerPhysics);
    }

    // 2. Periodic Procedural Dynamic Spawning
    this.spawnCheckTimer += dt;
    if (this.spawnCheckTimer >= 3.0) {
      this.spawnCheckTimer = 0;

      // Only dynamically spawn if player is within/near Mossveil Jungle
      if (this.isMossveilJungle(playerPos.x, playerPos.z) && this.boars.length < this.MAX_TOTAL_BOARS) {
        const nearbyBoars = this.boars.filter(b => b.root.position.distanceTo(playerPos) < this.MAX_SPAWN_DIST);

        if (nearbyBoars.length < this.MIN_NEARBY_BOARS) {
          const spawnCenter = this.findValidSurfaceSpawn(playerPos, this.MIN_SPAWN_DIST, this.MAX_SPAWN_DIST);
          if (spawnCenter) {
            const herdSize = Math.random() < 0.5 ? 2 : 1;
            this.spawnHerdNear(spawnCenter, herdSize);
          }
        }
      }
    }
  }

  public disposeAll(): void {
    for (const boar of this.boars) {
      boar.dispose();
    }
    this.boars = [];
  }
}
