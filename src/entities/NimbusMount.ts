import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { disposeHierarchy } from '../utils/DisposeUtils';

export class NimbusMount {
  private scene: THREE.Scene;
  private rootGroup: THREE.Group = new THREE.Group();
  private cloudModel: THREE.Object3D | null = null;
  private isLoaded: boolean = false;
  private isMounted: boolean = false;

  // Visual transitions & animation state
  public hoverBob: number = 0;
  public currentBankAngle: number = 0;
  public currentPitchAngle: number = 0;
  public readonly cloudStandingOffset: number = 0.12; // Center top surface offset above cloud origin

  private hoverTime: number = 0;
  private currentScale: number = 0;
  private readonly targetScale: number = 0.28; // Scaled down to ~1.7m wide personal mount size matching green guideline
  private lastYaw: number = 0;
  private trailSpawnTimer: number = 0;

  // Materials & Glow effect
  private cloudMaterials: THREE.MeshStandardMaterial[] = [];
  private loadPromise: Promise<void> | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rootGroup.name = 'NimbusMountRoot';
    this.rootGroup.visible = false;
    this.scene.add(this.rootGroup);
    // Lazy: Model loads strictly during the loading screen or upon summon
  }

  public async waitUntilReady(): Promise<void> {
    if (this.isLoaded) return;
    if (!this.loadPromise) {
      this.loadPromise = this.loadModel();
    }
    await this.loadPromise;
  }

  public async loadModel(): Promise<void> {
    if (this.isLoaded) return;
    const loader = new GLTFLoader();
    try {
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load('/MOUNTS/NIMBUS CLOUD.glb', resolve, undefined, reject);
      });

      const model = SkeletonUtils.clone(gltf.scene);

      // Compute bounding box and center origin
      const bbox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      model.position.sub(center); // Center the cloud model at local origin

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              if (m instanceof THREE.MeshStandardMaterial) {
                const cloned = m.clone();
                cloned.roughness = 0.65;
                cloned.metalness = 0.05;
                cloned.emissive = new THREE.Color(0xfef08a);
                cloned.emissiveIntensity = 0.18; // Soft warm celestial glow
                cloned.side = THREE.DoubleSide;
                cloned.needsUpdate = true;
                this.cloudMaterials.push(cloned);
              }
            });
          }
        }
      });

      this.cloudModel = model;
      this.rootGroup.add(model);
      this.isLoaded = true;
      console.log('☁️ Nimbus Cloud Mount loaded successfully!');
    } catch (err) {
      console.warn('Could not load Nimbus Cloud model:', err);
    }
  }

  public get isMountedActive(): boolean {
    return this.isMounted;
  }

  public summon(spawnPos: THREE.Vector3, initialYaw: number, particleManager?: BlockParticleManager): void {
    this.isMounted = true;
    this.rootGroup.visible = true;
    this.currentScale = 0.05; // Pop-in scaling
    this.hoverTime = 0;
    this.lastYaw = initialYaw;
    this.currentBankAngle = 0;
    this.currentPitchAngle = 0;

    this.rootGroup.position.copy(spawnPos).sub(new THREE.Vector3(0, 0.45, 0));
    this.rootGroup.rotation.set(0, initialYaw, 0);

    if (particleManager) {
      particleManager.spawnCloudPuff(this.rootGroup.position, 28, true);
    }
  }

  public dismount(particleManager?: BlockParticleManager): void {
    if (!this.isMounted) return;
    this.isMounted = false;

    if (particleManager) {
      particleManager.spawnCloudPuff(this.rootGroup.position, 24, false);
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    flightYaw: number,
    velocity: THREE.Vector3,
    isSprinting: boolean,
    particleManager?: BlockParticleManager
  ): void {
    const delta = Math.min(dt, 0.05);

    if (this.isMounted) {
      // Smoothly expand scale up to targetScale
      this.currentScale = THREE.MathUtils.lerp(this.currentScale, this.targetScale, delta * 12);
      this.rootGroup.visible = true;
    } else {
      // Smoothly shrink scale to 0 on dismount
      this.currentScale = THREE.MathUtils.lerp(this.currentScale, 0, delta * 14);
      if (this.currentScale < 0.02) {
        this.rootGroup.visible = false;
        return;
      }
    }

    this.hoverTime += delta;

    // 1. Hover Bobbing Kinematics (floating breathing motion)
    this.hoverBob = Math.sin(this.hoverTime * 3.2) * 0.045;
    const hoverWobble = Math.cos(this.hoverTime * 2.2) * 0.02;

    // Position cloud directly beneath the player's feet with surface contact alignment
    this.rootGroup.position.set(
      playerPos.x,
      playerPos.y - this.cloudStandingOffset + this.hoverBob,
      playerPos.z
    );

    this.rootGroup.scale.set(1.0, 1.0, 1.0);

    if (this.cloudModel) {
      this.cloudModel.scale.set(
        this.currentScale * (1.0 + hoverWobble * 0.3),
        this.currentScale * (1.0 - this.hoverBob * 0.4),
        this.currentScale * (1.0 + hoverWobble * 0.3)
      );
    }

    // 2. Turning Rate & Aerodynamic Bank Tilting
    let yawDiff = flightYaw - this.lastYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.lastYaw = flightYaw;

    const turnRate = yawDiff / Math.max(0.001, delta);
    const speedHoriz = Math.hypot(velocity.x, velocity.z);
    const targetBank = THREE.MathUtils.clamp(-turnRate * 0.22 * Math.min(speedHoriz / 5.0, 1.5), -0.45, 0.45);
    this.currentBankAngle = THREE.MathUtils.lerp(this.currentBankAngle, targetBank, delta * 8);

    // 3. Pitch Tilting (leaning forward when rushing forward, tilting up when climbing)
    const targetPitch = THREE.MathUtils.clamp(-velocity.y * 0.03 + (speedHoriz > 1.0 ? 0.08 : 0), -0.35, 0.35);
    this.currentPitchAngle = THREE.MathUtils.lerp(this.currentPitchAngle, targetPitch, delta * 8);

    // Combine orientations: Yaw -> Pitch -> Roll (Banking)
    const euler = new THREE.Euler(this.currentPitchAngle, flightYaw, this.currentBankAngle, 'YXZ');
    this.rootGroup.quaternion.setFromEuler(euler);

    // 4. Soft Trailing Cloud Vapor Particles
    if (this.isMounted && particleManager && speedHoriz > 0.5) {
      this.trailSpawnTimer += delta;
      const spawnInterval = isSprinting ? 0.04 : 0.09;
      if (this.trailSpawnTimer >= spawnInterval) {
        this.trailSpawnTimer = 0;

        // Position trail just at the rear base of the cloud
        const fwd = new THREE.Vector3(-Math.sin(flightYaw), 0, -Math.cos(flightYaw));
        const trailPos = this.rootGroup.position.clone().addScaledVector(fwd, -0.6);
        trailPos.y -= 0.1;

        particleManager.spawnNimbusTrail(trailPos, fwd.clone().negate(), isSprinting);
      }
    }
  }

  public getRootGroup(): THREE.Group {
    return this.rootGroup;
  }

  public dispose(): void {
    disposeHierarchy(this.rootGroup);
    this.scene.remove(this.rootGroup);
    this.cloudMaterials = [];
  }
}
