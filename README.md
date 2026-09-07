# NETHERCRAFT 🌋⚔️

**NetherCraft** is an immersive, high-performance voxel-based RPG and sandbox adventure built for the web with **Three.js**, **TypeScript**, and **Vite**.

Explore vast procedural biomes, tame mounts, harvest mythical resources, craft weapons, and battle custom-animated entities like the Emberwynn Dragon, Biome Serpents, Dunesting Scorpions, and Goblin Minions.

---

## 🎮 Features

- **Procedural Voxel Engine**: Dynamically loaded chunk-based voxel terrain with multi-octave simplex noise, ambient occlusion, and block model caching.
- **Dynamic Living World**: Complete day/night cycles, dynamic celestial lighting, animated skydomes, and volumetric cloud rendering.
- **Entity Ecosystem & Custom Animations**:
  - **Mounts**: Nimbus Cloud mount system with flight physics.
  - **Creatures & Wildlife**: Bonecrest Ram, Thornback Boar, Bloomwing Chicken.
  - **Hostiles & Bosses**: Emberwynn Dragon (with projectile fireballs), Biome Serpents (Ashen, Emerald, Frost, Sand), Dunesting Scorpions, and Goblin Minions.
- **Interactive Survival Mechanics**:
  - Tree felling physics & realistic block mining.
  - Ground resource harvesting (Emberpods, Reeds, Stones, Carrots, Apples).
  - First-person animated hands/tools with swing physics.
- **RPG Systems**:
  - Character customizer with full gender/race avatar selection.
  - Survival Tome guide & item codex.
  - Dynamic HUD, health bars, inventory slots, and soundscapes.
- **Audio Engine**: Biome-specific ambient music and reactive SFX for day, night, combat, footsteps, and mining.

---

## 🛠️ Tech Stack

- **Graphics & 3D**: [Three.js](https://threejs.org/) (WebGL)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Noise Algorithms**: `simplex-noise`

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AlwayzPoppin/NETHERCRAFT.git
   cd NETHERCRAFT
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3001`.

---

## 🕹️ Controls

| Key / Input | Action |
| --- | --- |
| **W, A, S, D** | Move |
| **Space** | Jump |
| **Shift** | Sprint |
| **Left Click** | Mine / Attack |
| **Right Click** | Place Block / Interact |
| **E / Tab** | Open Survival Tome / Inventory |
| **1 - 9** | Hotbar Slot Selection |
| **F** | Mount / Dismount (Nimbus Cloud) |

---

## 📜 License

Created by **AlwayzPoppin**. All rights reserved.