import * as THREE from 'three';
import { TerrainNoise } from '../world/Noise';

export class CloudRenderer {
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh;
  private noise: TerrainNoise;

  // Cloud Grid & Dimension Configuration (Grand Seamless Voxel Slabs)
  private readonly voxelSize = 18.0;
  private readonly gridRadius = 18; // 37x37 grid = 1369 instances (666m sky coverage)
  private readonly gridDim: number;
  private readonly maxInstances: number;
  private readonly cloudBaseHeight = 140.0;

  // Wind Kinematics (Continuous smooth drifting)
  private windSpeedX = 2.0; // m/s
  private windSpeedZ = 3.6; // m/s
  private windOffsetX = 0.0;
  private windOffsetZ = 0.0;

  // Player Tracking & Toroidal Wrap State (Time-Sliced Rebuild)
  private lastGridX = NaN;
  private lastGridZ = NaN;
  private targetGridX = 0;
  private targetGridZ = 0;
  private currentGridX = 0;
  private currentGridZ = 0;
  private buildRow = 0;
  private isRebuilding = false;
  private readonly rowsPerFrame = 10; // ~370 cells per frame (spread across 4 frames)

  // Preallocated Instance Data Caches (Zero-GC Allocation)
  private cellActive: Uint8Array;
  private cellHeight: Float32Array;

  // Dynamic Lighting & Color Gradients
  private cloudColorDay = new THREE.Color(0xffffff);
  private cloudColorSunset = new THREE.Color(0xfda4af);
  private cloudColorNight = new THREE.Color(0x1e293b);
  private cloudColorAshen = new THREE.Color(0x451219);

