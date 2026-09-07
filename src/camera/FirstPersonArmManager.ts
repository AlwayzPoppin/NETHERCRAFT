import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameSettings } from '../settings/SettingsManager';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';

export class FirstPersonArmManager {
  public root: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private itemManager: ItemManager;

  private whiteArmModel: THREE.Object3D | null = null;
  private blackArmModel: THREE.Object3D | null = null;
  private activeArm: THREE.Object3D | null = null;
  private whiteMaterials: THREE.MeshStandardMaterial[] = [];
  private blackMaterials: THREE.MeshStandardMaterial[] = [];

  // Sockets & Held Items
  public heldItemSocket: THREE.Group;
  public heldItemMesh: THREE.Object3D | null = null;
  private currentHeldType: BlockType | null = null;

  // Animation & Transform Dynamics
  private handBobTime = 0;
  private currentEthnicity: 'white' | 'black' = 'white';

  // Base Offsets in Camera Space (Bottom-Right Viewport)
  private readonly BASE_POS = new THREE.Vector3(0.38, -0.44, -0.48);
  private readonly BASE_ROT = new THREE.Euler(0.04, -0.04, 0.02);

  constructor(camera: THREE.PerspectiveCamera, itemManager: ItemManager) {
    this.camera = camera;
    this.itemManager = itemManager;

    this.root = new THREE.Group();
    this.root.position.copy(this.BASE_POS);
    this.root.rotation.copy(this.BASE_ROT);

    this.heldItemSocket = new THREE.Group();
    this.heldItemSocket.position.set(0.02, 0.08, -0.22);
    this.heldItemSocket.rotation.set(-0.25, 0.45, -0.12);
    this.root.add(this.heldItemSocket);

    this.camera.add(this.root);
    // Lazy: First-person arm models load strictly during the loading screen
  }

  private isLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  public async waitUntilReady(): Promise<void> {
    if (this.isLoaded) return;
    if (!this.loadPromise) {
      this.loadPromise = this.preloadArmModels();
    }
    await this.loadPromise;
  }

  private async preloadArmModels(): Promise<void> {
    if (this.isLoaded) return;
    const loader = new GLTFLoader();

    const loadWhite = new Promise<void>((resolve) => {
      loader.load(
        '/AVATAR/WHITE HUMAN ARM (FIRST PERSON VIEW).glb',
        (gltf) => {
          this.whiteArmModel = this.setupArmModel(gltf.scene, 'white');
          if (this.currentEthnicity === 'white' && (!this.activeArm || this.activeArm === this.whiteArmModel)) {
            this.setActiveArm(this.whiteArmModel);
          }
          resolve();
        },
        undefined,
        (err) => {
          console.warn('Could not load White Human FP Arm:', err);
          resolve();
        }
      );
    });

    const loadBlack = new Promise<void>((resolve) => {
      loader.load(
        '/AVATAR/BLACK HUMAN ARM (FIRST PERSON VIEW).glb',
        (gltf) => {
          this.blackArmModel = this.setupArmModel(gltf.scene, 'black');
          if (this.currentEthnicity === 'black' && (!this.activeArm || this.activeArm === this.blackArmModel)) {
            this.setActiveArm(this.blackArmModel);
          }
          resolve();
        },
        undefined,
        (err) => {
          console.warn('Could not load Black Human FP Arm:', err);
          resolve();
        }
      );
    });

    await Promise.all([loadWhite, loadBlack]);
  }

