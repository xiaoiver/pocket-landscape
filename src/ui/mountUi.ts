import { weatherPresetList, type WeatherPresetId } from "../scene/presets";
import { assetStubs } from "./catalog";

export interface UiOptions {
  initialPreset: WeatherPresetId;
  onPreset: (id: WeatherPresetId) => void;
}

export function mountUi(options: UiOptions): void {
  const assetRoot = document.querySelector<HTMLElement>("#asset-list");
  const presetRoot = document.querySelector<HTMLElement>("#preset-list");
  const status = document.querySelector<HTMLElement>("#status");
  if (!assetRoot || !presetRoot || !status) {
    throw new Error("界面节点缺失：需要 #asset-list、#preset-list 和 #status");
  }

  for (const asset of assetStubs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    fillChip(button, asset.label, asset.source);
    button.addEventListener("click", () => {
      const message = `「${asset.label}」还在素材清单里，模型尚未导入。`;
      status.textContent = message;
      console.info("[资产]", asset.id, message);
    });
    assetRoot.append(button);
  }

  const buttons = new Map<WeatherPresetId, HTMLButtonElement>();

  const select = (id: WeatherPresetId): void => {
    for (const [presetId, button] of buttons) {
      button.setAttribute("aria-pressed", String(presetId === id));
    }
    const preset = weatherPresetList.find((item) => item.id === id);
    if (preset) {
      status.textContent = `当前光照：${preset.label}`;
    }
  };

  for (const preset of weatherPresetList) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    fillChip(button, preset.label, preset.description);
    button.addEventListener("click", () => {
      select(preset.id);
      options.onPreset(preset.id);
      console.info("[天气/光照]", preset.id, preset.label);
    });
    buttons.set(preset.id, button);
    presetRoot.append(button);
  }

  select(options.initialPreset);
}

function fillChip(button: HTMLButtonElement, label: string, note: string): void {
  const name = document.createElement("span");
  name.textContent = label;
  const meta = document.createElement("span");
  meta.className = "note";
  meta.textContent = note;
  button.append(name, meta);
}
