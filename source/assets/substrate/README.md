# Soil microtexture

The original two maps are adapted from [Brown Mud Rocks 01 by Poly Haven](https://polyhaven.com/a/brown_mud_rocks_01), [CC0](https://polyhaven.com/license).

- `normal.jpg`: OpenGL normal map (official 1K JPEG), resized to 512×512.
- `roughness.jpg`: roughness (official 1K JPEG), resized to 512×512 and remapped to a narrow matte range (179 + 0.29 × the original 8-bit value).

The viewer uses the roughness map with `humus.jpg` and `humus-normal.jpg`. The latter pair is generated from one periodic clod, grit and bark height field by `source/soil-aggregate.py` (NumPy and Pillow). All three maps are embedded by the offline builder.
