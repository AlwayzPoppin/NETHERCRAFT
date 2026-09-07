import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS, isPlaceableBlock } from '../textures/TextureGenerator';
import { ModelCache } from '../utils/ModelCache';

export class PlacementPreviewManager {
  private scene: THREE.Scene;
  private previewGroup: THREE.Group;
  private currentType: BlockType | null = null;
  private activeModel: THREE.Object3D | null = null;
  private boxMesh: THREE.Mesh | null = null;
  private wireframeBox: THREE.LineSegments | null = null;

  // Translucent holographic materials
  private validMaterial: THREE.MeshStandardMaterial;
  private invalidMaterial: THREE.MeshStandardMaterial;
  private validLineMat: THREE.LineBasicMaterial;
  private invalidLineMat: THREE.LineBasicMaterial;

  // Step rotation offset (0, 1, 2, 3 in 90-degree increments)
  private rotationStep: number = 0;

  // Smooth position interpolation to eliminate rigid voxel snap jitter
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private isFirstPlacementFrame: boolean = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'PlacementHologramPreview';
    this.previewGroup.visible = false;
    this.scene.add(this.previewGroup);

    // Glowing cyan/emerald translucent material for valid placement
    this.validMaterial = new THREE.MeshStandardMaterial({
      color: 0x22eeaa,
      emissive: 0x117755,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.60,
      roughness: 0.3,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Crimson red translucent material for invalid/blocked placement
    this.invalidMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0x880011,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.60,
      roughness: 0.3,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.validLineMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });

    this.invalidLineMat = new THREE.LineBasicMaterial({
      color: 0xff1144,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });

