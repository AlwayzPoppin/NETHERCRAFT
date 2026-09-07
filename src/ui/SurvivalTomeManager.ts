import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';
import { CharacterCustomizationRenderer } from './CharacterCustomizationRenderer';
import { SettingsManager, GameSettings } from '../settings/SettingsManager';
import { SoundManager } from '../audio/SoundManager';
import { UIManager } from './UIManager';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { InputManager } from '../controls/InputManager';

export interface InventorySlotItem {
  type: BlockType;
  count: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  category: string;
  icon: string;
  desc: string;
  outputType: BlockType;
  outputCount: number;
  materials: { type: BlockType; count: number; name: string }[];
}

export const SURVIVAL_RECIPES: CraftingRecipe[] = [
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    category: 'Workstations & Tools',
    icon: '🪵',
    desc: 'Basic timber workbench fitted with carpentry vise clamps and tool racks. Right-click when placed in the world to open advanced crafting recipes.',
    outputType: BlockType.WORKBENCH,
    outputCount: 1,
    materials: [
      { type: BlockType.BRANCHES, count: 4, name: 'Fallen Branches' },
      { type: BlockType.FLINT, count: 2, name: 'Flint' },
      { type: BlockType.STONE_PEBBLE, count: 2, name: 'Loose Stones' },
    ],
  },
  {
    id: 'braided_jungle_rope',
    name: 'Braided Jungle Rope',
    category: 'Weapons & Tools',
    icon: '🪢',
    desc: 'Tightly woven jungle vine fibers twisted into tensile cordage. Used for rigging, climbing lines, and weapon bowstrings.',
    outputType: BlockType.JUNGLE_ROPE,
    outputCount: 1,
    materials: [
      { type: BlockType.JUNGLE_VINES, count: 3, name: 'Mossveil Hanging Vines' },
    ],
  },
  {
    id: 'jungle_hunting_bow',
    name: 'Jungle Hunting Bow',
    category: 'Weapons & Tools',
    icon: '🏹',
    desc: 'Curved resilient wooden limbs strung with fibrous jungle vine cordage. Ranged weapon capable of launching hunting arrows.',
    outputType: BlockType.HUNTING_BOW,
    outputCount: 1,
    materials: [
      { type: BlockType.BRANCHES, count: 3, name: 'Fallen Branches' },
      { type: BlockType.JUNGLE_VINES, count: 3, name: 'Mossveil Hanging Vines' },
    ],
  },
  {
    id: 'reinforced_recurve_bow',
    name: 'Reinforced Jungle Recurve Bow',
    category: 'Weapons & Tools',
    icon: '🏹',
    desc: 'Heavy jungle hardwood recurve limbs strung with braided vine rope and flint counter-weights. High kinetic damage ranged weapon.',
    outputType: BlockType.HUNTING_BOW,
    outputCount: 1,
    materials: [
      { type: BlockType.JUNGLE_LOG, count: 2, name: 'Jungle Log' },
      { type: BlockType.JUNGLE_ROPE, count: 2, name: 'Braided Jungle Rope' },
      { type: BlockType.FLINT, count: 2, name: 'Flint' },
    ],
  },
  {
    id: 'flimsy_axe',
    name: 'Flimsy Stone Axe',
    category: 'Weapons & Tools',
    icon: '🪓',
    desc: 'Sharpened flint wedge bound to a stout branch. Increases tree chopping and wood harvest speed by 2.8x.',
    outputType: BlockType.FLIMSY_AXE,
    outputCount: 1,
    materials: [
      { type: BlockType.BRANCHES, count: 3, name: 'Fallen Branches' },
      { type: BlockType.FLINT, count: 2, name: 'Flint' },
    ],
  },
  {
    id: 'flimsy_pickaxe',
    name: 'Flimsy Stone Pickaxe',
    category: 'Weapons & Tools',
    icon: '⛏️',
    desc: 'Dense stones lashed to a wooden shaft. Increases rock, ore, and subterranean mining speed by 2.8x.',
    outputType: BlockType.FLIMSY_PICKAXE,
    outputCount: 1,
    materials: [
      { type: BlockType.BRANCHES, count: 3, name: 'Fallen Branches' },
      { type: BlockType.STONE_PEBBLE, count: 3, name: 'Loose Stones' },
    ],
  },
  {
    id: 'survival_torch',
    name: 'Survival Torch (x4)',
    category: 'Weapons & Tools',
    icon: '🔥',
    desc: 'Resin-treated branch ignited with flint sparks. Casts handheld light and illuminates dark caves and night.',
    outputType: BlockType.TORCH,
    outputCount: 4,
    materials: [
      { type: BlockType.BRANCHES, count: 1, name: 'Fallen Branches' },
      { type: BlockType.FLINT, count: 1, name: 'Flint' },
    ],
  },
  {
    id: 'reed_bandage',
    name: 'Herbal Reed Bandages',
    category: 'Medicine & Food',
    icon: '🩹',
    desc: 'Macerated river reed fibers applied to wounds. Immediately restores +6 Health.',
    outputType: BlockType.REEDS,
    outputCount: 1,
    materials: [
      { type: BlockType.REEDS, count: 3, name: 'River Reeds' },
    ],
  },
  {
    id: 'cinderdune_venom_staff',
    name: 'Cinderdune Venom Staff',
    category: 'Weapons & Tools',
    icon: '🪄',
    desc: 'Ancient desert mage staff forged from glowing Dunesting venom barbs and petrified sunwood. Channels destructive venomous spells.',
    outputType: BlockType.DUNESTING_BARB,
    outputCount: 1,
    materials: [
      { type: BlockType.DUNESTING_BARB, count: 2, name: 'Dunesting Barb' },
      { type: BlockType.PETRIFIED_SUNWOOD, count: 2, name: 'Petrified Sunwood' },
      { type: BlockType.SUNSTONE_ORE, count: 1, name: 'Sunstone Ore' },
    ],
  },
  {
    id: 'venomous_mana_elixir',
    name: 'Venomous Mana Elixir',
    category: 'Medicine & Food',
    icon: '🧪',
    desc: 'Refined desert scorpion venom distilled with desert bloom petals. Restores +60 Mana instantly.',
    outputType: BlockType.DUNESTING_BARB,
    outputCount: 1,
    materials: [
      { type: BlockType.DUNESTING_BARB, count: 1, name: 'Dunesting Barb' },
      { type: BlockType.DESERT_BLOOM, count: 2, name: 'Desert Bloom' },
      { type: BlockType.OASIS_WATER, count: 1, name: 'Oasis Water' },
    ],
  },
  {
    id: 'dunesting_chitin_shield',
    name: 'Dunesting Chitin Shield',
    category: 'Armor & Gear',
    icon: '🛡️',
    desc: 'Hardened desert scorpion carapace reinforced with interlocking pincer claws. Provides +28 Defense against hostile attacks.',
    outputType: BlockType.DUNESTING_SHELL,
    outputCount: 1,
    materials: [
      { type: BlockType.DUNESTING_SHELL, count: 4, name: 'Dunesting Shell' },
      { type: BlockType.DUNESTING_PINCER_CLAW, count: 2, name: 'Dunesting Pincer Claw' },
      { type: BlockType.ANIMAL_HIDE, count: 1, name: 'Animal Hide' },
    ],
  },
];

