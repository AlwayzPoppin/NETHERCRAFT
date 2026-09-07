import * as THREE from 'three';

export interface SkyColors {
  zenithColor: THREE.Color;
  horizonColor: THREE.Color;
  nadirColor: THREE.Color;
  sunPosition: THREE.Vector3;
  moonPosition: THREE.Vector3;
  sunColor: THREE.Color;
  moonColor: THREE.Color;
  starOpacity: number;
  undergroundFactor: number;
}

export class SkyDome {
  private scene: THREE.Scene;
  private skyMesh: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private starPoints: THREE.Points;
  private starMaterial: THREE.PointsMaterial;
  private starGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // --- 1. ATMOSPHERIC SKY GRADIENT DOME ---
    const skyGeo = new THREE.SphereGeometry(450, 32, 24);

    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vNormal = normal;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const fragmentShader = `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uNadirColor;
      uniform vec3 uSunPosition;
      uniform vec3 uMoonPosition;
      uniform vec3 uSunColor;
      uniform vec3 uMoonColor;
      uniform float uUndergroundFactor;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float y = dir.y; // -1 to 1

        // Smooth multi-stop gradient (Zenith -> Horizon -> Nadir)
        vec3 skyColor;
        if (y >= 0.0) {
          // Upper hemisphere (Horizon -> Zenith)
          float h = pow(clamp(y, 0.0, 1.0), 0.55);
          skyColor = mix(uHorizonColor, uZenithColor, h);
        } else {
          // Lower hemisphere (Horizon -> Nadir)
          float h = pow(clamp(-y, 0.0, 1.0), 0.7);
          skyColor = mix(uHorizonColor, uNadirColor, h);
        }

        // Solar Corona Glow (Soft radiant halo around the sun)
        vec3 sunDir = normalize(uSunPosition);
        float sunDot = max(0.0, dot(dir, sunDir));
        float sunGlow = pow(sunDot, 64.0) * 0.9 + pow(sunDot, 12.0) * 0.35 + pow(sunDot, 3.0) * 0.12;
        skyColor += uSunColor * sunGlow;

        // Lunar Corona Glow (Silver radiant halo around the moon)
        vec3 moonDir = normalize(uMoonPosition);
        float moonDot = max(0.0, dot(dir, moonDir));
        float moonGlow = pow(moonDot, 48.0) * 0.6 + pow(moonDot, 8.0) * 0.2;
        skyColor += uMoonColor * moonGlow;

        // Underground occlusion fading
        skyColor = mix(skyColor, uNadirColor, uUndergroundFactor);

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uZenithColor: { value: new THREE.Color(0x1e6bb8) },
        uHorizonColor: { value: new THREE.Color(0x87ceeb) },
        uNadirColor: { value: new THREE.Color(0x0a101d) },
        uSunPosition: { value: new THREE.Vector3(0, 100, 0) },
        uMoonPosition: { value: new THREE.Vector3(0, -100, 0) },
        uSunColor: { value: new THREE.Color(0xffd580) },
        uMoonColor: { value: new THREE.Color(0xd0e0ff) },
        uUndergroundFactor: { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -100; // Deepest background layer
    this.scene.add(this.skyMesh);

    // --- 2. TWINKLING CELESTIAL STARFIELD ---
    this.starGroup = new THREE.Group();
    const starCount = 1400;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    const starColorPalette = [
      new THREE.Color(0xffffff), // Pure white
      new THREE.Color(0xdbeafe), // Diamond blue
      new THREE.Color(0xfef3c7), // Golden warm
      new THREE.Color(0xe0e7ff), // Indigo crystal
      new THREE.Color(0xfbcfe8), // Soft magenta
    ];

    for (let i = 0; i < starCount; i++) {
      // Uniform spherical distribution in upper dome
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 420;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) + 15; // Keep primarily in upper hemisphere
      const z = r * Math.sin(phi) * Math.sin(theta);

      starPositions[i * 3 + 0] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      const col = starColorPalette[Math.floor(Math.random() * starColorPalette.length)];
      const brightness = 0.65 + Math.random() * 0.35;
      starColors[i * 3 + 0] = col.r * brightness;
      starColors[i * 3 + 1] = col.g * brightness;
      starColors[i * 3 + 2] = col.b * brightness;

      starSizes[i] = 1.5 + Math.random() * 2.2;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    this.starMaterial = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starPoints = new THREE.Points(starGeo, this.starMaterial);
    this.starPoints.frustumCulled = false;
    this.starPoints.renderOrder = -95;
    this.starGroup.add(this.starPoints);
    this.scene.add(this.starGroup);
  }

  public update(playerPos: THREE.Vector3, config: SkyColors, dt: number): void {
    // Keep sky dome centered on the player so the horizon is always boundless
    this.skyMesh.position.copy(playerPos);
    this.starGroup.position.copy(playerPos);

    // Slowly rotate celestial starfield for living night sky
    this.starGroup.rotation.y += dt * 0.008;

    // Update Sky Shader Uniforms
    this.skyMaterial.uniforms.uZenithColor.value.copy(config.zenithColor);
    this.skyMaterial.uniforms.uHorizonColor.value.copy(config.horizonColor);
    this.skyMaterial.uniforms.uNadirColor.value.copy(config.nadirColor);
    this.skyMaterial.uniforms.uSunPosition.value.copy(config.sunPosition).sub(playerPos);
    this.skyMaterial.uniforms.uMoonPosition.value.copy(config.moonPosition).sub(playerPos);
    this.skyMaterial.uniforms.uSunColor.value.copy(config.sunColor);
    this.skyMaterial.uniforms.uMoonColor.value.copy(config.moonColor);
    this.skyMaterial.uniforms.uUndergroundFactor.value = config.undergroundFactor;

    // Fade stars in during night and out during day (also hide underground)
    const targetStarOpacity = Math.max(0, config.starOpacity * (1.0 - config.undergroundFactor));
    this.starMaterial.opacity = THREE.MathUtils.lerp(this.starMaterial.opacity, targetStarOpacity, Math.min(1.0, dt * 4.0));
  }

  public dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.starPoints.geometry.dispose();
    this.starMaterial.dispose();
    this.scene.remove(this.skyMesh);
    this.scene.remove(this.starGroup);
  }
}
