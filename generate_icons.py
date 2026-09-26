import math
from PIL import Image, ImageDraw, ImageFont

def generate_bilingual_icon(target_size):
    scale = 4
    size = target_size * scale
    
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Rounded squircle background with rich Gemini gradient
    radius = int(size * 0.24)
    for y in range(size):
        for x in range(size):
            dx = max(abs(x - size/2) - (size/2 - radius), 0)
            dy = max(abs(y - size/2) - (size/2 - radius), 0)
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= radius:
                # Gradient: #1a73e8 -> #8e44ad / #9333ea
                t = (x * 0.6 + y * 0.4) / size
                r = int(26 + (142 - 26) * t)
                g = int(115 + (68 - 115) * t)
                b = int(232 + (234 - 232) * t)
                alpha = 255
                if dist > radius - 1.5:
                    alpha = int(255 * max(0, (radius - dist) / 1.5))
                img.putpixel((x, y), (r, g, b, alpha))

    # 2. Left Card (Latin 'A') - Frosted glass card
    card_w = int(size * 0.38)
    card_h = int(size * 0.48)
    card_r = int(size * 0.09)

    left_x = int(size * 0.16)
    left_y = int(size * 0.22)
    left_cx = left_x + card_w // 2
    left_cy = left_y + card_h // 2

    # Draw semi-transparent card surface
    card_overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d_overlay = ImageDraw.Draw(card_overlay)
    d_overlay.rounded_rectangle(
        [left_x, left_y, left_x + card_w, left_y + card_h],
        radius=card_r,
        fill=(255, 255, 255, 55),
        outline=(255, 255, 255, 160),
        width=int(scale * 1.5)
    )
    img = Image.alpha_composite(img, card_overlay)
    draw = ImageDraw.Draw(img)

    # 3. Right Card (Georgian 'ა') - Solid white card with drop shadow
    right_x = int(size * 0.46)
    right_y = int(size * 0.32)
    right_cx = right_x + card_w // 2
    right_cy = right_y + card_h // 2

    # Shadow
    shadow_overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d_shadow = ImageDraw.Draw(shadow_overlay)
    d_shadow.rounded_rectangle(
        [right_x + int(scale * 2), right_y + int(scale * 4), 
         right_x + card_w + int(scale * 2), right_y + card_h + int(scale * 4)],
        radius=card_r,
        fill=(0, 0, 0, 65)
    )
    img = Image.alpha_composite(img, shadow_overlay)
    draw = ImageDraw.Draw(img)

    # Solid card
    draw.rounded_rectangle(
        [right_x, right_y, right_x + card_w, right_y + card_h],
        radius=card_r,
        fill=(255, 255, 255, 255)
    )

    # 4. Text Glyphs
    font_size = int(size * 0.28)
    font = ImageFont.truetype("segoeuib.ttf", font_size)

    # White 'A' on left card
    draw.text((left_cx, left_cy - int(scale * 2)), "A", font=font, fill=(255, 255, 255, 255), anchor="mm")
    
    # Royal Blue 'ა' on right card
    draw.text((right_cx, right_cy - int(scale * 2)), "ა", font=font, fill=(26, 115, 232, 255), anchor="mm")

    # 5. Golden exchange accent
    dot_x = int(size * 0.44)
    dot_y = int(size * 0.26)
    dot_r = int(size * 0.04)
    draw.ellipse(
        [dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r],
        fill=(250, 204, 21, 255)
    )

    final_img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    return final_img

for sz in [16, 48, 128]:
    icon = generate_bilingual_icon(sz)
    out_path = f"C:/Users/PC/source/repos/gemini-translator-extension/icons/icon{sz}.png"
    icon.save(out_path)
    print(f"Generated bilingual icon: icon{sz}.png")
