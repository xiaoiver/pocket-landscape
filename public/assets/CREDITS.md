# Asset sources

The following Poly Haven assets are distributed under CC0 1.0:

- **Moss 01**, Rob Tuytel — https://polyhaven.com/a/moss_01
  - `moss/moss_01_1k.gltf`, binary geometry, 1K diffuse / normal / ARM maps.
  - The independent 1K Alpha PNG is included because the glTF package references a JPEG diffuse map without an alpha channel. The application applies the mask with alpha testing.
  - Twelve sprig variants are scattered using GPU thin instances. Source geometry is unchanged.
- **Studio Small 09**, Sergej Majboroda — https://polyhaven.com/a/studio_small_09
  - `environment/studio_small_09_1k.hdr`; prefiltered at runtime by Babylon.js.

License: https://polyhaven.com/license (CC0 1.0 Universal).

The glass vessel, curved plant meshes, Fittonia vein textures, green leaf textures, terrain and soil textures are original procedural work in this repository, covered by its MIT license. They do not require Blender or an image generation service. The reference photographs are not bundled.