  private material: THREE.MeshLambertMaterial;
  private static cloudUniforms = {
    uCloudOpacity: { value: 1.0 },
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.noise = new TerrainNoise(2048);

    this.gridDim = this.gridRadius * 2 + 1;
    this.maxInstances = this.gridDim * this.gridDim;

    this.cellActive = new Uint8Array(this.maxInstances);
    this.cellHeight = new Float32Array(this.maxInstances);

    // Unit Box Geometry with bottom anchor at y = 0 for flat cumulus underside
    const geometry = new THREE.BoxGeometry(this.voxelSize, 1.0, this.voxelSize);
    geometry.translate(0, 0.5, 0); // Anchor origin to base of box

    this.material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: false,
      depthWrite: true,
      fog: false,
    });

    // Screen-door dithering for smooth underground fading without see-through glass/ice seams
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uCloudOpacity = CloudRenderer.cloudUniforms.uCloudOpacity;
      shader.fragmentShader = `
        uniform float uCloudOpacity;
        ${shader.fragmentShader}
      `;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        if (uCloudOpacity < 0.999) {
          int dX = int(mod(gl_FragCoord.x, 4.0));
          int dY = int(mod(gl_FragCoord.y, 4.0));
          float dThresh = 0.0;
          if (dX == 0) {
            if (dY == 0) dThresh = 0.0625;
            else if (dY == 1) dThresh = 0.8125;
            else if (dY == 2) dThresh = 0.25;
            else dThresh = 1.0;
          } else if (dX == 1) {
            if (dY == 0) dThresh = 0.5625;
            else if (dY == 1) dThresh = 0.3125;
            else if (dY == 2) dThresh = 0.75;
            else dThresh = 0.50;
          } else if (dX == 2) {
            if (dY == 0) dThresh = 0.1875;
            else if (dY == 1) dThresh = 0.9375;
            else if (dY == 2) dThresh = 0.125;
            else dThresh = 0.875;
          } else {
            if (dY == 0) dThresh = 0.6875;
            else if (dY == 1) dThresh = 0.4375;
            else if (dY == 2) dThresh = 0.625;
            else dThresh = 0.375;
          }
          if (dThresh > uCloudOpacity) {
            discard;
          }
        }
        `
      );
    };

    this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, this.maxInstances);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.castShadow = false;
    this.instancedMesh.receiveShadow = false;
    this.instancedMesh.renderOrder = -50;

    // Initialize all instance matrices off-screen
    const matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.maxInstances; i++) {
      const offset = i * 16;
      matrixArray[offset + 0] = 0; matrixArray[offset + 4] = 0; matrixArray[offset + 8] = 0; matrixArray[offset + 12] = 0;
      matrixArray[offset + 1] = 0; matrixArray[offset + 5] = 0; matrixArray[offset + 9] = 0; matrixArray[offset + 13] = -9999;
      matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0; matrixArray[offset + 10] = 0; matrixArray[offset + 14] = 0;
      matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0; matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;
      this.cellActive[i] = 0;
    }
    this.instancedMesh.count = this.maxInstances;
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.instancedMesh);
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    smoothAshen: number,
    sunHeight: number = 0.5,
    undergroundFactor: number = 0.0
  ): void {
    // 1. Continuous Sub-Millimeter Wind Translation
    this.windOffsetX += this.windSpeedX * dt;
    this.windOffsetZ += this.windSpeedZ * dt;

    // 2. Dynamic Color Modulation based on Sun Position, Sunset, Night, and Biome
    const activeColor = new THREE.Color();
    if (sunHeight > 0.2) {
      activeColor.copy(this.cloudColorDay);
    } else if (sunHeight > -0.1) {
      const t = (sunHeight + 0.1) / 0.3;
      activeColor.copy(this.cloudColorDay).lerp(this.cloudColorSunset, 1 - t);
    } else {
      activeColor.copy(this.cloudColorNight);
    }

    // Blend in Ashen Ruins dark smoky crimson
    activeColor.lerp(this.cloudColorAshen, smoothAshen);
    this.material.color.copy(activeColor);

    // Fade cloud opacity when underground
    const surfaceFactor = Math.max(0, 1.0 - undergroundFactor);
    CloudRenderer.cloudUniforms.uCloudOpacity.value = surfaceFactor;
    this.instancedMesh.visible = surfaceFactor > 0.02;

    if (!this.instancedMesh.visible) return;

    // 3. Toroidal Discrete Grid Tracking centered around Player
    const gridCenterCoordX = Math.floor((playerPos.x - this.windOffsetX) / this.voxelSize);
    const gridCenterCoordZ = Math.floor((playerPos.z - this.windOffsetZ) / this.voxelSize);

    if (isNaN(this.lastGridX)) {
      this.lastGridX = gridCenterCoordX;
      this.lastGridZ = gridCenterCoordZ;
      this.targetGridX = gridCenterCoordX;
      this.targetGridZ = gridCenterCoordZ;
      this.currentGridX = gridCenterCoordX;
      this.currentGridZ = gridCenterCoordZ;
      this.rebuildGridFull(gridCenterCoordX, gridCenterCoordZ);
    } else if (gridCenterCoordX !== this.targetGridX || gridCenterCoordZ !== this.targetGridZ) {
      this.targetGridX = gridCenterCoordX;
      this.targetGridZ = gridCenterCoordZ;
      this.buildRow = -this.gridRadius;
      this.isRebuilding = true;
    }

    if (this.isRebuilding) {
      this.stepRebuild();
    }

    // 4. Smooth continuous mesh offset for silky continuous glide
    this.instancedMesh.position.set(
      this.currentGridX * this.voxelSize + this.windOffsetX,
      0,
      this.currentGridZ * this.voxelSize + this.windOffsetZ
    );
  }

  /** Time-sliced incremental grid rebuild: processes up to rowsPerFrame rows each frame. */
  private stepRebuild(): void {
    const matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;
    const endRow = Math.min(this.gridRadius, this.buildRow + this.rowsPerFrame - 1);

    for (let gx = this.buildRow; gx <= endRow; gx++) {
      for (let gz = -this.gridRadius; gz <= this.gridRadius; gz++) {
        const idx = (gx + this.gridRadius) * this.gridDim + (gz + this.gridRadius);
        const cellX = this.targetGridX + gx;
        const cellZ = this.targetGridZ + gz;

        // FBM multi-octave noise for expansive cumulus cloud formations
        const n1 = this.noise.octaveNoise2D(cellX * 0.035, cellZ * 0.035, 2, 0.5, 1.0);
        const n2 = this.noise.octaveNoise2D(cellX * 0.07 + 50, cellZ * 0.07 + 50, 1, 0.5, 1.0) * 0.35;
        const cloudDensity = n1 + n2;

        const isActive = cloudDensity > 0.12;

        if (isActive) {
          // Discrete stepped cumulus tiers (6m edge, 12m mid, 18m core peak)
          let slabHeight = 6.0;
          if (cloudDensity > 0.32) {
            slabHeight = 18.0;
          } else if (cloudDensity > 0.20) {
            slabHeight = 12.0;
          }

          const localX = gx * this.voxelSize;
          const localY = this.cloudBaseHeight;
          const localZ = gz * this.voxelSize;

          const offset = idx * 16;
          // Scale Y by slabHeight (bottom stays flat at y = localY)
          matrixArray[offset + 0] = 1; matrixArray[offset + 4] = 0;          matrixArray[offset + 8] = 0;  matrixArray[offset + 12] = localX;
          matrixArray[offset + 1] = 0; matrixArray[offset + 5] = slabHeight; matrixArray[offset + 9] = 0;  matrixArray[offset + 13] = localY;
          matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0;          matrixArray[offset + 10] = 1; matrixArray[offset + 14] = localZ;
          matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0;          matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;
          this.cellActive[idx] = 1;
        } else {
          if (this.cellActive[idx] !== 0) {
            const offset = idx * 16;
            matrixArray[offset + 0] = 0; matrixArray[offset + 4] = 0; matrixArray[offset + 8] = 0; matrixArray[offset + 12] = 0;
            matrixArray[offset + 1] = 0; matrixArray[offset + 5] = 0; matrixArray[offset + 9] = 0; matrixArray[offset + 13] = -9999;
            matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0; matrixArray[offset + 10] = 0; matrixArray[offset + 14] = 0;
            matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0; matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;
            this.cellActive[idx] = 0;
          }
        }
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;

    if (endRow >= this.gridRadius) {
      this.isRebuilding = false;
      this.currentGridX = this.targetGridX;
      this.currentGridZ = this.targetGridZ;
      this.lastGridX = this.targetGridX;
      this.lastGridZ = this.targetGridZ;
    } else {
      this.buildRow = endRow + 1;
    }
  }

  /** Full grid build for initial spawn */
  private rebuildGridFull(centerGridX: number, centerGridZ: number): void {
    const matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;

    for (let gx = -this.gridRadius; gx <= this.gridRadius; gx++) {
      for (let gz = -this.gridRadius; gz <= this.gridRadius; gz++) {
        const idx = (gx + this.gridRadius) * this.gridDim + (gz + this.gridRadius);
        const cellX = centerGridX + gx;
        const cellZ = centerGridZ + gz;

        const n1 = this.noise.octaveNoise2D(cellX * 0.035, cellZ * 0.035, 2, 0.5, 1.0);
        const n2 = this.noise.octaveNoise2D(cellX * 0.07 + 50, cellZ * 0.07 + 50, 1, 0.5, 1.0) * 0.35;
        const cloudDensity = n1 + n2;

        const isActive = cloudDensity > 0.12;

        if (isActive) {
          let slabHeight = 6.0;
          if (cloudDensity > 0.32) {
            slabHeight = 18.0;
          } else if (cloudDensity > 0.20) {
            slabHeight = 12.0;
          }

          const localX = gx * this.voxelSize;
          const localY = this.cloudBaseHeight;
          const localZ = gz * this.voxelSize;

          const offset = idx * 16;
          matrixArray[offset + 0] = 1; matrixArray[offset + 4] = 0;          matrixArray[offset + 8] = 0;  matrixArray[offset + 12] = localX;
          matrixArray[offset + 1] = 0; matrixArray[offset + 5] = slabHeight; matrixArray[offset + 9] = 0;  matrixArray[offset + 13] = localY;
          matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0;          matrixArray[offset + 10] = 1; matrixArray[offset + 14] = localZ;
          matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0;          matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;
          this.cellActive[idx] = 1;
        } else {
          const offset = idx * 16;
          matrixArray[offset + 0] = 0; matrixArray[offset + 4] = 0; matrixArray[offset + 8] = 0; matrixArray[offset + 12] = 0;
          matrixArray[offset + 1] = 0; matrixArray[offset + 5] = 0; matrixArray[offset + 9] = 0; matrixArray[offset + 13] = -9999;
          matrixArray[offset + 2] = 0; matrixArray[offset + 6] = 0; matrixArray[offset + 10] = 0; matrixArray[offset + 14] = 0;
          matrixArray[offset + 3] = 0; matrixArray[offset + 7] = 0; matrixArray[offset + 11] = 0; matrixArray[offset + 15] = 1;
          this.cellActive[idx] = 0;
        }
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.isRebuilding = false;
  }

  public dispose(): void {
    this.instancedMesh.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.instancedMesh);
  }
}
