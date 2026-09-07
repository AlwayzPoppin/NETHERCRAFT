import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { SoundManager } from '../audio/SoundManager';
import { DragonFireball } from './DragonFireball';
import { BlockType } from '../textures/TextureGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { disposeHierarchy } from '../utils/DisposeUtils';
import { EntityCuller } from '../utils/EntityCuller';
import { ModelCache } from '../utils/ModelCache';

export enum DragonState {
  STALKING_ORBIT = 'STALKING_ORBIT',
  ATTACK_RANGED = 'ATTACK_RANGED',
  EMBER_SWEEP = 'EMBER_SWEEP',
  SWOOP_DIVE_CHARGE = 'SWOOP_DIVE_CHARGE',
  GRAB_LIFT = 'GRAB_LIFT',
  GROUND_LANDING = 'GROUND_LANDING',
  GROUND_FATIGUED = 'GROUND_FATIGUED',
  GROUND_RUN_AND_BITE = 'GROUND_RUN_AND_BITE',
  GROUND_STAGGERED = 'GROUND_STAGGERED',
}

export class EmberwynnDragon {
  private scene: THREE.Scene;
  private particleManager: BlockParticleManager;
  private sound: SoundManager;
  private world: VoxelWorld;

  public root: THREE.Group;
  public pivotGroup: THREE.Group;
  public model: THREE.Object3D | null = null;
  private time = 0;
  
  // AI State Machine
  public state: DragonState = DragonState.STALKING_ORBIT;
  private stateTimer = 0;
  private nextAttackTime = 6;
  private attackCount = 0;
  private activeFireballs: DragonFireball[] = [];
  private fireballPool: DragonFireball[] = [];
  private orbitAngle: number = 0;

  // Ember Sweep & Swoop Dive Variables
  private sweepTimer = 0;
  private sweepStartPos = new THREE.Vector3();
  private sweepTargetPos = new THREE.Vector3();
  private sweepFlightDir = new THREE.Vector3();
  private diveTimer = 0;
  private diveStartPos = new THREE.Vector3();
  private diveTargetPos = new THREE.Vector3();
  private diveDir = new THREE.Vector3();
  private hasDealtDiveDamage = false;

  // Grab & Sky Lift Variables
  public isCarryingPlayer = false;
  public justReleasedPlayer = false;
  public mouthWorldPos = new THREE.Vector3();
  private isGrabAttempt = false;
  private grabLiftTimer = 0;

  // Ground Combat Variables
  private readonly GROUND_STANCE_HEIGHT = 3.6;
  private readonly STAGGERED_CHEST_HEIGHT = 1.8;
  private landingTimer = 0;
  private landingStartPos = new THREE.Vector3();
  private landingTargetPos = new THREE.Vector3();
  private biteTimer = 0;
  private biteStartPos = new THREE.Vector3();
  private biteTargetPos = new THREE.Vector3();
  private hasDealtBiteDamage = false;
  private groundOrbitAngle = 0;
  private staggerTimer = 0;
  private groundAttackCooldown = 0;
  private groundAttackCount = 0;
  public struggleCount = 0;

  // Stalking Micro-Beat Sub-State Machine (Calculated Predator Stare-Down)
  private stalkSubState: 'PROWL' | 'PAUSE_STARE' | 'FEINT' = 'PROWL';
  private stalkSubStateTimer = 0;
  private stalkOrbitDirection = 1; // 1 = counter-clockwise, -1 = clockwise
  private currentStalkRadius = 17.5; // Organically compresses inward from 17.5m down to 8.5m

  // Bones
  private leftWingChain: THREE.Bone[] = [];
  private rightWingChain: THREE.Bone[] = [];
  private tailChain: THREE.Bone[] = [];
  private neckChain: THREE.Bone[] = [];
  private headBone: THREE.Bone | null = null;

  // Leg Chains (3-bone chains for hip, knee, ankle)
  private frontLeftLegChain: THREE.Bone[] = [];
  private frontRightLegChain: THREE.Bone[] = [];
  private backLeftLegChain: THREE.Bone[] = [];
  private backRightLegChain: THREE.Bone[] = [];

  private get frontLeftLeg(): THREE.Bone | null { return this.frontLeftLegChain[0] || null; }
  private get frontRightLeg(): THREE.Bone | null { return this.frontRightLegChain[0] || null; }
  private get backLeftLeg(): THREE.Bone | null { return this.backLeftLegChain[0] || null; }
  private get backRightLeg(): THREE.Bone | null { return this.backRightLegChain[0] || null; }

  // Initial Rest Rotations & Tracking Quaternions
  private initialRotations: Map<THREE.Bone, THREE.Euler> = new Map();
  private initialQuaternions: Map<THREE.Bone, THREE.Quaternion> = new Map();
  private currentHeadQuat: THREE.Quaternion = new THREE.Quaternion();
  private currentNeckQuats: Map<THREE.Bone, THREE.Quaternion> = new Map();
  private currentLookYaw: number = 0;
  private currentLookPitch: number = 0;

  // Animation Mixer & Actions
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentActionName: string = '';

  private transitionToAction(newActionName: string, duration: number = 0.3) {
    if (!this.mixer) return;
    if (this.currentActionName === newActionName) return;

    const prevAction = this.actions.get(this.currentActionName);
    const nextAction = this.actions.get(newActionName);

    if (nextAction) {
      nextAction.reset();
      nextAction.setEffectiveTimeScale(1);
      nextAction.setEffectiveWeight(1);
      nextAction.fadeIn(duration);
      nextAction.play();

      if (prevAction) {
        prevAction.fadeOut(duration);
      }
      this.currentActionName = newActionName;
    } else if (prevAction) {
      prevAction.fadeOut(duration);
      this.currentActionName = '';
    }
  }

  constructor(scene: THREE.Scene, particleManager: BlockParticleManager, sound: SoundManager, world: VoxelWorld) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.sound = sound;
    this.world = world;
    
    // Hierarchy: scene -> root (heading & position) -> pivotGroup (local coordinate correction) -> model
    this.root = new THREE.Group();
    this.pivotGroup = new THREE.Group();
    this.root.add(this.pivotGroup);
    this.scene.add(this.root);

    // Pre-warm dragon fireball object pool for zero GC latency in combat
    for (let i = 0; i < 8; i++) {
      this.fireballPool.push(new DragonFireball(this.scene, this.particleManager, this.sound));
    }
    
