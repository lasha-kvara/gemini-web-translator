import math
from PIL import Image, ImageDraw

def create_gemini_translator_icon(size):
    # Create image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Rounded rectangle background
    radius = int(size * 0.22)
    # Draw gradient or modern circle/squircle
    for y in range(size):
        for x in range(size):
            # Squircle / rounded rect distance check
            # Smooth rounded rect
            dx = max(abs(x - size/2) - (size/2 - radius), 0)
            dy = max(abs(y - size/2) - (size/2 - radius), 0)
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= radius:
                # Gradient from Google Blue (#1a73e8) -> Gemini Purple (#8e44ad / #6c5ce7) -> Cyan (#00cec9)
                t_x = x / size
                t_y = y / size
                r = int(24 + 110 * t_x + 30 * t_y)
                g = int(70 + 60 * t_x + 90 * t_y)
                b = int(230 - 30 * t_x + 10 * t_y)
                alpha = 255
                # Antialiasing edge
                if dist > radius - 1:
                    alpha = int(255 * (radius - dist))
                img.putpixel((x, y), (r, g, b, alpha))

    # Draw Gemini 4-pointed diamond star
    cx, cy = size / 2, size / 2
    # Draw glowing sparkle star
    star_points = []
    outer_r = size * 0.38
    inner_r = size * 0.09
    for i in range(8):
        angle = i * math.pi / 4
        r = outer_r if (i % 2 == 0) else inner_r
        star_points.append((cx + r * math.sin(angle), cy - r * math.cos(angle)))
    
    draw.polygon(star_points, fill=(255, 255, 255, 245))
    
    # Small secondary accent star in upper right
    if size >= 48:
        sx, sy = cx + size * 0.24, cy - size * 0.22
        s_out = size * 0.12
        s_in = size * 0.03
        s_pts = []
        for i in range(8):
            angle = i * math.pi / 4
            r = s_out if (i % 2 == 0) else s_in
            s_pts.append((sx + r * math.sin(angle), sy - r * math.cos(angle)))
        draw.polygon(s_pts, fill=(230, 245, 255, 230))
        
    return img

for sz in [16, 48, 128]:
    icon = create_gemini_translator_icon(sz)
    icon.save(f"C:/Users/PC/source/repos/gemini-translator-extension/icons/icon{sz}.png")
    print(f"Generated icon{sz}.png")
