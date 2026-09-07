import { TitleScreenTeardownRegistry } from './TitleScreenTeardownRegistry';

export class TitleParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spriteCache: Map<string, HTMLCanvasElement> = new Map();
  private particles: Array<{
    x: number;
    y: number;
    size: number;
    vx: number;
    vy: number;
    alpha: number;
    maxAlpha: number;
    color: string;
    life: number;
    maxLife: number;
  }> = [];
  private isRunning: boolean = true;
  private isDisposed: boolean = false;
  private animFrameId: number | null = null;
  private onResizeHandler = () => this.resize();
  private unregisterTeardown?: () => void;

  constructor(canvasId: string) {
    const el = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!el) {
      throw new Error(`Canvas #${canvasId} not found`);
    }
    this.canvas = el;
    this.ctx = el.getContext('2d')!;

    // Pre-render radial gradient particle sprites to offscreen canvases
    const colors = ['#f59e0b', '#ef4444', '#a855f7', '#facc15', '#fb923c'];
    for (const c of colors) {
      this.spriteCache.set(c, this.createParticleSprite(c));
    }

    this.resize();
    window.addEventListener('resize', this.onResizeHandler);

    this.initParticles(60, colors);
    this.animate();

    // Auto-register with global title screen teardown registry
    this.unregisterTeardown = TitleScreenTeardownRegistry.register(() => {
      this.dispose();
    });
  }

  private createParticleSprite(hexColor: string): HTMLCanvasElement {
    const size = 64;
    const half = size / 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    const offCtx = offCanvas.getContext('2d')!;

    const grad = offCtx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.25, hexColor);
    grad.addColorStop(0.65, hexColor);
    grad.addColorStop(1.0, 'transparent');

    offCtx.fillStyle = grad;
    offCtx.beginPath();
    offCtx.arc(half, half, half, 0, Math.PI * 2);
    offCtx.fill();

    return offCanvas;
  }

  private resize(): void {
    if (this.isDisposed) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private initParticles(count: number, colors: string[]): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        size: 1.5 + Math.random() * 3.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.4 - Math.random() * 0.8,
        alpha: Math.random() * 0.8,
        maxAlpha: 0.4 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: Math.random() * 200,
        maxLife: 150 + Math.random() * 250,
      });
    }
  }

  private animate = (): void => {
    if (!this.isRunning || this.isDisposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const p of this.particles) {
      p.x += p.vx + Math.sin(p.y * 0.01) * 0.2; // Gentle floating wind sway
      p.y += p.vy;
      p.life++;

      // Fade in and out
      if (p.life < 40) {
        p.alpha = (p.life / 40) * p.maxAlpha;
      } else if (p.life > p.maxLife - 40) {
        p.alpha = ((p.maxLife - p.life) / 40) * p.maxAlpha;
      }

      // Respawn at bottom when expired or out of bounds
      if (p.life >= p.maxLife || p.y < -10 || p.x < -10 || p.x > this.canvas.width + 10) {
        p.x = Math.random() * this.canvas.width;
        p.y = this.canvas.height + 10;
        p.life = 0;
        p.alpha = 0;
      }

      const sprite = this.spriteCache.get(p.color);
      if (sprite) {
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        const drawSize = p.size * 4;
        this.ctx.drawImage(
          sprite,
          p.x - drawSize * 0.5,
          p.y - drawSize * 0.5,
          drawSize,
          drawSize
        );
      }
    }

    this.ctx.globalAlpha = 1.0;
  };

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Disposes the particle system, cancels animation frame, unbinds window listeners,
   * and clears offscreen canvas sprite caches.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stop();

    window.removeEventListener('resize', this.onResizeHandler);

    if (this.unregisterTeardown) {
      this.unregisterTeardown();
      this.unregisterTeardown = undefined;
    }

    this.particles = [];
    this.spriteCache.clear();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    console.log('[TitleParticleSystem] Disposed cleanly.');
  }
}
