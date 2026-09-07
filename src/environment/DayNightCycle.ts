import * as THREE from 'three';
import { TerrainNoise } from '../world/Noise';
import { SkyDome, SkyColors } from './SkyDome';

export interface DayNightTimeInfo {
  day: number;
  clockTime: string;
  phaseName: 'Day' | 'Sunset' | 'Night' | 'Dawn';
  phaseIcon: string;
  countdownText: string;
  isDay: boolean;
  progressPercent: number;
}

export class DayNightCycle {
  // Preallocated static color constants for Day / Sunset / Night
  private static readonly COLOR_DAY_ZENITH = new THREE.Color(0x0284c7); // Deep saturated azure
  private static readonly COLOR_DAY_HORIZON = new THREE.Color(0xbae6fd); // Radiant airy horizon
  private static readonly COLOR_DAY_FOG = new THREE.Color(0x7dd3fc);

  private static readonly COLOR_SUNSET_ZENITH = new THREE.Color(0x312e81); // Twilight royal indigo
  private static readonly COLOR_SUNSET_HORIZON = new THREE.Color(0xf97316); // Fiery golden orange
  private static readonly COLOR_SUNSET_FOG = new THREE.Color(0xfdba74);

  private static readonly COLOR_NIGHT_ZENITH = new THREE.Color(0x030712); // Cosmic deep midnight
  private static readonly COLOR_NIGHT_HORIZON = new THREE.Color(0x0f172a); // Slate navy horizon
  private static readonly COLOR_NIGHT_FOG = new THREE.Color(0x0a0f1d);

  // Ashen Ruins Apocalyptic Colors
  private static readonly COLOR_ASHEN_ZENITH = new THREE.Color(0x450a0a); // Deep blood-ember
  private static readonly COLOR_ASHEN_HORIZON = new THREE.Color(0x991b1b); // Fiery crimson haze
  private static readonly COLOR_ASHEN_SURFACE_FOG = new THREE.Color(0x451219);
  private static readonly COLOR_ASHEN_CAVE_FOG = new THREE.Color(0x1a0508);

  // Biome Atmosphere Tints
  private static readonly COLOR_STANDARD_CAVE_FOG = new THREE.Color(0x0a0e1a);

  public scene: THREE.Scene;
  public time: number = 0.25; // 0 to 1 cycle, 0.25 is noon (12:00 PM)
  public speedMultiplier: number = 1.0;
  public dayCount: number = 1;

  private skyDome: SkyDome;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private _sunPos: THREE.Vector3 = new THREE.Vector3();
  private _moonPos: THREE.Vector3 = new THREE.Vector3();
  private noise: TerrainNoise;
  private _smoothAshen: number = 0;

  // Preallocated scratch color instances for zero-allocation per-frame lerps
  private _zenithColor: THREE.Color = new THREE.Color();
  private _horizonColor: THREE.Color = new THREE.Color();
  private _nadirColor: THREE.Color = new THREE.Color(0x0a0f1d);
  private _sunColor: THREE.Color = new THREE.Color(0xfff7ed);
  private _moonColor: THREE.Color = new THREE.Color(0xdbeafe);

  private _ambientColor: THREE.Color = new THREE.Color();
  private _hemiSkyColor: THREE.Color = new THREE.Color();
  private _hemiGroundColor: THREE.Color = new THREE.Color();

  private _baseFogColor: THREE.Color = new THREE.Color();
  private _targetAshenZenith: THREE.Color = new THREE.Color();
  private _targetAshenHorizon: THREE.Color = new THREE.Color();
  private _nonAshenFog: THREE.Color = new THREE.Color();
  private _ashenFog: THREE.Color = new THREE.Color();
  private _targetFogColor: THREE.Color = new THREE.Color();
  private _targetBgColor: THREE.Color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.noise = new TerrainNoise(1337);

    // Initialize Next-Gen Atmospheric Sky Dome
    this.skyDome = new SkyDome(this.scene);