export class SurvivalTomeManager {
  private modal: HTMLElement | null;
  private sound: SoundManager;
  private ui: UIManager;
  private player: PlayerPhysics;
  public isOpen: boolean = false;

  // 3D Avatar Viewport
  private avatarCanvas: HTMLCanvasElement | null = null;
  private avatarRenderer: THREE.WebGLRenderer | null = null;
  private avatarScene: THREE.Scene | null = null;
  private avatarCamera: THREE.PerspectiveCamera | null = null;
  private avatarCustomizer: CharacterCustomizationRenderer | null = null;
  private avatarGroup: THREE.Group | null = null;
  private isDraggingAvatar: boolean = false;
  private prevMouseX: number = 0;

  // Inventory & Equipment Storage
  public readonly totalGridSlots = 48;
  public gridSlots: (InventorySlotItem | null)[] = new Array(48).fill(null);
  public equipSlots: Map<string, InventorySlotItem | null> = new Map([
    ['head', null],
    ['chest', null],
    ['boots', null],
    ['mainhand', null],
    ['offhand', null],
    ['relic', null],
  ]);

  private activeTab: 'inventory' | 'crafting' | 'attributes' = 'inventory';
  private selectedRecipe: CraftingRecipe | null = null;

  // Tooltip
  private tooltipEl: HTMLElement | null = null;
  private input: InputManager;

  constructor(sound: SoundManager, ui: UIManager, player: PlayerPhysics, input: InputManager) {
    this.sound = sound;
    this.ui = ui;
    this.player = player;
    this.input = input;
    this.modal = document.getElementById('survival-tome-modal');
    this.tooltipEl = document.getElementById('tome-item-tooltip');

    this.ui.setSurvivalTome(this);

    this.initGridDOM();
    this.initTabs();
    this.initCraftingDOM();
    this.initEquipmentDOM();
    this.initCloseButton();
    this.init3DViewport();
  }

