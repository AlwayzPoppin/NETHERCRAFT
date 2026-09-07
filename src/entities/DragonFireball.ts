import * as THREE from 'three';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { BlockType } from '../textures/TextureGenerator';
import { disposeHierarchy } from '../utils/DisposeUtils';

export class DragonFireball {
  private scene: THREE.Scene;
  public mesh: THREE.Group;
  public light: THREE.PointLight;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  private gravity = 15.0; // Ballistic gravity drop-off in blocks/s²
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  
  public isDead = true;
  private life = 0;
  private maxLife = 5.0;
  private frameCount = 0;

  // Pre-allocated scratch vectors for zero-allocation 60 FPS update loop
  private scratchHeading: THREE.Vector3 = new THREE.Vector3();
  private scratchTravel: THREE.Vector3 = new THREE.Vector3();
  private scratchKnockback: THREE.Vector3 = new THREE.Vector3();

  // Static shared geometries & materials across all pooled fireball instances
  private static sharedOuterGeo: THREE.BoxGeometry = new THREE.BoxGeometry(2.6, 2.6, 2.6);
  private static sharedInnerGeo: THREE.BoxGeometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  private static sharedOuterMat: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: 0.9,
  });
  private static sharedInnerMat: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0xfffa65,
  });

  constructor(
    scene: THREE.Scene,
    particleManager: BlockParticleManager,
    sound: SoundManager
  ) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.sound = sound;

    // Create standalone world-space mesh container
    this.mesh = new THREE.Group();
    this.mesh.name = 'PooledDragonFireball';
    this.mesh.visible = false;
    
    // Outer fiery orange shell
    const outerMesh = new THREE.Mesh(DragonFireball.sharedOuterGeo, DragonFireball.sharedOuterMat);
    this.mesh.add(outerMesh);

    // Core bright yellow/white hot center
    const innerMesh = new THREE.Mesh(DragonFireball.sharedInnerGeo, DragonFireball.sharedInnerMat);
    this.mesh.add(innerMesh);

    // Dynamic PointLight attached to fireball
    this.light = new THREE.PointLight(0xff4500, 2.5, 18);
    this.light.visible = false;
    this.mesh.add(this.light);

    // Add to root scene once on allocation
    this.scene.add(this.mesh);
  }

  /**
   * Re-arms and launches this pooled fireball from spawnWorldPos toward targetWorldPos
   */
  public spawn(spawnWorldPos: THREE.Vector3, targetWorldPos: THREE.Vector3): void {
    this.isDead = false;
    this.life = 0;
    this.frameCount = 0;
    this.mesh.visible = true;
    this.light.visible = true;

    // Position mesh at launch point
    this.mesh.position.copy(spawnWorldPos);

    // Calculate independent linear world-space velocity with 1.0s ballistic flight time
    const flightTime = 1.0; 
    this.scratchTravel.subVectors(targetWorldPos, spawnWorldPos);
    
    const vx = this.scratchTravel.x / flightTime;
    const vz = this.scratchTravel.z / flightTime;
    const vy = (this.scratchTravel.y / flightTime) + (0.5 * this.gravity * flightTime);

    this.velocity.set(vx, vy, vz);

    // Align mesh heading with initial flight vector
    this.scratchHeading.copy(this.mesh.position).add(this.velocity);
    this.mesh.lookAt(this.scratchHeading);

    // Play launch sound
    try {
      if (typeof this.sound.playPop === 'function') {
        this.sound.playPop();
      }
    } catch (e) {}
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    if (this.isDead) return;

    const delta = Math.min(dt, 0.05);
    this.frameCount++;

    this.life += delta;
    if (this.life >= this.maxLife) {
      this.explode();
      return;
    }

    // Apply ballistic gravity drop-off to Y velocity
    this.velocity.y -= this.gravity * delta;

    // Independent linear translation in world space
    this.mesh.position.addScaledVector(this.velocity, delta);

    // Dynamically orient fireball along its downward parabolic arc
    this.scratchHeading.copy(this.mesh.position).add(this.velocity);
    this.mesh.lookAt(this.scratchHeading);

    // Rotate core for dynamic fire motion
    this.mesh.rotation.z += delta * 10;

    // Throttled smoke & ember trail (every 6th frame to maintain 60 FPS)
    if (this.frameCount % 6 === 0) {
      try {
        this.particleManager.spawnSmokePuff(this.mesh.position, true);
        this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.mesh.position, 1);
      } catch (e) {}
    }

    // Explode on terrain or player proximity
    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    if (distToPlayer < 3.5 || (this.mesh.position.y <= playerPos.y + 0.5)) {
      if (playerPhysics && typeof playerPhysics.takeDamage === 'function' && distToPlayer < 4.5) {
        this.scratchKnockback.subVectors(playerPos, this.mesh.position).normalize();
        const baseDmg = distToPlayer < 2.0 ? 9 : 5;
        playerPhysics.takeDamage(baseDmg, this.scratchKnockback);
      }
      this.explode();
    }
  }

  public explode(): void {
    if (this.isDead) return;
    this.isDead = true;

    // Massive explosion particle burst
    try {
      this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.mesh.position, 16);
      this.particleManager.spawnSmokePuff(this.mesh.position, true);
    } catch (e) {}

    try {
      if (typeof this.sound.playBlockBreak === 'function') {
        this.sound.playBlockBreak();
      }
    } catch (e) {}

    // Hide mesh and deactivate light to return cleanly to idle pool state
    this.mesh.visible = false;
    this.light.visible = false;
  }

  public dispose(): void {
    if (this.light) {
      this.light.dispose();
    }
    disposeHierarchy(this.mesh);
    this.scene.remove(this.mesh);
  }

  public static disposeSharedResources(): void {
    if (DragonFireball.sharedOuterGeo) {
      DragonFireball.sharedOuterGeo.dispose();
    }
    if (DragonFireball.sharedInnerGeo) {
      DragonFireball.sharedInnerGeo.dispose();
    }
    if (DragonFireball.sharedOuterMat) {
      DragonFireball.sharedOuterMat.dispose();
    }
    if (DragonFireball.sharedInnerMat) {
      DragonFireball.sharedInnerMat.dispose();
    }
  }
}
