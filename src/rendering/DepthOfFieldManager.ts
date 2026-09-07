import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export type DoFQuality = 'off' | 'subtle' | 'cinematic';

/**
 * Custom AAA Cinematic Depth of Field Shader
 * Features:
 * - 1st-person foreground viewmodel protection (hands/tools remain 100% razor sharp within 2.2m)
 * - 24-Sample Vogel Disk (Fibonacci golden-angle spiral) with screen-space rotary jitter
 * - Interleaved Gradient Noise (IGN) eliminating all multi-tap ghosting/echo artifacts
 * - Specular highlight bokeh boost (glowing circular disks on sunlight, water reflections, emissives)
 * - Subtle cine-lens chromatic dispersion (Cooke / Anamorphic optical fringing)
 * - Depth-aware bilateral weighting preventing foreground edge bleed/halo smears
 * - Isolated depth target preventing WebGL framebuffer feedback loops
 */
const CinematicDoFShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    focus: { value: 20.0 },
    focalRange: { value: 16.0 },
    maxblur: { value: 0.0035 },
    aspect: { value: 1.0 },
    nearClip: { value: 0.1 },
    farClip: { value: 1000.0 },
    isThirdPerson: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,

  fragmentShader: /* glsl */ `
    #include <common>
    #include <packing>

    varying vec2 vUv;

    uniform sampler2D tColor;
    uniform sampler2D tDepth;

    uniform float focus;
    uniform float focalRange;
    uniform float maxblur;
    uniform float aspect;
    uniform float nearClip;
    uniform float farClip;
    uniform float isThirdPerson;

    float getDepth( const in vec2 screenPosition ) {
      return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
    }

    float getViewZ( const in float depth ) {
      return perspectiveDepthToViewZ( depth, nearClip, farClip );
    }

    // Interleaved Gradient Noise (IGN) for high-frequency screen-space rotary dither
    // Converts discrete sample rings into buttery, continuous, filmic optical dispersion
    float IGN(vec2 p) {
      vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
      return fract(magic.z * fract(dot(p, magic.xy)));
    }

    // Physical Circle of Confusion (CoC)
    float computeCoC(float dist) {
      // 1. First-Person Viewmodel Protection:
      // Player arm, held weapon, tools, torch (< 2.2m) are hard-locked to 0.0 blur (100% crisp)
      if (isThirdPerson < 0.5 && dist < 2.2) {
        return 0.0;
      }

      float nearLimit = max(2.2, focus - focalRange);
      float farLimit = focus + focalRange;

      if (dist >= nearLimit && dist <= farLimit) {
        return 0.0; // In-focus optical corridor
      } else if (dist > farLimit) {
        // Far field: Smooth logarithmic/hyperfocal progression
        // Mid-distance foliage softens naturally, distant mountains/sky become dreamy bokeh
        float farDelta = dist - farLimit;
        float farFactor = clamp(farDelta / (focalRange * 1.6 + 32.0), 0.0, 1.0);
        return smoothstep(0.0, 1.0, farFactor);
      } else {
        // Near field (in 3rd person or beyond 2.2m)
        float nearDelta = nearLimit - dist;
        float nearFactor = clamp(nearDelta / max(1.0, nearLimit - 2.2), 0.0, 1.0);
        return smoothstep(0.0, 1.0, nearFactor) * 0.75;
      }
    }

    void main() {
      float centerDepth = getDepth( vUv );
      float centerViewZ = getViewZ( centerDepth );
      float centerDist = -centerViewZ; // Center pixel distance in meters

      float centerCoC = computeCoC( centerDist );

      vec2 aspectCorrect = vec2( 1.0, aspect );
      vec2 maxRadius = aspectCorrect * (centerCoC * maxblur);

      // Screen-space rotary jitter angle using IGN
      float ditherAngle = IGN(gl_FragCoord.xy) * 6.28318530718;
      float sinA = sin(ditherAngle);
      float cosA = cos(ditherAngle);
      mat2 rotMat = mat2(cosA, -sinA, sinA, cosA);

      vec4 accumColor = vec4(0.0);
      float totalWeight = 0.0;

      // 24-Sample Vogel Disk (Fibonacci Golden Angle Spiral with Rotary Jitter)
      // Completely uniform execution across all fragment warps (0 Direct3D X3595 warnings)
      const int SAMPLES = 24;
      const float GOLDEN_ANGLE = 2.39996323;

      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(SAMPLES));
        float theta = fi * GOLDEN_ANGLE;
        
        vec2 unrotatedOffset = vec2(cos(theta), sin(theta)) * r;
        vec2 sampleOffset = (rotMat * unrotatedOffset) * maxRadius;

        // Subtle Cine-Lens Chromatic Dispersion (Cooke / Anamorphic optical fringing)
        vec2 offsetR = sampleOffset * 1.012;
        vec2 offsetG = sampleOffset;
        vec2 offsetB = sampleOffset * 0.988;

        float sampleR = texture2D(tColor, vUv + offsetR).r;
        vec4 sampleG = texture2D(tColor, vUv + offsetG);
        float sampleB = texture2D(tColor, vUv + offsetB).b;
        vec3 sampleRgb = vec3(sampleR, sampleG.g, sampleB);

        // Depth-aware Bilateral Sample Weighting (prevents sharp foreground bleeding into background blur)
        float sampleDepth = getDepth(vUv + offsetG);
        float sampleDist = -getViewZ(sampleDepth);
        float sampleCoC = computeCoC(sampleDist);

        // Highlight Specular Bokeh Boost (gives sun glints and emissives glowing circular disks)
        float lum = dot(sampleRgb, vec3(0.2126, 0.7152, 0.0722));
        float highlightBoost = 1.0 + pow(max(0.0, lum - 0.45) / 0.55, 2.2) * 2.8;

        // Continuous bilateral suppression without branch divergence
        float depthDistDiff = centerDist - sampleDist;
        float isForeground = step(1.5, depthDistDiff) * step(sampleCoC, 0.3);
        float depthBleedSuppression = mix(1.0, clamp((sampleDist - 2.0) / 4.0, 0.08, 1.0), isForeground);

        float weight = highlightBoost * depthBleedSuppression;

        accumColor += vec4(sampleRgb * weight, sampleG.a * weight);
        totalWeight += weight;
      }

      vec4 finalBokeh = accumColor / max(totalWeight, 0.0001);

      // Smooth optical blend between center color and bokeh composite
      float blendFactor = clamp(centerCoC * 1.8, 0.0, 1.0);
      vec4 centerColor = texture2D( tColor, vUv );
      gl_FragColor = mix(centerColor, finalBokeh, blendFactor);
    }
  `,
};

