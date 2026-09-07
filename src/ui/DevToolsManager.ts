import * as THREE from 'three';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { VoxelWorld } from '../world/VoxelWorld';
import { DayNightCycle } from '../environment/DayNightCycle';
import { UIManager } from './UIManager';
import { SurvivalTomeManager } from './SurvivalTomeManager';
import { BlockType } from '../textures/TextureGenerator';

export interface BiomeWarpPoint {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  x: number;
  z: number;
  defaultY?: number;
  color: string;
}

export class DevToolsManager {
  public isOpen: boolean = false;

  private player: PlayerPhysics;
  private world: VoxelWorld;
  private dayNight: DayNightCycle;
  private ui: UIManager;
  private survivalTome: SurvivalTomeManager;
  private requestPointerLockCallback?: () => void;

  private modalElement: HTMLElement | null = null;
  private inputX: HTMLInputElement | null = null;
  private inputY: HTMLInputElement | null = null;
  private inputZ: HTMLInputElement | null = null;

  public static readonly BIOMES: BiomeWarpPoint[] = [
    {
      id: 'grove',
      name: 'Emerald Grove',
      subtitle: 'Overworld Forest & Grassy Hills',
      icon: '🌲',
      x: 0,
      z: -50,
      color: '#4ade80',
    },
    {
      id: 'rainforest',
      name: 'Mossveil Jungle',
      subtitle: 'Ancient Canopy, Mud & Thorns',
      icon: '🌿',
      x: 0,
      z: 120,
      color: '#10b981',
    },
    {
      id: 'sunscorched',
      name: 'Cinderdune Wastes',
      subtitle: 'Arid Desert, Sandstone & Palms',
      icon: '🏜️',
      x: 0,
      z: 260,
      color: '#f59e0b',
    },
    {
      id: 'frost',
      name: 'Frostvale Reach',
      subtitle: 'Glacial Permafrost & Snow Peaks',
      icon: '❄️',
      x: 0,
      z: -220,
      color: '#38bdf8',
    },
    {
      id: 'ruins',
      name: 'Ashen Ruins',
      subtitle: 'Molten Magma & Petrified Wood',
      icon: '🌋',
      x: -220,
      z: 0,
      color: '#ef4444',
    },
    {
      id: 'lake',
      name: 'Mountain Peak Tarn',
      subtitle: 'Highland Alpine Waterfalls',
      icon: '🌊',
      x: 35,
      z: -35,
      defaultY: 28,
      color: '#06b6d4',
    },
    {
      id: 'oasis',
      name: 'Desert Oasis Pool',
      subtitle: 'Palm Springs & Oasis Shrubbery',
      icon: '🏖️',
      x: 60,
      z: 275,
      color: '#14b8a6',
    },
    {
      id: 'quicksand',
      name: 'Mossveil Quicksand Puddle',
      subtitle: 'Muddy Sinkholes & Root Puddles',
      icon: '🟤',
      x: 35,
      z: 110,
      color: '#78350f',
    },
    {
      id: 'spawn',
      name: 'World Spawn',
      subtitle: 'Origin Coordinates (0, 0)',
      icon: '🏠',
      x: 0,
      z: 0,
      color: '#a855f7',
    },
  ];

  constructor(
    player: PlayerPhysics,
    world: VoxelWorld,
    dayNight: DayNightCycle,
    ui: UIManager,
    survivalTome: SurvivalTomeManager,
    requestPointerLockCallback?: () => void
  ) {
    this.player = player;
    this.world = world;
    this.dayNight = dayNight;
    this.ui = ui;
    this.survivalTome = survivalTome;
    this.requestPointerLockCallback = requestPointerLockCallback;

    this.createDevToolsDOM();
    this.bindEvents();
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    if (this.modalElement) {
      this.modalElement.classList.remove('hidden');
      this.updateCurrentPosInputs();
      this.updateStatusBadges();
    }
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (this.modalElement) {
      this.modalElement.classList.add('hidden');
    }

    if (this.requestPointerLockCallback) {
      this.requestPointerLockCallback();
    }
  }

