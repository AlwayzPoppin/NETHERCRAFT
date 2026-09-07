import * as THREE from 'three';
import { VoxelWorld } from '../world/VoxelWorld';
import { InputManager } from '../controls/InputManager';
import { SoundManager } from '../audio/SoundManager';
import { DayNightCycle } from '../environment/DayNightCycle';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { DepthOfFieldManager, DoFQuality } from '../rendering/DepthOfFieldManager';

export interface CharacterColors {
  head: string;
  hair: string;
  torso: string;
  leftArm: string;
  rightArm: string;
  leftLeg: string;
  rightLeg: string;
}

export type ArmorTier = 'none' | 'iron' | 'super_knight' | 'nether_lord';
export type BodyType = 'male' | 'female';
export type HairStyle = 'short' | 'shaggy' | 'spiked' | 'long';
export type Race = 'human' | 'ogre' | 'reptilian';
export type Gender = 'male' | 'female';
export type Ethnicity = 'white' | 'black';

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  jump: string;
  sprint: string;
  crouch: string;
  interact: string;
  inventory: string;
  fly: string;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  inventory: 'Tab',
  fly: 'KeyF',
};

export interface GameSettings {
  graphicsMode: 'ultra' | 'performance';
  fov: number;
  renderDistance: number;
  mouseSensitivity: number;
  invertY: boolean;
  masterVolume: number; // 0 to 100
  musicVolume: number;  // 0 to 100
  sfxVolume: number;    // 0 to 100
  ambianceVolume: number; // 0 to 100
  daySpeed: number;
  gamemode: 'survival' | 'creative';
  leafOpacity: number;
  brightness: number; // 50 to 180 (default: 115)
  contrast: number;   // 50 to 180 (default: 110)
  depthOfField?: boolean;
  dofQuality?: 'off' | 'subtle' | 'cinematic';
  dofIntensity?: number; // 0 to 100 (default: 35)
  keybindings?: KeyBindings;
  characterColors: CharacterColors;
  armorTier: ArmorTier;
  showCape: boolean;
  showWeapon: boolean;
  bodyType: BodyType;
  hairStyle: HairStyle;
  race: Race;
  gender: Gender;
  ethnicity: Ethnicity;
  clothingColor?: string;
  armorTrimColor?: string;
  armorGlowColor?: string;
  adaptivePerformance?: boolean; // Dynamic Render Distance & Graphics Throttling governor
}

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsMode: 'ultra',
  adaptivePerformance: true,
  fov: 75,
  renderDistance: 4,
  mouseSensitivity: 1.0,
  invertY: false,
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  ambianceVolume: 100,
  daySpeed: 1.0,
  gamemode: 'survival',
  leafOpacity: 0.88,
  brightness: 115,
  contrast: 110,
  depthOfField: true,
  dofQuality: 'subtle',
  dofIntensity: 35,
  keybindings: { ...DEFAULT_KEYBINDINGS },
  characterColors: {
    head: '#fca5a5',
    hair: '#78350f',
    torso: '#1e293b',
    leftArm: '#1e293b',
    rightArm: '#1e293b',
    leftLeg: '#0f172a',
    rightLeg: '#0f172a',
  },
  armorTier: 'none',
  showCape: false,
  showWeapon: false,
  armorTrimColor: '#eab308',
  armorGlowColor: '#06b6d4',
  bodyType: 'male',
  hairStyle: 'short',
  race: 'human',
  gender: 'male',
  ethnicity: 'white',
  clothingColor: '#1e293b',
};

const STORAGE_KEY = 'nethercraft_settings_v1';

