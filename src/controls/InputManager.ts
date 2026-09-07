import * as THREE from 'three';
import { KeyBindings, DEFAULT_KEYBINDINGS } from '../settings/SettingsManager';

export class InputManager {
  public keys: Record<string, boolean> = {};
  public isLocked: boolean = false;
  public keybindings: KeyBindings = { ...DEFAULT_KEYBINDINGS };

  public pitch: number = 0; // Look up/down
  public yaw: number = 0;   // Look left/right

  public activeHotbarIndex: number = 0;

  // Callbacks
  public onMineBlock?: () => void;
  public onPlaceBlock?: () => void;
  public onToggleInventory?: () => void;
  public onToggleDebug?: () => void;
  public onToggleFlight?: () => void;
  public onTogglePerspective?: () => void;
  public onToggleMount?: () => void;
  public onDodgeRoll?: () => void;
  public onToggleDevTools?: () => void;
  public onInteract?: () => boolean | void;
  public onRotatePlacement?: () => boolean;
  public onPause?: () => void;

  public isLeftMouseDown: boolean = false;

  public mouseSensitivity: number = 1.0;
  public invertY: boolean = false;

  // Gamepad state
  public isGamepadConnected: boolean = false;
  public gamepadName: string = '';
  public isGamepadActive: boolean = false;
  private prevButtonStates: Record<number, boolean> = {};

  // Single-frame edge-triggered keypress tracking
  private pendingJustPressed: Set<string> = new Set();
  private activeJustPressed: Set<string> = new Set();

  // Pre-allocated scratch objects to eliminate main-loop per-frame Garbage Collection (GC) pressure
  private _scratchMoveVec: THREE.Vector3 = new THREE.Vector3();
  private _scratchYawEuler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private _scratchForwardVec: THREE.Vector3 = new THREE.Vector3();

  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;

  constructor(domElement: HTMLElement, camera: THREE.PerspectiveCamera) {
    this.domElement = domElement;
    this.camera = camera;

    this.initEventListeners();
    this.initGamepadListeners();
  }

  public isJustPressed(code: string): boolean {
    return this.activeJustPressed.has(code) || this.pendingJustPressed.has(code);
  }

