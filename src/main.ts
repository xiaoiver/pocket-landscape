import { createLandscapeScene } from "./scene/createScene";
import { mountUi } from "./ui/mountUi";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
if (!canvas) {
  throw new Error("找不到渲染画布 #renderCanvas");
}

const landscape = createLandscapeScene(canvas);
const initialPreset = "clear" as const;

mountUi({
  initialPreset,
  onPreset: (id) => landscape.applyPreset(id),
});

const onResize = (): void => {
  landscape.engine.resize();
};

window.addEventListener("resize", onResize);
landscape.engine.resize();
landscape.engine.runRenderLoop(() => {
  landscape.scene.render();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener("resize", onResize);
    landscape.engine.dispose();
  });
}
