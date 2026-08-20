#!/usr/bin/env python3
"""HOURS — draws the app icons in code and writes real PNGs.

No Pillow, no downloads: a tiny PNG encoder (zlib + CRC) plus span filling,
rendered at 3x and box-downsampled so the edges are smooth.

Design: an --ink rounded square, a --coral road curving from bottom-left to
top-right, a --peach sun disc at the top. The maskable version keeps the whole
drawing inside the safe 80% circle.
"""
import zlib, struct, os

INK   = (0x1C, 0x15, 0x12)
INK2  = (0x2A, 0x1E, 0x18)
CORAL = (0xFF, 0x8A, 0x5B)
RUST  = (0xE5, 0x53, 0x3D)
PEACH = (0xFF, 0xD9, 0xA0)

SS = 3  # supersample factor

def bezier(p0, p1, p2, t):
    u = 1 - t
    return (u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0],
            u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1])

def t_for_y(p0, p1, p2, y):
    """The road is monotonic in y, so bisect."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if bezier(p0, p1, p2, mid)[1] > y:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2

def draw(size, maskable=False):
    W = size * SS
    rows = [bytearray(W * 3) for _ in range(W)]

    def fill_row(y, x0, x1, colour):
        if y < 0 or y >= W:
            return
        x0 = max(0, int(x0)); x1 = min(W, int(x1))
        if x1 <= x0:
            return
        rows[y][x0*3:x1*3] = bytes(colour) * (x1 - x0)

    # --- background -------------------------------------------------
    if maskable:
        for y in range(W):
            fill_row(y, 0, W, INK)
    else:
        r = 0.22 * W
        for y in range(W):
            dy = 0
            if y < r:            dy = r - y
            elif y > W - r:      dy = y - (W - r)
            dx = max(0.0, r*r - dy*dy) ** 0.5 if dy else r
            fill_row(y, r - dx, W - r + dx, INK)

    # a warm wash low-left, so the icon is not flat
    for y in range(W):
        f = max(0.0, (y / W - 0.35) / 0.65)
        if f <= 0:
            continue
        col = tuple(int(INK[i] + (INK2[i] - INK[i]) * f) for i in range(3))
        # keep inside the background shape
        if maskable:
            fill_row(y, 0, W, col)
        else:
            r = 0.22 * W
            dy = 0
            if y < r:            dy = r - y
            elif y > W - r:      dy = y - (W - r)
            dx = max(0.0, r*r - dy*dy) ** 0.5 if dy else r
            fill_row(y, r - dx, W - r + dx, col)

    # everything from here is drawn in normalised coords, scaled into the
    # safe circle for the maskable icon
    scale = 0.80 if maskable else 1.0
    def sx(nx): return (0.5 + (nx - 0.5) * scale) * W
    def sy(ny): return (0.5 + (ny - 0.5) * scale) * W

    # --- the road ---------------------------------------------------
    P0, P1, P2 = (0.10, 1.06), (0.60, 0.74), (0.72, 0.12)
    y_top, y_bot = sy(P2[1]), sy(P0[1])
    for y in range(max(0, int(y_top)), min(W, int(y_bot) + 1)):
        ny = ((y / W) - 0.5) / scale + 0.5          # back to normalised
        t = t_for_y(P0, P1, P2, ny)
        cx, _ = bezier(P0, P1, P2, t)
        half = (0.205 + (0.038 - 0.205) * t)         # tapers with distance
        colour = tuple(int(RUST[i] + (CORAL[i] - RUST[i]) * (1 - t)) for i in range(3))
        fill_row(y, sx(cx - half), sx(cx + half), colour)

    # --- the sun ----------------------------------------------------
    cx, cy, rad = sx(0.70), sy(0.235), 0.135 * W * scale
    for y in range(max(0, int(cy - rad)), min(W, int(cy + rad) + 1)):
        dy = y - cy
        dx = max(0.0, rad*rad - dy*dy) ** 0.5
        fill_row(y, cx - dx, cx + dx, PEACH)

    # --- downsample -------------------------------------------------
    out = []
    for oy in range(size):
        row = bytearray(size * 3)
        src = rows[oy*SS:(oy+1)*SS]
        for ox in range(size):
            r = g = b = 0
            for s in src:
                base = ox * SS * 3
                for k in range(SS):
                    r += s[base + k*3]
                    g += s[base + k*3 + 1]
                    b += s[base + k*3 + 2]
            n = SS * SS
            row[ox*3] = r // n
            row[ox*3+1] = g // n
            row[ox*3+2] = b // n
        out.append(bytes(row))
    return out

def write_png(path, rows, size):
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{path}  {size}x{size}  {len(png)//1024} KB')

if __name__ == '__main__':
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
    os.makedirs(here, exist_ok=True)
    write_png(os.path.join(here, 'icon-192.png'), draw(192), 192)
    write_png(os.path.join(here, 'icon-512.png'), draw(512), 512)
    write_png(os.path.join(here, 'icon-maskable-512.png'), draw(512, maskable=True), 512)