  public teleportToBiome(warp: BiomeWarpPoint): void {
    this.teleportTo(warp.x, warp.defaultY, warp.z, warp.name);
  }

  public teleportTo(x: number, y: number | undefined, z: number, label?: string): void {
    const targetX = Math.floor(x) + 0.5;
    const targetZ = Math.floor(z) + 0.5;

    let targetY = y;
    if (targetY === undefined) {
      // Find highest solid block or safe ground elevation
      let highestY = 16;
      for (let checkY = 60; checkY >= 4; checkY--) {
        const blk = this.world.getBlock(Math.floor(targetX), checkY, Math.floor(targetZ));
        if (blk !== BlockType.AIR && blk !== BlockType.UNLOADED) {
          highestY = (checkY + 2.5) * 0.5;
          break;
        }
      }
      targetY = Math.max(highestY, 14.0);
    }

    this.player.position.set(targetX, targetY, targetZ);
    this.player.velocity.set(0, 0, 0);
    this.player.isGrounded = false;
    this.player.isClimbing = false;
    this.player.isTouchingMagma = false;
    this.player.isTouchingThorns = false;
    (this.player as any).burnTimer = 0;
    (this.player as any).magmaDamageTimer = 0;
    (this.player as any).thornDamageTimer = 0;

    // Trigger immediate chunk generation around destination
    this.world.updateChunksAroundPlayer(this.player.position);

    const destName = label || `(${targetX.toFixed(0)}, ${targetY.toFixed(0)}, ${targetZ.toFixed(0)})`;
    this.ui.showNotification(`🌀 Teleported to ${destName}`);

    this.close();
  }

  public setFlight(enabled: boolean): void {
    this.player.isFlying = enabled;
    this.updateStatusBadges();
    this.ui.showNotification(enabled ? '✈️ Creative Flight Enabled' : '🚶 Flight Disabled');
  }

  public setGodmode(enabled: boolean): void {
    this.player.isGodmode = enabled;
    this.updateStatusBadges();
    this.ui.showNotification(enabled ? '🛡️ Godmode Enabled (Invulnerable)' : '🛡️ Godmode Disabled');
  }

  public setSpeed(multiplier: number): void {
    this.player.devSpeedMultiplier = multiplier;
    this.updateStatusBadges();
    this.ui.showNotification(`⚡ Speed Multiplier set to ${multiplier}x`);
  }

  public healFull(): void {
    this.player.health = this.player.maxHealth;
    this.player.oxygen = this.player.maxOxygen;
    this.player.isTouchingMagma = false;
    this.player.isTouchingThorns = false;
    (this.player as any).burnTimer = 0;
    (this.player as any).magmaDamageTimer = 0;
    (this.player as any).thornDamageTimer = 0;
    this.player.justTookDamage = false;
    this.ui.showNotification('💖 Health & Oxygen Fully Restored');
  }

  public setTime(timeVal: number, label: string): void {
    this.dayNight.time = timeVal;
    this.ui.showNotification(`☀️ Time set to ${label}`);
  }

  public giveItem(type: BlockType, count: number, name: string): void {
    this.ui.addResourceToHotbar(type, count);
    this.survivalTome.addItem(type, count);
    this.ui.showNotification(`🎁 Added ${name} (${count > 1 ? `x${count}` : '1x'}) to Hotbar & Bag!`);
  }

  public givePickaxe(): void {
    this.giveItem(BlockType.FLIMSY_PICKAXE, 1, 'Flimsy Stone Pickaxe');
  }

  public giveAxe(): void {
    this.giveItem(BlockType.FLIMSY_AXE, 1, 'Flimsy Stone Axe');
  }

  public giveTorch(): void {
    this.giveItem(BlockType.TORCH, 16, 'Survival Torches');
  }

