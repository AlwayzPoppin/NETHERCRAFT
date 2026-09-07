import * as THREE from 'three';
import { VoxelWorld } from './world/VoxelWorld';
import { PlayerPhysics } from './physics/PlayerPhysics';
import { InputManager } from './controls/InputManager';
import { SoundManager } from './audio/SoundManager';
import { DayNightCycle } from './environment/DayNightCycle';
import { UIManager } from './ui/UIManager';
import { BLOCK_DEFINITIONS, BlockType, TextureGenerator, isPlaceableBlock } from './textures/TextureGenerator';
import { TextureAtlasManager } from './textures/TextureAtlasManager';
import { TitleParticleSystem } from './ui/TitleParticleSystem';
import { CharacterCustomizationRenderer } from './ui/CharacterCustomizationRenderer';
import { WorldSaveManager } from './world/WorldSaveManager';
import { SettingsManager, GameSettings, DEFAULT_SETTINGS } from './settings/SettingsManager';
import { ItemManager } from './items/ItemManager';
import { BlockParticleManager } from './particles/BlockParticleManager';
import { MiningManager } from './world/MiningManager';
import { TreeFellingManager } from './world/TreeFellingManager';
import { CameraRig } from './camera/CameraRig';
import { CloudRenderer } from './environment/CloudRenderer';
import { EmberwynnDragon } from './entities/EmberwynnDragon';
import { BonecrestRamManager } from './entities/BonecrestRamManager';
import { ThornbackBoarManager } from './entities/ThornbackBoarManager';
import { BloomwingChickenManager } from './entities/BloomwingChickenManager';
import { DunestingScorpionManager } from './entities/DunestingScorpionManager';
import { BiomeSerpentManager } from './entities/BiomeSerpentManager';
import { GoblinMinionManager } from './entities/GoblinMinionManager';
import { GroundResourceManager } from './world/GroundResourceManager';
import { SurvivalTomeManager } from './ui/SurvivalTomeManager';
import { NimbusMount } from './entities/NimbusMount';
import { FirstPersonArmManager } from './camera/FirstPersonArmManager';
import { EntityCuller } from './utils/EntityCuller';
import { ModelCache } from './utils/ModelCache';
import { DevToolsManager } from './ui/DevToolsManager';
import { PlacementPreviewManager } from './world/PlacementPreviewManager';
import { DepthOfFieldManager } from './rendering/DepthOfFieldManager';
import { TitleScreenTeardownRegistry } from './ui/TitleScreenTeardownRegistry';

class Game {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private dofManager: DepthOfFieldManager;

  private world: VoxelWorld;
  private player: PlayerPhysics;
  private input: InputManager;
  private sound: SoundManager;
  private dayNight: DayNightCycle;
  private ui: UIManager;
  private itemManager: ItemManager;
  private particleManager: BlockParticleManager;
  private cloudRenderer: CloudRenderer;
  private miningManager: MiningManager;
  private treeFellingManager: TreeFellingManager;
  private cameraRig: CameraRig;
  private fpArmManager: FirstPersonArmManager;
  
  // Entities & World Resources
  private emberwynnDragon: EmberwynnDragon | null = null;
  private bonecrestRamManager: BonecrestRamManager;
  private thornbackBoarManager: ThornbackBoarManager;
  private bloomwingChickenManager: BloomwingChickenManager;
  private dunestingScorpionManager: DunestingScorpionManager;
  private biomeSerpentManager: BiomeSerpentManager;
  private goblinMinionManager: GoblinMinionManager;
  private groundResourceManager: GroundResourceManager;
  private survivalTome: SurvivalTomeManager;
  private nimbusMount: NimbusMount;
  public devTools: DevToolsManager;

  private inGameAvatarRenderer: CharacterCustomizationRenderer;
  private torchPointLight: THREE.PointLight;
  private smokeTimer: number = 0;
  private quicksandBubbleTimer: number = 0;
  private quicksandWarningTimer: number = 3.5;
  private hasHitEntityThisSwing: boolean = false;

  // Block Highlight Box & Placement Preview Hologram
  private highlightBox: THREE.LineSegments;
  private targetedBlockInfo: { blockPos: THREE.Vector3; placePos: THREE.Vector3; faceNormal: THREE.Vector3; type: BlockType } | null = null;
  private placementPreview: PlacementPreviewManager;

  // FPS tracking
  private lastTime: number = performance.now();
  private frameCount: number = 0;
  private fps: number = 60;

  private titleParticleSystem: TitleParticleSystem | null = null;
  private characterRenderer: CharacterCustomizationRenderer | null = null;
  
  private swingProgress: number = 0;
  private isSwinging: boolean = false;
  private swingSpeed: number = 4.5; // Synced with CharacterAnimator (222ms) per swing
  private activeBiome: string | null = null;
  private currentBodyYaw: number = 0;
  private currentHeadYaw: number = 0;
  private currentHeadPitch: number = 0;
  private isDeathScreenActive: boolean = false;
  private isGameRunning: boolean = false;
  private isTabHidden: boolean = false;
  private isContextLost: boolean = false;
  private deathTimer: number | null = null;
  private lastDeathPosition: THREE.Vector3 | null = null;
  private landingSquashTimer: number = 0;
  private autoSaveTimer: number = 0;
  private spawnPoint: THREE.Vector3 = new THREE.Vector3(0, 40, 0);

  // Dynamic Performance Governor State
  private lowFpsDuration: number = 0;
  private throttleCooldown: number = 0;

  // Pre-allocated static scratch vectors for zero-garbage hot-path execution
  private static readonly SCRATCH_CAM_DIR = new THREE.Vector3();
  private static readonly SCRATCH_RIGHT = new THREE.Vector3();
  private static readonly SCRATCH_UP = new THREE.Vector3();
  private static readonly SCRATCH_EYE_POS = new THREE.Vector3();
  private static readonly SCRATCH_MOB_POS = new THREE.Vector3();
  private static readonly SCRATCH_TO_MOB = new THREE.Vector3();
  private static readonly SCRATCH_FLAME_POS = new THREE.Vector3();
  private static readonly SCRATCH_TARGET_BP = new THREE.Vector3();

  constructor() {
    this.container = document.getElementById('game-container') || document.getElementById('app') || document.body;
    this.canvas = (document.getElementById('webgl-canvas') || document.getElementById('game-canvas')) as HTMLCanvasElement;

    if (!this.canvas) {
      throw new Error('Canvas element #webgl-canvas not found in document');
    }

    // 1. Initialize Three.js WebGL Renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 1b. Initialize Cinematic Depth of Field (DoF) Postprocessing Pipeline
    this.dofManager = new DepthOfFieldManager(this.renderer, this.scene, this.camera);

    // 2. Initialize Game Engine Systems
    this.world = new VoxelWorld(this.scene);
    this.player = new PlayerPhysics(8, 8);

    // Preload external custom texture files (like WATER TEXTURE.png)
    TextureGenerator.loadExternalTextures().then((loaded) => {
      if (loaded) {
        this.world.refreshAtlas();
      }
    });
    this.input = new InputManager(this.canvas, this.camera);
    this.sound = new SoundManager();
    this.dayNight = new DayNightCycle(this.scene);
    this.ui = new UIManager(this.world, this.input, this.sound, this.dayNight, this.camera);
    
    // Global Asset Loading Error Boundary Listener
    ModelCache.registerErrorListener((url) => {
      const fileName = url.split('/').pop() || url;
      this.ui.showErrorToast(`Asset Warning: Could not load ${fileName}. Procedural fallback active.`);
    });

    this.itemManager = new ItemManager(this.scene, this.world.atlasTexture);
    this.fpArmManager = new FirstPersonArmManager(this.camera, this.itemManager);
    this.particleManager = new BlockParticleManager(this.scene);
    
    // Handheld Dynamic Torch Point Light (Vast forward illumination range & gentle decay)
    this.torchPointLight = new THREE.PointLight(0xffaa44, 0, 80, 0.75);
    this.scene.add(this.torchPointLight);
    
    // 3. Initialize Cloud Renderer
    this.cloudRenderer = new CloudRenderer(this.scene);
    
    // 3.5 Initialize Entities (Emberwynn Dragon disabled for now)
    this.emberwynnDragon = null;
    this.bonecrestRamManager = new BonecrestRamManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.thornbackBoarManager = new ThornbackBoarManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.bloomwingChickenManager = new BloomwingChickenManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.dunestingScorpionManager = new DunestingScorpionManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.biomeSerpentManager = new BiomeSerpentManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.biomeSerpentManager.onSlamImpact = (pos, intensity) => {
      const dist = pos.distanceTo(this.player.position);
      if (dist < 32) {
        const falloff = 1.0 - dist / 32;
        this.treeFellingManager.screenShakeIntensity = Math.max(
          this.treeFellingManager.screenShakeIntensity,
          intensity * falloff
        );
      }
    };
    this.goblinMinionManager = new GoblinMinionManager(
      this.scene,
      this.particleManager,
      this.sound,
      this.world,
      this.itemManager
    );
    this.groundResourceManager = new GroundResourceManager(
      this.scene,
      this.world,
      this.itemManager,
      this.ui,
      this.sound,
      this.particleManager
    );
    this.groundResourceManager.onPickup = () => {
      this.player.triggerPickup();
      if (this.inGameAvatarRenderer) {
        this.inGameAvatarRenderer.triggerPickupAnimation();
      }
    };
    this.survivalTome = new SurvivalTomeManager(this.sound, this.ui, this.player, this.input);
    this.devTools = new DevToolsManager(
      this.player,
      this.world,
      this.dayNight,
      this.ui,
      this.survivalTome,
      () => this.input.requestPointerLock()
    );

    this.treeFellingManager = new TreeFellingManager(
      this.scene,
      this.world,
      this.sound,
      this.particleManager,
      this.itemManager
    );
    this.miningManager = new MiningManager(
      this.scene,
      this.world,
      this.sound,
      this.particleManager,
      this.itemManager,
      this.treeFellingManager
    );

    // Initialize CameraRig & In-Game 3D Player Avatar
    this.cameraRig = new CameraRig(this.camera, this.player, this.world, this.input);
    this.inGameAvatarRenderer = new CharacterCustomizationRenderer(); // Headless in-game mode
    this.inGameAvatarRenderer.autoRotate = false;
    const inGameAvatarGroup = this.inGameAvatarRenderer.getCharacterGroup();
    inGameAvatarGroup.visible = false;
    this.scene.add(inGameAvatarGroup);

    this.input.onTogglePerspective = () => {
      const mode = this.cameraRig.toggleMode();
      let label = '1st Person';
      if (mode === 'THIRD_PERSON_LOCKED') {
        label = '3rd Person (Locked)';
      } else if (mode === 'THIRD_PERSON_ORBIT') {
        label = '3rd Person (360° Orbit)';
      }
      this.ui.showNotification(`Perspective: ${label}`);
    };

    this.input.onDodgeRoll = () => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return;
      const camYaw = this.input.yaw;
      const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const moveVec = this.input.getMovementVector();

      let rollInput: THREE.Vector3 | undefined = undefined;
      if (moveVec.lengthSq() > 0.01) {
        const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
        rollInput = new THREE.Vector3()
          .addScaledVector(right, moveVec.x)
          .addScaledVector(fwd, -moveVec.z)
          .normalize();
      }

      const didRoll = this.player.triggerDodgeRoll(fwd, rollInput);
      if (didRoll) {
        try {
          this.particleManager.spawnBlockDebris(BlockType.ASHEN_SOIL, this.player.position, 2);
          if (typeof this.sound.playFootstep === 'function') {
            this.sound.playFootstep(this.getCurrentBiome());
          }
        } catch (e) {}
        if (this.inGameAvatarRenderer) {
          this.inGameAvatarRenderer.triggerRollAnimation();
        }
      }
    };

    this.input.onInteract = (): boolean => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return false;

      const workstationOverlay = document.getElementById('workstation-overlay');
      if (workstationOverlay && !workstationOverlay.classList.contains('hidden')) {
        this.ui.closeWorkstation();
        return true;
      }

      if (this.survivalTome.isOpen) {
        this.survivalTome.toggle();
        this.input.requestPointerLock();
        return true;
      }

      // 1. Check if aiming directly at an Interactive Workstation Block (Crafting Table, Smithing Forge, etc.)
      if (this.targetedBlockInfo) {
        const targetedType = this.targetedBlockInfo.type;
        if (
          targetedType === BlockType.WORKBENCH ||
          targetedType === BlockType.SMITHING_FORGE ||
          targetedType === BlockType.ARMOR_STATION ||
          targetedType === BlockType.NETHER_ALTAR
        ) {
          this.openWorkstation(targetedType);
          return true;
        }

        // 2. Check if player is aiming directly at a placed Survival Torch
        if (targetedType === BlockType.TORCH) {
          const bp = this.targetedBlockInfo.blockPos;
          this.world.setBlock(bp.x, bp.y, bp.z, BlockType.AIR);
          this.sound.playPop();
          this.ui.addResourceToHotbar(BlockType.TORCH, 1);
          this.survivalTome.addItem(BlockType.TORCH, 1);
          this.ui.showNotification('+1 Survival Torch');
          this.player.triggerPickup();
          return true;
        }

        // 3. Check if player is aiming directly at a harvestable plant/bloom voxel block
        if (this.groundResourceManager.isHarvestableType(targetedType)) {
          const bp = this.targetedBlockInfo.blockPos;
          this.world.setBlock(bp.x, bp.y, bp.z, BlockType.AIR);
          this.particleManager.spawnBlockDebris(targetedType, bp, 3);
          this.sound.playPop();
          this.ui.addResourceToHotbar(targetedType, 1);
          const defName = BLOCK_DEFINITIONS[targetedType]?.name || 'Plant';
          this.ui.showNotification(`+1 ${defName}`);
          this.player.triggerHarvest();
          return true;
        }
      }

      // 3. Check for nearby Ground Resource Node (Reeds, Branches, Stone, Flint, Carrots, etc.)
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const interactData = this.groundResourceManager.getInteractableNode(this.player.position, camDir);

      if (interactData) {
        const res = this.groundResourceManager.collectNode(interactData.node);
        if (res.isHarvest) {
          this.player.triggerHarvest();
        } else {
          this.player.triggerPickup();
        }
        return true;
      }

      // 4. Check for nearby Dropped Items (mined blocks, mob drops, resources)
      const nearbyDropped = this.itemManager.getNearbyItem(this.player.position, camDir, 3.8);
      if (nearbyDropped) {
        this.itemManager.collectItemAtIndex(nearbyDropped.index, this.ui, this.sound);
        this.player.triggerPickup();
        return true;
      }