    // Ambient Lighting (Dynamic, transitions between daytime sky ambient and deep midnight darkness)
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.42);
    this.scene.add(this.ambientLight);

    // Hemisphere Lighting (Sky illumination + natural ground bounce)
    this.hemiLight = new THREE.HemisphereLight(0xc8e8ff, 0x475569, 0.60);
    this.scene.add(this.hemiLight);

    // Directional Sun / Moon Light
    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 1.30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 300;
    const d = 110; // Wide 220m shadow coverage around player
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  public update(dt: number, playerPos: THREE.Vector3, undergroundFactor: number = 0.0): void {
    if (this.speedMultiplier > 0) {
      const prevTime = this.time;
      // 1 full day cycle every ~300 seconds (5 min) at 1x speed
      this.time = (this.time + (dt / 300) * this.speedMultiplier) % 1.0;
      if (this.time < prevTime) {
        this.dayCount++;
      }
    }

    const angle = this.time * Math.PI * 2;
    const skyRadius = 180;
    const lightDist = 110;

    const sunDirX = Math.cos(angle);
    const sunDirY = Math.sin(angle);
    const sunDirZ = 0.25;

    // Sky Dome celestial positions
    this._sunPos.set(playerPos.x + sunDirX * skyRadius, playerPos.y + sunDirY * skyRadius, playerPos.z + sunDirZ * skyRadius);
    this._moonPos.set(playerPos.x - sunDirX * skyRadius, playerPos.y - sunDirY * skyRadius, playerPos.z - sunDirZ * skyRadius);

    // Directional light position & target tracking player
    const sunX = playerPos.x + sunDirX * lightDist;
    const sunY = playerPos.y + sunDirY * lightDist;
    const sunZ = playerPos.z + sunDirZ * lightDist;

    const moonX = playerPos.x - sunDirX * lightDist;
    const moonY = playerPos.y - sunDirY * lightDist;
    const moonZ = playerPos.z - sunDirZ * lightDist;

    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Sun height determines daytime, golden sunset, and nighttime
    const sunHeight = Math.sin(angle);
    let lightIntensity: number;
    let starOpacity = 0.0;

    if (sunHeight > 0.18) {
      // Daytime: Saturated azure zenith and radiant airy horizon
      this._zenithColor.copy(DayNightCycle.COLOR_DAY_ZENITH);
      this._horizonColor.copy(DayNightCycle.COLOR_DAY_HORIZON);
      this._baseFogColor.copy(DayNightCycle.COLOR_DAY_FOG);
      this._sunColor.set(0xfff7ed);
      this._moonColor.set(0xbfdbfe);
      this._ambientColor.set(0xdbeafe);
      this._hemiSkyColor.set(0xc8e8ff);
      this._hemiGroundColor.set(0x475569);
      lightIntensity = 1.30;
      starOpacity = 0.0;
    } else if (sunHeight > -0.12) {
      // Sunset / Sunrise: Rich twilight indigo zenith and fiery golden-orange horizon
      const t = (sunHeight + 0.12) / 0.30;
      this._zenithColor.copy(DayNightCycle.COLOR_SUNSET_ZENITH).lerp(DayNightCycle.COLOR_DAY_ZENITH, t);
      this._horizonColor.copy(DayNightCycle.COLOR_SUNSET_HORIZON).lerp(DayNightCycle.COLOR_DAY_HORIZON, t);
      this._baseFogColor.copy(DayNightCycle.COLOR_SUNSET_FOG).lerp(DayNightCycle.COLOR_DAY_FOG, t);
      this._sunColor.set(0xfb923c).lerp(new THREE.Color(0xfff7ed), t);
      this._moonColor.set(0xbfdbfe);
      this._ambientColor.set(0x334155).lerp(new THREE.Color(0xfdba74), t);
      this._hemiSkyColor.set(0x60a5fa).lerp(new THREE.Color(0xf97316), t);
      this._hemiGroundColor.set(0x1e293b).lerp(new THREE.Color(0x382314), t);
      lightIntensity = 0.55 + t * 0.75;
      starOpacity = (1.0 - t) * 0.75;
    } else {
      // Nighttime: Radiant moonlight illuminates the night terrain with cool silver-blue rays
      this._zenithColor.copy(DayNightCycle.COLOR_NIGHT_ZENITH);
      this._horizonColor.copy(DayNightCycle.COLOR_NIGHT_HORIZON);
      this._baseFogColor.copy(DayNightCycle.COLOR_NIGHT_FOG);
      this._sunColor.set(0x000000);
      this._moonColor.set(0xbfdbfe);
      this._ambientColor.set(0x273549);
      this._hemiSkyColor.set(0x4ba3e3);
      this._hemiGroundColor.set(0x172233);
      lightIntensity = 0.50; // Luminous moonbeam rays
      starOpacity = 1.0;
    }

    // --- SMOOTH BIOME & CAVE OVERHEAD ROOF LERP ---
    const warpX = this.noise.octaveNoise2D(playerPos.x, playerPos.z, 2, 0.5, 0.008) * 32;
    const warpZ = this.noise.octaveNoise2D(playerPos.x + 400, playerPos.z + 400, 2, 0.5, 0.008) * 32;
    const effectiveX = playerPos.x + warpX;
    const effectiveZ = playerPos.z + warpZ;

    const distWest = effectiveX - (-160); // positive outside ruins, negative inside
    const rawAshenInf = THREE.MathUtils.clamp(0.5 - distWest / 32.0, 0.0, 1.0);
    const smoothAshen = THREE.MathUtils.smoothstep(rawAshenInf, 0.0, 1.0);
    this._smoothAshen = smoothAshen;

    // Rainforest Smooth Transition (Between Z = 40 and Z = 220)
    let rawRainforestInf = 0;
    if (effectiveX >= -160) {
      if (effectiveZ >= 30 && effectiveZ <= 230) {
        const edgeIn = THREE.MathUtils.clamp((effectiveZ - 30) / 20.0, 0.0, 1.0);
        const edgeOut = THREE.MathUtils.clamp((230 - effectiveZ) / 20.0, 0.0, 1.0);
        rawRainforestInf = Math.min(edgeIn, edgeOut);
      }
    }
    const smoothRainforest = THREE.MathUtils.smoothstep(rawRainforestInf, 0.0, 1.0);

    // Apply Ashen Ruins Sky Overrides (Dark blood-ember and smoky crimson horizon)
    if (smoothAshen > 0.001) {
      this._targetAshenZenith.copy(DayNightCycle.COLOR_ASHEN_ZENITH);
      this._targetAshenHorizon.copy(DayNightCycle.COLOR_ASHEN_HORIZON);
      if (sunHeight <= -0.12) {
        this._targetAshenZenith.lerp(new THREE.Color(0x180406), 0.7);
        this._targetAshenHorizon.lerp(new THREE.Color(0x350912), 0.7);
      }
      this._zenithColor.lerp(this._targetAshenZenith, smoothAshen);
      this._horizonColor.lerp(this._targetAshenHorizon, smoothAshen);
    }

    // Cave Overhead Roof Factor: 1.0 inside cave beneath solid roof, 0.0 on open surface
    const surfaceFactor = THREE.MathUtils.clamp(1.0 - undergroundFactor, 0.0, 1.0);
    const smoothDepth = THREE.MathUtils.smoothstep(undergroundFactor, 0.0, 1.0);

    // Fog Colors - zero-allocation lerps into preallocated scratch colors
    this._nonAshenFog.copy(this._baseFogColor).lerp(DayNightCycle.COLOR_STANDARD_CAVE_FOG, smoothDepth);
    if (smoothAshen > 0.001) {
      this._ashenFog.copy(DayNightCycle.COLOR_ASHEN_SURFACE_FOG).lerp(DayNightCycle.COLOR_ASHEN_CAVE_FOG, smoothDepth);
      this._targetFogColor.copy(this._nonAshenFog).lerp(this._ashenFog, smoothAshen);
    } else {
      this._targetFogColor.copy(this._nonAshenFog);
    }

    // Cavern & Humid Rainforest Fog Density (Clearer visibility in the jungle)
    const surfaceFogDensity = THREE.MathUtils.lerp(0.007, 0.0045, smoothRainforest);
    const nonAshenDensity = THREE.MathUtils.lerp(surfaceFogDensity, 0.048, smoothDepth);
    const ashenDensity    = THREE.MathUtils.lerp(0.018, 0.068, smoothDepth);
    const targetDensity   = THREE.MathUtils.lerp(nonAshenDensity, ashenDensity, smoothAshen);

    if (this.scene.fog) {
      const lerpFactor = Math.min(1.0, dt * 3.5);
      this.scene.fog.color.lerp(this._targetFogColor, lerpFactor);
      (this.scene.fog as THREE.FogExp2).density += (targetDensity - (this.scene.fog as THREE.FogExp2).density) * lerpFactor;
    }

    // Update Atmospheric Sky Dome with real-time celestial coordinates
    const skyConfig: SkyColors = {
      zenithColor: this._zenithColor,
      horizonColor: this._horizonColor,
      nadirColor: this._targetFogColor,
      sunPosition: this._sunPos,
      moonPosition: this._moonPos,
      sunColor: this._sunColor,
      moonColor: this._moonColor,
      starOpacity,
      undergroundFactor: smoothDepth,
    };
    this.skyDome.update(playerPos, skyConfig, dt);

    // Direct Sun / Moon Light (switches to moonbeam at night, fades out underground)
    const isSunUp = sunHeight > -0.05;
    if (isSunUp) {
      this.sunLight.position.set(sunX, sunY, sunZ);
      this.sunLight.color.lerp(this._sunColor, Math.min(1.0, dt * 3.0));
    } else {
      this.sunLight.position.set(moonX, moonY, moonZ);
      this.sunLight.color.lerp(this._moonColor, Math.min(1.0, dt * 3.0));
    }

    const targetSun = lightIntensity * surfaceFactor;
    this.sunLight.intensity += (targetSun - this.sunLight.intensity) * Math.min(1.0, dt * 3.0);

    // Dynamic Ambient Light Scaling (Luminous warm/cool balance, rich twilight & crisp night lighting)
    const baseAmbient = isSunUp ? THREE.MathUtils.lerp(0.44, 0.54, Math.max(0, sunHeight)) : 0.28;
    const jungleAmbientFill = smoothRainforest * (isSunUp ? 0.08 : 0.05);
    const targetAmbient = THREE.MathUtils.lerp(0.01, baseAmbient + jungleAmbientFill, surfaceFactor);
    this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * Math.min(1.0, dt * 3.0);
    this.ambientLight.color.lerp(this._ambientColor, Math.min(1.0, dt * 3.0));

    // Dynamic Hemisphere Light Scaling (Sky illumination + natural terrain bounce)
    const baseHemi = isSunUp ? THREE.MathUtils.lerp(0.55, 0.72, Math.max(0, sunHeight)) : 0.35;
    const targetHemi = THREE.MathUtils.lerp(0.005, baseHemi + smoothRainforest * (isSunUp ? 0.08 : 0.05), surfaceFactor);
    this.hemiLight.intensity += (targetHemi - this.hemiLight.intensity) * Math.min(1.0, dt * 3.0);
    this.hemiLight.color.lerp(this._hemiSkyColor, Math.min(1.0, dt * 3.0));
    this.hemiLight.groundColor.lerp(this._hemiGroundColor, Math.min(1.0, dt * 3.0));
  }

  public getTimeInfo(): DayNightTimeInfo {
    // 0.0 is 6:00 AM, 0.25 is 12:00 PM, 0.5 is 6:00 PM, 0.75 is 12:00 AM (Midnight)
    const totalHours = (this.time * 24 + 6) % 24;
    const hours = Math.floor(totalHours);
    const minutes = Math.floor((totalHours % 1) * 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const clockTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;

    let phaseName: 'Day' | 'Sunset' | 'Night' | 'Dawn' = 'Day';
    let phaseIcon = '☀️';
    let countdownText = '';

    const effectiveSpeed = Math.max(0.001, this.speedMultiplier);
    const secondsPerDay = 300 / effectiveSpeed;

    if (this.time >= 0.0 && this.time < 0.45) {
      phaseName = 'Day';
      phaseIcon = '☀️';
      const secLeft = Math.max(0, (0.45 - this.time) * secondsPerDay);
      const m = Math.floor(secLeft / 60);
      const s = Math.floor(secLeft % 60);
      countdownText = `Dusk in ${m}:${s.toString().padStart(2, '0')}`;
    } else if (this.time >= 0.45 && this.time < 0.55) {
      phaseName = 'Sunset';
      phaseIcon = '🌅';
      const secLeft = Math.max(0, (0.55 - this.time) * secondsPerDay);
      const m = Math.floor(secLeft / 60);
      const s = Math.floor(secLeft % 60);
      countdownText = `Night in ${m}:${s.toString().padStart(2, '0')}`;
    } else if (this.time >= 0.55 && this.time < 0.92) {
      phaseName = 'Night';
      phaseIcon = '🌙';
      const secLeft = Math.max(0, (0.92 - this.time) * secondsPerDay);
      const m = Math.floor(secLeft / 60);
      const s = Math.floor(secLeft % 60);
      countdownText = `Dawn in ${m}:${s.toString().padStart(2, '0')}`;
    } else {
      phaseName = 'Dawn';
      phaseIcon = '🌄';
      const secLeft = Math.max(0, (1.0 - this.time) * secondsPerDay);
      const m = Math.floor(secLeft / 60);
      const s = Math.floor(secLeft % 60);
      countdownText = `Day in ${m}:${s.toString().padStart(2, '0')}`;
    }

    return {
      day: this.dayCount,
      clockTime,
      phaseName,
      phaseIcon,
      countdownText,
      isDay: this.isDaytime(),
      progressPercent: Math.round(this.time * 100),
    };
  }

  public getSunHeight(): number {
    const angle = this.time * Math.PI * 2;
    return Math.sin(angle);
  }

  public isDaytime(): boolean {
    return this.getSunHeight() > 0.0;
  }

  public getSmoothAshen(): number {
    return this._smoothAshen;
  }

  public dispose(): void {
    this.skyDome.dispose();
  }
}
