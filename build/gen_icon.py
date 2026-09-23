# -*- coding: utf-8 -*-
"""生成 SleepWave 睡眠声波桌面应用图标 build/icon.ico（多尺寸）与 icon.png
主题：深空渐变圆盘 + 圆月 + 三道声波弧 + 助眠星星"""

import math
from PIL import Image, ImageDraw

SIZE = 512
OUT_ICO = "build/icon.ico"
OUT_PNG = "build/icon.png"

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 1) 圆形背景：深蓝 -> 靛紫（夜空）竖直渐变
top = (16, 24, 58)
bottom = (56, 44, 96)
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(top[0] + (bottom[0] - top[0]) * t)
    g = int(top[1] + (bottom[1] - top[1]) * t)
    b = int(top[2] + (bottom[2] - top[2]) * t)
    draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).ellipse((8, 8, SIZE - 8, SIZE - 8), fill=255)
img.putalpha(mask)
draw = ImageDraw.Draw(img)

cx, cy = SIZE / 2, SIZE * 0.46

# 2) 圆月：暖黄到乳白渐变（绘制多层同心圆实现柔和渐变）
moon_r = SIZE * 0.21
for i in range(24):
    t = i / 23.0
    rad = moon_r * (1 - t * 0.35)
    color = (int(255 - t * 40), int(236 - t * 60), int(180 - t * 100), 255)
    draw.ellipse(
        [cx - rad, cy - rad, cx + rad, cy + rad],
        fill=color,
    )

# 3) 月牙暗角：右上叠加一段深色遮罩形成月相
shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shade)
sd.ellipse(
    [cx + moon_r * 0.25, cy - moon_r * 0.9, cx + moon_r * 1.45, cy + moon_r * 1.2],
    fill=(16, 24, 58, 235),
)
img = Image.alpha_composite(img, shade)
draw = ImageDraw.Draw(img)

# 4) 三道声波弧（从月亮左侧扩散）
wave_color = (150, 190, 255, 235)
for i, r in enumerate((0.52, 0.66, 0.80)):
    start = 195
    end = 285
    steps = 48
    pts = []
    for k in range(steps + 1):
        a = math.radians(start + (end - start) * k / steps)
        rr = r * SIZE / 2
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr - SIZE * 0.02))
    draw.line(pts, fill=wave_color, width=int(SIZE * (0.012 + i * 0.005)))

# 5) 右下小星星（两枚）
star_color = (255, 255, 240, 230)
for sxp, syp, ss in ((0.78, 0.66, 0.045), (0.68, 0.78, 0.030)):
    sx, sy = SIZE * sxp, SIZE * syp
    half = SIZE * ss
    r2 = half * 0.42
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = half if k % 2 == 0 else r2
        pts.append((sx + math.cos(a) * rr, sy + math.sin(a) * rr))
    draw.polygon(pts, fill=star_color)

# 输出
img.save(OUT_PNG)
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(OUT_ICO, sizes=ico_sizes)
print("icon written:", OUT_ICO, OUT_PNG)