    this.initDefaultBoxPreview();
  }

  private createMicrovoxelGridGeometry(w: number, h: number, d: number, subdivisions: number = 4): THREE.BufferGeometry {
    const points: number[] = [];
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;

    const dx = w / subdivisions;
    const dy = h / subdivisions;
    const dz = d / subdivisions;

    // 1. Twelve primary outer bounding edges
    // Bottom rectangle
    points.push(-hx, -hy, -hz,  hx, -hy, -hz);
    points.push( hx, -hy, -hz,  hx, -hy,  hz);
    points.push( hx, -hy,  hz, -hx, -hy,  hz);
    points.push(-hx, -hy,  hz, -hx, -hy, -hz);

    // Top rectangle
    points.push(-hx,  hy, -hz,  hx,  hy, -hz);
    points.push( hx,  hy, -hz,  hx,  hy,  hz);
    points.push( hx,  hy,  hz, -hx,  hy,  hz);
    points.push(-hx,  hy,  hz, -hx,  hy, -hz);

    // Vertical pillars
    points.push(-hx, -hy, -hz, -hx,  hy, -hz);
    points.push( hx, -hy, -hz,  hx,  hy, -hz);
    points.push( hx, -hy,  hz,  hx,  hy,  hz);
    points.push(-hx, -hy,  hz, -hx,  hy,  hz);

    // 2. Microvoxel Sub-grid Gridlines on all 6 faces
    // Top & Bottom faces
    for (let i = 1; i < subdivisions; i++) {
      const x = -hx + i * dx;
      const z = -hz + i * dz;
      // Top face
      points.push(x,  hy, -hz,  x,  hy,  hz);
      points.push(-hx,  hy, z,  hx,  hy, z);
      // Bottom face
      points.push(x, -hy, -hz,  x, -hy,  hz);
      points.push(-hx, -hy, z,  hx, -hy, z);
    }

    // Front & Back faces (Z = ±hz)
    for (let i = 1; i < subdivisions; i++) {
      const x = -hx + i * dx;
      const y = -hy + i * dy;
      // Front face (+hz)
      points.push(x, -hy,  hz,  x,  hy,  hz);
      points.push(-hx, y,  hz,  hx, y,  hz);
      // Back face (-hz)
      points.push(x, -hy, -hz,  x,  hy, -hz);
      points.push(-hx, y, -hz,  hx, y, -hz);
    }

    // Left & Right faces (X = ±hx)
    for (let i = 1; i < subdivisions; i++) {
      const z = -hz + i * dz;
      const y = -hy + i * dy;
      // Right face (+hx)
      points.push( hx, -hy, z,  hx,  hy, z);
      points.push( hx, y, -hz,  hx, y,  hz);
      // Left face (-hx)
      points.push(-hx, -hy, z, -hx,  hy, z);
      points.push(-hx, y, -hz, -hx, y,  hz);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }

  private initDefaultBoxPreview(): void {
    const geo = new THREE.BoxGeometry(1.002, 0.502, 1.002);
    this.boxMesh = new THREE.Mesh(geo, this.validMaterial);
    this.boxMesh.position.set(0, 0.25, 0);

    const microvoxelGridGeo = this.createMicrovoxelGridGeometry(1.002, 0.502, 1.002, 4);
    this.wireframeBox = new THREE.LineSegments(microvoxelGridGeo, this.validLineMat);
    this.wireframeBox.position.set(0, 0.25, 0);

    this.previewGroup.add(this.boxMesh);
    this.previewGroup.add(this.wireframeBox);
  }

  public rotateClockwise(): number {
    this.rotationStep = (this.rotationStep + 1) % 4;
    return this.rotationStep;
  }

  public getRotationAngle(playerYaw: number = 0): number {
    // Snap player yaw to nearest 90-degree quadrant, then add user rotation steps
    // Facing player: playerYaw + PI
    const cardinalIndex = Math.round(playerYaw / (Math.PI / 2)) % 4;
    return (cardinalIndex + this.rotationStep) * (Math.PI / 2);
  }

  public update(
    selectedType: BlockType | null,
    placePos: { x: number; y: number; z: number } | null,
    isValid: boolean,
    playerYaw: number,
    faceNormal?: THREE.Vector3,
    dt: number = 0.016
  ): void {
    if (
      selectedType === null ||
      !placePos ||
      !isPlaceableBlock(selectedType)
    ) {
      this.hide();
      return;
    }

    this.targetPosition.set(placePos.x + 0.5, placePos.y * 0.5, placePos.z + 0.5);

    // If appearing for the first time or snapping across a distant leap (> 4 blocks), snap immediately
    if (!this.previewGroup.visible || this.isFirstPlacementFrame || this.currentPosition.distanceTo(this.targetPosition) > 4.0) {
      this.currentPosition.copy(this.targetPosition);
      this.isFirstPlacementFrame = false;
    } else {
      // Visually smooth transit between adjacent grid cells (~0.35s responsive damping)
      const lerpFactor = 1.0 - Math.exp(-18.0 * Math.min(dt, 0.1));
      this.currentPosition.lerp(this.targetPosition, lerpFactor);
    }

    this.previewGroup.visible = true;
    this.previewGroup.position.copy(this.currentPosition);

    const rotAngle = this.getRotationAngle(playerYaw);
    this.previewGroup.rotation.y = rotAngle;

    const activeMat = isValid ? this.validMaterial : this.invalidMaterial;
    const activeLineMat = isValid ? this.validLineMat : this.invalidLineMat;

    if (this.wireframeBox) {
      this.wireframeBox.material = activeLineMat;
      this.wireframeBox.visible = selectedType !== BlockType.TORCH;
    }

    if (selectedType === BlockType.TORCH) {
      if (this.boxMesh) this.boxMesh.visible = false;
      this.previewGroup.rotation.y = 0;
      this.ensureTorchModel(faceNormal || new THREE.Vector3(0, 1, 0), activeMat);
      if (this.activeModel) this.activeModel.visible = true;
    } else if (selectedType === BlockType.WORKBENCH) {
      if (this.boxMesh) this.boxMesh.visible = false;
      this.ensureWorkstationModel(selectedType, activeMat);
      if (this.activeModel) this.activeModel.visible = true;
    } else {
      if (this.activeModel) this.activeModel.visible = false;
      if (this.boxMesh) {
        this.boxMesh.visible = true;
        this.boxMesh.material = activeMat;
      }
    }
  }

  private ensureTorchModel(faceNormal: THREE.Vector3, hologramMat: THREE.Material): void {
    if (this.currentType === BlockType.TORCH && this.activeModel) {
      this.applyHologramMaterial(this.activeModel, hologramMat);
      this.orientTorchPreview(this.activeModel, faceNormal);
      return;
    }

    if (this.activeModel) {
      this.previewGroup.remove(this.activeModel);
      this.activeModel = null;
    }

    const rawModel = ModelCache.getClone('/TOOLS-WEAPONS/TORCH.glb');
    if (!rawModel) return;

    const group = new THREE.Group();
    const bbox = new THREE.Box3().setFromObject(rawModel);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const targetHeight = 0.46;
    const targetScale = targetHeight / (size.y || 1);

    rawModel.scale.set(targetScale, targetScale, targetScale);
    rawModel.position.set(
      -center.x * targetScale,
      -bbox.min.y * targetScale,
      -center.z * targetScale
    );

    this.applyHologramMaterial(rawModel, hologramMat);
    group.add(rawModel);

    this.orientTorchPreview(group, faceNormal);

    this.activeModel = group;
    this.currentType = BlockType.TORCH;
    this.previewGroup.add(group);
  }

  private orientTorchPreview(group: THREE.Object3D, faceNormal: THREE.Vector3): void {
    if (faceNormal.x > 0.5) {
      group.position.set(-0.42, 0.08, 0);
      group.rotation.set(0, 0, -0.32);
    } else if (faceNormal.x < -0.5) {
      group.position.set(0.42, 0.08, 0);
      group.rotation.set(0, 0, 0.32);
    } else if (faceNormal.z > 0.5) {
      group.position.set(0, 0.08, -0.42);
      group.rotation.set(0.32, 0, 0);
    } else if (faceNormal.z < -0.5) {
      group.position.set(0, 0.08, 0.42);
      group.rotation.set(-0.32, 0, 0);
    } else {
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
    }
  }

  private ensureWorkstationModel(type: BlockType, hologramMat: THREE.Material): void {
    if (this.currentType === type && this.activeModel) {
      this.applyHologramMaterial(this.activeModel, hologramMat);
      return;
    }

    if (this.activeModel) {
      this.previewGroup.remove(this.activeModel);
      this.activeModel = null;
    }

    const rawModel = ModelCache.getClone('/TOOLS-WEAPONS/CRAFTING TABLE.glb');
    if (!rawModel) return;

    const group = new THREE.Group();
    const bbox = new THREE.Box3().setFromObject(rawModel);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const maxHorizDim = Math.max(size.x, size.z) || 1;
    const targetScale = 0.88 / maxHorizDim;

    rawModel.scale.set(targetScale, targetScale, targetScale);
    rawModel.position.set(
      -center.x * targetScale,
      -bbox.min.y * targetScale,
      -center.z * targetScale
    );

    this.applyHologramMaterial(rawModel, hologramMat);
    group.add(rawModel);

    this.activeModel = group;
    this.currentType = type;
    this.previewGroup.add(group);
  }

  private applyHologramMaterial(obj: THREE.Object3D, mat: THREE.Material): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = mat;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }

  public hide(): void {
    this.previewGroup.visible = false;
    this.isFirstPlacementFrame = true;
  }
}
