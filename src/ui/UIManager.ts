import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { InputManager } from '../controls/InputManager';
import { SoundManager } from '../audio/SoundManager';
import { DayNightCycle, DayNightTimeInfo } from '../environment/DayNightCycle';
import { SettingsManager } from '../settings/SettingsManager';
import * as THREE from 'three';

export interface HotbarSlotData {
  blockType: BlockType | null;
  count: number;
}

export const ITEM_PREVIEW_IMAGES: Partial<Record<BlockType, string>> = {
  [BlockType.GRASS]: '/textures/ground/GRASS TEXTURE.png',
  [BlockType.DIRT]: '/textures/ground/DIRT TEXTURE.png',
  [BlockType.STONE]: '/textures/ground/STONE TEXTURE.png',
  [BlockType.OAK_LOG]: '/textures/trees/WOOD TEXTURE.png',
  [BlockType.OAK_LEAVES]: '/textures/trees/TREE LEAVES TEXTURE.png',
  [BlockType.PLANKS]: '/textures/trees/WOOD TEXTURE.png',
  [BlockType.SAND]: '/textures/ground/SAND TEXURE.png',
  [BlockType.WATER]: '/textures/water/WATER TEXTURE.png',
  
  [BlockType.SNOW]: '/textures/ground/SNOW TOP.png',
  [BlockType.FROST_STONE]: '/textures/ground/FROST STONE.png',
  [BlockType.PACKED_SNOW]: '/textures/ground/PACKED SNOW.png',
  [BlockType.FROZEN_LOG]: '/textures/trees/FROZEN PINE BARK.png',
  [BlockType.FROST_LEAVES]: '/textures/trees/FROSTED PINE NEEDLES.png',
  [BlockType.FROST_ORE]: '/textures/ores/FROST CRYSTAL ORE.png',
  [BlockType.FROZEN_PLANKS]: '/textures/trees/FROZEN PINE PLANKS.png',
  [BlockType.ICE]: '/textures/water/ICE BLOCK.png',
  [BlockType.FROST_BLOOM]: '/textures/vegetation/FROSTED BLOOM.png',
  
  [BlockType.NETHER_STONE]: '/textures/ground/ASHEN STONE.png',
  [BlockType.ASHEN_SOIL]: '/textures/ground/ASHEN SOIL.png',
  [BlockType.CORRUPTED_GROWTH]: '/textures/ground/ASHEN SOIL.png',
  [BlockType.CINDER_SAND]: '/textures/ground/CINDER SAND.png',
  [BlockType.PETRIFIED_LOG]: '/textures/trees/PETRIFIED WOOD SIDE.png',
  [BlockType.CORRUPTED_ORE]: '/textures/ores/ASHEN CORRUPTED CRYSTAL ORE SUPER RARE.png',
  [BlockType.ASHEN_COPPER_ORE]: '/textures/ores/ASHEN STONE WITH COPPER UNCOMMON.png',
  [BlockType.ASHEN_SILVER_ORE]: '/textures/ores/ASHEN STONE WITH SILVER RARE.png',
  [BlockType.ASHEN_GOLD_ORE]: '/textures/ores/ASHEN STONE WITH GOLD RARE.png',
  [BlockType.ASHEN_ABYSSAL_PRIMORDIUM]: '/textures/ores/ASHEN Abyssal Primordium LEGENDARY.png',
  [BlockType.RUINED_PLANKS]: '/textures/trees/RUNIED PLANKS.png',
  [BlockType.MOLTEN_CORRUPTION]: '/textures/water/MAGMA.png',

  [BlockType.SUNSCORCHED_SANDSTONE]: '/textures/ground/SUNSCORCHED SANDSTONE.png',
  [BlockType.CRACKED_CLAY]: '/textures/ground/CRACKED CLAY SOIL.png',
  [BlockType.SCRUBGRASS]: '/textures/ground/SCRUBGRASS TOP.png',
  [BlockType.DESERT_SAND]: '/textures/ground/DESERT SAND.png',
  [BlockType.PETRIFIED_SUNWOOD]: '/textures/trees/PETRIFIED SUNWOOD SIDE.png',
  [BlockType.PALM_FRONDS]: '/textures/vegetation/WITHERED PALM FRONDS.png',
  [BlockType.SUNSTONE_ORE]: '/textures/ores/SUNSTONE ORE.png',
  [BlockType.TEMPLE_PLANKS]: '/textures/trees/TEMPLE PLANKS.png',
  [BlockType.DESERT_BLOOM]: '/textures/vegetation/DESERT BLOOM.png',
  [BlockType.OASIS_WATER]: '/textures/water/OASIS WATER.png',
  [BlockType.JUNGLE_WATER]: '/textures/water/Mossveil-jungle-water-texture.png',
  [BlockType.MUDDY_QUICKSAND]: '/textures/ground/Mossveil-muddy-quicksand.png',
  [BlockType.WORKBENCH]: '/textures/ui/previews/CRAFT BENCH.png',

  // Animal & Monster Resource Pickups & Tools
  [BlockType.DUNESTING_BARB]: '/textures/ui/previews/SCORPION STINGER.png',
  [BlockType.DUNESTING_PINCER_CLAW]: '/textures/ui/previews/DUNESTING PINCER CLAW.png',
  [BlockType.DUNESTING_SHELL]: '/textures/ui/previews/DUNESTING SHELL.png',
  [BlockType.BONECREST_HORN]: '/textures/ui/previews/BONECREST HORN.png',
  [BlockType.BONECREST_HAMMER]: '/textures/ui/previews/BONECREST HAMMER.png',
  [BlockType.BONECREST_SHIELD]: '/textures/ui/previews/BONECREST SHEILD.png',
  [BlockType.UNCOOKED_MEAT]: '/textures/ui/previews/UNCOOKED MEAT.png',
  [BlockType.COOKED_MEAT]: '/textures/ui/previews/COOKED MEAT.png',
  [BlockType.ANIMAL_HIDE]: '/textures/ui/previews/ANIMAL HIDE.png',
  [BlockType.BLOOMWING_FEATHER]: '/textures/ui/previews/FEATHER.png',
  [BlockType.APPLES]: '/textures/ui/previews/APPLES.png',
  [BlockType.CARROT]: '/textures/ui/previews/CARROT.png',
  [BlockType.BRANCHES]: '/textures/ui/previews/BRANCHES.png',
  [BlockType.FLINT]: '/textures/ui/previews/FLINT.png',
  [BlockType.STONE_PEBBLE]: '/textures/ui/previews/STONE.png',
  [BlockType.REEDS]: '/textures/ui/previews/REED BUNDLE.png',
  [BlockType.FLIMSY_AXE]: '/textures/ui/previews/FLIMSY AXE.png',
  [BlockType.FLIMSY_PICKAXE]: '/textures/ui/previews/STONE PICKAXE.png',
  [BlockType.STONE_AXE]: '/textures/ui/previews/STONE AXE.png',
  [BlockType.HUNTING_BOW]: '/textures/ui/previews/BONECREST BOW.png',
  [BlockType.TORCH]: '/textures/ui/previews/FLINT.png',
};

