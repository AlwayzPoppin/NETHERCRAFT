import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';
import { VoxelWorld } from './VoxelWorld';
import { SoundManager } from '../audio/SoundManager';
import { BlockParticleManager } from '../particles/BlockParticleManager';
import { BlockModelManager } from './BlockModelManager';
import { ItemManager } from '../items/ItemManager';

export function isLogBlock(type: BlockType): boolean {
  return (
    type === BlockType.OAK_LOG ||
    type === BlockType.FROZEN_LOG ||
    type === BlockType.PETRIFIED_LOG ||
    type === BlockType.PETRIFIED_SUNWOOD ||
    type === BlockType.JUNGLE_LOG ||
    type === BlockType.OAK_LOG_X || type === BlockType.OAK_LOG_Z ||
    type === BlockType.FROZEN_LOG_X || type === BlockType.FROZEN_LOG_Z ||
    type === BlockType.PETRIFIED_LOG_X || type === BlockType.PETRIFIED_LOG_Z ||
    type === BlockType.PETRIFIED_SUNWOOD_X || type === BlockType.PETRIFIED_SUNWOOD_Z ||
    type === BlockType.JUNGLE_LOG_X || type === BlockType.JUNGLE_LOG_Z ||
    type === BlockType.OAK_BRANCH_1 || type === BlockType.OAK_BRANCH_2 || type === BlockType.OAK_BRANCH_3 ||
    type === BlockType.JUNGLE_BRANCH_1 || type === BlockType.JUNGLE_BRANCH_2 || type === BlockType.JUNGLE_BRANCH_3 ||
    type === BlockType.FROZEN_BRANCH_1 || type === BlockType.FROZEN_BRANCH_2 || type === BlockType.FROZEN_BRANCH_3 ||
    type === BlockType.PETRIFIED_BRANCH_1 || type === BlockType.PETRIFIED_BRANCH_2 || type === BlockType.PETRIFIED_BRANCH_3 ||
    type === BlockType.SUNWOOD_BRANCH_1 || type === BlockType.SUNWOOD_BRANCH_2 || type === BlockType.SUNWOOD_BRANCH_3 ||
    type === BlockType.JUNGLE_ROOT_POS_X || type === BlockType.JUNGLE_ROOT_NEG_X ||
    type === BlockType.JUNGLE_ROOT_POS_Z || type === BlockType.JUNGLE_ROOT_NEG_Z
  );
}

export function isLeafBlock(type: BlockType): boolean {
  return (
    type === BlockType.OAK_LEAVES ||
    type === BlockType.TEAL_LEAVES ||
    type === BlockType.BLUE_LEAVES ||
    type === BlockType.PURPLE_LEAVES ||
    type === BlockType.FROST_LEAVES ||
    type === BlockType.WITHERED_THORNS ||
    type === BlockType.PALM_FRONDS ||
    type === BlockType.JUNGLE_LEAVES
  );
}

function getCoordKey(x: number, y: number, z: number): number {
  return (((x + 2048) & 0xfff) << 19) | ((y & 0x7f) << 12) | ((z + 2048) & 0xfff);
}

interface BlockNode {
  x: number;
  y: number;
  z: number;
  type: BlockType;
}

interface FallingTree {
  group: THREE.Group;
  basePos: THREE.Vector3;
  rotAxis: THREE.Vector3;
  angle: number;
  angularVelocity: number;
  logs: BlockNode[];
  leaves: BlockNode[];
  primaryLogType: BlockType;
  isXAxis: boolean;
}

export class TreeFellingManager {
  private scene: THREE.Scene;
  private world: VoxelWorld;
  private sound: SoundManager;
  private particleManager: BlockParticleManager;
  private itemManager: ItemManager;

  private fallingTrees: FallingTree[] = [];

  // ---- Shared static resources (lazy-initialized, reused across all felling events) ----
  private static _sharedBoxGeo: THREE.BoxGeometry | null = null;
  private static _sharedLeafTex: THREE.Texture | null = null;
  private static _sharedLogMat: THREE.MeshLambertMaterial | null = null;
  private static _sharedLeafMat: THREE.MeshLambertMaterial | null = null;
  private static _scratchMat = new THREE.Matrix4();
  private static _scratchCol = new THREE.Color();
  private static _scratchPos = new THREE.Vector3();
  private static _scratchQuat = new THREE.Quaternion();

  // Camera screen shake offset
  public screenShakeIntensity: number = 0;