      return false;
    };

    this.input.onToggleInventory = () => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return;
      this.survivalTome.toggle();
      if (this.survivalTome.isOpen) {
        document.exitPointerLock();
      } else {
        this.input.requestPointerLock();
      }
    };

    // Initialize Nimbus Cloud Mount Summon
    this.nimbusMount = new NimbusMount(this.scene);
    this.input.onToggleMount = () => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return;
      const isMounted = this.player.toggleNimbusMount();
      if (isMounted) {
        this.landingSquashTimer = 0;
        this.nimbusMount.summon(this.player.position, this.currentBodyYaw, this.particleManager);
        this.sound.playMountSummon();
        this.ui.showNotification('☁️ NIMBUS CLOUD SUMMONED! [Press R / Z to Dismount]');
      } else {
        const avatarGroup = this.inGameAvatarRenderer?.getCharacterGroup();
        if (avatarGroup && avatarGroup.parent === this.nimbusMount.getRootGroup()) {
          this.scene.add(avatarGroup);
        }
        this.nimbusMount.dismount(this.particleManager);
        this.sound.playMountDismount();
        this.ui.showNotification('☁️ Nimbus Cloud Dismissed');
      }
    };

    // Atmospheric Distance Fog (eliminates specular Moiré aliasing and adds soft atmospheric depth)
    this.scene.fog = new THREE.FogExp2(0x7dd3fc, 0.010);

    // 3. Load & Apply Saved Settings on Startup
    const savedSettings = SettingsManager.load();
    SettingsManager.apply(
      savedSettings,
      this.camera,
      this.renderer,
      this.world,
      this.input,
      this.sound,
      this.dayNight,
      this.player,
      this.dofManager
    );

    // Initialize floating dark fantasy particle system on full-bleed title screen
    try {
      this.titleParticleSystem = new TitleParticleSystem('title-particle-canvas');
    } catch (e) {
      console.warn('TitleParticleSystem notice:', e);
    }

    // Hydrate async save meta cache from IndexedDB before rendering UI
    WorldSaveManager.init().then(() => {
      this.updateSaveBadge();
    });

    // 4. Two-Stage Splash Screen Transition Logic
    let isSplashActive = true;
    const splashContainer = document.getElementById('splash-prompt-container');
    const menuStack = document.getElementById('main-menu-stack');

    const revealMenuStack = () => {
      this.sound.startTitleMusic();
      if (!isSplashActive) return;
      isSplashActive = false;
      this.sound.playJump();
      splashContainer?.classList.add('fade-out-splash');
      setTimeout(() => {
        if (splashContainer) splashContainer.style.display = 'none';
        menuStack?.classList.remove('hidden-menu-stack');
        menuStack?.classList.add('visible-menu-stack');
      }, 350);
    };

    splashContainer?.addEventListener('click', revealMenuStack);
    document.getElementById('start-overlay')?.addEventListener('click', (e) => {
      if (isSplashActive && e.target !== menuStack && !menuStack?.contains(e.target as Node)) {
        revealMenuStack();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (isSplashActive && !document.getElementById('start-overlay')!.classList.contains('hidden')) {
        revealMenuStack();
      }
    });

    // 5. Settings Tab Switching
    const tabClient = document.getElementById('tab-client-settings');
    const tabKeybind = document.getElementById('tab-keybind-settings');
    const tabWorld = document.getElementById('tab-world-settings');
    const panelClient = document.getElementById('panel-client-settings');
    const panelKeybind = document.getElementById('panel-keybind-settings');
    const panelWorld = document.getElementById('panel-world-settings');

    tabClient?.addEventListener('click', () => {
      tabClient.classList.add('active');
      tabKeybind?.classList.remove('active');
      tabWorld?.classList.remove('active');
      panelClient?.classList.remove('hidden');
      panelKeybind?.classList.add('hidden');
      panelWorld?.classList.add('hidden');
    });

    tabKeybind?.addEventListener('click', () => {
      tabKeybind.classList.add('active');
      tabClient?.classList.remove('active');
      tabWorld?.classList.remove('active');
      panelKeybind?.classList.remove('hidden');
      panelClient?.classList.add('hidden');
      panelWorld?.classList.add('hidden');

      const settings = SettingsManager.load();
      SettingsManager.syncKeybindingsUI(settings, (action, newCode) => {
        this.input.keybindings[action] = newCode;
        SettingsManager.save(settings);
      });
    });

    tabWorld?.addEventListener('click', () => {
      tabWorld.classList.add('active');
      tabClient?.classList.remove('active');
      tabKeybind?.classList.remove('active');
      panelWorld?.classList.remove('hidden');
      panelClient?.classList.add('hidden');
      panelKeybind?.classList.add('hidden');
    });

    // 6. Main Menu Stack Event Handlers
    const newGameModal = document.getElementById('new-game-modal');
    const multiplayerModal = document.getElementById('multiplayer-modal');
    const multiplayerFeedback = document.getElementById('multiplayer-feedback');

    // Single Player / New Game
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
      multiplayerModal?.classList.add('hidden');
      newGameModal?.classList.remove('hidden');
    });

    document.getElementById('btn-close-new-game-modal')?.addEventListener('click', () => {
      newGameModal?.classList.add('hidden');
    });

    // Session Type Toggle in New Game Modal
    const btnSessionSingle = document.getElementById('btn-session-single');
    const btnSessionMulti = document.getElementById('btn-session-multi');

    btnSessionSingle?.addEventListener('click', () => {
      btnSessionSingle.classList.add('active');
      btnSessionMulti?.classList.remove('active');
    });

    btnSessionMulti?.addEventListener('click', () => {
      btnSessionMulti.classList.add('active');
      btnSessionSingle?.classList.remove('active');
      newGameModal?.classList.add('hidden');
      multiplayerModal?.classList.remove('hidden');
    });

    // Multiplayer Realms Menu Handlers
    document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
      newGameModal?.classList.add('hidden');
      multiplayerModal?.classList.remove('hidden');
      if (multiplayerFeedback) multiplayerFeedback.classList.add('hidden');
    });

    document.getElementById('btn-close-multiplayer-modal')?.addEventListener('click', () => {
      multiplayerModal?.classList.add('hidden');
    });

    document.getElementById('btn-back-from-multiplayer')?.addEventListener('click', () => {
      multiplayerModal?.classList.add('hidden');
      newGameModal?.classList.remove('hidden');
      btnSessionSingle?.classList.add('active');
      btnSessionMulti?.classList.remove('active');
    });

    const showMultiplayerFeedback = (msg: string) => {
      if (multiplayerFeedback) {
        multiplayerFeedback.innerText = msg;
        multiplayerFeedback.classList.remove('hidden');
      }
    };

    document.getElementById('btn-direct-connect')?.addEventListener('click', () => {
      const serverIp = (document.getElementById('input-server-ip') as HTMLInputElement)?.value || 'realm.nethercraft.gg';
      showMultiplayerFeedback(`Connecting to ${serverIp}... P2P Multiplayer Relay servers are in active development! Launching Single Player mode is fully supported.`);
    });

    document.getElementById('btn-host-lan')?.addEventListener('click', () => {
      showMultiplayerFeedback('📡 Broadcasting LAN session on port 25565... Dedicated LAN discovery will be available in the next build!');
    });

    document.getElementById('btn-confirm-create-world')?.addEventListener('click', () => {
      newGameModal?.classList.add('hidden');

      // 1. Generate dynamic seed if user left seed field blank, or parse typed seed
      const seedInput = (document.getElementById('input-world-seed') as HTMLInputElement)?.value;
      let numericSeed: number;
      if (seedInput && seedInput.trim().length > 0) {
        numericSeed = 0;
        for (let i = 0; i < seedInput.trim().length; i++) {
          numericSeed = (numericSeed << 5) - numericSeed + seedInput.charCodeAt(i);
        }
      } else {
        numericSeed = Math.floor(Math.random() * 1000000) + 1;
      }

      // 2. Set gamemode & day/night speed
      const gamemode = (document.getElementById('select-new-gamemode') as HTMLSelectElement)?.value;
      this.player.isFlying = (gamemode === 'creative');
      const daySpeed = parseFloat((document.getElementById('select-new-day-speed') as HTMLSelectElement)?.value || '1.0');
      this.dayNight.speedMultiplier = daySpeed;

      // 3. Reset VoxelWorld with new seed and clear old chunk meshes
      this.world.resetWorld(numericSeed);

      // 4. Set initial spawn coordinates in fresh region
      const spawnX = Math.floor(Math.random() * 400) - 200;
      const spawnZ = Math.floor(Math.random() * 400) - 200;
      this.player.position.set(spawnX, 40, spawnZ);

      this.startGame(false);
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => {
      if (WorldSaveManager.hasSave()) {
        this.openLoadModal();
      } else {
        alert('No saved world found! Starting a new game.');
        newGameModal?.classList.remove('hidden');
      }
    });

    document.getElementById('btn-confirm-load')?.addEventListener('click', () => {
      this.closeLoadModal();
      this.startGame(true);
    });

    document.getElementById('btn-delete-save')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete your saved world? This cannot be undone.')) {
        await WorldSaveManager.deleteSave();
        this.updateSaveBadge();
        this.closeLoadModal();
      }
    });

    document.getElementById('btn-close-load-modal')?.addEventListener('click', () => {
      this.closeLoadModal();
    });

    // Character Customization Modal
    const characterModal = document.getElementById('character-customization-modal');
    document.getElementById('btn-character-customization')?.addEventListener('click', () => {
      characterModal?.classList.remove('hidden');
      const settings = SettingsManager.load();
      SettingsManager.syncUI(settings);
      if (!this.characterRenderer) {
        this.characterRenderer = new CharacterCustomizationRenderer('character-preview-container');
        this.characterRenderer.updateFromSettings(settings);
      } else {
        this.characterRenderer.updateFromSettings(settings);
        this.characterRenderer.forceResize();
      }
      setTimeout(() => {
        this.characterRenderer?.forceResize();
      }, 50);
    });
    document.getElementById('btn-close-character-modal')?.addEventListener('click', () => {
      characterModal?.classList.add('hidden');
    });

    // Settings Modal (Unified Shared Modal Component)
    const settingsModal = document.getElementById('menu-settings-modal');
    document.getElementById('btn-menu-settings')?.addEventListener('click', () => {
      const currentGamemode = SettingsManager.load().gamemode;
      this.ui.showSettingsModal(true, currentGamemode);
    });

    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      const currentGamemode = SettingsManager.load().gamemode;
      this.ui.showSettingsModal(false, currentGamemode);
    });

    document.getElementById('btn-pause-dev')?.addEventListener('click', () => {
      const isPauseVisible = !document.getElementById('pause-overlay')?.classList.contains('hidden');
      if (isPauseVisible) {
        this.ui.togglePause(false);
      }
      this.devTools.open();
    });

    const saveCurrentSettings = () => {
      const settings = SettingsManager.load();
      const isPauseVisible = !document.getElementById('pause-overlay')?.classList.contains('hidden');

      if (isPauseVisible) {
        // Pause Menu is open: Read active pause slider inputs
        const pFov = document.getElementById('slider-fov') as HTMLInputElement;
        if (pFov) settings.fov = parseInt(pFov.value);

        const pRenderDist = document.getElementById('slider-render-dist') as HTMLInputElement;
        if (pRenderDist) settings.renderDistance = parseInt(pRenderDist.value);

        const pLeafOpacity = document.getElementById('slider-leaf-opacity') as HTMLInputElement;
        if (pLeafOpacity) settings.leafOpacity = parseFloat(pLeafOpacity.value);

        const pBright = document.getElementById('slider-brightness') as HTMLInputElement;
        if (pBright) settings.brightness = parseInt(pBright.value);

        const pContrast = document.getElementById('slider-contrast') as HTMLInputElement;
        if (pContrast) settings.contrast = parseInt(pContrast.value);

        const pVol = document.getElementById('slider-volume') as HTMLInputElement;
        if (pVol) settings.masterVolume = parseInt(pVol.value);

        const pMusic = document.getElementById('slider-music') as HTMLInputElement;
        if (pMusic) settings.musicVolume = parseInt(pMusic.value);

        const pSfx = document.getElementById('slider-sfx') as HTMLInputElement;
        if (pSfx) settings.sfxVolume = parseInt(pSfx.value);

        const pAmbiance = document.getElementById('slider-ambiance') as HTMLInputElement;
        if (pAmbiance) settings.ambianceVolume = parseInt(pAmbiance.value);

        const pDof = document.getElementById('slider-dof-pause') as HTMLInputElement;
        if (pDof) {
          settings.dofIntensity = parseInt(pDof.value);
          settings.depthOfField = settings.dofIntensity > 0;
        }
      } else {
        // Main Menu / Settings Modal is open: Read menu slider inputs
        const fovMenu = document.getElementById('slider-fov-menu') as HTMLInputElement;
        if (fovMenu) settings.fov = parseInt(fovMenu.value);

        const renderDistMenu = document.getElementById('slider-render-dist-menu') as HTMLInputElement;
        if (renderDistMenu) settings.renderDistance = parseInt(renderDistMenu.value);

        const leafOpacityMenu = document.getElementById('slider-leaf-opacity-menu') as HTMLInputElement;
        if (leafOpacityMenu) settings.leafOpacity = parseFloat(leafOpacityMenu.value);

        const brightMenu = document.getElementById('slider-brightness-menu') as HTMLInputElement;
        if (brightMenu) settings.brightness = parseInt(brightMenu.value);

        const contrastMenu = document.getElementById('slider-contrast-menu') as HTMLInputElement;
        if (contrastMenu) settings.contrast = parseInt(contrastMenu.value);

        const menuVol = document.getElementById('slider-volume-menu') as HTMLInputElement;
        if (menuVol) settings.masterVolume = parseInt(menuVol.value);

        const menuMusic = document.getElementById('slider-music-menu') as HTMLInputElement;
        if (menuMusic) settings.musicVolume = parseInt(menuMusic.value);

        const menuSfx = document.getElementById('slider-sfx-menu') as HTMLInputElement;
        if (menuSfx) settings.sfxVolume = parseInt(menuSfx.value);

        const menuAmbiance = document.getElementById('slider-ambiance-menu') as HTMLInputElement;
        if (menuAmbiance) settings.ambianceVolume = parseInt(menuAmbiance.value);

        const menuDof = document.getElementById('slider-dof-menu') as HTMLInputElement;
        if (menuDof) {
          settings.dofIntensity = parseInt(menuDof.value);
          settings.depthOfField = settings.dofIntensity > 0;
        }
      }

      const graphicsSel = document.getElementById('select-graphics-mode') as HTMLSelectElement;
      if (graphicsSel) settings.graphicsMode = (graphicsSel.value as 'ultra' | 'performance') || 'ultra';

      const sensMenu = document.getElementById('slider-sens-menu') as HTMLInputElement;
      if (sensMenu) settings.mouseSensitivity = parseFloat(sensMenu.value);

      const invertYCheck = document.getElementById('check-invert-y') as HTMLInputElement;
      if (invertYCheck) settings.invertY = invertYCheck.checked;

      const daySpeedSel = document.getElementById('select-day-speed') as HTMLSelectElement;
      if (daySpeedSel) settings.daySpeed = parseFloat(daySpeedSel.value);

      const gamemodeSel = document.getElementById('select-gamemode') as HTMLSelectElement;
      if (gamemodeSel) settings.gamemode = (gamemodeSel.value as 'survival' | 'creative') || 'survival';

      // Revised Character Customization Settings (Gender, Ethnicity, Race, Skin Color, Hair Style, Clothing Color)
      const isFemaleBtnActive = document.getElementById('btn-gender-female')?.classList.contains('active');
      settings.gender = isFemaleBtnActive ? 'female' : 'male';

      const isBlackEthnicityActive = document.getElementById('btn-ethnicity-black')?.classList.contains('active');
      settings.ethnicity = isBlackEthnicityActive ? 'black' : 'white';

      const selRace = (document.getElementById('select-race') as HTMLSelectElement)?.value;
      if (selRace) settings.race = selRace as any;

      const selHairStyle = (document.getElementById('select-hair-style') as HTMLSelectElement)?.value;
      if (selHairStyle) settings.hairStyle = selHairStyle as any;

      const hairColor = (document.getElementById('color-hair') as HTMLInputElement)?.value || settings.characterColors?.hair || '#78350f';
      const clothingColor = (document.getElementById('color-clothing') as HTMLInputElement)?.value || settings.clothingColor || '#1e293b';

      settings.clothingColor = clothingColor;
      settings.characterColors = {
        head: settings.characterColors?.head || '#fca5a5',
        hair: hairColor,
        torso: clothingColor,
        leftArm: clothingColor,
        rightArm: clothingColor,
        leftLeg: clothingColor,
        rightLeg: clothingColor,
      };

      if (this.characterRenderer) {
        this.characterRenderer.updateFromSettings(settings);
      }
      SettingsManager.syncUI(settings);

      const current = settings;
      SettingsManager.save(current);
      SettingsManager.apply(
        current,
        this.camera,
        this.renderer,
        this.world,
        this.input,
        this.sound,
        this.dayNight,
        this.player,
        this.dofManager
      );
    };

    const closeSettings = () => {
      saveCurrentSettings();
      settingsModal?.classList.add('hidden');
    };
    document.getElementById('btn-close-settings-modal')?.addEventListener('click', closeSettings);
    document.getElementById('btn-save-settings')?.addEventListener('click', closeSettings);

    // Reset to Defaults handler
    const resetToDefaults = () => {
      const defaults = { ...DEFAULT_SETTINGS };
      
      // Preserve current seed and active custom seed from settings if desired,
      // but client/world graphics and options should restore default values.
      SettingsManager.save(defaults);
      SettingsManager.syncUI(defaults);
      SettingsManager.apply(
        defaults,
        this.camera,
        this.renderer,
        this.world,
        this.input,
        this.sound,
        this.dayNight,
        this.player,
        this.dofManager
      );

      if (this.characterRenderer) {
        this.characterRenderer.updateFromSettings(defaults);
      }
      if (this.inGameAvatarRenderer) {
        this.inGameAvatarRenderer.updateFromSettings(defaults);
      }

      this.ui.showNotification("Settings Reset to Defaults");
    };

    document.getElementById('btn-reset-settings-menu')?.addEventListener('click', resetToDefaults);
    document.getElementById('btn-reset-settings-pause')?.addEventListener('click', resetToDefaults);

    // Character Death Overlay Buttons
    document.getElementById('btn-respawn')?.addEventListener('click', () => {
      this.respawnPlayer();
    });

    document.getElementById('btn-death-load')?.addEventListener('click', () => {
      this.ui.showDeathOverlay(false);
      this.isDeathScreenActive = false;
      this.openLoadModal();
    });

    document.getElementById('btn-death-quit')?.addEventListener('click', () => {
      this.ui.showDeathOverlay(false);
      this.isDeathScreenActive = false;
      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay) {
        startOverlay.classList.remove('hidden');
      }
    });

    // Revised Character Customization Input Event Listeners
    document.getElementById('btn-gender-male')?.addEventListener('click', () => {
      const btnM = document.getElementById('btn-gender-male');
      const btnF = document.getElementById('btn-gender-female');
      if (btnM && btnF) {
        btnM.classList.add('active');
        btnM.style.background = '#eab308';
        btnM.style.color = '#000';
        btnF.classList.remove('active');
        btnF.style.background = '#333';
        btnF.style.color = '#ccc';
      }
      saveCurrentSettings();
    });

    document.getElementById('btn-gender-female')?.addEventListener('click', () => {
      const btnM = document.getElementById('btn-gender-male');
      const btnF = document.getElementById('btn-gender-female');
      if (btnM && btnF) {
        btnF.classList.add('active');
        btnF.style.background = '#ec4899';
        btnF.style.color = '#fff';
        btnM.classList.remove('active');
        btnM.style.background = '#333';
        btnM.style.color = '#ccc';
      }
      saveCurrentSettings();
    });

    document.getElementById('btn-ethnicity-white')?.addEventListener('click', () => {
      const btnW = document.getElementById('btn-ethnicity-white');
      const btnB = document.getElementById('btn-ethnicity-black');
      if (btnW && btnB) {
        btnW.classList.add('active');
        btnW.style.background = '#eab308';
        btnW.style.color = '#000';
        btnB.classList.remove('active');
        btnB.style.background = '#333';
        btnB.style.color = '#ccc';
      }
      saveCurrentSettings();
    });

    document.getElementById('btn-ethnicity-black')?.addEventListener('click', () => {
      const btnW = document.getElementById('btn-ethnicity-white');
      const btnB = document.getElementById('btn-ethnicity-black');
      if (btnW && btnB) {
        btnB.classList.add('active');
        btnB.style.background = '#eab308';
        btnB.style.color = '#000';
        btnW.classList.remove('active');
        btnW.style.background = '#333';
        btnW.style.color = '#ccc';
      }
      saveCurrentSettings();
    });

    const customizationInputs = [
      'select-race', 'select-hair-style', 'color-hair', 'color-clothing'
    ];
    customizationInputs.forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => saveCurrentSettings());
      el?.addEventListener('change', () => saveCurrentSettings());
    });

    // Sync menu settings sliders & inputs
    const fovSlider = document.getElementById('slider-fov-menu') as HTMLInputElement;
    fovSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.camera.fov = val;
      this.camera.updateProjectionMatrix();
      document.getElementById('val-fov-menu')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const renderDistSlider = document.getElementById('slider-render-dist-menu') as HTMLInputElement;
    renderDistSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.world.renderDistance = val;
      document.getElementById('val-render-dist-menu')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const leafOpacitySlider = document.getElementById('slider-leaf-opacity-menu') as HTMLInputElement;
    leafOpacitySlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.world.setLeafOpacity(val);
      document.getElementById('val-leaf-opacity-menu')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const brightSlider = document.getElementById('slider-brightness-menu') as HTMLInputElement;
    brightSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-brightness-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const contrastSlider = document.getElementById('slider-contrast-menu') as HTMLInputElement;
    contrastSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-contrast-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const sensSlider = document.getElementById('slider-sens-menu') as HTMLInputElement;
    sensSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.input.mouseSensitivity = val;
      document.getElementById('val-sens-menu')!.innerText = val.toFixed(1);
      saveCurrentSettings();
    });

    const invertCheck = document.getElementById('check-invert-y') as HTMLInputElement;
    invertCheck?.addEventListener('change', (e) => {
      this.input.invertY = (e.target as HTMLInputElement).checked;
      saveCurrentSettings();
    });

    const volumeSlider = document.getElementById('slider-volume-menu') as HTMLInputElement;
    volumeSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-volume-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const musicSlider = document.getElementById('slider-music-menu') as HTMLInputElement;
    musicSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-music-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const sfxSlider = document.getElementById('slider-sfx-menu') as HTMLInputElement;
    sfxSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-sfx-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const ambianceSlider = document.getElementById('slider-ambiance-menu') as HTMLInputElement;
    ambianceSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-ambiance-menu');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const dofMenuSlider = document.getElementById('slider-dof-menu') as HTMLInputElement;
    dofMenuSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-dof-menu');
      if (span) span.innerText = val.toString();
      this.dofManager.setIntensity(val);
      saveCurrentSettings();
    });

    // Pause Menu Settings Sliders (FOV, Render Distance, Leaf Opacity, Brightness, Contrast, Volumes)
    const fovPauseSlider = document.getElementById('slider-fov') as HTMLInputElement;
    fovPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.camera.fov = val;
      this.camera.updateProjectionMatrix();
      document.getElementById('val-fov')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const renderDistPauseSlider = document.getElementById('slider-render-dist') as HTMLInputElement;
    renderDistPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.world.renderDistance = val;
      document.getElementById('val-render-dist')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const leafOpacityPauseSlider = document.getElementById('slider-leaf-opacity') as HTMLInputElement;
    leafOpacityPauseSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.world.setLeafOpacity(val);
      document.getElementById('val-leaf-opacity')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const brightPauseSlider = document.getElementById('slider-brightness') as HTMLInputElement;
    brightPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-brightness');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const contrastPauseSlider = document.getElementById('slider-contrast') as HTMLInputElement;
    contrastPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-contrast');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const dofPauseSlider = document.getElementById('slider-dof-pause') as HTMLInputElement;
    dofPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-dof-pause');
      if (span) span.innerText = val.toString();
      this.dofManager.setIntensity(val);
      saveCurrentSettings();
    });

    const volumePauseSlider = document.getElementById('slider-volume') as HTMLInputElement;
    volumePauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('val-volume')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const musicPauseSlider = document.getElementById('slider-music') as HTMLInputElement;
    musicPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('val-music')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const sfxPauseSlider = document.getElementById('slider-sfx') as HTMLInputElement;
    sfxPauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('val-sfx')!.innerText = val.toString();
      saveCurrentSettings();
    });

    const ambiancePauseSlider = document.getElementById('slider-ambiance') as HTMLInputElement;
    ambiancePauseSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      const span = document.getElementById('val-ambiance');
      if (span) span.innerText = val.toString();
      saveCurrentSettings();
    });

    const graphicsSelect = document.getElementById('select-graphics-mode') as HTMLSelectElement;
    graphicsSelect?.addEventListener('change', (e) => {
      saveCurrentSettings();
    });

    const daySpeedSelect = document.getElementById('select-day-speed') as HTMLSelectElement;
    daySpeedSelect?.addEventListener('change', (e) => {
      saveCurrentSettings();
    });

    // Save World in Pause Menu
    document.getElementById('btn-save-world-pause')?.addEventListener('click', () => {
      if (this.saveCurrentWorld()) {
        alert('✨ World saved successfully!');
      } else {
        alert('Failed to save world data.');
      }
    });

    // Save & Exit to Main Menu
    document.getElementById('btn-exit-to-menu')?.addEventListener('click', async () => {
      this.saveCurrentWorld();
      await WorldSaveManager.flushPendingSave();
      this.isGameRunning = false;
      document.getElementById('pause-overlay')?.classList.add('hidden');
      document.getElementById('start-overlay')?.classList.remove('hidden');
      document.exitPointerLock();
    });

    // 3. Highlight Box Wireframe for Block Targeting (4x4 Microvoxel Grid)
    const createMicrovoxelTargetGeometry = (w: number, h: number, d: number, subdivisions: number = 4) => {
      const points: number[] = [];
      const hx = w / 2, hy = h / 2, hz = d / 2;
      const dx = w / subdivisions, dy = h / subdivisions, dz = d / subdivisions;

      // 12 Outer Box Edges
      points.push(-hx, -hy, -hz,  hx, -hy, -hz);
      points.push( hx, -hy, -hz,  hx, -hy,  hz);
      points.push( hx, -hy,  hz, -hx, -hy,  hz);
      points.push(-hx, -hy,  hz, -hx, -hy, -hz);
      points.push(-hx,  hy, -hz,  hx,  hy, -hz);
      points.push( hx,  hy, -hz,  hx,  hy,  hz);
      points.push( hx,  hy,  hz, -hx,  hy,  hz);
      points.push(-hx,  hy,  hz, -hx,  hy, -hz);
      points.push(-hx, -hy, -hz, -hx,  hy, -hz);
      points.push( hx, -hy, -hz,  hx,  hy, -hz);
      points.push( hx, -hy,  hz,  hx,  hy,  hz);
      points.push(-hx, -hy,  hz, -hx,  hy,  hz);

      // Microvoxel Sub-Grid lines
      for (let i = 1; i < subdivisions; i++) {
        const x = -hx + i * dx;
        const z = -hz + i * dz;
        // Top & Bottom
        points.push(x,  hy, -hz,  x,  hy,  hz);
        points.push(-hx,  hy, z,  hx,  hy, z);
        points.push(x, -hy, -hz,  x, -hy,  hz);
        points.push(-hx, -hy, z,  hx, -hy, z);
      }
      for (let i = 1; i < subdivisions; i++) {
        const x = -hx + i * dx;
        const y = -hy + i * dy;
        // Front & Back
        points.push(x, -hy,  hz,  x,  hy,  hz);
        points.push(-hx, y,  hz,  hx, y,  hz);
        points.push(x, -hy, -hz,  x,  hy, -hz);
        points.push(-hx, y, -hz,  hx, y, -hz);
      }
      for (let i = 1; i < subdivisions; i++) {
        const z = -hz + i * dz;
        const y = -hy + i * dy;
        // Left & Right
        points.push( hx, -hy, z,  hx,  hy, z);
        points.push( hx, y, -hz,  hx, y,  hz);
        points.push(-hx, -hy, z, -hx,  hy, z);
        points.push(-hx, y, -hz, -hx, y,  hz);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return geo;
    };

    const targetGridGeo = createMicrovoxelTargetGeometry(1.008, 0.508, 1.008, 4);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.85 });
    this.highlightBox = new THREE.LineSegments(targetGridGeo, lineMat);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    // 3b. Placement Hologram Preview Manager
    this.placementPreview = new PlacementPreviewManager(this.scene);

    // 4. Setup Input Callbacks
    this.setupInputHandlers();

    // 5. Initial Chunk Pre-loading
    this.world.updateChunksAroundPlayer(this.player.position);

    // 6. Window Resize Handler
    window.addEventListener('resize', () => this.onWindowResize());

    // 7. Start Play Overlay Button
    document.getElementById('btn-play')?.addEventListener('click', () => {
      document.getElementById('start-overlay')!.classList.add('hidden');
      this.input.requestPointerLock();
    });

    // 8. Start Animation Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupInputHandlers(): void {
    // Mine Block (Left Click - now handled by MiningManager duration progress)
    this.input.onMineBlock = () => {
      // Hold-to-mine handled in animation loop via miningManager
    };

    // Place Block & Interact with Workstations (Right Click)
    this.input.onPlaceBlock = () => {
      if (this.targetedBlockInfo) {
        const targetedType = this.targetedBlockInfo.type;

        // Interactive Workstation Blocks
        if (
          targetedType === BlockType.WORKBENCH ||
          targetedType === BlockType.SMITHING_FORGE ||
          targetedType === BlockType.ARMOR_STATION ||
          targetedType === BlockType.NETHER_ALTAR
        ) {
          this.openWorkstation(targetedType);
          return;
        }

        const { placePos } = this.targetedBlockInfo;
        const selectedType = this.ui.getSelectedBlockType();

        if (selectedType === null) return; // Cannot place if active slot is empty or count is 0
        if (!isPlaceableBlock(selectedType)) {
          return; // Tools, raw foraging materials, monster drops cannot be placed as voxel blocks
        }

        // Check if placing block inside player bounding box
        const playerMinX = this.player.position.x - this.player.width / 2;
        const playerMaxX = this.player.position.x + this.player.width / 2;
        const playerMinY = this.player.position.y;
        const playerMaxY = this.player.position.y + this.player.height;
        const playerMinZ = this.player.position.z - this.player.width / 2;
        const playerMaxZ = this.player.position.z + this.player.width / 2;

        const isInsidePlayer =
          placePos.x + 1 > playerMinX &&
          placePos.x < playerMaxX &&
          placePos.y + 1 > playerMinY &&
          placePos.y < playerMaxY &&
          placePos.z + 1 > playerMinZ &&
          placePos.z < playerMaxZ;

        if (selectedType === BlockType.TORCH) {
          let torchOrientation = 0;
          const fn = this.targetedBlockInfo.faceNormal;
          if (fn.y > 0.5) {
            torchOrientation = 0; // Floor
          } else if (fn.x > 0.5) {
            torchOrientation = 1; // West wall
          } else if (fn.x < -0.5) {
            torchOrientation = 2; // East wall
          } else if (fn.z > 0.5) {
            torchOrientation = 3; // North wall
          } else if (fn.z < -0.5) {
            torchOrientation = 4; // South wall
          }
          this.world.setBlock(placePos.x, placePos.y, placePos.z, selectedType, torchOrientation);
          this.ui.consumeActiveResource();
          this.sound.playBlockPlace();
          return;
        }

        if (!isInsidePlayer) {
          const rotAngle = this.placementPreview.getRotationAngle(this.input.yaw);
          this.world.setBlock(placePos.x, placePos.y, placePos.z, selectedType, rotAngle);
          this.ui.consumeActiveResource();
          this.sound.playBlockPlace();
        }
      }
    };

    // Rotate Placement Hologram ('R')
    this.input.onRotatePlacement = (): boolean => {
      const selectedType = this.ui.getSelectedBlockType();
      if (
        isPlaceableBlock(selectedType) &&
        selectedType !== BlockType.TORCH &&
        this.targetedBlockInfo
      ) {
        this.placementPreview.rotateClockwise();
        this.sound.playPop();
        return true;
      }
      return false;
    };

    // Flight toggle ('F')
    this.input.onToggleFlight = () => {
      this.player.isFlying = !this.player.isFlying;
      this.sound.playJump();
    };

    // Survival Tome / RPG Codex Toggle ('Tab')
    this.input.onToggleInventory = () => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return;
      this.survivalTome.toggle();
      if (this.survivalTome.isOpen) {
        document.exitPointerLock();
      } else {
        this.input.requestPointerLock();
      }
    };

    // Developer Tools & Biome Warp Toggle ('F6', 'F4', or Backquote ` / ~)
    this.input.onToggleDevTools = () => {
      if (this.player.health <= 0 || this.isDeathScreenActive) return;
      this.devTools.toggle();
    };

    // F3 Debug screen
    this.input.onToggleDebug = () => {
      this.ui.toggleDebug();
    };

    // Pause menu & Auto-Save
    this.input.onPause = () => {
      if (this.devTools && this.devTools.isOpen) {
        this.devTools.close();
        this.input.requestPointerLock();
        return;
      }

      if (this.survivalTome && this.survivalTome.isOpen) {
        this.survivalTome.close();
        this.input.requestPointerLock();
        return;
      }

      const isStartScreenVisible = !document.getElementById('start-overlay')!.classList.contains('hidden');
      const isDeathScreenVisible = !document.getElementById('death-overlay')!.classList.contains('hidden') || this.isDeathScreenActive;
      const isInventoryVisible = !document.getElementById('inventory-overlay')!.classList.contains('hidden');
      const isWorkstationVisible = !document.getElementById('workstation-overlay')!.classList.contains('hidden');

      if (!isStartScreenVisible && !isDeathScreenVisible && !isInventoryVisible && !isWorkstationVisible) {
        WorldSaveManager.save(this.world, this.player, this.input, this.ui);
        this.updateSaveBadge();
        this.ui.showNotification('💾 World Saved');
        const settings = SettingsManager.load();
        const isCreative = this.player.isFlying || settings.gamemode === 'creative';
        this.ui.togglePause(undefined, isCreative);
      }
    };

    // Window Resize Listener
    window.addEventListener('resize', () => this.onWindowResize());

    // Application Focus & Visibility Pausing (Prevents dt spikes, entity physics phasing, and audio desync)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isTabHidden = true;
        this.input.clearAllKeys();
        this.sound.pauseAllAmbiance();
      } else {
        this.isTabHidden = false;
        this.lastTime = performance.now();
        this.input.clearAllKeys();
        this.sound.initCtx();
        this.sound.resumeAllAmbiance();
      }
    });

    window.addEventListener('blur', () => {
      this.input.clearAllKeys();
    });

    window.addEventListener('focus', () => {
      this.lastTime = performance.now();
      this.input.clearAllKeys();
    });

    // Register WebGL Context Loss & Recovery Event Listeners
    this.setupWebGLContextLossRecovery();

    // Start continuous application animation loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupWebGLContextLossRecovery(): void {
    this.canvas.addEventListener('webglcontextlost', (event: Event) => {
      // 1. Prevent default to inform browser that application will handle context restoration
      event.preventDefault();
      this.isContextLost = true;
      console.warn('⚠️ WebGL Context Lost! GPU reset or device memory exhaustion detected. Freezing render pass & triggering emergency world save...');

      // 2. Trigger Emergency World State Save to safeguard player inventory, coordinates, and voxel edits
      try {
        if (this.isGameRunning && !this.isDeathScreenActive) {
          WorldSaveManager.save(this.world, this.player, this.input, this.ui);
          this.updateSaveBadge();
          console.log('💾 Emergency World Save successfully persisted to localStorage during WebGL context loss.');
        }
      } catch (e) {
        console.error('Failed to execute emergency world save on WebGL context loss:', e);
      }

      // 3. Pause audio playback to prevent audio stutter loops
      try {
        this.sound.pauseAllAmbiance();
      } catch (e) {}

      // 4. Display high-priority contextual recovery banner
      this.ui.showErrorToast('⚠️ GPU WebGL Context Interrupted — Emergency Save Stored. Restoring graphics...', 6000);
    });

    this.canvas.addEventListener('webglcontextrestored', async () => {
      console.log('✨ WebGL Context Restored! Rebuilding graphics pipeline and shader bindings...');
      this.isContextLost = false;

      try {
        // 1. Re-initialize WebGL viewport and projection metrics
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.needsUpdate = true;
        this.dofManager.setSize(window.innerWidth, window.innerHeight);

        // 2. Re-synthesize texture atlas and refresh all world materials
        await TextureGenerator.loadExternalTextures();
        this.world.refreshAtlas();

        // 3. Resume audio
        this.sound.resumeAllAmbiance();

        // 4. Reset frame clock to prevent delta-time spikes
        this.lastTime = performance.now();

        this.ui.showNotification('✨ Graphics Pipeline & GPU Context Restored!');
      } catch (err) {
        console.error('Error during WebGL context restoration:', err);
        this.ui.showErrorToast('Could not automatically rebind all GPU shaders. Please save & reload.');
      }
    });
  }

  private openWorkstation(targetedType: BlockType): void {
    this.ui.openWorkstation(targetedType, (updater) => {
      const settings = SettingsManager.load();
      updater(settings);
      SettingsManager.save(settings);
      SettingsManager.apply(
        settings,
        this.camera,
        this.renderer,
        this.world,
        this.input,
        this.sound,
        this.dayNight,
        this.player,
        this.dofManager
      );
      if (this.characterRenderer) {
        this.characterRenderer.updateFromSettings(settings);
      }
    });
  }

  private updateSaveBadge(): void {
    const badge = document.getElementById('save-badge');
    if (WorldSaveManager.hasSave()) {
      badge?.classList.remove('hidden');
    } else {
      badge?.classList.add('hidden');
    }
  }

  private openLoadModal(): void {
    const info = WorldSaveManager.getSaveInfo();
    if (info) {
      document.getElementById('save-date-text')!.innerText = info.formattedDate;
      document.getElementById('save-blocks-text')!.innerText = info.blockCount.toString();
    }
    document.getElementById('menu-load-modal')?.classList.remove('hidden');
  }

  private closeLoadModal(): void {
    document.getElementById('menu-load-modal')?.classList.add('hidden');
  }

  private async startGame(loadSave: boolean): Promise<void> {
    TitleScreenTeardownRegistry.teardownAll();
    this.titleParticleSystem = null;
    this.sound.stopTitleMusic();
    const startOverlay = document.getElementById('start-overlay');
    const loadingOverlay = document.getElementById('loading-overlay');
    const statusText = document.getElementById('loading-status-text');
    const progressFill = document.getElementById('loading-progress-fill');
    const percentText = document.getElementById('loading-percent-text');

    const updateLoading = (percent: number, status: string) => {
      if (statusText) statusText.innerText = status;
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (percentText) percentText.innerText = `${percent}%`;
    };

    startOverlay?.classList.add('hidden');
    loadingOverlay?.classList.remove('hidden');

    updateLoading(2, 'PREPARING ENVIRONMENT...');

    if (loadSave) {
      const saveData = await WorldSaveManager.load();
      if (saveData) {
        this.world.resetWorld(saveData.seed || 1337);
        this.player.position.set(saveData.playerPos.x, saveData.playerPos.y, saveData.playerPos.z);
        this.input.yaw = saveData.playerYaw || 0;
        this.input.pitch = saveData.playerPitch || 0;
        if (saveData.hotbar) {
          this.ui.hotbarSlots = saveData.hotbar;
          this.ui.renderHotbarIcons();
        }
      }
    }

    // 1. Sequential Full Asset Preloading Gate (Textures -> 3D Block Models -> 49 Chunks) (5% - 65%)
    await this.world.preloadAllAssetsAsync(
      this.player.position.x,
      this.player.position.z,
      3, // 7x7 grid = 49 total pre-rendered chunks (112x112 block spawn zone, remaining streamed dynamically)
      (percent, status) => {
        updateLoading(5 + Math.round(percent * 0.6), status);
      }
    );

    // 2. Preload Nimbus Cloud Mount & First Person Weapon Arms (65% - 75%)
    updateLoading(68, 'LOADING NIMBUS CLOUD MOUNT & WEAPON ARMS...');
    await Promise.all([
      this.nimbusMount.waitUntilReady(),
      this.fpArmManager.waitUntilReady(),
    ]);

    // 3. Preload & Decode Biome Atmospheric & Buffer Audio Tracks (75% - 80%)
    updateLoading(76, 'PRELOADING & DECODING AUDIO BUFFERS...');
    await this.sound.preloadAllAudioAsync((loaded, total, assetName) => {
      const audioPercent = 75 + Math.round((loaded / total) * 5);
      updateLoading(audioPercent, `DECODING AUDIO ASSET: ${assetName.toUpperCase()} (${loaded}/${total})`);
    });

    // 4. Preload Player 3D Avatar & Master Skeleton Animations (80% - 88%)
    updateLoading(82, 'SYNCHRONIZING 3D AVATAR & SKELETON ANIMATIONS...');
    const avatarSettings = SettingsManager.load();
    await this.inGameAvatarRenderer.loadMeshyModel(undefined, avatarSettings);

    // 4b. Preload & Cache All Entity 3D GLB Models (88% - 94%)
    updateLoading(88, 'PRECACHING ENTITY 3D MODELS...');
    await ModelCache.preloadAll((loaded, total) => {
      updateLoading(88 + Math.round((loaded / total) * 6), `CACHING ENTITIES (${loaded}/${total})...`);
    });

    // 5. Populate and Initialize Mobs, Wildlife & Biome Boss Serpents (94% - 97%)
    updateLoading(95, 'AWAKENING BIOME BOSS SERPENTS, GOBLINS & WILDLIFE...');
    this.thornbackBoarManager.populateInitialHerds();
    this.bonecrestRamManager.populateInitialHerds();
    this.bloomwingChickenManager.populateInitialFlocks();
    this.dunestingScorpionManager.populateInitialNests();
    this.biomeSerpentManager.populateInitialBosses();
    this.goblinMinionManager.populateInitialSpawns();

    // 6. Restore Saved Edits or Validate Safe Surface Spawn (96% - 100%)
    updateLoading(97, 'VALIDATING SAFE PLAYER SPAWN LOCATION...');
    if (loadSave) {
      const saveData = await WorldSaveManager.load();
      if (saveData && saveData.userEdits) {
        for (const [key, type] of Object.entries(saveData.userEdits)) {
          const [x, y, z] = key.split(',').map(Number);
          this.world.setBlock(x, y, z, type);
          this.world.userEdits.set(key, type);
        }
      }
    } else {
      // Find safe, non-hazardous surface spawn location
      const safePos = this.findSafeSpawnLocation(this.player.position.x, this.player.position.z);
      this.player.position.copy(safePos);
      this.spawnPoint.copy(safePos);
    }
    this.player.isClimbing = false;
    this.player.climbAction = 'idle';

    updateLoading(100, 'WORLD READY!');

    // Brief 250ms hold phase for smooth visual completion
    await new Promise((r) => setTimeout(r, 250));

    // Hand over control safely to player
    loadingOverlay?.classList.add('hidden');
    this.sound.stopTitleMusic();
    this.isGameRunning = true;
    this.input.requestPointerLock();
  }

  private applyGraphicsPreset(mode: string): void {
    if (mode === 'performance') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMappingExposure = 1.0;
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMappingExposure = 1.15;
    }
    this.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => { m.needsUpdate = true; });
          } else {
            mesh.material.needsUpdate = true;
          }
        }
      }
    });
  }


  private saveCurrentWorld(): boolean {
    const success = WorldSaveManager.save(this.world, this.player, this.input, this.ui);
    this.updateSaveBadge();
    if (success) {
      this.ui.showNotification('💾 World State Saved Successfully!');
    } else {
      this.ui.showNotification('❌ Failed to Save World');
    }
    return success;
  }

  private findSafeSpawnLocation(targetX: number, targetZ: number): THREE.Vector3 {
    const searchRadius = 30;

    for (let r = 0; r <= searchRadius; r += 2) {
      for (let dx = -r; dx <= r; dx += (r === 0 ? 1 : Math.max(1, r))) {
        for (let dz = -r; dz <= r; dz += (r === 0 ? 1 : Math.max(1, r))) {
          const checkX = Math.floor(targetX + dx);
          const checkZ = Math.floor(targetZ + dz);

          for (let y = 63; y >= 0; y--) {
            const groundBlock = this.world.getBlock(checkX, y, checkZ);
            if (groundBlock === BlockType.AIR || groundBlock === BlockType.UNLOADED) continue;

            const def = BLOCK_DEFINITIONS[groundBlock];
            // Reject hazardous blocks (magma, lava, water, ashen soil)
            const isHazard = (
              groundBlock === BlockType.MOLTEN_CORRUPTION ||
              groundBlock === BlockType.WATER ||
              groundBlock === BlockType.OASIS_WATER ||
              groundBlock === BlockType.JUNGLE_WATER ||
              groundBlock === BlockType.ASHEN_SOIL ||
              (def && (def.isLiquid || def.name.toLowerCase().includes('magma') || def.name.toLowerCase().includes('lava')))
            );

            if (isHazard) {
              break; // Skip hazardous liquid or magma column
            }

            const feetBlock = this.world.getBlock(checkX, y + 1, checkZ);
            const headBlock = this.world.getBlock(checkX, y + 2, checkZ);
            const isFeetClear = feetBlock === BlockType.AIR || feetBlock === BlockType.UNLOADED;
            const isHeadClear = headBlock === BlockType.AIR || headBlock === BlockType.UNLOADED;

            if (isFeetClear && isHeadClear) {
              console.log(`✅ Safe Spawn Location Validated: X:${checkX}, Y:${(y + 1) * 0.5}, Z:${checkZ} (Ground: ${def ? def.name : groundBlock})`);
              return new THREE.Vector3(checkX + 0.5, (y + 1.0) * 0.5, checkZ + 0.5);
            }
          }
        }
      }
    }

    // Emergency Fallback: Create safe 3x3 Oak Planks platform
    const fbX = Math.floor(targetX);
    const fbZ = Math.floor(targetZ);
    const fbY = 42;
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        this.world.setBlock(fbX + x, fbY - 1, fbZ + z, BlockType.PLANKS);
        this.world.setBlock(fbX + x, fbY, fbZ + z, BlockType.AIR);
        this.world.setBlock(fbX + x, fbY + 1, fbZ + z, BlockType.AIR);
      }
    }
    console.log(`⚠️ Emergency Spawn Created: X:${fbX}, Y:${fbY * 0.5}, Z:${fbZ}`);
    return new THREE.Vector3(fbX + 0.5, fbY * 0.5, fbZ + 0.5);
  }

  private dropPlayerLootOnDeath(): void {
    const deathPos = this.player.position.clone();
    this.lastDeathPosition = deathPos.clone();

    // 1. Drop all items from Hotbar
    if (this.ui && this.ui.hotbarSlots) {
      for (const slot of this.ui.hotbarSlots) {
        if (slot && slot.blockType !== null && slot.count > 0) {
          this.itemManager.spawnPickup(slot.blockType, deathPos, slot.count);
        }
      }
      this.ui.clearHotbar();
    }

    // 2. Drop all items from Backpack Grid & Equipment in Survival Tome
    if (this.survivalTome) {
      // Grid items (slots 9 and beyond to prevent double-dropping if hotbar already dropped 0..8)
      for (let i = 9; i < this.survivalTome.gridSlots.length; i++) {
        const slot = this.survivalTome.gridSlots[i];
        if (slot && slot.type !== null && slot.count > 0) {
          this.itemManager.spawnPickup(slot.type, deathPos, slot.count);
        }
      }

      // Equipment slots (armor, held tools)
      for (const [slotKey, equipItem] of this.survivalTome.equipSlots.entries()) {
        if (equipItem && equipItem.type !== null && equipItem.count > 0) {
          this.itemManager.spawnPickup(equipItem.type, deathPos, equipItem.count);
        }
      }

      this.survivalTome.clearAllInventory();
    }

    // 3. Detach any third-person held item
    if (this.inGameAvatarRenderer) {
      this.inGameAvatarRenderer.attachHeldItem(null, this.itemManager);
    }

    // 4. Update death overlay text with exact death coordinates
    const deathSubtitle = document.querySelector('#death-overlay .death-subtitle') as HTMLElement;
    if (deathSubtitle) {
      deathSubtitle.innerHTML = `You fell at <span style="color: #facc15; font-weight: bold;">X: ${Math.round(deathPos.x)}, Y: ${Math.round(deathPos.y)}, Z: ${Math.round(deathPos.z)}</span>.<br><span style="color: #86efac;">Your dropped loot is waiting there!</span>`;
    }
  }

  private respawnPlayer(): void {
    if (this.deathTimer !== null) {
      clearTimeout(this.deathTimer);
      this.deathTimer = null;
    }

    // Find validated safe solid surface at spawnpoint
    const safePos = this.findSafeSpawnLocation(this.spawnPoint.x, this.spawnPoint.z);
    this.player.position.copy(safePos);
    this.player.velocity.set(0, 0, 0);
    this.player.health = this.player.maxHealth;
    this.player.justTookDamage = false;
    this.player.isTouchingMagma = false;
    (this.player as any).burnTimer = 0;
    (this.player as any).magmaDamageTimer = 0;
    this.player.isClimbing = false;
    this.player.climbAction = 'idle';
    this.isDeathScreenActive = false;

    if (this.inGameAvatarRenderer) {
      this.inGameAvatarRenderer.playAction('stand_up', 0.15);
      setTimeout(() => {
        if (this.inGameAvatarRenderer) {
          this.inGameAvatarRenderer.playAction('idle', 0.3);
        }
      }, 1200);
    }

    this.ui.showDeathOverlay(false);
    this.ui.togglePause(false);
    this.input.requestPointerLock();
    if (this.lastDeathPosition) {
      this.ui.showNotification(`💀 Your dropped loot is waiting at X: ${Math.round(this.lastDeathPosition.x)}, Y: ${Math.round(this.lastDeathPosition.y)}, Z: ${Math.round(this.lastDeathPosition.z)}!`);
    } else {
      this.ui.showNotification('↺ Respawned on Safe Solid Surface!');
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.dofManager.setSize(window.innerWidth, window.innerHeight);
  }

  private lastPlayerChunkX: number = NaN;
  private lastPlayerChunkZ: number = NaN;

  private loop(currentTime: number): void {
    requestAnimationFrame((t) => this.loop(t));

    // If application is backgrounded, tab is hidden, or GPU context is lost, skip simulation step
    if (document.hidden || this.isTabHidden || this.isContextLost) {
      this.lastTime = performance.now();
      return;
    }

    // Calculate Delta Time with safe hard-cap (max 50ms per frame) to prevent physics tunneling
    const rawDt = (currentTime - this.lastTime) / 1000;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    this.lastTime = currentTime;

    this.frameCount++;
    this.world.frameCounter = this.frameCount;
    if (this.frameCount % 20 === 0) {
      this.fps = Math.round(1 / Math.max(dt, 0.001));
    }

    if (!this.isGameRunning) return;

    // Run Dynamic Performance Governor (Auto-throttles shadows/render distance if FPS drops < 30)
    this.updateAdaptivePerformanceGovernor(dt);

    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;

    // 1. Biome Ambient Audio System — Matched 1:1 with Chunk.ts domain warping & cardinal boundaries
    const warpX = this.world.noise.octaveNoise2D(px, pz, 2, 0.5, 0.008) * 32;
    const warpZ = this.world.noise.octaveNoise2D(px + 400, pz + 400, 2, 0.5, 0.008) * 32;
    const effectiveX = px + warpX;
    const effectiveZ = pz + warpZ;

    let currentBiome: 'grove' | 'frost' | 'ruins' | 'sunscorched' | 'rainforest' = 'grove';
    if (effectiveX < -160) {
      currentBiome = 'ruins';
    } else if (effectiveZ < -160) {
      currentBiome = 'frost';
    } else if (effectiveZ >= 220) {
      currentBiome = 'sunscorched';
    } else if (effectiveZ >= 40) {
      currentBiome = 'rainforest';
    } else {
      currentBiome = 'grove';
    }

    // 2. Biome-Scoped Water Hearing Radius & River Stream Lockout
    // - Emerald Grove & Rainforest: 30-block hearing radius for rushing river streams
    // - Sunscorched Desert: 8-block hearing radius for small desert oasis pools
    // - Frost (Ice) & Nether Ruins (Magma): Complete lockout (0-block radius)
    let maxWaterRadius = 30;
    let allowRiverStream = false;

    if (currentBiome === 'grove' || currentBiome === 'rainforest') {
      maxWaterRadius = 30;
      allowRiverStream = true;
    } else if (currentBiome === 'sunscorched') {
      maxWaterRadius = 8;
      allowRiverStream = true;
    } else {
      maxWaterRadius = 0;
      allowRiverStream = false;
    }

    let riverGain = 0;
    let isNearRiver = false;

    if (allowRiverStream && maxWaterRadius > 0) {
      const waterFactor = this.world.getWaterProximityFactor(px, py, pz, maxWaterRadius);
      let riverNoiseGain = 0;

      if (currentBiome === 'grove' || currentBiome === 'rainforest') {
        const riverRaw = Math.abs(this.world.noise.octaveNoise2D(px, pz, 2, 0.5, 0.005));
        const isLowElevation = py <= 42;
        riverNoiseGain = (riverRaw < 0.25 && isLowElevation) ? (1.0 - riverRaw / 0.25) : 0;
      }

      riverGain = Math.max(waterFactor, riverNoiseGain);
      if (this.player.isInWater && (currentBiome === 'grove' || currentBiome === 'rainforest')) riverGain = 1.0;
      isNearRiver = riverGain > 0.01;
    }

    const isDay = this.dayNight.isDaytime();
    this.sound.updateAmbiance(currentBiome, isDay, isNearRiver, riverGain, dt);

    if (this.activeBiome !== currentBiome) {
      this.activeBiome = currentBiome;
      this.ui.showBiomeBanner(currentBiome);
    }

    // Determine ground block under player feet
    const footX = Math.floor(px);
    const footY = Math.floor((this.player.position.y - 0.2) * 2.0);
    const footZ = Math.floor(pz);
    const groundBlock = this.world.getBlock(footX, footY, footZ);
    const groundDef = BLOCK_DEFINITIONS[groundBlock];
    const groundName = groundDef && groundBlock !== BlockType.AIR && groundBlock !== BlockType.UNLOADED ? groundDef.name : undefined;

    // If player returned within 2.5m of death location, clear death waypoint
    if (this.lastDeathPosition) {
      const distToDeath = Math.hypot(this.lastDeathPosition.x - px, this.lastDeathPosition.z - pz);
      if (distToDeath < 2.5) {
        this.lastDeathPosition = null;
        this.ui.showNotification('✨ Loot Retrieved!');
      }
    }

    // Update Top HUD Compass Tape, Coordinates, Ground Inspector & Death Waypoint
    this.ui.updateCompass(this.input.yaw, px, this.player.position.y, pz, groundName, this.lastDeathPosition);

    const isPlayerDead = this.player.health <= 0 || this.isDeathScreenActive;

    // Update 3D Resource Pickup Items (Spin, Bob, Magnet Vacuum & Collection)
    this.itemManager.update(dt, this.player.position, this.world, this.ui, this.sound, isPlayerDead);

    // Update Gamepad & Mouse/Keyboard Input State
    this.input.update(dt);

    // 1. Update Player Physics
    const inputDir = this.input.getMovementVector();
    const isGamepadJump = this.input.isGamepadButtonPressed(0);
    const isGamepadSprint = this.input.isGamepadButtonPressed(10);
    const isGamepadSneak = this.input.isGamepadButtonPressed(1);

    const kb = this.input.keybindings;
    const isJumping = !!(this.input.keys[kb.jump] || this.input.keys['Space']) || isGamepadJump;
    const isSprinting = !!(this.input.keys[kb.sprint] || this.input.keys['ShiftLeft'] || this.input.keys['ShiftRight']) || isGamepadSprint;
    const isSneaking = !!(this.input.keys[kb.crouch] || this.input.keys['ControlLeft'] || this.input.keys['ControlRight'] || this.input.keys['KeyC']) || isGamepadSneak;

    // --- CHARACTER DEATH SEQUENCE INTERCEPT ---
    if (this.player.health <= 0) {
      if (!this.isDeathScreenActive) {
        this.isDeathScreenActive = true;
        this.inGameAvatarRenderer.playAction('dead', 0.15);
        try {
          if (typeof this.sound.playBlockBreak === 'function') {
            this.sound.playBlockBreak();
          }
        } catch (e) {}

        // Drop all inventory and hotbar loot at death location
        this.dropPlayerLootOnDeath();

        if (this.deathTimer !== null) {
          clearTimeout(this.deathTimer);
        }
        // Allow 1.2s for 3D death animation to collapse onto terrain before pausing and opening overlay
        this.deathTimer = window.setTimeout(() => {
          this.deathTimer = null;
          if (this.player.health <= 0) {
            this.ui.showDeathOverlay(true);
          }
        }, 1200);
      }
      this.cameraRig.update();
      this.inGameAvatarRenderer.headPitch = 0;
      this.inGameAvatarRenderer.headYaw = 0;
      this.inGameAvatarRenderer.update(dt);
      return; // Freeze player physics & movement input while dead
    }

    const prevGrounded = this.player.isGrounded;
    this.player.update(dt, inputDir, isJumping, isSprinting, isSneaking, this.world);

    if (!prevGrounded && this.player.isGrounded && !this.player.isFlying) {
      this.sound.playFootstep(currentBiome);
      this.landingSquashTimer = 0.15; // 150ms landing compression impulse
    }
    if (this.player.isGrounded && inputDir.lengthSq() > 0 && this.frameCount % 20 === 0) {
      this.sound.playFootstep(currentBiome);
    }

    // 2. Camera Rig & Third-Person Avatar Update
    this.cameraRig.update();

    const isThirdPerson = this.cameraRig.isThirdPerson();
    const isOrbitMode = this.cameraRig.isOrbitMode();
    const avatarGroup = this.inGameAvatarRenderer.getCharacterGroup();

    const settings = SettingsManager.load();

    // 2a. Determine Body Heading & Kinematic Yaw Target FIRST
    const moveVelSq = this.player.velocity.x * this.player.velocity.x + this.player.velocity.z * this.player.velocity.z;
    const cameraYaw = this.input.yaw + Math.PI;
    let targetBodyYaw = this.currentBodyYaw;

    if ((this.player.isClimbing || this.player.standUpTimer > 0) && this.player.wallNormal.lengthSq() > 0.1) {
      // Wall Face Alignment: Keep character chest, face, and hands oriented forward into top ledge surface
      targetBodyYaw = Math.atan2(this.player.wallNormal.x, this.player.wallNormal.z);
    } else if (this.player.isRolling && this.player.rollDirection.lengthSq() > 0.01) {
      // Dodge Roll Alignment: Keep roll acrobatic trajectory facing exactly forward along dodge direction
      targetBodyYaw = Math.atan2(this.player.rollDirection.x, this.player.rollDirection.z);
    } else if (this.player.isNimbusMounted) {
      // Nimbus Cloud Mount Flight Heading:
      // When moving horizontally in the air, align with flight velocity direction.
      // When hovering stationary:
      // - In 360° Orbit mode, hold cloud heading so orbiting camera does NOT spin the cloud.
      // - In Locked mode, orient forward with camera look direction.
      if (moveVelSq > 0.05) {
        targetBodyYaw = Math.atan2(this.player.velocity.x, this.player.velocity.z);
      } else if (!isOrbitMode) {
        targetBodyYaw = cameraYaw;
      } else {
        targetBodyYaw = this.currentBodyYaw;
      }
    } else if (this.isSwinging) {
      // While mining/swinging, force entire upper body to face the targeted block
      targetBodyYaw = cameraYaw;
    } else if (moveVelSq > 0.1) {
      targetBodyYaw = Math.atan2(this.player.velocity.x, this.player.velocity.z);
    } else {
      // When standing still on foot:
      if (!isOrbitMode) {
        targetBodyYaw = cameraYaw;
      }
    }

    const groundSpeed = Math.sqrt(moveVelSq);

    let diff = (targetBodyYaw - this.currentBodyYaw) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    
    const yawLerpSpeed = (this.player.isClimbing || this.player.standUpTimer > 0) ? 25.0 : (this.player.isNimbusMounted ? 10.0 : (this.isSwinging ? 15.0 : 5.5));
    this.currentBodyYaw += diff * Math.min(1.0, dt * yawLerpSpeed);

    // 2b. Update Nimbus Cloud Mount Kinematics & VFX in 1:1 sync with current frame's body yaw
    if (this.nimbusMount) {
      const flightYaw = this.player.isNimbusMounted ? this.currentBodyYaw : this.input.yaw;
      this.nimbusMount.update(
        dt,
        this.player.position,
        flightYaw,
        this.player.velocity,
        isSprinting,
        this.particleManager
      );
    }

    if (isThirdPerson) {
      if (this.fpArmManager) this.fpArmManager.setVisible(false);
      avatarGroup.visible = true;

      if (this.player.isNimbusMounted) {
        // Direct Scene Graph Attachment:
        // Parent the avatar directly to the Nimbus Mount root group.
        // This locks the rider's local transform rigidly to the cloud deck,
        // completely eliminating sub-pixel vertical tremor and floating-point timing lag!
        if (avatarGroup.parent !== this.nimbusMount.getRootGroup()) {
          this.nimbusMount.getRootGroup().add(avatarGroup);
        }
        avatarGroup.position.set(0, -0.36, 0);
        avatarGroup.rotation.set(0, Math.PI / 2, 0);
        avatarGroup.scale.set(1.0, 1.0, 1.0);
      } else {
        // On foot: Parent avatar to main world scene
        if (avatarGroup.parent !== this.scene) {
          this.scene.add(avatarGroup);
        }

        // Position in-game 3D avatar at player position with terrain surface contact anchoring
        let avatarY = this.player.position.y;
        if (this.player.isGrounded) {
          const footBlockX = Math.floor(this.player.position.x);
          const footBlockY = Math.floor(this.player.position.y - 0.05);
          const footBlockZ = Math.floor(this.player.position.z);
          const bType = this.world.getBlock(footBlockX, footBlockY, footBlockZ);
          if (bType !== 0) {
            const exactGroundY = footBlockY + 1.0;
            if (Math.abs(avatarY - exactGroundY) < 0.25) {
              avatarY = exactGroundY;
            }
          }
        }
        avatarGroup.position.set(this.player.position.x, avatarY, this.player.position.z);

        if (this.landingSquashTimer > 0) {
          this.landingSquashTimer -= dt;
          const progress = 1.0 - Math.max(0, this.landingSquashTimer / 0.15);
          const squashY = 1.0 - 0.08 * Math.sin(progress * Math.PI);
          const bulgeXZ = 1.0 + 0.04 * Math.sin(progress * Math.PI);
          avatarGroup.scale.set(bulgeXZ, squashY, bulgeXZ);
        } else {
          avatarGroup.scale.set(1.0, 1.0, 1.0);
        }

        const footStepPitch = this.player.consecutiveStepCount >= 2 ? 0.18 : 0;
        avatarGroup.rotation.set(footStepPitch, this.currentBodyYaw, 0);
      }

      // Determine look-at targets based on action states
      let targetHeadYawVal = 0;
      let targetHeadPitchVal = 0;

      // Calculate relative camera yaw offset from character torso
      let diffYaw = (cameraYaw - this.currentBodyYaw) % (Math.PI * 2);
      if (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      if (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

      // Anatomical neck rotation limits (Human field of head turn without torso twist)
      // If camera moves beyond ~68° (toward the back/side), head stops following and smoothly returns forward
      const MAX_HEAD_YAW = Math.PI * 0.35;    // ~63° maximum head turn
      const YAW_CUTOFF_START = Math.PI * 0.38; // ~68°: begin soft decay
      const YAW_CUTOFF_END = Math.PI * 0.48;   // ~86°: fully back to forward gaze

      const absDiffYaw = Math.abs(diffYaw);
      let headFollowWeight = 1.0;
      if (absDiffYaw > YAW_CUTOFF_START) {
        const rawProgress = (absDiffYaw - YAW_CUTOFF_START) / (YAW_CUTOFF_END - YAW_CUTOFF_START);
        headFollowWeight = Math.max(0.0, 1.0 - THREE.MathUtils.clamp(rawProgress, 0.0, 1.0));
        headFollowWeight = headFollowWeight * headFollowWeight * (3.0 - 2.0 * headFollowWeight); // Smoothstep curve
      }

      // Vertical neck pitch limits: -35° down to +38° up
      const MAX_PITCH_UP = 0.66;    // ~38° up
      const MAX_PITCH_DOWN = -0.60; // ~34° down
      const clampedPitch = Math.max(MAX_PITCH_DOWN, Math.min(MAX_PITCH_UP, this.input.pitch));
      const clampedYaw = Math.max(-MAX_HEAD_YAW, Math.min(MAX_HEAD_YAW, diffYaw));

      if (this.player.isNimbusMounted) {
        // While mounted on Nimbus, let native cloud surfing animation drive the head smoothly
        targetHeadYawVal = 0;
        targetHeadPitchVal = 0;
      } else if (this.isSwinging) {
        // While swinging/mining, head tracks the crosshair target within safe neck boundaries
        targetHeadYawVal = clampedYaw * headFollowWeight;
        targetHeadPitchVal = clampedPitch * headFollowWeight;
      } else if (moveVelSq > 0.1) {
        // While moving freely, the head relaxes and faces naturally forward along the movement/body direction
        targetHeadYawVal = 0;
        targetHeadPitchVal = 0;
      } else {
        // While standing still, track camera look vector within natural neck rotation range
        targetHeadYawVal = clampedYaw * headFollowWeight;
        targetHeadPitchVal = clampedPitch * headFollowWeight;
      }

      // Smoothly blend head yaw & pitch to avoid aggressive snaps
      this.currentHeadYaw += (targetHeadYawVal - this.currentHeadYaw) * Math.min(1.0, dt * 8.0);
      this.currentHeadPitch += (targetHeadPitchVal - this.currentHeadPitch) * Math.min(1.0, dt * 8.0);

      // Sync character customizer settings & look-at constraint
      this.inGameAvatarRenderer.updateFromSettings(settings);
      this.inGameAvatarRenderer.headPitch = this.currentHeadPitch;
      this.inGameAvatarRenderer.headYaw = this.currentHeadYaw;
      this.inGameAvatarRenderer.animator.headPitch = this.currentHeadPitch;
      this.inGameAvatarRenderer.animator.headYaw = this.currentHeadYaw;

      // Sync Equipped Hotbar Item / Mini-Block
      const selectedType = this.ui.getSelectedBlockType();
      const isHoldingTorch = (selectedType === BlockType.TORCH);

      // Driven in-game skeletal animation updates
      if (this.player.health <= 0) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('dead', 0.2);
      } else if (this.player.isNimbusMounted) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('cloud_surf', 0.15);
      } else if (this.player.isRolling) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('dodge_roll', 0.04, 0.0, 2.2);
      } else if (this.player.justTookDamage) {
        this.inGameAvatarRenderer.playAction('hit_reaction', 0.1);
      } else if (this.player.harvestTimer > 0) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('collect', 0.08, 0.0, 1.8);
      } else if (this.player.pickupTimer > 0) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('item_pickup', 0.06, 0.0, 2.2);
      } else if (this.player.justLedgeVaulted || this.player.standUpTimer > 0) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('stand_up', 0.15);
      } else if (this.player.isClimbing) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        const climbAct = this.player.climbAction;
        if (climbAct === 'climb_up') {
          this.inGameAvatarRenderer.playAction('climb_up', 0.15);
        } else if (climbAct === 'climb_down') {
          this.inGameAvatarRenderer.playAction('climb_down', 0.15);
        } else if (climbAct === 'climb_left') {
          this.inGameAvatarRenderer.playAction('climb_left', 0.15);
        } else if (climbAct === 'climb_right') {
          this.inGameAvatarRenderer.playAction('climb_right', 0.15);
        } else if (climbAct === 'climb_idle') {
          this.inGameAvatarRenderer.playAction('climb_idle', 0.2);
        } else {
          this.inGameAvatarRenderer.playAction('climb_grab', 0.2);
        }
      } else if (this.isSwinging) {
        this.inGameAvatarRenderer.playAction('collect', 0.15);
      } else if ((this.player.justSteppedUp || this.player.stepUpTimer > 0) && moveVelSq > 0.05) {
        if (isSprinting) {
          // When sprinting, maintain continuous RUN animation across all terrain steps for buttery-smooth traversal
          this.inGameAvatarRenderer.animator.setState('RUN');
          this.inGameAvatarRenderer.playAction('run', 0.15);
        } else if (this.player.consecutiveStepCount >= 2) {
          // When walking up continuous slopes/staircases, maintain WALK animation
          this.inGameAvatarRenderer.animator.setState('WALK');
          this.inGameAvatarRenderer.playAction(isHoldingTorch ? 'torch_walk' : 'walk', 0.15);
        } else {
          // Single isolated step while walking slowly
          this.inGameAvatarRenderer.animator.setState('WALK');
          this.inGameAvatarRenderer.playAction(isHoldingTorch ? 'torch_walk' : 'walk_step_up', 0.10, 0.45, 1.8);
        }
        // Consume the stepUp flag so it doesn't linger across multiple steps
        this.player.justSteppedUp = false;
        this.player.stepUpTimer = Math.min(this.player.stepUpTimer, 0.20);
      } else if (this.player.isTouchingQuicksand) {
        if (moveVelSq > 0.005) {
          const qsPlaybackSpeed = (this.player.isStaminaExhausted || this.player.stamina <= 0) ? 0.65 : 1.2;
          this.inGameAvatarRenderer.animator.setState('WALK');
          this.inGameAvatarRenderer.playAction('quicksand_walk', 0.15, 0.0, qsPlaybackSpeed);
        } else {
          this.inGameAvatarRenderer.animator.setState('IDLE');
          this.inGameAvatarRenderer.playAction(isHoldingTorch ? 'torch_idle' : 'idle', 0.2);
        }
      } else if (!this.player.isGrounded && this.player.velocity.y < -3.0) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('falling', 0.15);
      } else if (!this.player.isGrounded) {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction('jump', 0.10);
      } else if (moveVelSq > 0.05 && isSprinting) {
        this.inGameAvatarRenderer.animator.setState('RUN');
        this.inGameAvatarRenderer.playAction('run', 0.12);
      } else if (moveVelSq > 0.05) {
        this.inGameAvatarRenderer.animator.setState('WALK');
        this.inGameAvatarRenderer.playAction(isHoldingTorch ? 'torch_walk' : 'walk', 0.12);
      } else {
        this.inGameAvatarRenderer.animator.setState('IDLE');
        this.inGameAvatarRenderer.playAction(isHoldingTorch ? 'torch_idle' : 'idle', 0.15);
      }
      this.inGameAvatarRenderer.animator.update(dt, groundSpeed);
      this.inGameAvatarRenderer.update(dt, groundSpeed);
    } else {
      if (this.fpArmManager) this.fpArmManager.setVisible(true);
      avatarGroup.visible = false;
      this.fpArmManager?.syncWithSettings(settings);
    }

    // Sync Equipped Hotbar Item / Mini-Block
    const selectedType = this.ui.getSelectedBlockType();
    if (this.fpArmManager) {
      this.fpArmManager.syncHeldItem(selectedType);
    }
    if (this.inGameAvatarRenderer) {
      this.inGameAvatarRenderer.syncHeldItem(selectedType, this.itemManager);
    }

    // Dynamic torch illumination & organic flame flicker
    const hasActiveTorch = selectedType === BlockType.TORCH;

    if (hasActiveTorch) {
      // Main-hand active torch: bright, crackling flame with high range and dynamic warm color modulation
      const flicker = Math.sin(currentTime * 0.013) * 0.48 + Math.sin(currentTime * 0.027) * 0.28 + Math.sin(currentTime * 0.061) * 0.16 + (Math.random() - 0.5) * 0.12;
      this.torchPointLight.intensity = 6.5 + flicker;
      this.torchPointLight.distance = 80;
      this.torchPointLight.decay = 0.75;
      this.torchPointLight.color.setRGB(1.0, 0.72 + Math.sin(currentTime * 0.009) * 0.08, 0.30);

      this.camera.getWorldDirection(Game.SCRATCH_CAM_DIR);
      Game.SCRATCH_RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

      // Project the light forward and slightly to the right near the torch flame head so it illuminates the path ahead
      this.torchPointLight.position.copy(this.player.getCameraPosition())
        .addScaledVector(Game.SCRATCH_CAM_DIR, 1.2)
        .addScaledVector(Game.SCRATCH_RIGHT, 0.35);

      // Handheld flame ember particles emitted directly from the top flame head
      if (this.frameCount % 3 === 0) {
        let flamePos: THREE.Vector3 | null = null;
        if (this.fpArmManager) {
          flamePos = this.fpArmManager.getTorchFlameWorldPos();
        }
        if (!flamePos) {
          Game.SCRATCH_UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
          flamePos = Game.SCRATCH_FLAME_POS.copy(this.player.getCameraPosition())
            .addScaledVector(Game.SCRATCH_CAM_DIR, 0.44)
            .addScaledVector(Game.SCRATCH_RIGHT, 0.16)
            .addScaledVector(Game.SCRATCH_UP, 0.16);
        }
        this.particleManager.spawnTorchEmber(flamePos, 1);
      }
    } else {
      // No torch in hand: point light is completely off
      this.torchPointLight.intensity = 0;
    }

    // Update in-world placed torch flickers and ember emissions
    this.world.updateTorchAnimations(currentTime, this.player.position, this.particleManager);

    // 5b. Update Particle Systems & Ground FX
    this.particleManager.update(dt);


    // Tool Swing / Harvest Animation Controller
    const isGameActive = document.getElementById('pause-overlay')?.classList.contains('hidden') &&
                         document.getElementById('start-overlay')?.classList.contains('hidden');

    if (this.input.isLeftMouseDown && isGameActive) {
      if (!this.isSwinging) {
        this.isSwinging = true;
        this.swingProgress = 0;
        if (this.inGameAvatarRenderer) this.inGameAvatarRenderer.animator.triggerSwing();
      }
    }

    if (this.isSwinging) {
      this.swingProgress += dt * this.swingSpeed;

      // Melee Weapon / Tool Hit Detection against nearby entities (Zero transient allocations)
      if (this.swingProgress >= 0.35 && !this.hasHitEntityThisSwing) {
        this.hasHitEntityThisSwing = true;
        this.camera.getWorldDirection(Game.SCRATCH_CAM_DIR);
        const reach = 3.8;
        Game.SCRATCH_EYE_POS.set(this.player.position.x, this.player.position.y + this.player.eyeHeight, this.player.position.z);

        // Check Biome Boss Serpents (Snake Dragons - Colossal Hitbox)
        if (this.biomeSerpentManager) {
          for (const serpent of this.biomeSerpentManager.serpents) {
            if (serpent.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(serpent.root.position);
            Game.SCRATCH_MOB_POS.y += 1.6;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= 6.5) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 1.1) {
                serpent.takeDamage(20);
                this.sound?.playMonsterHurt?.();
                break;
              }
            }
          }
        }

        // Check Dunesting Scorpions
        if (this.dunestingScorpionManager) {
          for (const scorpion of this.dunestingScorpionManager.scorpions) {
            if (scorpion.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(scorpion.root.position);
            Game.SCRATCH_MOB_POS.y += 0.5;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= reach) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 0.85) {
                scorpion.takeDamage(18);
                this.sound?.playMonsterHurt?.();
                break;
              }
            }
          }
        }

        // Check Boars
        if (this.thornbackBoarManager) {
          for (const boar of this.thornbackBoarManager.boars) {
            if (boar.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(boar.root.position);
            Game.SCRATCH_MOB_POS.y += 0.6;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= reach) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 0.85) {
                boar.takeDamage(18);
                break;
              }
            }
          }
        }

        // Check Rams
        if (this.bonecrestRamManager) {
          for (const ram of this.bonecrestRamManager.rams) {
            if (ram.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(ram.root.position);
            Game.SCRATCH_MOB_POS.y += 0.8;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= reach) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 0.85) {
                ram.takeDamage(18);
                break;
              }
            }
          }
        }

        // Check Chickens
        if (this.bloomwingChickenManager) {
          for (const chicken of this.bloomwingChickenManager.chickens) {
            if (chicken.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(chicken.root.position);
            Game.SCRATCH_MOB_POS.y += 0.4;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= reach) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 0.85) {
                chicken.takeDamage(18);
                break;
              }
            }
          }
        }

        // Check Goblin Minions
        if (this.goblinMinionManager) {
          for (const goblin of this.goblinMinionManager.goblins) {
            if (goblin.isDead) continue;
            Game.SCRATCH_MOB_POS.copy(goblin.root.position);
            Game.SCRATCH_MOB_POS.y += 0.75;
            Game.SCRATCH_TO_MOB.subVectors(Game.SCRATCH_MOB_POS, Game.SCRATCH_EYE_POS);
            const dist = Game.SCRATCH_TO_MOB.length();
            if (dist <= reach) {
              Game.SCRATCH_TO_MOB.divideScalar(dist);
              if (Game.SCRATCH_CAM_DIR.angleTo(Game.SCRATCH_TO_MOB) < 0.85) {
                goblin.takeDamage(18);
                break;
              }
            }
          }
        }
      }

      if (this.swingProgress >= 1.0) {
        if (this.input.isLeftMouseDown && isGameActive) {
          this.swingProgress = 0; // Repeat swing seamlessly while mining
          this.hasHitEntityThisSwing = false;
          if (this.inGameAvatarRenderer) this.inGameAvatarRenderer.animator.triggerSwing();
        } else {
          this.swingProgress = 0;
          this.isSwinging = false;
          this.hasHitEntityThisSwing = false;
        }
      }
    } else {
      this.hasHitEntityThisSwing = false;
    }

    // Procedural Swing Motion Offsets (Forward dip, inward chop & return)
    const t = Math.min(Math.max(this.swingProgress, 0), 1.0);
    const swingFactor = Math.sin(t * Math.PI); // Sine curve for chop & return (200ms)

    const swingZ = -swingFactor * 0.22;     // Thrusts forward toward target
    const swingY = -swingFactor * 0.15;     // Dips down
    const swingX = -swingFactor * 0.10;     // Swings inward across body
    const swingPitch = -swingFactor * 0.55; // Chop pitch angle (~31 deg forward)
    const swingYaw = swingFactor * 0.35;    // Swings inward
    const swingRoll = -swingFactor * 0.25;  // Inward wrist roll

    // First-Person Arm Dynamics & Swing Motion
    if (this.fpArmManager) {
      this.fpArmManager.update(
        dt,
        this.player.isGrounded,
        inputDir.lengthSq() > 0,
        isSprinting,
        this.isSwinging,
        this.swingProgress
      );
    }

    // 3. Update Voxel Chunks & Animate Liquid Magma Flow
    TextureGenerator.animateMagma(dt);

    const pChunkX = Math.floor(this.player.position.x / 16);
    const pChunkZ = Math.floor(this.player.position.z / 16);
    if (pChunkX !== this.lastPlayerChunkX || pChunkZ !== this.lastPlayerChunkZ || this.frameCount % 30 === 0) {
      this.lastPlayerChunkX = pChunkX;
      this.lastPlayerChunkZ = pChunkZ;
      this.world.updateChunksAroundPlayer(this.player.position);
    }

    // 4. Raycast for Targeted Block
    const camPos = this.player.getCameraPosition();
    const forward = this.input.getForwardVector();
    const rayResult = this.world.raycastBlock(camPos, forward, 6);

    if (rayResult) {
      this.targetedBlockInfo = rayResult;
      this.highlightBox.position.set(rayResult.blockPos.x + 0.5, rayResult.blockPos.y * 0.5 + 0.25, rayResult.blockPos.z + 0.5);
      this.highlightBox.visible = true;
    } else {
      this.targetedBlockInfo = null;
      this.highlightBox.visible = false;
    }

    // 4b. Update Real-Time Transparent Placement Hologram
    const activeSelectedType = this.ui.getSelectedBlockType();
    const isPlaceableItem = isPlaceableBlock(activeSelectedType);

    if (this.targetedBlockInfo && isPlaceableItem) {
      const { placePos, faceNormal } = this.targetedBlockInfo;
      const playerMinX = this.player.position.x - this.player.width / 2;
      const playerMaxX = this.player.position.x + this.player.width / 2;
      const playerMinY = this.player.position.y;
      const playerMaxY = this.player.position.y + this.player.height;
      const playerMinZ = this.player.position.z - this.player.width / 2;
      const playerMaxZ = this.player.position.z + this.player.width / 2;

      const isInsidePlayer =
        placePos.x + 1 > playerMinX &&
        placePos.x < playerMaxX &&
        placePos.y + 1 > playerMinY &&
        placePos.y < playerMaxY &&
        placePos.z + 1 > playerMinZ &&
        placePos.z < playerMaxZ;

      const isValid = !isInsidePlayer && placePos.y >= 0 && placePos.y < 64;
      this.placementPreview.update(activeSelectedType, placePos, isValid, this.input.yaw, faceNormal, dt);
    } else {
      this.placementPreview.hide();
    }

    // 5. Day / Night Cycle Update (Pass overhead roof solid block check)
    const undergroundFactor = this.world.getUndergroundFactor(this.player.position);
    this.dayNight.update(dt, this.player.position, undergroundFactor);
    this.ui.updateDayNightTimer(this.dayNight.getTimeInfo());

    // 5a. Update Clouds (with dynamic sun lighting and underground fading)
    this.cloudRenderer.update(dt, this.player.position, this.dayNight.getSmoothAshen(), this.dayNight.getSunHeight(), undergroundFactor);

    // 5b. Update Entities (Frustum & Distance Culling updated once per frame)
    EntityCuller.getInstance().updateCamera(this.camera);

    if (this.bonecrestRamManager) {
      this.bonecrestRamManager.update(dt, this.player.position, this.player);
    }
    if (this.thornbackBoarManager) {
      this.thornbackBoarManager.update(dt, this.player.position, this.player);
    }
    if (this.bloomwingChickenManager) {
      this.bloomwingChickenManager.update(dt, this.player.position, this.player);
    }
    if (this.dunestingScorpionManager) {
      this.dunestingScorpionManager.update(dt, this.player.position, this.player);
    }
    if (this.biomeSerpentManager) {
      this.biomeSerpentManager.update(dt, this.player.position, this.player);
    }
    if (this.goblinMinionManager) {
      this.goblinMinionManager.update(dt, this.player.position, this.player);
    }

    if (this.emberwynnDragon) {
      this.emberwynnDragon.update(dt, this.player.position, this.player);

      // Player Grab & High-Altitude Freefall Release Integration
      if (this.emberwynnDragon.isCarryingPlayer) {
        if (!this.player.isCarried) {
          this.player.isCarried = true;
          this.ui?.showNotification('⚡ GRABBED IN DRAGON JAWS! PRESS [SPACE] TO STRUGGLE!');
        }
        this.player.position.copy(this.emberwynnDragon.mouthWorldPos);
        this.player.velocity.set(0, 0, 0);

        if (this.input.isJustPressed('Space')) {
          this.emberwynnDragon.struggleCount = (this.emberwynnDragon.struggleCount || 0) + 1;
          if (this.emberwynnDragon.struggleCount >= 3) {
            this.emberwynnDragon.isCarryingPlayer = false;
            this.emberwynnDragon.justReleasedPlayer = true;
            this.emberwynnDragon.struggleCount = 0;
            this.ui?.showNotification('💥 KICKED FREE FROM DRAGON JAWS!');
          }
        }
      } else if (this.emberwynnDragon.justReleasedPlayer) {
        this.emberwynnDragon.justReleasedPlayer = false;
        this.player.isCarried = false;
        this.player.isDroppedByDragon = true;
        this.player.velocity.set(0, -2.0, 0); // Controlled drop release with 20 HP fall protection cap!
      }
    }

    // 5c. Underwater & Mud Submersion Atmosphere (Dense Aquatic/Mud Fog, Color Tint, Screen Overlay)
    const camBlockX = Math.floor(camPos.x);
    const camBlockY = Math.floor(camPos.y * 2.0);
    const camBlockZ = Math.floor(camPos.z);
    const cameraBlock = this.world.getBlock(camBlockX, camBlockY, camBlockZ);
    const cameraBlockDef = BLOCK_DEFINITIONS[cameraBlock];
    const isCameraUnderwater = !!(cameraBlockDef && (cameraBlockDef.isLiquid || cameraBlock === BlockType.MUDDY_QUICKSAND));

    const underwaterOverlay = document.getElementById('underwater-overlay');

    if (isCameraUnderwater) {
      let liquidColor = 0x093a52; // Deep vibrant ocean blue fog
      let liquidDensity = 0.065;
      let overlayClass = '';

      if (cameraBlock === BlockType.OASIS_WATER) {
        liquidColor = 0x054d46; // Lush turquoise oasis
        overlayClass = 'oasis';
      } else if (cameraBlock === BlockType.JUNGLE_WATER) {
        liquidColor = 0x063a2e; // Deep murky emerald jungle river
        liquidDensity = 0.075;
        overlayClass = 'jungle';
      } else if (cameraBlock === BlockType.MOLTEN_CORRUPTION) {
        liquidColor = 0x540812; // Glowing crimson lava
        liquidDensity = 0.095;
        overlayClass = 'lava';
      } else if (cameraBlock === BlockType.MUDDY_QUICKSAND) {
        liquidColor = 0x24140a; // Murky brown quicksand mud
        liquidDensity = 0.22;
        overlayClass = 'quicksand';
      }

      if (this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).density = liquidDensity;
        this.scene.fog.color.setHex(liquidColor);
      }
      this.scene.background = new THREE.Color(liquidColor);

      if (underwaterOverlay) {
        underwaterOverlay.className = overlayClass ? `underwater-overlay ${overlayClass}` : 'underwater-overlay';
      }
    } else {
      if (underwaterOverlay) {
        underwaterOverlay.className = 'hidden';
      }
    }

    // 5c. Update Oxygen, Health, Stamina & Gamepad HUD
    this.ui.updateOxygenBar(this.player.oxygen, this.player.maxOxygen, this.player.isSubmerged);
    this.ui.updateHealthBar(this.player.health, this.player.maxHealth);
    this.ui.updateStaminaBar(this.player.stamina, this.player.maxStamina, this.player.isClimbing, this.player.isStaminaExhausted, this.player.isTouchingQuicksand);
    this.ui.updateGamepadHUD(this.input.isGamepadConnected, this.input.gamepadName);

    // 5d. Handle Damage Flash Overlay & Controller Haptics / Vibration
    if (this.player.justTookDamage) {
      this.player.justTookDamage = false;
      this.input.triggerHaptics(250, 0.9, 0.6); // Dual-rumble controller vibration on damage
      const damageOverlay = document.getElementById('damage-overlay');
      if (damageOverlay) {
        damageOverlay.classList.remove('hidden');
        // Restart CSS animation
        damageOverlay.style.animation = 'none';
        void damageOverlay.offsetWidth;
        damageOverlay.style.animation = 'damageFlash 0.45s ease-out forwards';
      }
    }

    this.particleManager.update(dt);

    if (this.activeBiome === 'ruins' && Math.random() < 0.15) {
      this.particleManager.spawnAmbientAsh(this.player.position, 1);
    }

    // Ambient Muddy Quicksand Bubble Emitter (Bubbles swell and pop from quicksand surfaces)
    this.quicksandBubbleTimer += dt;
    if (this.quicksandBubbleTimer >= 0.10) {
      this.quicksandBubbleTimer = 0;
      const px = Math.floor(this.player.position.x);
      const py = Math.floor(this.player.position.y * 2.0);
      const pz = Math.floor(this.player.position.z);

      // Probe random positions in a 32x32 area around player
      for (let k = 0; k < 8; k++) {
        const rx = px + Math.floor((Math.random() - 0.5) * 32);
        const rz = pz + Math.floor((Math.random() - 0.5) * 32);
        for (let ry = py - 6; ry <= py + 4; ry++) {
          if (this.world.getBlock(rx, ry, rz) === BlockType.MUDDY_QUICKSAND) {
            const above = this.world.getBlock(rx, ry + 1, rz);
            if (above === BlockType.AIR || above === BlockType.UNLOADED) {
              const worldPos = new THREE.Vector3(rx + 0.5, (ry + 1) * 0.5, rz + 0.5);
              this.particleManager.spawnQuicksandBubble(worldPos, 1);
              break;
            }
          }
        }
      }
    }

    // Player Stepping & Sinking Feedback in Quicksand
    if (this.player.isTouchingQuicksand) {
      const isMoving = Math.abs(this.player.velocity.x) > 0.15 || Math.abs(this.player.velocity.z) > 0.15;
      if (isMoving && Math.random() < 0.35) {
        this.particleManager.spawnQuicksandSplash(this.player.position, 2);
      } else if (Math.random() < 0.20) {
        this.particleManager.spawnQuicksandBubble(this.player.position, 1);
      }

      this.quicksandWarningTimer += dt;
      if (this.quicksandWarningTimer > 4.0) {
        this.quicksandWarningTimer = 0;
        this.ui?.showNotification('⚠ Quicksand: Moving drains stamina & sinks you! Rest to recover.');
      }
    } else {
      this.quicksandWarningTimer = 3.5;
    }

    // Periodic Staggered Smoke Emitter for Burning Nether Trees & Chambers
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.25) {
      this.smokeTimer = 0;
      const playerPos = this.player.position;
      let spawnedThisTick = 0;
      const maxSpawnsPerTick = 2; // Staggered per-tick quota eliminates overdraw spikes & micro-stutter

      for (const chunk of this.world.chunks.values()) {
        if (spawnedThisTick >= maxSpawnsPerTick) break;
        if (!chunk.burningTreeSites || chunk.burningTreeSites.length === 0) continue;
        for (const site of chunk.burningTreeSites) {
          if (spawnedThisTick >= maxSpawnsPerTick) break;
          const dx = site.x - playerPos.x;
          const dz = site.z - playerPos.z;
          const dy = site.y - playerPos.y;
          if (dx * dx + dz * dz + dy * dy < 22 * 22) { // 22 block proximity radius
            this.particleManager.spawnSmokePuff(
              new THREE.Vector3(site.x + (Math.random() - 0.5) * 1.2, site.y, site.z + (Math.random() - 0.5) * 1.2),
              site.dense
            );
            spawnedThisTick++;
          }
        }
      }
    }

    this.treeFellingManager.update(dt, this.player.position);
    this.miningManager.update(
      dt,
      this.input.isLeftMouseDown,
      this.targetedBlockInfo,
      forward,
      this.player.position,
      selectedType
    );
    this.groundResourceManager.update(dt, this.player.position);
    this.survivalTome.update(dt);

    // Periodic Background Auto-Save (Every 90s during active exploration)
    const isStartVisible = !document.getElementById('start-overlay')!.classList.contains('hidden');
    if (!isStartVisible && !this.isDeathScreenActive && this.player.health > 0) {
      this.autoSaveTimer += dt;
      if (this.autoSaveTimer >= 90.0) {
        this.autoSaveTimer = 0;
        WorldSaveManager.save(this.world, this.player, this.input, this.ui);
        this.updateSaveBadge();
        this.ui.showNotification('💾 Auto-Saved World');
      }
    }

    // 5e. Update In-Game [E] Interaction & Placement Prompt HUD
    const isWorkstationOpen = !document.getElementById('workstation-overlay')?.classList.contains('hidden');
    if (!this.survivalTome.isOpen && !isWorkstationOpen && this.player.health > 0) {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);

      if (this.targetedBlockInfo) {
        const tType = this.targetedBlockInfo.type;
        if (tType === BlockType.WORKBENCH) {
          this.ui.showInteractPrompt('Open Crafting Table', 'E');
        } else if (tType === BlockType.SMITHING_FORGE) {
          this.ui.showInteractPrompt('Open Smithing Forge', 'E');
        } else if (tType === BlockType.ARMOR_STATION) {
          this.ui.showInteractPrompt('Open Armor Station', 'E');
        } else if (tType === BlockType.NETHER_ALTAR) {
          this.ui.showInteractPrompt('Open Nether Altar', 'E');
        } else if (tType === BlockType.TORCH) {
          this.ui.showInteractPrompt('Pick Up Survival Torch', 'E');
        } else if (this.groundResourceManager.isHarvestableType(tType)) {
          const defName = BLOCK_DEFINITIONS[tType]?.name || 'Plant';
          this.ui.showInteractPrompt(`Harvest ${defName}`, 'E');
        } else if (activeSelectedType === BlockType.TORCH) {
          this.ui.showInteractPrompt('Place Survival Torch', 'Right Click');
        } else if (isPlaceableItem && activeSelectedType !== null) {
          const defName = BLOCK_DEFINITIONS[activeSelectedType]?.name || 'Block';
          this.ui.showInteractPrompt(`Place ${defName} [R: Rotate]`, 'Right Click');
        } else {
          // Check ground resource node or dropped item
          const nearbyInteract = this.groundResourceManager.getInteractableNode(this.player.position, camDir);
          const nearbyDropped = this.itemManager.getNearbyItem(this.player.position, camDir, 3.5);

          if (nearbyInteract) {
            this.ui.showInteractPrompt(nearbyInteract.prompt, 'E');
          } else if (nearbyDropped) {
            const defName = BLOCK_DEFINITIONS[nearbyDropped.item.type]?.name || 'Item';
            this.ui.showInteractPrompt(`Pick Up ${defName}`, 'E');
          } else {
            this.ui.hideInteractPrompt();
          }
        }
      } else {
        const nearbyInteract = this.groundResourceManager.getInteractableNode(this.player.position, camDir);
        const nearbyDropped = this.itemManager.getNearbyItem(this.player.position, camDir, 3.5);

        if (nearbyInteract) {
          this.ui.showInteractPrompt(nearbyInteract.prompt, 'E');
        } else if (nearbyDropped) {
          const defName = BLOCK_DEFINITIONS[nearbyDropped.item.type]?.name || 'Item';
          this.ui.showInteractPrompt(`Pick Up ${defName}`, 'E');
        } else {
          this.ui.hideInteractPrompt();
        }
      }
    } else {
      this.ui.hideInteractPrompt();
    }

    // Apply Screen Shake if active
    if (this.treeFellingManager.screenShakeIntensity > 0) {
      const intensity = this.treeFellingManager.screenShakeIntensity;
      this.camera.position.x += (Math.random() - 0.5) * intensity;
      this.camera.position.y += (Math.random() - 0.5) * intensity;
    }

    // 6. Update F3 Debug Stats
    const targetName = this.targetedBlockInfo
      ? BLOCK_DEFINITIONS[this.targetedBlockInfo.type]?.name || 'Unknown'
      : 'None';

    this.ui.updateDebugInfo(
      this.fps,
      this.player.position,
      forward,
      targetName,
      this.world.chunks.size,
      this.player.isFlying
    );

    // 6b. Update Dynamic Optical Autofocus Lens Tracking (Zero transient allocations)
    let targetDist: number | null = null;
    if (this.targetedBlockInfo) {
      const camPos = this.player.getCameraPosition();
      const bp = this.targetedBlockInfo.blockPos;
      targetDist = camPos.distanceTo(Game.SCRATCH_TARGET_BP.set(bp.x + 0.5, bp.y * 0.5 + 0.25, bp.z + 0.5));
    } else {
      // Long-range autofocus raycast probe up to 64 blocks for natural gaze focus
      const camPos = this.player.getCameraPosition();
      const deepRay = this.world.raycastBlock(camPos, forward, 64);
      if (deepRay) {
        const bp = deepRay.blockPos;
        targetDist = camPos.distanceTo(Game.SCRATCH_TARGET_BP.set(bp.x + 0.5, bp.y * 0.5 + 0.25, bp.z + 0.5));
      }
    }
    const isWorkstationActive = !document.getElementById('workstation-overlay')?.classList.contains('hidden');
    const isPauseOpen = !document.getElementById('pause-overlay')?.classList.contains('hidden');
    const isStartOpen = !document.getElementById('start-overlay')?.classList.contains('hidden');
    const isTomeOpen = this.survivalTome.isOpen;
    const isAnyUIOpen = isWorkstationActive || isPauseOpen || isStartOpen || isTomeOpen || this.isDeathScreenActive;

    this.dofManager.updateAutofocus(dt, targetDist, isThirdPerson, isAnyUIOpen);

    // 7. Render Scene with Depth of Field Postprocessing
    this.dofManager.render();
  }

  public getCurrentBiome(): 'grove' | 'frost' | 'ruins' | 'sunscorched' | 'rainforest' {
    return (this.activeBiome as any) || 'grove';
  }

  /**
   * Adaptive Performance Governor:
   * Monitors active FPS and progressively throttles expensive graphical features (Shadows, Render Distance, DoF)
   * if frame rate consistently drops below 30 FPS under sustained hardware load.
   */
  private updateAdaptivePerformanceGovernor(dt: number): void {
    if (!this.isGameRunning || this.isDeathScreenActive) return;

    // Suspend throttling during menus or overlays
    const isPaused = !document.getElementById('pause-overlay')?.classList.contains('hidden');
    const isStart = !document.getElementById('start-overlay')?.classList.contains('hidden');
    if (isPaused || isStart) {
      this.lowFpsDuration = 0;
      return;
    }

    if (this.throttleCooldown > 0) {
      this.throttleCooldown -= dt;
    }

    const settings = SettingsManager.load();
    if (settings.adaptivePerformance === false) {
      this.lowFpsDuration = 0;
      return;
    }

    // Monitor frame rate under sustained load
    if (this.fps < 30) {
      this.lowFpsDuration += dt;

      // If frame rate remains consistently below 30 FPS for > 3.5 continuous seconds
      if (this.lowFpsDuration >= 3.5 && this.throttleCooldown <= 0) {
        this.lowFpsDuration = 0;
        this.throttleCooldown = 8.0; // 8-second cooldown between successive interventions

        // Stage 1: Disable shadow maps if enabled
        if (this.renderer.shadowMap.enabled) {
          this.renderer.shadowMap.enabled = false;
          settings.graphicsMode = 'performance';
          SettingsManager.save(settings);
          SettingsManager.syncUI(settings);
          this.ui.showNotification('⚡ Adaptive Performance: Optimized shadows to boost frame rate');
          return;
        }

        // Stage 2: Decrement Render Distance (Floor: 3 chunks)
        if (this.world.renderDistance > 3) {
          this.world.renderDistance -= 1;
          settings.renderDistance = this.world.renderDistance;
          SettingsManager.save(settings);
          SettingsManager.syncUI(settings);
          this.ui.showNotification(`⚡ Adaptive Performance: Adjusted render distance to ${this.world.renderDistance} chunks`);
          return;
        }

        // Stage 3: Relax Depth of Field postprocessing if active
        if (this.dofManager && (settings.dofIntensity || 0) > 0) {
          settings.dofIntensity = 0;
          settings.depthOfField = false;
          this.dofManager.setIntensity(0);
          SettingsManager.save(settings);
          SettingsManager.syncUI(settings);
          this.ui.showNotification('⚡ Adaptive Performance: Relaxed postprocessing for maximum FPS');
          return;
        }
      }
    } else {
      // Frame rate is healthy (>= 30 FPS): smoothly decay low-FPS counter
      this.lowFpsDuration = Math.max(0, this.lowFpsDuration - dt * 1.5);
    }
  }

  /**
   * Performs complete game engine teardown, unbinding all DOM/window listeners and freeing GPU resources.
   */
  public dispose(): void {
    if (this.input) {
      this.input.dispose();
    }
    if (this.world) {
      this.world.dispose();
    }
    if (this.dofManager) {
      this.dofManager.dispose();
    }
    if (this.cloudRenderer) {
      this.cloudRenderer.dispose();
    }
    TextureAtlasManager.disposeAll();
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

// Instantiate Game on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
