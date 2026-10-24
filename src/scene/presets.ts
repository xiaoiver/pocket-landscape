export type WeatherPresetId = "clear" | "overcast" | "dusk";
type RGB = readonly [number, number, number];
export interface WeatherPreset {
  id: WeatherPresetId;
  label: string;
  description: string;
  keyIntensity: number;
  keyColor: RGB;
  keyDirection: RGB;
  fillIntensity: number;
  fillColor: RGB;
  environmentIntensity: number;
  environmentRotation: number;
  exposure: number;
}
export const weatherPresets: Record<WeatherPresetId, WeatherPreset> = {
  clear: {
    id: "clear",
    label: "晴朗",
    description: "偏暖的日光",
    keyIntensity: 2.1,
    keyColor: [1, 0.96, 0.88],
    keyDirection: [-0.45, -1, 0.6],
    fillIntensity: 0.55,
    fillColor: [1, 0.98, 0.94],
    environmentIntensity: 0.9,
    environmentRotation: 0.5,
    exposure: 1.1,
  },
  overcast: {
    id: "overcast",
    label: "阴天",
    description: "漫射柔光",
    keyIntensity: 0.44,
    keyColor: [0.75, 0.8, 0.85],
    keyDirection: [-0.12, -1, 0.45],
    fillIntensity: 0.8,
    fillColor: [0.8, 0.85, 0.9],
    environmentIntensity: 1.0,
    environmentRotation: 0.5,
    exposure: 1.1,
  },
  dusk: {
    id: "dusk",
    label: "黄昏",
    description: "低角度暖光",
    keyIntensity: 2.4,
    keyColor: [1, 0.52, 0.28],
    keyDirection: [-1.15, -0.32, 0.6],
    fillIntensity: 0.48,
    fillColor: [0.95, 0.58, 0.42],
    environmentIntensity: 0.55,
    environmentRotation: 1.2,
    exposure: 0.95,
  },
};
export const weatherPresetList: readonly WeatherPreset[] = [
  weatherPresets.clear,
  weatherPresets.overcast,
  weatherPresets.dusk,
];