class CinematicDoFPass extends Pass {
  public uniforms: Record<string, { value: any }>;
  public materialDoF: THREE.ShaderMaterial;
  public materialDepth: THREE.MeshDepthMaterial;
  public renderTargetDepth: THREE.WebGLRenderTarget;
  public fsQuad: FullScreenQuad;
  private _oldClearColor: THREE.Color = new THREE.Color();

  constructor(
    public scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
    params: { focus?: number; focalRange?: number; maxblur?: number; isThirdPerson?: number } = {}
  ) {
    super();

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Isolated depth render target
    this.renderTargetDepth = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
    });
    this.renderTargetDepth.texture.name = 'CinematicDoF.depth';

    this.materialDepth = new THREE.MeshDepthMaterial();
    this.materialDepth.depthPacking = THREE.RGBADepthPacking;
    this.materialDepth.blending = THREE.NoBlending;

    this.uniforms = THREE.UniformsUtils.clone(CinematicDoFShader.uniforms);
    this.uniforms.tDepth.value = this.renderTargetDepth.texture;
    this.uniforms.focus.value = params.focus ?? 20.0;
    this.uniforms.focalRange.value = params.focalRange ?? 16.0;
    this.uniforms.maxblur.value = params.maxblur ?? 0.0035;
    this.uniforms.aspect.value = camera.aspect;
    this.uniforms.nearClip.value = camera.near;
    this.uniforms.farClip.value = camera.far;
    this.uniforms.isThirdPerson.value = params.isThirdPerson ?? 0.0;

    this.materialDoF = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: CinematicDoFShader.vertexShader,
      fragmentShader: CinematicDoFShader.fragmentShader,
    });

    this.fsQuad = new FullScreenQuad(this.materialDoF);
  }

  public render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // 1. Render depth into isolated depth target
    this.scene.overrideMaterial = this.materialDepth;

    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setClearColor(0xffffff);
    renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this.renderTargetDepth);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // 2. Render DoF composite
    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.nearClip.value = this.camera.near;
    this.uniforms.farClip.value = this.camera.far;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      renderer.clear();
      this.fsQuad.render(renderer);
    }

    // 3. Restore previous renderer state
    this.scene.overrideMaterial = null;
    renderer.setClearColor(this._oldClearColor);
    renderer.setClearAlpha(oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  public setSize(width: number, height: number): void {
    this.uniforms.aspect.value = width / height;
    this.renderTargetDepth.setSize(width, height);
  }

  public dispose(): void {
    this.renderTargetDepth.dispose();
    this.materialDepth.dispose();
    this.materialDoF.dispose();
    this.fsQuad.dispose();
  }
}