  private initCloseButton(): void {
    const closeBtn = document.getElementById('btn-close-tome');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  private initTabs(): void {
    const tabButtons = document.querySelectorAll('.tome-tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as 'inventory' | 'crafting' | 'attributes';
        if (tab) {
          this.switchTab(tab);
          try {
            this.sound.playClick();
          } catch (e) {}
        }
      });
    });
  }

  public switchTab(tab: 'inventory' | 'crafting' | 'attributes'): void {
    this.activeTab = tab;
    document.querySelectorAll('.tome-tab-btn').forEach((b) => {
      if (b.getAttribute('data-tab') === tab) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    document.querySelectorAll('.tome-tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });

    const activePane = document.getElementById(`tome-tab-${tab}`);
    if (activePane) {
      activePane.classList.add('active');
    }

    if (tab === 'crafting') {
      this.refreshCraftingDetail();
    } else if (tab === 'attributes') {
      this.refreshStats();
    }
  }

  private initGridDOM(): void {
    const gridContainer = document.getElementById('tome-grid-container');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    for (let i = 0; i < this.totalGridSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'tome-grid-slot';
      slot.setAttribute('data-index', i.toString());
      slot.setAttribute('draggable', 'true');

      const canvas = document.createElement('canvas');
      canvas.className = 'tome-slot-canvas';
      canvas.width = 48;
      canvas.height = 48;

      const count = document.createElement('span');
      count.className = 'tome-slot-count';

      slot.appendChild(canvas);
      slot.appendChild(count);

      // Slot Click & Hover Interactions
      slot.addEventListener('click', (e) => this.onGridSlotClick(i, e.shiftKey));
      slot.addEventListener('mouseenter', (e) => this.showSlotTooltip(i, e));
      slot.addEventListener('mouseleave', () => this.hideTooltip());

      // HTML5 Drag & Drop Interactions
      slot.addEventListener('dragstart', (e: DragEvent) => {
        const item = this.gridSlots[i];
        if (!item || item.count <= 0) {
          e.preventDefault();
          return;
        }
        const payload = JSON.stringify({
          sourceType: 'tome-grid',
          sourceIndex: i,
          itemType: item.type,
          count: item.count,
        });
        e.dataTransfer?.setData('application/json', payload);
        e.dataTransfer?.setData('text/plain', payload);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        slot.classList.add('dragging');
        this.hideTooltip();
      });

      slot.addEventListener('dragend', () => {
        slot.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });

      slot.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const raw = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
        if (!raw) return;
        try {
          const data = JSON.parse(raw);
          this.handleDropOnGridSlot(data, i);
        } catch (err) {
          console.warn('[DragDrop] Grid drop error:', err);
        }
      });

      gridContainer.appendChild(slot);
    }
  }

  private initEquipmentDOM(): void {
    const equipSlots = document.querySelectorAll('.tome-equip-slot');
    equipSlots.forEach((slot) => {
      const slotKey = slot.getAttribute('data-slot');
      if (slotKey) {
        slot.setAttribute('draggable', 'true');
        slot.addEventListener('click', () => this.onEquipSlotClick(slotKey));
        slot.addEventListener('mouseenter', (e) => this.showEquipTooltip(slotKey, e as MouseEvent));
        slot.addEventListener('mouseleave', () => this.hideTooltip());

        slot.addEventListener('dragstart', (e: Event) => {
          const dragEvt = e as DragEvent;
          const equipped = this.equipSlots.get(slotKey);
          if (!equipped) {
            dragEvt.preventDefault();
            return;
          }
          const payload = JSON.stringify({
            sourceType: 'tome-equip',
            slotKey: slotKey,
            itemType: equipped.type,
            count: 1,
          });
          dragEvt.dataTransfer?.setData('application/json', payload);
          dragEvt.dataTransfer?.setData('text/plain', payload);
          if (dragEvt.dataTransfer) dragEvt.dataTransfer.effectAllowed = 'move';
          (slot as HTMLElement).classList.add('dragging');
          this.hideTooltip();
        });

        slot.addEventListener('dragend', () => {
          (slot as HTMLElement).classList.remove('dragging');
          document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
        });

        slot.addEventListener('dragover', (e: Event) => {
          const dragEvt = e as DragEvent;
          dragEvt.preventDefault();
          if (dragEvt.dataTransfer) dragEvt.dataTransfer.dropEffect = 'move';
          (slot as HTMLElement).classList.add('drag-over');
        });

        slot.addEventListener('dragleave', () => {
          (slot as HTMLElement).classList.remove('drag-over');
        });

        slot.addEventListener('drop', (e: Event) => {
          const dragEvt = e as DragEvent;
          dragEvt.preventDefault();
          (slot as HTMLElement).classList.remove('drag-over');
          const raw = dragEvt.dataTransfer?.getData('application/json') || dragEvt.dataTransfer?.getData('text/plain');
          if (!raw) return;
          try {
            const data = JSON.parse(raw);
            this.handleDropOnEquipSlot(data, slotKey);
          } catch (err) {
            console.warn('[DragDrop] Equip drop error:', err);
          }
        });
      }
    });
  }

  private initCraftingDOM(): void {
    const list = document.getElementById('tome-recipes-list');
    if (!list) return;

    list.innerHTML = '';
    SURVIVAL_RECIPES.forEach((recipe, idx) => {
      const item = document.createElement('div');
      item.className = `tome-recipe-item ${idx === 0 ? 'active' : ''}`;
      item.setAttribute('data-recipe', recipe.id);
      item.innerHTML = `
        <span class="recipe-icon">${recipe.icon}</span>
        <div class="recipe-info">
          <span class="recipe-name">${recipe.name}</span>
          <span class="recipe-category">${recipe.category}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.tome-recipe-item').forEach((r) => r.classList.remove('active'));
        item.classList.add('active');
        this.selectedRecipe = recipe;
        this.refreshCraftingDetail();
        try {
          this.sound.playClick();
        } catch (e) {}
      });

      list.appendChild(item);
    });

    this.selectedRecipe = SURVIVAL_RECIPES[0];

    const craftBtn = document.getElementById('btn-craft-item');
    if (craftBtn) {
      craftBtn.addEventListener('click', () => this.craftSelectedItem());
    }
  }

  private init3DViewport(): void {
    this.avatarCanvas = document.getElementById('tome-avatar-canvas') as HTMLCanvasElement;
    if (!this.avatarCanvas) return;

    const container = document.getElementById('tome-avatar-container');
    const width = container?.clientWidth || 220;
    const height = container?.clientHeight || 340;

    this.avatarScene = new THREE.Scene();
    this.avatarCamera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);
    this.avatarCamera.position.set(0, 0.95, 2.55);
    this.avatarCamera.lookAt(0, 0.75, 0);

    this.avatarRenderer = new THREE.WebGLRenderer({
      canvas: this.avatarCanvas,
      alpha: true,
      antialias: true,
    });
    this.avatarRenderer.setSize(width, height);
    this.avatarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Studio Lighting
    const ambLight = new THREE.AmbientLight(0xffeedd, 1.4);
    this.avatarScene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xf59e0b, 1.8);
    dirLight.position.set(2, 4, 3);
    this.avatarScene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    rimLight.position.set(-2, 2, -2);
    this.avatarScene.add(rimLight);

    // Ash Pedestal Disc
    const pedestalGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.08, 24);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.85,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(0, -0.04, 0);
    this.avatarScene.add(pedestal);

    // Load Character Customizer
    this.avatarCustomizer = new CharacterCustomizationRenderer('tome-avatar-canvas-container');
    this.avatarCustomizer.autoRotate = false;
    this.avatarGroup = this.avatarCustomizer.getCharacterGroup();

    // Mouse Drag Rotation
    if (container) {
      container.addEventListener('mousedown', (e) => {
        this.isDraggingAvatar = true;
        this.prevMouseX = e.clientX;
      });
      window.addEventListener('mousemove', (e) => {
        if (this.isDraggingAvatar && this.avatarGroup) {
          const deltaX = e.clientX - this.prevMouseX;
          this.avatarGroup.rotation.y += deltaX * 0.015;
          this.prevMouseX = e.clientX;
        }
      });
      window.addEventListener('mouseup', () => {
        this.isDraggingAvatar = false;
      });
    }
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    if (this.modal) {
      this.modal.classList.remove('hidden');
      this.modal.style.display = 'flex';
      this.modal.style.zIndex = '99999';
      this.modal.style.position = 'fixed';
      this.modal.style.pointerEvents = 'auto';
    }

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // Resize 3D avatar viewport to container dimensions
    const container = document.getElementById('tome-avatar-container');
    if (container && this.avatarRenderer && this.avatarCamera) {
      const w = container.clientWidth || 220;
      const h = container.clientHeight || 340;
      this.avatarCamera.aspect = w / h;
      this.avatarCamera.updateProjectionMatrix();
      this.avatarRenderer.setSize(w, h);
    }

    // Sync settings to 3D avatar viewport
    const settings = SettingsManager.load();
    if (this.avatarCustomizer) {
      this.avatarCustomizer.loadMeshyModel(undefined, settings);
      this.avatarCustomizer.updateFromSettings(settings);
      this.avatarCustomizer.playAction('idle');
    }

    // Refresh inventory, stats, and recipes
    this.syncFromHotbar();
    this.renderInventory();
    this.refreshStats();
    this.refreshCraftingDetail();

    console.log('[SurvivalTome] Tome opened successfully.');

    try {
      this.sound.playClick();
    } catch (e) {}
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (this.modal) {
      this.modal.classList.add('hidden');
      this.modal.style.display = 'none';
      this.modal.style.pointerEvents = 'none';
    }
    this.hideTooltip();

    // Re-lock mouse cursor back to gameplay
    if (this.input) {
      this.input.requestPointerLock();
    }

    try {
      this.sound.playClick();
    } catch (e) {}
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public update(dt: number): void {
    if (!this.isOpen) return;

    if (this.avatarCustomizer) {
      this.avatarCustomizer.update(dt, 0);
    }
    if (this.avatarRenderer && this.avatarScene && this.avatarCamera) {
      this.avatarRenderer.render(this.avatarScene, this.avatarCamera);
    }
  }

  // --- INVENTORY ITEM LOGIC ---
  public addItem(type: BlockType, count: number = 1): boolean {
    // 1. Stack into existing slots
    for (let i = 0; i < this.totalGridSlots; i++) {
      const slot = this.gridSlots[i];
      if (slot && slot.type === type && slot.count < 64) {
        const canAdd = Math.min(count, 64 - slot.count);
        slot.count += canAdd;
        count -= canAdd;
        if (count <= 0) {
          this.renderInventory();
          return true;
        }
      }
    }

    // 2. Insert into empty slot
    for (let i = 0; i < this.totalGridSlots; i++) {
      if (!this.gridSlots[i]) {
        this.gridSlots[i] = { type, count };
        this.renderInventory();
        return true;
      }
    }

    return false;
  }

  public countItem(type: BlockType): number {
    let total = 0;
    for (const slot of this.gridSlots) {
      if (slot && slot.type === type) total += slot.count;
    }
    return total;
  }

  public removeItem(type: BlockType, count: number): boolean {
    if (this.countItem(type) < count) return false;

    let needed = count;
    for (let i = 0; i < this.totalGridSlots; i++) {
      const slot = this.gridSlots[i];
      if (slot && slot.type === type) {
        if (slot.count > needed) {
          slot.count -= needed;
          needed = 0;
          break;
        } else {
          needed -= slot.count;
          this.gridSlots[i] = null;
          if (needed <= 0) break;
        }
      }
    }

    this.renderInventory();
    return true;
  }

  public clearAllInventory(): void {
    for (let i = 0; i < this.totalGridSlots; i++) {
      this.gridSlots[i] = null;
    }
    for (const key of this.equipSlots.keys()) {
      this.equipSlots.set(key, null);
    }
    this.renderInventory();
    this.renderEquipment();
    this.refreshStats();
  }

  public syncToHotbar(): void {
    if (!this.ui) return;
    for (let i = 0; i < 9; i++) {
      const item = this.gridSlots[i];
      if (item && item.count > 0) {
        this.ui.hotbarSlots[i] = { blockType: item.type, count: item.count };
      } else {
        this.ui.hotbarSlots[i] = { blockType: null, count: 0 };
      }
    }
    this.ui.renderHotbarIcons();
  }

  public syncFromHotbar(): void {
    if (!this.ui) return;
    for (let i = 0; i < 9; i++) {
      const hotbarSlot = this.ui.hotbarSlots[i];
      if (hotbarSlot && hotbarSlot.blockType !== null && hotbarSlot.count > 0) {
        this.gridSlots[i] = { type: hotbarSlot.blockType, count: hotbarSlot.count };
      } else {
        this.gridSlots[i] = null;
      }
    }
  }

  public renderInventory(): void {
    for (let i = 0; i < this.totalGridSlots; i++) {
      const slotEl = document.querySelector(`.tome-grid-slot[data-index="${i}"]`) as HTMLElement;
      if (!slotEl) continue;

      const canvas = slotEl.querySelector('.tome-slot-canvas') as HTMLCanvasElement;
      const countEl = slotEl.querySelector('.tome-slot-count');
      const item = this.gridSlots[i];

      if (item && item.count > 0) {
        if (countEl) countEl.textContent = item.count > 1 ? item.count.toString() : '';
        if (canvas) this.drawItemIcon(canvas, item.type);
        slotEl.draggable = true;
        slotEl.style.cursor = 'grab';
      } else {
        if (countEl) countEl.textContent = '';
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        slotEl.draggable = false;
        slotEl.style.cursor = 'pointer';
      }
    }
  }

  private drawItemIcon(canvas: HTMLCanvasElement, type: BlockType): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const iconMap: { [key: number]: string } = {
      [BlockType.APPLES]: '🍎',
      [BlockType.REEDS]: '🌾',
      [BlockType.BRANCHES]: '🪵',
      [BlockType.FLINT]: '🪨',
      [BlockType.STONE_PEBBLE]: '🌑',
      [BlockType.ASHEN_EMBERPOD]: '🔥',
      [BlockType.CARROT]: '🥕',
      [BlockType.BONECREST_HORN]: '🪖',
      [BlockType.UNCOOKED_MEAT]: '🥩',
      [BlockType.ANIMAL_HIDE]: '🥋',
      [BlockType.THORNSPIKE_CLUSTER]: '🦔',
      [BlockType.BLOOMWING_FEATHER]: '🪶',
      [BlockType.DUNESTING_BARB]: '🧪',
      [BlockType.DUNESTING_PINCER_CLAW]: '🦂',
      [BlockType.DUNESTING_SHELL]: '🛡️',
      [BlockType.GRASS]: '🟩',
      [BlockType.DIRT]: '🟫',
      [BlockType.STONE]: '🧱',
      [BlockType.OAK_LOG]: '🪵',
      [BlockType.OAK_LEAVES]: '🍃',
      [BlockType.PLANKS]: '🪵',
      [BlockType.WORKBENCH]: '🪵',
      [BlockType.FLIMSY_PICKAXE]: '⛏️',
      [BlockType.FLIMSY_AXE]: '🪓',
      [BlockType.TORCH]: '🔦',
      [BlockType.JUNGLE_ROPE]: '🪢',
    };

    const emoji = iconMap[type] || '📦';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 + 2);
  }

  public getValidEquipSlot(type: BlockType): string | null {
    switch (type) {
      case BlockType.BONECREST_HORN:
      case BlockType.THORNSPIKE_CLUSTER:
        return 'head';
      case BlockType.ANIMAL_HIDE:
      case BlockType.DUNESTING_SHELL:
        return 'chest';
      case BlockType.BLOOMWING_FEATHER:
        return 'boots';
      case BlockType.FLIMSY_PICKAXE:
      case BlockType.FLIMSY_AXE:
      case BlockType.FLINT:
      case BlockType.STONE_PEBBLE:
      case BlockType.BRANCHES:
        return 'mainhand';
      case BlockType.DUNESTING_PINCER_CLAW:
        return 'offhand';
      case BlockType.ASHEN_EMBERPOD:
      case BlockType.DUNESTING_BARB:
        return 'relic';
      default:
        return null;
    }
  }

  public isValidEquipForSlot(slotKey: string, type: BlockType): boolean {
    const validSlot = this.getValidEquipSlot(type);
    if (validSlot === slotKey) return true;
    if (slotKey === 'offhand' && (type === BlockType.DUNESTING_SHELL || type === BlockType.TORCH)) return true;
    return false;
  }

  public handleDropOnGridSlot(data: any, targetIdx: number): void {
    if (data.sourceType === 'tome-grid') {
      const srcIdx = data.sourceIndex;
      if (srcIdx === targetIdx || srcIdx === undefined) return;
      const srcItem = this.gridSlots[srcIdx];
      const dstItem = this.gridSlots[targetIdx];
      if (!srcItem) return;

      if (dstItem && dstItem.type === srcItem.type && dstItem.count < 64) {
        const canAdd = Math.min(srcItem.count, 64 - dstItem.count);
        dstItem.count += canAdd;
        srcItem.count -= canAdd;
        if (srcItem.count <= 0) {
          this.gridSlots[srcIdx] = null;
        }
      } else {
        this.gridSlots[srcIdx] = dstItem;
        this.gridSlots[targetIdx] = srcItem;
      }

      if (srcIdx < 9 || targetIdx < 9) {
        this.syncToHotbar();
      }
      this.renderInventory();
      try { this.sound.playClick(); } catch (e) {}
    } else if (data.sourceType === 'hotbar') {
      const hotbarIdx = data.sourceIndex;
      if (hotbarIdx === undefined) return;
      const hotbarSlot = this.ui.hotbarSlots[hotbarIdx];
      if (!hotbarSlot || hotbarSlot.blockType === null || hotbarSlot.count <= 0) return;

      const dstItem = this.gridSlots[targetIdx];
      if (dstItem && dstItem.type === hotbarSlot.blockType && dstItem.count < 64) {
        const canAdd = Math.min(hotbarSlot.count, 64 - dstItem.count);
        dstItem.count += canAdd;
        hotbarSlot.count -= canAdd;
        if (hotbarSlot.count <= 0) {
          hotbarSlot.blockType = null;
          hotbarSlot.count = 0;
        }
      } else {
        const tempType = hotbarSlot.blockType;
        const tempCount = hotbarSlot.count;
        if (dstItem) {
          hotbarSlot.blockType = dstItem.type;
          hotbarSlot.count = dstItem.count;
        } else {
          hotbarSlot.blockType = null;
          hotbarSlot.count = 0;
        }
        this.gridSlots[targetIdx] = { type: tempType, count: tempCount };
      }

      this.ui.renderHotbarIcons();
      this.renderInventory();
      if (targetIdx < 9) this.syncToHotbar();
      try { this.sound.playClick(); } catch (e) {}
    } else if (data.sourceType === 'tome-equip') {
      const slotKey = data.slotKey;
      if (!slotKey) return;
      const equipped = this.equipSlots.get(slotKey);
      if (!equipped) return;

      const dstItem = this.gridSlots[targetIdx];
      if (!dstItem) {
        this.gridSlots[targetIdx] = equipped;
        this.equipSlots.set(slotKey, null);
      } else if (this.isValidEquipForSlot(slotKey, dstItem.type)) {
        this.equipSlots.set(slotKey, { type: dstItem.type, count: 1 });
        if (dstItem.count > 1) {
          dstItem.count -= 1;
          this.addItem(equipped.type, 1);
        } else {
          this.gridSlots[targetIdx] = equipped;
        }
      } else {
        if (this.addItem(equipped.type, 1)) {
          this.equipSlots.set(slotKey, null);
        }
      }

      this.renderEquipment();
      this.renderInventory();
      this.refreshStats();
      if (targetIdx < 9) this.syncToHotbar();
      try { this.sound.playClick(); } catch (e) {}
    }
  }

  public handleDropOnEquipSlot(data: any, slotKey: string): void {
    if (!this.isValidEquipForSlot(slotKey, data.itemType)) return;

    if (data.sourceType === 'tome-grid') {
      const srcIdx = data.sourceIndex;
      if (srcIdx === undefined) return;
      const srcItem = this.gridSlots[srcIdx];
      if (!srcItem) return;

      const currentEquipped = this.equipSlots.get(slotKey);
      this.equipSlots.set(slotKey, { type: srcItem.type, count: 1 });

      if (srcItem.count > 1) {
        srcItem.count -= 1;
        if (currentEquipped) {
          this.addItem(currentEquipped.type, 1);
        }
      } else {
        this.gridSlots[srcIdx] = currentEquipped || null;
      }

      this.renderEquipment();
      this.renderInventory();
      this.refreshStats();
      if (srcIdx < 9) this.syncToHotbar();
      try { this.sound.playClick(); } catch (e) {}
    } else if (data.sourceType === 'hotbar') {
      const hotbarIdx = data.sourceIndex;
      if (hotbarIdx === undefined) return;
      const hotbarSlot = this.ui.hotbarSlots[hotbarIdx];
      if (!hotbarSlot || hotbarSlot.blockType === null || hotbarSlot.count <= 0) return;

      const currentEquipped = this.equipSlots.get(slotKey);
      this.equipSlots.set(slotKey, { type: hotbarSlot.blockType, count: 1 });

      if (hotbarSlot.count > 1) {
        hotbarSlot.count -= 1;
        if (currentEquipped) {
          this.addItem(currentEquipped.type, 1);
        }
      } else {
        if (currentEquipped) {
          hotbarSlot.blockType = currentEquipped.type;
          hotbarSlot.count = 1;
        } else {
          hotbarSlot.blockType = null;
          hotbarSlot.count = 0;
        }
      }

      this.ui.renderHotbarIcons();
      this.renderEquipment();
      this.renderInventory();
      this.refreshStats();
      try { this.sound.playClick(); } catch (e) {}
    }
  }

  private onGridSlotClick(index: number, isShift: boolean): void {
    const item = this.gridSlots[index];
    if (!item) return;

    if (isShift) {
      // Shift-click: Auto-equip if armor/tool, or transfer to hotbar
      if (item.type === BlockType.BONECREST_HORN) {
        this.equipItem('head', item, index);
      } else if (item.type === BlockType.ANIMAL_HIDE) {
        this.equipItem('chest', item, index);
      } else if (item.type === BlockType.FLINT || item.type === BlockType.STONE_PEBBLE || item.type === BlockType.FLIMSY_PICKAXE || item.type === BlockType.FLIMSY_AXE) {
        this.equipItem('mainhand', item, index);
      } else {
        this.ui.addResourceToHotbar(item.type, item.count);
        this.gridSlots[index] = null;
        this.renderInventory();
        if (index < 9) this.syncToHotbar();
      }
    } else {
      // Regular Click: Quick-send to hotbar if not already present or equip
      if (item.type === BlockType.BONECREST_HORN && !this.equipSlots.get('head')) {
        this.equipItem('head', item, index);
      } else if (item.type === BlockType.ANIMAL_HIDE && !this.equipSlots.get('chest')) {
        this.equipItem('chest', item, index);
      } else {
        this.ui.addResourceToHotbar(item.type, item.count);
        this.renderInventory();
        if (index < 9) this.syncToHotbar();
      }
    }
    try {
      this.sound.playClick();
    } catch (e) {}
  }

  private equipItem(slotKey: string, item: InventorySlotItem, gridIndex: number): void {
    const currentEquip = this.equipSlots.get(slotKey);
    this.equipSlots.set(slotKey, { type: item.type, count: 1 });

    if (item.count > 1) {
      item.count -= 1;
    } else {
      this.gridSlots[gridIndex] = currentEquip || null;
    }

    this.renderEquipment();
    this.renderInventory();
    this.refreshStats();
    if (gridIndex < 9) this.syncToHotbar();
  }

  private onEquipSlotClick(slotKey: string): void {
    const equipped = this.equipSlots.get(slotKey);
    if (!equipped) return;

    // Unequip to inventory
    if (this.addItem(equipped.type, 1)) {
      this.equipSlots.set(slotKey, null);
      this.renderEquipment();
      this.renderInventory();
      this.refreshStats();
      this.syncToHotbar();
      try {
        this.sound.playClick();
      } catch (e) {}
    }
  }

  private renderEquipment(): void {
    for (const [slotKey, item] of this.equipSlots.entries()) {
      const slotEl = document.getElementById(`equip-slot-${slotKey}`) as HTMLElement;
      if (!slotEl) continue;

      if (item) {
        slotEl.innerHTML = `<span style="font-size: 24px;">${this.getItemEmoji(item.type)}</span>`;
        slotEl.draggable = true;
        slotEl.style.cursor = 'grab';
      } else {
        const placeholders: { [key: string]: string } = {
          head: '🪖',
          chest: '🥋',
          boots: '👢',
          mainhand: '🗡️',
          offhand: '🛡️',
          relic: '💍',
        };
        slotEl.innerHTML = `<span class="slot-placeholder-icon">${placeholders[slotKey] || '📦'}</span>`;
        slotEl.draggable = false;
        slotEl.style.cursor = 'pointer';
      }
    }
  }

  private getItemEmoji(type: BlockType): string {
    const map: { [key: number]: string } = {
      [BlockType.BONECREST_HORN]: '🪖',
      [BlockType.ANIMAL_HIDE]: '🥋',
      [BlockType.THORNSPIKE_CLUSTER]: '🦔',
      [BlockType.BLOOMWING_FEATHER]: '🪶',
      [BlockType.UNCOOKED_MEAT]: '🥩',
      [BlockType.FLINT]: '🗡️',
      [BlockType.STONE_PEBBLE]: '⛏️',
      [BlockType.ASHEN_EMBERPOD]: '🔥',
      [BlockType.REEDS]: '🌾',
      [BlockType.APPLES]: '🍎',
      [BlockType.CARROT]: '🥕',
      [BlockType.DUNESTING_BARB]: '🧪',
      [BlockType.DUNESTING_PINCER_CLAW]: '🦂',
      [BlockType.DUNESTING_SHELL]: '🛡️',
      [BlockType.FLIMSY_PICKAXE]: '⛏️',
      [BlockType.FLIMSY_AXE]: '🪓',
      [BlockType.TORCH]: '🔦',
      [BlockType.WORKBENCH]: '🪵',
      [BlockType.JUNGLE_ROPE]: '🪢',
    };
    return map[type] || '📦';
  }

  // --- CRAFTING LOGIC ---
  private refreshCraftingDetail(): void {
    if (!this.selectedRecipe) return;

    const title = document.getElementById('recipe-detail-title');
    const desc = document.getElementById('recipe-detail-desc');
    const matsList = document.getElementById('recipe-materials-list');
    const craftBtn = document.getElementById('btn-craft-item') as HTMLButtonElement;

    if (title) title.textContent = `${this.selectedRecipe.icon} ${this.selectedRecipe.name}`;
    if (desc) desc.textContent = this.selectedRecipe.desc;

    let canCraft = true;
    if (matsList) {
      matsList.innerHTML = '';
      this.selectedRecipe.materials.forEach((mat) => {
        const currentCount = this.countItem(mat.type);
        const fulfilled = currentCount >= mat.count;
        if (!fulfilled) canCraft = false;

        const row = document.createElement('div');
        row.className = `material-row ${fulfilled ? 'fulfilled' : ''}`;
        row.innerHTML = `
          <span>${mat.name}</span>
          <span>${currentCount} / ${mat.count}</span>
        `;
        matsList.appendChild(row);
      });
    }

    if (craftBtn) {
      craftBtn.disabled = !canCraft;
      if (canCraft) {
        craftBtn.classList.remove('disabled');
      } else {
        craftBtn.classList.add('disabled');
      }
    }
  }

  private craftSelectedItem(): void {
    if (!this.selectedRecipe) return;

    for (const mat of this.selectedRecipe.materials) {
      if (this.countItem(mat.type) < mat.count) return;
    }

    // Deduct materials from both inventory & hotbar
    for (const mat of this.selectedRecipe.materials) {
      this.removeItem(mat.type, mat.count);
      if (this.ui) {
        this.ui.removeResourceFromHotbar(mat.type, mat.count);
      }
    }

    // Add crafted item to both inventory & hotbar
    this.addItem(this.selectedRecipe.outputType, this.selectedRecipe.outputCount);
    if (this.ui) {
      this.ui.addResourceToHotbar(this.selectedRecipe.outputType, this.selectedRecipe.outputCount);
      this.ui.renderHotbarIcons();
    }

    this.renderInventory();
    this.refreshCraftingDetail();

    try {
      this.sound.playPop();
    } catch (e) {}

    this.ui.showNotification(`+${this.selectedRecipe.outputCount} ${this.selectedRecipe.name} Crafted!`);
  }

  // --- ATTRIBUTES & STATS ---
  private refreshStats(): void {
    let totalArmor = 0;
    let attackPower = 4;
    let burnRes = 0;
    let speedBonus = 100;

    const head = this.equipSlots.get('head');
    const chest = this.equipSlots.get('chest');
    const boots = this.equipSlots.get('boots');
    const mainhand = this.equipSlots.get('mainhand');

    if (head && head.type === BlockType.BONECREST_HORN) {
      totalArmor += 25;
      attackPower += 5;
    }
    if (chest && chest.type === BlockType.ANIMAL_HIDE) {
      totalArmor += 15;
      burnRes += 25;
    }
    if (boots) {
      totalArmor += 8;
      speedBonus += 10;
    }
    if (mainhand) {
      if (mainhand.type === BlockType.FLINT) attackPower += 8;
      else if (mainhand.type === BlockType.STONE_PEBBLE) attackPower += 6;
    }

    const hpEl = document.getElementById('stat-max-hp');
    const stamEl = document.getElementById('stat-max-stam');
    const armorEl = document.getElementById('stat-armor');
    const atkEl = document.getElementById('stat-attack');
    const heatEl = document.getElementById('stat-heat-res');
    const speedEl = document.getElementById('stat-speed');

    if (hpEl) hpEl.textContent = `${Math.ceil(this.player.health)} / 20`;
    if (stamEl) stamEl.textContent = `${Math.ceil(this.player.stamina)} / 100`;
    if (armorEl) armorEl.textContent = `+${totalArmor}`;
    if (atkEl) atkEl.textContent = `${attackPower} Damage`;
    if (heatEl) heatEl.textContent = `${burnRes}%`;
    if (speedEl) speedEl.textContent = `${speedBonus}%`;
  }

  // --- TOOLTIPS ---
  private showSlotTooltip(index: number, event: MouseEvent): void {
    const item = this.gridSlots[index];
    if (!item || !this.tooltipEl) return;

    const def = BLOCK_DEFINITIONS[item.type] || { name: 'Resource' };
    const title = document.getElementById('tooltip-item-name');
    const type = document.getElementById('tooltip-item-type');
    const desc = document.getElementById('tooltip-item-desc');

    if (title) title.textContent = def.name;
    if (type) type.textContent = 'Resource & Crafting Material';
    if (desc) desc.textContent = `Quantity: ${item.count}. Shift-click to equip or transfer.`;

    this.tooltipEl.style.left = `${event.clientX + 14}px`;
    this.tooltipEl.style.top = `${event.clientY + 14}px`;
    this.tooltipEl.classList.remove('hidden');
  }

  private showEquipTooltip(slotKey: string, event: MouseEvent): void {
    const item = this.equipSlots.get(slotKey);
    if (!item || !this.tooltipEl) return;

    const def = BLOCK_DEFINITIONS[item.type] || { name: 'Equipped Gear' };
    const title = document.getElementById('tooltip-item-name');
    const type = document.getElementById('tooltip-item-type');
    const desc = document.getElementById('tooltip-item-desc');

    if (title) title.textContent = def.name;
    if (type) type.textContent = `Equipped [${slotKey.toUpperCase()}]`;
    if (desc) desc.textContent = `Click to unequip back into inventory.`;

    this.tooltipEl.style.left = `${event.clientX + 14}px`;
    this.tooltipEl.style.top = `${event.clientY + 14}px`;
    this.tooltipEl.classList.remove('hidden');
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.classList.add('hidden');
    }
  }
}
