import * as THREE from 'three';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { VoxelWorld } from '../world/VoxelWorld';
import { InputManager } from '../controls/InputManager';

export type CameraPerspectiveMode = 'FIRST_PERSON' | 'THIRD_PERSON_LOCKED' | 'THIRD_PERSON_ORBIT';

export class CameraRig {
  public mode: CameraPerspectiveMode = 'FIRST_PERSON';
  private camera: THREE.PerspectiveCamera;
  private player: PlayerPhysics;
  private world: VoxelWorld;
  private input: InputManager;

  // Third Person Rig Parameters
  public targetDistance: number = 3.8;
  public minDistance: number = 0.6;
  public maxDistance: number = 8.5;
  public heightOffset: number = 0.25;
  private currentDistance: number = 3.8;
  private lastTime: number = performance.now();
  private smoothedEyePos: THREE.Vector3;

  // Safety margin buffer against block walls
  public safetyMargin: number = 0.15;

  // Screen Shake System
  private shakeIntensity: number = 0;
  private shakeTimer: number = 0;
  private shakeDuration: number = 0;

  // Preallocated scratch objects to eliminate all per-frame GC allocations
  private scratchEuler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private backDir: THREE.Vector3 = new THREE.Vector3();
  private forwardDir: THREE.Vector3 = new THREE.Vector3();
  private rightDir: THREE.Vector3 = new THREE.Vector3();
  private upDir: THREE.Vector3 = new THREE.Vector3();
  private headCenter: THREE.Vector3 = new THREE.Vector3();
  private rayOriginHead: THREE.Vector3 = new THREE.Vector3();
  private rayOrigins: THREE.Vector3[] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  private testPos: THREE.Vector3 = new THREE.Vector3();
  private finalCamPos: THREE.Vector3 = new THREE.Vector3();
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  public triggerScreenShake(intensity: number = 0.3, duration: number = 0.4): void {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
    this.shakeDuration = duration;
  }

  constructor(
    camera: THREE.PerspectiveCamera,
    player: PlayerPhysics,
    world: VoxelWorld,
    input: InputManager
  ) {
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.input = input;
    this.smoothedEyePos = this.player.getCameraPosition().clone();

    // Tight near clipping plane so blocks close to camera lens never clip rendering
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
  }

  public isThirdPerson(): boolean {
    return this.mode !== 'FIRST_PERSON';
  }

  public isOrbitMode(): boolean {
    return this.mode === 'THIRD_PERSON_ORBIT';
  }

  public toggleMode(): CameraPerspectiveMode {
    const eyePos = this.player.getCameraPosition();
    if (this.mode === 'FIRST_PERSON') {
      this.mode = 'THIRD_PERSON_LOCKED';
      this.targetDistance = 2.8;
      this.currentDistance = 2.8;
    } else if (this.mode === 'THIRD_PERSON_LOCKED') {
      this.mode = 'THIRD_PERSON_ORBIT';
      this.targetDistance = 3.8;
      this.currentDistance = 3.8;
    } else {
      this.mode = 'FIRST_PERSON';
    }

    this.smoothedEyePos.copy(eyePos);
    return this.mode;
  }

