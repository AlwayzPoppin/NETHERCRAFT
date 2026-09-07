import * as THREE from 'three';

/**
 * High-performance Zero-Allocation Frustum & Distance Culler for Animations and Entity Systems.
 *
 * Pre-computes the camera frustum and view matrices once per frame.
 * Entities query `shouldAnimate()` before evaluating expensive trigonometric skeletal
 * transforms, bone rotations, and Three.js hierarchy matrix updates.
 */
export class EntityCuller {
  private static instance: EntityCuller | null = null;

  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private scratchSphere: THREE.Sphere = new THREE.Sphere();
  private cameraPos: THREE.Vector3 = new THREE.Vector3();
  private isCameraInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): EntityCuller {
    if (!EntityCuller.instance) {
      EntityCuller.instance = new EntityCuller();
    }
    return EntityCuller.instance;
  }

  /**
   * Update the camera matrices & frustum planes.
   * Call once per frame at the beginning of the entity update phase.
   */
  public updateCamera(camera: THREE.Camera): void {
    // projScreenMatrix = projectionMatrix * matrixWorldInverse
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    camera.getWorldPosition(this.cameraPos);
    this.isCameraInitialized = true;
  }

  /**
   * Evaluates whether an entity's procedural skeletal animations should execute this frame.
   * Returns false if the entity is outside the camera frustum OR beyond max animation distance.
   *
   * @param worldPos - Entity's world position
   * @param radius - Bounding radius around the entity (default: 2.0m)
   * @param maxDistance - Max distance in blocks for full animation (default: 48.0m)
   */
  public shouldAnimate(worldPos: THREE.Vector3, radius: number = 2.0, maxDistance: number = 48.0): boolean {
    if (!this.isCameraInitialized) return true;

    // 1. Fast Distance Culling (Squared distance to avoid Math.sqrt)
    const distSq = this.cameraPos.distanceToSquared(worldPos);
    if (distSq > maxDistance * maxDistance) {
      return false;
    }

    // 2. Frustum Sphere Intersection Culling
    this.scratchSphere.center.set(worldPos.x, worldPos.y + radius * 0.5, worldPos.z);
    this.scratchSphere.radius = radius;
    return this.frustum.intersectsSphere(this.scratchSphere);
  }

  /**
   * Returns whether a bounding sphere at worldPos is within the camera frustum.
   */
  public isInFrustum(worldPos: THREE.Vector3, radius: number = 2.0): boolean {
    if (!this.isCameraInitialized) return true;
    this.scratchSphere.center.set(worldPos.x, worldPos.y + radius * 0.5, worldPos.z);
    this.scratchSphere.radius = radius;
    return this.frustum.intersectsSphere(this.scratchSphere);
  }

  /**
   * Returns the squared distance from the camera to the given world position.
   */
  public getDistanceSq(worldPos: THREE.Vector3): number {
    return this.cameraPos.distanceToSquared(worldPos);
  }
}
