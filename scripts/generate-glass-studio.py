#!/usr/bin/env python3
"""Create an original linear HDR reflection studio. No Blender or third-party images."""
from math import sin, pi, frexp
from pathlib import Path

WIDTH, HEIGHT = 1024, 512

def smooth_edge(distance, half_size, feather):
    t = max(0.0, min(1.0, (half_size + feather - distance) / feather))
    return t * t * (3.0 - 2.0 * t)

def panel(longitude, latitude, center, elevation, width, height, feather=2.0):
    delta = abs((longitude - center + 180) % 360 - 180)
    return smooth_edge(delta, width / 2, feather) * smooth_edge(abs(latitude - elevation), height / 2, feather)

def encode_channel(values):
    result = bytearray()
    start = 0
    while start < len(values):
        run = 1
        while start + run < len(values) and run < 127 and values[start + run] == values[start]:
            run += 1
        if run >= 4:
            result.extend((128 + run, values[start])); start += run
            continue
        end = start + 1
        while end < len(values) and end - start < 127:
            if end + 3 < len(values) and len(set(values[end:end + 4])) == 1:
                break
            end += 1
        result.append(end - start); result.extend(values[start:end]); start = end
    return result

output = Path(__file__).resolve().parents[1] / 'public/assets/environment/glass-studio.hdr'
with output.open('wb') as image:
    image.write(f'#?RADIANCE\n# Original procedural glass studio, MIT\nFORMAT=32-bit_rle_rgbe\n\n-Y {HEIGHT} +X {WIDTH}\n'.encode())
    for y in range(HEIGHT):
        latitude = 90 - (y + 0.5) / HEIGHT * 180
        channels = [bytearray() for _ in range(4)]
        for x in range(WIDTH):
            longitude = (x + 0.5) / WIDTH * 360 - 180
            background = 0.10 + 0.10 * max(0, sin(latitude * pi / 180))
            if latitude < -25:
                background = 0.25
            main = panel(longitude, latitude, -42, 12, 17, 87, 2.5) * 6.5
            strip = panel(longitude, latitude, 68, 8, 5.5, 100, 1.2) * 4.0
            fill = panel(longitude, latitude, 175, 20, 52, 70, 10) * 0.65
            top = panel(longitude, latitude, -30, 72, 100, 16, 5) * 2.0
            # Dark flags immediately beside the softboxes give the rim a readable contour.
            flag = panel(longitude, latitude, -58, 5, 9, 110, 2) * 0.08
            light = max(0.008, background - flag) + main + strip + fill + top
            rgb = [light * 1.015, light, light * 0.98]
            _, exponent = frexp(max(rgb))
            scale = 256.0 / (2.0 ** exponent)
            for channel, value in enumerate(rgb):
                channels[channel].append(max(0, min(255, int(value * scale))))
            channels[3].append(exponent + 128)
        image.write(bytes((2, 2, WIDTH >> 8, WIDTH & 255)))
        for channel in channels:
            image.write(encode_channel(channel))
print(f'Created {output.name}: {output.stat().st_size:,} bytes')