  public adjustDistance(delta: number): void {
    if (this.mode === 'FIRST_PERSON') return;
    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance + delta));
  }

  public update(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const eyePos = this.player.getCameraPosition();

    if (this.mode === 'FIRST_PERSON') {
      if (this.camera.near !== 0.05) {
        this.camera.near = 0.05;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.copy(eyePos);
      this.scratchEuler.set(this.input.pitch, this.input.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this.scratchEuler);
      this.smoothedEyePos.copy(eyePos);
      return;
    }

    // Rapidly lerp the pivot position to smooth out 0.5m step-up pops
    this.smoothedEyePos.lerp(eyePos, Math.min(1.0, dt * 18.0));

    // --- THIRD PERSON (LOCKED & 360° ORBIT) CAMERA RIG ---
    this.scratchEuler.set(this.input.pitch, this.input.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.scratchEuler);

    // Camera local direction vectors (zero allocations via set + applyQuaternion)
    this.backDir.set(0, 0, 1).applyQuaternion(this.camera.quaternion);
    this.forwardDir.copy(this.backDir).negate();
    this.rightDir.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.upDir.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

    // Head center + height offset (using smoothed eye position for seamless tracking)
    this.headCenter.copy(this.smoothedEyePos);
    this.headCenter.y += this.heightOffset;

    this.rayOriginHead.copy(this.headCenter).addScaledVector(this.forwardDir, 0.10);

    // Multi-point camera frustum raycast offsets (center + 4 lens corners)
    const frustumMargin = 0.20;
    
    // [0] Center lens ray
    this.rayOrigins[0].copy(this.rayOriginHead);
    
    // [1] Top-Right corner ray (+right, +up)
    this.rayOrigins[1]
      .copy(this.rayOriginHead)
      .addScaledVector(this.rightDir, frustumMargin)
      .addScaledVector(this.upDir, frustumMargin);
      
    // [2] Top-Left corner ray (-right, +up)
    this.rayOrigins[2]
      .copy(this.rayOriginHead)
      .addScaledVector(this.rightDir, -frustumMargin)
      .addScaledVector(this.upDir, frustumMargin);
      
    // [3] Bottom-Right corner ray (+right, -up)
    this.rayOrigins[3]
      .copy(this.rayOriginHead)
      .addScaledVector(this.rightDir, frustumMargin)
      .addScaledVector(this.upDir, -frustumMargin);
      
    // [4] Bottom-Left corner ray (-right, -up)
    this.rayOrigins[4]
      .copy(this.rayOriginHead)
      .addScaledVector(this.rightDir, -frustumMargin)
      .addScaledVector(this.upDir, -frustumMargin);

    let safestHitDist = this.targetDistance;
    const coarseStep = 0.25; // High-efficiency 0.25m coarse step size
    const maxSteps = Math.ceil(this.targetDistance / coarseStep);

    for (let i = 1; i <= maxSteps; i++) {
      const testDist = Math.min(this.targetDistance, i * coarseStep);
      let isBlocked = false;

      // 1. Check center ray [0] first (fast path for 90% of open-world views)
      this.testPos.copy(this.rayOrigins[0]).addScaledVector(this.backDir, testDist);
      let bx = Math.floor(this.testPos.x);
      let by = Math.floor(this.testPos.y * 2.0);
      let bz = Math.floor(this.testPos.z);

      if (this.world.isSolidBlockAt(bx, by, bz)) {
        isBlocked = true;
      } else {
        // 2. Check 4 frustum corner rays for tight corners / obstacles
        for (let r = 1; r < 5; r++) {
          this.testPos.copy(this.rayOrigins[r]).addScaledVector(this.backDir, testDist);
          bx = Math.floor(this.testPos.x);
          by = Math.floor(this.testPos.y * 2.0);
          bz = Math.floor(this.testPos.z);

          if (this.world.isSolidBlockAt(bx, by, bz)) {
            isBlocked = true;
            break;
          }
        }
      }

      if (isBlocked) {
        // Fine refinement: 3-step binary search to pinpoint collision depth (< 3cm precision)
        let low = Math.max(0, testDist - coarseStep);
        let high = testDist;
        for (let refine = 0; refine < 3; refine++) {
          const mid = (low + high) * 0.5;
          let midBlocked = false;
          for (let r = 0; r < 5; r++) {
            this.testPos.copy(this.rayOrigins[r]).addScaledVector(this.backDir, mid);
            bx = Math.floor(this.testPos.x);
            by = Math.floor(this.testPos.y * 2.0);
            bz = Math.floor(this.testPos.z);
            if (this.world.isSolidBlockAt(bx, by, bz)) {
              midBlocked = true;
              break;
            }
          }
          if (midBlocked) {
            high = mid;
          } else {
            low = mid;
          }
        }
        safestHitDist = Math.max(this.minDistance, high - this.safetyMargin);
        break;
      }
    }

    if (safestHitDist < this.currentDistance) {
      this.currentDistance = safestHitDist;
    } else {
      this.currentDistance += (safestHitDist - this.currentDistance) * Math.min(1.0, dt * 14.0);
    }

    // Dynamically scale near clipping plane when camera is compressed against walls
    const targetNear = (this.currentDistance <= this.minDistance + 0.6)
      ? Math.max(0.01, Math.min(0.05, this.currentDistance * 0.035))
      : 0.05;
    if (Math.abs(this.camera.near - targetNear) > 0.002) {
      this.camera.near = targetNear;
      this.camera.updateProjectionMatrix();
    }

    this.finalCamPos.copy(this.rayOriginHead).addScaledVector(this.backDir, this.currentDistance);
    this.camera.position.copy(this.finalCamPos);

    // Apply procedural screen shake offset if active
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = Math.max(0, this.shakeTimer / Math.max(0.001, this.shakeDuration));
      const currentShake = this.shakeIntensity * progress;
      this.shakeOffset.set(
        (Math.random() - 0.5) * currentShake,
        (Math.random() - 0.5) * currentShake,
        (Math.random() - 0.5) * currentShake
      );
      this.camera.position.add(this.shakeOffset);
    }
  }
}
