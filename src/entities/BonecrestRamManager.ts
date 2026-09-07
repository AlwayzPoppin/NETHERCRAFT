import * as THREE from 'three';
import { BonecrestRam } from './BonecrestRam';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType } from '../textures/TextureGenerator';

import { ItemManager } from '../items/ItemManager';

export class BonecrestRamManager {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;
  private itemManager: ItemManager;

  public rams: BonecrestRam[] = [];
  private spawnCheckTimer = 0;

  // Spawning & Density Parameters
  private readonly MAX_TOTAL_RAMS = 14;
  private readonly MIN_NEARBY_RAMS = 6;
  private readonly DESPAWN_DISTANCE = 115.0;
  private readonly MIN_SPAWN_DIST = 32.0;
  private readonly MAX_SPAWN_DIST = 75.0;

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

  // Check if coordinates strictly belong to the Ashen Ruins biome (West territory, effectiveX < -165)
  private isAshenRuins(worldX: number, worldZ: number): boolean {
    const warpX = this.world.noise.octaveNoise2D(worldX, worldZ, 2, 0.5, 0.008) * 32;
    const effectiveX = worldX + warpX;
    return effectiveX < -165;
  }

  // Find a valid, solid surface coordinate in the Ashen Ruins
  private findValidSurfaceSpawn(centerPos: THREE.Vector3, minRadius: number, maxRadius: number): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 35; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const testX = Math.floor(centerPos.x + Math.cos(angle) * dist);
      const testZ = Math.floor(centerPos.z + Math.sin(angle) * dist);

      if (!this.isAshenRuins(testX, testZ)) continue;

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
        block === BlockType.ASHEN_SOIL ||
        block === BlockType.CORRUPTED_GROWTH ||
        block === BlockType.NETHER_STONE ||
        block === BlockType.CINDER_SAND
      ) {
        if (above1 === BlockType.AIR && above2 === BlockType.AIR) {
          const surfaceY = (gy + 1) * 0.5;
          return new THREE.Vector3(testX + 0.5, surfaceY, testZ + 0.5);
        }
      }
    }
    return null;
  }

  // Initial natural world distribution across multiple scattered zones in Ashen Ruins
  public populateInitialHerds(): void {
    const seedPoints = [
      new THREE.Vector3(-190, 20, -45),
      new THREE.Vector3(-210, 20, 35),
      new THREE.Vector3(-230, 20, -20),
      new THREE.Vector3(-250, 20, 60),
      new THREE.Vector3(-270, 20, -70),
    ];

    for (const seed of seedPoints) {
      this.spawnHerdNear(seed, 1 + Math.floor(Math.random() * 3));
    }
  }

  // Spawn a natural small herd or solitary ram near a location
  private spawnHerdNear(center: THREE.Vector3, herdSize: number): void {
    if (this.rams.length >= this.MAX_TOTAL_RAMS) return;

    const baseSpawn = this.findValidSurfaceSpawn(center, 2, 20);
    if (!baseSpawn) return;

    for (let i = 0; i < herdSize; i++) {
      if (this.rams.length >= this.MAX_TOTAL_RAMS) break;

      const offsetRadius = i === 0 ? 0 : 3.5 + Math.random() * 4.0;
      const offsetAngle = Math.random() * Math.PI * 2;
      const ramPos = this.findValidSurfaceSpawn(
        new THREE.Vector3(baseSpawn.x + Math.cos(offsetAngle) * offsetRadius, baseSpawn.y, baseSpawn.z + Math.sin(offsetAngle) * offsetRadius),
        0,
        4
      ) || baseSpawn.clone();

      const ram = new BonecrestRam(
        this.scene,
        this.particleManager,
        this.sound,
        this.world,
        this.itemManager,
        ramPos
      );
      this.rams.push(ram);
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    // 1. Update and cull distant / dead / non-Ashen rams
    for (let i = this.rams.length - 1; i >= 0; i--) {
      const ram = this.rams[i];
      if (ram.isDead) {
        ram.dispose();
        this.rams.splice(i, 1);
        continue;
      }

      // Despawn if ram somehow wandered out of Ashen Ruins territory
      if (!this.isAshenRuins(ram.root.position.x, ram.root.position.z)) {
        ram.dispose();
        this.rams.splice(i, 1);
        continue;
      }

      const dist = ram.root.position.distanceTo(playerPos);
      if (dist > this.DESPAWN_DISTANCE) {
        ram.dispose();
        this.rams.splice(i, 1);
        continue;
      }

      ram.update(dt, playerPos, playerPhysics);
    }

    // 2. Periodic Procedural Dynamic Spawning
    this.spawnCheckTimer += dt;
    if (this.spawnCheckTimer >= 2.5) {
      this.spawnCheckTimer = 0;

      // Only dynamically spawn if player is within the Ashen Ruins territory
      if (this.isAshenRuins(playerPos.x, playerPos.z) && this.rams.length < this.MAX_TOTAL_RAMS) {
        const nearbyRams = this.rams.filter(r => r.root.position.distanceTo(playerPos) < this.MAX_SPAWN_DIST);
        
        if (nearbyRams.length < this.MIN_NEARBY_RAMS) {
          const spawnCenter = this.findValidSurfaceSpawn(playerPos, this.MIN_SPAWN_DIST, this.MAX_SPAWN_DIST);
          if (spawnCenter) {
            const herdSize = Math.random() < 0.65 ? 2 : 1;
            this.spawnHerdNear(spawnCenter, herdSize);
          }
        }
      }
    }
  }

  public disposeAll(): void {
    for (const ram of this.rams) {
      ram.dispose();
    }
    this.rams = [];
  }
}