  constructor(
    scene: THREE.Scene,
    world: VoxelWorld,
    sound: SoundManager,
    particleManager: BlockParticleManager,
    itemManager: ItemManager
  ) {
    this.scene = scene;
    this.world = world;
    this.sound = sound;
    this.particleManager = particleManager;
    this.itemManager = itemManager;
  }

  /**
   * Attempts to fell a tree starting from chopped log position.
   * Returns true if a valid tree structure was identified and felled.
   */
  public tryFellTree(
    startPos: THREE.Vector3,
    cameraDir: THREE.Vector3,
    playerPos: THREE.Vector3
  ): boolean {
    const startX = Math.floor(startPos.x);
    const startY = Math.floor(startPos.y);
    const startZ = Math.floor(startPos.z);

    const startType = this.world.getBlock(startX, startY, startZ);
    if (!isLogBlock(startType)) return false;

    // 1. Connectivity Search for Tree Spine & Adjacency Canopy
    const scanned = this.scanTreeStructure(startX, startY, startZ);
    if (!scanned) return false;

    const { logs, leaves } = scanned;

    // 2. IMMEDIATELY Drop Item Pickup for Severed Log & Clear Block
    this.itemManager.spawnPickup(startType, new THREE.Vector3(startX, startY, startZ));
    this.world.setBlock(startX, startY, startZ, BlockType.AIR);

    // Exclude severed log itself from the upper remaining tree group
    const remainingLogs = logs.filter(
      (b) => !(b.x === startX && b.y === startY && b.z === startZ)
    );
    const remainingBlocks = [...remainingLogs, ...leaves];

    // If no remaining blocks above cut, return true (single log harvested cleanly)
    if (remainingBlocks.length === 0) {
      return true;
    }

    // Support Check / Floating Canopy Safeguard:
    // If upper logs exist but have NO canopy leaves (e.g. bare log pillar), drop remaining upper logs directly as item pickups
    if (leaves.length === 0) {
      for (const b of remainingLogs) {
        this.world.setBlock(b.x, b.y, b.z, BlockType.AIR);
        this.itemManager.spawnPickup(b.type, new THREE.Vector3(b.x + 0.5, b.y + 0.5, b.z + 0.5));
      }
      return true;
    }

    // Remove remaining upper tree blocks from static voxel world grid
    for (const b of remainingBlocks) {
      this.world.setBlock(b.x, b.y, b.z, BlockType.AIR);
    }

    // 3. Construct Dynamic 3D Falling Tree Group centered at exact severed log coordinate
    const basePos = new THREE.Vector3(startX + 0.5, startY + 0.5, startZ + 0.5);
    const treeGroup = new THREE.Group();
    treeGroup.position.copy(basePos);

    // ---- Shared Geometry & Texture (lazy-init once, reused across ALL trees) ----
    if (!TreeFellingManager._sharedBoxGeo) {
      TreeFellingManager._sharedBoxGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    }
    if (!TreeFellingManager._sharedLeafTex) {
      const loader = new THREE.TextureLoader();
      TreeFellingManager._sharedLeafTex = loader.load('/textures/trees/TREE LEAVES TEXTURE.png');
      TreeFellingManager._sharedLeafTex.magFilter = THREE.NearestFilter;
      TreeFellingManager._sharedLeafTex.minFilter = THREE.NearestFilter;
      TreeFellingManager._sharedLeafTex.colorSpace = THREE.SRGBColorSpace;
    }
    if (!TreeFellingManager._sharedLogMat) {
      TreeFellingManager._sharedLogMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    }
    if (!TreeFellingManager._sharedLeafMat) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: TreeFellingManager._sharedLeafTex,
        transparent: false,
        alphaTest: 0.1,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      BlockModelManager.applyLeafDitherShader(mat);
      TreeFellingManager._sharedLeafMat = mat;
    }
    const boxGeo = TreeFellingManager._sharedBoxGeo;

    // ---- Log InstancedMesh (1 draw call for ALL log blocks) ----
    if (remainingLogs.length > 0) {
      const logInst = new THREE.InstancedMesh(boxGeo, TreeFellingManager._sharedLogMat, remainingLogs.length);
      logInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      for (let i = 0; i < remainingLogs.length; i++) {
        const b = remainingLogs[i];
        TreeFellingManager._scratchMat.makeTranslation(
          b.x + 0.5 - basePos.x,
          b.y + 0.5 - basePos.y,
          b.z + 0.5 - basePos.z
        );
        logInst.setMatrixAt(i, TreeFellingManager._scratchMat);

        const logColor = b.type === BlockType.FROZEN_LOG ? 0x475569
          : b.type === BlockType.PETRIFIED_LOG ? 0x7f1d1d
          : b.type === BlockType.JUNGLE_LOG || b.type === BlockType.JUNGLE_LOG_X || b.type === BlockType.JUNGLE_LOG_Z ? 0x3f2e18
          : 0x854d0e;
        TreeFellingManager._scratchCol.setHex(logColor);
        logInst.setColorAt(i, TreeFellingManager._scratchCol);
      }

      logInst.instanceMatrix.needsUpdate = true;
      if (logInst.instanceColor) logInst.instanceColor.needsUpdate = true;
      treeGroup.add(logInst);
    }

