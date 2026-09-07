import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ArmorTier, BodyType, CharacterColors, GameSettings, HairStyle } from '../settings/SettingsManager';
import { CharacterAnimator, CharacterJoints, AnimState } from '../animation/CharacterAnimator';
import { BlockType } from '../textures/TextureGenerator';
import { ItemManager } from '../items/ItemManager';

/**
 * Creates soft, beveled box geometry to replace sharp 90-degree corners on player character models.
 */
function createBeveledBox(width: number, height: number, depth: number, radius: number = 0.035, segments: number = 2): THREE.BufferGeometry {
  const minDim = Math.min(width, height, depth);
  const safeRadius = Math.min(radius, minDim * 0.22);
  if (safeRadius <= 0.002) {
    return new THREE.BoxGeometry(width, height, depth);
  }
  return new RoundedBoxGeometry(width, height, depth, segments, safeRadius);
}

export interface SkeletonRestPoseData {
  localRestQuats: Map<string, THREE.Quaternion>;
  parentWorldRestQuats: Map<string, THREE.Quaternion>;
  boneWorldRestQuats: Map<string, THREE.Quaternion>;
}

/**
 * Renames UniRig Bone_XXX nodes to standard humanoid bone names.
 * DOES NOT modify any bone quaternions — inverse bind matrices are preserved.
 * Computes both local rest quaternions and parent-world-space rest quaternions
 * so that animation keyframes from the White Male master rig can be transformed
 * into each variant model's local coordinate space.
 */
function normalizeUniRigSkeleton(rootModel: THREE.Object3D): SkeletonRestPoseData {
  const nodeOrigLocalQuat = new Map<THREE.Object3D, THREE.Quaternion>();
  rootModel.traverse((node) => {
    nodeOrigLocalQuat.set(node, node.quaternion.clone());
  });

  let hasStandardHips = false;
  let hasStandardLeftArm = false;
  rootModel.traverse((node) => {
    if (node.name === 'Hips' || node.name === 'mixamorigHips') hasStandardHips = true;
    if (node.name === 'LeftArm' || node.name === 'mixamorigLeftArm') hasStandardLeftArm = true;
  });

  if (!hasStandardHips || !hasStandardLeftArm) {
    // 1. Calculate world positions of all nodes in rest pose
    rootModel.updateMatrixWorld(true);
    const worldPosMap = new Map<THREE.Object3D, THREE.Vector3>();
    rootModel.traverse((node) => {
      const pos = new THREE.Vector3();
      node.getWorldPosition(pos);
      worldPosMap.set(node, pos);
    });

    // 2. Find root bone (Bone_000 or top bone with no bone parent)
    let rootBone: THREE.Object3D | null = null;
    rootModel.traverse((node) => {
      if (node instanceof THREE.Bone || (node.name && node.name.startsWith('Bone_'))) {
        const parentIsBone = node.parent && (node.parent instanceof THREE.Bone || (node.parent.name && node.parent.name.startsWith('Bone_')));
        if (!parentIsBone && !rootBone) {
          rootBone = node;
        }
      }
    });

    if (rootBone) {
      (rootBone as THREE.Object3D).name = 'Hips';

      const getBoneChildren = (node: THREE.Object3D) =>
        node.children.filter((c) => c instanceof THREE.Bone || (c.name && c.name.startsWith('Bone_')));

      let currNode: THREE.Object3D | undefined = rootBone;
      let spineNodes: THREE.Object3D[] = [];
      while (currNode) {
        spineNodes.push(currNode);
        const bChildren = getBoneChildren(currNode);
        if (bChildren.length === 0 || bChildren.length > 1) break;
        currNode = bChildren[0];
      }

      // NOTE: Do NOT name spineNodes[1] here — spine naming is deferred
      // until after we know the full chain length, so we can match the White
      // Male convention (Spine02 at bottom → Spine01 → Spine at top/chest).

      const spineRootNode = spineNodes.length > 1 ? spineNodes[1] : rootBone;
      const spineRootChildren = getBoneChildren(spineRootNode);

      let spineBranchNode: THREE.Object3D | undefined = spineRootChildren.find((c) => {
        const wp = worldPosMap.get(c);
        return wp && Math.abs(wp.x) < 0.04;
      });

      let legBranchNodes: THREE.Object3D[] = spineRootChildren.filter((c) => {
        const wp = worldPosMap.get(c);
        return wp && Math.abs(wp.x) >= 0.04;
      });

      if (legBranchNodes.length >= 2) {
        // Sort legs by World X: higher World X (+X) = Left, lower World X (-X) = Right
        legBranchNodes.sort((a, b) => (worldPosMap.get(b)?.x || 0) - (worldPosMap.get(a)?.x || 0));

        const traceChain = (startNode: THREE.Object3D, names: string[]) => {
          let curr: THREE.Object3D | undefined = startNode;
          for (let i = 0; i < names.length; i++) {
            if (!curr) break;
            curr.name = names[i];
            const nextC = getBoneChildren(curr);
            curr = nextC.length > 0 ? nextC[0] : undefined;
          }
        };

        traceChain(legBranchNodes[0], ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase']);
        traceChain(legBranchNodes[1], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);
      }

      let chestNode: THREE.Object3D | undefined = spineBranchNode;

      // Find chest junction node (where spine branches into head & arms)
      while (chestNode) {
        const cChildren = getBoneChildren(chestNode);
        if (cChildren.length >= 2) break;
        chestNode = cChildren.length > 0 ? cChildren[0] : undefined;
      }

      // Collect full spine chain from Hips-child down to chestNode (exclusive),
      // then name top-down to match the White Male convention:
      //   White Male: Hips → Spine02 (bottom) → Spine01 → Spine (top/chest junction)
      //   So topmost spine bone = "Spine", going down = Spine01, Spine02, Spine03...
      const fullSpineChain: THREE.Object3D[] = [];

      // 1. Add any spine nodes between Hips and the leg-branch node
      for (let si = 1; si < spineNodes.length; si++) {
        fullSpineChain.push(spineNodes[si]);
      }

      // 2. Add intermediate nodes from spineBranchNode up to chestNode
      let tempSpineNode: THREE.Object3D | undefined = spineBranchNode;
      while (tempSpineNode && tempSpineNode !== chestNode) {
        if (!fullSpineChain.includes(tempSpineNode)) {
          fullSpineChain.push(tempSpineNode);
        }
        const nextC = getBoneChildren(tempSpineNode);
        tempSpineNode = nextC.length > 0 ? nextC[0] : undefined;
      }

      // 3. Name intermediate spine bones: Spine01, Spine02, Spine03... leading up to chestNode
      if (fullSpineChain.length > 0) {
        for (let i = fullSpineChain.length - 1; i >= 0; i--) {
          fullSpineChain[i].name = `Spine0${fullSpineChain.length - i}`;
        }
      }

      if (chestNode) {
        chestNode.name = 'Spine';
        const chestChildren = getBoneChildren(chestNode);

        // Sort chest children by World Y to find Neck (highest Y)
        const sortedByY = [...chestChildren].sort((a, b) => (worldPosMap.get(b)?.y || 0) - (worldPosMap.get(a)?.y || 0));
        const neckCandidate = sortedByY[0];
        const armCandidates = sortedByY.slice(1);

        if (neckCandidate) {
          neckCandidate.name = 'neck';
          const nChildren = getBoneChildren(neckCandidate);
          if (nChildren.length > 0) {
            nChildren[0].name = 'Head';
            const hChildren = getBoneChildren(nChildren[0]);
            if (hChildren.length > 0) hChildren[0].name = 'head_end';
          }
        }

        if (armCandidates.length >= 2) {
          // Sort arms by World X: higher World X (+X) = Left Arm, lower World X (-X) = Right Arm
          armCandidates.sort((a, b) => (worldPosMap.get(b)?.x || 0) - (worldPosMap.get(a)?.x || 0));

          const getArmChainLength = (startNode: THREE.Object3D): number => {
            let count = 0;
            let curr: THREE.Object3D | undefined = startNode;
            while (curr) {
              count++;
              const nextC = getBoneChildren(curr);
              curr = nextC.length > 0 ? nextC[0] : undefined;
            }
            return count;
          };

          const traceArmChain = (startNode: THREE.Object3D, side: 'Left' | 'Right') => {
            const chainLength = getArmChainLength(startNode);
            // If model has 4 bones (no separate clavicle/shoulder, e.g. Male Ogre),
            // the root arm bone is UpperArm directly.
            const names =
              chainLength <= 4
                ? [`${side}Arm`, `${side}ForeArm`, `${side}Hand`, `${side}Hand_end`]
                : [`${side}Shoulder`, `${side}Arm`, `${side}ForeArm`, `${side}Hand`, `${side}Hand_end`];

            let curr: THREE.Object3D | undefined = startNode;
            for (let i = 0; i < names.length; i++) {
              if (!curr) break;
              curr.name = names[i];
              const nextC = getBoneChildren(curr);
              curr = nextC.length > 0 ? nextC[0] : undefined;
            }
          };

          traceArmChain(armCandidates[0], 'Left');
          traceArmChain(armCandidates[1], 'Right');
        }
      }
    }
  }

  // Compute accumulated parent-world and bone-world quaternions
  rootModel.updateMatrixWorld(true);

  const localRestQuats = new Map<string, THREE.Quaternion>();
  const parentWorldRestQuats = new Map<string, THREE.Quaternion>();
  const boneWorldRestQuats = new Map<string, THREE.Quaternion>();

  const computeWorldRec = (node: THREE.Object3D, parentWorldQ: THREE.Quaternion) => {
    const lQ = nodeOrigLocalQuat.get(node) || node.quaternion.clone();
    const wQ = parentWorldQ.clone().multiply(lQ);
    if (node.name) {
      localRestQuats.set(node.name, lQ.clone());
      parentWorldRestQuats.set(node.name, parentWorldQ.clone());
      boneWorldRestQuats.set(node.name, wQ.clone());
    }
    for (const child of node.children) {
      computeWorldRec(child, wQ);
    }
  };

  computeWorldRec(rootModel, new THREE.Quaternion());

  return { localRestQuats, parentWorldRestQuats, boneWorldRestQuats };
}

/**
 * Retargets a WHITE HUMAN MALE animation clip to work on a target avatar model.
 *
 * Transforms keyframe rotation offsets through parent-world space:
 *   R_parent                 = P_tgtWorld⁻¹ · P_srcWorld
 *   Q_delta                  = Q_srcRest⁻¹ · Q_anim
 *   Q_delta_transformed      = R_parent · Q_delta · R_parent⁻¹
 *   Q_retarget               = Q_tgtRest · Q_delta_transformed
 *
 * Only quaternion tracks are kept; position and scale tracks are stripped
 * to prevent root-translation mismatch and mesh stretching.
 */
function sanitizeAnimationClip(
  clip: THREE.AnimationClip,
  targetNodeNames: Set<string>,
  sourceRest: SkeletonRestPoseData,
  targetRest: SkeletonRestPoseData,
  animName: string = ''
): THREE.AnimationClip {
  const validTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const fullNodePath = parts[0];
    const propertyPath = parts.slice(1).join('.');
    const nodeName = fullNodePath.includes('/') ? fullNodePath.split('/').pop()! : fullNodePath;

    let matchedNodeName: string | null = null;

    if (targetNodeNames.has(nodeName)) {
      matchedNodeName = nodeName;
    } else {
      const withPrefix = 'mixamorig' + nodeName;
      if (targetNodeNames.has(withPrefix)) {
        matchedNodeName = withPrefix;
      } else if (nodeName.startsWith('mixamorig')) {
        const withoutPrefix = nodeName.replace(/^mixamorig/, '');
        if (targetNodeNames.has(withoutPrefix)) {
          matchedNodeName = withoutPrefix;
        }
      }
    }

    if (!matchedNodeName) continue;

    // Keep ONLY rotation (quaternion) tracks for bones
    if (propertyPath !== 'quaternion' && propertyPath !== 'rotation') {
      continue;
    }

    // Skip Hips root rotation track on standard locomotion (walk/run/idle) to prevent root-tilt,
    // BUT preserve Hips rotation for roll/dodge/dead/surf animations so the character flips, tumbles, or rides sideways!
    const clipIdent = `${clip.name} ${animName}`.toLowerCase();
    const isSpecialRootClip = clipIdent.includes('roll') || clipIdent.includes('dodge') || clipIdent.includes('dead') || clipIdent.includes('surf') || clipIdent.includes('quicksand');
    if ((matchedNodeName === 'Hips' || matchedNodeName === 'mixamorigHips') && !isSpecialRootClip) {
      continue;
    }

    const clonedTrack = track.clone();
    clonedTrack.name = `${matchedNodeName}.${propertyPath}`;

    const qSrcRest = sourceRest.localRestQuats.get(matchedNodeName);
    const qTgtRest = targetRest.localRestQuats.get(matchedNodeName);

    const wSrcBone = sourceRest.boneWorldRestQuats.get(matchedNodeName);
    const wTgtBone = targetRest.boneWorldRestQuats.get(matchedNodeName);

    if (qSrcRest && qTgtRest && wSrcBone && wTgtBone && clonedTrack.values && clonedTrack.values.length > 0) {
      // Ensure positive quaternion hemisphere to avoid sign-flip discontinuities
      const wSrc = wSrcBone.clone();
      if (wSrc.w < 0) {
        wSrc.x = -wSrc.x;
        wSrc.y = -wSrc.y;
        wSrc.z = -wSrc.z;
        wSrc.w = -wSrc.w;
      }
      const wTgt = wTgtBone.clone();
      if (wTgt.w < 0) {
        wTgt.x = -wTgt.x;
        wTgt.y = -wTgt.y;
        wTgt.z = -wTgt.z;
        wTgt.w = -wTgt.w;
      }

      // R_bone transforms rotation deltas from source bone space into target bone space
      const R_bone = wTgt.invert().multiply(wSrc);
      const R_bone_inv = R_bone.clone().invert();
      const qSrcInv = qSrcRest.clone().invert();

      const numFrames = Math.floor(clonedTrack.values.length / 4);

      for (let i = 0; i < numFrames; i++) {
        const idx = i * 4;
        const qAnim = new THREE.Quaternion(
          clonedTrack.values[idx],
          clonedTrack.values[idx + 1],
          clonedTrack.values[idx + 2],
          clonedTrack.values[idx + 3]
        );

        // Q_delta = Q_srcRest⁻¹ · Q_anim
        // Q_delta_transformed = R_bone · Q_delta · R_bone⁻¹
        // Q_retarget = Q_tgtRest · Q_delta_transformed
        const qDelta = qSrcInv.clone().multiply(qAnim);
        const qDeltaTransformed = R_bone.clone().multiply(qDelta).multiply(R_bone_inv);
        const qRetarget = qTgtRest.clone().multiply(qDeltaTransformed);

        clonedTrack.values[idx] = qRetarget.x;
        clonedTrack.values[idx + 1] = qRetarget.y;
        clonedTrack.values[idx + 2] = qRetarget.z;
        clonedTrack.values[idx + 3] = qRetarget.w;
      }
    }

    validTracks.push(clonedTrack);
  }

  let finalDuration = clip.duration;
  if (clip.name.toUpperCase().includes('STEP_UP') || clip.name.toUpperCase().includes('STEP UP')) {
    finalDuration = Math.min(clip.duration, 0.65);
  }

  return new THREE.AnimationClip(clip.name, finalDuration, validTracks);
}

