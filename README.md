# 口袋景观 Pocket Landscape

在浏览器里布置一座微型景观：玻璃生态瓶风格的苔藓、岩石与植物，并切换天气和光照。

A small browser app for arranging terrarium-style miniature landscapes and switching weather and lighting presets.

## 技术栈

- [Vite](https://vite.dev/)
- TypeScript
- [Babylon.js](https://www.babylonjs.com/)（`@babylonjs/core`）

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`）。按住左键旋转，滚轮缩放。

```bash
npm run build     # 类型检查并打包到 dist/
npm run preview   # 预览生产构建
```

左侧「资产」是占位按钮。右侧可以在晴朗、阴天、黄昏三组光照之间切换，天色、雾和灯光会一起变。

## 计划中的功能

- 资产库：把苔藓、岩石、蕨类、砂土等摆进场景
- 天气与光照预设：晴、阴、黄昏，以及以后更细的雾和天色
- 玻璃器皿场景：生态瓶或浅盘。眼下场景里只有代码生成的浅盘、石块和一株锥形小苗

这一版是可运行的空场景、界面壳和说明。模型文件以后单独加。

## 后续素材来源（CC0）

正式放进仓库前，再逐份核对授权。计划使用：

| 来源 | 打算用来做什么 |
| --- | --- |
| [Poly Haven](https://polyhaven.com/) | 苔藓、岩石、蕨、竹芋（Calathea）、红掌（Anthurium）、砂 |
| [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | 自然小品 |
| [Quaternius](https://quaternius.com/) | 低模植物与环境件 |
| floraZia 的 Fern Moss（[Sketchfab](https://sketchfab.com/)） | 蕨苔 |

还缺现成素材，准备以后自己做，或用 Tripo 一类工具生成：

- 玻璃器皿
- 网纹草（Fittonia）
- 小人偶 / 摆件

## 目录

```
src/scene/     场景、相机、光照与天气预设
src/ui/        资产面板和天气 / 光照面板
src/assets/    以后放模型的位置（目前只有说明）
public/        静态文件
```

## 许可证

代码以 [MIT](LICENSE) 为占位许可。以后引进的模型和贴图遵循各自的许可证，CC0 素材不因放进本仓库而改变授权。
