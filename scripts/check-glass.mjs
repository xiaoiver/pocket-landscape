import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(root, "src/scene/glass.ts"), "utf8");
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /from "(@babylonjs\/[^"]+)"/g,
    (_, path) => 'from "' + path + '.js"',
  );
// Transpile this one TS module so the checks also run on the project's Node 20 baseline.
// Node ESM requires explicit .js extensions on Babylon's deep package imports.
const cache = join(root, "node_modules/.cache");
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(join(cache, "glass-check-"));
const modulePath = join(temporary, "glass.mjs");
await writeFile(modulePath, output);
try {
  const { buildGlass } = await import(pathToFileURL(modulePath).href);
  const engine = new NullEngine({ renderWidth: 640, renderHeight: 480 });
  engine.createCanvas = (width, height) => ({
    width,
    height,
    getContext: () => ({ fillRect() {}, fillStyle: "" }),
  });
  const scene = new Scene(engine);
  // Geometry-only checks must not start the browser's asynchronous BRDF decode.
  scene.environmentBRDFTexture = new BaseTexture(scene);
  engine.getCaps().textureHalfFloatRender = true;
  engine.getCaps().textureHalfFloatLinearFiltering = true;
  const assembly = buildGlass(scene, new CubeTexture("", scene));
  assert.equal(assembly.meshes.length, 4);
  assert.equal(
    assembly.refraction.textureType,
    2,
    "supported HDR capture uses half float",
  );
  for (const mesh of assembly.meshes) {
    const p = mesh.getVerticesData("position"),
      n = mesh.getVerticesData("normal");
    assert(
      p.every(Number.isFinite) && n.every(Number.isFinite),
      mesh.name + " invalid geometry",
    );
    if (mesh.name === "glass-outer-wall" || mesh.name === "glass-inner-wall") {
      const sign = mesh.name === "glass-outer-wall" ? 1 : -1;
      for (let i = 0; i < p.length; i += 3) {
        const r = Math.hypot(p[i], p[i + 2]);
        assert(
          sign * (p[i] * n[i] + p[i + 2] * n[i + 2]) > 0.01 * r,
          "inverted wall normal",
        );
        assert(
          Math.abs(p[i] * n[i + 2] - p[i + 2] * n[i]) < 1e-5,
          "tangential reflection seam",
        );
      }
    }
    if (mesh.material.subSurface.isRefractionEnabled) {
      const sub = mesh.material.subSurface;
      assert(
        sub.maximumThickness > sub.minimumThickness,
        "zero effective shader thickness",
      );
    }
  }
  const rim = assembly.meshes.find((mesh) => mesh.name === "glass-rolled-rim");
  assert(rim.getTotalIndices() / 3 < 12000, "rim geometry exploded");
  const content = MeshBuilder.CreateBox("test-content", {}, scene);
  assembly.updateContents(scene.meshes);
  assert(assembly.refraction.renderList.includes(content));
  for (const mesh of assembly.meshes.filter(
    (m) => m.name !== "glass-inner-wall",
  ))
    assert(
      !assembly.refraction.renderList.includes(mesh),
      "recursive refraction",
    );
  const inner = assembly.meshes.find((m) => m.name === "glass-inner-wall");
  assert(!inner.material.subSurface.isRefractionEnabled);
  assert.equal(assembly.refraction.gammaSpace, false);
  assert.equal(assembly.refraction.useCameraPostProcesses, false);
  assembly.refraction.onBeforeRenderObservable.notifyObservers(0);
  assert(inner.isVisible);
  assembly.refraction.onAfterRenderObservable.notifyObservers(0);
  assert(!inner.isVisible);
  inner.setEnabled(false);
  assembly.refraction.onBeforeRenderObservable.notifyObservers(0);
  assert(!inner.isVisible, "disabled layer appears in capture");
  engine.getCaps().textureHalfFloatRender = false;
  engine.getCaps().textureFloatRender = false;
  const fallback = buildGlass(scene, new CubeTexture("", scene));
  assert.equal(
    fallback.refraction.textureType,
    0,
    "unsupported HDR has a byte fallback",
  );
  console.log(
    "PASS: finite geometry; wall normal orientation; radial seam normals; nonzero shader thickness; linear capture; no recursive refraction; capture-only inner wall and layer state.",
  );
  engine.dispose();
} finally {
  await rm(temporary, { recursive: true, force: true });
}
