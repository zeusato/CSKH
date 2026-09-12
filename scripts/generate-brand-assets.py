"""Build favicon/app icons and a 1200x630 OG card from approved brand assets.
Optional authoring command: python scripts/generate-brand-assets.py (Pillow).
Outputs are committed; Vercel builds do not require Python or image generation.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
ICONS = PUBLIC / 'icons'
OG = PUBLIC / 'og'
ICONS.mkdir(exist_ok=True)
OG.mkdir(exist_ok=True)

def logo(path):
    image = Image.open(path).convert('RGBA')
    return image.crop(image.getchannel('A').getbbox())

mark = logo(PUBLIC / 'LOGO 2.png')
def icon(size, maskable=False):
    canvas = Image.new('RGBA', (size, size), '#fcfaf7')
    item = mark.copy()
    height = round(size * (.67 if maskable else .84))
    item.thumbnail((round(size * .8), height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(item, ((size-item.width)//2, (size-item.height)//2))
    return canvas

for size in (16, 32):
    icon(size).save(ICONS / f'favicon-{size}.png', optimize=True)
for size in (192, 512):
    icon(size).save(ICONS / f'icon-{size}.png', optimize=True)
icon(512, True).save(ICONS / 'icon-maskable-512.png', optimize=True)
icon(180).save(PUBLIC / 'apple-touch-icon.png', optimize=True)
icon(64).save(PUBLIC / 'favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])

background = Image.open(ROOT / 'docs/brand/flow-og-background.jpg').convert('RGB')
scale = max(1200/background.width, 630/background.height)
background = background.resize((round(background.width*scale),round(background.height*scale)), Image.Resampling.LANCZOS)
x,y=(background.width-1200)//2,(background.height-630)//2
card=background.crop((x,y,x+1200,y+630)).convert('RGBA')
brand=logo(PUBLIC / 'LOGO Light.png')
brand.thumbnail((174,106),Image.Resampling.LANCZOS)
card.alpha_composite(brand,(72,48))
draw=ImageDraw.Draw(card)
def font(size,bold=False):
    return ImageFont.truetype(str(PUBLIC / 'fonts' / ('NotoSans-Bold.ttf' if bold else 'NotoSans-Regular.ttf')),size)
draw.rectangle((72,192,104,196),fill='#b84a07')
draw.text((72,212),'KHÔNG GIAN LÀM VIỆC',font=font(14,True),fill='#526073')
draw.text((68,249),'Không gian',font=font(57,True),fill='#0a2762')
draw.text((68,315),'CSKH',font=font(72,True),fill='#b84a07')
draw.text((72,431),'Ghi nhận hôm nay.',font=font(22),fill='#394657')
draw.text((72,465),'Lưu lời giải cho những lần sau.',font=font(22),fill='#394657')
draw.text((72,568),'CHỨNG KHOÁN SÀI GÒN HÀ NỘI',font=font(12,True),fill='#526073')
card.convert('RGB').save(OG / 'shs-cskh.jpg',quality=92,optimize=True,subsampling=0)
print('Generated favicon, 6 PNG icons, and OG image (1200x630).')
