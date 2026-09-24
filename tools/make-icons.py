#!/usr/bin/env python3
"""HOURS — draws the app icons in code and writes real PNGs.

No Pillow, no downloads: a tiny PNG encoder (zlib + CRC), every pixel worked
out by distance, supersampled so the edges are smooth.

Design ("Last Light"): a black rounded square, a thick stopwatch ring that
runs the sunset ramp round the dial (gold at the crown, pink at the bottom), the
stopwatch crown on top, and one white hand. The maskable version keeps the
whole drawing inside the safe 80% circle.

Run:  python3 tools/make-icons.py   (from ~/hours)
"""
import zlib, struct, os, math

BG    = (0, 0, 0)
WHITE = (245, 245, 245)
SUN   = [(0xFF, 0xD1, 0x66), (0xFF, 0x9F, 0x1C), (0xFF, 0x5A, 0x36), (0xFF, 0x2E, 0x63)]

SS = 2  # supersample per axis

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def ramp(t):
    """t in [0,1] along gold -> orange -> red -> pink."""
    t = max(0.0, min(1.0, t)) * (len(SUN) - 1)
    i = min(int(t), len(SUN) - 2)
    return lerp(SUN[i], SUN[i + 1], t - i)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def sample(x, y, maskable):
    """Colour at a point in unit space (0..1)."""
    # rounded-square background (maskable fills the whole square)
    if not maskable:
        r = 0.225
        qx = max(abs(x - 0.5) - (0.5 - r), 0)
        qy = max(abs(y - 0.5) - (0.5 - r), 0)
        if math.hypot(qx, qy) > r:
            return None
    scale = 0.78 if maskable else 1.0
    cx, cy = 0.5, 0.53
    ux, uy = (x - cx) / scale, (y - cy) / scale
    d = math.hypot(ux, uy)

    # the ring: angle 0 at the top, clockwise, sunset all the way round
    R, T = 0.285, 0.068
    if abs(d - R) <= T / 2:
        ang = (math.atan2(ux, -uy) / (2 * math.pi)) % 1.0
        return ramp(1 - abs(2 * ang - 1))     # gold at the top, pink at the bottom, no seam
    # the crown above the ring
    if abs(ux) <= 0.055 and -R - 0.125 <= uy <= -R - 0.045:
        return ramp(0.0)
    if abs(ux) <= 0.02 and -R - 0.05 <= uy <= -R + 0.01:
        return ramp(0.0)
    # the hand, pointing at about two o'clock, and the pin
    hx, hy = math.sin(math.radians(58)) * 0.17, -math.cos(math.radians(58)) * 0.17
    if seg_dist(ux, uy, 0, 0, hx, hy) <= 0.028:
        return WHITE
    if d <= 0.045:
        return WHITE
    return BG

def draw(size, maskable=False):
    rows = []
    n = SS * SS
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable)
                    if c is not None:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            a = acc[3] / n
            if a:
                row += bytes((int(acc[0] / (acc[3] / 255)), int(acc[1] / (acc[3] / 255)), int(acc[2] / (acc[3] / 255)), int(a)))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows

def png(path, size, rows):
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))

if __name__ == '__main__':
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
    for name, size, mask in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
        png(os.path.join(here, name), size, draw(size, mask))
        print('wrote', name)
