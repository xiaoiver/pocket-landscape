import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { random } from "./random";

/** Original procedural texture: no external image-generation service or DCC needed. */
export function leafTexture(scene: Scene, pink: boolean): DynamicTexture {
  const tex = new DynamicTexture(
    pink ? "fittonia-veins" : "green-leaf",
    { width: 1024, height: 1024 },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const rnd = random(pink ? 27 : 52);
  ctx.fillStyle = pink ? "#426c35" : "#254a35";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = `rgba(${pink ? "117,152,66" : "145,171,102"},${rnd() * 0.13})`;
    const s = 1 + rnd() * 5;
    ctx.fillRect(rnd() * 1024, rnd() * 1024, s, s);
  }
  ctx.lineCap = "round";
  function line(points: number[][], width: number, alpha = 1) {
    ctx.beginPath();
    ctx.strokeStyle = pink
      ? `rgba(248,65,113,${alpha})`
      : `rgba(153,181,117,${alpha})`;
    ctx.lineWidth = width;
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }
  line(
    [
      [512, 1024],
      [510, 720],
      [514, 380],
      [512, 0],
    ],
    pink ? 40 : 8,
  );
  // Primary veins, with interconnecting tertiary branches on both sides.
  for (let k = 0; k < 9; k++) {
    const y = 110 + k * 103;
    for (const side of [-1, 1]) {
      const tipY = Math.max(10, y - 145);
      line(
        [
          [512, y + 65],
          [512 + side * 150, y],
          [512 + side * 330, tipY + 15],
          [512 + side * 505, tipY],
        ],
        pink ? 38 : 4,
        0.9,
      );
      if (pink)
        for (let j = 1; j < 5; j++) {
          const x = 512 + side * (j * 92);
          const yy = y + 65 - j * 42;
          line(
            [
              [x, yy],
              [x + side * 16, yy - 52],
              [x + side * 65, yy - 98],
            ],
            17,
            0.95,
          );
          line(
            [
              [x, yy],
              [x + side * 54, yy + 12],
              [x + side * 91, yy - 38],
            ],
            15,
            0.9,
          );
        }
    }
  }
  tex.update(true);
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

export function soilTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("soil-grain", 512, scene, true);
  const ctx = tex.getContext();
  const rnd = random(4);
  ctx.fillStyle = "#30241a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const c = 30 + Math.floor(rnd() * 65);
    ctx.fillStyle = `rgb(${c + 12},${c},${Math.round(c * 0.7)})`;
    ctx.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 4, 1 + rnd() * 3);
  }
  tex.uScale = tex.vScale = 3;
  tex.update();
  return tex;
}
