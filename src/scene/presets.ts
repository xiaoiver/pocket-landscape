export type WeatherPresetId = "clear" | "overcast" | "dusk";

export interface WeatherPreset {
  id: WeatherPresetId;
  label: string;
  description: string;
  clearColor: readonly [number, number, number];
  fogColor: readonly [number, number, number];
  ambient: readonly [number, number, number];
  fogDensity: number;
  hemiIntensity: number;
  hemiDiffuse: readonly [number, number, number];
  hemiGround: readonly [number, number, number];
  sunIntensity: number;
  sunDiffuse: readonly [number, number, number];
  sunDirection: readonly [number, number, number];
}

export const weatherPresets: Record<WeatherPresetId, WeatherPreset> = {
  clear: {
    id: "clear",
    label: "晴朗",
    description: "偏暖的日光",
    clearColor: [0.62, 0.78, 0.86],
    fogColor: [0.7, 0.82, 0.88],
    ambient: [0.28, 0.3, 0.28],
    fogDensity: 0.012,
    hemiIntensity: 0.55,
    hemiDiffuse: [1, 0.98, 0.94],
    hemiGround: [0.32, 0.36, 0.28],
    sunIntensity: 1.05,
    sunDiffuse: [1, 0.96, 0.88],
    sunDirection: [-0.45, -1, -0.2],
  },
  overcast: {
    id: "overcast",
    label: "阴天",
    description: "冷色，雾更浓",
    clearColor: [0.52, 0.58, 0.62],
    fogColor: [0.58, 0.62, 0.64],
    ambient: [0.34, 0.36, 0.38],
    fogDensity: 0.05,
    hemiIntensity: 0.8,
    hemiDiffuse: [0.8, 0.85, 0.9],
    hemiGround: [0.26, 0.28, 0.27],
    sunIntensity: 0.22,
    sunDiffuse: [0.75, 0.8, 0.85],
    sunDirection: [-0.12, -1, -0.05],
  },
  dusk: {
    id: "dusk",
    label: "黄昏",
    description: "低角度暖光",
    clearColor: [0.78, 0.46, 0.36],
    fogColor: [0.7, 0.4, 0.34],
    ambient: [0.42, 0.26, 0.2],
    fogDensity: 0.03,
    hemiIntensity: 0.48,
    hemiDiffuse: [0.95, 0.58, 0.42],
    hemiGround: [0.16, 0.12, 0.18],
    sunIntensity: 1.2,
    sunDiffuse: [1, 0.52, 0.28],
    sunDirection: [-1.15, -0.32, -0.2],
  },
};

export const weatherPresetList: readonly WeatherPreset[] = [
  weatherPresets.clear,
  weatherPresets.overcast,
  weatherPresets.dusk,
];
