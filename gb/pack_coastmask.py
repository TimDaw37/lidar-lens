"""Pack the coastline mask (gb/make_coastmask.py output) for upload: zoom 5-10 tiles copied, zoom 11-14 as one 2048 x 2048 greyscale PNG
per mixed zoom 11 tile at zoom 14 resolution (missing zoom 14 tiles: 255 where the index or an ancestor says land, else 0 = sea).
usage: python3 gb/pack_coastmask.py MASK_DIR PACK_DIR"""
import sys, os, json, shutil, numpy as np
from PIL import Image
SRC, DST = sys.argv[1:3]
I = json.load(open(f'{SRC}/index.json')); M = {int(z): set(v) for z, v in I['m'].items()}; L = {int(z): set(v) for z, v in I['l'].items()}
def land_anc(z, x, y):
    for k in range(z, 10, -1):
        d = z - k; key = f'{x >> d}_{y >> d}'
        if key in L.get(k, ()): return True
        if key in M.get(k, ()): return False
    return False
n = 0
for z in range(5, 11):
    for key in M.get(z, ()):
        x, y = key.split('_'); os.makedirs(f'{DST}/{z}/{x}', exist_ok=True); shutil.copy(f'{SRC}/{z}/{x}/{y}.png', f'{DST}/{z}/{x}/{y}.png'); n += 1
for key in sorted(M.get(11, ())):
    X, Y = map(int, key.split('_')); A = np.zeros((2048, 2048), np.uint8)
    for i in range(8):
        for j in range(8):
            x, y = X * 8 + i, Y * 8 + j
            if f'{x}_{y}' in M[14]: A[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = np.array(Image.open(f'{SRC}/14/{x}/{y}.png'))
            elif land_anc(14, x, y): A[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = 255
    os.makedirs(f'{DST}/11/{X}', exist_ok=True); Image.fromarray(A, 'L').save(f'{DST}/11/{X}/{Y}.png', optimize=True); n += 1
idx = dict(I); idx['pack'] = 11; idx['m'] = {k: v for k, v in I['m'].items()}; json.dump(idx, open(f'{DST}/index.json', 'w'), separators=(',', ':'))
print(n, 'files')
