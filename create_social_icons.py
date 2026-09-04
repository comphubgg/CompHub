from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path('public/icons')
root.mkdir(parents=True, exist_ok=True)
icons = {
    'youtube.png': ('#ff0000', '▶'),
    'tiktok.png': ('#000000', '♬'),
    'instagram.png': ('#e1306c', 'ⓘ'),
    'discord.png': ('#5865f2', 'D'),
}
for name, (color, char) in icons.items():
    path = root / name
    img = Image.new('RGBA', (128, 128), color)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('arial.ttf', 72)
    except Exception:
        font = ImageFont.load_default()
    w, h = draw.textsize(char, font=font)
    draw.text(((128 - w) / 2, (128 - h) / 2), char, font=font, fill='white')
    img.save(path)
    print('written', path)