export class UIManager {
  private world: VoxelWorld;
  private input: InputManager;
  private sound: SoundManager;
  private dayNight: DayNightCycle;
  private camera: THREE.PerspectiveCamera;

  // 9 Hotbar slots start empty
  public hotbarSlots: HotbarSlotData[] = Array.from({ length: 9 }, () => ({
    blockType: null,
    count: 0,
  }));

  private loadedPreviewImages: Map<string, HTMLImageElement> = new Map();
  public survivalTome: any = null;

  constructor(
    world: VoxelWorld,
    input: InputManager,
    sound: SoundManager,
    dayNight: DayNightCycle,
    camera: THREE.PerspectiveCamera
  ) {
    this.world = world;
    this.input = input;
    this.sound = sound;
    this.dayNight = dayNight;
    this.camera = camera;

    this.preloadPreviewImages();
    this.renderHotbarIcons();
    this.initHotbarDragAndDrop();
    this.initInventoryModal();
    this.initSettings();
  }

  public setSurvivalTome(tome: any): void {
    this.survivalTome = tome;
  }

  private preloadPreviewImages(): void {
    Object.values(ITEM_PREVIEW_IMAGES).forEach((url) => {
      if (url && !this.loadedPreviewImages.has(url)) {
        const img = new Image();
        img.onload = () => {
          this.renderHotbarIcons();
        };
        img.src = url;
        this.loadedPreviewImages.set(url, img);
      }
    });
  }

  // Add harvested block resource to hotbar
  public addResourceToHotbar(blockType: BlockType, amount: number = 1): void {
    // Map GRASS to DIRT resource item if mined
    const harvestType = blockType === BlockType.GRASS ? BlockType.DIRT : blockType;

    // 1. Check if resource already exists in hotbar
    const existingSlot = this.hotbarSlots.find((s) => s.blockType === harvestType && s.count > 0);
    if (existingSlot) {
      existingSlot.count += amount;
      this.renderHotbarIcons();
      return;
    }

    // 2. Otherwise find first empty slot
    const emptySlot = this.hotbarSlots.find((s) => s.blockType === null || s.count <= 0);
    if (emptySlot) {
      emptySlot.blockType = harvestType;
      emptySlot.count = amount;
      this.renderHotbarIcons();
    }
  }

