import * as THREE from 'three';
import { VoxelWorld } from '../world/VoxelWorld';
import { BlockType, BLOCK_DEFINITIONS } from '../textures/TextureGenerator';

export class PlayerPhysics {
  public position: THREE.Vector3 = new THREE.Vector3(0, 40, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public isGrounded: boolean = false;
  public isFlying: boolean = false;
  public isNimbusMounted: boolean = false;
  public readonly nimbusCruiseSpeed: number = 14.0;
  public readonly nimbusTurboSpeed: number = 28.0;
  public isInWater: boolean = false;
  public isSubmerged: boolean = false;
  public isTouchingMagma: boolean = false;
  public burnTimer: number = 0;
  public isTouchingThorns: boolean = false;
  public thornDamageTimer: number = 0;
  public isGodmode: boolean = false;
  public devSpeedMultiplier: number = 1.0;
  public oxygen: number = 100;
  public readonly maxOxygen: number = 100;
  public health: number = 100;
  public readonly maxHealth: number = 100;
  public justTookDamage: boolean = false;
  public isCarried: boolean = false; // Set to true when snatched by dragon
  public isClimbing: boolean = false;
  public climbAction: 'climb_up' | 'climb_down' | 'climb_left' | 'climb_right' | 'climb_grab' | 'climb_idle' | 'idle' = 'idle';
  public isAtLedge: boolean = false;
  public wallNormal: THREE.Vector3 = new THREE.Vector3();
  public justLedgeVaulted: boolean = false;
  public standUpTimer: number = 0;
  public isDroppedByDragon: boolean = false;
  public justSteppedUp: boolean = false;
  public stepUpTimer: number = 0;
  public consecutiveStepCount: number = 0;
  public consecutiveStepTimer: number = 0;

  public toggleNimbusMount(): boolean {
    if (this.health <= 0 || this.isCarried || this.isRolling) {
      return false;
    }
    this.isNimbusMounted = !this.isNimbusMounted;
    if (this.isNimbusMounted) {
      this.isClimbing = false;
      this.velocity.set(0, 0, 0);
    }
    return this.isNimbusMounted;
  }

  // Dodge Roll / Evade Mechanics
  public isRolling: boolean = false;
  public rollTimer: number = 0;
  public readonly rollDuration: number = 0.75;
  public rollDirection: THREE.Vector3 = new THREE.Vector3();
  public rollSpeed: number = 7.8;
  public rollCooldown: number = 0;

  // Item Gathering / Pickup / Harvest State
  public pickupTimer: number = 0;
  public harvestTimer: number = 0;

  // Configurable Climbing Speeds
  public climbUpSpeed: number = 2.8;     // Vertical ascend speed (m/s)
  public climbDownSpeed: number = -2.6;  // Vertical descend speed (m/s)
  public shimmySpeed: number = 1.8;      // Horizontal shimmy speed (m/s)

  // Stamina / Endurance System
  public stamina: number = 100;
  public readonly maxStamina: number = 100;
  public isStaminaExhausted: boolean = false;
  private readonly staminaDrainRateActive: number = 14.0; // Drains while actively ascending/shimmying
  private readonly staminaDrainRateIdle: number = 6.0;   // Drains while holding still on wall
  private readonly staminaRegenRate: number = 25.0;      // Recharges on ground
  private readonly staminaDrainQuicksandActive: number = 22.0; // Rapidly drains while struggling/moving in quicksand
  private readonly staminaRegenQuicksandIdle: number = 4.5;    // Slowly recovers when resting/staying still in quicksand

  public triggerDodgeRoll(facingDir: THREE.Vector3, inputDir?: THREE.Vector3): boolean {
    if (this.isRolling || this.health <= 0 || this.isCarried || this.isClimbing || this.isFlying) {
      return false;
    }
    if (this.rollCooldown > 0) return false;
    if (this.stamina < 16) return false;

    this.isRolling = true;
    this.rollTimer = this.rollDuration;
    this.rollCooldown = 0.82;
    this.stamina = Math.max(0, this.stamina - 16);
    this.invulnerabilityTimer = 0.60; // 600ms invulnerability grace i-frames!

    if (inputDir && inputDir.lengthSq() > 0.01) {
      this.rollDirection.copy(inputDir).normalize();
    } else {
      this.rollDirection.copy(facingDir);
      this.rollDirection.y = 0;
      if (this.rollDirection.lengthSq() > 0.001) {
        this.rollDirection.normalize();
      } else {
        this.rollDirection.set(0, 0, -1);
      }
    }
    return true;
  }

  public triggerPickup(): void {
    if (!this.isRolling && !this.isClimbing && this.health > 0) {
      this.pickupTimer = 0.45; // 450ms item pickup animation
    }
  }

  public triggerHarvest(): void {
    if (!this.isRolling && !this.isClimbing && this.health > 0) {
      this.harvestTimer = 0.55; // 550ms harvest animation
    }
  }

  private drownTimer: number = 0;
  private magmaDamageTimer: number = 0;
  public magmaContactDuration: number = 0; // Consecutive duration touching magma for 0.4s viscosity grace period
  private timeSinceLastDamage: number = 10.0;
  public invulnerabilityTimer: number = 0;
  public poisonTimer: number = 0;
  public poisonDps: number = 3;
  private poisonTickTimer: number = 0;
  public isPoisoned: boolean = false;
  public isTouchingQuicksand: boolean = false;
  private climbStartY: number = 0;
  private climbDuration: number = 0;

  public applyPoison(duration: number = 6.0, dps: number = 3.0): void {
    this.poisonTimer = Math.max(this.poisonTimer, duration);
    this.poisonDps = dps;
    this.isPoisoned = true;
    console.log(`🧪 PLAYER ENVENOMED! Duration: ${duration}s @ ${dps} DPS`);
  }

  public takeDamage(amount: number, knockbackDir?: THREE.Vector3, ignoreInvulnerability: boolean = false): void {
    if (this.isGodmode) return;
    if (this.health <= 0 || this.isCarried) return;
    if (this.invulnerabilityTimer > 0 && !ignoreInvulnerability) return;

    this.health = Math.max(0, this.health - amount);
    this.justTookDamage = true;
    this.invulnerabilityTimer = 0.4; // 400ms i-frames grace period
    this.timeSinceLastDamage = 0;
    console.log(`💥 PLAYER TOOK ${amount} DAMAGE! Current HP: ${this.health}/${this.maxHealth}`);
    if (knockbackDir && knockbackDir.lengthSq() > 0.001) {
      const knock = knockbackDir.clone().normalize();
      this.velocity.x += knock.x * 12.0;
      this.velocity.z += knock.z * 12.0;
      this.velocity.y = Math.min(10.0, Math.max(4.0, knock.y * 8.0 + 4.0));
    }
  }

  // Player dimensions
  public readonly width: number = 0.6;
  public readonly height: number = 1.8;
  public readonly eyeHeight: number = 1.62;

  // Physics constants
  private readonly gravity: number = -28.0;
  private readonly jumpSpeed: number = 8.5;
  private readonly moveSpeed: number = 2.6;
  private readonly sprintMultiplier: number = 2.1;
  private readonly flySpeed: number = 12.0;

  constructor(spawnX: number = 0, spawnZ: number = 0) {
    this.position.set(spawnX, 40, spawnZ);
  }

  public update(
    dt: number,
    inputDir: THREE.Vector3,
    isJumping: boolean,
    isSprinting: boolean,
    isSneaking: boolean,
    world: VoxelWorld
  ): void {
    // Yield physics ownership when carried by Emberwynn Dragon
    if (this.isCarried) return;

    // Clamp dt to avoid huge physics teleports on tab change
    const delta = Math.min(dt, 0.05);

    // Handle Poison / Venom Damage-Over-Time
    if (this.poisonTimer > 0) {
      this.poisonTimer -= delta;
      this.isPoisoned = true;
      this.poisonTickTimer += delta;
      if (this.poisonTickTimer >= 1.0) {
        this.poisonTickTimer -= 1.0;
        this.takeDamage(this.poisonDps, undefined, true);
      }
      if (this.poisonTimer <= 0) {
        this.poisonTimer = 0;
        this.isPoisoned = false;
      }
    } else {
      this.isPoisoned = false;
    }

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= delta;
    }

    if (this.pickupTimer > 0) {
      this.pickupTimer -= delta;
    }

    if (this.harvestTimer > 0) {
      this.harvestTimer -= delta;
    }

    // Check if player is submerged in liquid (feet, body, or head)
    const blockBelowFeet = world.getBlock(
      Math.floor(this.position.x),
      Math.floor((this.position.y - 0.1) * 2.0),
      Math.floor(this.position.z)
    );
    const feetBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor((this.position.y + 0.2) * 2.0),
      Math.floor(this.position.z)
    );
    const bodyBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor((this.position.y + this.height * 0.5) * 2.0),
      Math.floor(this.position.z)
    );
    const headBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor((this.position.y + this.eyeHeight) * 2.0),
      Math.floor(this.position.z)
    );
    const feetDef = BLOCK_DEFINITIONS[feetBlock];
    const headDef = BLOCK_DEFINITIONS[headBlock];
    const isHeadInQuicksand = (headBlock === BlockType.MUDDY_QUICKSAND);
    this.isSubmerged = !!(headDef && headDef.isLiquid) || isHeadInQuicksand;
    this.isInWater = !!(feetDef && feetDef.isLiquid) || (this.isSubmerged && !isHeadInQuicksand);

    // Foliage Aerodynamic Cushioning: Falling through tree leaves slows downward speed
    const isPassingThroughLeaves = (
      this.isLeafBlock(feetBlock) ||
      this.isLeafBlock(bodyBlock) ||
      this.isLeafBlock(headBlock)
    );
    if (isPassingThroughLeaves && this.velocity.y < -3.5) {
      this.velocity.y = Math.max(this.velocity.y, -7.5);
    }

    // Check Magma (MOLTEN_CORRUPTION) contact at feet, body, head, or block below feet
    const nowTouchingMagma = (
      blockBelowFeet === BlockType.MOLTEN_CORRUPTION ||
      feetBlock === BlockType.MOLTEN_CORRUPTION ||
      bodyBlock === BlockType.MOLTEN_CORRUPTION ||
      headBlock === BlockType.MOLTEN_CORRUPTION
    );

    // Immediate Contact Damage & Lingering 2.0s Burn Status (Prevents jumping/bunny-hopping to avoid damage)
    if (nowTouchingMagma) {
      this.magmaContactDuration += delta;
      if (!this.isTouchingMagma && this.burnTimer <= 0) {
        // Immediate initial scorching hit on contact respecting invulnerability frames
        this.takeDamage(16);
      }
      this.isTouchingMagma = true;
      this.burnTimer = 2.0; // Fire continues burning for 2.0 seconds!
    } else {
      this.magmaContactDuration = Math.max(0, this.magmaContactDuration - delta * 2.0);
    }

    if (this.burnTimer > 0) {
      this.burnTimer -= delta;
      this.magmaDamageTimer += delta;
      // Magma burn ticks every 0.45s and respects invulnerability frames
      if (this.magmaDamageTimer >= 0.45) {
        this.magmaDamageTimer = 0;
        this.takeDamage(12);
      }
    } else {
      this.isTouchingMagma = false;
      this.magmaDamageTimer = 0;
    }

    // Check Thorned Undergrowth (MOSSVEIL_THORNED_UNDERGROWTH) contact
    const nowTouchingThorns = (
      blockBelowFeet === BlockType.MOSSVEIL_THORNED_UNDERGROWTH ||
      feetBlock === BlockType.MOSSVEIL_THORNED_UNDERGROWTH ||
      bodyBlock === BlockType.MOSSVEIL_THORNED_UNDERGROWTH ||
      headBlock === BlockType.MOSSVEIL_THORNED_UNDERGROWTH
    );

    if (nowTouchingThorns) {
      if (!this.isTouchingThorns) {
        // Immediate prickly laceration on initial contact
        this.takeDamage(8);
        this.thornDamageTimer = 0;
      } else {
        this.thornDamageTimer += delta;
        if (this.thornDamageTimer >= 0.55) {
          this.thornDamageTimer = 0;
          this.takeDamage(6);
        }
      }
      this.isTouchingThorns = true;
      // Movement resistance through dense briars
      this.velocity.x *= 0.88;
      this.velocity.z *= 0.88;
    } else {
      this.isTouchingThorns = false;
      this.thornDamageTimer = 0;
    }

    // Check Muddy Quicksand (MUDDY_QUICKSAND) contact
    // Check feet, body, head, or block below feet
    const blockDeepBelowFeet = world.getBlock(
      Math.floor(this.position.x),
      Math.floor((this.position.y - 0.55) * 2.0),
      Math.floor(this.position.z)
    );
    const nowTouchingQuicksand = (
      blockBelowFeet === BlockType.MUDDY_QUICKSAND ||
      feetBlock === BlockType.MUDDY_QUICKSAND ||
      bodyBlock === BlockType.MUDDY_QUICKSAND ||
      headBlock === BlockType.MUDDY_QUICKSAND ||
      blockDeepBelowFeet === BlockType.MUDDY_QUICKSAND
    );
    this.isTouchingQuicksand = nowTouchingQuicksand;

    // Oxygen breath depletion & drowning / quicksand suffocation damage
    if (this.isSubmerged) {
      const oxygenDrain = isHeadInQuicksand ? 28.0 : 12.0;
      this.oxygen = Math.max(0, this.oxygen - delta * oxygenDrain);
      if (this.oxygen <= 0) {
        this.drownTimer += delta;
        const damageInterval = isHeadInQuicksand ? 0.75 : 1.0;
        if (this.drownTimer >= damageInterval) {
          this.drownTimer = 0;
          this.health = Math.max(0, this.health - 12);
          this.justTookDamage = true;
        }
      } else {
        this.drownTimer = 0;
      }
    } else {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + delta * 50);
      this.drownTimer = 0;
      this.timeSinceLastDamage += delta;
      // Only regenerate health after 5.0 seconds of taking no damage
      if (this.timeSinceLastDamage > 5.0 && this.health < this.maxHealth && !this.isTouchingMagma && this.burnTimer <= 0 && !nowTouchingQuicksand) {
        this.health = Math.min(this.maxHealth, this.health + delta * 2.0);
      }
    }

    // Movement speeds & Molten Viscosity Drag
    let speed = (this.isFlying
      ? this.flySpeed
      : this.moveSpeed * (isSprinting ? this.sprintMultiplier : 1.0)) * this.devSpeedMultiplier;

    if (nowTouchingMagma) {
      // 0.4s grace period on magma viscosity slowdown allowing players to jump out if they clip the edge
      if (this.magmaContactDuration >= 0.4) {
        speed *= 0.35; // Dense molten rock viscosity slows horizontal movement
      } else {
        // Gentle initial friction allowing immediate jump-out reaction
        const graceProgress = this.magmaContactDuration / 0.4;
        speed *= (0.90 - graceProgress * 0.25);
      }
    } else if (this.burnTimer > 0) {
      // Slight fire panic damping on land while burning
      speed *= 0.88;
    } else if (nowTouchingQuicksand) {
      // Quicksand drag scales with stamina: more exhausted = fatigued & barely able to move
      const qsStaminaRatio = Math.max(0, this.stamina / this.maxStamina);
      let qsSpeedMult = 0.035 + Math.pow(qsStaminaRatio, 1.3) * 0.32; // 0.35 at full -> 0.035 at empty
      if (this.isStaminaExhausted || this.stamina <= 0) {
        qsSpeedMult = Math.min(qsSpeedMult, 0.035); // Fatigued: barely able to move
      }
      speed *= qsSpeedMult;
    } else if (this.isInWater && !this.isFlying) {
      speed *= 0.72; // Fluid drag damping on horizontal movement
    } else if (isSneaking && !this.isFlying) {
      speed *= 0.4;
    } else if (this.consecutiveStepCount >= 2 && !this.isFlying) {
      speed *= 0.85; // Traversing continuous slopes: fluid hill climbing
    } else if ((this.justSteppedUp || this.stepUpTimer > 0) && !this.isFlying) {
      speed *= 0.92; // Single step-up
    }

    if (this.isNimbusMounted) {
      // 6-DOF Aerial Flight Kinematics for Nimbus Cloud Mount
      const mountSpeed = isSprinting ? this.nimbusTurboSpeed : this.nimbusCruiseSpeed;
      
      const targetVx = inputDir.x * mountSpeed;
      const targetVy = inputDir.y * mountSpeed;
      const targetVz = inputDir.z * mountSpeed;

      // Smooth acceleration and aerodynamic glide damping
      const lerpFactor = delta * 9.0;
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, lerpFactor);
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetVy, lerpFactor);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, lerpFactor);

      // Perform separate-axis AABB collision resolution against solid voxel terrain
      this.moveAndCollideNimbus(delta, world);

      // Prevent falling into the void
      if (this.position.y < 1.0) {
        this.position.y = 1.0;
        this.velocity.y = Math.max(0, this.velocity.y);
      }

      this.isGrounded = false;
      this.isClimbing = false;
      return;
    }

    if (this.isFlying) {
      // Flight movement (WASD + Space to ascend, Shift to descend)
      this.velocity.x = inputDir.x * speed;
      this.velocity.z = inputDir.z * speed;
      this.velocity.y = inputDir.y * speed;

      this.position.x += this.velocity.x * delta;
      this.position.y += this.velocity.y * delta;
      this.position.z += this.velocity.z * delta;
      return;
    }

    // --- WALL PROXIMITY & CLIMBING DETECTION ---
    let isAgainstWall = false;
    let isLedgePresent = false;
    const wallDirNorm = new THREE.Vector3();

    if (!this.isInWater && !this.isFlying) {
      const directions = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ];

      for (const d of directions) {
        const checkX = Math.floor(this.position.x + d.x * 0.45);
        const checkZ = Math.floor(this.position.z + d.z * 0.45);
        const feetY = Math.floor((this.position.y + 0.2) * 2.0);
        const chestY = Math.floor((this.position.y + 1.2) * 2.0);
        const aboveHeadY = Math.floor((this.position.y + 1.9) * 2.0);

        const chestBlock = world.getBlock(checkX, chestY, checkZ);
        const feetBlock = world.getBlock(checkX, feetY, checkZ);
        const aboveHeadBlock = world.getBlock(checkX, aboveHeadY, checkZ);

        // Ignore AIR, WATER, and UNLOADED chunks to prevent false wall detection
        if (
          chestBlock === BlockType.AIR ||
          chestBlock === BlockType.WATER ||
          chestBlock === BlockType.UNLOADED ||
          feetBlock === BlockType.UNLOADED
        ) {
          continue;
        }

        const chestDef = BLOCK_DEFINITIONS[chestBlock];
        const feetDef = BLOCK_DEFINITIONS[feetBlock];

        // Wall climbing requires a solid non-liquid vertical wall at chest & feet level
        const isSolidChestWall = !!(chestDef && !chestDef.isLiquid);
        const isSolidFeetWall = !!(feetDef && !feetDef.isLiquid);

        if (isSolidChestWall && isSolidFeetWall) {
          isAgainstWall = true;
          wallDirNorm.copy(d);
          this.wallNormal.copy(d).negate(); // Outward surface normal pointing into open space

          const aboveDef = BLOCK_DEFINITIONS[aboveHeadBlock];
          if (!aboveDef || aboveHeadBlock === BlockType.AIR || aboveHeadBlock === BlockType.UNLOADED) {
            isLedgePresent = true;
          }
          break;
        }
      }
    }

    const inVineBlock = world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y * 2.0), Math.floor(this.position.z)) === BlockType.JUNGLE_VINES ||
                        world.getBlock(Math.floor(this.position.x), Math.floor((this.position.y + 0.8) * 2.0), Math.floor(this.position.z)) === BlockType.JUNGLE_VINES;

    if (inVineBlock) {
      isAgainstWall = true;
      wallDirNorm.set(0, 0, 1);
      this.wallNormal.set(0, 0, -1);
      if (this.velocity.y < -3.0) {
        this.velocity.y = -3.0; // Cushion fall through vines
      }
    }

    this.isAtLedge = isLedgePresent;

    // Trigger Wall Climbing State & Persistent Wall Hold Stance
    // Enter climb: when against wall, in air, pressing Space or W into wall, AND NOT stamina exhausted
    // Maintain climb: when already climbing, against wall, not grounded, NOT pressing Shift, AND stamina > 0
    const canInitiateClimb = (isAgainstWall || inVineBlock) && !this.isGrounded && (isJumping || inputDir.z < -0.1) && !this.isStaminaExhausted;
    const canMaintainClimb = this.isClimbing && isAgainstWall && !this.isGrounded && !isSneaking && this.stamina > 0;

    if (canInitiateClimb || canMaintainClimb) {
      if (!this.isClimbing) {
        this.climbStartY = this.position.y;
        this.climbDuration = 0;
      }
      this.isClimbing = true;
      this.climbDuration += delta;
      this.wallNormal.copy(wallDirNorm);

      let isMovingOnWall = false;

      if (inputDir.z < -0.1 || isJumping) {
        // Climbing UP
        this.velocity.y = this.climbUpSpeed;
        this.climbAction = 'climb_up';
        isMovingOnWall = true;
      } else if (inputDir.z > 0.1) {
        // Climbing DOWN
        this.velocity.y = this.climbDownSpeed;
        this.climbAction = 'climb_down';
        isMovingOnWall = true;
      } else if (inputDir.x < -0.1) {
        // Shimmy LEFT
        this.velocity.y = 0;
        this.climbAction = 'climb_left';
        isMovingOnWall = true;
      } else if (inputDir.x > 0.1) {
        // Shimmy RIGHT
        this.velocity.y = 0;
        this.climbAction = 'climb_right';
        isMovingOnWall = true;
      } else {
        // Stationary Wall Hold Stance (Climb Idle)
        this.velocity.y = 0;
        this.climbAction = 'climb_idle';
      }

      // Stamina Drain while climbing
      const drainRate = isMovingOnWall ? this.staminaDrainRateActive : this.staminaDrainRateIdle;
      this.stamina = Math.max(0, this.stamina - drainRate * delta);
      if (this.stamina <= 0) {
        this.isStaminaExhausted = true;
        this.isClimbing = false;
        this.climbAction = 'idle';
      }

      // Ledge Vault Trigger: Pull player onto top block surface!
      if (this.isClimbing && isLedgePresent && (inputDir.z < -0.1 || isJumping)) {
        const climbHeightGained = Math.max(0, this.position.y - this.climbStartY);
        
        // Calculate exact surface Y in half-block grid (0.5m steps)
        const targetGridY = Math.floor((this.position.y + 0.6) * 2.0);
        this.position.y = (targetGridY / 2.0) + 0.02;
        this.position.x += wallDirNorm.x * 0.35;
        this.position.z += wallDirNorm.z * 0.35;

        // Anti-Stuck Safety: If inside a block after vaulting, adjust Y upwards to surface
        if (this.checkCollision(world)) {
          this.position.y += 0.5;
          if (this.checkCollision(world)) {
            // Revert horizontal push if still blocked
            this.position.x -= wallDirNorm.x * 0.35;
            this.position.z -= wallDirNorm.z * 0.35;
          }
        }

        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isClimbing = false;
        this.climbAction = 'idle';

        // Only trigger Stand Up animation for actual high-wall climbs (>= 2.5m height or >= 0.5s climb time)
        if (climbHeightGained >= 2.5 || this.climbDuration >= 0.5) {
          this.justLedgeVaulted = true;
          this.standUpTimer = 0.9;
        } else {
          this.justLedgeVaulted = false;
          this.standUpTimer = 0;
        }
      }
    } else {
      this.isClimbing = false;
      this.climbAction = 'idle';
    }

    // Stamina Regeneration when on solid ground or not climbing (NOT in quicksand)
    if (this.isGrounded && !nowTouchingQuicksand) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * delta);
      if (this.stamina >= 25.0) {
        this.isStaminaExhausted = false; // Recovered minimum grip strength
      }
    }

    // Tick Stand Up & Step Up animation timers
    if (this.standUpTimer > 0) {
      this.standUpTimer -= delta;
      if (this.standUpTimer <= 0) {
        this.justLedgeVaulted = false;
      }
    }
    if (this.stepUpTimer > 0) {
      this.stepUpTimer -= delta;
      if (this.stepUpTimer <= 0) {
        this.justSteppedUp = false;
      }
    }
    if (this.consecutiveStepTimer > 0) {
      this.consecutiveStepTimer -= delta;
      if (this.consecutiveStepTimer <= 0) {
        this.consecutiveStepCount = 0;
      }
    }

    // Swimming & Gravity Physics
    if (this.isInWater) {
      if (isJumping) {
        // Swim Up / Ascend (Full responsiveness during 0.4s magma grace period; dampened only when fully submerged)
        this.velocity.y = (nowTouchingMagma && this.magmaContactDuration >= 0.4) ? 2.2 : 4.2;
      } else if (isSneaking) {
        // Dive Down / Descend
        this.velocity.y = -3.8;
      } else {
        // Gentle liquid drag & float towards neutral buoyancy
        this.velocity.y += (this.gravity * 0.08) * delta;
        this.velocity.y = Math.max(this.velocity.y, -1.8);
      }
    } else if (!this.isClimbing) {
      if (nowTouchingQuicksand) {
        const isMoving = Math.abs(inputDir.x) > 0.01 || Math.abs(inputDir.z) > 0.01;

        // Find the top surface of the quicksand pool in the current column
        const feetYIndex = Math.floor((this.position.y - 0.1) * 2.0);
        let topQsBlockY = feetYIndex;
        for (let checkY = feetYIndex + 4; checkY >= feetYIndex - 3; checkY--) {
          if (world.getBlock(Math.floor(this.position.x), checkY, Math.floor(this.position.z)) === BlockType.MUDDY_QUICKSAND) {
            topQsBlockY = checkY;
            break;
          }
        }
        const qsSurfaceY = (topQsBlockY + 1.0) * 0.5;

        // Moving in quicksand drains stamina (struggling), standing still regenerates stamina slowly!
        if (isMoving) {
          this.stamina = Math.max(0, this.stamina - this.staminaDrainQuicksandActive * delta);
          if (this.stamina <= 0) {
            this.isStaminaExhausted = true;
          }
        } else {
          // Standing still / idle in quicksand: slowly catch breath and recover stamina
          this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenQuicksandIdle * delta);
          if (this.stamina >= 20.0) {
            this.isStaminaExhausted = false; // Recovered enough stamina to attempt wading again
          }
        }

        // Sink depth proportional to stamina:
        // 100% stamina = 0.25m sink (ankle/calf deep, easy wading)
        // 50% stamina  = 0.95m sink (chest-deep)
        // 0% stamina   = 1.95m sink (fully submerged, head below quicksand surface!)
        const staminaRatio = Math.max(0, this.stamina / this.maxStamina);
        const minSink = 0.25;
        const maxSink = 1.95;
        const targetSinkDepth = minSink + (1.0 - staminaRatio) * (maxSink - minSink);
        const targetY = qsSurfaceY - targetSinkDepth;

        if (isMoving) {
          if (this.stamina > 0 && !this.isStaminaExhausted) {
            // Wading with energy: smoothly hold/pull toward stamina target depth
            const diff = targetY - this.position.y;
            this.velocity.y = Math.max(-1.0, Math.min(1.0, diff * 3.0));
          } else {
            // Fatigued / Zero stamina: struggling frantically sinks the player downward
            const diff = targetY - this.position.y;
            this.velocity.y = Math.max(-0.6, Math.min(0.1, diff * 2.0 - 0.15));
          }
        } else {
          // Standing still: gravity and mud suction steadily pull player toward target depth
          const diff = targetY - this.position.y;
          if (diff < -0.01) {
            this.velocity.y = Math.max(-0.35, diff * 1.5);
          } else if (diff > 0.05 && this.stamina > 30.0) {
            this.velocity.y = Math.min(0.4, diff * 1.2);
          } else {
            this.velocity.y = 0;
          }
        }

        // Quicksand suction prevents jumping completely
        this.isGrounded = false;
      } else {
        this.velocity.y += this.gravity * delta;
        if (this.isGrounded && isJumping) {
          // Dampen jump height if standing on molten magma
          this.velocity.y = nowTouchingMagma ? 2.2 : this.jumpSpeed;
          this.isGrounded = false;
        }
      }
    }

    // Roll Cooldown Tick
    if (this.rollCooldown > 0) {
      this.rollCooldown = Math.max(0, this.rollCooldown - delta);
    }

    // Horizontal velocity & Input Suppression
    if (this.isRolling) {
      this.rollTimer -= delta;
      this.velocity.x = this.rollDirection.x * this.rollSpeed;
      this.velocity.z = this.rollDirection.z * this.rollSpeed;
      if (this.rollTimer <= 0) {
        this.isRolling = false;
      }
    } else if (this.standUpTimer > 0 || this.justLedgeVaulted || this.isClimbing) {
      if (this.isClimbing) {
        // While climbing, constrain horizontal velocity along wall tangent so S/W don't pull player off wall
        const wallTangentX = -this.wallNormal.z;
        const wallTangentZ = this.wallNormal.x;
        if (inputDir.x < -0.1) {
          // Shimmy LEFT along wall surface
          this.velocity.x = -wallTangentX * this.shimmySpeed;
          this.velocity.z = -wallTangentZ * this.shimmySpeed;
        } else if (inputDir.x > 0.1) {
          // Shimmy RIGHT along wall surface
          this.velocity.x = wallTangentX * this.shimmySpeed;
          this.velocity.z = wallTangentZ * this.shimmySpeed;
        } else {
          // No horizontal drift into/away from wall
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      } else {
        // Input Suppression during 0.9s Stand Up sequence
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    } else {
      this.velocity.x = inputDir.x * speed;
      this.velocity.z = inputDir.z * speed;
    }

    // Unloaded Chunk Safety Protection: Freeze fall speed if stepping over unrendered/unloaded chunk
    const isChunkLoaded = world.isChunkLoaded(this.position.x, this.position.z);
    if (!isChunkLoaded && !this.isFlying) {
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }

    // Void Fall Safety Net: Auto-recovery if player falls below world bounds into void
    if (this.position.y < -5.0) {
      this.respawnFromVoid(world);
      return;
    }

    // Separate axis AABB collision resolution (X, Z, Y)
    this.moveAndCollide(delta, world);
  }

  private respawnFromVoid(world: VoxelWorld): void {
    let topY = 40;
    for (let y = 63; y >= 0; y--) {
      const type = world.getBlock(Math.floor(this.position.x), y, Math.floor(this.position.z));
      if (type !== BlockType.AIR && type !== BlockType.UNLOADED) {
        topY = y + 2;
        break;
      }
    }
    this.position.y = topY * 0.5;
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.health = Math.max(10, this.health - 10);
    this.justTookDamage = true;
  }

  private moveAndCollide(delta: number, world: VoxelWorld): void {
    // X Axis Movement with smooth 0.25m / 0.50m micro-step resolution
    const oldX = this.position.x;
    this.position.x += this.velocity.x * delta;
    if (this.checkCollision(world)) {
      // 1. Try gentle 0.25m half-step (slabs / stepped micro-blocks)
      this.position.y += 0.28;
      if (!this.checkCollision(world)) {
        this.stepUpTimer = 0.12;
        this.isGrounded = true;
        this.velocity.y = 0;
      } else {
        // 2. Try full block step-up (0.55m)
        this.position.y += 0.27; // total +0.55m
        if (!this.checkCollision(world)) {
          if (this.consecutiveStepTimer > 0) {
            this.consecutiveStepCount++;
          } else {
            this.consecutiveStepCount = 1;
          }
          this.consecutiveStepTimer = 0.6;
          this.justSteppedUp = true;
          this.stepUpTimer = 0.20;
          this.isGrounded = true;
          this.velocity.y = 0;
        } else {
          this.position.y -= 0.55;
          this.position.x = oldX;
          this.velocity.x = 0;
        }
      }
    }

    // Z Axis Movement with smooth 0.25m / 0.50m micro-step resolution
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * delta;
    if (this.checkCollision(world)) {
      // 1. Try gentle 0.25m half-step (slabs / stepped micro-blocks)
      this.position.y += 0.28;
      if (!this.checkCollision(world)) {
        this.stepUpTimer = 0.12;
        this.isGrounded = true;
        this.velocity.y = 0;
      } else {
        // 2. Try full block step-up (0.55m)
        this.position.y += 0.27; // total +0.55m
        if (!this.checkCollision(world)) {
          if (this.consecutiveStepTimer > 0) {
            this.consecutiveStepCount++;
          } else {
            this.consecutiveStepCount = 1;
          }
          this.consecutiveStepTimer = 0.6;
          this.justSteppedUp = true;
          this.stepUpTimer = 0.20;
          this.isGrounded = true;
          this.velocity.y = 0;
        } else {
          this.position.y -= 0.55;
          this.position.z = oldZ;
          this.velocity.z = 0;
        }
      }
    }

    // Y Axis Movement (Vertical)
    this.position.y += this.velocity.y * delta;
    this.isGrounded = false;

    if (this.checkCollision(world)) {
      if (this.velocity.y < 0) {
        const impactSpeed = -this.velocity.y; // Downward speed in blocks/sec upon impact
        this.isGrounded = true;

        // Check if landing on leaves or foliage
        const blockBelow = world.getBlock(
          Math.floor(this.position.x),
          Math.floor((this.position.y - 0.1) * 2.0),
          Math.floor(this.position.z)
        );
        const feetCurrent = world.getBlock(
          Math.floor(this.position.x),
          Math.floor((this.position.y + 0.1) * 2.0),
          Math.floor(this.position.z)
        );

        const landedOnLeaves = this.isLeafBlock(blockBelow) || this.isLeafBlock(feetCurrent);

        // Fall Damage Threshold:
        // - Safe landing threshold: 17.5 blocks/sec (safe up to ~5.5 blocks fall height, allowing jumping off trees/canopies)
        // - Leaves, water, liquid submersion, and flying completely cancel fall damage!
        // - Dodge rolling into a landing reduces fall damage by 60%
        if (!this.isInWater && !this.isSubmerged && !this.isFlying && !landedOnLeaves && impactSpeed > 17.5) {
          let fallDamage = Math.floor((impactSpeed - 17.5) * 2.0);
          if (this.isRolling) {
            fallDamage = Math.floor(fallDamage * 0.4); // 60% fall damage reduction when rolling into landing
          }
          if (this.isDroppedByDragon) {
            fallDamage = Math.min(20, fallDamage);
            this.isDroppedByDragon = false;
          }
          if (fallDamage > 0) {
            this.takeDamage(fallDamage);
            console.log(`💥 FALL DAMAGE IMPACT! Downward Speed: ${impactSpeed.toFixed(1)} blocks/s -> Took ${fallDamage} damage! HP: ${this.health}/${this.maxHealth}`);
          }
        } else {
          this.isDroppedByDragon = false;
        }
      }
      this.position.y -= this.velocity.y * delta;
      this.velocity.y = 0;
    }
  }

  private moveAndCollideNimbus(delta: number, world: VoxelWorld): void {
    // 1. X Axis Collision Resolution
    const oldX = this.position.x;
    this.position.x += this.velocity.x * delta;
    if (this.checkCollision(world)) {
      this.position.x = oldX;
      this.velocity.x = 0;
    }

    // 2. Z Axis Collision Resolution
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * delta;
    if (this.checkCollision(world)) {
      this.position.z = oldZ;
      this.velocity.z = 0;
    }

    // 3. Y Axis Collision Resolution (Vertical flight into ceilings or terrain surface)
    const oldY = this.position.y;
    this.position.y += this.velocity.y * delta;
    if (this.checkCollision(world)) {
      this.position.y = oldY;
      this.velocity.y = 0;
    }
  }

  // Check if player's AABB bounding box intersects any solid block
  private checkCollision(world: VoxelWorld): boolean {
    const minX = Math.floor(this.position.x - this.width / 2);
    const maxX = Math.floor(this.position.x + this.width / 2);
    const minY = Math.floor(this.position.y * 2.0);
    const maxY = Math.floor((this.position.y + this.height) * 2.0);
    const minZ = Math.floor(this.position.z - this.width / 2);
    const maxZ = Math.floor(this.position.z + this.width / 2);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const type = world.getBlock(x, y, z);
          if (type !== BlockType.AIR && type !== BlockType.WATER && type !== BlockType.OASIS_WATER && type !== BlockType.JUNGLE_WATER) {
            if (type === BlockType.MUDDY_QUICKSAND) {
              // Dynamic quicksand floor based on stamina: deeper sink as stamina depletes
              const quicksandTop = (y + 1.0) * 0.5;
              const staminaRatio = Math.max(0, this.stamina / this.maxStamina);
              const minSink = 0.25;
              const maxSink = 1.95;
              const dynamicSinkFloor = quicksandTop - (minSink + (1.0 - staminaRatio) * (maxSink - minSink)) - 0.05;
              if (this.position.y <= dynamicSinkFloor) {
                return true; // Stop player from sinking deeper than stamina allows
              }
              continue; // Allow wading and sinking above the dynamic floor
            }
            const def = BLOCK_DEFINITIONS[type];
            if (def && !def.isLiquid) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  public isLeafBlock(type: BlockType): boolean {
    return (
      type === BlockType.OAK_LEAVES ||
      type === BlockType.FROST_LEAVES ||
      type === BlockType.PALM_FRONDS ||
      type === BlockType.TEAL_LEAVES ||
      type === BlockType.BLUE_LEAVES ||
      type === BlockType.PURPLE_LEAVES ||
      type === BlockType.CHARRED_LEAVES ||
      type === BlockType.JUNGLE_LEAVES
    );
  }

  public getCameraPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
  }
}