export class DepthOfFieldManager {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private dofPass: CinematicDoFPass | null = null;
  private outputPass: OutputPass | null = null;

  public enabled: boolean = true;
  public quality: DoFQuality = 'subtle';
  public intensity: number = 35; // 0 to 100 slider intensity

  // Physical Lens Autofocus Simulation
  private currentFocus: number = 20.0;
  private targetFocus: number = 20.0;
  private lastNearTargetFocus: number = 20.0;
  private openSkyHysteresisTimer: number = 0.0;
  private static readonly OPEN_SKY_DEBOUNCE_SEC: number = 0.25;
  private focusLerpSpeed: number = 5.0; // Smooth physical lens racking (m/s)

  // Quality presets tailored for crisp gameplay with soft distance atmospheric blur
  private readonly presets: Record<DoFQuality, { maxblur: number; focalRange1st: number; focalRange3rd: number }> = {
    off: { maxblur: 0.0, focalRange1st: 22.0, focalRange3rd: 10.0 },
    subtle: { maxblur: 0.0030, focalRange1st: 18.0, focalRange3rd: 7.0 },
    cinematic: { maxblur: 0.0055, focalRange1st: 14.0, focalRange3rd: 5.0 },
  };

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera
  ) {
    this.initComposer();
  }

  private initComposer(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 1. Base Scene Render Pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 2. Custom Cinematic Bokeh Depth of Field Pass
    this.dofPass = new CinematicDoFPass(this.scene, this.camera, {
      focus: this.currentFocus,
      focalRange: this.presets.subtle.focalRange1st,
      maxblur: this.presets.subtle.maxblur,
      isThirdPerson: 0.0,
    });
    this.composer.addPass(this.dofPass);

    // 3. Color Space & Tone Mapping Output Pass
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /** Update render target and camera aspect when window resizes */
  public setSize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    if (this.dofPass) {
      this.dofPass.setSize(width, height);
    }
  }

  /** Apply continuous slider intensity (0 to 100%) */
  public setIntensity(intensity: number): void {
    this.intensity = Math.min(Math.max(intensity, 0), 100);
    this.enabled = this.intensity > 0;

    if (this.dofPass) {
      const blurFactor = (this.intensity / 100) * 0.0055;
      const dynamicRange = 22.0 - (this.intensity / 100) * 8.0;
      this.dofPass.uniforms.maxblur.value = blurFactor;
      this.dofPass.uniforms.focalRange.value = dynamicRange;
    }
  }

  /** Apply quality preset & toggle state */
  public setQuality(quality: DoFQuality): void {
    this.quality = quality;
    this.enabled = quality !== 'off';

    if (this.dofPass) {
      const preset = this.presets[quality] || this.presets.subtle;
      this.dofPass.uniforms.maxblur.value = preset.maxblur;
      this.dofPass.uniforms.focalRange.value = preset.focalRange1st;
    }
  }

  /**
   * Updates autofocus target based on camera mode and raycasted distance
   * @param dt Delta time
   * @param targetDistance Distance to targeted block/entity (in meters)
   * @param isThirdPerson True if camera is in third-person view
   * @param isUIOpen True if a menu modal is active
   */
  public updateAutofocus(
    dt: number,
    targetDistance: number | null,
    isThirdPerson: boolean,
    isUIOpen: boolean
  ): void {
    if (!this.enabled || !this.dofPass || this.quality === 'off') return;

    const preset = this.presets[this.quality] || this.presets.subtle;

    this.dofPass.uniforms.isThirdPerson.value = isThirdPerson ? 1.0 : 0.0;

    if (isUIOpen) {
      // Pull focus close for gentle background defocus during menus/modal inspection
      this.openSkyHysteresisTimer = 0.0;
      this.targetFocus = 2.0;
      this.dofPass.uniforms.focalRange.value = 1.5;
    } else if (isThirdPerson) {
      // In 3rd Person, lock focus to distance from camera to player character (~4.5m)
      this.openSkyHysteresisTimer = 0.0;
      this.targetFocus = 4.5;
      this.dofPass.uniforms.focalRange.value = preset.focalRange3rd;
    } else if (targetDistance !== null && targetDistance > 0.5) {
      // In 1st Person, rack focus to targeted voxel block, tree, or entity
      this.openSkyHysteresisTimer = 0.0;
      this.targetFocus = Math.min(Math.max(targetDistance, 2.5), 65.0);
      this.lastNearTargetFocus = this.targetFocus;
      const dynamicRange = 22.0 - (this.intensity / 100) * 8.0;
      this.dofPass.uniforms.focalRange.value = dynamicRange;
    } else {
      // Looking into open horizon / sky: apply 0.25s hysteresis to prevent jarring focus popping
      this.openSkyHysteresisTimer += dt;
      if (this.openSkyHysteresisTimer < DepthOfFieldManager.OPEN_SKY_DEBOUNCE_SEC) {
        // Retain prior near-field focus during brief gaps, tree branch glances, or rapid saccades
        this.targetFocus = this.lastNearTargetFocus;
        const dynamicRange = 22.0 - (this.intensity / 100) * 8.0;
        this.dofPass.uniforms.focalRange.value = dynamicRange;
      } else {
        // Sustained open sky / horizon gaze: hyperfocal distance for crisp midground and lush far bokeh
        this.targetFocus = 42.0;
        const dynamicRange = 24.0 - (this.intensity / 100) * 6.0;
        this.dofPass.uniforms.focalRange.value = dynamicRange;
      }
    }

    // Smooth physical lens focus pull (lerp)
    this.currentFocus += (this.targetFocus - this.currentFocus) * Math.min(1.0, dt * this.focusLerpSpeed);

    // Update shader uniforms
    this.dofPass.uniforms.focus.value = this.currentFocus;
    this.dofPass.uniforms.nearClip.value = this.camera.near;
    this.dofPass.uniforms.farClip.value = this.camera.far;
  }

  /**
   * Main render call: uses postprocessing composer when DoF is active,
   * or falls back to native WebGLRenderer for 100% direct rendering when disabled.
   */
  public render(): void {
    if (this.enabled && this.composer && this.quality !== 'off') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    this.dofPass?.dispose();
    this.composer?.dispose();
  }
}
