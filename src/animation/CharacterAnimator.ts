import * as THREE from 'three';

export type AnimState = 'IDLE' | 'WALK' | 'RUN' | 'SWING';

export interface CharacterJoints {
  root: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
}

export class CharacterAnimator {
  public currentState: AnimState = 'IDLE';
  private joints: CharacterJoints;
  private animTime: number = 0;
  private swingProgress: number = 0;
  private isSwinging: boolean = false;
  public headPitch: number = 0;
  public headYaw: number = 0;

  constructor(joints: CharacterJoints) {
    this.joints = joints;
  }

  public setState(state: AnimState) {
    if (this.currentState === state) return;
    this.currentState = state;
  }

  public triggerSwing() {
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  private readonly baseRootY: number = 1.10;

  public update(dt: number, groundSpeed: number = 0) {
    // If groundSpeed is provided, scale animTime rate to match player's actual movement velocity.
    // Reference speeds: walking = 3.5, running = 6.825 (moveSpeed * sprintMultiplier).
    let speedScale = 1.0;
    if (this.currentState === 'WALK') {
      speedScale = groundSpeed > 0.05 ? groundSpeed / 3.5 : 0.0;
    } else if (this.currentState === 'RUN') {
      speedScale = groundSpeed > 0.05 ? groundSpeed / 6.825 : 0.0;
    }
    this.animTime += dt * speedScale;

    // Reset joint transforms to clean baseline before applying state curves
    this.resetJoints();

    // Handle Swing override progression
    if (this.isSwinging) {
      this.swingProgress += dt * 4.5; // ~220ms swing duration
      if (this.swingProgress >= 1.0) {
        this.swingProgress = 1.0;
        this.isSwinging = false;
      }
    }

    // Apply procedural animation state curves with fluid dynamics
    switch (this.currentState) {
      case 'IDLE':
        this.animateIdle(this.animTime);
        break;
      case 'WALK':
        this.animateLocomotion(this.animTime, 5.2, 0.58, false); // frequency 5.2, stride 0.58
        break;
      case 'RUN':
        this.animateLocomotion(this.animTime, 9.4, 0.92, true); // frequency 9.4, stride 0.92
        break;
      case 'SWING':
        this.animateIdle(this.animTime);
        break;
    }

    // Blend Swing Override onto upper body right arm
    if (this.isSwinging || this.currentState === 'SWING') {
      const p = this.isSwinging ? this.swingProgress : (Math.sin(this.animTime * 7) * 0.5 + 0.5);
      
      // Minecraft overrides the walk cycle of the striking arm completely
      // So we set it exactly to the swing angle + pitch, and yaw it toward the crosshair!
      let swingAngle = 0;
      if (p < 0.3) {
        swingAngle = -0.85 * (p / 0.3);
      } else if (p < 0.7) {
        swingAngle = -0.85 + 1.95 * ((p - 0.3) / 0.4);
      } else {
        swingAngle = 1.1 * (1.0 - (p - 0.7) / 0.3);
      }

      // Compensate for torso pitch so the arm accurately hits the true crosshair angle (inverted for Three.js coordinates)
      this.joints.rightShoulder.rotation.x = swingAngle - (this.headPitch - this.headPitch * 0.4);
      this.joints.rightShoulder.rotation.y = this.headYaw;
      this.joints.rightShoulder.rotation.z = -0.25 * Math.sin(p * Math.PI);
      this.joints.rightElbow.rotation.x = -0.45 * Math.sin(p * Math.PI);
    }

    // Always pitch and yaw head to look at crosshair target within natural anatomical boundaries
    const safePitch = THREE.MathUtils.clamp(this.headPitch, -0.60, 0.66);
    const safeYaw = THREE.MathUtils.clamp(this.headYaw, -Math.PI * 0.35, Math.PI * 0.35);
    this.joints.torso.rotation.x = -safePitch * 0.3;
    this.joints.head.rotation.x = -safePitch * 0.7;
    this.joints.head.rotation.y = safeYaw;
  }

  private resetJoints() {
    const j = this.joints;
    j.root.position.set(0, this.baseRootY, 0);
    j.root.rotation.set(0, 0, 0);
    j.root.scale.set(1, 1, 1);

    j.head.rotation.set(0, 0, 0);

    j.torso.rotation.set(0, 0, 0);
    j.torso.scale.set(1, 1, 1);

    j.leftShoulder.rotation.set(0, 0, 0);
    j.leftElbow.rotation.set(0, 0, 0);

    j.rightShoulder.rotation.set(0, 0, 0);
    j.rightElbow.rotation.set(0, 0, 0);

    j.leftHip.rotation.set(0, 0, 0);
    j.leftKnee.rotation.set(0, 0, 0);

    j.rightHip.rotation.set(0, 0, 0);
    j.rightKnee.rotation.set(0, 0, 0);
  }

  private animateIdle(time: number) {
    const j = this.joints;
    // Organic idle breathing with vertical chest scaling
    const breathRate = 2.8;
    const breathSin = Math.sin(time * breathRate);
    const breathCos = Math.cos(time * breathRate);

    // Torso chest expansion
    j.torso.scale.set(1 + breathCos * 0.008, 1 + breathSin * 0.022, 1 + breathSin * 0.015);

    // Head subtle organic sway & tilt
    j.head.rotation.z = Math.sin(time * 1.4) * 0.025;
    j.head.rotation.y = Math.cos(time * 0.9) * 0.035;

    // Gentle idle arm sway with wrist/elbow lag
    j.leftShoulder.rotation.x = Math.sin(time * 2.0) * 0.08;
    j.rightShoulder.rotation.x = -Math.sin(time * 2.0) * 0.08;
    j.leftElbow.rotation.x = -0.12 + Math.cos(time * 2.0) * 0.04;
    j.rightElbow.rotation.x = -0.12 - Math.cos(time * 2.0) * 0.04;
  }

  private animateLocomotion(time: number, freq: number, amp: number, isRun: boolean) {
    const j = this.joints;
    const cycle = time * freq;

    // Phase offset sine wave curves for left & right limbs
    const strideLeft = Math.sin(cycle);
    const strideRight = Math.sin(cycle + Math.PI);

    // 1. VERTICAL BOUNCE & TORSO BOB & SIDE ROLL
    const bounceAmp = isRun ? 0.08 : 0.045;
    const bounceY = Math.abs(Math.sin(cycle * 2.0)) * bounceAmp;
    j.root.position.y = this.baseRootY + bounceY;

    // Torso yaw rotation & side roll (weight transfer)
    j.torso.rotation.y = -strideLeft * (isRun ? 0.16 : 0.09);
    j.torso.rotation.z = Math.sin(cycle) * (isRun ? 0.06 : 0.035);
    j.root.rotation.z = Math.sin(cycle) * (isRun ? 0.04 : 0.02);

    // 2. PROCEDURAL HEAD SWAY & COUNTER TILT
    j.head.rotation.y = strideLeft * (isRun ? 0.09 : 0.05); // Inertial counter-turn
    j.head.rotation.z = -j.torso.rotation.z * 0.7; // Keeps eyes level with horizon

    // 3. DYNAMIC LIMB SWING & JOINT FOLLOW-THROUGH (Hips, Knees, Arms, Elbows)
    // Leg hips swing in opposition
    j.leftHip.rotation.x = strideLeft * amp;
    j.rightHip.rotation.x = strideRight * amp;

    // Knee joint follow-through: bends sharply on backward kick & foot lift
    const kneeAmp = isRun ? 1.1 : 0.85;
    j.leftKnee.rotation.x = Math.max(0, -strideLeft) * kneeAmp + Math.sin(cycle + 0.4) * 0.12;
    j.rightKnee.rotation.x = Math.max(0, -strideRight) * kneeAmp + Math.sin(cycle + Math.PI + 0.4) * 0.12;

    // Arm shoulders swing in opposition to legs (left arm moves with right leg)
    const armAmp = isRun ? 1.05 : 0.72;
    j.leftShoulder.rotation.x = strideRight * armAmp;
    j.rightShoulder.rotation.x = strideLeft * armAmp;

    // Additional shoulder roll for athletic motion
    j.leftShoulder.rotation.z = 0.05 + Math.sin(cycle) * (isRun ? 0.08 : 0.04);
    j.rightShoulder.rotation.z = -0.05 - Math.sin(cycle) * (isRun ? 0.08 : 0.04);

    // Forearm / Elbow joint pitch tilt and flex follow-through
    const elbowFlexBase = isRun ? -0.45 : -0.22;
    const elbowLag = Math.cos(cycle) * (isRun ? 0.25 : 0.12);
    j.leftElbow.rotation.x = elbowFlexBase - Math.max(0, strideRight) * 0.4 + elbowLag;
    j.rightElbow.rotation.x = elbowFlexBase - Math.max(0, strideLeft) * 0.4 - elbowLag;
  }
}