  // Deduct resource item from hotbar
  public removeResourceFromHotbar(blockType: BlockType, amount: number = 1): boolean {
    let remaining = amount;
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      const slot = this.hotbarSlots[i];
      if (slot && slot.blockType === blockType && slot.count > 0) {
        if (slot.count > remaining) {
          slot.count -= remaining;
          remaining = 0;
          break;
        } else {
          remaining -= slot.count;
          slot.count = 0;
          slot.blockType = null;
          if (remaining <= 0) break;
        }
      }
    }
    this.renderHotbarIcons();
    return remaining === 0;
  }

  // Clear all items from hotbar (e.g. on player death)
  public clearHotbar(): void {
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      this.hotbarSlots[i] = { blockType: null, count: 0 };
    }
    this.renderHotbarIcons();
  }

  // Consume 1 item from active hotbar slot when placed
  public consumeActiveResource(): boolean {
    const activeSlot = this.hotbarSlots[this.input.activeHotbarIndex];
    if (activeSlot && activeSlot.blockType !== null && activeSlot.count > 0) {
      activeSlot.count -= 1;
      if (activeSlot.count <= 0) {
        activeSlot.blockType = null;
        activeSlot.count = 0;
      }
      this.renderHotbarIcons();
      return true;
    }
    return false;
  }

  public hasTorchInHotbar(): boolean {
    return this.hotbarSlots.some((s) => s.blockType === BlockType.TORCH && s.count > 0);
  }

  // Draw preview images onto hotbar slot canvases
  public renderHotbarIcons(): void {
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, idx) => {
      const slotData = this.hotbarSlots[idx];
      const canvas = slot.querySelector('.slot-icon') as HTMLCanvasElement;
      const label = slot.querySelector('.slot-label') as HTMLElement;
      const countSpan = slot.querySelector('.item-count') as HTMLElement;

      if (!canvas || !countSpan || !label) return;

      const ctx = canvas.getContext('2d')!;
      canvas.width = 32;
      canvas.height = 32;
      ctx.clearRect(0, 0, 32, 32);

      if (slotData && slotData.blockType !== null && slotData.count > 0) {
        const def = BLOCK_DEFINITIONS[slotData.blockType];
        const previewUrl = ITEM_PREVIEW_IMAGES[slotData.blockType];

        canvas.style.display = 'block';
        let renderedImage = false;

        if (previewUrl) {
          if (!this.loadedPreviewImages.has(previewUrl)) {
            const img = new Image();
            img.onload = () => this.renderHotbarIcons();
            img.src = previewUrl;
            this.loadedPreviewImages.set(previewUrl, img);
          }
          const img = this.loadedPreviewImages.get(previewUrl);
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, 32, 32);
            renderedImage = true;
          }
        }

        // Fallback emoji icon if texture preview is loading or not assigned
        if (!renderedImage) {
          const fallbackEmojis: { [key: number]: string } = {
            [BlockType.WORKBENCH]: '🪵',
            [BlockType.APPLES]: '🍎',
            [BlockType.REEDS]: '🌾',
            [BlockType.BRANCHES]: '🪵',
            [BlockType.FLINT]: '🪨',
            [BlockType.STONE_PEBBLE]: '🌑',
            [BlockType.CARROT]: '🥕',
            [BlockType.UNCOOKED_MEAT]: '🥩',
            [BlockType.ANIMAL_HIDE]: '🥋',
            [BlockType.BONECREST_HORN]: '🪖',
            [BlockType.FLIMSY_PICKAXE]: '⛏️',
            [BlockType.FLIMSY_AXE]: '🪓',
            [BlockType.TORCH]: '🔦',
          };
          const emoji = fallbackEmojis[slotData.blockType] || '📦';
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, 16, 17);
        }

        label.innerText = def ? def.name : '';
        countSpan.innerText = slotData.count.toString();
        (slot as HTMLElement).draggable = true;
        (slot as HTMLElement).style.cursor = 'grab';
      } else {
        canvas.style.display = 'none';
        label.innerText = '';
        countSpan.innerText = '';
        (slot as HTMLElement).draggable = false;
        (slot as HTMLElement).style.cursor = 'pointer';
      }
    });
  }

  // HTML5 Drag-and-Drop for Hotbar Slots
  private initHotbarDragAndDrop(): void {
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, idx) => {
      slot.addEventListener('dragstart', (e: Event) => {
        const dragEvt = e as DragEvent;
        const slotData = this.hotbarSlots[idx];
        if (!slotData || slotData.blockType === null || slotData.count <= 0) {
          dragEvt.preventDefault();
          return;
        }
        const payload = JSON.stringify({
          sourceType: 'hotbar',
          sourceIndex: idx,
          itemType: slotData.blockType,
          count: slotData.count,
        });
        dragEvt.dataTransfer?.setData('application/json', payload);
        dragEvt.dataTransfer?.setData('text/plain', payload);
        if (dragEvt.dataTransfer) dragEvt.dataTransfer.effectAllowed = 'move';
        slot.classList.add('dragging');
      });

      slot.addEventListener('dragend', () => {
        slot.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });

      slot.addEventListener('dragover', (e: Event) => {
        const dragEvt = e as DragEvent;
        dragEvt.preventDefault();
        if (dragEvt.dataTransfer) dragEvt.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', (e: Event) => {
        const dragEvt = e as DragEvent;
        dragEvt.preventDefault();
        slot.classList.remove('drag-over');
        const raw = dragEvt.dataTransfer?.getData('application/json') || dragEvt.dataTransfer?.getData('text/plain');
        if (!raw) return;
        try {
          const data = JSON.parse(raw);
          this.handleHotbarDrop(data, idx);
        } catch (err) {
          console.warn('[DragDrop] Hotbar drop parse error:', err);
        }
      });
    });
  }

  public handleHotbarDrop(data: any, targetIdx: number): void {
    if (data.sourceType === 'hotbar') {
      const srcIdx = data.sourceIndex;
      if (srcIdx === targetIdx || srcIdx === undefined) return;
      const srcSlot = this.hotbarSlots[srcIdx];
      const dstSlot = this.hotbarSlots[targetIdx];

      if (srcSlot && srcSlot.blockType !== null && srcSlot.count > 0) {
        if (dstSlot && dstSlot.blockType === srcSlot.blockType && dstSlot.count < 64) {
          const canAdd = Math.min(srcSlot.count, 64 - dstSlot.count);
          dstSlot.count += canAdd;
          srcSlot.count -= canAdd;
          if (srcSlot.count <= 0) {
            srcSlot.blockType = null;
            srcSlot.count = 0;
          }
        } else {
          const tempType = srcSlot.blockType;
          const tempCount = srcSlot.count;
          srcSlot.blockType = dstSlot ? dstSlot.blockType : null;
          srcSlot.count = dstSlot ? dstSlot.count : 0;
          this.hotbarSlots[targetIdx] = { blockType: tempType, count: tempCount };
        }
      }
      this.renderHotbarIcons();
      if (this.survivalTome) {
        this.survivalTome.syncFromHotbar();
        this.survivalTome.renderInventory();
      }
      try { this.sound.playClick(); } catch (e) {}
    } else if (data.sourceType === 'tome-grid') {
      const tomeIdx = data.sourceIndex;
      if (tomeIdx === undefined || !this.survivalTome) return;
      const tomeItem = this.survivalTome.gridSlots[tomeIdx];
      if (!tomeItem || tomeItem.count <= 0) return;

      const dstSlot = this.hotbarSlots[targetIdx];
      if (dstSlot && dstSlot.blockType === tomeItem.type && dstSlot.count < 64) {
        const canAdd = Math.min(tomeItem.count, 64 - dstSlot.count);
        dstSlot.count += canAdd;
        tomeItem.count -= canAdd;
        if (tomeItem.count <= 0) {
          this.survivalTome.gridSlots[tomeIdx] = null;
        }
      } else {
        const tempType = tomeItem.type;
        const tempCount = tomeItem.count;
        if (dstSlot && dstSlot.blockType !== null && dstSlot.count > 0) {
          this.survivalTome.gridSlots[tomeIdx] = { type: dstSlot.blockType, count: dstSlot.count };
        } else {
          this.survivalTome.gridSlots[tomeIdx] = null;
        }
        this.hotbarSlots[targetIdx] = { blockType: tempType, count: tempCount };
      }

      this.renderHotbarIcons();
      this.survivalTome.renderInventory();
      try { this.sound.playClick(); } catch (e) {}
    } else if (data.sourceType === 'tome-equip') {
      const slotKey = data.slotKey;
      if (!slotKey || !this.survivalTome) return;
      const equipped = this.survivalTome.equipSlots.get(slotKey);
      if (!equipped) return;

      const dstSlot = this.hotbarSlots[targetIdx];
      if (!dstSlot || dstSlot.blockType === null || dstSlot.count <= 0) {
        this.hotbarSlots[targetIdx] = { blockType: equipped.type, count: 1 };
        this.survivalTome.equipSlots.set(slotKey, null);
      } else if (this.survivalTome.isValidEquipForSlot(slotKey, dstSlot.blockType)) {
        this.survivalTome.equipSlots.set(slotKey, { type: dstSlot.blockType, count: 1 });
        if (dstSlot.count > 1) {
          dstSlot.count -= 1;
          this.survivalTome.addItem(equipped.type, 1);
        } else {
          this.hotbarSlots[targetIdx] = { blockType: equipped.type, count: 1 };
        }
      } else {
        if (this.survivalTome.addItem(equipped.type, 1)) {
          this.survivalTome.equipSlots.set(slotKey, null);
        }
      }

      this.renderHotbarIcons();
      this.survivalTome.renderEquipment();
      this.survivalTome.renderInventory();
      this.survivalTome.refreshStats();
      try { this.sound.playClick(); } catch (e) {}
    }
  }

  private initInventoryModal(): void {
    const grid = document.getElementById('inventory-grid')!;
    grid.innerHTML = '';

    const allBlocks = Object.values(BLOCK_DEFINITIONS).filter((b) => b.id !== BlockType.AIR && b.id !== BlockType.CORRUPTION_BLOOM);

    allBlocks.forEach((def) => {
      const item = document.createElement('div');
      item.className = 'inventory-item';

      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;

      const previewUrl = ITEM_PREVIEW_IMAGES[def.id];
      if (previewUrl && this.loadedPreviewImages.has(previewUrl)) {
        const img = this.loadedPreviewImages.get(previewUrl)!;
        if (img.complete) {
          ctx.drawImage(img, 0, 0, 40, 40);
        }
      }

      const span = document.createElement('span');
      span.innerText = def.name;

      item.appendChild(canvas);
      item.appendChild(span);

      item.addEventListener('click', () => {
        const activeIndex = this.input.activeHotbarIndex;
        this.hotbarSlots[activeIndex] = {
          blockType: def.id,
          count: 64, // Grant full stack in creative/inventory picker
        };
        this.renderHotbarIcons();
        this.toggleInventory(false);
      });

      grid.appendChild(item);
    });

    document.getElementById('btn-close-inventory')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
  }

  public toggleInventory(show?: boolean): void {
    const inv = document.getElementById('inventory-overlay')!;
    const shouldShow = show !== undefined ? show : inv.classList.contains('hidden');

    if (shouldShow) {
      inv.classList.remove('hidden');
      document.exitPointerLock();
    } else {
      inv.classList.add('hidden');
      this.input.requestPointerLock();
    }
  }

  public togglePause(show?: boolean, isCreative: boolean = false): void {
    const pause = document.getElementById('pause-overlay')!;
    const shouldShow = show !== undefined ? show : pause.classList.contains('hidden');

    if (shouldShow) {
      const settings = SettingsManager.load();
      SettingsManager.syncUI(settings);
      const isCreativeMode = isCreative || settings.gamemode === 'creative';
      const worldRulesBox = document.getElementById('box-world-rules');
      if (worldRulesBox) {
        if (isCreativeMode) {
          worldRulesBox.classList.remove('hidden');
        } else {
          worldRulesBox.classList.add('hidden');
        }
      }
      pause.classList.remove('hidden');
      document.exitPointerLock();
    } else {
      pause.classList.add('hidden');
      this.input.requestPointerLock();
    }
  }

  public showDeathOverlay(show: boolean = true): void {
    const death = document.getElementById('death-overlay');
    if (!death) return;

    if (show) {
      death.classList.remove('hidden');
      document.exitPointerLock();
    } else {
      death.classList.add('hidden');
      this.input.requestPointerLock();
    }
  }

  public toggleDebug(): void {
    const debug = document.getElementById('debug-overlay')!;
    debug.classList.toggle('hidden');
  }

  public updateDebugInfo(
    fps: number,
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    targetedBlockName: string,
    chunkCount: number,
    isFlying: boolean
  ): void {
    const fpsEl = document.getElementById('debug-fps');
    const posEl = document.getElementById('debug-pos');
    const dirEl = document.getElementById('debug-dir');
    const targetEl = document.getElementById('debug-target');
    const chunksEl = document.getElementById('debug-chunks');
    const flyEl = document.getElementById('debug-fly');

    if (fpsEl) fpsEl.innerText = fps.toString();
    if (posEl) posEl.innerText = `${pos.x.toFixed(2)} / ${pos.y.toFixed(2)} / ${pos.z.toFixed(2)}`;

    if (dirEl) {
      const cardinal = Math.abs(dir.x) > Math.abs(dir.z) ? (dir.x > 0 ? 'East (+X)' : 'West (-X)') : (dir.z > 0 ? 'South (+Z)' : 'North (-Z)');
      dirEl.innerText = cardinal;
    }

    if (targetEl) targetEl.innerText = targetedBlockName;
    if (chunksEl) chunksEl.innerText = chunkCount.toString();
    if (flyEl) flyEl.innerText = isFlying ? 'ON (Press F to land)' : 'OFF (Press F)';
  }

  private initSettings(): void {
    const fovSlider = document.getElementById('slider-fov') as HTMLInputElement;
    fovSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.camera.fov = val;
      this.camera.updateProjectionMatrix();
      document.getElementById('val-fov')!.innerText = val.toString();
    });

    const renderDistSlider = document.getElementById('slider-render-dist') as HTMLInputElement;
    renderDistSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.world.renderDistance = val;
      document.getElementById('val-render-dist')!.innerText = val.toString();
    });

    const daySpeedSlider = document.getElementById('slider-day-speed') as HTMLInputElement;
    daySpeedSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.dayNight.speedMultiplier = val;
    });

    const volumeSlider = document.getElementById('slider-volume') as HTMLInputElement;
    volumeSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.sound.volume = val / 100;
      document.getElementById('val-volume')!.innerText = val.toString();
    });

    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.togglePause(false);
    });
  }

  public getSelectedBlockType(): BlockType | null {
    const activeSlot = this.hotbarSlots[this.input.activeHotbarIndex];
    if (activeSlot && activeSlot.count > 0) {
      return activeSlot.blockType;
    }
    return null;
  }

  public updateHealthBar(health: number, maxHealth: number): void {
    const healthBar = document.getElementById('health-bar');
    if (!healthBar) return;

    const totalHearts = 10;
    const activeHearts = Math.ceil((health / maxHealth) * totalHearts);

    let html = '';
    for (let i = 0; i < totalHearts; i++) {
      const isDamaged = i >= activeHearts;
      html += `<span class="stat-heart ${isDamaged ? 'damaged' : ''}"></span>`;
    }
    healthBar.innerHTML = html;

    // Critical Health Heartbeat Vignette
    const healthPct = maxHealth > 0 ? health / maxHealth : 1.0;
    const vignette = document.getElementById('critical-health-vignette');
    if (vignette) {
      if (healthPct <= 0.35 && health > 0) {
        vignette.classList.remove('hidden');
        const pulse = 0.65 + Math.sin(Date.now() * 0.007) * 0.35;
        const opacity = ((1.0 - healthPct / 0.35) * 0.85 * pulse);
        vignette.style.opacity = Math.max(0.1, Math.min(0.95, opacity)).toFixed(2);
      } else {
        vignette.style.opacity = '0';
        vignette.classList.add('hidden');
      }
    }
  }

  public updateOxygenBar(oxygen: number, maxOxygen: number, isUnderwater: boolean): void {
    const oxygenBar = document.getElementById('oxygen-bar');
    const oxygenVignette = document.getElementById('oxygen-vignette');

    // Update screen vignette for suffocation / low oxygen
    if (oxygenVignette) {
      if (oxygen < maxOxygen) {
        oxygenVignette.classList.remove('hidden');
        const depletionPct = 1.0 - Math.max(0, oxygen / maxOxygen);
        const pulse = 0.7 + Math.sin(Date.now() * 0.006) * 0.3;
        const opacity = depletionPct * 0.85 * pulse;
        oxygenVignette.style.opacity = Math.min(0.9, opacity).toFixed(2);
      } else {
        oxygenVignette.style.opacity = '0';
        oxygenVignette.classList.add('hidden');
      }
    }

    if (!oxygenBar) return;

    if (!isUnderwater && oxygen >= maxOxygen) {
      oxygenBar.classList.add('hidden');
      return;
    }

    oxygenBar.classList.remove('hidden');
    const totalBubbles = 10;
    const activeBubbles = Math.ceil((oxygen / maxOxygen) * totalBubbles);

    let html = '';
    for (let i = 0; i < totalBubbles; i++) {
      const isPopped = i >= activeBubbles;
      html += `<span class="stat-bubble ${isPopped ? 'popped' : ''}"></span>`;
    }
    oxygenBar.innerHTML = html;
  }

  public updateStaminaBar(stamina: number, maxStamina: number, isClimbing: boolean, isExhausted: boolean, isTouchingQuicksand: boolean = false): void {
    const staminaBar = document.getElementById('stamina-bar');
    if (!staminaBar) return;

    if (!isClimbing && !isTouchingQuicksand && stamina >= maxStamina) {
      staminaBar.classList.add('hidden');
      return;
    }

    staminaBar.classList.remove('hidden');
    const totalBolts = 10;
    const activeBolts = Math.ceil((stamina / maxStamina) * totalBolts);

    let html = '';
    for (let i = 0; i < totalBolts; i++) {
      const isDepleted = i >= activeBolts;
      const exhaustedClass = isExhausted || (stamina < 20) ? 'exhausted' : '';
      html += `<span class="stat-stamina ${isDepleted ? 'depleted' : ''} ${exhaustedClass}"></span>`;
    }
    staminaBar.innerHTML = html;
  }

  public updateGamepadHUD(isConnected: boolean, padName: string): void {
    const gamepadHud = document.getElementById('gamepad-hud');
    if (!gamepadHud) return;

    if (isConnected) {
      gamepadHud.classList.remove('hidden');
      const badge = gamepadHud.querySelector('.controller-badge');
      if (badge && padName) {
        const shortName = padName.split('(')[0].trim() || 'Controller';
        badge.textContent = `🎮 ${shortName.toUpperCase()} CONNECTED`;
      }
    } else {
      gamepadHud.classList.add('hidden');
    }
  }

  // WORKSTATION & ARMOR PROGRESSION SYSTEM
  public addResource(blockType: BlockType, count: number = 1): void {
    // 1. Try to add to existing stack
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType) {
        slot.count += count;
        this.renderHotbarIcons();
        return;
      }
    }
    // 2. Add to first empty slot
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === null || slot.count <= 0) {
        slot.blockType = blockType;
        slot.count = count;
        this.renderHotbarIcons();
        return;
      }
    }
    // Hotbar full fallback
    this.renderHotbarIcons();
  }

  public countResource(blockType: BlockType): number {
    let total = 0;
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType) {
        total += slot.count;
      }
    }
    return total;
  }

  public consumeResourceCount(blockType: BlockType, count: number): boolean {
    if (this.countResource(blockType) < count) return false;

    let needed = count;
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType && slot.count > 0) {
        const take = Math.min(needed, slot.count);
        slot.count -= take;
        needed -= take;
        if (slot.count <= 0) {
          slot.blockType = null;
        }
        if (needed <= 0) break;
      }
    }
    this.renderHotbarIcons();
    return true;
  }

  public openWorkstation(stationType: BlockType, settingsManagerCallback?: (updater: (s: any) => void) => void): void {
    const overlay = document.getElementById('workstation-overlay');
    const titleEl = document.getElementById('workstation-title');
    const descEl = document.getElementById('workstation-desc');
    const gridEl = document.getElementById('workstation-recipes-grid');
    const btnClose = document.getElementById('btn-close-workstation');

    if (!overlay || !gridEl) return;

    let titleText = 'BASIC WORKBENCH';
    let descText = 'Craft essential survival tools, planks, and specialized workstation structures.';

    if (stationType === BlockType.SMITHING_FORGE) {
      titleText = 'SMITHING FORGE & ANVIL';
      descText = 'Smelt raw ores into refined metals and hammer out basic steel tools & Tier 1 broadswords.';
    } else if (stationType === BlockType.ARMOR_STATION) {
      titleText = 'ARMOR FITTING STATION';
      descText = 'Forge and equip modular armor pieces, pauldrons, flowing capes, and glowing greatswords.';
    } else if (stationType === BlockType.NETHER_ALTAR) {
      titleText = 'ARCANE NETHER ALTAR';
      descText = 'Infuse obsidian plates and nether crystals into Tier 3 Shadow Armor and Nether Energy Blades.';
    }

    if (titleEl) titleEl.innerText = titleText;
    if (descEl) descEl.innerText = descText;

    // Define Recipes
    const recipes = [
      // 1. BASIC WORKBENCH RECIPES
      {
        id: 'planks',
        name: 'Oak Planks (x4)',
        station: BlockType.WORKBENCH,
        ingredients: [{ blockType: BlockType.OAK_LOG, count: 1, name: 'Oak Log' }],
        resultType: 'item',
        resultBlock: BlockType.PLANKS,
        resultCount: 4,
        description: 'Basic building planks for structures & workstations.'
      },
      {
        id: 'smithing_forge_block',
        name: 'Smithing Forge & Anvil',
        station: BlockType.WORKBENCH,
        ingredients: [
          { blockType: BlockType.COBBLESTONE, count: 4, name: 'Cobblestone' },
          { blockType: BlockType.IRON_ORE, count: 2, name: 'Iron Ore' }
        ],
        resultType: 'item',
        resultBlock: BlockType.SMITHING_FORGE,
        resultCount: 1,
        description: 'Required to smelt iron ingots and forge Tier 1 Adventurer weapons.'
      },
      {
        id: 'armor_station_block',
        name: 'Armor Fitting Station',
        station: BlockType.WORKBENCH,
        ingredients: [
          { blockType: BlockType.PLANKS, count: 4, name: 'Planks' },
          { blockType: BlockType.IRON_ORE, count: 2, name: 'Iron Ore' }
        ],
        resultType: 'item',
        resultBlock: BlockType.ARMOR_STATION,
        resultCount: 1,
        description: 'Required to forge and fit modular armor pieces, capes, and greatswords.'
      },
      {
        id: 'nether_altar_block',
        name: 'Arcane Nether Altar',
        station: BlockType.WORKBENCH,
        ingredients: [
          { blockType: BlockType.NETHER_STONE, count: 4, name: 'Ruin Stone' },
          { blockType: BlockType.CORRUPTED_ORE, count: 2, name: 'Corrupted Ore' }
        ],
        resultType: 'item',
        resultBlock: BlockType.NETHER_ALTAR,
        resultCount: 1,
        description: 'Required to forge Tier 3 Nether Shadow Lord gear.'
      },
      {
        id: 'cinderdune_venom_staff',
        name: 'Cinderdune Venom Staff',
        station: BlockType.WORKBENCH,
        ingredients: [
          { blockType: BlockType.DUNESTING_BARB, count: 2, name: 'Dunesting Barb' },
          { blockType: BlockType.PETRIFIED_SUNWOOD, count: 2, name: 'Petrified Sunwood' },
          { blockType: BlockType.SUNSTONE_ORE, count: 1, name: 'Sunstone Ore' }
        ],
        resultType: 'item',
        resultBlock: BlockType.DUNESTING_BARB,
        resultCount: 1,
        description: 'Mage staff forged from venom barbs and petrified sunwood for casting venom spells.'
      },
      {
        id: 'venomous_mana_elixir',
        name: 'Venomous Mana Elixir',
        station: BlockType.WORKBENCH,
        ingredients: [
          { blockType: BlockType.DUNESTING_BARB, count: 1, name: 'Dunesting Barb' },
          { blockType: BlockType.DESERT_BLOOM, count: 2, name: 'Desert Bloom' },
          { blockType: BlockType.OASIS_WATER, count: 1, name: 'Oasis Water' }
        ],
        resultType: 'item',
        resultBlock: BlockType.DUNESTING_BARB,
        resultCount: 1,
        description: 'Distilled venom elixir restoring +60 Mana.'
      },

      // 2. SMITHING FORGE RECIPES
      {
        id: 'iron_broadsword',
        name: 'Tier 1: Iron Broadsword',
        station: BlockType.SMITHING_FORGE,
        ingredients: [
          { blockType: BlockType.IRON_ORE, count: 3, name: 'Iron Ore' },
          { blockType: BlockType.PLANKS, count: 1, name: 'Planks' }
        ],
        resultType: 'armor',
        armorTier: 'iron',
        showWeapon: true,
        showCape: false,
        description: 'Forges & equips a 1H Iron Broadsword (Tier 1 Weapon).'
      },

      // 3. ARMOR FITTING STATION RECIPES
      {
        id: 'iron_adventurer_armor',
        name: 'Tier 1: Iron Adventurer Suit',
        station: BlockType.ARMOR_STATION,
        ingredients: [
          { blockType: BlockType.IRON_ORE, count: 5, name: 'Iron Ore' }
        ],
        resultType: 'armor',
        armorTier: 'iron',
        showWeapon: true,
        showCape: false,
        description: 'Forges & equips Iron Chestplate & Helmet (Tier 1).'
      },
      {
        id: 'super_knight_armor',
        name: 'Tier 2: Super Knight Armor',
        station: BlockType.ARMOR_STATION,
        ingredients: [
          { blockType: BlockType.IRON_ORE, count: 8, name: 'Iron Ore' },
          { blockType: BlockType.GOLD_ORE, count: 4, name: 'Gold Ore' }
        ],
        resultType: 'armor',
        armorTier: 'super_knight',
        showWeapon: true,
        showCape: true,
        description: 'Forges & equips heavy steel plate armor, gold trim, pauldrons & cyan gem core!'
      },
      {
        id: 'super_knight_greatsword',
        name: 'Tier 2: Glowing Greatsword',
        station: BlockType.ARMOR_STATION,
        ingredients: [
          { blockType: BlockType.IRON_ORE, count: 6, name: 'Iron Ore' },
          { blockType: BlockType.GOLD_ORE, count: 2, name: 'Gold Ore' },
          { blockType: BlockType.CORRUPTED_ORE, count: 1, name: 'Corrupted Ore' }
        ],
        resultType: 'armor',
        armorTier: 'super_knight',
        showWeapon: true,
        showCape: true,
        description: 'Forges & equips the 3D Greatsword with glowing cyan energy core!'
      },
      {
        id: 'flowing_cape',
        name: 'Flowing Knight Cape',
        station: BlockType.ARMOR_STATION,
        ingredients: [
          { blockType: BlockType.OAK_LEAVES, count: 4, name: 'Leaves / Fabric' },
          { blockType: BlockType.GOLD_ORE, count: 1, name: 'Gold Ore' }
        ],
        resultType: 'armor',
        armorTier: 'super_knight',
        showWeapon: true,
        showCape: true,
        description: 'Tailors & equips a back-mounted flowing navy cape!'
      },
      {
        id: 'dunesting_chitin_shield',
        name: 'Dunesting Chitin Shield',
        station: BlockType.ARMOR_STATION,
        ingredients: [
          { blockType: BlockType.DUNESTING_SHELL, count: 4, name: 'Dunesting Shell' },
          { blockType: BlockType.DUNESTING_PINCER_CLAW, count: 2, name: 'Dunesting Pincer Claw' },
          { blockType: BlockType.ANIMAL_HIDE, count: 1, name: 'Animal Hide' }
        ],
        resultType: 'armor',
        armorTier: 'super_knight',
        showWeapon: true,
        showCape: true,
        description: 'Forges & equips a hardened desert chitin shield (+30 Defense).'
      },

      // 4. NETHER ALTAR RECIPES
      {
        id: 'nether_shadow_armor',
        name: 'Tier 3: Nether Shadow Armor',
        station: BlockType.NETHER_ALTAR,
        ingredients: [
          { blockType: BlockType.RUINED_PLANKS, count: 6, name: 'Ruined Planks' },
          { blockType: BlockType.CORRUPTED_ORE, count: 6, name: 'Corrupted Ore' }
        ],
        resultType: 'armor',
        armorTier: 'nether_lord',
        showWeapon: true,
        showCape: true,
        description: 'Infuses obsidian armor plates with crimson trim and fiery gem core!'
      },
      {
        id: 'nether_energy_blade',
        name: 'Tier 3: Nether Energy Blade',
        station: BlockType.NETHER_ALTAR,
        ingredients: [
          { blockType: BlockType.NETHER_STONE, count: 4, name: 'Ruin Stone' },
          { blockType: BlockType.CORRUPTED_ORE, count: 4, name: 'Corrupted Ore' }
        ],
        resultType: 'armor',
        armorTier: 'nether_lord',
        showWeapon: true,
        showCape: true,
        description: 'Forges the endgame Nether Energy Greatsword with red glowing rune blade!'
      }
    ];

    const currentStationRecipes = recipes.filter(r => r.station === stationType);
    gridEl.innerHTML = '';

    currentStationRecipes.forEach(recipe => {
      const card = document.createElement('div');
      card.style.background = 'rgba(0,0,0,0.6)';
      card.style.border = '1px solid #444';
      card.style.borderRadius = '6px';
      card.style.padding = '10px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';

      let canCraft = true;
      let ingHtml = '<div style="font-size: 11px; color: #aaa; margin: 4px 0;">Ingredients: ';
      recipe.ingredients.forEach((ing, idx) => {
        const has = this.countResource(ing.blockType);
        const met = has >= ing.count;
        if (!met) canCraft = false;
        ingHtml += `<span style="color: ${met ? '#4ade80' : '#f87171'}">${ing.name} (${has}/${ing.count})</span>${idx < recipe.ingredients.length - 1 ? ', ' : ''}`;
      });
      ingHtml += '</div>';

      card.innerHTML = `
        <div>
          <div style="font-weight: bold; color: #fbbf24; font-size: 13px;">${recipe.name}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${recipe.description}</div>
          ${ingHtml}
        </div>
        <button class="btn-craft" style="margin-top: 8px; padding: 6px; border-radius: 4px; background: ${canCraft ? '#16a34a' : '#334155'}; color: #fff; border: 0; cursor: ${canCraft ? 'pointer' : 'not-allowed'}; font-weight: bold; font-size: 11px;" ${canCraft ? '' : 'disabled'}>
          ${canCraft ? '▶ CRAFT & EQUIP' : 'MISSING MATERIALS'}
        </button>
      `;

      const btnCraft = card.querySelector('.btn-craft') as HTMLButtonElement;
      if (canCraft && btnCraft) {
        btnCraft.addEventListener('click', () => {
          // Deduct ingredients
          recipe.ingredients.forEach(ing => {
            this.consumeResourceCount(ing.blockType, ing.count);
          });

          if (recipe.resultType === 'item' && recipe.resultBlock) {
            this.addResource(recipe.resultBlock, recipe.resultCount || 1);
            this.sound.playBlockPlace();
          } else if (recipe.resultType === 'armor' && recipe.armorTier && settingsManagerCallback) {
            settingsManagerCallback((s) => {
              s.armorTier = recipe.armorTier;
              s.showWeapon = recipe.showWeapon;
              s.showCape = recipe.showCape;
            });
            this.sound.playBlockPlace();
          }

          // Re-render station recipes to update ingredients count
          this.openWorkstation(stationType, settingsManagerCallback);
        });
      }

      gridEl.appendChild(card);
    });

    overlay.classList.remove('hidden');
    document.exitPointerLock();

    const closeHandler = () => {
      overlay.classList.add('hidden');
      this.input.requestPointerLock();
      btnClose?.removeEventListener('click', closeHandler);
    };

    btnClose?.addEventListener('click', closeHandler);
  }

  public closeWorkstation(): void {
    const overlay = document.getElementById('workstation-overlay');
    if (overlay) overlay.classList.add('hidden');
    this.input.requestPointerLock();
  }

  private currentBannerBiome: string | null = null;
  private bannerTimer: number | null = null;
  private lastNotificationTimes: Map<string, number> = new Map();

  public showNotification(message: string): void {
    const now = performance.now();
    const lastTime = this.lastNotificationTimes.get(message) || 0;
    if (now - lastTime < 1500) {
      return;
    }
    this.lastNotificationTimes.set(message, now);

    let container = document.getElementById('toast-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-notification-container';
      container.style.position = 'fixed';
      container.style.bottom = '90px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.zIndex = '10000';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.background = 'rgba(15, 23, 42, 0.90)';
    toast.style.color = '#fbbf24';
    toast.style.border = '1px solid #eab308';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '6px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.4)';
    toast.style.backdropFilter = 'blur(6px)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.innerText = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2200);
  }

  public showErrorToast(message: string, durationMs: number = 3600): void {
    let container = document.getElementById('toast-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-notification-container';
      container.style.position = 'fixed';
      container.style.bottom = '90px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.zIndex = '10000';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.background = 'rgba(26, 7, 7, 0.95)';
    toast.style.color = '#fca5a5';
    toast.style.border = '1.5px solid #ef4444';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '12px';
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 4px 20px rgba(239, 68, 68, 0.5), inset 0 0 10px rgba(239, 68, 68, 0.2)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.innerHTML = `<span style="margin-right: 8px;">⚠️</span> ${message}`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, durationMs);
  }

  public showBiomeBanner(biomeKey: 'grove' | 'frost' | 'ruins' | 'sunscorched' | 'rainforest'): void {
    if (this.currentBannerBiome === biomeKey) return;
    this.currentBannerBiome = biomeKey;

    const bannerContainer = document.getElementById('biome-banner-container');
    const bannerCard = document.getElementById('biome-banner-card');
    const bannerIcon = document.getElementById('biome-banner-icon');
    const bannerTitle = document.getElementById('biome-banner-title');
    const bannerSubtitle = document.getElementById('biome-banner-subtitle');

    if (!bannerContainer || !bannerCard || !bannerIcon || !bannerTitle || !bannerSubtitle) return;

    const config: Record<string, { title: string; subtitle: string; icon: string; accent: string; glow: string }> = {
      grove: {
        title: 'Emerald Grove',
        subtitle: 'Vibrant Overworld Canopy & Gem-Toned Flora',
        icon: '🌲',
        accent: '#4ade80',
        glow: 'rgba(74, 222, 128, 0.35)',
      },
      rainforest: {
        title: 'Mossveil Jungle',
        subtitle: 'Ancient Canopy, Humid Mud & Tangled Thorns',
        icon: '🌿',
        accent: '#10b981',
        glow: 'rgba(16, 185, 129, 0.4)',
      },
      frost: {
        title: 'Frostvale Reach',
        subtitle: 'Glacial Permafrost, Eerie Mists & Sub-Zero Peaks',
        icon: '❄️',
        accent: '#38bdf8',
        glow: 'rgba(56, 189, 248, 0.35)',
      },
      sunscorched: {
        title: 'Cinderdune Wastes',
        subtitle: 'Arid Shifting Sands & Ancient Ruined Lore',
        icon: '🏜️',
        accent: '#fbbf24',
        glow: 'rgba(251, 191, 36, 0.35)',
      },
      ruins: {
        title: 'Ashen Ruins',
        subtitle: 'Volcanic Obsidian, Cinder Soil & Fiery Spire',
        icon: '🔥',
        accent: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.4)',
      },
      sky: {
        title: 'Windmere Heights',
        subtitle: 'Cloud Platforms, Nimbus Mount & Twisting Vine Tower',
        icon: '☁️',
        accent: '#a78bfa',
        glow: 'rgba(167, 139, 250, 0.4)',
      },
    };

    const data = config[biomeKey] || config.grove;

    bannerIcon.innerText = data.icon;
    bannerTitle.innerText = data.title;
    bannerSubtitle.innerText = data.subtitle;

    bannerCard.style.setProperty('--biome-accent', data.accent);
    bannerCard.style.setProperty('--biome-glow', data.glow);

    if (this.bannerTimer !== null) {
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }

    bannerContainer.classList.remove('hidden');
    bannerContainer.classList.remove('visible');
    void bannerContainer.offsetWidth; // Force CSS reflow
    bannerContainer.classList.add('visible');

    this.bannerTimer = window.setTimeout(() => {
      bannerContainer.classList.remove('visible');
      bannerContainer.classList.add('hidden');
      this.bannerTimer = null;
    }, 3200);
  }

  public updateCompass(
    yawRad: number,
    px: number,
    py: number,
    pz: number,
    groundBlockName?: string,
    deathPos?: THREE.Vector3 | null
  ): void {
    // Update Coordinates readout
    const coordX = document.getElementById('coord-x');
    const coordY = document.getElementById('coord-y');
    const coordZ = document.getElementById('coord-z');
    const groundInfo = document.getElementById('compass-ground-info');
    if (coordX) coordX.innerText = Math.round(px).toString();
    if (coordY) coordY.innerText = Math.round(py).toString();
    if (coordZ) coordZ.innerText = Math.round(pz).toString();
    if (groundInfo) {
      groundInfo.innerText = groundBlockName ? ` • 👣 ${groundBlockName}` : '';
    }

    // Render Canvas Compass Tape
    const canvas = document.getElementById('compass-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;

    ctx.clearRect(0, 0, width, height);

    // Convert Yaw to 0-360 degrees (0 = North)
    let headingDeg = ((-yawRad * (180 / Math.PI)) % 360 + 360) % 360;

    const pxPerDeg = 2.4;
    const rangeDeg = width / pxPerDeg;

    const startDeg = Math.floor((headingDeg - rangeDeg / 2) / 15) * 15;
    const endDeg = Math.ceil((headingDeg + rangeDeg / 2) / 15) * 15;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let deg = startDeg; deg <= endDeg; deg += 15) {
      const normDeg = (deg % 360 + 360) % 360;
      const diff = deg - headingDeg;
      const x = centerX + diff * pxPerDeg;

      if (x < 0 || x > width) continue;

      const isCardinal = (normDeg % 90 === 0);
      const isIntercardinal = (normDeg % 45 === 0 && !isCardinal);

      ctx.beginPath();
      ctx.moveTo(x, 0);
      if (isCardinal) {
        ctx.lineTo(x, 9);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
      } else if (isIntercardinal) {
        ctx.lineTo(x, 7);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.lineTo(x, 5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      let label = '';
      let color = '#94a3b8';
      let font = '10px "Press Start 2P", monospace';

      if (normDeg === 0) {
        label = 'N';
        color = '#ef4444'; // Red North
        font = 'bold 11px "Press Start 2P", monospace';
      } else if (normDeg === 45) {
        label = 'NE';
      } else if (normDeg === 90) {
        label = 'E';
        color = '#4ade80'; // Emerald East
        font = 'bold 11px "Press Start 2P", monospace';
      } else if (normDeg === 135) {
        label = 'SE';
      } else if (normDeg === 180) {
        label = 'S';
        color = '#fbbf24'; // Amber South
        font = 'bold 11px "Press Start 2P", monospace';
      } else if (normDeg === 225) {
        label = 'SW';
      } else if (normDeg === 270) {
        label = 'W';
        color = '#38bdf8'; // Blue West
        font = 'bold 11px "Press Start 2P", monospace';
      } else if (normDeg === 315) {
        label = 'NW';
      }

      if (label) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(label, x, 12);
      }
    }

    // Render 💀 Death Waypoint on Compass Tape if active
    if (deathPos) {
      const dx = deathPos.x - px;
      const dz = deathPos.z - pz;
      const distToDeath = Math.hypot(dx, dz);

      if (distToDeath > 1.5) {
        const targetBearingRad = Math.atan2(dx, -dz);
        const targetBearingDeg = ((targetBearingRad * (180 / Math.PI)) % 360 + 360) % 360;

        let diff = targetBearingDeg - headingDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        const markerX = centerX + diff * pxPerDeg;

        if (markerX >= 18 && markerX <= width - 18) {
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('💀', markerX, 0);

          ctx.font = '7px "Press Start 2P", monospace';
          ctx.fillStyle = '#f87171';
          ctx.fillText(`${Math.round(distToDeath)}m`, markerX, 14);
        } else if (markerX < 18) {
          ctx.font = '8px "Press Start 2P", monospace';
          ctx.fillStyle = '#f87171';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('◀💀', 6, 14);
        } else {
          ctx.font = '8px "Press Start 2P", monospace';
          ctx.fillStyle = '#f87171';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText('💀▶', width - 6, 14);
        }
      }
    }

    // Left and Right Edge Vignette Gradient (Smooth Tape Fading)
    const fadeGrad = ctx.createLinearGradient(0, 0, width, 0);
    fadeGrad.addColorStop(0, 'rgba(15, 23, 42, 1)');
    fadeGrad.addColorStop(0.12, 'rgba(15, 23, 42, 0)');
    fadeGrad.addColorStop(0.88, 'rgba(15, 23, 42, 0)');
    fadeGrad.addColorStop(1, 'rgba(15, 23, 42, 1)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, 0, width, height);
  }

  public showSettingsModal(isPreGame: boolean, gamemode: 'survival' | 'creative' = 'survival'): void {
    const modal = document.getElementById('menu-settings-modal');
    if (!modal) return;

    const tabClient = document.getElementById('tab-client-settings');
    const tabKeybind = document.getElementById('tab-keybind-settings');
    const tabWorld = document.getElementById('tab-world-settings');
    const panelClient = document.getElementById('panel-client-settings');
    const panelKeybind = document.getElementById('panel-keybind-settings');
    const panelWorld = document.getElementById('panel-world-settings');

    // Default active tab to Client Settings
    tabClient?.classList.add('active');
    tabKeybind?.classList.remove('active');
    tabWorld?.classList.remove('active');
    panelClient?.classList.remove('hidden');
    panelKeybind?.classList.add('hidden');
    panelWorld?.classList.add('hidden');

    if (isPreGame) {
      // Main Menu: Both Client Settings and World Rules are visible
      if (tabWorld) tabWorld.style.display = 'inline-block';
    } else {
      // In-game: Check game mode restrictions
      if (gamemode === 'survival') {
        // Survival mode: hide World Rules tab to prevent altering rules mid-game
        if (tabWorld) tabWorld.style.display = 'none';
      } else {
        // Creative mode: allow accessing World Rules tab
        if (tabWorld) tabWorld.style.display = 'inline-block';
      }
    }

    // Sync UI input elements with current saved settings
    const settings = SettingsManager.load();
    SettingsManager.syncUI(settings);
    SettingsManager.syncKeybindingsUI(settings, (action, newCode) => {
      this.input.keybindings[action] = newCode;
      SettingsManager.save(settings);
    });

    modal.classList.remove('hidden');
  }

  public showInteractPrompt(actionText: string, keyName: string = 'E'): void {
    const prompt = document.getElementById('interact-prompt');
    const textEl = document.getElementById('interact-prompt-text');
    const keyEl = document.getElementById('interact-prompt-key');
    if (prompt && textEl) {
      textEl.innerText = actionText;
      if (keyEl) keyEl.innerText = keyName;
      prompt.classList.remove('hidden');
    }
  }

  public hideInteractPrompt(): void {
    const prompt = document.getElementById('interact-prompt');
    if (prompt && !prompt.classList.contains('hidden')) {
      prompt.classList.add('hidden');
    }
  }

  public updateDayNightTimer(timeInfo: DayNightTimeInfo): void {
    const iconEl = document.getElementById('time-icon');
    const dayEl = document.getElementById('time-day');
    const clockEl = document.getElementById('time-clock');
    const countdownEl = document.getElementById('time-countdown');
    const widgetEl = document.getElementById('day-night-widget');

    if (iconEl && iconEl.innerText !== timeInfo.phaseIcon) {
      iconEl.innerText = timeInfo.phaseIcon;
    }
    if (dayEl) {
      dayEl.innerText = `Day ${timeInfo.day}`;
    }
    if (clockEl) {
      clockEl.innerText = timeInfo.clockTime;
    }
    if (countdownEl) {
      countdownEl.innerText = timeInfo.countdownText;
    }
    if (widgetEl) {
      const targetClass = `day-night-badge phase-${timeInfo.phaseName.toLowerCase()}`;
      if (widgetEl.className !== targetClass) {
        widgetEl.className = targetClass;
      }
    }
  }
}


