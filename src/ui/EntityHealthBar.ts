import * as THREE from 'three';

export interface HealthBarOptions {
  name: string;
  icon: string;
  maxHealth: number;
  heightOffset?: number;
  themeColor?: string; // Custom border/title accent (e.g. '#22c55e', '#f59e0b', '#38bdf8')
  scale?: number;
}

const HEALTH_BAR_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  // Hardware GPU Billboard: align quad to face camera view plane automatically
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(
    length(vec3(modelMatrix[0].x, modelMatrix[0].y, modelMatrix[0].z)),
    length(vec3(modelMatrix[1].x, modelMatrix[1].y, modelMatrix[1].z))
  );
  mvPosition.xy += position.xy * scale;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const HEALTH_BAR_FRAGMENT_SHADER = `
uniform sampler2D uMap;
uniform float uHpRatio;
uniform float uGhostRatio;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec4 baseColor = texture2D(uMap, vUv);

  // Health bar fill region in normalized UV coordinates:
  // X: 24px to 488px on 512px width -> [0.046875, 0.953125]
  // Y: 62px to 90px from top on 128px height -> V is [1.0 - 90/128, 1.0 - 62/128] = [0.296875, 0.515625]
  float uMin = 0.046875;
  float uMax = 0.953125;
  float vMin = 0.296875;
  float vMax = 0.515625;

  if (vUv.x >= uMin && vUv.x <= uMax && vUv.y >= vMin && vUv.y <= vMax) {
    float barProgress = (vUv.x - uMin) / (uMax - uMin);
    
    // Ghost damage trailing fill (soft pale glowing amber/yellow)
    if (barProgress <= uGhostRatio && barProgress > uHpRatio) {
      vec4 ghostColor = vec4(0.996, 0.941, 0.541, 0.88);
      baseColor = mix(baseColor, ghostColor, ghostColor.a);
    }
    
    // Active Health Fill (Dynamic green -> amber -> red gradient)
    if (barProgress <= uHpRatio) {
      vec3 hpColor;
      if (uHpRatio > 0.60) {
        hpColor = mix(vec3(0.29, 0.87, 0.50), vec3(0.13, 0.77, 0.37), barProgress / max(uHpRatio, 0.001));
      } else if (uHpRatio > 0.30) {
        hpColor = mix(vec3(0.98, 0.75, 0.14), vec3(0.96, 0.62, 0.04), barProgress / max(uHpRatio, 0.001));
      } else {
        hpColor = mix(vec3(0.97, 0.44, 0.44), vec3(0.94, 0.27, 0.27), barProgress / max(uHpRatio, 0.001));
      }

      // Gloss highlight on top half of the bar
      float vNorm = (vUv.y - vMin) / (vMax - vMin);
      if (vNorm > 0.55) {
        hpColor += vec3(0.20);
      }

      baseColor = vec4(hpColor, 0.95);
    }
  }

  gl_FragColor = vec4(baseColor.rgb, baseColor.a * uOpacity);
}
`;

export class EntityHealthBar {
  private static speciesTextureCache: Map<string, THREE.CanvasTexture> = new Map();
  private static sharedPlaneGeometry: THREE.PlaneGeometry | null = null;

  private parentGroup: THREE.Group;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  private currentHealth: number;
  private maxHealth: number;
  private ghostHealth: number;
  private heightOffset: number;
  private targetScale: number;

  private visibleTimer: number = 0;
  private currentOpacity: number = 0;
  private isDisposed: boolean = false;

