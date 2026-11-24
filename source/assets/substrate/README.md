# Soil microtexture

The two maps are adapted from [Brown Mud Rocks 01 by Poly Haven](https://polyhaven.com/a/brown_mud_rocks_01), [CC0](https://polyhaven.com/license).

- `normal.jpg`: OpenGL normal map (official 1K JPEG), resized to 512×512.
- `roughness.jpg`: roughness (official 1K JPEG), resized to 512×512 and remapped to a narrow matte range (179 + 0.29 × the original 8-bit value).

The offline builder embeds both. Only the soil samples them; the soil and stone albedos are unchanged. No diffuse/color texture from this asset is used.
