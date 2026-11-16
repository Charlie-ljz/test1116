#!/usr/bin/env python3
"""產生 PWA 圖示（發光鍋貼）。

用法：
  python3 tools/make_icons.py                 # 用程式繪製的鍋貼（暫用圖）
  python3 tools/make_icons.py photo.jpg       # 用真實鍋貼照片（建議）

照片請用「單顆或少數鍋貼、主體置中、背景乾淨」的特寫，程式會裁成圓形並加上暖色光暈。
輸出到 icons/：icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png、favicon-32.png
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 1024
BG = (56, 41, 31)          # 與 theme-color #38291f 一致
GLOW = (255, 176, 84)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def radial(size, inner, outer, power=1.6):
    y, x = np.mgrid[0:size, 0:size]
    d = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
    t = np.clip(d, 0, 1) ** power
    arr = np.zeros((size, size, 3), np.float32)
    for i in range(3):
        arr[..., i] = inner[i] * (1 - t) + outer[i] * t
    return Image.fromarray(arr.astype(np.uint8), 'RGB')


def glow_layer(mask, color, radius, strength):
    """依主體形狀產生暖色外發光。"""
    blur = mask.filter(ImageFilter.GaussianBlur(radius))
    a = blur.point(lambda v: min(255, int(v * strength)))
    layer = Image.new('RGBA', mask.size, color + (0,))
    layer.putalpha(a)
    return layer


def photo_subject(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    m = min(w, h)
    m = int(m * 0.86)                       # 再往中心放大，鍋貼更突出
    im = im.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2))
    d = int(S * 0.72)
    im = im.resize((d, d), Image.LANCZOS)
    mask = Image.new('L', (d, d), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d - 1, d - 1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(d * 0.012))
    # 暖色調整，讓照片更貼近品牌色
    warm = Image.new('RGB', im.size, (255, 190, 120))
    im = Image.blend(im, ImageChops.multiply(im, warm), 0.25)
    full_img = Image.new('RGB', (S, S), BG)
    full_mask = Image.new('L', (S, S), 0)
    off = ((S - d) // 2, (S - d) // 2)
    full_img.paste(im, off)
    full_mask.paste(mask, off)
    return full_img, full_mask


def drawn_subject():
    """程式繪製的鍋貼：金黃酥脆底、白皙摺邊、油亮高光。"""
    rng = np.random.default_rng(7)
    W = S * 2                                   # 2x 超取樣
    img = Image.new('RGB', (W, W), (0, 0, 0))
    mask = Image.new('L', (W, W), 0)
    cx, cy = W / 2, W / 2 + 40
    a, b = W * 0.30, W * 0.16                   # 半長軸、半短軸
    ang = np.radians(-12)

    # 鍋貼輪廓（上凸下較平的半月形）
    pts = []
    for t in np.linspace(0, 2 * np.pi, 400):
        x = a * np.cos(t)
        y = b * np.sin(t)
        if y < 0:
            y *= 1.25                           # 上緣隆起
        else:
            y *= 0.55                           # 底部較平（煎面）
        x *= 1 + 0.06 * np.sin(t * 2)
        xr = x * np.cos(ang) - y * np.sin(ang) + cx
        yr = x * np.sin(ang) + y * np.cos(ang) + cy
        pts.append((xr, yr))
    ImageDraw.Draw(mask).polygon(pts, fill=255)

    # 顏色：由上到下 = 白皙麵皮 → 金黃 → 焦褐
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    # 沿旋轉後的「短軸」方向取漸層
    v = -(xx - cx) * np.sin(ang) + (yy - cy) * np.cos(ang)
    t = np.clip((v + b * 1.2) / (b * 1.75), 0, 1)
    top = np.array([244, 222, 184], np.float32)
    mid = np.array([226, 160, 70], np.float32)
    low = np.array([148, 76, 24], np.float32)
    col = np.where(t[..., None] < 0.55,
                   top + (mid - top) * (t[..., None] / 0.55),
                   mid + (low - mid) * ((t[..., None] - 0.55) / 0.45))
    # 煎面焦痕與麵皮質感
    noise = rng.normal(0, 1, (W // 4, W // 4)).astype(np.float32)
    noise = np.array(Image.fromarray(noise).resize((W, W), Image.BICUBIC))
    col += noise[..., None] * 9
    fine = rng.normal(0, 1, (W, W)).astype(np.float32)
    col += fine[..., None] * 3.5
    burn = np.clip((t - 0.72) / 0.28, 0, 1) ** 1.5
    col *= (1 - 0.32 * burn[..., None] * (0.6 + 0.4 * np.clip(noise[..., None], -1, 1)))
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB')

    # 摺邊（沿上緣的褶皺）
    d = ImageDraw.Draw(img, 'RGBA')
    n = 9
    for i in range(n):
        u = -0.78 + 1.56 * i / (n - 1)
        x0 = a * u
        y0 = -b * 1.25 * np.sqrt(max(0, 1 - u * u)) * 0.98
        x1 = x0 * 0.95
        y1 = y0 + b * 0.9
        def tr(x, y):
            return (x * np.cos(ang) - y * np.sin(ang) + cx, x * np.sin(ang) + y * np.cos(ang) + cy)
        p0, p1 = tr(x0, y0), tr(x1 + a * 0.02, y1)
        d.line([p0, ((p0[0] + p1[0]) / 2 + 6, (p0[1] + p1[1]) / 2), p1], fill=(120, 70, 25, 90), width=7)
        d.line([(p0[0] + 8, p0[1] + 2), (p1[0] + 8, p1[1] + 2)], fill=(255, 245, 220, 80), width=5)
    # 油亮高光
    hl = Image.new('L', (W, W), 0)
    ImageDraw.Draw(hl).ellipse((cx - a * 0.55, cy - b * 1.0, cx + a * 0.05, cy - b * 0.35), fill=150)
    hl = hl.filter(ImageFilter.GaussianBlur(W * 0.02))
    img = Image.composite(Image.new('RGB', (W, W), (255, 244, 214)), img, ImageChops.multiply(hl, mask).point(lambda v: int(v * 0.55)))

    # 邊緣略暗（立體感）
    edge = mask.filter(ImageFilter.GaussianBlur(W * 0.012))
    inner = ImageChops.subtract(edge, mask.filter(ImageFilter.GaussianBlur(W * 0.03)))
    img = Image.composite(Image.new('RGB', (W, W), (70, 36, 10)), img, inner.point(lambda v: int(v * 0.8)))

    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    img = img.resize((S, S), Image.LANCZOS)
    mask = mask.resize((S, S), Image.LANCZOS)
    return img, mask


def compose(subject, mask, safe=1.0):
    if safe < 1:                              # maskable：只縮小主體，背景維持滿版
        k = int(S * safe)
        sub2 = Image.new('RGB', (S, S), BG); m2 = Image.new('L', (S, S), 0)
        off = ((S - k) // 2, (S - k) // 2)
        sub2.paste(subject.resize((k, k), Image.LANCZOS), off)
        m2.paste(mask.resize((k, k), Image.LANCZOS), off)
        subject, mask = sub2, m2
    bg = radial(S, (96, 64, 38), (30, 20, 13)).convert('RGBA')
    # 外發光（寬 + 窄兩層）
    bg = Image.alpha_composite(bg, glow_layer(mask, GLOW, S * 0.07, 2.2))
    bg = Image.alpha_composite(bg, glow_layer(mask, (255, 214, 140), S * 0.025, 1.6))
    # 腳底的暖光
    halo = radial(S, (255, 170, 80), (0, 0, 0), 1.0).convert('L').point(lambda v: int(v * 0.30))
    h = Image.new('RGBA', (S, S), GLOW + (0,)); h.putalpha(halo)
    bg = Image.alpha_composite(bg, h)
    sub = subject.convert('RGBA'); sub.putalpha(mask)
    bg = Image.alpha_composite(bg, sub)
    return bg


def main():
    os.makedirs(OUT, exist_ok=True)
    if len(sys.argv) > 1:
        subject, mask = photo_subject(sys.argv[1])
    else:
        subject, mask = drawn_subject()
    full = compose(subject, mask, safe=1.0).convert('RGB')          # 一般圖示
    maskable = compose(subject, mask, safe=0.78).convert('RGB')     # maskable：主體落在 80% 安全區內
    full.resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-512.png', optimize=True)
    full.resize((192, 192), Image.LANCZOS).save(f'{OUT}/icon-192.png', optimize=True)
    maskable.resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-maskable-512.png', optimize=True)
    full.resize((180, 180), Image.LANCZOS).save(f'{OUT}/apple-touch-icon.png', optimize=True)
    full.resize((32, 32), Image.LANCZOS).save(f'{OUT}/favicon-32.png', optimize=True)
    print('done ->', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