  public giveCraftbench(): void {
    this.giveItem(BlockType.WORKBENCH, 4, 'Artisan Craftbench');
  }

  public giveAllTools(): void {
    this.ui.addResourceToHotbar(BlockType.FLIMSY_PICKAXE, 1);
    this.survivalTome.addItem(BlockType.FLIMSY_PICKAXE, 1);

    this.ui.addResourceToHotbar(BlockType.FLIMSY_AXE, 1);
    this.survivalTome.addItem(BlockType.FLIMSY_AXE, 1);

    this.ui.addResourceToHotbar(BlockType.TORCH, 16);
    this.survivalTome.addItem(BlockType.TORCH, 16);

    this.ui.addResourceToHotbar(BlockType.WORKBENCH, 4);
    this.survivalTome.addItem(BlockType.WORKBENCH, 4);

    this.ui.showNotification('🧰 Equipped Pickaxe, Axe, Torches & Craftbench!');
  }

  public giveStarterKit(): void {
    // Fill hotbar / bag with essential survival, tools and building items
    const kitItems: Array<[BlockType, number]> = [
      [BlockType.FLIMSY_PICKAXE, 1],
      [BlockType.FLIMSY_AXE, 1],
      [BlockType.TORCH, 16],
      [BlockType.WORKBENCH, 4],
      [BlockType.OAK_LOG, 64],
      [BlockType.PLANKS, 64],
      [BlockType.STONE, 64],
      [BlockType.APPLES, 16],
      [BlockType.FLINT, 16],
      [BlockType.BRANCHES, 32],
      [BlockType.JUNGLE_LOG, 64],
      [BlockType.MOSSVEIL_MUD, 64],
      [BlockType.JUNGLE_VINES, 32],
      [BlockType.JUNGLE_ROPE, 16],
    ];

    for (const [type, count] of kitItems) {
      this.ui.addResourceToHotbar(type, count);
      this.survivalTome.addItem(type, count);
    }
    this.ui.showNotification(`📦 Added Starter Building, Tools & Exploration Kit!`);
  }

  private updateCurrentPosInputs(): void {
    if (this.inputX) this.inputX.value = this.player.position.x.toFixed(0);
    if (this.inputY) this.inputY.value = this.player.position.y.toFixed(0);
    if (this.inputZ) this.inputZ.value = this.player.position.z.toFixed(0);
  }

  private updateStatusBadges(): void {
    const flightBtn = document.getElementById('dev-btn-flight');
    const godmodeBtn = document.getElementById('dev-btn-godmode');
    if (flightBtn) {
      flightBtn.className = `dev-tool-btn ${this.player.isFlying ? 'active-glow' : ''}`;
    }
    if (godmodeBtn) {
      godmodeBtn.className = `dev-tool-btn ${this.player.isGodmode ? 'active-glow' : ''}`;
    }
  }