export class CharacterCustomizationRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLElement | null = null;
  private characterGroup: THREE.Group = new THREE.Group();
  public autoRotate: boolean = true;

  // Animation controller and joint hierarchy
  public animator!: CharacterAnimator;
  public joints!: CharacterJoints;

  // Base Body Materials
  private headMat!: THREE.MeshStandardMaterial;
  private hairMat!: THREE.MeshStandardMaterial;
  private eyeWhiteMat!: THREE.MeshStandardMaterial;
  private eyePupilMat!: THREE.MeshStandardMaterial;
  private browMat!: THREE.MeshStandardMaterial;
  private mouthMat!: THREE.MeshStandardMaterial;

  private torsoMat!: THREE.MeshStandardMaterial;
  private tunicCollarMat!: THREE.MeshStandardMaterial;
  private beltMat!: THREE.MeshStandardMaterial;
  private buckleMat!: THREE.MeshStandardMaterial;

  private leftArmMat!: THREE.MeshStandardMaterial;
  private rightArmMat!: THREE.MeshStandardMaterial;
  private cuffMat!: THREE.MeshStandardMaterial;

  private leftLegMat!: THREE.MeshStandardMaterial;
  private rightLegMat!: THREE.MeshStandardMaterial;
  private bootMat!: THREE.MeshStandardMaterial;

  // Armor Materials
  private armorBaseMat!: THREE.MeshStandardMaterial;
  private armorTrimMat!: THREE.MeshStandardMaterial;
  private armorGlowMat!: THREE.MeshBasicMaterial;
  private capeMat!: THREE.MeshStandardMaterial;
  private swordBladeMat!: THREE.MeshStandardMaterial;
  private swordGlowMat!: THREE.MeshBasicMaterial;

  // Groups for modular toggling
  private hairGroup: THREE.Group = new THREE.Group();
  private faceGroup: THREE.Group = new THREE.Group();
  private helmetGroup: THREE.Group = new THREE.Group();
  private chestGroup: THREE.Group = new THREE.Group();
  private leftPuldronGroup: THREE.Group = new THREE.Group();
  private rightPuldronGroup: THREE.Group = new THREE.Group();
  private capeGroup: THREE.Group = new THREE.Group();
  private weaponGroup: THREE.Group = new THREE.Group();

  private animationFrameId: number | null = null;
  private currentBodyType: BodyType = 'male';
  private currentHairStyle: HairStyle = 'short';
  private lastFrameTime: number = performance.now();

  // Meshy AI GLTF Model & Animation Mixer
  private meshyModel: THREE.Group | null = null;
  private meshyMixer: THREE.AnimationMixer | null = null;
  private meshyActions: Map<string, THREE.AnimationAction> = new Map();
  private currentActionName: string = '';
  private proceduralRootGroup: THREE.Group | null = null;

  // Skeletal Head & Neck Look-At Tracking Constraint
  private headBone: THREE.Object3D | null = null;
  private neckBone: THREE.Object3D | null = null;
  public headYaw: number = 0;
  public headPitch: number = 0;

  constructor(containerId?: string) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.15, 3.8);
    this.camera.lookAt(0, 1.05, 0);

    if (containerId) {
      const container = document.getElementById(containerId);
      if (container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        const width = container.clientWidth || 300;
        const height = container.clientHeight || 300;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';

        container.innerHTML = '';
        container.appendChild(this.renderer.domElement);

        // Enhanced lighting setup for standalone scene
        const ambient = new THREE.AmbientLight(0xffffff, 1.4);
        this.scene.add(ambient);

        const dirLight1 = new THREE.DirectionalLight(0xffedd5, 2.2);
        dirLight1.position.set(3, 6, 4);
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.2);
        dirLight2.position.set(-4, -2, -3);
        this.scene.add(dirLight2);

        this.animate();
        window.addEventListener('resize', () => this.onResize());
      }
    }

    this.buildCharacter('male', 'short');
    this.scene.add(this.characterGroup);
  }

  // Static shared cache for 3D GLB avatar models and animation clips
  // Master animation source of truth rest pose data (White Male)
  public static sourceRestData: SkeletonRestPoseData = {
    localRestQuats: new Map(),
    parentWorldRestQuats: new Map(),
    boneWorldRestQuats: new Map(),
  };
  // Per-model rest pose data (keyed by avatar URL)
  private static modelRestData: Map<string, SkeletonRestPoseData> = new Map();
  private static avatarModelCache: Map<string, THREE.Group> = new Map();
  private static animClipCache: Map<string, THREE.AnimationClip> = new Map();
  private static loadingPromises: Map<string, Promise<THREE.Group>> = new Map();

  private currentAvatarPath: string = '';

  /**
   * Preloads all 4 GLB avatar models and source rest quaternions in advance
   * to eliminate lag when switching gender or ethnicity.
   */
  public static async preloadAllAssets(): Promise<void> {
    const avatarPaths = [
      '/AVATAR/WHITE HUMAN MALE (NO GEAR).glb',
      '/AVATAR/BLACK HUMAN MALE (NO GEAR).glb',
      '/AVATAR/WHITE HUMAN FEMALE (NO GEAR).glb',
      '/AVATAR/BLACK HUMAN FEMALE (NO GEAR).glb',
      '/AVATAR/MALE OGRE (NO GEAR).glb',
      '/AVATAR/FEMALE OGRE (NO GEAR).glb',
    ];

    const loader = new GLTFLoader();

    await Promise.all(
      avatarPaths.map(async (url) => {
        if (!CharacterCustomizationRenderer.avatarModelCache.has(url)) {
          if (!CharacterCustomizationRenderer.loadingPromises.has(url)) {
            const p = new Promise<THREE.Group>((resolve) => {
              const loadUrl = `${url}?v=${Date.now()}`;
              loader.load(
                loadUrl,
                (gltf) => {
                  const restData = normalizeUniRigSkeleton(gltf.scene);
                  CharacterCustomizationRenderer.modelRestData.set(url, restData);
                  CharacterCustomizationRenderer.avatarModelCache.set(url, gltf.scene);
                  console.log(`[AvatarLoader] Skeleton normalized & rest pose cached for: ${url} (${restData.localRestQuats.size} bones)`);
                  resolve(gltf.scene);
                },
                undefined,
                () => resolve(new THREE.Group())
              );
            });
            CharacterCustomizationRenderer.loadingPromises.set(url, p);
          }
          await CharacterCustomizationRenderer.loadingPromises.get(url);
        }
      })
    );
  }

  private async ensureSourceRestQuats(): Promise<void> {
    if (CharacterCustomizationRenderer.sourceRestData.localRestQuats.size > 0) return;
    const candidateMasterUrls = [
      '/AVATAR/ANIMATIONS/Animation_RELAXED_IDLE_1.glb',
      '/AVATAR/ANIMATIONS/Animation_Walking.glb',
      '/AVATAR/ANIMATIONS/Animation_Running.glb',
    ];
    const loader = new GLTFLoader();
    for (const url of candidateMasterUrls) {
      try {
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
        if (gltf && gltf.scene) {
          const restData = normalizeUniRigSkeleton(gltf.scene);
          restData.localRestQuats.forEach((q, name) => {
            CharacterCustomizationRenderer.sourceRestData.localRestQuats.set(name, q.clone());
          });
          restData.parentWorldRestQuats.forEach((q, name) => {
            CharacterCustomizationRenderer.sourceRestData.parentWorldRestQuats.set(name, q.clone());
          });
          restData.boneWorldRestQuats.forEach((q, name) => {
            CharacterCustomizationRenderer.sourceRestData.boneWorldRestQuats.set(name, q.clone());
          });
          console.log(`[AvatarLoader] Master animation source rest pose initialized from: ${url}`);
          break;
        }
      } catch {}
    }
  }

  private getAvatarPath(gender: string = 'male', ethnicity: string = 'white', race: string = 'human'): string {
    const g = (gender || 'male').toLowerCase();
    const e = (ethnicity || 'white').toLowerCase();
    const r = (race || 'human').toLowerCase();

    if (r === 'ogre') {
      if (g === 'female') {
        return '/AVATAR/FEMALE OGRE (NO GEAR).glb';
      } else {
        return '/AVATAR/MALE OGRE (NO GEAR).glb';
      }
    }

    if (e === 'black' && g === 'female') {
      return '/AVATAR/BLACK HUMAN FEMALE (NO GEAR).glb';
    } else if (e === 'black' && g === 'male') {
      return '/AVATAR/BLACK HUMAN MALE (NO GEAR).glb';
    } else if (e === 'white' && g === 'female') {
      return '/AVATAR/WHITE HUMAN FEMALE (NO GEAR).glb';
    } else {
      return '/AVATAR/WHITE HUMAN MALE (NO GEAR).glb';
    }
  }

  /**
   * Safely disposes old model geometries and customized materials
   * without garbage collection spikes or memory leaks.
   */
  public disposeCurrentMeshyModel(): void {
    if (!this.meshyModel) return;

    if (this.meshyMixer) {
      this.meshyMixer.stopAllAction();
      this.meshyMixer.uncacheRoot(this.meshyModel);
      this.meshyActions.clear();
    }
    this.currentActionName = '';

    if (this.meshyModel.parent) {
      this.meshyModel.parent.remove(this.meshyModel);
    }

    this.meshyModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m.userData && m.userData.isCustomized) {
              m.dispose();
            }
          });
        }
      }
    });

    this.meshyModel = null;
    this.headBone = null;
    this.neckBone = null;
    this.heldItemMesh = null;
    this.heldItemType = null;
  }

  public async attachAnimationClip(animName: string, animPath: string): Promise<void> {
    if (!this.meshyMixer || !this.meshyModel) return;

    let cleanClip: THREE.AnimationClip | null = null;
    const cacheKey = `${animPath}::${this.currentAvatarPath}`;

    if (CharacterCustomizationRenderer.animClipCache.has(cacheKey)) {
      cleanClip = CharacterCustomizationRenderer.animClipCache.get(cacheKey)!;
    } else {
      try {
        const targetNodeNames = new Set<string>();
        this.meshyModel.traverse((node) => {
          if (node.name) targetNodeNames.add(node.name);
        });

        const targetRest = CharacterCustomizationRenderer.modelRestData.get(this.currentAvatarPath) || {
          localRestQuats: new Map(),
          parentWorldRestQuats: new Map(),
          boneWorldRestQuats: new Map(),
        };

        const sourceRest = CharacterCustomizationRenderer.sourceRestData;

        // Support organized /AVATAR/ANIMATIONS/ directory with fallback to legacy /AVATAR/
        const candidatePaths: string[] = [];
        if (animPath.startsWith('/AVATAR/ANIMATIONS/')) {
          candidatePaths.push(animPath);
          candidatePaths.push(animPath.replace('/AVATAR/ANIMATIONS/', '/AVATAR/'));
        } else if (animPath.startsWith('/AVATAR/')) {
          candidatePaths.push(animPath.replace('/AVATAR/', '/AVATAR/ANIMATIONS/'));
          candidatePaths.push(animPath);
        } else {
          candidatePaths.push(`/AVATAR/ANIMATIONS/${animPath}`);
          candidatePaths.push(`/AVATAR/${animPath}`);
        }

        const loader = new GLTFLoader();
        let loadedGltf: GLTF | null = null;

        for (const path of candidatePaths) {
          try {
            const gltf = await new Promise<GLTF>((resolve, reject) => {
              loader.load(path, resolve, undefined, reject);
            });
            if (gltf && gltf.animations && gltf.animations.length > 0) {
              loadedGltf = gltf;
              break;
            }
          } catch {}
        }

        if (loadedGltf && loadedGltf.animations && loadedGltf.animations.length > 0) {
          const sanitized = sanitizeAnimationClip(
            loadedGltf.animations[0],
            targetNodeNames,
            sourceRest,
            targetRest,
            animName
          );
          CharacterCustomizationRenderer.animClipCache.set(cacheKey, sanitized);
          cleanClip = sanitized;
        } else {
          // Optional animation not present in candidate paths
          return;
        }
      } catch (err) {
        return;
      }
    }

    if (cleanClip && this.meshyMixer) {
      const action = this.meshyMixer.clipAction(cleanClip);
      if (animName.includes('step_up')) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.meshyActions.set(animName, action);
    }
  }

  public applyCustomizationToMeshyModel(model: THREE.Object3D, settings: GameSettings): void {
    if (!model || !settings) return;

    let headHex = settings.characterColors?.head || '#fca5a5';
    if (settings.ethnicity === 'black') {
      headHex = '#5c3826';
    } else if (settings.ethnicity === 'white') {
      headHex = '#fca5a5';
    }

    if (settings.race === 'ogre') {
      headHex = '#3a6b35';
    } else if (settings.race === 'reptilian') {
      headHex = '#2d5a27';
    }

    const skinColor = new THREE.Color(headHex);
    const hairColor = new THREE.Color(settings.characterColors?.hair || '#78350f');
    const clothingColor = new THREE.Color(settings.clothingColor || '#1e293b');

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.material) return;

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        mats.forEach((mat, idx) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshBasicMaterial) {
            let activeMat = mat;
            if (!activeMat.userData.isCustomized) {
              activeMat = mat.clone();
              activeMat.userData.isCustomized = true;
              if (Array.isArray(mesh.material)) {
                mesh.material[idx] = activeMat;
              } else {
                mesh.material = activeMat;
              }
            }

            const matName = (activeMat.name || '').toLowerCase();
            const meshName = (mesh.name || '').toLowerCase();

            // If the model has an embedded texture map from Meshy AI, preserve its native texture colors
            if (activeMat.map) {
              activeMat.color.set(0xffffff);
            } else if (matName.includes('hair') || meshName.includes('hair')) {
              activeMat.color.copy(hairColor);
            } else if (matName.includes('cloth') || matName.includes('shirt') || matName.includes('pants') || matName.includes('outfit') || matName.includes('gear') || matName.includes('torso') || meshName.includes('cloth')) {
              activeMat.color.copy(clothingColor);
            } else if (matName.includes('skin') || matName.includes('body') || matName.includes('face') || matName.includes('head') || matName.includes('human') || meshName.includes('head') || meshName.includes('body')) {
              activeMat.color.copy(skinColor);
            }
            activeMat.needsUpdate = true;
          }
        });
      }
    });
  }

  /**
   * Sets ethnicity and gender avatar model state with robust cache lookups,
   * graceful load error fallbacks (retains current render state instead of clearing to invisible),
   * and explicit material binding and shadow setup.
   */
  public async setEthnicity(ethnicity: string, gender: string, race: string, settings?: GameSettings): Promise<void> {
    const cacheKey = `${gender}_${ethnicity}_${race}`.toLowerCase();
    const modelUrl = this.getAvatarPath(gender, ethnicity, race);

    // 1. Check if model exists in cache
    let baseScene = CharacterCustomizationRenderer.avatarModelCache.get(cacheKey) || CharacterCustomizationRenderer.avatarModelCache.get(modelUrl);

    if (!baseScene) {
      try {
        const loader = new GLTFLoader();
        const loadUrl = `${modelUrl}?v=${Date.now()}`;
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(loadUrl, resolve, undefined, reject);
        });
        const restData = normalizeUniRigSkeleton(gltf.scene);
        CharacterCustomizationRenderer.modelRestData.set(modelUrl, restData);
        if (gltf.scene) {
          baseScene = gltf.scene;
          CharacterCustomizationRenderer.avatarModelCache.set(cacheKey, baseScene);
          CharacterCustomizationRenderer.avatarModelCache.set(modelUrl, baseScene);
        }
        console.log(`[AvatarLoader] Skeleton normalized & rest pose cached for: ${modelUrl} (${restData.localRestQuats.size} bones)`);
      } catch (error) {
        console.error(`Failed to load avatar asset for key: ${cacheKey}`, error);
        return; // Retain current render state instead of clearing to invisible
      }
    }

    if (!baseScene) return;

    // 2. Clear current scene group safely
    this.disposeCurrentMeshyModel();

    // 3. Ensure materials and skinning bindings are correctly mapped
    const modelInstance = SkeletonUtils.clone(baseScene) as THREE.Group;

    modelInstance.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const processMat = (m: THREE.Material): THREE.Material => {
            const cloned = m.clone();
            cloned.side = THREE.DoubleSide;
            if ((cloned as THREE.MeshStandardMaterial).isMeshStandardMaterial || (cloned as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
              const std = cloned as THREE.MeshStandardMaterial;
              if (std.emissive) {
                std.emissive.setRGB(0, 0, 0);
              }
              std.emissiveIntensity = 0.0;
              std.emissiveMap = null;
              std.roughness = 0.75;
              std.metalness = 0.10;
            }
            cloned.needsUpdate = true;
            return cloned;
          };

          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(processMat)
            : processMat(mesh.material);
        }
      }
    });

    // 4. Compute bounding height and position flush to ground
    let rawMeshHeight = 0;
    modelInstance.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          const h = mesh.geometry.boundingBox.max.y - mesh.geometry.boundingBox.min.y;
          if (h > rawMeshHeight) rawMeshHeight = h;
        }
      }
    });

    const targetHeight = 1.8;
    const scale = rawMeshHeight > 0 ? targetHeight / rawMeshHeight : 1.0;
    modelInstance.scale.set(scale, scale, scale);

    const scaledBbox = new THREE.Box3().setFromObject(modelInstance);
    modelInstance.position.set(0, -scaledBbox.min.y, 0);

    // 5. Attach new instance to characterGroup scene (hidden until animation mixer binds)
    modelInstance.visible = false;
    this.characterGroup.add(modelInstance);
    this.meshyModel = modelInstance;
    this.headBone = this.meshyModel.getObjectByName('Head') || null;
    this.neckBone = this.meshyModel.getObjectByName('neck') || null;
    this.currentAvatarPath = modelUrl;

    if (this.proceduralRootGroup) {
      this.proceduralRootGroup.visible = false;
    }

    if (settings) {
      this.applyCustomizationToMeshyModel(this.meshyModel, settings);
    }

    await this.ensureSourceRestQuats();
    this.meshyMixer = new THREE.AnimationMixer(this.meshyModel);
    this.meshyActions.clear();

    const animFiles: { name: string; path: string }[] = [
      { name: 'idle', path: '/AVATAR/ANIMATIONS/Animation_RELAXED_IDLE_1.glb' },
      { name: 'idle_2', path: '/AVATAR/ANIMATIONS/Animation_RELAXED_IDLE_2.glb' },
      { name: 'walk', path: '/AVATAR/ANIMATIONS/Animation_Walking.glb' },
      { name: 'run', path: '/AVATAR/ANIMATIONS/Animation_Running.glb' },
      { name: 'jump', path: '/AVATAR/ANIMATIONS/Animation_Regular_Jump.glb' },
      { name: 'falling', path: '/AVATAR/ANIMATIONS/Animation_Climb_FALL.glb' },
      { name: 'walk_step_up', path: '/AVATAR/ANIMATIONS/Animation_WALK_STEP_UP.glb' },
      { name: 'run_step_up', path: '/AVATAR/ANIMATIONS/Animation_WALK_STEP_UP.glb' },
      { name: 'climb_up', path: '/AVATAR/ANIMATIONS/Animation_climbing_up_wall.glb' },
      { name: 'climb_down', path: '/AVATAR/ANIMATIONS/Animation_climbing_down_wall.glb' },
      { name: 'climb_left', path: '/AVATAR/ANIMATIONS/Animation_Climb_Left_with_Both_Limbs.glb' },
      { name: 'climb_right', path: '/AVATAR/ANIMATIONS/Animation_Climb_Right_with_Both_Limbs.glb' },
      { name: 'climb_idle', path: '/AVATAR/ANIMATIONS/Animation_CLIMB_IDLE.glb' },
      { name: 'climb_fall', path: '/AVATAR/ANIMATIONS/Animation_Climb_FALL.glb' },
      { name: 'climb_fatigue', path: '/AVATAR/ANIMATIONS/Animation_Climb_FATIGUE.glb' },
      { name: 'climb_attempt_fall', path: '/AVATAR/ANIMATIONS/Animation_Climb_FATIGUE.glb' },
      { name: 'collect', path: '/AVATAR/ANIMATIONS/Animation_HARVESTING.glb' },
      { name: 'harvest', path: '/AVATAR/ANIMATIONS/Animation_HARVESTING.glb' },
      { name: 'mining', path: '/AVATAR/ANIMATIONS/Animation_MINING.glb' },
      { name: 'chop', path: '/AVATAR/ANIMATIONS/Animation_TREE_CHOPPING.glb' },
      { name: 'item_pickup', path: '/AVATAR/ANIMATIONS/Animation_ITEM_PICKUP.glb' },
      { name: 'torch_idle', path: '/AVATAR/ANIMATIONS/Animation_HOLDING_TORCH_IDLE.glb' },
      { name: 'torch_walk', path: '/AVATAR/ANIMATIONS/Animation_HOLDING_TORCH_WALKING.glb' },
      { name: 'sitting', path: '/AVATAR/ANIMATIONS/Animation_SITTING_IDLE.glb' },
      { name: 'cloud_surf', path: '/AVATAR/ANIMATIONS/Animation_CLOUD_SURFING.glb' },
      { name: 'dodge_roll', path: '/AVATAR/ANIMATIONS/Animation_Roll_Dodge.glb' },
      { name: 'quicksand_walk', path: '/AVATAR/ANIMATIONS/Animation_QUICKSAND_WALK.glb' },
    ];

    // 1. Immediately attach and start 'idle' animation first for instant responsiveness
    await this.attachAnimationClip('idle', '/AVATAR/ANIMATIONS/Animation_RELAXED_IDLE_1.glb');
    this.playAction('idle');
    this.meshyMixer.update(0.001);

    // 2. Reveal model immediately in clean idle pose (<30ms render time)
    modelInstance.visible = true;

    // 3. For UI preview customizer mode (this.container is present):
    // DO NOT load the 23 gameplay-only animations (jumping, climbing, dying, etc.)!
    // For headless in-game mode (this.container is null):
    // Load remaining gameplay animations asynchronously in the background without blocking render!
    if (!this.container) {
      const remainingAnims = animFiles.filter((item) => item.name !== 'idle');
      Promise.all(remainingAnims.map((item) => this.attachAnimationClip(item.name, item.path))).catch((err) => {
        console.warn('Background animation load warning:', err);
      });
    }
  }

  public async loadMeshyModel(targetPath?: string, settings?: GameSettings): Promise<void> {
    const gender = settings?.gender || 'male';
    const ethnicity = settings?.ethnicity || 'white';
    const race = settings?.race || 'human';
    await this.setEthnicity(ethnicity, gender, race, settings);
  }

  public playAction(actionName: string, duration: number = 0.25, timeOffset: number = 0, timeScale: number = 1.0): void {
    const newAction = this.meshyActions.get(actionName);
    if (!newAction) return;

    // 1. Guard Check: If the requested action is already active and running, DO NOT reset to frame 0
    if (this.currentActionName === actionName && newAction.isRunning()) {
      newAction.setEffectiveTimeScale(timeScale);
      return;
    }

    const oldAction = this.meshyActions.get(this.currentActionName);
    if (oldAction && oldAction !== newAction && oldAction.isRunning()) {
      oldAction.fadeOut(duration);
    }

    // 2. Configure continuous looping for locomotion states vs one-shots
    const nonLoopingOneShots = ['dead', 'hit_reaction', 'collect', 'walk_step_up', 'run_step_up', 'dodge_roll', 'item_pickup'];
    if (nonLoopingOneShots.includes(actionName)) {
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = (actionName === 'dead');
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      newAction.clampWhenFinished = false;
    }

    // 3. Reset and cross-fade smoothly into the new action
    newAction.reset();
    newAction.setEffectiveTimeScale(timeScale);
    newAction.time = timeOffset;
    newAction.enabled = true;
    newAction.fadeIn(duration);
    newAction.play();
    this.currentActionName = actionName;
  }

  public triggerRollAnimation(): void {
    const rollAction = this.meshyActions.get('dodge_roll');
    if (!rollAction) return;

    // 1. Stop or fade out current running/walking actions
    for (const [name, action] of this.meshyActions.entries()) {
      if (name !== 'dodge_roll' && action.isRunning()) {
        action.fadeOut(0.06);
      }
    }

    // 2. Configure roll action for a single non-looping playback
    rollAction.reset();
    rollAction.setLoop(THREE.LoopOnce, 1);
    rollAction.clampWhenFinished = false;
    rollAction.setEffectiveTimeScale(2.2);
    rollAction.fadeIn(0.04);
    rollAction.play();
    this.currentActionName = 'dodge_roll';
  }

  public triggerPickupAnimation(): void {
    const pickupAction = this.meshyActions.get('item_pickup') || this.meshyActions.get('collect');
    if (!pickupAction) return;

    if (this.currentActionName === 'dodge_roll' || this.currentActionName === 'dead') {
      return;
    }

    const oldAction = this.meshyActions.get(this.currentActionName);
    if (oldAction && oldAction !== pickupAction && oldAction.isRunning()) {
      oldAction.fadeOut(0.08);
    }

    pickupAction.reset();
    pickupAction.setLoop(THREE.LoopOnce, 1);
    pickupAction.clampWhenFinished = false;
    pickupAction.setEffectiveTimeScale(2.4);
    pickupAction.fadeIn(0.06);
    pickupAction.play();
    this.currentActionName = 'item_pickup';
  }

  public heldItemMesh: THREE.Object3D | null = null;
  public heldItemType: BlockType | null = null;

  public attachHeldItem(type: BlockType | null, itemManager?: any): void {
    if (itemManager) {
      this.syncHeldItem(type, itemManager);
    } else if (this.heldItemMesh && this.heldItemMesh.parent) {
      this.heldItemMesh.parent.remove(this.heldItemMesh);
      this.heldItemMesh = null;
      this.heldItemType = null;
    }
  }

  public syncHeldItem(type: BlockType | null, itemManager: ItemManager): void {
    // Locate RightHand bone in the active character model
    let rightHand: THREE.Object3D | null = null;
    if (this.meshyModel) {
      rightHand = this.meshyModel.getObjectByName('RightHand') || null;
      if (!rightHand) {
        this.meshyModel.traverse((child) => {
          if (!rightHand && child.name && (child.name === 'RightHand' || child.name.includes('RightHand') || child.name.toLowerCase().includes('righthand') || child.name.includes('RightForeArm'))) {
            rightHand = child;
          }
        });
      }
    }
    if (!rightHand) {
      rightHand = this.characterGroup.getObjectByName('RightHand') || null;
    }

    if (!rightHand) return;

    // Check if the mesh is already cleanly attached to rightHand and type matches
    if (this.heldItemType === type && this.heldItemMesh && this.heldItemMesh.parent === rightHand) {
      return;
    }

    this.heldItemType = type;

    if (this.heldItemMesh) {
      if (this.heldItemMesh.parent) {
        this.heldItemMesh.parent.remove(this.heldItemMesh);
      }
      this.heldItemMesh = null;
    }

    if (type === null || !itemManager) return;

    const mesh = itemManager.createMiniBlockMesh(type);
    if (mesh) {
      this.heldItemMesh = mesh;
      mesh.visible = true;

      // Ensure model meshes cast & receive shadows
      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Because RightHand is inside the character Armature (scaled by 0.01 in the avatar GLB),
      // we apply calibrated local scale multipliers so held items render in natural handheld proportions.
      if (type === BlockType.FLIMSY_AXE || type === BlockType.STONE_AXE) {
        mesh.position.set(1.5, 9.0, -1.0);
        mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        mesh.scale.set(80.0, 80.0, 80.0);
      } else if (type === BlockType.FLIMSY_PICKAXE) {
        mesh.position.set(1.5, 9.0, -1.0);
        mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        mesh.scale.set(80.0, 80.0, 80.0);
      } else if (type === BlockType.TORCH) {
        mesh.position.set(0.5, 9.0, 0.0);
        mesh.rotation.set(Math.PI, 0, 0);
        mesh.scale.set(75.0, 75.0, 75.0);
      } else if (type === BlockType.HUNTING_BOW) {
        mesh.position.set(1.0, 9.0, 0.0);
        mesh.rotation.set(0, Math.PI / 2, 0);
        mesh.scale.set(60.0, 60.0, 60.0);
      } else if (type === BlockType.BONECREST_HAMMER || type === BlockType.BONECREST_SHIELD) {
        mesh.position.set(1.5, 9.0, -0.5);
        mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        mesh.scale.set(70.0, 70.0, 70.0);
      } else if (type === BlockType.WORKBENCH) {
        mesh.position.set(0.0, 9.5, 1.0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(28.0, 28.0, 28.0);
      } else if (type === BlockType.STONE_PEBBLE || type === BlockType.FLINT) {
        mesh.position.set(0.8, 9.0, 0.4);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(20.0, 20.0, 20.0);
      } else if (type === BlockType.BRANCHES || type === BlockType.REEDS || type === BlockType.JUNGLE_ROPE) {
        mesh.position.set(0.8, 9.5, 0.0);
        mesh.rotation.set(-Math.PI / 4, 0, -Math.PI / 4);
        mesh.scale.set(25.0, 25.0, 25.0);
      } else if (type === BlockType.APPLES || type === BlockType.CARROT) {
        mesh.position.set(0.5, 9.0, 0.5);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(22.0, 22.0, 22.0);
      } else if (
        type === BlockType.BONECREST_HORN ||
        type === BlockType.UNCOOKED_MEAT ||
        type === BlockType.COOKED_MEAT ||
        type === BlockType.ANIMAL_HIDE ||
        type === BlockType.THORNSPIKE_CLUSTER ||
        type === BlockType.BLOOMWING_FEATHER ||
        type === BlockType.DUNESTING_BARB ||
        type === BlockType.DUNESTING_PINCER_CLAW ||
        type === BlockType.DUNESTING_SHELL ||
        type === BlockType.ASHEN_EMBERPOD
      ) {
        mesh.position.set(0.5, 9.0, 0.5);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(24.0, 24.0, 24.0);
      } else if (itemManager.is3DResource(type)) {
        mesh.position.set(0.5, 9.0, 0.5);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(24.0, 24.0, 24.0);
      } else {
        // Standard voxel block item (compact hand cube)
        mesh.position.set(0.0, 9.0, 0.8);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(60.0, 60.0, 60.0);
      }

      rightHand.add(mesh);
    }
  }

  public getCharacterGroup(): THREE.Group {
    return this.characterGroup;
  }

  // Specific Mesh references for tier-based feature toggles
  private visorMesh!: THREE.Mesh;
  private crestMesh!: THREE.Mesh;
  private coreGemMesh!: THREE.Mesh;
  private bladeMesh!: THREE.Mesh;
  private bladeGlowMesh!: THREE.Mesh;

  public rebuildCharacter(bodyType: BodyType, hairStyle: HairStyle) {
    if (bodyType === this.currentBodyType && hairStyle === this.currentHairStyle) return;
    if (this.proceduralRootGroup && this.proceduralRootGroup.parent === this.characterGroup) {
      this.characterGroup.remove(this.proceduralRootGroup);
    }
    this.hairGroup = new THREE.Group();
    this.faceGroup = new THREE.Group();
    this.helmetGroup = new THREE.Group();
    this.chestGroup = new THREE.Group();
    this.leftPuldronGroup = new THREE.Group();
    this.rightPuldronGroup = new THREE.Group();
    this.capeGroup = new THREE.Group();
    this.weaponGroup = new THREE.Group();
    this.buildCharacter(bodyType, hairStyle);
    if (this.meshyModel) {
      if (this.meshyModel.parent !== this.characterGroup) {
        this.characterGroup.add(this.meshyModel);
      }
      if (this.proceduralRootGroup) {
        this.proceduralRootGroup.visible = false;
      }
    }
  }

  public rebuildForBodyType(bodyType: BodyType) {
    this.rebuildCharacter(bodyType, this.currentHairStyle);
  }

  private buildCharacter(bodyType: BodyType = 'male', hairStyle: HairStyle = 'short') {
    this.currentBodyType = bodyType;
    this.currentHairStyle = hairStyle;
    const isFemale = bodyType === 'female';

    // Base Body Materials
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.6 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    this.eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    this.eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
    this.browMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 });
    this.mouthMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });

    this.torsoMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    this.tunicCollarMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.5 });
    this.beltMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.4 });
    this.buckleMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.8, roughness: 0.2 });

    this.leftArmMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    this.rightArmMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    this.cuffMat = new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.6 });

    this.leftLegMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    this.rightLegMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    this.bootMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.6 });

    // Armor Materials
    this.armorBaseMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.3 });
    this.armorTrimMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.8, roughness: 0.2 });
    this.armorGlowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    this.capeMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.8 });
    this.swordBladeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 });
    this.swordGlowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });

    // --- SKELETAL JOINT HIERARCHY CREATION ---
    // Root sits at Y=1.10 so boot soles align 100% flush with ground level Y=0
    const rootJoint = new THREE.Group();
    rootJoint.position.set(0, 1.10, 0);

    const torsoJoint = new THREE.Group();

    const headJoint = new THREE.Group();
    headJoint.position.set(0, 0.48, 0);

    const leftShoulderJoint = new THREE.Group();
    leftShoulderJoint.position.set(isFemale ? 0.34 : 0.40, 0.30, 0);

    const leftElbowJoint = new THREE.Group();
    leftElbowJoint.position.set(0, -0.34, 0);

    const rightShoulderJoint = new THREE.Group();
    rightShoulderJoint.position.set(isFemale ? -0.34 : -0.40, 0.30, 0);

    const rightElbowJoint = new THREE.Group();
    rightElbowJoint.position.set(0, -0.34, 0);

    const leftHipJoint = new THREE.Group();
    leftHipJoint.position.set(0.14, -0.36, 0);

    const leftKneeJoint = new THREE.Group();
    leftKneeJoint.position.set(0, -0.34, 0);

    const rightHipJoint = new THREE.Group();
    rightHipJoint.position.set(-0.14, -0.36, 0);

    const rightKneeJoint = new THREE.Group();
    rightKneeJoint.position.set(0, -0.34, 0);

    // Assembly
    this.proceduralRootGroup = rootJoint;
    rootJoint.visible = false; // Hide legacy procedural voxel model so it never flashes on reload
    this.characterGroup.add(rootJoint);
    rootJoint.add(torsoJoint);

    torsoJoint.add(headJoint);
    torsoJoint.add(leftShoulderJoint);
    leftShoulderJoint.add(leftElbowJoint);
    torsoJoint.add(rightShoulderJoint);
    rightShoulderJoint.add(rightElbowJoint);
    torsoJoint.add(leftHipJoint);
    leftHipJoint.add(leftKneeJoint);
    torsoJoint.add(rightHipJoint);
    rightHipJoint.add(rightKneeJoint);

    this.joints = {
      root: rootJoint,
      head: headJoint,
      torso: torsoJoint,
      leftShoulder: leftShoulderJoint,
      leftElbow: leftElbowJoint,
      rightShoulder: rightShoulderJoint,
      rightElbow: rightElbowJoint,
      leftHip: leftHipJoint,
      leftKnee: leftKneeJoint,
      rightHip: rightHipJoint,
      rightKnee: rightKneeJoint,
    };
    this.animator = new CharacterAnimator(this.joints);

    // 1. BASE HEAD & NOVICE FACIAL FEATURES
    const headGeo = createBeveledBox(isFemale ? 0.48 : 0.5, isFemale ? 0.48 : 0.5, isFemale ? 0.48 : 0.5, 0.04);
    const head = new THREE.Mesh(headGeo, this.headMat);
    head.position.set(0, 0.15, 0);
    headJoint.add(head);

    // Procedural Voxel Hair Generator — 4 Styles: short | shaggy | spiked | long
    if (hairStyle === 'long' || (isFemale && hairStyle !== 'shaggy' && hairStyle !== 'spiked' && hairStyle !== 'short')) {
      const topHair = new THREE.Mesh(createBeveledBox(0.52, 0.14, 0.52), this.hairMat);
      topHair.position.set(0, 0.34, 0);
      this.hairGroup.add(topHair);

      const backHairLong = new THREE.Mesh(createBeveledBox(0.50, 0.68, 0.14), this.hairMat);
      backHairLong.position.set(0, 0.01, -0.20);
      this.hairGroup.add(backHairLong);

      const leftFrontStrand = new THREE.Mesh(createBeveledBox(0.10, 0.52, 0.14), this.hairMat);
      leftFrontStrand.position.set(0.21, 0.09, 0.18);
      this.hairGroup.add(leftFrontStrand);

      const rightFrontStrand = new THREE.Mesh(createBeveledBox(0.10, 0.52, 0.14), this.hairMat);
      rightFrontStrand.position.set(-0.21, 0.09, 0.18);
      this.hairGroup.add(rightFrontStrand);

      const frontFringe = new THREE.Mesh(createBeveledBox(0.44, 0.10, 0.12), this.hairMat);
      frontFringe.position.set(0, 0.34, 0.20);
      this.hairGroup.add(frontFringe);
    } else if (hairStyle === 'shaggy') {
      const topCap = new THREE.Mesh(createBeveledBox(0.54, 0.15, 0.54), this.hairMat);
      topCap.position.set(0, 0.35, 0);
      this.hairGroup.add(topCap);

      const tuftLeft = new THREE.Mesh(createBeveledBox(0.20, 0.12, 0.24), this.hairMat);
      tuftLeft.position.set(0.12, 0.45, 0.05);
      this.hairGroup.add(tuftLeft);

      const tuftRight = new THREE.Mesh(createBeveledBox(0.22, 0.10, 0.20), this.hairMat);
      tuftRight.position.set(-0.10, 0.43, 0.14);
      this.hairGroup.add(tuftRight);

      const tuftBack = new THREE.Mesh(createBeveledBox(0.24, 0.12, 0.20), this.hairMat);
      tuftBack.position.set(0, 0.44, -0.12);
      this.hairGroup.add(tuftBack);

      const shaggyBack = new THREE.Mesh(createBeveledBox(0.54, 0.38, 0.14), this.hairMat);
      shaggyBack.position.set(0, 0.17, -0.21);
      this.hairGroup.add(shaggyBack);

      const leftWildBangs = new THREE.Mesh(createBeveledBox(0.14, 0.38, 0.18), this.hairMat);
      leftWildBangs.position.set(0.22, 0.15, 0.18);
      this.hairGroup.add(leftWildBangs);

      const rightWildBangs = new THREE.Mesh(createBeveledBox(0.14, 0.34, 0.18), this.hairMat);
      rightWildBangs.position.set(-0.22, 0.17, 0.18);
      this.hairGroup.add(rightWildBangs);

      const frontFringe = new THREE.Mesh(createBeveledBox(0.48, 0.14, 0.16), this.hairMat);
      frontFringe.position.set(0.02, 0.33, 0.21);
      this.hairGroup.add(frontFringe);
    } else if (hairStyle === 'spiked') {
      const topCap = new THREE.Mesh(createBeveledBox(0.52, 0.14, 0.52), this.hairMat);
      topCap.position.set(0, 0.35, 0);
      this.hairGroup.add(topCap);

      const centerSpike = new THREE.Mesh(createBeveledBox(0.14, 0.26, 0.18), this.hairMat);
      centerSpike.position.set(0, 0.51, 0.02);
      this.hairGroup.add(centerSpike);

      const leftSpike = new THREE.Mesh(createBeveledBox(0.12, 0.22, 0.16), this.hairMat);
      leftSpike.position.set(0.16, 0.48, 0.04);
      this.hairGroup.add(leftSpike);

      const rightSpike = new THREE.Mesh(createBeveledBox(0.12, 0.22, 0.16), this.hairMat);
      rightSpike.position.set(-0.16, 0.48, 0.04);
      this.hairGroup.add(rightSpike);

      const frontSpike = new THREE.Mesh(createBeveledBox(0.12, 0.20, 0.16), this.hairMat);
      frontSpike.position.set(0, 0.47, 0.18);
      this.hairGroup.add(frontSpike);

      const backSpike = new THREE.Mesh(createBeveledBox(0.12, 0.18, 0.16), this.hairMat);
      backSpike.position.set(0, 0.46, -0.14);
      this.hairGroup.add(backSpike);

      const taperedBack = new THREE.Mesh(createBeveledBox(0.52, 0.24, 0.10), this.hairMat);
      taperedBack.position.set(0, 0.25, -0.21);
      this.hairGroup.add(taperedBack);

      const leftSideburn = new THREE.Mesh(createBeveledBox(0.08, 0.20, 0.12), this.hairMat);
      leftSideburn.position.set(0.22, 0.23, 0.16);
      this.hairGroup.add(leftSideburn);

      const rightSideburn = new THREE.Mesh(createBeveledBox(0.08, 0.20, 0.12), this.hairMat);
      rightSideburn.position.set(-0.22, 0.23, 0.16);
      this.hairGroup.add(rightSideburn);
    } else {
      // Short Cropped Hair (Default)
      const topHair = new THREE.Mesh(createBeveledBox(0.53, 0.16, 0.53), this.hairMat);
      topHair.position.set(0, 0.35, 0);
      this.hairGroup.add(topHair);

      const backHair = new THREE.Mesh(createBeveledBox(0.53, 0.30, 0.12), this.hairMat);
      backHair.position.set(0, 0.23, -0.21);
      this.hairGroup.add(backHair);

      const leftBangs = new THREE.Mesh(createBeveledBox(0.12, 0.28, 0.16), this.hairMat);
      leftBangs.position.set(0.22, 0.21, 0.18);
      this.hairGroup.add(leftBangs);

      const rightBangs = new THREE.Mesh(createBeveledBox(0.12, 0.28, 0.16), this.hairMat);
      rightBangs.position.set(-0.22, 0.21, 0.18);
      this.hairGroup.add(rightBangs);

      const frontFringe = new THREE.Mesh(createBeveledBox(0.46, 0.12, 0.14), this.hairMat);
      frontFringe.position.set(0, 0.35, 0.20);
      this.hairGroup.add(frontFringe);
    }

    headJoint.add(this.hairGroup);

    // Face geometry — adapts expression to body type
    const faceZ = isFemale ? 0.242 : 0.252;
    const eyeW = isFemale ? 0.12 : 0.11;
    const eyeH = isFemale ? 0.055 : 0.06;
    const pupilS = isFemale ? 0.045 : 0.05;
    const browH = isFemale ? 0.028 : 0.035;
    const browY = isFemale ? 0.215 : 0.225;
    const eyeSpacing = isFemale ? 0.10 : 0.11;

    // Left Eye
    const eyeLeftWhite = new THREE.Mesh(new THREE.BoxGeometry(eyeW, eyeH, 0.02), this.eyeWhiteMat);
    eyeLeftWhite.position.set(eyeSpacing, 0.17, faceZ);
    this.faceGroup.add(eyeLeftWhite);

    const eyeLeftPupil = new THREE.Mesh(new THREE.BoxGeometry(pupilS, pupilS, 0.03), this.eyePupilMat);
    eyeLeftPupil.position.set(eyeSpacing + 0.01, 0.165, faceZ + 0.002);
    this.faceGroup.add(eyeLeftPupil);

    const lidMat = new THREE.MeshStandardMaterial({ color: isFemale ? 0x6b3a5c : 0x78350f, roughness: 0.7 });
    const lidLeft = new THREE.Mesh(new THREE.BoxGeometry(eyeW + 0.01, 0.025, 0.025), lidMat);
    lidLeft.position.set(eyeSpacing, 0.202, faceZ + 0.003);
    this.faceGroup.add(lidLeft);

    const browLeft = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.12 : 0.13, browH, 0.02), this.browMat);
    browLeft.position.set(eyeSpacing, browY, faceZ + 0.002);
    this.faceGroup.add(browLeft);

    // Right Eye
    const eyeRightWhite = new THREE.Mesh(new THREE.BoxGeometry(eyeW, eyeH, 0.02), this.eyeWhiteMat);
    eyeRightWhite.position.set(-eyeSpacing, 0.17, faceZ);
    this.faceGroup.add(eyeRightWhite);

    const eyeRightPupil = new THREE.Mesh(new THREE.BoxGeometry(pupilS, pupilS, 0.03), this.eyePupilMat);
    eyeRightPupil.position.set(-eyeSpacing + 0.01, 0.165, faceZ + 0.002);
    this.faceGroup.add(eyeRightPupil);

    const lidRight = new THREE.Mesh(new THREE.BoxGeometry(eyeW + 0.01, 0.025, 0.025), lidMat);
    lidRight.position.set(-eyeSpacing, 0.202, faceZ + 0.003);
    this.faceGroup.add(lidRight);

    const browRight = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.12 : 0.13, browH, 0.02), this.browMat);
    browRight.position.set(-eyeSpacing, browY, faceZ + 0.002);
    this.faceGroup.add(browRight);

    // Mouth
    const mouthW = isFemale ? 0.12 : 0.16;
    const mouthH = isFemale ? 0.025 : 0.03;
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(mouthW, mouthH, 0.02), this.mouthMat);
    mouth.position.set(0, 0.06, faceZ);
    this.faceGroup.add(mouth);

    if (isFemale) {
      const lashMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.4 });
      const lashL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), lashMat);
      lashL.position.set(eyeSpacing + eyeW * 0.5, 0.195, faceZ + 0.005);
      this.faceGroup.add(lashL);
      const lashR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), lashMat);
      lashR.position.set(-eyeSpacing - eyeW * 0.5, 0.195, faceZ + 0.005);
      this.faceGroup.add(lashR);
    }

    headJoint.add(this.faceGroup);

    // 2. ANATOMICAL TORSO
    const chestW = isFemale ? 0.52 : 0.57;
    const chestD = isFemale ? 0.28 : 0.30;
    const shoulderCapW = isFemale ? 0.12 : 0.16;
    const shoulderCapX = isFemale ? 0.30 : 0.33;
    const creaseW = isFemale ? 0.44 : 0.50;
    const creaseD = isFemale ? 0.22 : 0.24;
    const abdomenW = isFemale ? 0.50 : 0.53;
    const abdomenD = isFemale ? 0.26 : 0.26;

    const upperChestGeo = createBeveledBox(chestW, 0.38, chestD, 0.04);
    const upperChest = new THREE.Mesh(upperChestGeo, this.torsoMat);
    upperChest.position.set(0, 0.175, 0);
    torsoJoint.add(upperChest);

    if (isFemale) {
      const bustGeo = createBeveledBox(0.16, 0.14, 0.06, 0.02);
      const bustLeft = new THREE.Mesh(bustGeo, this.torsoMat);
      bustLeft.position.set(0.10, 0.195, 0.16);
      torsoJoint.add(bustLeft);
      const bustRight = new THREE.Mesh(bustGeo, this.torsoMat);
      bustRight.position.set(-0.10, 0.195, 0.16);
      torsoJoint.add(bustRight);

      const bustDetailMat = new THREE.MeshStandardMaterial({ color: 0x283548, roughness: 0.5 });
      const bustDetailGeo = createBeveledBox(0.10, 0.08, 0.02, 0.01);
      const bdL = new THREE.Mesh(bustDetailGeo, bustDetailMat);
      bdL.position.set(0.10, 0.205, 0.195);
      torsoJoint.add(bdL);
      const bdR = new THREE.Mesh(bustDetailGeo, bustDetailMat);
      bdR.position.set(-0.10, 0.205, 0.195);
      torsoJoint.add(bdR);
    } else {
      const pecGeo = createBeveledBox(0.44, 0.20, 0.06, 0.02);
      const pecPlate = new THREE.Mesh(pecGeo, this.torsoMat);
      pecPlate.position.set(0, 0.205, 0.17);
      torsoJoint.add(pecPlate);

      const pecDetailGeo = createBeveledBox(0.18, 0.14, 0.02, 0.01);
      const pecDetailMat = new THREE.MeshStandardMaterial({ color: 0x283548, roughness: 0.5 });
      const leftPecDetail = new THREE.Mesh(pecDetailGeo, pecDetailMat);
      leftPecDetail.position.set(0.10, 0.215, 0.205);
      torsoJoint.add(leftPecDetail);

      const rightPecDetail = new THREE.Mesh(pecDetailGeo, pecDetailMat);
      rightPecDetail.position.set(-0.10, 0.215, 0.205);
      torsoJoint.add(rightPecDetail);
    }

    const midCrease = new THREE.Mesh(createBeveledBox(creaseW, 0.06, creaseD, 0.015), this.torsoMat);
    midCrease.position.set(0, -0.035, 0);
    torsoJoint.add(midCrease);

    const abdomen = new THREE.Mesh(createBeveledBox(abdomenW, 0.30, abdomenD, 0.035), this.torsoMat);
    abdomen.position.set(0, -0.195, 0);
    torsoJoint.add(abdomen);

    if (isFemale) {
      const hipFlare = new THREE.Mesh(createBeveledBox(0.56, 0.10, 0.28, 0.02), this.torsoMat);
      hipFlare.position.set(0, -0.355, 0);
      torsoJoint.add(hipFlare);
    }

    const tunicCollar = new THREE.Mesh(createBeveledBox(0.32, 0.16, 0.04, 0.015), this.tunicCollarMat);
    tunicCollar.position.set(0, 0.295, 0.16);
    torsoJoint.add(tunicCollar);

    const beltW = isFemale ? 0.52 : 0.57;
    const belt = new THREE.Mesh(createBeveledBox(beltW, 0.11, 0.30, 0.02), this.beltMat);
    belt.position.set(0, -0.335, 0);
    torsoJoint.add(belt);

    const beltBuckle = new THREE.Mesh(createBeveledBox(0.14, 0.13, 0.04, 0.015), this.buckleMat);
    beltBuckle.position.set(0, -0.335, 0.14);
    torsoJoint.add(beltBuckle);

    // 3. SEGMENTED ARMS (Joint-based)
    const armW = isFemale ? 0.21 : 0.24;
    const upperArmGeo = createBeveledBox(armW, 0.36, armW, 0.035);

    // Left Upper Arm & Shoulder Cap
    const leftUpperArm = new THREE.Mesh(upperArmGeo, this.leftArmMat);
    leftUpperArm.position.set(0, -0.18, 0);
    leftShoulderJoint.add(leftUpperArm);

    const leftShoulderCap = new THREE.Mesh(createBeveledBox(shoulderCapW, 0.14, 0.28, 0.02), this.torsoMat);
    leftShoulderCap.position.set(0, 0.02, 0);
    leftShoulderJoint.add(leftShoulderCap);

    // Left Elbow & Forearm
    const elbowW = isFemale ? 0.17 : 0.20;
    const elbowGeo = createBeveledBox(elbowW, 0.06, elbowW, 0.015);
    const leftElbow = new THREE.Mesh(elbowGeo, this.leftArmMat);
    leftElbow.position.set(0, 0.03, 0);
    leftElbowJoint.add(leftElbow);

    const forearmGeo = createBeveledBox(armW, 0.30, armW, 0.035);
    const leftForearm = new THREE.Mesh(forearmGeo, this.leftArmMat);
    leftForearm.position.set(0, -0.15, 0);
    leftElbowJoint.add(leftForearm);

    const leftCuff = new THREE.Mesh(createBeveledBox(0.26, 0.10, 0.26, 0.02), this.cuffMat);
    leftCuff.position.set(0, -0.31, 0);
    leftElbowJoint.add(leftCuff);

    // Right Upper Arm & Shoulder Cap
    const rightUpperArm = new THREE.Mesh(upperArmGeo, this.rightArmMat);
    rightUpperArm.position.set(0, -0.18, 0);
    rightShoulderJoint.add(rightUpperArm);

    const rightShoulderCap = new THREE.Mesh(createBeveledBox(shoulderCapW, 0.14, 0.28, 0.02), this.torsoMat);
    rightShoulderCap.position.set(0, 0.02, 0);
    rightShoulderJoint.add(rightShoulderCap);

    // Right Elbow & Forearm
    const rightElbow = new THREE.Mesh(elbowGeo, this.rightArmMat);
    rightElbow.position.set(0, 0.03, 0);
    rightElbowJoint.add(rightElbow);

    const rightForearm = new THREE.Mesh(forearmGeo, this.rightArmMat);
    rightForearm.position.set(0, -0.15, 0);
    rightElbowJoint.add(rightForearm);

    const rightCuff = new THREE.Mesh(createBeveledBox(0.26, 0.10, 0.26, 0.02), this.cuffMat);
    rightCuff.position.set(0, -0.31, 0);
    rightElbowJoint.add(rightCuff);

    // 4. SEGMENTED LEGS (Joint-based)
    const thighGeo = createBeveledBox(0.26, 0.34, 0.26, 0.035);

    // Left Thigh
    const leftThigh = new THREE.Mesh(thighGeo, this.leftLegMat);
    leftThigh.position.set(0, -0.17, 0);
    leftHipJoint.add(leftThigh);

    // Left Knee & Calf & Boot
    const kneeGeo = createBeveledBox(0.22, 0.06, 0.22, 0.015);
    const leftKnee = new THREE.Mesh(kneeGeo, this.leftLegMat);
    leftKnee.position.set(0, 0.03, 0);
    leftKneeJoint.add(leftKnee);

    const calfGeo = createBeveledBox(0.26, 0.28, 0.26, 0.035);
    const leftCalf = new THREE.Mesh(calfGeo, this.leftLegMat);
    leftCalf.position.set(0, -0.14, 0);
    leftKneeJoint.add(leftCalf);

    const bootAnkleGeo = createBeveledBox(0.30, 0.12, 0.30, 0.025);
    const leftBootAnkle = new THREE.Mesh(bootAnkleGeo, this.bootMat);
    leftBootAnkle.position.set(0, -0.28, 0);
    leftKneeJoint.add(leftBootAnkle);

    const bootSoleGeo = createBeveledBox(0.32, 0.08, 0.32, 0.02);
    const leftBootSole = new THREE.Mesh(bootSoleGeo, this.bootMat);
    leftBootSole.position.set(0, -0.36, 0);
    leftKneeJoint.add(leftBootSole);

    const bootToeGeo = createBeveledBox(0.24, 0.10, 0.10, 0.02);
    const leftBootToe = new THREE.Mesh(bootToeGeo, this.bootMat);
    leftBootToe.position.set(0, -0.34, 0.18);
    leftKneeJoint.add(leftBootToe);

    // Right Thigh
    const rightThigh = new THREE.Mesh(thighGeo, this.rightLegMat);
    rightThigh.position.set(0, -0.17, 0);
    rightHipJoint.add(rightThigh);

    // Right Knee & Calf & Boot
    const rightKnee = new THREE.Mesh(kneeGeo, this.rightLegMat);
    rightKnee.position.set(0, 0.03, 0);
    rightKneeJoint.add(rightKnee);

    const rightCalf = new THREE.Mesh(calfGeo, this.rightLegMat);
    rightCalf.position.set(0, -0.14, 0);
    rightKneeJoint.add(rightCalf);

    const rightBootAnkle = new THREE.Mesh(bootAnkleGeo, this.bootMat);
    rightBootAnkle.position.set(0, -0.28, 0);
    rightKneeJoint.add(rightBootAnkle);

    const rightBootSole = new THREE.Mesh(bootSoleGeo, this.bootMat);
    rightBootSole.position.set(0, -0.36, 0);
    rightKneeJoint.add(rightBootSole);

    const rightBootToe = new THREE.Mesh(bootToeGeo, this.bootMat);
    rightBootToe.position.set(0, -0.34, 0.18);
    rightKneeJoint.add(rightBootToe);

    // 5. HELMET
    const helmBaseGeo = createBeveledBox(0.54, 0.54, 0.54, 0.045);
    const helmBase = new THREE.Mesh(helmBaseGeo, this.armorBaseMat);
    helmBase.position.set(0, 0.17, 0);
    this.helmetGroup.add(helmBase);

    const visorGeo = createBeveledBox(0.42, 0.08, 0.04, 0.015);
    this.visorMesh = new THREE.Mesh(visorGeo, this.armorGlowMat);
    this.visorMesh.position.set(0, 0.21, 0.26);
    this.helmetGroup.add(this.visorMesh);

    const crestGeo = createBeveledBox(0.06, 0.22, 0.44, 0.02);
    this.crestMesh = new THREE.Mesh(crestGeo, this.armorTrimMat);
    this.crestMesh.position.set(0, 0.51, 0);
    this.helmetGroup.add(this.crestMesh);

    headJoint.add(this.helmetGroup);

    // 6. CHESTPLATE & CORE GEM
    const chestPlateGeo = createBeveledBox(0.66, 0.8, 0.36, 0.05);
    const chestPlate = new THREE.Mesh(chestPlateGeo, this.armorBaseMat);
    chestPlate.position.set(0, 0, 0);
    this.chestGroup.add(chestPlate);

    const collarGeo = createBeveledBox(0.58, 0.08, 0.38, 0.02);
    const collar = new THREE.Mesh(collarGeo, this.armorTrimMat);
    collar.position.set(0, 0.385, 0);
    this.chestGroup.add(collar);

    const coreFrameGeo = createBeveledBox(0.24, 0.24, 0.04, 0.02);
    const coreFrame = new THREE.Mesh(coreFrameGeo, this.armorTrimMat);
    coreFrame.position.set(0, 0.075, 0.19);
    this.chestGroup.add(coreFrame);

    const coreGemGeo = createBeveledBox(0.16, 0.16, 0.06, 0.02);
    this.coreGemMesh = new THREE.Mesh(coreGemGeo, this.armorGlowMat);
    this.coreGemMesh.position.set(0, 0.075, 0.2);
    this.chestGroup.add(this.coreGemMesh);

    torsoJoint.add(this.chestGroup);

    // 7. PAULDRONS
    const pauldronGeo = createBeveledBox(0.42, 0.35, 0.38, 0.04);
    const leftPauldron = new THREE.Mesh(pauldronGeo, this.armorBaseMat);
    leftPauldron.position.set(0.08, 0.01, 0);
    const leftPauldronTrim = new THREE.Mesh(createBeveledBox(0.44, 0.08, 0.4, 0.02), this.armorTrimMat);
    leftPauldronTrim.position.set(0.08, -0.14, 0);
    const leftPauldronGlow = new THREE.Mesh(createBeveledBox(0.12, 0.12, 0.04, 0.015), this.armorGlowMat);
    leftPauldronGlow.position.set(0.30, 0.01, 0);
    this.leftPuldronGroup.add(leftPauldron);
    this.leftPuldronGroup.add(leftPauldronTrim);
    this.leftPuldronGroup.add(leftPauldronGlow);
    leftShoulderJoint.add(this.leftPuldronGroup);

    const rightPauldron = new THREE.Mesh(pauldronGeo, this.armorBaseMat);
    rightPauldron.position.set(-0.08, 0.01, 0);
    const rightPauldronTrim = new THREE.Mesh(createBeveledBox(0.44, 0.08, 0.4, 0.02), this.armorTrimMat);
    rightPauldronTrim.position.set(-0.08, -0.14, 0);
    const rightPauldronGlow = new THREE.Mesh(createBeveledBox(0.12, 0.12, 0.04, 0.015), this.armorGlowMat);
    rightPauldronGlow.position.set(-0.30, 0.01, 0);
    this.rightPuldronGroup.add(rightPauldron);
    this.rightPuldronGroup.add(rightPauldronTrim);
    this.rightPuldronGroup.add(rightPauldronGlow);
    rightShoulderJoint.add(this.rightPuldronGroup);

    // 8. FLOWING CAPE
    const capeGeo = createBeveledBox(0.65, 1.2, 0.04, 0.015);
    const cape = new THREE.Mesh(capeGeo, this.capeMat);
    cape.position.set(0, -0.255, -0.2);
    cape.rotation.x = 0.12;
    this.capeGroup.add(cape);
    torsoJoint.add(this.capeGroup);

    // 9. GREATSWORD WEAPON
    const handleGeo = createBeveledBox(0.06, 0.35, 0.06, 0.015);
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0x334155 }));
    handle.position.set(-0.25, -0.275, 0);
    this.weaponGroup.add(handle);

    const guardGeo = createBeveledBox(0.48, 0.08, 0.12, 0.02);
    const guard = new THREE.Mesh(guardGeo, this.armorTrimMat);
    guard.position.set(-0.25, -0.125, 0);
    this.weaponGroup.add(guard);

    const bladeGeo = createBeveledBox(0.14, 1.3, 0.04, 0.015);
    this.bladeMesh = new THREE.Mesh(bladeGeo, this.swordBladeMat);
    this.bladeMesh.position.set(-0.25, 0.525, 0);
    this.weaponGroup.add(this.bladeMesh);

    const bladeGlowGeo = createBeveledBox(0.06, 1.1, 0.06, 0.015);
    this.bladeGlowMesh = new THREE.Mesh(bladeGlowGeo, this.swordGlowMat);
    this.bladeGlowMesh.position.set(-0.25, 0.525, 0);
    this.weaponGroup.add(this.bladeGlowMesh);

    rightShoulderJoint.add(this.weaponGroup);

    // Position character group at origin Y=0 (feet flush to ground)
    this.characterGroup.position.set(0, 0, 0);
  }

  public updateFromSettings(settings: GameSettings) {
    if (!settings) return;

    const gender = settings.gender || settings.bodyType || 'male';
    const ethnicity = settings.ethnicity || 'white';
    const race = settings.race || 'human';
    const targetPath = this.getAvatarPath(gender, ethnicity, race);

    if (this.currentAvatarPath !== targetPath) {
      this.loadMeshyModel(targetPath, settings);
    }

    if (this.meshyModel) {
      if (this.proceduralRootGroup) {
        this.proceduralRootGroup.visible = false;
      }
      if (this.meshyModel.parent !== this.characterGroup) {
        this.characterGroup.add(this.meshyModel);
      }
      this.applyCustomizationToMeshyModel(this.meshyModel, settings);
      return;
    }

    // 0. Body Type & Hair Style — rebuild geometry if changed
    const bt = settings.bodyType || 'male';
    const hs = settings.hairStyle || 'short';
    if (bt !== this.currentBodyType || hs !== this.currentHairStyle) {
      this.rebuildCharacter(bt, hs);
    }

    // 1. Base Colors
    if (settings.characterColors) {
      this.headMat.color.set(settings.characterColors.head);
      this.hairMat.color.set(settings.characterColors.hair || '#78350f');
      this.browMat.color.set(settings.characterColors.hair || '#78350f');
      this.torsoMat.color.set(settings.characterColors.torso);
      this.leftArmMat.color.set(settings.characterColors.leftArm);
      this.rightArmMat.color.set(settings.characterColors.rightArm || settings.characterColors.leftArm);
      this.leftLegMat.color.set(settings.characterColors.leftLeg);
      this.rightLegMat.color.set(settings.characterColors.rightLeg || settings.characterColors.leftLeg);
    }

    // 2. Armor Tier Presets
    const tier: ArmorTier = settings.armorTier || 'none';

    if (tier === 'none') {
      this.hairGroup.visible = true;
      this.faceGroup.visible = true;
      this.helmetGroup.visible = false;
      this.chestGroup.visible = false;
      this.leftPuldronGroup.visible = false;
      this.rightPuldronGroup.visible = false;
      this.capeGroup.visible = false;
      this.weaponGroup.visible = false;
    } else if (tier === 'iron') {
      this.hairGroup.visible = false;
      this.faceGroup.visible = false;
      this.helmetGroup.visible = true;
      this.visorMesh.visible = false;
      this.crestMesh.visible = false;

      this.chestGroup.visible = true;
      this.coreGemMesh.visible = false;

      this.leftPuldronGroup.visible = false;
      this.rightPuldronGroup.visible = false;
      this.capeGroup.visible = false;

      this.weaponGroup.visible = settings.showWeapon !== false;
      this.bladeGlowMesh.visible = false;
      this.bladeMesh.scale.set(0.85, 0.75, 0.85);

      this.armorBaseMat.color.set('#64748b');
      this.armorTrimMat.color.set('#94a3b8');
    } else if (tier === 'super_knight') {
      this.hairGroup.visible = false;
      this.faceGroup.visible = false;
      this.helmetGroup.visible = true;
      this.visorMesh.visible = true;
      this.crestMesh.visible = true;

      this.chestGroup.visible = true;
      this.coreGemMesh.visible = true;

      this.leftPuldronGroup.visible = true;
      this.rightPuldronGroup.visible = true;
      this.capeGroup.visible = settings.showCape !== false;

      this.weaponGroup.visible = settings.showWeapon !== false;
      this.bladeGlowMesh.visible = true;
      this.bladeMesh.scale.set(1, 1, 1);

      this.armorBaseMat.color.set('#94a3b8');
      this.armorTrimMat.color.set(settings.armorTrimColor || '#eab308');
      this.armorGlowMat.color.set(settings.armorGlowColor || '#06b6d4');
      this.swordGlowMat.color.set(settings.armorGlowColor || '#06b6d4');
      this.capeMat.color.set('#1e1b4b');
    } else if (tier === 'nether_lord') {
      this.hairGroup.visible = false;
      this.faceGroup.visible = false;
      this.helmetGroup.visible = true;
      this.visorMesh.visible = true;
      this.crestMesh.visible = true;

      this.chestGroup.visible = true;
      this.coreGemMesh.visible = true;

      this.leftPuldronGroup.visible = true;
      this.rightPuldronGroup.visible = true;
      this.capeGroup.visible = settings.showCape !== false;

      this.weaponGroup.visible = settings.showWeapon !== false;
      this.bladeGlowMesh.visible = true;
      this.bladeMesh.scale.set(1, 1, 1);

      this.armorBaseMat.color.set('#18181b');
      this.armorTrimMat.color.set('#991b1b');
      this.armorGlowMat.color.set('#ef4444');
      this.swordGlowMat.color.set('#ef4444');
      this.capeMat.color.set('#450a0a');
    }
  }

  public updateColors(colors: CharacterColors) {
    if (!colors) return;
    this.headMat.color.set(colors.head);
    if (colors.hair) {
      this.hairMat.color.set(colors.hair);
      this.browMat.color.set(colors.hair);
    }
    this.torsoMat.color.set(colors.torso);
    this.leftArmMat.color.set(colors.leftArm);
    this.rightArmMat.color.set(colors.rightArm || colors.leftArm);
    this.leftLegMat.color.set(colors.leftLeg);
    this.rightLegMat.color.set(colors.rightLeg || colors.leftLeg);
  }

  public forceResize() {
    this.onResize();
  }

  private onResize() {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth || 300;
    const h = this.container.clientHeight || 300;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Applies procedural additive rotation to the neck and head bones.
   * This allows the avatar's head to dynamically look toward the movement/camera
   * direction even when the body is in a sideways surfing stance or animated state.
   */
  public applyHeadLookAt(): void {
    if (!this.meshyModel) return;
    if (this.currentActionName === 'dead' || this.currentActionName === 'dodge_roll' || this.currentActionName === 'cloud_surf') return;

    if (!this.headBone) this.headBone = this.meshyModel.getObjectByName('Head') || null;
    if (!this.neckBone) this.neckBone = this.meshyModel.getObjectByName('neck') || null;

    // Safety anatomical bounds so head never rotates backwards or snaps neck
    const safeYaw = THREE.MathUtils.clamp(this.headYaw, -Math.PI * 0.35, Math.PI * 0.35);
    const safePitch = THREE.MathUtils.clamp(this.headPitch, -0.60, 0.66);

    if (Math.abs(safeYaw) < 0.001 && Math.abs(safePitch) < 0.001) return;

    // Distribute rotation naturally across neck (30%) and head (70%)
    const neckYaw = safeYaw * 0.30;
    const headYaw = safeYaw * 0.70;
    const neckPitch = safePitch * 0.30;
    const headPitch = safePitch * 0.70;

    // Local pitch: rotation around X axis (pointing right)
    // Local yaw: rotation around Y axis (pointing up)
    if (this.neckBone) {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), neckYaw);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -neckPitch);
      const qCombined = new THREE.Quaternion().multiplyQuaternions(qYaw, qPitch);
      this.neckBone.quaternion.multiply(qCombined);
    }

    if (this.headBone) {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headYaw);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -headPitch);
      const qCombined = new THREE.Quaternion().multiplyQuaternions(qYaw, qPitch);
      this.headBone.quaternion.multiply(qCombined);
    }
  }

  public update(dt: number, currentVelocity: number = 0): void {
    if (this.proceduralRootGroup && this.meshyModel) {
      this.proceduralRootGroup.visible = false;
    }
    if (this.meshyMixer) {
      let timeScale = 1.0;
      if (this.currentActionName === 'walk' || this.currentActionName === 'torch_walk') {
        const refSpeed = 3.5;
        timeScale = currentVelocity > 0.05 ? currentVelocity / refSpeed : 1.0;
      } else if (this.currentActionName === 'run') {
        const refSpeed = 6.825;
        timeScale = currentVelocity > 0.05 ? currentVelocity / refSpeed : 1.0;
      } else if (this.currentActionName === 'walk_step_up') {
        timeScale = 1.0; // Natural 1.0x playback rate for full step detail
      } else if (this.currentActionName === 'run_step_up') {
        timeScale = 1.15; // Natural sprint step-up pace
      }
      this.meshyMixer.timeScale = THREE.MathUtils.clamp(timeScale, 0.45, 3.8);
      this.meshyMixer.update(dt);

      // Procedural skeletal look-at tracking constraint
      this.applyHeadLookAt();
    }
  }

  private animate = () => {
    if (!this.container || !this.renderer) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    if (this.animator) {
      this.animator.update(delta);
    }

    if (this.meshyMixer) {
      this.meshyMixer.update(delta);
      this.applyHeadLookAt();
    }

    if (this.autoRotate) {
      this.characterGroup.rotation.y += 0.012;
    }
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Public disposal handler for clean lifecycle teardown.
   */
  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.disposeCurrentMeshyModel();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }
}
