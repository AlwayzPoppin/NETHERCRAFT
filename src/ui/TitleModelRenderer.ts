import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeHierarchy } from '../utils/DisposeUtils';
import { TitleScreenTeardownRegistry } from './TitleScreenTeardownRegistry';

export class TitleModelRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private modelGroup: THREE.Group = new THREE.Group();
  private container: HTMLElement;
  private statusEl: HTMLElement;
  private animFrameId: number | null = null;
  private isDisposed: boolean = false;
  private onResizeHandler = () => this.onResize();
  private unregisterTeardown?: () => void;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container #${containerId} not found`);
    }
    this.container = container;

    // Create status text element for load progress feedback
    this.statusEl = document.createElement('div');
    this.statusEl.style.position = 'absolute';
    this.statusEl.style.color = '#a855f7';
    this.statusEl.style.fontSize = '12px';
    this.statusEl.style.fontFamily = "'Press Start 2P', monospace";
    this.statusEl.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
    this.statusEl.innerText = 'LOADING 3D TITLE CARD...';
    container.style.position = 'relative';
    container.appendChild(this.statusEl);

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 240;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 2000);
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    container.appendChild(this.renderer.domElement);

    // High Brightness Ambient & Directional Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xffedd5, 2.5);
    mainLight.position.set(5, 10, 10);
    this.scene.add(mainLight);

    const redLight = new THREE.PointLight(0xef4444, 6, 50);
    redLight.position.set(-6, 4, 6);
    this.scene.add(redLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 6, 50);
    purpleLight.position.set(6, -4, 6);
    this.scene.add(purpleLight);

    this.scene.add(this.modelGroup);

    this.loadModel();
    this.animate();

    window.addEventListener('resize', this.onResizeHandler);

    // Register with global title screen scene teardown registry
    this.unregisterTeardown = TitleScreenTeardownRegistry.register(() => {
      this.dispose();
    });
  }

  private onResize(): void {
    if (this.isDisposed || !this.container) return;
    const w = this.container.clientWidth || 500;
    const h = this.container.clientHeight || 240;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private loadModel(): void {
    const loader = new GLTFLoader();
    const modelUrl = '/environment/title/NETHER%20CRAFT%20TITLE%20CARD%20MODEL.glb';

    loader.load(
      modelUrl,
      (gltf) => {
        if (this.isDisposed) {
          disposeHierarchy(gltf.scene);
          return;
        }

        const model = gltf.scene;

        // Compute exact bounding box and bounding sphere for dynamic framing
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const sphere = box.getBoundingSphere(new THREE.Sphere());

        // Center mesh geometry at origin (0,0,0)
        model.position.sub(center);

        // Position camera relative to bounding sphere radius
        const radius = sphere.radius > 0 ? sphere.radius : 5;
        this.camera.position.set(0, 0, radius * 2.2);
        this.camera.lookAt(0, 0, 0);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => {
                  m.side = THREE.DoubleSide;
                  m.needsUpdate = true;
                });
              } else {
                mesh.material.side = THREE.DoubleSide;
                mesh.material.needsUpdate = true;
              }
            }
          }
        });

        this.modelGroup.add(model);

        // Hide loading status text when model finishes rendering
        if (this.statusEl) {
          this.statusEl.style.display = 'none';
        }
      },
      (xhr) => {
        if (xhr.total > 0 && this.statusEl && !this.isDisposed) {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          this.statusEl.innerText = `LOADING 3D TITLE CARD (${percent}%)...`;
        }
      },
      (err) => {
        console.warn('Could not load 3D GLB title card model from ' + modelUrl + ', generating stylized voxel artifact fallback:', err);
        if (this.isDisposed) return;

        // Build procedural 3D spinning NetherCraft obsidian & ruby artifact
        const fallbackGroup = new THREE.Group();
        const coreGeo = new THREE.BoxGeometry(1.6, 2.2, 0.4);
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0xe11d48,
          emissive: 0x9f1239,
          emissiveIntensity: 0.6,
          roughness: 0.2,
          metalness: 0.8,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        fallbackGroup.add(coreMesh);

        // Gold runic frame
        const frameGeo = new THREE.BoxGeometry(1.8, 2.4, 0.3);
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.3,
          metalness: 0.9,
          wireframe: true,
        });
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);
        fallbackGroup.add(frameMesh);

        this.modelGroup.add(fallbackGroup);

        if (this.statusEl) {
          this.statusEl.style.display = 'none';
        }
      }
    );
  }

  private animate = (): void => {
    if (this.isDisposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    if (this.modelGroup) {
      this.modelGroup.rotation.y += 0.008;
      this.modelGroup.position.y = Math.sin(Date.now() * 0.002) * 0.15;
    }
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Complete WebGL scene teardown: stops animation frame loops,
   * unbinds event listeners, disposes scene hierarchy, and frees the WebGL context.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // 1. Cancel requestAnimationFrame loop
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // 2. Remove window event listeners
    window.removeEventListener('resize', this.onResizeHandler);

    // 3. Unregister from teardown registry if still active
    if (this.unregisterTeardown) {
      this.unregisterTeardown();
      this.unregisterTeardown = undefined;
    }

    // 4. Dispose geometries, materials, textures in scene and model group
    disposeHierarchy(this.modelGroup);
    disposeHierarchy(this.scene);

    // 5. Explicit WebGLRenderer teardown and context release
    try {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    } catch (e) {
      console.warn('[TitleModelRenderer] WebGL context release notice:', e);
    }

    // 6. Purge DOM elements
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.statusEl && this.statusEl.parentNode) {
      this.statusEl.parentNode.removeChild(this.statusEl);
    }

    console.log('[TitleModelRenderer] Disposed cleanly. WebGL context released.');
  }
}
