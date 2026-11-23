import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
bg = (246, 247, 249)
ink = (14, 23, 38)
muted = (97, 112, 138)
accent = (15, 118, 110)
line = (228, 233, 241)
white = (255, 255, 255)

img = Image.new("RGB", (W, H), bg)
d = ImageDraw.Draw(img)

def font(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# subtle top-left accent block
d.rectangle([0, 0, W, 8], fill=accent)

# brand row
d.rounded_rectangle([72, 58, 116, 102], radius=12, fill=ink)
d.text((82, 70), "LR", font=font(20, True), fill=white)
d.text((130, 68), "LeadRescue", font=font(28, True), fill=ink)

# headline
d.text((72, 150), "Stop losing customers", font=font(56, True), fill=ink)
d.text((72, 214), "you already paid", font=font(56, True), fill=ink)
d.text((72, 278), "to acquire.", font=font(56, True), fill=accent)

d.text((72, 360), "Lead recovery software · Lead follow-up software", font=font(24), fill=muted)
d.text((72, 396), "Recover neglected leads · automate follow-ups · prove recovered revenue", font=font(20), fill=muted)

# dashboard card mock on the right
card_x0, card_y0, card_x1, card_y1 = 700, 120, 1128, 520
d.rounded_rectangle([card_x0, card_y0, card_x1, card_y1], radius=18, fill=white, outline=line, width=2)
d.text((card_x0 + 24, card_y0 + 20), "Recovery queue", font=font(20, True), fill=ink)

rows = [
    ("Nadia Rahman", "No response 52h", "88", (180, 35, 24)),
    ("Brightline Motors", "Stalled 16 days", "71", (180, 83, 9)),
    ("Owen Fletcher", "Follow-up overdue", "66", (180, 83, 9)),
    ("Delta Renovations", "Inactive 24 days", "48", (15, 118, 110)),
]
y = card_y0 + 66
for name, detail, score, color in rows:
    d.rounded_rectangle([card_x0 + 20, y, card_x1 - 20, y + 74], radius=12, fill=(252, 253, 254), outline=line, width=1)
    d.text((card_x0 + 36, y + 14), name, font=font(19, True), fill=ink)
    d.text((card_x0 + 36, y + 42), detail, font=font(15), fill=muted)
    d.rounded_rectangle([card_x1 - 96, y + 24, card_x1 - 32, y + 52], radius=14, fill=color)
    d.text((card_x1 - 84, y + 30), score, font=font(15, True), fill=white)
    y += 84

# bottom badge
d.rounded_rectangle([72, 470, 604, 516], radius=10, fill=(230, 244, 241))
d.text((90, 483), "No subscription · No card required · Data isolated per business", font=font(16, True), fill=accent)

os.makedirs("public/assets", exist_ok=True)
img.save("public/assets/og-image.png", "PNG", optimize=True)
print("wrote public/assets/og-image.png", img.size)