export class SettingsManager {
  public static load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_KEYBINDINGS } };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        keybindings: {
          ...DEFAULT_KEYBINDINGS,
          ...(parsed.keybindings || {}),
        },
      };
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
      return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_KEYBINDINGS } };
    }
  }

  public static save(settings: GameSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }

  public static syncUI(settings: GameSettings): void {
    // Menu Settings Modal Inputs
    const selectGraphics = document.getElementById('select-graphics-mode') as HTMLSelectElement;
    if (selectGraphics) selectGraphics.value = settings.graphicsMode;

    const fovMenu = document.getElementById('slider-fov-menu') as HTMLInputElement;
    const valFovMenu = document.getElementById('val-fov-menu');
    if (fovMenu) fovMenu.value = settings.fov.toString();
    if (valFovMenu) valFovMenu.innerText = settings.fov.toString();

    const renderDistMenu = document.getElementById('slider-render-dist-menu') as HTMLInputElement;
    const valRenderDistMenu = document.getElementById('val-render-dist-menu');
    if (renderDistMenu) renderDistMenu.value = settings.renderDistance.toString();
    if (valRenderDistMenu) valRenderDistMenu.innerText = settings.renderDistance.toString();

    const leafOpacityMenu = document.getElementById('slider-leaf-opacity-menu') as HTMLInputElement;
    const valLeafOpacityMenu = document.getElementById('val-leaf-opacity-menu');
    if (leafOpacityMenu) leafOpacityMenu.value = settings.leafOpacity.toString();
    if (valLeafOpacityMenu) valLeafOpacityMenu.innerText = settings.leafOpacity.toString();

    const brightMenu = document.getElementById('slider-brightness-menu') as HTMLInputElement;
    const valBrightMenu = document.getElementById('val-brightness-menu');
    if (brightMenu) brightMenu.value = (settings.brightness ?? 115).toString();
    if (valBrightMenu) valBrightMenu.innerText = (settings.brightness ?? 115).toString();

    const contrastMenu = document.getElementById('slider-contrast-menu') as HTMLInputElement;
    const valContrastMenu = document.getElementById('val-contrast-menu');
    if (contrastMenu) contrastMenu.value = (settings.contrast ?? 110).toString();
    if (valContrastMenu) valContrastMenu.innerText = (settings.contrast ?? 110).toString();

    const sensMenu = document.getElementById('slider-sens-menu') as HTMLInputElement;
    const valSensMenu = document.getElementById('val-sens-menu');
    if (sensMenu) sensMenu.value = settings.mouseSensitivity.toString();
    if (valSensMenu) valSensMenu.innerText = settings.mouseSensitivity.toFixed(1);

    const invertCheck = document.getElementById('check-invert-y') as HTMLInputElement;
    if (invertCheck) invertCheck.checked = settings.invertY;

    const volumeMenu = document.getElementById('slider-volume-menu') as HTMLInputElement;
    const valVolumeMenu = document.getElementById('val-volume-menu');
    if (volumeMenu) volumeMenu.value = settings.masterVolume.toString();
    if (valVolumeMenu) valVolumeMenu.innerText = settings.masterVolume.toString();

    const musicMenu = document.getElementById('slider-music-menu') as HTMLInputElement;
    const valMusicMenu = document.getElementById('val-music-menu');
    if (musicMenu) musicMenu.value = (settings.musicVolume ?? 100).toString();
    if (valMusicMenu) valMusicMenu.innerText = (settings.musicVolume ?? 100).toString();

    const sfxMenu = document.getElementById('slider-sfx-menu') as HTMLInputElement;
    const valSfxMenu = document.getElementById('val-sfx-menu');
    if (sfxMenu) sfxMenu.value = (settings.sfxVolume ?? 100).toString();
    if (valSfxMenu) valSfxMenu.innerText = (settings.sfxVolume ?? 100).toString();

    const ambianceMenu = document.getElementById('slider-ambiance-menu') as HTMLInputElement;
    const valAmbianceMenu = document.getElementById('val-ambiance-menu');
    if (ambianceMenu) ambianceMenu.value = (settings.ambianceVolume ?? 100).toString();
    if (valAmbianceMenu) valAmbianceMenu.innerText = (settings.ambianceVolume ?? 100).toString();

    const dofMenuSlider = document.getElementById('slider-dof-menu') as HTMLInputElement;
    const valDofMenu = document.getElementById('val-dof-menu');
    const curDofIntensity = settings.dofIntensity ?? (settings.dofQuality === 'off' || settings.depthOfField === false ? 0 : 35);
    if (dofMenuSlider) dofMenuSlider.value = curDofIntensity.toString();
    if (valDofMenu) valDofMenu.innerText = curDofIntensity.toString();

    const daySpeedSelect = document.getElementById('select-day-speed') as HTMLSelectElement;
    if (daySpeedSelect) daySpeedSelect.value = settings.daySpeed.toString();

    const gamemodeSelect = document.getElementById('select-gamemode') as HTMLSelectElement;
    if (gamemodeSelect) gamemodeSelect.value = settings.gamemode;

    // Pause Overlay Settings Inputs
    const fovPause = document.getElementById('slider-fov') as HTMLInputElement;
    const valFovPause = document.getElementById('val-fov');
    if (fovPause) fovPause.value = settings.fov.toString();
    if (valFovPause) valFovPause.innerText = settings.fov.toString();

    const renderDistPause = document.getElementById('slider-render-dist') as HTMLInputElement;
    const valRenderDistPause = document.getElementById('val-render-dist');
    if (renderDistPause) renderDistPause.value = settings.renderDistance.toString();
    if (valRenderDistPause) valRenderDistPause.innerText = settings.renderDistance.toString();

    const leafOpacityPause = document.getElementById('slider-leaf-opacity') as HTMLInputElement;
    const valLeafOpacityPause = document.getElementById('val-leaf-opacity');
    if (leafOpacityPause) leafOpacityPause.value = settings.leafOpacity.toString();
    if (valLeafOpacityPause) valLeafOpacityPause.innerText = settings.leafOpacity.toString();

    const brightPause = document.getElementById('slider-brightness') as HTMLInputElement;
    const valBrightPause = document.getElementById('val-brightness');
    if (brightPause) brightPause.value = (settings.brightness ?? 115).toString();
    if (valBrightPause) valBrightPause.innerText = (settings.brightness ?? 115).toString();

    const contrastPause = document.getElementById('slider-contrast') as HTMLInputElement;
    const valContrastPause = document.getElementById('val-contrast');
    if (contrastPause) contrastPause.value = (settings.contrast ?? 110).toString();
    if (valContrastPause) valContrastPause.innerText = (settings.contrast ?? 110).toString();

    const dofPauseSlider = document.getElementById('slider-dof-pause') as HTMLInputElement;
    const valDofPause = document.getElementById('val-dof-pause');
    if (dofPauseSlider) dofPauseSlider.value = curDofIntensity.toString();
    if (valDofPause) valDofPause.innerText = curDofIntensity.toString();

    const volumePause = document.getElementById('slider-volume') as HTMLInputElement;
    const valVolumePause = document.getElementById('val-volume');
    if (volumePause) volumePause.value = settings.masterVolume.toString();
    if (valVolumePause) valVolumePause.innerText = settings.masterVolume.toString();

    const musicPause = document.getElementById('slider-music') as HTMLInputElement;
    const valMusicPause = document.getElementById('val-music');
    if (musicPause) musicPause.value = settings.musicVolume.toString();
    if (valMusicPause) valMusicPause.innerText = settings.musicVolume.toString();

    const sfxPause = document.getElementById('slider-sfx') as HTMLInputElement;
    const valSfxPause = document.getElementById('val-sfx');
    if (sfxPause) sfxPause.value = settings.sfxVolume.toString();
    if (valSfxPause) valSfxPause.innerText = settings.sfxVolume.toString();

    const ambiancePause = document.getElementById('slider-ambiance') as HTMLInputElement;
    const valAmbiancePause = document.getElementById('val-ambiance');
    if (ambiancePause) ambiancePause.value = (settings.ambianceVolume ?? 80).toString();
    if (valAmbiancePause) valAmbiancePause.innerText = (settings.ambianceVolume ?? 80).toString();

    // Gender Toggle Buttons
    const gender = settings.gender || 'male';
    const btnGMale = document.getElementById('btn-gender-male');
    const btnGFemale = document.getElementById('btn-gender-female');
    if (btnGMale && btnGFemale) {
      if (gender === 'female') {
        btnGMale.style.background = '#333';
        btnGMale.style.color = '#ccc';
        btnGMale.classList.remove('active');
        btnGFemale.style.background = '#ec4899';
        btnGFemale.style.color = '#fff';
        btnGFemale.classList.add('active');
      } else {
        btnGMale.style.background = '#eab308';
        btnGMale.style.color = '#000';
        btnGMale.classList.add('active');
        btnGFemale.style.background = '#333';
        btnGFemale.style.color = '#ccc';
        btnGFemale.classList.remove('active');
      }
    }

    // Ethnicity Toggle Buttons
    const ethnicity = settings.ethnicity || 'white';
    const btnEWhite = document.getElementById('btn-ethnicity-white');
    const btnEBlack = document.getElementById('btn-ethnicity-black');
    if (btnEWhite && btnEBlack) {
      if (ethnicity === 'black') {
        btnEWhite.style.background = '#333';
        btnEWhite.style.color = '#ccc';
        btnEWhite.classList.remove('active');
        btnEBlack.style.background = '#eab308';
        btnEBlack.style.color = '#000';
        btnEBlack.classList.add('active');
      } else {
        btnEWhite.style.background = '#eab308';
        btnEWhite.style.color = '#000';
        btnEWhite.classList.add('active');
        btnEBlack.style.background = '#333';
        btnEBlack.style.color = '#ccc';
        btnEBlack.classList.remove('active');
      }
    }

    // Character Customization Inputs
    const selectRace = document.getElementById('select-race') as HTMLSelectElement;
    if (selectRace) selectRace.value = settings.race || 'human';

    const selectHairStyle = document.getElementById('select-hair-style') as HTMLSelectElement;
    if (selectHairStyle) selectHairStyle.value = settings.hairStyle || 'short';

    const colHair = document.getElementById('color-hair') as HTMLInputElement;
    if (colHair) colHair.value = settings.characterColors?.hair || '#78350f';

    const colClothing = document.getElementById('color-clothing') as HTMLInputElement;
    if (colClothing) colClothing.value = settings.clothingColor || settings.characterColors?.torso || '#1e293b';

    const grpHairStyle = document.getElementById('group-hair-style');
    const grpHairColor = document.getElementById('group-hair-color');
    const appHeader = document.getElementById('appearance-options-header');
    if (settings.race === 'ogre') {
      if (appHeader) appHeader.innerText = 'Appearance (Ogre Physique)';
      if (grpHairStyle) grpHairStyle.style.opacity = '0.4';
      if (grpHairColor) grpHairColor.style.opacity = '0.4';
    } else {
      if (appHeader) appHeader.innerText = 'Appearance Options';
      if (grpHairStyle) grpHairStyle.style.opacity = '1.0';
      if (grpHairColor) grpHairColor.style.opacity = '1.0';
    }

    const worldRulesBox = document.getElementById('box-world-rules');
    if (worldRulesBox) {
      if (settings.gamemode === 'creative') {
        worldRulesBox.classList.remove('hidden');
      } else {
        worldRulesBox.classList.add('hidden');
      }
    }
  }

  public static apply(
    settings: GameSettings,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    world: VoxelWorld,
    input: InputManager,
    sound: SoundManager,
    dayNight: DayNightCycle,
    player: PlayerPhysics,
    dofManager?: DepthOfFieldManager
  ): void {
    // 1. Camera FOV
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();

    // 2. Render Distance & Leaf Opacity
    world.renderDistance = settings.renderDistance;
    world.setLeafOpacity(settings.leafOpacity);

    // 3. Mouse Sensitivity & Y Inversion
    input.mouseSensitivity = settings.mouseSensitivity;
    input.invertY = settings.invertY;

    // 4. Audio Volumes (Master, Music, SFX & Ambiance)
    sound.updateVolumes(
      settings.masterVolume / 100,
      settings.musicVolume / 100,
      settings.sfxVolume / 100,
      (settings.ambianceVolume ?? 80) / 100
    );

    // 5. Day/Night Cycle Speed
    dayNight.speedMultiplier = settings.daySpeed;

    // 6. Player Flying / Game Mode
    if (settings.gamemode === 'creative') {
      player.isFlying = true;
    }

    // 7. Graphics Preset & Tone Mapping
    const bright = settings.brightness ?? 115;
    const contrast = settings.contrast ?? 110;
    const baseExp = settings.graphicsMode === 'performance' ? 1.05 : 1.25;

    if (settings.graphicsMode === 'performance') {
      renderer.shadowMap.enabled = false;
    } else {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    renderer.toneMappingExposure = (bright / 100) * baseExp;

    // 8. Hardware-accelerated Canvas Filter for Instant Brightness & Contrast
    if (renderer && renderer.domElement) {
      renderer.domElement.style.filter = `brightness(${bright}%) contrast(${contrast}%)`;
    }

    // 9. Depth of Field (DoF) Intensity & Postprocessing Configuration
    if (dofManager) {
      const intensity = settings.dofIntensity ?? (settings.dofQuality === 'off' || settings.depthOfField === false ? 0 : 35);
      dofManager.setIntensity(intensity);
    }

    // 10. Keybindings
    if (settings.keybindings) {
      input.keybindings = { ...settings.keybindings };
    }

    // Update UI elements to reflect current values
    this.syncUI(settings);
  }

  public static syncKeybindingsUI(settings: GameSettings, onRebind?: (action: keyof KeyBindings, newCode: string) => void): void {
    const listEl = document.getElementById('keybindings-list');
    if (!listEl) return;

    const bindings = settings.keybindings || DEFAULT_KEYBINDINGS;
    const actionLabels: Array<{ key: keyof KeyBindings; label: string }> = [
      { key: 'forward', label: 'Move Forward' },
      { key: 'backward', label: 'Move Backward' },
      { key: 'left', label: 'Move Left' },
      { key: 'right', label: 'Move Right' },
      { key: 'jump', label: 'Jump / Ascend' },
      { key: 'sprint', label: 'Sprint' },
      { key: 'crouch', label: 'Crouch / Descend' },
      { key: 'interact', label: 'Interact / Workstations' },
      { key: 'inventory', label: 'Inventory / Survival Tome' },
      { key: 'fly', label: 'Toggle Flight' },
    ];

    listEl.innerHTML = '';
    actionLabels.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'keybind-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'keybind-label';
      labelEl.innerText = label;

      const btnEl = document.createElement('button');
      btnEl.className = 'keybind-btn';
      btnEl.id = `btn-keybind-${key}`;
      btnEl.innerText = this.formatKeyName(bindings[key]);

      let isListening = false;
      const keyHandler = (e: KeyboardEvent) => {
        if (!isListening) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.code !== 'Escape') {
          bindings[key] = e.code;
          btnEl.innerText = this.formatKeyName(e.code);
          if (onRebind) onRebind(key, e.code);
        }

        isListening = false;
        btnEl.classList.remove('listening');
        window.removeEventListener('keydown', keyHandler, true);
      };

      btnEl.addEventListener('click', () => {
        if (isListening) return;
        isListening = true;
        btnEl.classList.add('listening');
        btnEl.innerText = 'PRESS ANY KEY...';
        window.addEventListener('keydown', keyHandler, true);
      });

      row.appendChild(labelEl);
      row.appendChild(btnEl);
      listEl.appendChild(row);
    });
  }

  public static formatKeyName(code: string): string {
    if (!code) return 'UNBOUND';
    if (code.startsWith('Key')) return `[ ${code.slice(3)} ]`;
    if (code.startsWith('Digit')) return `[ ${code.slice(5)} ]`;
    if (code === 'Space') return '[ Space ]';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return '[ Shift ]';
    if (code === 'ControlLeft' || code === 'ControlRight') return '[ Ctrl ]';
    if (code === 'AltLeft' || code === 'AltRight') return '[ Alt ]';
    if (code === 'Tab') return '[ Tab ]';
    return `[ ${code} ]`;
  }
}
