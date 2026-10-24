# 口袋景观 Pocket Landscape

基于 Babylon.js 的交互微景观样板：敞口厚壁玻璃瓶、粉脉网纹草、背景绿叶、苔藓和土壤。相机可旋转与缩放，可切换三组灯光及四个场景图层。无需 Blender。

## 运行

Node.js 20 或以上：

```sh
npm ci
npm run dev
npm run build
npm run test:glass
npm run preview
```

依赖与模型均随项目锁定；模型和 HDRI 在 `public/assets/`，运行时从本站加载，不依赖素材站 CDN。初次打开会在 GPU 上预过滤 HDRI。默认使用 WebGL 2；手机性能尚需在实机上评估。

## 场景实现

- `src/scene/glass.ts`：独立生成外壁、内壁、厚底和圆润瓶口，并分别控制材质。瓶壁用随高度变化的厚度贴图，厚底约 1.1 cm。内壁仅作为反射层进入瓶内场景采样，不再对同一纹理进行递归折射。
- 瓶内采样在支持的设备上使用线性半浮点 HDR，随后统一进行 ACES；不支持时回退到普通纹理。玻璃单独使用带长条柔光箱和黑旗板的原创 HDR 环境，植物的照明保持独立。
- `src/scene/terrarium.ts`：起伏土壤、桌面和碎石。场景单位为 10 cm，普通瓶壁约 2.5 mm。
- `src/scene/vegetation.ts`：弯曲叶片、成对叶序、叶柄与藤茎；12 种 Poly Haven 苔藓枝叶用 5,760 个 GPU thin instances 铺在起伏土壤上。独立 Alpha 遮罩使用 alpha test，避免贴片黑底及透明排序。
- `src/scene/textures.ts`：可重复生成的 1K 粉红叶脉与绿叶纹理，及土壤颗粒纹理。
- `src/scene/createScene.ts`：本地棚拍 HDRI、PBR 环境反射、PCSS 接触硬化软阴影、ACES 色调映射、MSAA / FXAA。像素比上限 1.5，折射目标使用主画面分辨率。
- `src/ui/`：玻璃 / 植物 / 苔藓 / 土壤图层开关，以及晴朗 / 阴天 / 黄昏灯光。

网纹草为程序化形态近似，尚未采用实拍叶片扫描纹理。实时玻璃使用屏幕投影采样，不是离线路径追踪，复杂多层折射和焦散仍有近似。默认关闭雾和景深以便检查模型。

## 素材与授权

Poly Haven **Moss 01**（Rob Tuytel）和 **Studio Small 09**（Sergej Majboroda）均为 CC0。来源、处理方式与许可见 [资产说明](public/assets/CREDITS.md)。可使用 Python 标准库重新下载：

```sh
python3 scripts/download-assets.py
```

自制程序化几何、纹理和代码采用 [MIT](LICENSE)。实物参考照片未打包进仓库。

## 玻璃回归检查

`npm run test:glass` 使用 Babylon NullEngine 检查几何是否有限、内外壁法线方向、反光接缝、非零有效厚度、HDR 与回退配置，以及内壁捕获与图层状态。它不代替 GPU 渲染验证；效果与交互记录见 [验证说明](docs/verification.md)。

重建原创玻璃棚拍环境（仅需 Python 标准库）：

```sh
python3 scripts/generate-glass-studio.py
```

玻璃优化的同构图对比见 [优化前](docs/screenshots/glass-before.png) / [优化后](docs/screenshots/glass-after.png)。
