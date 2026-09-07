import { createNoise2D, createNoise3D } from 'simplex-noise';

export class TerrainNoise {
  private noise2D: (x: number, y: number) => number;
  private noise3D: (x: number, y: number, z: number) => number;

  constructor(seed: number = 1337) {
    // Simple pseudo-random generator from seed for simplex-noise
    const alea = (s: number) => {
      let mask = 0xffffffff;
      let m_w = (123456789 + s) & mask;
      let m_z = (987654321 - s) & mask;
      return () => {
        m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
        m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
        let result = ((m_z << 16) + m_w) & mask;
        return (result < 0 ? result + 4294967296 : result) / 4294967296;
      };
    };

    const prng = alea(seed);
    this.noise2D = createNoise2D(prng);
    this.noise3D = createNoise3D(prng);
  }

  // Multi-octave 2D noise (FBM)
  public octaveNoise2D(x: number, z: number, octaves: number = 4, persistence: number = 0.5, scale: number = 0.01): number {
    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }

  // 3D Noise for caves and 3D terrain features
  public noise3DVal(x: number, y: number, z: number, scale: number = 0.03): number {
    return this.noise3D(x * scale, y * scale, z * scale);
  }
}