  public isGamepadButtonPressed(btnIndex: number): boolean {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected && pad.buttons[btnIndex]) {
        return pad.buttons[btnIndex].pressed;
      }
    }
    return false;
  }

  private initGamepadListeners(): void {
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  public clearAllKeys(): void {
    this.keys = {};
    this.isLeftMouseDown = false;
    this.pendingJustPressed.clear();
    this.activeJustPressed.clear();
  }

  public requestPointerLock(): void {
    try {
      const res = this.domElement.requestPointerLock();
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch(() => {
          // Promise rejected because user gesture is required or document not ready
        });
      }
    } catch (err) {
      // Ignore non-user gesture pointer lock errors
    }
  }

  public lock(): void {
    this.requestPointerLock();
  }

  // --- Bound Event Handlers for Clean Lifecycle Teardown & Disposal ---
  private onBlur = () => {
    this.clearAllKeys();
  };

  private isFirstFrameAfterLock: boolean = false;

  private onPointerLockChange = () => {
    this.isLocked = document.pointerLockElement !== null;
    if (!this.isLocked) {
      this.isLeftMouseDown = false;
      this.clearAllKeys();
      document.body.classList.add('cursor-unlocked');
      this.spawnUnlockTransitionAnchor();
    } else {
      document.body.classList.remove('cursor-unlocked');
      // Flag first frame after re-locking to swallow stale delta movement
      this.isFirstFrameAfterLock = true;
    }
  };

  private onCanvasClick = () => {
    if (!this.isLocked) {
      const startOverlay = document.getElementById('start-overlay');
      const pauseOverlay = document.getElementById('pause-overlay');
      const tomeModal = document.getElementById('survival-tome-modal');
      const devModal = document.getElementById('dev-tools-modal');
      const isStartHidden = !startOverlay || startOverlay.classList.contains('hidden');
      const isPauseHidden = !pauseOverlay || pauseOverlay.classList.contains('hidden');
      const isTomeHidden = !tomeModal || tomeModal.classList.contains('hidden');
      const isDevHidden = !devModal || devModal.classList.contains('hidden');
      if (isStartHidden && isPauseHidden && isTomeHidden && isDevHidden) {
        this.requestPointerLock();
      }
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isLocked) return;

    // Swallow first delta jump when pointer lock is freshly acquired
    if (this.isFirstFrameAfterLock) {
      this.isFirstFrameAfterLock = false;
      return;
    }

    const sensitivity = 0.002 * this.mouseSensitivity;
    const yFactor = this.invertY ? -1 : 1;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity * yFactor;

    // Clamp pitch to prevent camera flipping upside down (-89 deg to +89 deg)
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // Update camera orientation using pre-allocated Euler scratch
    this._scratchYawEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._scratchYawEuler);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.isLocked) return;

    if (e.button === 0) {
      this.isLeftMouseDown = true;
      if (this.onMineBlock) this.onMineBlock();
    } else if (e.button === 2 && this.onPlaceBlock) {
      this.onPlaceBlock();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isLeftMouseDown = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.isLocked) return;
    if (e.deltaY > 0) {
      this.activeHotbarIndex = (this.activeHotbarIndex + 1) % 9;
    } else {
      this.activeHotbarIndex = (this.activeHotbarIndex - 1 + 9) % 9;
    }
    this.updateHotbarUI();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.keys[e.code]) {
      this.pendingJustPressed.add(e.code);
    }
    this.keys[e.code] = true;

    // 1. Primary Action & Interaction Key ('E' / Rebound Key for Interact, Workstations, Harvest, Pick Up)
    if (e.code === this.keybindings.interact || e.code === 'KeyE') {
      e.preventDefault();
      e.stopPropagation();

      // If workstation is open, close it
      const workstationOverlay = document.getElementById('workstation-overlay');
      if (workstationOverlay && !workstationOverlay.classList.contains('hidden')) {
        workstationOverlay.classList.add('hidden');
        this.requestPointerLock();
        return;
      }

      // If survival tome is open, close it
      const tomeModal = document.getElementById('survival-tome-modal');
      if (tomeModal && !tomeModal.classList.contains('hidden')) {
        if (this.onToggleInventory) this.onToggleInventory();
        return;
      }

      if (this.onInteract) this.onInteract();
      return;
    }

    // 2. Survival Tome / Inventory toggle ('Tab' / Rebound Key)
    if (e.code === this.keybindings.inventory || e.code === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (this.onToggleInventory) this.onToggleInventory();
      return;
    }

    // 2. Escape key handling (Universal modal & workstation closer)
    if (e.code === 'Escape') {
      const devModal = document.getElementById('dev-tools-modal');
      if (devModal && !devModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        if (this.onToggleDevTools) this.onToggleDevTools();
        return;
      }

      const tomeModal = document.getElementById('survival-tome-modal');
      if (tomeModal && !tomeModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        if (this.onToggleInventory) this.onToggleInventory();
        return;
      }

      const invOverlay = document.getElementById('inventory-overlay');
      if (invOverlay && !invOverlay.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        invOverlay.classList.add('hidden');
        this.lock();
        return;
      }

      const workstationOverlay = document.getElementById('workstation-overlay');
      if (workstationOverlay && !workstationOverlay.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        workstationOverlay.classList.add('hidden');
        this.lock();
        return;
      }

      const settingsModal = document.getElementById('menu-settings-modal');
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        settingsModal.classList.add('hidden');
        return;
      }

      const customModal = document.getElementById('character-customization-modal');
      if (customModal && !customModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        customModal.classList.add('hidden');
        return;
      }

      const loadModal = document.getElementById('menu-load-modal');
      if (loadModal && !loadModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        loadModal.classList.add('hidden');
        return;
      }

      if (this.onPause) this.onPause();
      return;
    }

    // Hotbar Number Keys 1-9
    if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      this.activeHotbarIndex = parseInt(e.code.replace('Digit', '')) - 1;
      this.updateHotbarUI();
    }

    // Flight toggle 'F'
    if (e.code === 'KeyF' && this.isLocked) {
      if (this.onToggleFlight) this.onToggleFlight();
    }

    // F3 Debug Screen
    if (e.code === 'F3') {
      e.preventDefault();
      if (this.onToggleDebug) this.onToggleDebug();
    }

    // F5 or C for Third Person Perspective Toggle
    if (e.code === 'F5' || (e.code === 'KeyC' && this.isLocked)) {
      e.preventDefault();
      if (this.onTogglePerspective) this.onTogglePerspective();
    }

    // Rotate Placement Hologram ('R') / Mount Summon ('Z' or 'R')
    if (e.code === 'KeyR' && this.isLocked) {
      e.preventDefault();
      const rotated = this.onRotatePlacement ? this.onRotatePlacement() : false;
      if (!rotated && this.onToggleMount) {
        this.onToggleMount();
      }
    } else if (e.code === 'KeyZ' && this.isLocked) {
      e.preventDefault();
      if (this.onToggleMount) this.onToggleMount();
    }

    // Dev Tools Toggle ('F6', 'F4', or Backquote ` / ~)
    if (e.code === 'F6' || e.code === 'F4' || e.code === 'Backquote') {
      e.preventDefault();
      if (this.onToggleDevTools) this.onToggleDevTools();
      return;
    }

    // Dodge Roll / Evade Key (Left Alt, KeyQ, or KeyV)
    if ((e.code === 'AltLeft' || e.code === 'KeyQ' || e.code === 'KeyV') && this.isLocked) {
      e.preventDefault();
      if (this.onDodgeRoll) this.onDodgeRoll();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onGamepadConnected = (e: GamepadEvent) => {
    this.isGamepadConnected = true;
    this.gamepadName = e.gamepad.id;
    console.log('🎮 Gamepad connected:', e.gamepad.id);
  };

  private onGamepadDisconnected = () => {
    this.isGamepadConnected = false;
    this.gamepadName = '';
    console.log('🎮 Gamepad disconnected');
  };

  private initEventListeners(): void {
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.domElement.addEventListener('click', this.onCanvasClick);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('wheel', this.onWheel);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /**
   * Performs complete event teardown and memory cleanup.
   * Prevents duplicate event listeners and memory leaks during game re-instantiation / HMR.
   */
  public dispose(): void {
    // 1. Remove Window Listeners
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);

    // 2. Remove Document Listeners
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);

    // 3. Remove Canvas DOM Listeners
    if (this.domElement) {
      this.domElement.removeEventListener('click', this.onCanvasClick);
      this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    }

    // 4. Release Pointer Lock
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }

    // 5. Clear Key State & Cache
    this.clearAllKeys();
    this.prevButtonStates = {};

    // 6. Clear Callback References
    this.onMineBlock = undefined;
    this.onPlaceBlock = undefined;
    this.onToggleInventory = undefined;
    this.onToggleDebug = undefined;
    this.onToggleFlight = undefined;
    this.onTogglePerspective = undefined;
    this.onToggleMount = undefined;
    this.onDodgeRoll = undefined;
    this.onToggleDevTools = undefined;
    this.onInteract = undefined;
    this.onRotatePlacement = undefined;
    this.onPause = undefined;
  }

  public update(dt: number): void {
    this.activeJustPressed = new Set(this.pendingJustPressed);
    this.pendingJustPressed.clear();

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let activePad: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]?.connected) {
        activePad = gamepads[i];
        break;
      }
    }

    if (!activePad) {
      this.isGamepadConnected = false;
      return;
    }

    this.isGamepadConnected = true;
    this.gamepadName = activePad.id;

    // Deadzone helper
    const applyDeadzone = (val: number, threshold: number = 0.18) => {
      return Math.abs(val) > threshold ? val : 0;
    };

    // Right Stick Camera Look (Axes 2 & 3)
    const rightStickX = applyDeadzone(activePad.axes[2]);
    const rightStickY = applyDeadzone(activePad.axes[3]);

    if (Math.abs(rightStickX) > 0 || Math.abs(rightStickY) > 0) {
      this.isGamepadActive = true;
      const sensitivity = 2.4 * this.mouseSensitivity * dt;
      const yFactor = this.invertY ? -1 : 1;

      this.yaw -= rightStickX * sensitivity;
      this.pitch -= rightStickY * sensitivity * yFactor;

      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);
    }

    // Button helper
    const isBtnPressed = (idx: number) => {
      return activePad && activePad.buttons[idx] ? activePad.buttons[idx].pressed : false;
    };

    // Trigger Mining / Attack (RT - Button 7 or Axis 5 / Trigger)
    const rtPressed = isBtnPressed(7) || (activePad.axes[5] !== undefined && activePad.axes[5] > 0.4);
    if (rtPressed) {
      if (!this.isLeftMouseDown && this.onMineBlock) {
        this.onMineBlock();
      }
      this.isLeftMouseDown = true;
      this.isGamepadActive = true;
    } else if (this.isGamepadActive && !this.keys['LeftClick']) {
      this.isLeftMouseDown = false;
    }

    // Trigger Place Block (LT - Button 6 or Axis 4 / Trigger)
    const ltPressed = isBtnPressed(6) || (activePad.axes[4] !== undefined && activePad.axes[4] > 0.4);
    if (ltPressed && !this.prevButtonStates[6]) {
      if (this.onPlaceBlock) this.onPlaceBlock();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[6] = ltPressed;

    // Hotbar Switching: LB (Button 4) / RB (Button 5) / D-Pad Left & Right (14, 15)
    const lbPressed = isBtnPressed(4) || isBtnPressed(14);
    if (lbPressed && !this.prevButtonStates[4]) {
      this.activeHotbarIndex = (this.activeHotbarIndex - 1 + 9) % 9;
      this.updateHotbarUI();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[4] = lbPressed;

    const rbPressed = isBtnPressed(5) || isBtnPressed(15);
    if (rbPressed && !this.prevButtonStates[5]) {
      this.activeHotbarIndex = (this.activeHotbarIndex + 1) % 9;
      this.updateHotbarUI();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[5] = rbPressed;

    // Dodge Roll / Evade (Button 1 - B / Circle)
    const btnBPressed = isBtnPressed(1);
    if (btnBPressed && !this.prevButtonStates[1]) {
      if (this.onDodgeRoll) this.onDodgeRoll();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[1] = btnBPressed;

    // Interaction / Inventory Toggle (Button 2 - X / Square)
    const btnXPressed = isBtnPressed(2);
    if (btnXPressed && !this.prevButtonStates[2]) {
      const handled = this.onInteract ? this.onInteract() : false;
      if (!handled && this.onToggleInventory) {
        this.onToggleInventory();
      }
      this.isGamepadActive = true;
    }
    this.prevButtonStates[2] = btnXPressed;

    // Flight Toggle (Button 3 - Y / Triangle)
    const btnYPressed = isBtnPressed(3);
    if (btnYPressed && !this.prevButtonStates[3]) {
      if (this.onToggleFlight) this.onToggleFlight();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[3] = btnYPressed;

    // Mount Summon Toggle (Button 12 - D-Pad Up)
    const btnDpadUp = isBtnPressed(12);
    if (btnDpadUp && !this.prevButtonStates[12]) {
      if (this.onToggleMount) this.onToggleMount();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[12] = btnDpadUp;

    // Pause / Settings (Button 9 - Start / Options)
    const btnStartPressed = isBtnPressed(9);
    if (btnStartPressed && !this.prevButtonStates[9]) {
      if (this.onPause) this.onPause();
      this.isGamepadActive = true;
    }
    this.prevButtonStates[9] = btnStartPressed;
  }

  // Get normalized movement vector from WASD/Stick/Space/Shift/Gamepad using pre-allocated scratch objects
  public getMovementVector(): THREE.Vector3 {
    const move = this._scratchMoveVec.set(0, 0, 0);

    // 1. Keyboard input
    const isPauseHidden = document.getElementById('pause-overlay')?.classList.contains('hidden') !== false;
    const isStartHidden = document.getElementById('start-overlay')?.classList.contains('hidden') !== false;
    const isGameActive = isPauseHidden && isStartHidden;

    if (this.isLocked || isGameActive) {
      if (this.keys[this.keybindings.forward] || this.keys['KeyW']) move.z -= 1;
      if (this.keys[this.keybindings.backward] || this.keys['KeyS']) move.z += 1;
      if (this.keys[this.keybindings.left] || this.keys['KeyA']) move.x -= 1;
      if (this.keys[this.keybindings.right] || this.keys['KeyD']) move.x += 1;
    }

    // 2. Gamepad Left Stick input
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let activePad: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]?.connected) {
        activePad = gamepads[i];
        break;
      }
    }

    if (activePad) {
      const applyDeadzone = (val: number) => (Math.abs(val) > 0.18 ? val : 0);
      const lsX = applyDeadzone(activePad.axes[0]);
      const lsY = applyDeadzone(activePad.axes[1]);

      if (Math.abs(lsX) > 0 || Math.abs(lsY) > 0) {
        move.x = lsX;
        move.z = lsY;
      }
    }

    if (move.lengthSq() > 0) {
      move.normalize();
      this._scratchYawEuler.set(0, this.yaw, 0, 'YXZ');
      move.applyEuler(this._scratchYawEuler);
    }

    // Vertical Movement (Jump / Crouch / Gamepad A/B)
    const isPadJump = activePad ? activePad.buttons[0]?.pressed : false;
    const isPadSneak = activePad ? activePad.buttons[1]?.pressed : false;

    if ((this.isLocked && (this.keys[this.keybindings.jump] || this.keys['Space'])) || isPadJump) move.y += 1;
    if ((this.isLocked && (this.keys[this.keybindings.crouch] || this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC'])) || isPadSneak) move.y -= 1;

    return move;
  }

  public updateHotbarUI(): void {
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, idx) => {
      if (idx === this.activeHotbarIndex) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });
  }

  public getForwardVector(): THREE.Vector3 {
    return this._scratchForwardVec.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  public triggerHaptics(duration: number = 220, strongMagnitude: number = 0.8, weakMagnitude: number = 0.5): void {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected && pad.vibrationActuator) {
        try {
          (pad.vibrationActuator as any).playEffect('dual-rumble', {
            startDelay: 0,
            duration: duration,
            weakMagnitude: weakMagnitude,
            strongMagnitude: strongMagnitude,
          });
        } catch (err) {
          // Ignore unsupported haptics
        }
      }
    }
  }

  public spawnUnlockTransitionAnchor(): void {
    const existing = document.querySelector('.pointer-unlock-anchor');
    if (existing) existing.remove();

    const anchor = document.createElement('div');
    anchor.className = 'pointer-unlock-anchor';
    document.body.appendChild(anchor);
    setTimeout(() => {
      if (anchor.parentNode) anchor.remove();
    }, 400);
  }
}