  private createDevToolsDOM(): void {
    if (document.getElementById('dev-tools-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'dev-tools-modal';
    modal.className = 'modal-overlay dev-tools-overlay hidden';
    modal.innerHTML = `
      <div class="dev-tools-card glass-card">
        <div class="dev-tools-header">
          <div class="dev-title-row">
            <span class="dev-title-icon">🚀</span>
            <h3 class="dev-tools-title">DEVELOPER TOOLS & BIOME WARP</h3>
          </div>
          <button id="btn-close-dev-tools" class="dev-close-btn">&times;</button>
        </div>

        <div class="dev-tools-content">
          <!-- Section 1: Biome Warp Hub -->
          <div class="dev-section">
            <h4 class="dev-section-title">🌍 BIOME TELEPORT HUBS</h4>
            <div class="dev-biome-grid">
              ${DevToolsManager.BIOMES.map(b => `
                <button class="dev-biome-btn" data-biome-id="${b.id}" style="border-left-color: ${b.color};">
                  <div class="biome-btn-icon">${b.icon}</div>
                  <div class="biome-btn-info">
                    <div class="biome-btn-name" style="color: ${b.color};">${b.name}</div>
                    <div class="biome-btn-coords">X:${b.x} Z:${b.z}</div>
                    <div class="biome-btn-sub">${b.subtitle}</div>
                  </div>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Section 2: Custom Coordinate Teleport -->
          <div class="dev-section">
            <h4 class="dev-section-title">📍 CUSTOM COORDINATE TELEPORT</h4>
            <div class="dev-coord-row">
              <div class="dev-coord-input-group">
                <label>X:</label>
                <input type="number" id="dev-coord-x" class="dev-input" value="0" step="5">
              </div>
              <div class="dev-coord-input-group">
                <label>Y:</label>
                <input type="number" id="dev-coord-y" class="dev-input" value="16" step="1">
              </div>
              <div class="dev-coord-input-group">
                <label>Z:</label>
                <input type="number" id="dev-coord-z" class="dev-input" value="0" step="5">
              </div>
              <button id="btn-dev-teleport-xyz" class="btn btn-dev-teleport">WARP TO XYZ</button>
              <button id="btn-dev-get-current" class="btn btn-dev-secondary" title="Copy Current Position">GET POS</button>
            </div>
          </div>

          <!-- Section 3: Tools & Equipment Spawner -->
          <div class="dev-section">
            <h4 class="dev-section-title">🛠️ TOOLS, WEAPONS & WORKBENCH SPAWNER</h4>
            <div class="dev-tools-grid">
              <button id="dev-btn-pickaxe" class="dev-tool-btn">
                <span class="tool-icon">⛏️</span>
                <span class="tool-label">Give Pickaxe</span>
              </button>
              <button id="dev-btn-axe" class="dev-tool-btn">
                <span class="tool-icon">🪓</span>
                <span class="tool-label">Give Stone Axe</span>
              </button>
              <button id="dev-btn-torch" class="dev-tool-btn">
                <span class="tool-icon">🔥</span>
                <span class="tool-label">Give Torches (x16)</span>
              </button>
              <button id="dev-btn-craftbench" class="dev-tool-btn">
                <span class="tool-icon">🪵</span>
                <span class="tool-label">Give Craftbench (x4)</span>
              </button>
              <button id="dev-btn-all-tools" class="dev-tool-btn" style="grid-column: 1 / -1; justify-content: center; background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(16, 185, 129, 0.25)); border-color: #f59e0b;">
                <span class="tool-icon">🧰</span>
                <span class="tool-label">Spawn All Tools, Torches & Craftbench</span>
              </button>
            </div>
          </div>

          <!-- Section 4: Gameplay Cheats & Utilities -->
          <div class="dev-section">
            <h4 class="dev-section-title">⚡ GAMEPLAY CHEATS & UTILITIES</h4>
            <div class="dev-tools-grid">
              <button id="dev-btn-flight" class="dev-tool-btn">
                <span class="tool-icon">✈️</span>
                <span class="tool-label">Toggle Flight</span>
              </button>
              <button id="dev-btn-godmode" class="dev-tool-btn">
                <span class="tool-icon">🛡️</span>
                <span class="tool-label">Toggle Godmode</span>
              </button>
              <button id="dev-btn-heal" class="dev-tool-btn">
                <span class="tool-icon">💖</span>
                <span class="tool-label">Full Restore</span>
              </button>
              <button id="dev-btn-kit" class="dev-tool-btn">
                <span class="tool-icon">📦</span>
                <span class="tool-label">Give Starter Kit</span>
              </button>
            </div>

            <!-- Speed & Time Sub-bars -->
            <div class="dev-quick-row">
              <div class="dev-quick-group">
                <span class="dev-group-label">Speed:</span>
                <button class="btn-dev-chip" data-speed="1.0">1x</button>
                <button class="btn-dev-chip" data-speed="2.0">2x</button>
                <button class="btn-dev-chip" data-speed="4.0">4x</button>
                <button class="btn-dev-chip" data-speed="8.0">8x</button>
              </div>
              <div class="dev-quick-group">
                <span class="dev-group-label">Time:</span>
                <button class="btn-dev-chip" data-time="0.0" data-label="Dawn">🌅 Dawn</button>
                <button class="btn-dev-chip" data-time="0.25" data-label="Noon">☀️ Noon</button>
                <button class="btn-dev-chip" data-time="0.50" data-label="Sunset">🌇 Sunset</button>
                <button class="btn-dev-chip" data-time="0.75" data-label="Midnight">🌙 Night</button>
              </div>
            </div>
          </div>
        </div>

        <div class="dev-tools-footer">
          <div class="dev-shortcut-hint">
            <kbd>F6</kbd> or <kbd>~</kbd> (Tilde) toggles this menu anytime in-game.
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalElement = modal;
    this.inputX = document.getElementById('dev-coord-x') as HTMLInputElement;
    this.inputY = document.getElementById('dev-coord-y') as HTMLInputElement;
    this.inputZ = document.getElementById('dev-coord-z') as HTMLInputElement;
  }

  private bindEvents(): void {
    if (!this.modalElement) return;

    // Close button
    document.getElementById('btn-close-dev-tools')?.addEventListener('click', () => {
      this.close();
    });

    // Biome Teleport Buttons
    this.modalElement.querySelectorAll('.dev-biome-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const biomeId = btn.getAttribute('data-biome-id');
        const warp = DevToolsManager.BIOMES.find(b => b.id === biomeId);
        if (warp) {
          this.teleportToBiome(warp);
        }
      });
    });

