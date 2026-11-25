"""Bake seamless humus color and tangent normals from the same clods, pores and bark profile."""
from pathlib import Path
import numpy as np
from PIL import Image

out = Path(__file__).parent / 'assets' / 'substrate'
size = 768
rng = np.random.default_rng(78139)
y, x = np.mgrid[:size, :size] / size

def noise(count):
    grid = rng.random((count, count))
    u, v = x * count, y * count
    i, j = np.floor(u).astype(int), np.floor(v).astype(int)
    u, v = u-i, v-j
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    return ((grid[j, i]*(1-u) + grid[j, (i+1)%count]*u)*(1-v)
            + (grid[(j+1)%count, i]*(1-u) + grid[(j+1)%count, (i+1)%count]*u)*v)

def clods(count, u, v):
    # Distances to the two closest irregular seeds give a raised face and
    # a narrow hollow at shared boundaries. Wrap seed indexing at tile edges.
    u, v = u * count, v * count
    i, j = np.floor(u).astype(int), np.floor(v).astype(int)
    seeds = rng.uniform(.07, .93, (count, count, 3))
    near, second, tint = np.full_like(u, 8.), np.full_like(u, 8.), np.zeros_like(u)
    for dj in [-1, 0, 1]:
        for di in [-1, 0, 1]:
            sx, sy, tone = seeds[(j+dj)%count, (i+di)%count].transpose(2, 0, 1)
            dist = np.hypot(u-i-di-sx, v-j-dj-sy)
            closer = dist < near
            second = np.minimum(second, np.maximum(near, dist))
            near = np.minimum(near, dist)
            tint = np.where(closer, tone, tint)
    relief = np.tanh(4*(second-near)) * (.76 + .24*(1-near))
    return relief, tint

broad, medium, fine = noise(5), noise(46), noise(128)
warp_u, warp_v = x+.016*(noise(11)-.5), y+.019*(noise(12)-.5)
mass, pigment = clods(27, warp_u, warp_v)
grit, mineral = clods(86, warp_u, warp_v)
grain = rng.normal(0, 1, (size, size))
height = 2.9*mass*(.42+.65*broad) + 1.1*grit + .95*medium + .55*fine
tone = .28 + .27*broad + .37*mass + .24*pigment + .14*grit + .11*medium
color = tone[...,None] * np.array([78., 53., 35.])
color += ((fine-.5)*12 + grain*2.4)[...,None]
color += (np.maximum(0, mineral-.82)*grit*95)[...,None]*[1., .93, .78]
# Sparse angular bark flakes and warmer mineral grains partially embedded
# in the matrix. Local pixel windows wrap around both tile seams.
for _ in range(1200):
    cx, cy = rng.integers(size, size=2)
    a, b = rng.uniform(1.8, 9.), rng.uniform(1., 3.3)
    angle = rng.uniform(0, np.pi)
    span = int(np.ceil(max(a,b))) + 2
    dv, du = np.mgrid[-span:span+1, -span:span+1]
    iy, ix = (cy+dv)%size, (cx+du)%size
    u, v = (du*np.cos(angle)+dv*np.sin(angle))/a, (dv*np.cos(angle)-du*np.sin(angle))/b
    d = np.abs(u)**1.45 + np.abs(v + .2*u*u)**1.65
    weight = np.clip((1-d)*3, 0, 1)
    relief = np.maximum(0, 1-d)**.72
    value = rng.uniform(.6, 1.15)
    tint = np.array([116,84,56]) if rng.random() < .75 else np.array([132,119,95])
    color[iy,ix] += weight[...,None]*(tint*value - color[iy,ix])*.80
    height[iy,ix] += relief*rng.uniform(.9, 3.1)

# Fine pores and partly exposed, curved strands of decomposing plant material.
for _ in range(420):
    cx, cy = rng.integers(size, size=2)
    length, width = rng.uniform(3, 16), rng.uniform(.45, 1.4)
    angle, curve = rng.uniform(0, 2*np.pi), rng.uniform(-3, 3)
    span = int(length) + 4
    dv, du = np.mgrid[-span:span+1, -span:span+1]
    u, v = (du*np.cos(angle)+dv*np.sin(angle))/length, dv*np.cos(angle)-du*np.sin(angle)
    weight = np.maximum(0, 1-np.abs(v-curve*u*u)/width) * np.maximum(0, 1-u*u)
    iy, ix = (cy+dv)%size, (cx+du)%size
    color[iy,ix] += weight[...,None] * [38, 27, 15]
    height[iy,ix] += .85*weight

dx = (np.roll(height,-1,1)-np.roll(height,1,1))*.5
dy = (np.roll(height,-1,0)-np.roll(height,1,0))*.5
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(out/'humus.jpg', quality=92)
Image.fromarray(np.uint8((normal*.5+.5)*255)).save(out/'humus-normal.jpg', quality=93)