    // ---- Leaf InstancedMesh (1 draw call for ALL leaf blocks) ----
    if (leaves.length > 0) {
      const leafInst = new THREE.InstancedMesh(boxGeo, TreeFellingManager._sharedLeafMat, leaves.length);
      leafInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      for (let i = 0; i < leaves.length; i++) {
        const b = leaves[i];
        TreeFellingManager._scratchMat.makeTranslation(
          b.x + 0.5 - basePos.x,
          b.y + 0.5 - basePos.y,
          b.z + 0.5 - basePos.z
        );
        leafInst.setMatrixAt(i, TreeFellingManager._scratchMat);

        let leafColor = 0x15803d;
        if (b.type === BlockType.JUNGLE_LEAVES) leafColor = 0x0f5132;
        else if (b.type === BlockType.TEAL_LEAVES) leafColor = 0x0d9488;
        else if (b.type === BlockType.BLUE_LEAVES) leafColor = 0x2563eb;
        else if (b.type === BlockType.PURPLE_LEAVES) leafColor = 0x9333ea;
        else if (b.type === BlockType.FROST_LEAVES) leafColor = 0x0284c7;
        else if (b.type === BlockType.WITHERED_THORNS) leafColor = 0x581c87;
        TreeFellingManager._scratchCol.setHex(leafColor);
        leafInst.setColorAt(i, TreeFellingManager._scratchCol);
      }

      leafInst.instanceMatrix.needsUpdate = true;
      if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
      treeGroup.add(leafInst);
    }

    this.scene.add(treeGroup);

    // 4. Calculate Fall Rotation Vector directly from player position to tree base position
    const fallDir = new THREE.Vector3().subVectors(basePos, playerPos);
    fallDir.y = 0; // Keep horizontal plane
    if (fallDir.lengthSq() < 0.001) {
      fallDir.set(cameraDir.x, 0, cameraDir.z);
      fallDir.y = 0;
    }
    fallDir.normalize();