    // Custom XYZ Teleport
    document.getElementById('btn-dev-teleport-xyz')?.addEventListener('click', () => {
      const x = parseFloat(this.inputX?.value || '0');
      const y = parseFloat(this.inputY?.value || '16');
      const z = parseFloat(this.inputZ?.value || '0');
      this.teleportTo(x, y, z);
    });

    // Get current position
    document.getElementById('btn-dev-get-current')?.addEventListener('click', () => {
      this.updateCurrentPosInputs();
    });

    // Tools & Equipment Spawner Buttons
    document.getElementById('dev-btn-pickaxe')?.addEventListener('click', () => {
      this.givePickaxe();
    });

    document.getElementById('dev-btn-axe')?.addEventListener('click', () => {
      this.giveAxe();
    });

    document.getElementById('dev-btn-torch')?.addEventListener('click', () => {
      this.giveTorch();
    });

    document.getElementById('dev-btn-craftbench')?.addEventListener('click', () => {
      this.giveCraftbench();
    });

    document.getElementById('dev-btn-all-tools')?.addEventListener('click', () => {
      this.giveAllTools();
    });

    // Utilities
    document.getElementById('dev-btn-flight')?.addEventListener('click', () => {
      this.setFlight(!this.player.isFlying);
    });

    document.getElementById('dev-btn-godmode')?.addEventListener('click', () => {
      this.setGodmode(!this.player.isGodmode);
    });

    document.getElementById('dev-btn-heal')?.addEventListener('click', () => {
      this.healFull();
    });

    document.getElementById('dev-btn-kit')?.addEventListener('click', () => {
      this.giveStarterKit();
    });

    // Speed Chips
    this.modalElement.querySelectorAll('.btn-dev-chip[data-speed]').forEach(chip => {
      chip.addEventListener('click', () => {
        const spd = parseFloat(chip.getAttribute('data-speed') || '1.0');
        this.setSpeed(spd);
      });
    });

    // Time Chips
    this.modalElement.querySelectorAll('.btn-dev-chip[data-time]').forEach(chip => {
      chip.addEventListener('click', () => {
        const timeVal = parseFloat(chip.getAttribute('data-time') || '0.25');
        const label = chip.getAttribute('data-label') || 'Noon';
        this.setTime(timeVal, label);
      });
    });
  }
}