    this.loadModel();
  }

  private getPooledFireball(): DragonFireball {
    const pooled = this.fireballPool.pop();
    if (pooled) return pooled;
    return new DragonFireball(this.scene, this.particleManager, this.sound);
  }

  private returnPooledFireball(fireball: DragonFireball): void {
    if (this.fireballPool.length < 24) {
      this.fireballPool.push(fireball);
    } else {
      fireball.dispose();
    }
  }

  private saveInitialRotation(bone: THREE.Bone | null) {
    if (bone) {
      this.initialRotations.set(bone, bone.rotation.clone());
      this.initialQuaternions.set(bone, bone.quaternion.clone());
    }
  }

  private findBoneChain(startName: string, count: number): THREE.Bone[] {
    const chain: THREE.Bone[] = [];
    if (!this.model) return chain;
    
    let curr = this.model.getObjectByName(startName) as THREE.Bone;
    while (curr && chain.length < count) {
      chain.push(curr);
      this.saveInitialRotation(curr);
      if (curr.children && curr.children.length > 0 && (curr.children[0] as any).isBone) {
        curr = curr.children[0] as THREE.Bone;
      } else {
        break;
      }
    }
    return chain;
  }

  private loadModel() {
    const cachedGltf = ModelCache.getGLTF('/entities/EMBERWYNN_RIGGED.glb');
    const cachedWalkGltf = ModelCache.getGLTF('/entities/EMBERWYNN DRAGON_Animation_Walking.glb');

    if (cachedGltf) {
      this.setupDragonModel(cachedGltf, cachedWalkGltf);
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      '/entities/EMBERWYNN_RIGGED.glb',
      (gltf) => {
        loader.load(
          '/entities/EMBERWYNN DRAGON_Animation_Walking.glb',
          (walkGltf) => {
            this.setupDragonModel(gltf, walkGltf);
          },
          undefined,
          () => {
            this.setupDragonModel(gltf, null);
          }
        );
      },
      undefined,
      (err) => console.warn('Could not load EMBERWYNN_RIGGED.glb:', err)
    );
  }

  private setupDragonModel(gltf: any, walkGltf?: any) {
    if (!gltf || !gltf.scene) return;
    const model = gltf.scene as THREE.Group;
    this.model = model;
    
    // Scale model
    model.scale.set(5, 5, 5); 

    // Option A: Intermediate Pivot Group Inversion
    this.pivotGroup.rotation.set(Math.PI, 0, Math.PI); 
    this.pivotGroup.updateMatrix();
    this.pivotGroup.updateMatrixWorld(true);

    // Option C: Direct Armature / Bone_000 Quaternion Inversion
    const armature = model.getObjectByName('UniRigArmature');
    if (armature) {
      armature.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
      armature.updateMatrix();
    }

    const bone000 = model.getObjectByName('Bone_000');
    if (bone000) {
      bone000.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      bone000.updateMatrix();
    }
    
    // Enable shadows and sanitize materials
    model.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => {
            if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
              if (m.emissive) m.emissive.setRGB(0, 0, 0);
              m.emissiveIntensity = 0.0;
              m.emissiveMap = null;
              m.needsUpdate = true;
            }
          });
        }
      }
    });

    // 1. True Wing Chains:
    this.leftWingChain = this.findBoneChain('Bone_050', 4);
    this.rightWingChain = this.findBoneChain('Bone_054', 4);

    // 2. Tail Chain (11 bones: Bone_027 down to Bone_017)
    this.tailChain = this.findBoneChain('Bone_027', 11);

    // 3. Neck Chain (7 bones: Bone_034 down to Bone_028)
    this.neckChain = this.findBoneChain('Bone_034', 7);
    this.headBone = model.getObjectByName('Bone_028') as THREE.Bone;
    if (this.headBone) {
      this.saveInitialRotation(this.headBone);
    }

    // 4. Map Leg Chains (3 bones per leg: hip, knee, foot)
    this.frontLeftLegChain  = this.findBoneChain('Bone_046', 3);
    this.frontRightLegChain = this.findBoneChain('Bone_040', 3);
    this.backLeftLegChain   = this.findBoneChain('Bone_011', 3);
    this.backRightLegChain  = this.findBoneChain('Bone_006', 3);

    // Setup Animation Mixer & Actions
    this.mixer = new THREE.AnimationMixer(model);
    if (gltf.animations && gltf.animations.length > 0) {
      gltf.animations.forEach((clip: THREE.AnimationClip) => {
        const action = this.mixer!.clipAction(clip);
        const name = clip.name.toLowerCase();
        this.actions.set(name, action);
        if (name.includes('flight') || name.includes('fly')) this.actions.set('flight', action);
        if (name.includes('land') || name.includes('idle') || name.includes('ground')) this.actions.set('ground_idle', action);
        if (name.includes('walk') || name.includes('run')) this.actions.set('ground_walk', action);
        if (name.includes('slam') || name.includes('attack')) this.actions.set('ground_slam', action);
      });
    }

    // Bake Programmatic 24-Frame Looping Slither Animation Clip
    const bakedSlitherClip = this.bakeSlitherAnimationClip();
    const slitherAction = this.mixer.clipAction(bakedSlitherClip);
    slitherAction.setLoop(THREE.LoopRepeat, Infinity);
    this.actions.set('slither', slitherAction);
    if (!this.actions.has('ground_walk')) {
      this.actions.set('ground_walk', slitherAction);
    }

    // Load/Retarget dedicated external Walking Animation
    if (walkGltf && walkGltf.animations && walkGltf.animations.length > 0 && this.mixer) {
      const rawWalkClip = walkGltf.animations[0];
      
      const walkRestQuats = new Map<string, THREE.Quaternion>();
      walkGltf.scene.traverse((node: any) => {
        if (node.name) {
          walkRestQuats.set(node.name, node.quaternion.clone());
        }
      });

      const legAndTailBoneMap: Record<string, string> = {
        'frontleg': 'Bone_046',
        'frontleg0': 'Bone_045',
        'frontleg1': 'Bone_044',
        'frontleg2': 'Bone_042',
        'R_frontleg': 'Bone_040',
        'R_frontleg0': 'Bone_039',
        'R_frontleg1': 'Bone_038',
        'R_frontleg2': 'Bone_036',
        'backleg': 'Bone_011',
        'backleg0': 'Bone_010',
        'backleg1': 'Bone_009',
        'backleg2': 'Bone_007',
        'R_backleg': 'Bone_006',
        'R_backleg0': 'Bone_005',
        'R_backleg1': 'Bone_004',
        'R_backleg2': 'Bone_002',
        'tail': 'Bone_027',
        'tailstart': 'Bone_025',
        'tail1': 'Bone_023',
        'tail2': 'Bone_021',
        'tail3': 'Bone_019',
      };

      const remappedTracks: THREE.KeyframeTrack[] = [];
      rawWalkClip.tracks.forEach((track: THREE.KeyframeTrack) => {
        const parts = track.name.split('.');
        const nodeName = parts[0];
        const prop = parts.slice(1).join('.');
        const targetBoneName = legAndTailBoneMap[nodeName];
        if (!targetBoneName || prop !== 'quaternion') return;

        const targetBone = this.model?.getObjectByName(targetBoneName) as THREE.Bone;
        const dstRest = targetBone ? this.initialQuaternions.get(targetBone) : null;
        const srcRest = walkRestQuats.get(nodeName) || new THREE.Quaternion();
        const srcRestInv = srcRest.clone().invert();

        if (track instanceof THREE.QuaternionKeyframeTrack && dstRest) {
          const values = track.values;
          const newValues = new Float32Array(values.length);
          for (let i = 0; i < values.length; i += 4) {
            const keyQ = new THREE.Quaternion(values[i], values[i+1], values[i+2], values[i+3]);
            const deltaQ = keyQ.clone().multiply(srcRestInv);
            const targetQ = deltaQ.multiply(dstRest.clone());
            newValues[i] = targetQ.x;
            newValues[i+1] = targetQ.y;
            newValues[i+2] = targetQ.z;
            newValues[i+3] = targetQ.w;
          }
          remappedTracks.push(new THREE.QuaternionKeyframeTrack(`${targetBoneName}.quaternion`, track.times, newValues));
        }
      });

      const walkClip = new THREE.AnimationClip('ground_walk', rawWalkClip.duration, remappedTracks);
      const walkAction = this.mixer.clipAction(walkClip);
      walkAction.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set('ground_walk', walkAction);
      this.actions.set('walk', walkAction);
    }

    const flightAction = this.actions.get('flight') || Array.from(this.actions.values())[0];
    if (flightAction) {
      flightAction.play();
      this.currentActionName = 'flight';
    }

    if (this.model) {
      this.pivotGroup.add(this.model);
    }
  }

  /**
   * Bake a 24-frame seamless looping slither animation clip using Phase Offset logic:
   * Lead Driven Variable: Node 0 (Head/Base) Rotation = Amplitude * sin(2*PI * Frequency * Time)
   * Follower Spine Rule: Bone i Rotation = Amplitude_i * sin(2*PI * Frequency * Time - i * offset_value)
   */
  public bakeSlitherAnimationClip(): THREE.AnimationClip {
    const fps = 24;
    const numFrames = 24;
    const duration = numFrames / fps; // 1.0 second loop
    const frequency = 1.0; // 1 full cycle per duration (2*PI * Frequency * duration = 2*PI -> perfect seamless loop)

    const times: number[] = [];
    for (let f = 0; f <= numFrames; f++) {
      times.push(f / fps);
    }

    const tracks: THREE.KeyframeTrack[] = [];

    const addBoneTrack = (bone: THREE.Bone, phaseDelay: number, baseAmplitude: number) => {
      const initial = this.initialRotations.get(bone) || bone.rotation.clone();
      const quaternions: number[] = [];

      for (let f = 0; f <= numFrames; f++) {
        const time = f / fps;
        // Phase Offset Formula: Rotation = Amplitude * sin(2*PI * Frequency * Time - phaseDelay)
        const angle = 2 * Math.PI * frequency * time - phaseDelay;
        const yaw = baseAmplitude * Math.sin(angle);
        const pitch = 0.04 * Math.cos(angle * 2.0);

        const euler = new THREE.Euler(
          initial.x + pitch,
          initial.y + yaw,
          initial.z,
          initial.order || 'XYZ'
        );
        const q = new THREE.Quaternion().setFromEuler(euler);
        quaternions.push(q.x, q.y, q.z, q.w);
      }

      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, quaternions));
    };

    // 1. Neck Chain Phase Offset (i * offset_value)
    const neckOffsetValue = 0.32;
    this.neckChain.forEach((bone, i) => {
      const amp = 0.16;
      addBoneTrack(bone, i * neckOffsetValue, amp);
    });

    // 2. Tail Chain Phase Offset (i * offset_value)
    const tailOffsetValue = 0.38;
    this.tailChain.forEach((bone, i) => {
      const amp = 0.18 * (1.0 + (i / Math.max(1, this.tailChain.length - 1)) * 1.2);
      addBoneTrack(bone, i * tailOffsetValue, amp);
    });

    return new THREE.AnimationClip('baked_slither', duration, tracks);
  }

  public update(dt: number, playerPos: THREE.Vector3, playerPhysics?: any) {
    if (!this.model) return;
    this.time += dt;
    this.stateTimer += dt;
    if (this.groundAttackCooldown > 0) {
      this.groundAttackCooldown -= dt;
    }

    const shouldAnimate = EntityCuller.getInstance().shouldAnimate(this.root.position, 24.0, 180.0);

    if (shouldAnimate && this.mixer) {
      this.mixer.update(dt);
    }

    // Keep pivotGroup neutral - physical ground elevation is accurately maintained on root.position.y
    this.pivotGroup.position.y = THREE.MathUtils.lerp(this.pivotGroup.position.y, 0.0, dt * 5.0);

    // --- 1. STATE MACHINE CONTROLLER ---
    if (this.state === DragonState.STALKING_ORBIT) {
      if (this.stateTimer >= this.nextAttackTime) {
        this.stateTimer = 0;
        this.attackCount++;
        
        // Dynamic Weighted Random Attack Selector
        const rand = Math.random();
        if (this.attackCount >= 4 || rand < 0.20) {
          // 20% Chance (or max 4 attacks): Gliding touchdown to Ground Assault!
          this.attackCount = 0;
          this.startGroundLanding(playerPos);
        } else if (rand < 0.45) {
          // 25% Chance: Fireball Salvo
          this.state = DragonState.ATTACK_RANGED;
          this.shootFireballSalvo(playerPos);
        } else if (rand < 0.80) {
          // 35% Chance: High-Speed Head-First Swoop Dive Charge!
          this.startSwoopDiveCharge(playerPos);
        } else {
          // 20% Chance: Low Grab Sweep (with tight grab proximity)
          this.startEmberSweep(playerPos);
        }
      }
    } else if (this.state === DragonState.ATTACK_RANGED) {
      if (this.stateTimer >= 2.5) {
        this.state = DragonState.STALKING_ORBIT;
        this.stateTimer = 0;
        this.nextAttackTime = 3.5 + Math.random() * 3.0;
      }
    } else if (this.state === DragonState.SWOOP_DIVE_CHARGE) {
      this.updateSwoopDiveCharge(dt, playerPos, playerPhysics);
    } else if (this.state === DragonState.EMBER_SWEEP) {
      this.updateEmberSweep(dt, playerPos);
    } else if (this.state === DragonState.GRAB_LIFT) {
      this.updateGrabLift(dt, playerPos);
    } else if (this.state === DragonState.GROUND_LANDING) {
      this.updateGroundLanding(dt, playerPos);
    } else if (this.state === DragonState.GROUND_FATIGUED) {
      this.updateGroundFatigued(dt, playerPos);
    } else if (this.state === DragonState.GROUND_RUN_AND_BITE) {
      this.updateGroundRunAndBite(dt, playerPos, playerPhysics);
    } else if (this.state === DragonState.GROUND_STAGGERED) {
      this.updateGroundStaggered(dt, playerPos);
    }

    // --- 2. PROCEDURAL FLIGHT & VISCERAL GROUND ANIMATION ENGINE ---
    const isGrounded = (this.state === DragonState.GROUND_FATIGUED || this.state === DragonState.GROUND_RUN_AND_BITE || this.state === DragonState.GROUND_STAGGERED);
    const isLanding = (this.state === DragonState.GROUND_LANDING);

    const flapFreq = (this.state === DragonState.EMBER_SWEEP || this.state === DragonState.GRAB_LIFT) ? 5.2 : (this.state === DragonState.ATTACK_RANGED ? 3.5 : (isLanding ? 1.5 : (isGrounded ? 0.6 : 2.2)));
    const flapPhase = this.time * flapFreq;
    const mainFlap = Math.sin(flapPhase);

    // A. Imposing & Aggressive Wing Stance (Frustum & Distance Culled)
    if (shouldAnimate) {
    const wingBreathing = Math.sin(this.time * 1.6) * 0.05;

    this.leftWingChain.forEach((bone, idx) => {
      const initial = this.initialRotations.get(bone);
      if (!initial) return;
      
      if (idx === 0) {
        // Shoulder bone controls main wing orientation
        if (this.state === DragonState.GROUND_RUN_AND_BITE) {
          // Wings tucked tightly against flanks for low-drag predatory sprint
          bone.rotation.z = initial.z - 0.45;
        } else if (this.state === DragonState.GROUND_STAGGERED) {
          bone.rotation.z = initial.z - 0.45;
        } else if (isGrounded) {
          bone.rotation.z = initial.z - 0.35 + wingBreathing;
        } else if (isLanding) {
          const foldProgress = Math.min(1.0, this.landingTimer / 0.8);
          bone.rotation.z = THREE.MathUtils.lerp(initial.z + Math.sin(flapPhase) * 0.5, initial.z - 0.35, foldProgress);
        } else {
          bone.rotation.z = initial.z + Math.sin(flapPhase) * 0.65;
        }
      } else {
        // Outer wing finger bones: gentle natural curve
        if (isGrounded) {
          bone.rotation.z = initial.z - 0.12;
        } else {
          const phaseLag = idx * 0.25;
          bone.rotation.z = initial.z + Math.sin(flapPhase - phaseLag) * 0.15;
        }
      }
    });

    this.rightWingChain.forEach((bone, idx) => {
      const initial = this.initialRotations.get(bone);
      if (!initial) return;
      
      if (idx === 0) {
        if (this.state === DragonState.GROUND_RUN_AND_BITE) {
          bone.rotation.z = initial.z + 0.45;
        } else if (this.state === DragonState.GROUND_STAGGERED) {
          bone.rotation.z = initial.z + 0.45;
        } else if (isGrounded) {
          bone.rotation.z = initial.z + 0.35 - wingBreathing;
        } else if (isLanding) {
          const foldProgress = Math.min(1.0, this.landingTimer / 0.8);
          bone.rotation.z = THREE.MathUtils.lerp(initial.z - Math.sin(flapPhase) * 0.5, initial.z + 0.35, foldProgress);
        } else {
          bone.rotation.z = initial.z - Math.sin(flapPhase) * 0.65;
        }
      } else {
        if (isGrounded) {
          bone.rotation.z = initial.z + 0.12;
        } else {
          const phaseLag = idx * 0.25;
          bone.rotation.z = initial.z - Math.sin(flapPhase - phaseLag) * 0.15;
        }
      }
    });

    // B. Procedural Serpentine Spine & Tail Sway (Multi-Harmonic Reptilian Locomotion)
    const isRunningBite = (this.state === DragonState.GROUND_RUN_AND_BITE && this.biteTimer < 1.3);
    const spineSpeed = isRunningBite ? 7.2 : (isGrounded ? 3.6 : 2.2);
    const serpentinePhase = this.time * spineSpeed;
    const isMovingOnGround = isGrounded && (this.state === DragonState.GROUND_FATIGUED || this.state === DragonState.GROUND_RUN_AND_BITE);

    // Primary + 2nd Harmonic Wave Function for Organic Weight Transfer & Ground Push-Off
    // W(t) = sin(wt) + 0.35 * sin(2*wt - PI/4)
    const primaryWave = Math.sin(serpentinePhase);
    const harmonicWave = 0.35 * Math.sin(serpentinePhase * 2.0 - Math.PI * 0.25);
    const weightShiftWave = primaryWave + harmonicWave;

    // Dynamic S-curve & Sway Amplitudes (significantly amplified for visceral sinuous locomotion)
    const isFlying = !isGrounded;
    const slitherXAmp = isFlying ? 0.0 : (isMovingOnGround ? 1.1 : 0.4); // Physical lateral center-of-mass shift (in blocks)
    const bodyRollAmp = isFlying ? 0.0 : (isMovingOnGround ? 0.14 : 0.05); // Body roll angle (radians)

    // 1. Physical Lateral Body Translation & Weight-Shift Roll (Komodo / Crocodile Slither)
    const targetPivotX = primaryWave * slitherXAmp;
    const targetBodyRoll = Math.sin(serpentinePhase + Math.PI * 0.5) * bodyRollAmp;
    
    this.pivotGroup.position.x = THREE.MathUtils.lerp(this.pivotGroup.position.x, targetPivotX, dt * 7.0);
    this.pivotGroup.rotation.z = THREE.MathUtils.lerp(this.pivotGroup.rotation.z, Math.PI + targetBodyRoll, dt * 7.0);

    // 2. Tail Serpentine S-Curve Propagation (Whip-like traveling wave from hips to tail tip)
    const totalTailBones = Math.max(1, this.tailChain.length);
    const tailBaseAmp = isFlying ? 0.02 : (isMovingOnGround ? 0.22 : 0.12); // Per-bone radians (~12-15 deg per joint!)

    this.tailChain.forEach((bone, idx) => {
      const initial = this.initialRotations.get(bone);
      if (!initial) return;

      // Phase delay increases down tail length for fluid wave propagation
      const tailPhase = serpentinePhase - idx * 0.38;
      const progress = idx / (totalTailBones - 1);
      
      // Amplitude balloons toward the tail tip for dramatic whip effect (1.0x at base -> 2.2x at tip)
      const jointAmp = tailBaseAmp * (1.0 + progress * 1.2);
      
      // Multi-harmonic serpentine yaw
      const swayY = (Math.sin(tailPhase) + 0.25 * Math.sin(tailPhase * 2.0)) * jointAmp;
      // Secondary vertical & roll ripples
      const swayZ = Math.cos(tailPhase * 0.5) * 0.08 * (1.0 + progress);
      const swayX = Math.sin(tailPhase * 0.7) * 0.06 * (1.0 + progress);

      bone.rotation.y = initial.y + swayY;
      bone.rotation.z = initial.z + swayZ;
      bone.rotation.x = initial.x + swayX;
    });

    // 3. Neck Serpentine Double S-Curve & Head Target Lock Counter-Steering
    let attackPitch = 0;
    if (this.state === DragonState.ATTACK_RANGED) {
      if (this.stateTimer < 1.0) {
        const progress = this.stateTimer / 1.0;
        attackPitch = 0.45 * Math.sin(progress * Math.PI * 0.5);
      } else {
        const progress = (this.stateTimer - 1.0) / 0.8;
        const envelope = Math.sin(Math.min(1.0, progress / 0.3) * Math.PI * 0.5) * Math.exp(-progress * 3.5);
        attackPitch = -0.55 * envelope;
      }
    } else if (this.state === DragonState.EMBER_SWEEP) {
      if (this.sweepTimer < 1.0) {
        attackPitch = -0.45; // Descending swoop head angle
      } else if (this.sweepTimer < 2.2) {
        attackPitch = -0.20; // Level forward predatory focus
      } else if (this.sweepTimer < 3.6) {
        attackPitch = 0.45;  // Climbing head posture
      } else {
        const blend = (this.sweepTimer - 3.6) / 1.0;
        attackPitch = THREE.MathUtils.lerp(0.45, 0.0, Math.min(1.0, blend));
      }
    } else if (this.state === DragonState.SWOOP_DIVE_CHARGE) {
      attackPitch = -0.65; // Extended head-first aggressive dive pitch
    } else if (this.state === DragonState.GRAB_LIFT) {
      attackPitch = 0.65;
    } else if (this.state === DragonState.GROUND_LANDING) {
      attackPitch = -0.15; // Neutral forward-downward landing neck posture
    } else if (this.state === DragonState.GROUND_RUN_AND_BITE) {
      if (this.biteTimer < 1.0) {
        attackPitch = -0.30; // Low coiled predatory sprint
      } else if (this.biteTimer < 1.3) {
        attackPitch = 0.45;  // Sudden neck raise / jaw cocking
      } else if (this.biteTimer < 1.8) {
        attackPitch = -0.90; // Vicious forward lunging bite snap!
      } else {
        attackPitch = -0.10; // Post-bite recovery
      }
    } else if (this.state === DragonState.GROUND_STAGGERED) {
      attackPitch = -0.45 + Math.sin(this.time * 1.8) * 0.25; // Deep, heavy, exhausted breathing
    } else if (this.state === DragonState.GROUND_FATIGUED) {
      if (this.stalkSubState === 'PAUSE_STARE') {
        attackPitch = -0.28; // Low menacing coiled stare-down
      } else if (this.stalkSubState === 'FEINT') {
        attackPitch = -0.42; // Aggressive forward surge posture
      } else {
        const headSway = Math.cos(this.time * 1.5) * 0.12; // Natural prowling head sway
        attackPitch = Math.sin(this.time * 2.0) * 0.08 + headSway;
      }
    }

    // --- HEAD TRACKING LOOK-AT SYSTEM WITH 90° FOV DIRECTIONAL CHECK & SLERP ---
    const isTrackingState = 
      this.state === DragonState.STALKING_ORBIT ||
      this.state === DragonState.ATTACK_RANGED ||
      this.state === DragonState.EMBER_SWEEP ||
      this.state === DragonState.SWOOP_DIVE_CHARGE ||
      this.state === DragonState.GROUND_LANDING ||
      this.state === DragonState.GROUND_RUN_AND_BITE ||
      this.state === DragonState.GROUND_FATIGUED;

    const dragonForward = new THREE.Vector3();
    this.root.getWorldDirection(dragonForward); // Returns forward direction (-Z in world space)

    const headWorldPos = new THREE.Vector3();
    if (this.headBone) {
      this.headBone.getWorldPosition(headWorldPos);
    } else {
      this.root.getWorldPosition(headWorldPos);
    }

    const playerEyePos = playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const toPlayerWorld = new THREE.Vector3().subVectors(playerEyePos, headWorldPos).normalize();

    // Directional FOV Check: dot > 0 means player is in front hemisphere (within 90° of dragon forward vector)
    const forwardDot = dragonForward.dot(toPlayerWorld);
    const isWithinFOV = forwardDot > 0.0;

    let targetLookYaw = 0;
    let targetLookPitch = 0;

    if (isTrackingState && isWithinFOV) {
      // Transform direction vector into dragon root local space
      const rootInvQuat = this.root.quaternion.clone().invert();
      const toPlayerLocal = toPlayerWorld.clone().applyQuaternion(rootInvQuat);

      // In root local coordinates: -Z is forward, +X is right, +Y is up
      const rawYaw = Math.atan2(toPlayerLocal.x, -toPlayerLocal.z);
      const horizDist = Math.sqrt(toPlayerLocal.x * toPlayerLocal.x + toPlayerLocal.z * toPlayerLocal.z);
      const rawPitch = Math.atan2(toPlayerLocal.y, Math.max(0.1, horizDist));

      // Anatomical safety limits to prevent unnatural neck strain
      targetLookYaw = THREE.MathUtils.clamp(rawYaw, -1.35, 1.35);   // Clamped to ~77°
      targetLookPitch = THREE.MathUtils.clamp(rawPitch, -0.75, 0.75); // Clamped to ~43°
    }

    // Smooth spherical interpolation (Slerp) to eliminate all jitter and smoothly return when outside FOV
    const slerpSpeed = 5.5;
    this.currentLookYaw = THREE.MathUtils.lerp(this.currentLookYaw, targetLookYaw, Math.min(1.0, dt * slerpSpeed));
    this.currentLookPitch = THREE.MathUtils.lerp(this.currentLookPitch, targetLookPitch, Math.min(1.0, dt * slerpSpeed));

    // Propagate double S-curve through neck chain while accumulating total yaw
    const totalNeckBones = Math.max(1, this.neckChain.length);
    const neckBaseAmp = isFlying ? 0.0 : (isMovingOnGround ? 0.18 : 0.09);
    let accumulatedNeckYaw = 0;

    // 40% of look-at distributed through neck chain, remaining 60% focused in head bone
    const neckShareYaw = (this.currentLookYaw * 0.40) / totalNeckBones;
    const neckSharePitch = (this.currentLookPitch * 0.40) / totalNeckBones;

    this.neckChain.forEach((bone, idx) => {
      const initial = this.initialRotations.get(bone);
      if (!initial) return;

      const neckPhase = serpentinePhase - (totalNeckBones - idx) * 0.32;
      const neckBob = (Math.sin(neckPhase) * 0.06) / totalNeckBones;
      
      // Double S-Curve modulation: lower neck sways opposite to upper neck
      const sCurveFactor = Math.cos((idx / (totalNeckBones - 1)) * Math.PI);
      const neckYaw = (Math.sin(neckPhase) + 0.3 * Math.sin(neckPhase * 2.0)) * neckBaseAmp * sCurveFactor;
      accumulatedNeckYaw += neckYaw;

      const jointPitch = (attackPitch / totalNeckBones) * 0.8;
      
      // Compute combined target Euler rotation
      const targetEuler = new THREE.Euler(
        initial.x + neckBob + jointPitch + neckSharePitch,
        initial.y + neckYaw + neckShareYaw,
        initial.z,
        'XYZ'
      );
      const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

      let currentBoneQuat = this.currentNeckQuats.get(bone);
      if (!currentBoneQuat) {
        currentBoneQuat = bone.quaternion.clone();
        this.currentNeckQuats.set(bone, currentBoneQuat);
      }
      currentBoneQuat.slerp(targetQuat, Math.min(1.0, dt * 8.0));
      bone.quaternion.copy(currentBoneQuat);
    });

    // Head Eye-Contact Tracking (Remaining 60% of tracking + counter-steer slither yaw)
    if (this.headBone) {
      const headInitial = this.initialRotations.get(this.headBone);
      if (headInitial) {
        const headTrackingYaw = this.currentLookYaw * 0.60;
        const headTrackingPitch = this.currentLookPitch * 0.60;

        const targetHeadEuler = new THREE.Euler(
          headInitial.x + headTrackingPitch,
          headInitial.y - (accumulatedNeckYaw * 0.95) + headTrackingYaw,
          headInitial.z,
          'XYZ'
        );
        const targetHeadQuat = new THREE.Quaternion().setFromEuler(targetHeadEuler);

        this.currentHeadQuat.slerp(targetHeadQuat, Math.min(1.0, dt * 8.0));
        this.headBone.quaternion.copy(this.currentHeadQuat);
      }
    }

    // D. Leg Joints & Foot Grounding IK (Reptilian Splayed Stance & Terrain Elevation Adaptation)
    const walkCycle = Math.sin(this.time * 3.6);
    
    // Per-leg IK surface elevation offsets relative to true expected foot surface
    let flGroundOffset = 0, frGroundOffset = 0, blGroundOffset = 0, brGroundOffset = 0;
    
    if (isGrounded && this.world) {
      const rootPos = this.root.position;
      const expectedFootBaseY = rootPos.y - this.GROUND_STANCE_HEIGHT;

      const flY = this.getGroundY(rootPos.x - 2.2, rootPos.z + 2.8, expectedFootBaseY);
      const frY = this.getGroundY(rootPos.x + 2.2, rootPos.z + 2.8, expectedFootBaseY);
      const blY = this.getGroundY(rootPos.x - 2.2, rootPos.z - 2.8, expectedFootBaseY);
      const brY = this.getGroundY(rootPos.x + 2.2, rootPos.z - 2.8, expectedFootBaseY);

      flGroundOffset = THREE.MathUtils.clamp((flY - expectedFootBaseY) * 0.35, -0.45, 0.45);
      frGroundOffset = THREE.MathUtils.clamp((frY - expectedFootBaseY) * 0.35, -0.45, 0.45);
      blGroundOffset = THREE.MathUtils.clamp((blY - expectedFootBaseY) * 0.35, -0.45, 0.45);
      brGroundOffset = THREE.MathUtils.clamp((brY - expectedFootBaseY) * 0.35, -0.45, 0.45);
    }

    if (this.state === DragonState.GROUND_RUN_AND_BITE) {
      if (this.biteTimer >= 1.0 && this.biteTimer < 1.5) {
        // Forward lunge planting: front legs thrust forward, back legs push hard
        if (this.frontLeftLeg) this.frontLeftLeg.rotation.x = (this.initialRotations.get(this.frontLeftLeg)?.x || 0) + 0.35;
        if (this.frontRightLeg) this.frontRightLeg.rotation.x = (this.initialRotations.get(this.frontRightLeg)?.x || 0) + 0.35;
        if (this.backLeftLeg) this.backLeftLeg.rotation.x = (this.initialRotations.get(this.backLeftLeg)?.x || 0) - 0.40;
        if (this.backRightLeg) this.backRightLeg.rotation.x = (this.initialRotations.get(this.backRightLeg)?.x || 0) - 0.40;
      }
    } else if (this.state === DragonState.GROUND_STAGGERED) {
      // Staggered pose: legs collapse flat on ground
      [this.frontLeftLeg, this.frontRightLeg, this.backLeftLeg, this.backRightLeg].forEach(leg => {
        if (leg) leg.rotation.x = (this.initialRotations.get(leg)?.x || 0) + 0.65;
      });
    } else if (isLanding) {
      // Extended touchdown stance preparing to plant claws
      [this.frontLeftLeg, this.frontRightLeg, this.backLeftLeg, this.backRightLeg].forEach(leg => {
        if (leg) leg.rotation.x = (this.initialRotations.get(leg)?.x || 0) + 0.2;
      });
    } else {
      // When walking animation is active, allow mixer to drive leg kinematics
      if (this.currentActionName !== 'ground_walk') {
        // Active Quadruped Gait phase-locked with Serpentine Spine Sway (Diagonal Gait Pairs)
        const walkCycle = Math.sin(serpentinePhase);
        const liftCycle = Math.cos(serpentinePhase);

        // 1. Front Left Leg (Bone_046 chain)
        this.animateLegChain(this.frontLeftLegChain, walkCycle, liftCycle, flGroundOffset, isGrounded, false);
        // 2. Back Right Leg (Bone_006 chain) - paired diagonally with Front Left
        this.animateLegChain(this.backRightLegChain, walkCycle, liftCycle, brGroundOffset, isGrounded, true);
        // 3. Front Right Leg (Bone_040 chain) - inverted phase
        this.animateLegChain(this.frontRightLegChain, -walkCycle, -liftCycle, frGroundOffset, isGrounded, false);
        // 4. Back Left Leg (Bone_011 chain) - paired diagonally with Front Right
        this.animateLegChain(this.backLeftLegChain, -walkCycle, -liftCycle, blGroundOffset, isGrounded, true);
      }
    }
    } // end shouldAnimate

    // --- 3. AERIAL POSITIONING & HEADING (STALKING ORBIT MODE) ---
    if (this.state === DragonState.STALKING_ORBIT || this.state === DragonState.ATTACK_RANGED) {
      const distanceOffset = 38;
      const orbitSpeed = 0.22;
      
      this.orbitAngle += dt * orbitSpeed;

      const liftImpulse = -mainFlap * 2.5; 

      const targetX = playerPos.x + Math.cos(this.orbitAngle) * distanceOffset;
      const targetZ = playerPos.z + Math.sin(this.orbitAngle) * distanceOffset;
      
      // DECOUPLED ALTITUDE: Independent terrain-relative cruising ceiling!
      // Dragon maintains a majestic cruising altitude 28m above the terrain, completely independent of player elevation
      const terrainUnderOrbit = this.getAdjustedGroundY(targetX, targetZ, 25);
      const playerGroundY = this.getAdjustedGroundY(playerPos.x, playerPos.z, 25);
      const cruisingBaseY = Math.max(terrainUnderOrbit, playerGroundY);
      const targetY = cruisingBaseY + 28.0 + liftImpulse;

      const targetPosition = new THREE.Vector3(targetX, targetY, targetZ);
      
      this.root.position.lerp(targetPosition, dt * 2.5);
      
      const lookTarget = new THREE.Vector3(playerPos.x, targetY, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);
    }

    // --- 4. UPDATE ACTIVE FIREBALL PROJECTILES ---
    for (let i = this.activeFireballs.length - 1; i >= 0; i--) {
      const fireball = this.activeFireballs[i];
      fireball.update(dt, playerPos, playerPhysics);
      if (fireball.isDead) {
        this.returnPooledFireball(fireball);
        this.activeFireballs.splice(i, 1);
      }
    }
  }

  // --- GROUND TOUCHDOWN & MELEE COMBAT ENGINE ---
  private cachedGroundX = 0;
  private cachedGroundZ = 0;
  private cachedGroundY = 0;
  private groundYLastCheckTime = 0;

  public getGroundY(x: number, z: number, fallbackY: number = 25): number {
    if (!this.world) return fallbackY;
    // Raycast from top of world (Y=120) down through full world depth
    const origin = new THREE.Vector3(x, 120, z);
    const dir = new THREE.Vector3(0, -1, 0);
    const hit = this.world.raycastBlock(origin, dir, 300);
    if (hit) {
      // 0.5 multiplier for half-block terrain vertical scaling + 0.5 block top
      return (hit.blockPos.y * 0.5) + 0.5;
    }
    return fallbackY;
  }

  public getTerrainClearanceFloor(x: number, z: number, clearanceMargin: number = 4.5): number {
    const rawGroundY = this.getAdjustedGroundY(x, z, 25);
    return rawGroundY + clearanceMargin;
  }

  private getAdjustedGroundY(x: number, z: number, fallbackY: number = 25): number {
    const now = performance.now();
    const distSq = (x - this.cachedGroundX) ** 2 + (z - this.cachedGroundZ) ** 2;
    // Invalidate ground cache if more than 100ms passed OR dragon moved > 1.2 blocks
    if (now - this.groundYLastCheckTime < 100 && distSq < 1.44 && this.cachedGroundY !== 0) {
      return this.cachedGroundY;
    }
    this.groundYLastCheckTime = now;
    this.cachedGroundX = x;
    this.cachedGroundZ = z;

    // Comprehensive 9-point dragon footprint grid (covering 4 splayed paws, spine bridge, and torso center)
    const offsets = [
      { x: 0, z: 0 },         // Center
      { x: -2.2, z: 2.8 },    // Front Left Paw
      { x: 2.2, z: 2.8 },     // Front Right Paw
      { x: -2.2, z: -2.8 },   // Back Left Paw
      { x: 2.2, z: -2.8 },    // Back Right Paw
      { x: 0, z: 2.0 },       // Chest / Neck Base
      { x: 0, z: -2.0 },      // Pelvis / Tail Base
      { x: -2.2, z: 0 },      // Left Flank
      { x: 2.2, z: 0 }        // Right Flank
    ];

    let highestGroundY = -Infinity;
    for (const offset of offsets) {
      const groundY = this.getGroundY(x + offset.x, z + offset.z, fallbackY);
      if (groundY > highestGroundY) {
        highestGroundY = groundY;
      }
    }
    this.cachedGroundY = highestGroundY;
    return highestGroundY;
  }

  private enterStalkingOrbit(playerPos: THREE.Vector3): void {
    this.state = DragonState.STALKING_ORBIT;
    this.stateTimer = 0;
    this.nextAttackTime = 3.5 + Math.random() * 2.5;

    // Synchronize orbitAngle with dragon's current physical position relative to player
    const dx = this.root.position.x - playerPos.x;
    const dz = this.root.position.z - playerPos.z;
    if (dx * dx + dz * dz > 1.0) {
      this.orbitAngle = Math.atan2(dz, dx);
    }
    this.transitionToAction('flight', 0.4);
    console.log(`EMBERWYNN DRAGON RETURNED TO ORBIT AT ANGLE ${(this.orbitAngle * 180 / Math.PI).toFixed(1)}°`);
  }

  private startGroundLanding(playerPos: THREE.Vector3): void {
    this.state = DragonState.GROUND_LANDING;
    this.landingTimer = 0;
    this.landingStartPos.copy(this.root.position);
    this.isCarryingPlayer = false;
    this.isGrabAttempt = false;
    
    // Pin horizontal landing target directly beneath current orbital position
    const dropRadius = 3 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    const targetX = this.root.position.x + Math.cos(angle) * dropRadius;
    const targetZ = this.root.position.z + Math.sin(angle) * dropRadius;
    
    // Multi-point Raycast straight down to find actual surface Y + standing stance height
    const groundY = this.getAdjustedGroundY(targetX, targetZ, 25);
    const targetLandY = groundY + this.GROUND_STANCE_HEIGHT;

    this.landingTargetPos.set(targetX, targetLandY, targetZ);
    this.transitionToAction('ground_idle', 0.3);
    console.log(`EMBERWYNN DRAGON INITIATING DIRECT VERTICAL DESCENT TOUCHDOWN TO ${targetX.toFixed(1)}, ${targetLandY.toFixed(1)}, ${targetZ.toFixed(1)}...`);
  }

  private updateGroundLanding(dt: number, playerPos: THREE.Vector3): void {
    this.landingTimer += dt;
    const currentGroundY = this.getAdjustedGroundY(this.root.position.x, this.root.position.z, 25);
    const targetLandY = currentGroundY + this.GROUND_STANCE_HEIGHT;

    // Direct Vertical Orbital Descent: lock horizontal swoop and smoothly lerp Y straight down
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetLandY, dt * 3.5);
    this.root.position.x = THREE.MathUtils.lerp(this.root.position.x, this.landingTargetPos.x, dt * 1.5);
    this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, this.landingTargetPos.z, dt * 1.5);

    // Gently align orientation toward player ground location
    const lookTarget = new THREE.Vector3(playerPos.x, targetLandY, playerPos.z);
    this.root.up.set(0, 1, 0);
    this.root.lookAt(lookTarget);

    // Ground Surface Threshold Check: force state lock out of flight mode on surface contact
    if (this.root.position.y <= targetLandY + 0.15 || this.landingTimer >= 1.8) {
      // Hard momentum & position lock on touchdown
      this.root.position.x = this.landingTargetPos.x;
      this.root.position.z = this.landingTargetPos.z;
      this.root.position.y = targetLandY;

      try {
        // Trigger Heavy Touchdown Dust Explosion!
        for (let i = 0; i < 20; i++) {
          const dustPos = this.root.position.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 14,
            -1,
            (Math.random() - 0.5) * 14
          ));
          this.particleManager.spawnSmokePuff(dustPos, true);
        }
        if (typeof this.sound.playBlockBreak === 'function') {
          this.sound.playBlockBreak();
        }
      } catch (e) {}

      this.state = DragonState.GROUND_FATIGUED;
      // Initialize ground stalking orbit angle seamlessly from touchdown point
      const dx = this.root.position.x - playerPos.x;
      const dz = this.root.position.z - playerPos.z;
      this.groundOrbitAngle = Math.atan2(dz, dx);
      this.stalkOrbitDirection = Math.random() < 0.5 ? 1 : -1;
      this.currentStalkRadius = 17.5; // Start wide
      this.stalkSubState = 'PROWL';
      this.stalkSubStateTimer = 2.5 + Math.random() * 1.5; // Initial prowl
      this.groundAttackCooldown = 5.5 + Math.random() * 2.0; // 5.5 - 7.5s stalking phase before bite charge
      this.transitionToAction('ground_walk', 0.25);
      console.log('EMBERWYNN DRAGON COMMENCING CALCULATED PREDATORY STALK (MICRO-BEAT STARE-DOWN)!');
    }
  }

  private updateGroundFatigued(dt: number, playerPos: THREE.Vector3): void {
    const currentGroundY = this.getAdjustedGroundY(this.root.position.x, this.root.position.z, 25);
    
    // Smooth natural step bobbing along terrain
    const isMoving = this.stalkSubState !== 'PAUSE_STARE';
    const stepBob = isMoving ? Math.abs(Math.sin(this.time * 3.2)) * 0.12 : 0;
    const targetY = currentGroundY + this.GROUND_STANCE_HEIGHT - stepBob;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, dt * 6.0);
    this.root.position.y = Math.max(this.root.position.y, currentGroundY + this.GROUND_STANCE_HEIGHT - 0.25);

    // --- 1. DYNAMIC RADIUS COMPRESSION (Shrinking Perimeter) ---
    // Stalk radius organically tightens from 17.5m down to 8.5m over the course of the stalking window
    const stalkProgress = Math.max(0, 1.0 - (this.groundAttackCooldown / 6.0));
    const targetRadius = THREE.MathUtils.lerp(17.5, 8.5, stalkProgress);
    this.currentStalkRadius = THREE.MathUtils.lerp(this.currentStalkRadius, targetRadius, dt * 1.2);

    // --- 2. STALKING MICRO-BEAT SUB-STATE SWITCHER ---
    this.stalkSubStateTimer -= dt;
    if (this.stalkSubStateTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.45) {
        // PROWL: Deliberate, tense steps along perimeter (2.0 - 4.5s)
        this.stalkSubState = 'PROWL';
        this.stalkSubStateTimer = 2.0 + Math.random() * 2.5;
        this.transitionToAction('ground_walk', 0.25);

        // 35% chance to reverse circling direction on new prowl
        if (Math.random() < 0.35) {
          this.stalkOrbitDirection *= -1;
          try {
            // Tail whip / dust kick on direction switch
            this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.root.position, 2);
          } catch (e) {}
        }
      } else if (roll < 0.80) {
        // PAUSE_STARE: Complete stop, low crouch, plant paws, locked eye contact (1.5 - 3.2s)
        this.stalkSubState = 'PAUSE_STARE';
        this.stalkSubStateTimer = 1.5 + Math.random() * 1.8;
        this.transitionToAction('ground_idle', 0.4);
        try {
          // Low throat snarl & smoke puff
          const mouthPos = new THREE.Vector3();
          if (this.headBone) this.headBone.getWorldPosition(mouthPos);
          else mouthPos.copy(this.root.position).add(new THREE.Vector3(0, 2, 0));
          this.particleManager.spawnSmokePuff(mouthPos, true);
        } catch (e) {}
      } else {
        // FEINT: Aggressive forward surge testing player reaction (0.8s)
        this.stalkSubState = 'FEINT';
        this.stalkSubStateTimer = 0.85;
        this.transitionToAction('ground_walk', 0.15);
        try {
          this.particleManager.spawnSmokePuff(this.root.position, true);
          if (typeof this.sound.playBlockBreak === 'function') {
            this.sound.playBlockBreak();
          }
        } catch (e) {}
      }
    }

    // --- 3. SUB-STATE MOTION & KINEMATICS ---
    if (this.stalkSubState === 'PAUSE_STARE') {
      // Stationary Stare-Down: Zero translation, chest low, body directly facing player
      const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

      // Deep, menacing snort embers every 0.8s
      if (Math.floor(this.time * 60) % 48 === 0) {
        try {
          const mouthPos = new THREE.Vector3();
          if (this.headBone) this.headBone.getWorldPosition(mouthPos);
          else mouthPos.copy(this.root.position).add(new THREE.Vector3(0, 2, 0));
          this.particleManager.spawnSmokePuff(mouthPos, true);
        } catch (e) {}
      }

    } else if (this.stalkSubState === 'FEINT') {
      // Quick Forward Surge: 2-3 aggressive bounding steps directly toward player
      const dirToPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position);
      dirToPlayer.y = 0;
      if (dirToPlayer.length() > 3.5) {
        dirToPlayer.normalize();
        this.root.position.addScaledVector(dirToPlayer, 6.5 * dt);
      }

      const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);
      this.clearObstaclesInPath(this.world);

    } else {
      // PROWL: Sinuous orbital prowl with dynamic cadence and flanking heading
      const paceWave = 0.44 + Math.sin(this.time * 0.40) * 0.12;
      this.groundOrbitAngle += dt * paceWave * this.stalkOrbitDirection;

      const targetX = playerPos.x + Math.cos(this.groundOrbitAngle) * this.currentStalkRadius;
      const targetZ = playerPos.z + Math.sin(this.groundOrbitAngle) * this.currentStalkRadius;
      const targetGroundPos = new THREE.Vector3(targetX, targetY, targetZ);

      // Smooth Physical Momentum
      this.root.position.lerp(targetGroundPos, dt * 2.6);
      this.clearObstaclesInPath(this.world);

      // Predatory Sinuous Flank Heading (68% Tangent + 32% Inward toward player)
      const tangentX = -Math.sin(this.groundOrbitAngle) * this.stalkOrbitDirection;
      const tangentZ = Math.cos(this.groundOrbitAngle) * this.stalkOrbitDirection;
      const inwardX = -Math.cos(this.groundOrbitAngle);
      const inwardZ = -Math.sin(this.groundOrbitAngle);

      const flankDirX = tangentX * 0.68 + inwardX * 0.32;
      const flankDirZ = tangentZ * 0.68 + inwardZ * 0.32;

      const forwardLookTarget = new THREE.Vector3(
        this.root.position.x + flankDirX * 10.0,
        this.root.position.y,
        this.root.position.z + flankDirZ * 10.0
      );
      this.root.up.set(0, 1, 0);
      this.root.lookAt(forwardLookTarget);

      // Telegraphing particles
      if (Math.floor(this.time * 60) % 24 === 0) {
        try {
          const mouthPos = new THREE.Vector3();
          if (this.headBone) this.headBone.getWorldPosition(mouthPos);
          else mouthPos.copy(this.root.position).add(new THREE.Vector3(0, 2, 0));
          this.particleManager.spawnSmokePuff(mouthPos, true);
          this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.root.position, 1);
        } catch (e) {}
      }
    }

    // --- 4. STRIKE ZONE REACTIVITY & ATTACK COMMITMENT ---
    const distToPlayer = this.root.position.distanceTo(playerPos);
    if (distToPlayer < 6.0 && this.groundAttackCooldown > 0.5) {
      console.log('PLAYER ENTERED DRAGON STRIKE ZONE -> INSTANT COUNTER ATTACK!');
      this.groundAttackCooldown = 0;
    }

    if (this.groundAttackCooldown <= 0) {
      this.groundAttackCount++;
      const rand = Math.random();
      
      if (this.groundAttackCount >= 3 || rand < 0.20) {
        // After 2-3 ground attacks: Take flight back into atmospheric orbit!
        this.groundAttackCount = 0;
        this.groundAttackCooldown = 5.0;
        this.enterStalkingOrbit(playerPos);
        console.log('EMBERWYNN DRAGON FINISHED GROUND PHASE -> LAUNCHING INTO SKY!');
        return;
      }

      // 100% Commitment to High-Speed Predatory Run & Bite Charge!
      this.startGroundRunAndBite(playerPos);
    }
  }

  // --- AGGRESSIVE PREDATORY RUN AND BITE ATTACK ENGINE ---
  private startGroundRunAndBite(playerPos: THREE.Vector3): void {
    this.state = DragonState.GROUND_RUN_AND_BITE;
    this.biteTimer = 0;
    this.hasDealtBiteDamage = false;
    this.biteStartPos.copy(this.root.position);
    this.biteTargetPos.copy(playerPos);
    // Switch away from slow walk to high-speed sprint attack
    this.transitionToAction('sprint', 0.15);

    try {
      if (typeof this.sound.playBlockBreak === 'function') {
        this.sound.playBlockBreak();
      }
    } catch (e) {}

    console.log('EMBERWYNN DRAGON COMMENCING AGGRESSIVE RUN AND BITE ATTACK PATTERN!');
  }

  private updateGroundRunAndBite(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    this.biteTimer += dt;
    const currentGroundY = this.getAdjustedGroundY(this.root.position.x, this.root.position.z, 25);
    const targetY = currentGroundY + this.GROUND_STANCE_HEIGHT;

    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, dt * 8.0);
    this.root.position.y = Math.max(this.root.position.y, currentGroundY + this.GROUND_STANCE_HEIGHT - 0.2);

    const dirToPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position);
    dirToPlayer.y = 0;
    const distToPlayer = dirToPlayer.length();

    if (this.biteTimer < 1.0) {
      // PHASE 1: HIGH-SPEED SPRINT / CHARGE (0.0s - 1.0s) -> 16 m/s predatory sprint directly at player
      const sprintSpeed = 16.0;
      if (distToPlayer > 3.0) {
        dirToPlayer.normalize();
        this.root.position.addScaledVector(dirToPlayer, sprintSpeed * dt);
      }

      // Lock heading directly on player during sprint
      const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

      // SPRINT COLLISION DEMOLITION: Shatter trees, logs & foliage in charging path!
      this.clearObstaclesInPath(this.world);

      // Spawn rapid claw scrape debris & smoke trail
      if (Math.floor(this.biteTimer * 60) % 4 === 0) {
        try {
          const runDust = this.root.position.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            -1.5,
            (Math.random() - 0.5) * 4
          ));
          this.particleManager.spawnSmokePuff(runDust, true);
          this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, runDust, 2);
        } catch (e) {}
      }

    } else if (this.biteTimer < 1.6) {
      // PHASE 2: EXPLOSIVE LUNGE & VICIOUS JAWS SNAP (1.0s - 1.6s)
      const lungeProgress = (this.biteTimer - 1.0) / 0.6;
      const lungeSpeed = 12.0 * (1.0 - lungeProgress);
      if (distToPlayer > 2.0) {
        dirToPlayer.normalize();
        this.root.position.addScaledVector(dirToPlayer, lungeSpeed * dt);
      }

      const lookTarget = new THREE.Vector3(playerPos.x, this.root.position.y, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

      // LUNGE DEMOLITION: Clear obstacles in forward bite snap trajectory
      this.clearObstaclesInPath(this.world);

      // BITE IMPACT MOMENT (at 1.15s - 1.30s): Visceral jaw crunch, teeth debris & damage
      if (!this.hasDealtBiteDamage && this.biteTimer >= 1.15) {
        this.hasDealtBiteDamage = true;

        const mouthPos = new THREE.Vector3();
        if (this.headBone) {
          this.headBone.getWorldPosition(mouthPos);
        } else {
          mouthPos.copy(this.root.position).add(new THREE.Vector3(0, 2, 0));
        }

        // Spawn Tooth-Crunch Debris and Flame Burst
        try {
          for (let i = 0; i < 20; i++) {
            const biteSparks = mouthPos.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 3
            ));
            this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, biteSparks, 3);
            this.particleManager.spawnSmokePuff(biteSparks, true);
          }
          if (typeof this.sound.playBlockBreak === 'function') {
            this.sound.playBlockBreak();
          }
          if (typeof this.sound.playBlockHit === 'function') {
            this.sound.playBlockHit();
          }
        } catch (e) {}

        // Hit Detection: Within 6.5m of dragon center or 5.5m of mouth
        const distFromMouth = mouthPos.distanceTo(playerPos);
        if ((distToPlayer <= 6.5 || distFromMouth <= 5.5) && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
          const biteDamage = Math.round(16 + Math.random() * 6); // 16-22 crisp bite damage
          const knockback = playerPos.clone().sub(this.root.position).normalize();
          knockback.y = 0.35; // Sharp bite flinch knockback
          knockback.normalize();

          playerPhysics.takeDamage(biteDamage, knockback);
          console.log(`EMBERWYNN DRAGON RUN & BITE CONNECTED! Dealt ${biteDamage} damage to player!`);
        }
      }

    } else if (this.biteTimer >= 2.1) {
      // PHASE 3: RECOVERY & TRANSITION BACK TO PREDATORY STALK
      this.groundAttackCooldown = 5.0 + Math.random() * 2.0; // 5.0 - 7.0s calculated stalking phase
      this.currentStalkRadius = 17.5; // Reset perimeter wide
      this.stalkSubState = 'PROWL';
      this.stalkSubStateTimer = 2.0 + Math.random() * 1.5;
      this.stalkOrbitDirection = Math.random() < 0.5 ? 1 : -1;
      
      // Re-align ground orbit angle to current position so there is zero position snap
      const dx = this.root.position.x - playerPos.x;
      const dz = this.root.position.z - playerPos.z;
      this.groundOrbitAngle = Math.atan2(dz, dx);
      this.state = DragonState.GROUND_FATIGUED;
      this.transitionToAction('ground_walk', 0.25);
      console.log('EMBERWYNN DRAGON RE-ENTERED PREDATORY STARE-DOWN STALK!');
    }
  }

  private updateGroundStaggered(dt: number, playerPos: THREE.Vector3): void {
    this.staggerTimer += dt;
    const currentGroundY = this.getAdjustedGroundY(this.root.position.x, this.root.position.z, 25);
    const targetY = currentGroundY + this.STAGGERED_CHEST_HEIGHT;

    // Collapsed flat on chest resting cleanly on terrain surface
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, dt * 5.0);

    // Heavy, exhausted panting on chest for 4.0 seconds
    if (this.staggerTimer >= 4.0) {
      // Stagger window over: Dragon roars, launches back into the atmosphere!
      this.attackCount = 0; 
      this.enterStalkingOrbit(playerPos);
      console.log('EMBERWYNN DRAGON RECOVERED FROM STAGGER -> LAUNCHING INTO ATMOSPHERE!');
    }
  }

  // --- EMBER SWEEP & LOW GRAB PASS LOGIC ---
  private startEmberSweep(playerPos: THREE.Vector3): void {
    this.state = DragonState.EMBER_SWEEP;
    this.sweepTimer = 0;
    this.isGrabAttempt = true; // Always attempt grab on low swoop passes
    
    this.sweepStartPos.copy(this.root.position);
    
    // Swoop intercept altitude: align dragon talons precisely with player torso height
    // Dragon paws/talons hang ~2.8m below root origin. Torso is at playerPos.y + 0.9m.
    // Target root pass Y = playerPos.y + 3.2m (giving claw sweep right through torso level)
    const terrainAtPlayer = this.getAdjustedGroundY(playerPos.x, playerPos.z, 25);
    const passY = Math.max(terrainAtPlayer + 3.0, playerPos.y + 3.2);

    // Target position: aim directly through player position for clean intercept
    this.sweepTargetPos.set(playerPos.x, passY, playerPos.z);

    // Compute continuous forward sweep direction vector
    this.sweepFlightDir.subVectors(this.sweepTargetPos, this.sweepStartPos).normalize();

    try {
      if (typeof this.sound.playBlockBreak === 'function') {
        this.sound.playBlockBreak();
      }
    } catch (e) {}

    console.log(`EMBERWYNN DRAGON INITIATING TALON SWOOP GRAB ATTACK!`);
  }

  // --- HIGH-SPEED HEAD-FIRST SWOOP DIVE CHARGE ---
  private startSwoopDiveCharge(playerPos: THREE.Vector3): void {
    this.state = DragonState.SWOOP_DIVE_CHARGE;
    this.diveTimer = 0;
    this.hasDealtDiveDamage = false;
    this.diveStartPos.copy(this.root.position);
    
    // Aim dive vector with safe terrain clearance floor
    const terrainAtPlayer = this.getAdjustedGroundY(playerPos.x, playerPos.z, 25);
    const diveY = Math.max(terrainAtPlayer + 4.0, Math.min(terrainAtPlayer + 15.0, playerPos.y + 1.2));
    this.diveTargetPos.set(playerPos.x, diveY, playerPos.z);
    this.diveDir.subVectors(this.diveTargetPos, this.diveStartPos).normalize();

    try {
      if (typeof this.sound.playBlockBreak === 'function') {
        this.sound.playBlockBreak();
      }
    } catch (e) {}

    console.log('EMBERWYNN DRAGON INITIATING HIGH-SPEED HEAD-FIRST SWOOP DIVE CHARGE!');
  }

  private updateSwoopDiveCharge(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    this.diveTimer += dt;
    const currentTerrainFloor = this.getTerrainClearanceFloor(this.root.position.x, this.root.position.z, 4.0);

    if (this.diveTimer < 0.8) {
      // Wind-up & Dive Target Lock: Align pitch & heading directly toward target
      const lookTarget = this.diveTargetPos.clone();
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

    } else if (this.diveTimer < 2.5) {
      // DIVE CHARGE EXECUTION: Rocket forward at 65 blocks/sec!
      const diveSpeed = 65.0;
      this.root.position.addScaledVector(this.diveDir, diveSpeed * dt);
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor);

      // Orient forward along dive vector
      const forwardLook = this.root.position.clone().add(this.diveDir.clone().multiplyScalar(10));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(forwardLook);

      // AERIAL CHARGE DEMOLITION: Blast through tree canopies & mountain terrain obstacles
      this.clearObstaclesInPath(this.world);

      // Spawn Sonic Boom & Fire Trail Debris
      if (Math.floor(this.diveTimer * 60) % 4 === 0) {
        try {
          const trailPos = this.root.position.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            -1.5,
            (Math.random() - 0.5) * 6
          ));
          this.particleManager.spawnSmokePuff(trailPos, true);
          this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, trailPos, 2);
        } catch (e) {}
      }

      // Hit Detection: Single impactful strike per dive pass with fair damage scaling
      const distToPlayer = this.root.position.distanceTo(playerPos);
      if (!this.hasDealtDiveDamage && distToPlayer < 6.0 && playerPhysics && typeof playerPhysics.takeDamage === 'function') {
        this.hasDealtDiveDamage = true;

        // Proximity-scaled fair damage: 14 to 22 damage based on closeness (Player max HP = 100)
        const proximityRatio = Math.max(0, 1.0 - distToPlayer / 6.0);
        const diveDamage = Math.round(14 + proximityRatio * 8);

        // Controlled lateral knockback pushing player aside/away from dragon trajectory with modest lift
        const horizontalDir = new THREE.Vector3(this.diveDir.x, 0, this.diveDir.z).normalize();
        const knockback = new THREE.Vector3(
          horizontalDir.x,
          0.35,
          horizontalDir.z
        ).normalize();

        playerPhysics.takeDamage(diveDamage, knockback);
        try {
          if (typeof this.sound.playBlockHit === 'function') {
            this.sound.playBlockHit();
          }
        } catch (e) {}
        console.log(`SWOOP DIVE CHARGE CONNECTED! Dealt ${diveDamage} damage (HP remaining: ${playerPhysics.health}/${playerPhysics.maxHealth})`);
      }

    } else if (this.diveTimer < 4.0) {
      // Steep Ascent Pull-Up: Pitch body upward into orbital altitude
      const climbProgress = (this.diveTimer - 2.5) / 1.5;
      const smoothClimb = Math.sin(climbProgress * Math.PI * 0.5);
      
      const climbDir = new THREE.Vector3(this.diveDir.x, 0.75, this.diveDir.z).normalize();
      this.root.position.addScaledVector(climbDir, (45.0 * (1.0 - smoothClimb * 0.5)) * dt);
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor);

      const climbLook = this.root.position.clone().add(climbDir.multiplyScalar(10));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(climbLook);

    } else {
      // Return to orbit seamlessly
      this.enterStalkingOrbit(playerPos);
    }
  }

  private updateEmberSweep(dt: number, playerPos: THREE.Vector3): void {
    this.sweepTimer += dt;
    const currentTerrainFloor = this.getTerrainClearanceFloor(this.root.position.x, this.root.position.z, 3.0);

    // Comprehensive 3D Proximity & Overlap Detection for Grab Snatch
    const checkGrabOverlap = (): boolean => {
      if (!this.isGrabAttempt || this.isCarryingPlayer) return false;

      const playerTorso = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
      
      // 1. Center to player torso distance
      const distToCenter = this.root.position.distanceTo(playerTorso);
      
      // 2. Mouth / front claws distance
      const mouthPos = new THREE.Vector3();
      if (this.headBone) {
        this.headBone.getWorldPosition(mouthPos);
      } else {
        mouthPos.copy(this.root.position).add(new THREE.Vector3(0, -1.8, 0));
      }
      const distToMouth = mouthPos.distanceTo(playerTorso);

      // 3. Horizontal & Vertical Bounding Cylinder Overlap
      const dx = this.root.position.x - playerTorso.x;
      const dz = this.root.position.z - playerTorso.z;
      const distXZ = Math.sqrt(dx * dx + dz * dz);
      const talonY = this.root.position.y - 2.8; // Claws / talons level
      const distY = Math.abs(talonY - playerTorso.y);

      // Generous physical grab envelope matching 5x dragon scale
      if (distToCenter <= 7.5 || distToMouth <= 6.5 || (distXZ <= 6.5 && distY <= 3.8)) {
        this.snatchPlayer();
        return true;
      }
      return false;
    };

    if (this.sweepTimer < 1.0) {
      // Phase 1: Swoop Descent (0.0s - 1.0s) -> Smooth dive from orbit toward low pass intercept
      const progress = this.sweepTimer / 1.0;
      const smooth = Math.sin(progress * Math.PI * 0.5);
      
      this.root.position.lerpVectors(this.sweepStartPos, this.sweepTargetPos, smooth);
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor); 
      
      const lookTarget = this.sweepTargetPos.clone().add(this.sweepFlightDir.clone().multiplyScalar(5));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

      // Contact check during final frames of dive descent
      if (checkGrabOverlap()) return;

    } else if (this.sweepTimer < 2.2) {
      // Phase 2: Low-Altitude Snatch Pass (1.0s - 2.2s) -> Maintain 50 m/s forward speed over player
      const speed = 50.0;
      const horizontalDir = new THREE.Vector3(this.sweepFlightDir.x, 0, this.sweepFlightDir.z).normalize();
      this.root.position.addScaledVector(horizontalDir, speed * dt);
      
      const terrainAtPlayer = this.getAdjustedGroundY(playerPos.x, playerPos.z, 25);
      const targetPassY = Math.max(terrainAtPlayer + 3.0, playerPos.y + 3.2);
      this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetPassY, dt * 6.0);
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor); // Hard safety clamp against clipping

      const lookAhead = this.root.position.clone().add(horizontalDir.clone().multiplyScalar(10));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookAhead);

      // LOW PASS DEMOLITION: Knock down tree canopies and obstacles in swoop path
      this.clearObstaclesInPath(this.world);

      // Fire & Smoke Wake Particles
      if (Math.floor(this.sweepTimer * 60) % 6 === 0) {
        try {
          const wakePos = this.root.position.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            -1.5,
            (Math.random() - 0.5) * 6
          ));
          this.particleManager.spawnSmokePuff(wakePos, true);
          this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, wakePos, 1);
        } catch (e) {}
      }

      // PROXIMITY SNATCH OVERLAP CHECK
      if (checkGrabOverlap()) return;

      const dist = this.root.position.distanceTo(playerPos);
      if (dist < 7.0) {
        try {
          if (typeof this.sound.playBlockHit === 'function') {
            this.sound.playBlockHit();
          }
        } catch (e) {}
      }

    } else if (this.sweepTimer < 3.6) {
      // Phase 3: Dynamic Continuous Climb & Curving Bank (2.2s - 3.6s) -> Ascend continuously
      const climbProgress = (this.sweepTimer - 2.2) / 1.4;
      const smoothClimb = Math.sin(climbProgress * Math.PI * 0.5);
      
      // Calculate curve vector curving tangentially around player
      const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position);
      toPlayer.y = 0;
      const crossTangential = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
      const horizontalDir = new THREE.Vector3(this.sweepFlightDir.x, 0, this.sweepFlightDir.z).normalize();
      const curveDir = horizontalDir.clone().lerp(crossTangential, smoothClimb * 0.65).normalize();

      const climbVector = new THREE.Vector3(
        curveDir.x,
        0.65, // Consistent upward climb slope
        curveDir.z
      ).normalize();

      const climbSpeed = 46.0 * (1.0 - smoothClimb * 0.30);
      this.root.position.addScaledVector(climbVector, climbSpeed * dt);
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor);

      // Orient along 3D climb vector
      const climbLook = this.root.position.clone().add(climbVector.clone().multiplyScalar(10));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(climbLook);

    } else if (this.sweepTimer < 4.6) {
      // Phase 4: Dynamic Orbital Blend (3.6s - 4.6s) -> Smoothly converge toward independent 28m cruising altitude & radius
      const blendProgress = (this.sweepTimer - 3.6) / 1.0;
      const smoothBlend = Math.sin(blendProgress * Math.PI * 0.5);

      const dx = this.root.position.x - playerPos.x;
      const dz = this.root.position.z - playerPos.z;
      const currentAngle = Math.atan2(dz, dx);
      this.orbitAngle = currentAngle; // Lock orbit angle to current position

      const distanceOffset = 38;
      const targetX = playerPos.x + Math.cos(this.orbitAngle) * distanceOffset;
      const targetZ = playerPos.z + Math.sin(this.orbitAngle) * distanceOffset;
      const terrainUnderOrbit = this.getAdjustedGroundY(targetX, targetZ, 25);
      const targetY = terrainUnderOrbit + 28.0;
      const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

      this.root.position.lerp(targetPos, dt * (3.5 + smoothBlend * 3.5));
      this.root.position.y = Math.max(this.root.position.y, currentTerrainFloor);

      const lookTarget = new THREE.Vector3(playerPos.x, targetY, playerPos.z);
      this.root.up.set(0, 1, 0);
      this.root.lookAt(lookTarget);

    } else {
      // Clean re-entry into STALKING_ORBIT
      this.enterStalkingOrbit(playerPos);
    }
  }

  // --- SNATCH & SKY LIFT MECHANICS ---
  private snatchPlayer(): void {
    // Decouple guard: ONLY allow snatch/grab during high-speed aerial EMBER_SWEEP!
    if (this.state !== DragonState.EMBER_SWEEP) return;

    this.state = DragonState.GRAB_LIFT;
    this.isCarryingPlayer = true;
    this.justReleasedPlayer = false;
    this.grabLiftTimer = 0;

    this.root.updateMatrixWorld(true);
    if (this.headBone) {
      this.headBone.getWorldPosition(this.mouthWorldPos);
    } else {
      this.root.getWorldPosition(this.mouthWorldPos);
      this.mouthWorldPos.y -= 2.0;
    }
    
    try {
      if (typeof this.sound.playBlockBreak === 'function') {
        this.sound.playBlockBreak();
      }
    } catch (e) {}

    console.log('EMBERWYNN DRAGON SNATCHED THE PLAYER IN ITS TALONS/JAWS!');
  }

  // --- VISCERAL ENVIRONMENTAL OBSTACLE DEMOLITION ENGINE ---
  public isTreeBlock(blockType: BlockType): boolean {
    return (
      // Trunk Logs & Wood (All biomes & orientations)
      blockType === BlockType.OAK_LOG ||
      blockType === BlockType.OAK_LOG_X ||
      blockType === BlockType.OAK_LOG_Z ||
      blockType === BlockType.FROZEN_LOG ||
      blockType === BlockType.FROZEN_LOG_X ||
      blockType === BlockType.FROZEN_LOG_Z ||
      blockType === BlockType.PETRIFIED_LOG ||
      blockType === BlockType.PETRIFIED_LOG_X ||
      blockType === BlockType.PETRIFIED_LOG_Z ||
      blockType === BlockType.PETRIFIED_SUNWOOD ||
      blockType === BlockType.PETRIFIED_SUNWOOD_X ||
      blockType === BlockType.PETRIFIED_SUNWOOD_Z ||
      // Canopy Leaves & Fronds
      blockType === BlockType.OAK_LEAVES ||
      blockType === BlockType.FROST_LEAVES ||
      blockType === BlockType.PALM_FRONDS ||
      blockType === BlockType.TEAL_LEAVES ||
      blockType === BlockType.BLUE_LEAVES ||
      blockType === BlockType.PURPLE_LEAVES ||
      blockType === BlockType.CHARRED_LEAVES ||
      // Foliage & Thorns
      blockType === BlockType.WITHERED_THORNS ||
      blockType === BlockType.SCRUBGRASS ||
      blockType === BlockType.FLOWER ||
      blockType === BlockType.FROST_BLOOM ||
      blockType === BlockType.CORRUPTION_BLOOM ||
      blockType === BlockType.DESERT_BLOOM ||
      // Planks & Wooden Structures
      blockType === BlockType.PLANKS ||
      blockType === BlockType.FROZEN_PLANKS ||
      blockType === BlockType.RUINED_PLANKS ||
      blockType === BlockType.TEMPLE_PLANKS ||
      // Loose Surface Elements
      blockType === BlockType.CORRUPTED_GROWTH ||
      blockType === BlockType.SNOW
    );
  }

  public clearObstaclesInPath(world: VoxelWorld): void {
    if (!world) return;

    // Destroy obstacles during active movement states
    if (
      this.state !== DragonState.GROUND_RUN_AND_BITE &&
      this.state !== DragonState.GROUND_FATIGUED &&
      this.state !== DragonState.SWOOP_DIVE_CHARGE &&
      this.state !== DragonState.EMBER_SWEEP
    ) {
      return;
    }

    // Accurate Three.js world forward vector (-Z facing)
    const forward = new THREE.Vector3();
    this.root.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.001) {
      forward.normalize();
    } else {
      forward.set(0, 0, -1);
    }

    const dragonPos = this.root.position;
    
    const checkRadius = 5.0; // 5.0m radial clearance around dragon torso & paws
    const forwardReach = 5.5; // 5.5m forward reach in front of chest/mouth

    // Forward target position ahead of dragon
    const targetForwardX = dragonPos.x + forward.x * forwardReach;
    const targetForwardZ = dragonPos.z + forward.z * forwardReach;

    // Define AABB volume covering dragon body and forward charge corridor
    const minX = Math.floor(Math.min(dragonPos.x, targetForwardX) - checkRadius);
    const maxX = Math.ceil(Math.max(dragonPos.x, targetForwardX) + checkRadius);

    // CRITICAL: Convert World Y to Grid Y (where Grid Y = World Y * 2.0)
    const groundWorldY = dragonPos.y - this.GROUND_STANCE_HEIGHT;
    const minGridY = Math.max(0, Math.floor((groundWorldY - 0.5) * 2.0));
    const maxGridY = Math.min(63, Math.ceil((dragonPos.y + 7.5) * 2.0));

    const minZ = Math.floor(Math.min(dragonPos.z, targetForwardZ) - checkRadius);
    const maxZ = Math.ceil(Math.max(dragonPos.z, targetForwardZ) + checkRadius);

    let destroyedCount = 0;
    const severedTrunks: { x: number; y: number; z: number }[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minGridY; y <= maxGridY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const blockType = world.getBlock(x, y, z);
          
          // Target wood/log, leaves, and vegetation obstacles
          if (this.isTreeBlock(blockType)) {
            // Destroy block in world
            world.setBlock(x, y, z, BlockType.AIR);
            destroyedCount++;
            
            // Spawn particle debris & smoke puff (world Y = y * 0.5)
            const blockWorldPos = new THREE.Vector3(x + 0.5, (y * 0.5) + 0.25, z + 0.5);
            this.particleManager.spawnBlockDebris(blockType, blockWorldPos, 3);
            if (destroyedCount % 3 === 0) {
              this.particleManager.spawnSmokePuff(blockWorldPos, true);
            }

            if (
              blockType === BlockType.OAK_LOG ||
              blockType === BlockType.OAK_LOG_X ||
              blockType === BlockType.OAK_LOG_Z ||
              blockType === BlockType.FROZEN_LOG ||
              blockType === BlockType.FROZEN_LOG_X ||
              blockType === BlockType.FROZEN_LOG_Z ||
              blockType === BlockType.PETRIFIED_LOG ||
              blockType === BlockType.PETRIFIED_LOG_X ||
              blockType === BlockType.PETRIFIED_LOG_Z ||
              blockType === BlockType.PETRIFIED_SUNWOOD ||
              blockType === BlockType.PETRIFIED_SUNWOOD_X ||
              blockType === BlockType.PETRIFIED_SUNWOOD_Z
            ) {
              severedTrunks.push({ x, y, z });
            }
          }
        }
      }
    }

    // Cascade tree collapse: if trunk is severed, shatter upper canopy structure
    for (const trunk of severedTrunks) {
      for (let dy = 1; dy <= 24; dy++) {
        const uy = trunk.y + dy;
        if (uy >= 64) break;
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            const tx = trunk.x + dx;
            const tz = trunk.z + dz;
            const upperType = world.getBlock(tx, uy, tz);
            if (upperType !== BlockType.AIR && upperType !== BlockType.UNLOADED && this.isTreeBlock(upperType)) {
              world.setBlock(tx, uy, tz, BlockType.AIR);
              destroyedCount++;
              if (destroyedCount % 4 === 0) {
                const upperPos = new THREE.Vector3(tx + 0.5, (uy * 0.5) + 0.25, tz + 0.5);
                try {
                  this.particleManager.spawnBlockDebris(upperType, upperPos, 2);
                } catch (e) {}
              }
            }
          }
        }
      }
    }

    if (destroyedCount > 0) {
      try {
        if (typeof this.sound.playBlockBreak === 'function') {
          this.sound.playBlockBreak();
        }
      } catch (e) {}
      console.log(`💥 EMBERWYNN DRAGON SHATTERED ${destroyedCount} TREE & OBSTACLE BLOCKS IN CHARGING PATH!`);
    }
  }

  private updateGrabLift(dt: number, playerPos: THREE.Vector3, playerPhysics?: any): void {
    this.grabLiftTimer += dt;

    this.root.updateMatrixWorld(true);
    if (this.headBone) {
      this.headBone.getWorldPosition(this.mouthWorldPos);
    } else {
      this.root.getWorldPosition(this.mouthWorldPos);
      this.mouthWorldPos.y -= 2.0;
    }

    if (this.grabLiftTimer < 1.2) {
      const climbSpeed = 14.0;
      this.root.position.y += climbSpeed * dt;

      const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion).normalize();
      const climbLook = this.root.position.clone().add(forwardDir.multiplyScalar(5)).add(new THREE.Vector3(0, 10, 0));
      this.root.up.set(0, 1, 0);
      this.root.lookAt(climbLook);

      try {
        this.particleManager.spawnBlockDebris(BlockType.CINDER_SAND, this.mouthWorldPos, 1);
      } catch (e) {}

    } else {
      this.isCarryingPlayer = false;
      this.justReleasedPlayer = true;
      if (playerPhysics) {
        playerPhysics.isDroppedByDragon = true;
      }
      this.enterStalkingOrbit(playerPos);
      console.log('EMBERWYNN DRAGON RELEASED THE PLAYER FROM LIFT!');
    }
  }

  private shootFireballSalvo(playerPos: THREE.Vector3): void {
    if (!this.root) return;

    for (let count = 0; count < 3; count++) {
      setTimeout(() => {
        if (!this.root) return;
        
        this.root.updateMatrixWorld(true);

        const spawnWorldPos = new THREE.Vector3();
        if (this.headBone) {
          this.headBone.getWorldPosition(spawnWorldPos);
        } else {
          this.root.getWorldPosition(spawnWorldPos);
          spawnWorldPos.y -= 3;
        }

        spawnWorldPos.add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          -1,
          (Math.random() - 0.5) * 2
        ));

        const targetWorldPos = playerPos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          0.5,
          (Math.random() - 0.5) * 4
        ));

        const fireball = this.getPooledFireball();
        fireball.spawn(spawnWorldPos, targetWorldPos);
        this.activeFireballs.push(fireball);
      }, count * 300);
    }

    console.log(`Emberwynn Dragon launched a TRIPLE FIREBALL SALVO at player!`);
  }

  private animateLegChain(
    chain: THREE.Bone[],
    stridePhase: number,
    liftPhase: number,
    groundOffset: number,
    isGrounded: boolean,
    isBackLeg: boolean
  ) {
    if (chain.length === 0) return;

    const hip = chain[0];
    const knee = chain.length > 1 ? chain[1] : null;
    const foot = chain.length > 2 ? chain[2] : null;

    const hipInit = this.initialRotations.get(hip);
    if (!hipInit) return;

    if (isGrounded) {
      // Ground walking quadruped gait with active knee flexion & foot placement
      const strideAmp = isBackLeg ? 0.38 : 0.42;
      hip.rotation.x = hipInit.x + stridePhase * strideAmp + groundOffset;
      hip.rotation.z = hipInit.z;

      // Knee joint flexes during forward leg swing to lift foot cleanly over terrain
      if (knee) {
        const kneeInit = this.initialRotations.get(knee);
        if (kneeInit) {
          const flexSign = isBackLeg ? 1.0 : -1.0;
          const kneeFlex = Math.max(0, liftPhase) * (isBackLeg ? 0.40 : 0.45);
          knee.rotation.x = kneeInit.x + flexSign * kneeFlex;
        }
      }

      if (foot) {
        const footInit = this.initialRotations.get(foot);
        if (footInit) {
          const footSign = isBackLeg ? -1.0 : 1.0;
          foot.rotation.x = footInit.x + footSign * (stridePhase * 0.15 + Math.max(0, liftPhase) * 0.20);
        }
      }
    } else {
      // Airborne Flight & Stalking Orbit Stance: Athletic rearward stream with firm knees
      const flightPaddle = Math.sin(this.time * 2.2 + (isBackLeg ? 0.5 : 0));
      const flightPitch = isBackLeg ? 0.30 : 0.15;

      hip.rotation.x = hipInit.x + flightPitch + flightPaddle * 0.10;
      hip.rotation.z = hipInit.z;

      if (knee) {
        const kneeInit = this.initialRotations.get(knee);
        if (kneeInit) {
          const flexSign = isBackLeg ? 1.0 : -1.0;
          knee.rotation.x = kneeInit.x + flexSign * (0.20 + flightPaddle * 0.05);
        }
      }

      if (foot) {
        const footInit = this.initialRotations.get(foot);
        if (footInit) {
          const footSign = isBackLeg ? 1.0 : -1.0;
          foot.rotation.x = footInit.x + footSign * 0.10;
        }
      }
    }
  }

  public dispose(): void {
    for (const fb of this.activeFireballs) {
      fb.dispose();
    }
    this.activeFireballs = [];
    for (const fb of this.fireballPool) {
      fb.dispose();
    }
    this.fireballPool = [];
    this.mixer?.stopAllAction();
    disposeHierarchy(this.root);
    this.scene.remove(this.root);
  }
}