  constructor(parentGroup: THREE.Group, options: HealthBarOptions) {
    this.parentGroup = parentGroup;
    this.maxHealth = options.maxHealth;
    this.currentHealth = options.maxHealth;
    this.ghostHealth = options.maxHealth;
    this.heightOffset = options.heightOffset ?? 1.25;
    this.targetScale = options.scale ?? 1.0;

    // 1. Get or create shared static texture for this species
    const speciesKey = `${options.icon}_${options.name}_${options.maxHealth}_${options.themeColor ?? '#fde047'}`;
    let texture = EntityHealthBar.speciesTextureCache.get(speciesKey);
    if (!texture) {
      texture = EntityHealthBar.createSpeciesTexture(options);
      EntityHealthBar.speciesTextureCache.set(speciesKey, texture);
    }

    // 2. Shared Unit Plane Geometry
    if (!EntityHealthBar.sharedPlaneGeometry) {
      EntityHealthBar.sharedPlaneGeometry = new THREE.PlaneGeometry(1.0, 1.0);
    }

    // 3. Lightweight Shader Material (Dynamic Fill via Uniforms)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uHpRatio: { value: 1.0 },
        uGhostRatio: { value: 1.0 },
        uOpacity: { value: 0.0 },
      },
      vertexShader: HEALTH_BAR_VERTEX_SHADER,
      fragmentShader: HEALTH_BAR_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(EntityHealthBar.sharedPlaneGeometry, this.material);
    this.mesh.scale.set(1.4 * this.targetScale, 0.35 * this.targetScale, 1.0);
    this.mesh.position.set(0, this.heightOffset, 0);
    this.mesh.visible = false;

    this.parentGroup.add(this.mesh);
  }

  private static createSpeciesTexture(options: HealthBarOptions): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const padX = 24;
    const barX = padX;
    const barY = 56;
    const barWidth = width - padX * 2;
    const barHeight = 28;
    const radius = 8;
    const themeColor = options.themeColor ?? '#fde047';

    // 1. Sleek Dark Slate Glassmorphic Backdrop
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    EntityHealthBar.drawRoundRect(ctx, barX - 4, barY - 26, barWidth + 8, barHeight + 36, radius + 4);
    ctx.fill();

    ctx.lineWidth = 2.0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.stroke();
    ctx.restore();

    // 2. Entity Title & Icon
    ctx.save();
    ctx.font = 'bold 22px "Outfit", "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = themeColor;
    ctx.fillText(`${options.icon} ${options.name}`, barX + 4, barY - 10);

    // Max HP Label
    ctx.font = 'bold 18px "Outfit", "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`MAX: ${options.maxHealth}`, barX + barWidth - 4, barY - 10);
    ctx.restore();

    // 3. Health Bar Track Background
    ctx.save();
    ctx.fillStyle = '#1e293b';
    EntityHealthBar.drawRoundRect(ctx, barX, barY + 6, barWidth, barHeight, radius);
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
  }

  private static drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  public setHealth(current: number, max?: number): void {
    if (this.isDisposed) return;
    if (max !== undefined) this.maxHealth = max;

    const prev = this.currentHealth;
    this.currentHealth = Math.max(0, Math.min(current, this.maxHealth));

    // When taking damage, trigger visibility timer
    if (this.currentHealth < prev) {
      this.visibleTimer = 6.0; // Stay visible for 6 seconds on hit
    }

    const hpRatio = Math.max(0, Math.min(this.currentHealth / this.maxHealth, 1.0));
    this.material.uniforms.uHpRatio.value = hpRatio;
  }

  public update(dt: number, entityWorldPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    if (this.isDisposed) return;

    // 1. Ghost health catch-up interpolation
    if (this.ghostHealth > this.currentHealth) {
      this.ghostHealth = Math.max(this.currentHealth, this.ghostHealth - dt * (this.maxHealth * 0.45));
      this.material.uniforms.uGhostRatio.value = this.ghostHealth / this.maxHealth;
    } else if (this.ghostHealth < this.currentHealth) {
      this.ghostHealth = this.currentHealth;
      this.material.uniforms.uGhostRatio.value = this.ghostHealth / this.maxHealth;
    }

    // 2. Proximity and Damage Visibility Policy
    const distToPlayer = entityWorldPos.distanceTo(playerPos);
    if (this.visibleTimer > 0) {
      this.visibleTimer -= dt;
    }

    const isProximityActive = distToPlayer <= 10.0;
    const isCombatActive = this.visibleTimer > 0 || this.currentHealth < this.maxHealth;
    const shouldBeVisible = (isProximityActive || isCombatActive) && this.currentHealth > 0 && distToPlayer <= 28.0;

    const targetOpacity = shouldBeVisible ? 1.0 : 0.0;
    this.currentOpacity += (targetOpacity - this.currentOpacity) * Math.min(dt * 6.0, 1.0);

    this.material.uniforms.uOpacity.value = this.currentOpacity;
    this.mesh.visible = this.currentOpacity > 0.01;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.parentGroup.remove(this.mesh);
    this.material.dispose();
  }
}