  private setupArmModel(model: THREE.Object3D, ethnicity: 'white' | 'black'): THREE.Group {
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false; // Prevent shadow self-occlusion in FP view
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        if (mesh.material) {
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          mat.roughness = 0.68;
          mat.metalness = 0.08;
          // Prevent emissive textures from glowing in the dark
          if (mat.emissive) {
            mat.emissive.setRGB(0, 0, 0);
          }
          mat.emissiveIntensity = 0.0;
          mat.emissiveMap = null;
          mat.needsUpdate = true;

          if (ethnicity === 'white') {
            this.whiteMaterials.push(mat);
          } else {
            this.blackMaterials.push(mat);
          }
        }
      }
    });

    // Compute bounding box to normalize scale and center hand/forearm
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Center model at 0,0,0
    model.position.set(-center.x, -center.y, -center.z);

    // Create wrapper pivot group
    const wrapper = new THREE.Group();
    wrapper.add(model);

    // Scale so forearm & hand length is sleek and natural in FP viewport (~0.36m)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.001) {
      const targetLength = 0.36;
      const normalizedScale = targetLength / maxDim;
      wrapper.scale.set(normalizedScale, normalizedScale, normalizedScale);
    }

    // Rotate so fingers (+X) point forward (-Z) and forearm tilts upward into bottom-right view
    wrapper.rotation.set(0.32, Math.PI / 2 - 0.28, -0.12);

    wrapper.visible = false;
    this.root.add(wrapper);
    return wrapper;
  }

  private setActiveArm(armModel: THREE.Object3D | null): void {
    if (this.whiteArmModel) this.whiteArmModel.visible = false;
    if (this.blackArmModel) this.blackArmModel.visible = false;

    this.activeArm = armModel;
    if (this.activeArm) {
      this.activeArm.visible = true;
    }
  }

  public syncWithSettings(settings: GameSettings): void {
    if (!settings) return;

    const race = settings.race || 'human';
    const ethnicity = settings.ethnicity || 'white';
    this.currentEthnicity = ethnicity;

    if (race === 'ogre') {
      // Apply Ashy Stone-Grey / Moss Skin Tone Tint (#8e968b) to match Ogre appearance
      const ogreSkinTint = new THREE.Color(0x8e968b);
      this.whiteMaterials.forEach((mat) => {
        mat.color.copy(ogreSkinTint);
      });
      if (this.whiteArmModel) {
        this.setActiveArm(this.whiteArmModel);
      }
    } else if (race === 'reptilian') {
      // Apply Reptilian Green Skin Tone Tint (#54784a)
      const repSkinTint = new THREE.Color(0x54784a);
      this.whiteMaterials.forEach((mat) => {
        mat.color.copy(repSkinTint);
      });
      if (this.whiteArmModel) {
        this.setActiveArm(this.whiteArmModel);
      }
    } else {
      // Standard Human Race: Reset tints to pure un-tinted texture (0xffffff)
      this.whiteMaterials.forEach((mat) => {
        mat.color.set(0xffffff);
      });
      this.blackMaterials.forEach((mat) => {
        mat.color.set(0xffffff);
      });

      if (ethnicity === 'black') {
        if (this.blackArmModel) {
          this.setActiveArm(this.blackArmModel);
        }
      } else {
        if (this.whiteArmModel) {
          this.setActiveArm(this.whiteArmModel);
        }
      }
    }
  }

  public syncHeldItem(selectedType: BlockType | null): void {
    if (selectedType === this.currentHeldType) return;
    this.currentHeldType = selectedType;

    // Clear previous held item
    if (this.heldItemMesh) {
      this.heldItemSocket.remove(this.heldItemMesh);
      this.heldItemMesh = null;
    }

    // Spawn new mini-block / tool mesh in hand
    if (selectedType !== null && this.itemManager) {
      this.heldItemMesh = this.itemManager.createMiniBlockMesh(selectedType);
      
      if (selectedType === BlockType.FLIMSY_AXE) {
        this.heldItemMesh.position.set(0.04, -0.02, -0.14);
        this.heldItemMesh.rotation.set(-0.28, 0.52, -0.22);
        this.heldItemMesh.scale.set(0.42, 0.42, 0.42);
      } else if (selectedType === BlockType.FLIMSY_PICKAXE) {
        this.heldItemMesh.position.set(0.04, -0.02, -0.14);
        this.heldItemMesh.rotation.set(-0.28, 0.52, -0.22);
        this.heldItemMesh.scale.set(0.40, 0.40, 0.40);
      } else if (selectedType === BlockType.TORCH) {
        this.heldItemMesh.position.set(0.03, 0.02, -0.16);
        this.heldItemMesh.rotation.set(-0.18, 0.35, -0.12);
        this.heldItemMesh.scale.set(0.95, 0.95, 0.95);
      } else if (selectedType === BlockType.WORKBENCH) {
        this.heldItemMesh.position.set(0.04, -0.05, -0.15);
        this.heldItemMesh.rotation.set(-0.25, 0.45, -0.15);
        this.heldItemMesh.scale.set(0.10, 0.10, 0.10);
      } else if (selectedType === BlockType.STONE_PEBBLE || selectedType === BlockType.FLINT) {
        // Palm-sized loose rock / flint pebble neatly held in hand
        this.heldItemMesh.position.set(0.04, -0.04, -0.14);
        this.heldItemMesh.rotation.set(-0.20, 0.40, -0.10);
        this.heldItemMesh.scale.set(0.12, 0.12, 0.12);
      } else if (selectedType === BlockType.BRANCHES || selectedType === BlockType.REEDS) {
        // Natural twig / stalk bundle held in grip
        this.heldItemMesh.position.set(0.04, -0.03, -0.14);
        this.heldItemMesh.rotation.set(-0.25, 0.45, -0.15);
        this.heldItemMesh.scale.set(0.16, 0.16, 0.16);
      } else if (selectedType === BlockType.APPLES || selectedType === BlockType.CARROT) {
        // Foraged food items
        this.heldItemMesh.position.set(0.04, -0.04, -0.14);
        this.heldItemMesh.rotation.set(-0.15, 0.35, -0.10);
        this.heldItemMesh.scale.set(0.14, 0.14, 0.14);
      } else if (this.itemManager.is3DResource(selectedType)) {
        // Other 3D GLB items (horns, emberpods, animal hide, meat, etc.)
        this.heldItemMesh.position.set(0.04, -0.04, -0.14);
        this.heldItemMesh.rotation.set(-0.20, 0.40, -0.10);
        this.heldItemMesh.scale.set(0.14, 0.14, 0.14);
      } else {
        // Standard Voxel Mini-Blocks (Dirt, Planks, Cobblestone, etc.)
        this.heldItemMesh.position.set(0.04, -0.04, -0.14);
        this.heldItemMesh.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
        this.heldItemMesh.scale.set(0.36, 0.36, 0.36);
      }

      this.heldItemSocket.add(this.heldItemMesh);
    }
  }

  public getTorchFlameWorldPos(): THREE.Vector3 | null {
    if (!this.heldItemMesh || this.currentHeldType !== BlockType.TORCH) return null;
    const flameLocal = new THREE.Vector3(0, 0.95, 0);
    this.heldItemMesh.updateWorldMatrix(true, false);
    return flameLocal.applyMatrix4(this.heldItemMesh.matrixWorld);
  }

  public update(
    dt: number,
    isGrounded: boolean,
    hasMoveInput: boolean,
    isSprinting: boolean,
    isSwinging: boolean,
    swingProgress: number
  ): void {
    // 1. Walking / Sprinting Hand Bobbing
    let bobX = 0;
    let bobY = 0;

    if (isGrounded && hasMoveInput) {
      this.handBobTime += dt * 10 * (isSprinting ? 1.4 : 1.0);
      bobX = Math.sin(this.handBobTime) * 0.025;
      bobY = Math.abs(Math.cos(this.handBobTime)) * 0.025;
    } else {
      this.handBobTime = 0;
    }

    // 2. Tool / Weapon Swing Motion Offsets
    let swingX = 0;
    let swingY = 0;
    let swingZ = 0;
    let swingPitch = 0;
    let swingYaw = 0;
    let swingRoll = 0;

    if (isSwinging) {
      const t = Math.min(Math.max(swingProgress, 0), 1.0);
      const swingFactor = Math.sin(t * Math.PI); // Sine curve chop & return

      swingZ = -swingFactor * 0.18;    // Thrusts forward
      swingY = -swingFactor * 0.12;    // Dips down
      swingX = -swingFactor * 0.08;    // Swings inward
      swingPitch = -swingFactor * 0.45; // Forward chop angle
      swingYaw = swingFactor * 0.28;   // Inward rotation
      swingRoll = -swingFactor * 0.20; // Wrist roll
    }

    // 3. Apply Combined Position and Rotation
    const targetX = this.BASE_POS.x + bobX + swingX;
    const targetY = this.BASE_POS.y + bobY + swingY;
    const targetZ = this.BASE_POS.z + swingZ;

    const targetRotX = this.BASE_ROT.x + swingPitch;
    const targetRotY = this.BASE_ROT.y + swingYaw;
    const targetRotZ = this.BASE_ROT.z + swingRoll;

    this.root.position.set(targetX, targetY, targetZ);
    this.root.rotation.set(targetRotX, targetRotY, targetRotZ);
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  public dispose(): void {
    this.camera.remove(this.root);
    if (this.whiteArmModel) {
      this.whiteMaterials.forEach((m) => m.dispose());
    }
    if (this.blackArmModel) {
      this.blackMaterials.forEach((m) => m.dispose());
    }
  }
}