    // Cross product (0, 1, 0) x fallDir guarantees initial rotation pushes top of tree ALONG fallDir (away from player)
    const rotAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fallDir).normalize();
    const isXAxis = Math.abs(fallDir.x) > Math.abs(fallDir.z);

    this.fallingTrees.push({
      group: treeGroup,
      basePos,
      rotAxis,
      angle: 0,
      angularVelocity: 0.4,
      logs: remainingLogs,
      leaves,
      primaryLogType: startType,
      isXAxis,
    });

    return true;
  }

  /**
   * Runs log-spine BFS traversal and 2-block leaf adjacency check.
   * Strictly restricts search to y >= startY so lower trunk logs remain as a stump.
   */
  private scanTreeStructure(
    startX: number,
    startY: number,
    startZ: number
  ): { logs: BlockNode[]; leaves: BlockNode[] } | null {
    const logs: BlockNode[] = [];
    const leafSet = new Set<number>();
    const leaves: BlockNode[] = [];

    // Phase 1: LOG-ONLY BFS Traversal starting from cut Y-level
    const queue: Array<{ x: number; y: number; z: number }> = [{ x: startX, y: startY, z: startZ }];
    let queueHead = 0;
    const visitedLogs = new Set<number>();
    visitedLogs.add(getCoordKey(startX, startY, startZ));

    const maxLogLimit = 120;

    while (queueHead < queue.length && visitedLogs.size <= maxLogLimit) {
      const curr = queue[queueHead++];
      const type = this.world.getBlock(curr.x, curr.y, curr.z);

      if (isLogBlock(type) && curr.y >= startY) {
        logs.push({ ...curr, type });
      } else {
        continue;
      }

      // Check 26-neighbor box ONLY for connected LOG blocks
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            const nz = curr.z + dz;

            // Restrict traversal to logs at or above the cut Y-level
            if (ny < startY) continue;

            const key = getCoordKey(nx, ny, nz);
            if (visitedLogs.has(key)) continue;

            const nType = this.world.getBlock(nx, ny, nz);
            if (isLogBlock(nType)) {
              visitedLogs.add(key);
              queue.push({ x: nx, y: ny, z: nz });
            }
          }
        }
      }
    }

    // Phase 2: Collect LEAVES adjacent (within 2 blocks) of identified trunk logs
    for (const log of logs) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            const lx = log.x + dx;
            const ly = log.y + dy;
            const lz = log.z + dz;

            if (ly < startY) continue; // Keep lower canopy/leaves intact

            const key = getCoordKey(lx, ly, lz);
            if (leafSet.has(key)) continue;

            const lType = this.world.getBlock(lx, ly, lz);
            if (isLeafBlock(lType)) {
              leafSet.add(key);
              leaves.push({ x: lx, y: ly, z: lz, type: lType });
            }
          }
        }
      }
    }

    return { logs, leaves };
  }

  /**
   * Physics & collision update loop for active falling trees.
   */
  public update(dt: number, playerPos: THREE.Vector3): void {
    const delta = Math.min(dt, 0.05);

    // Fade out screen shake
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - delta * 4.0);
    }

    for (let i = this.fallingTrees.length - 1; i >= 0; i--) {
      const tree = this.fallingTrees[i];

      // Gravity-accelerated angular physics: theta_accel proportional to sin(theta)
      const accel = Math.sin(tree.angle) * 8.5 + 1.2;
      tree.angularVelocity += accel * delta;
      tree.angle += tree.angularVelocity * delta;

      // Apply rotation around base pivot
      TreeFellingManager._scratchQuat.setFromAxisAngle(tree.rotAxis, tree.angle);
      tree.group.quaternion.copy(TreeFellingManager._scratchQuat);

      // Check impact threshold (~84 deg tilt)
      if (tree.angle >= 1.45) {
        this.landTreeOnImpact(tree, playerPos);

        // Dispose InstancedMesh instance buffers (shared geometry & materials preserved)
        this.scene.remove(tree.group);
        tree.group.traverse((child) => {
          if (child instanceof THREE.InstancedMesh) {
            child.dispose();
          }
        });

        this.fallingTrees.splice(i, 1);
      }
    }
  }

  /**
   * Re-integrates the fallen tree back into VoxelWorld as solid, mineable blocks resting flush on the ground.
   * Uses matrix world positions (getWorldPosition) and terrain surface snapping.
   */
  private landTreeOnImpact(tree: FallingTree, playerPos: THREE.Vector3): void {
    const distToPlayer = tree.basePos.distanceTo(playerPos);

    // Screen Shake Micro-Impulse if player is close by (< 25 blocks)
    if (distToPlayer < 25) {
      const proximityFactor = Math.max(0.2, 1.0 - distToPlayer / 25);
      this.screenShakeIntensity = 0.45 * proximityFactor;
    }

    // Heavy Ground Impact Thud SFX
    this.sound.playBlockBreak();

    // Ensure matrix world is updated for exact 3D world positions
    tree.group.updateMatrixWorld(true);

    // Re-integrate log and leaf blocks into static VoxelWorld grid using exact 3D world snapping.
    // Iterates stored BlockNode arrays directly with matrix math — no group.children traversal needed.
    const allFallenBlocks = [...tree.logs, ...tree.leaves];
    const worldPos = TreeFellingManager._scratchPos;

    for (const b of allFallenBlocks) {
      // Compute final world position: local offset rotated by group's accumulated world matrix
      worldPos.set(
        b.x + 0.5 - tree.basePos.x,
        b.y + 0.5 - tree.basePos.y,
        b.z + 0.5 - tree.basePos.z
      );
      worldPos.applyMatrix4(tree.group.matrixWorld);

      const blockType: BlockType = b.type;
      const snapX = Math.round(worldPos.x);
      let snapY = Math.round(worldPos.y);
      const snapZ = Math.round(worldPos.z);

      // Terrain Surface Snapping (Flush Landing):
      // Drop snapY down until it rests directly on top of solid ground surface (GRASS/DIRT/STONE/SAND)
      while (snapY > 1) {
        const blockBelow = this.world.getBlock(snapX, snapY - 1, snapZ);
        if (
          blockBelow !== BlockType.AIR &&
          blockBelow !== BlockType.WATER &&
          blockBelow !== BlockType.OASIS_WATER &&
          blockBelow !== BlockType.JUNGLE_WATER &&
          !isLeafBlock(blockBelow)
        ) {
          break;
        }
        snapY--;
      }

      const targetY = Math.max(1, snapY);

      let finalBlockType = blockType;
      if (isLogBlock(blockType)) {
        if (tree.isXAxis) {
           if (blockType === BlockType.OAK_LOG) finalBlockType = BlockType.OAK_LOG_X;
           else if (blockType === BlockType.FROZEN_LOG) finalBlockType = BlockType.FROZEN_LOG_X;
           else if (blockType === BlockType.PETRIFIED_LOG) finalBlockType = BlockType.PETRIFIED_LOG_X;
           else if (blockType === BlockType.PETRIFIED_SUNWOOD) finalBlockType = BlockType.PETRIFIED_SUNWOOD_X;
           else if (blockType === BlockType.JUNGLE_LOG) finalBlockType = BlockType.JUNGLE_LOG_X;
        } else {
           if (blockType === BlockType.OAK_LOG) finalBlockType = BlockType.OAK_LOG_Z;
           else if (blockType === BlockType.FROZEN_LOG) finalBlockType = BlockType.FROZEN_LOG_Z;
           else if (blockType === BlockType.PETRIFIED_LOG) finalBlockType = BlockType.PETRIFIED_LOG_Z;
           else if (blockType === BlockType.PETRIFIED_SUNWOOD) finalBlockType = BlockType.PETRIFIED_SUNWOOD_Z;
           else if (blockType === BlockType.JUNGLE_LOG) finalBlockType = BlockType.JUNGLE_LOG_Z;
        }
      }

      // Only place into empty air, water, or leaves so it doesn't overwrite existing solid terrain
      const currentBlock = this.world.getBlock(snapX, targetY, snapZ);
      if (
        currentBlock === BlockType.AIR ||
        currentBlock === BlockType.WATER ||
        currentBlock === BlockType.OASIS_WATER ||
        currentBlock === BlockType.JUNGLE_WATER ||
        isLeafBlock(currentBlock)
      ) {
        this.world.setBlock(snapX, targetY, snapZ, finalBlockType);
      }

      // Small ground impact dust particles for logs
      if (isLogBlock(finalBlockType) && Math.random() < 0.3) {
        this.particleManager.spawnBlockDebris(
          blockType,
          new THREE.Vector3(snapX, targetY, snapZ),
          2
        );
      }
    }

    // Cleanup any orphan leaves left behind in the sky
    this.decayOrphanLeaves(tree.logs, tree.leaves);
  }

  /**
   * Scans the expanded bounding box of the original tree and decays any leaves that are no longer connected to a log.
   */
  private decayOrphanLeaves(originalLogs: BlockNode[], originalLeaves: BlockNode[]): void {
    if (originalLeaves.length === 0 && originalLogs.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const b of originalLeaves) {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); minZ = Math.min(minZ, b.z);
      maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); maxZ = Math.max(maxZ, b.z);
    }
    if (originalLeaves.length === 0) {
      for (const b of originalLogs) {
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); minZ = Math.min(minZ, b.z);
        maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); maxZ = Math.max(maxZ, b.z);
      }
    }

    // Expand bounding box slightly to catch edge stragglers
    minX -= 3; minY -= 2; minZ -= 3;
    maxX += 3; maxY += 3; maxZ += 3;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const type = this.world.getBlock(x, y, z);
          if (isLeafBlock(type)) {
            if (!this.isConnectedToLog(x, y, z)) {
              this.world.setBlock(x, y, z, BlockType.AIR);
              this.particleManager.spawnBlockDebris(type, new THREE.Vector3(x, y, z), 4);
            }
          }
        }
      }
    }
  }

  /**
   * BFS search to check if a block has a path of leaves to any log block.
   */
  private isConnectedToLog(startX: number, startY: number, startZ: number): boolean {
    const queue: Array<{x: number, y: number, z: number}> = [{x: startX, y: startY, z: startZ}];
    let queueHead = 0;
    const visited = new Set<number>();
    visited.add(getCoordKey(startX, startY, startZ));

    const maxSearchLimit = 150;
    
    while(queueHead < queue.length && visited.size < maxSearchLimit) {
      const curr = queue[queueHead++];
      
      if (isLogBlock(this.world.getBlock(curr.x, curr.y, curr.z))) {
         return true;
      }

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            const nz = curr.z + dz;
            
            const nType = this.world.getBlock(nx, ny, nz);
            if (isLeafBlock(nType) || isLogBlock(nType)) {
              const key = getCoordKey(nx, ny, nz);
              if (!visited.has(key)) {
                visited.add(key);
                queue.push({x: nx, y: ny, z: nz});
              }
            }
          }
        }
      }
    }
    return false;
  }
}
