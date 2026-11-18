"""Cut Image Gen sprite sheets (magenta background) into transparent PNGs for the game.
usage: python tools/process_assets.py <source_dir> <out_dir>"""
import sys, json, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]

def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                      # magenta-ness
    alpha = 1.0 - np.clip((m - 90.0) / 90.0, 0, 1)
    # despill: pull red/blue down toward green on semi-magenta edge pixels
    spill = np.clip(m - 10.0, 0, None) * (alpha > 0)
    r2 = np.where(alpha > 0, r - spill * 0.85, r)
    b2 = np.where(alpha > 0, b - spill * 0.85, b)
    rgb = np.stack([np.clip(r2, 0, 255), g, np.clip(b2, 0, 255)], -1)
    rgb = np.where((alpha < 0.06)[..., None], np.array([48, 32, 26], np.float32), rgb)   # no magenta bleed when filtering
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')

GAP = 18
def split(rgba, n=4):
    al = np.asarray(rgba)[..., 3] > 128
    cols = al.sum(0) > 2
    # find runs of occupied columns, merge tiny gaps, keep n biggest
    runs, s = [], None
    for x, v in enumerate(cols):
        if v and s is None: s = x
        if not v and s is not None: runs.append([s, x]); s = None
    if s is not None: runs.append([s, len(cols)])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < GAP: merged[-1][1] = r[1]
        else: merged.append(r)
    merged = sorted(merged, key=lambda r: r[1] - r[0], reverse=True)[:n]
    merged.sort()
    res = []
    for a, b in merged:
        sub = rgba.crop((a, 0, b, rgba.height))
        arr = np.asarray(sub)[..., 3] > 20
        ys = np.where(arr.any(1))[0]
        box = (0, max(ys[0] - 4, 0), sub.width, min(ys[-1] + 5, sub.height))
        res.append(sub.crop(box))
    return res

def save(im, name, target_h):
    w, h = im.size
    k = target_h / h
    im = im.resize((max(1, round(w * k)), target_h), Image.LANCZOS)
    im.save(f'{out}/{name}.png', optimize=True)
    return im.size

man = {}
for sheet, prefix, th in [('chars_male', 'm', 420), ('chars_female', 'f', 420), ('krathong', 'k', 200), ('lanterns', 'l', 200)]:
    GAP = 6 if sheet == 'krathong' else 18
    parts = split(key(Image.open(f'{src}/{sheet}.png')))
    # keep relative heights inside a sheet (so hair buns stay taller)
    ref = max(p.height for p in parts)
    for i, p in enumerate(parts, 1):
        w, h = save(p, f'{prefix}{i}', round(th * p.height / ref))
        man[f'{prefix}{i}'] = [w, h]
    print(sheet, len(parts), [p.size for p in parts])
Image.open(f'{src}/bg_night.png').convert('RGB').save(f'{out}/bg_night.jpg', quality=90, optimize=True)
json.dump(man, open(f'{out}/manifest.json', 'w'))
print(man)
