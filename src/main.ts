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
  onLayer: (id, visible) => landscape.setLayerVisible(id, visible),
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

const status = document.querySelector<HTMLElement>("#status");
if (status) status.textContent = "正在加载苔藓与棚拍环境…";
landscape.ready
  .then(() => {
    if (status) status.textContent = "样板已就绪 · 拖动旋转 / 滚轮缩放";
  })
  .catch((error: unknown) => {
    if (status) status.textContent = "苔藓或环境加载失败，请刷新重试";
    console.error("[场景加载]", error);
  });
