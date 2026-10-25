# Erzeugt aus bilder/quelle/*.jpg drei WebP-Größen fürs Handy:
#   bilder/orte/<name>.webp  720 px (Titelbilder 1280 px) für große Ansichten
#   bilder/klein/<name>.webp 200 px für Listen und Karten-Vorschauen
#   bilder/hg/<name>.webp    winzig, vorab weichgezeichnet und gesättigt als Seitenhintergrund
# Vorab weichgezeichnet spart den teuren CSS-Filter (blur 46px) auf dem Handy.
# Aufruf: py werkzeug/verkleinern.py
import os
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

wurzel = os.path.join(os.path.dirname(__file__), '..', 'bilder')
quelle = os.path.join(wurzel, 'quelle')
for ordner in ('orte', 'klein', 'hg'):
    os.makedirs(os.path.join(wurzel, ordner), exist_ok=True)

def breite(im, b):
    return im if im.width <= b else im.resize((b, round(im.height * b / im.width)), Image.LANCZOS)

summe = 0
for f in sorted(os.listdir(quelle)):
    if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
        continue
    name = os.path.splitext(f)[0]
    im = ImageOps.exif_transpose(Image.open(os.path.join(quelle, f))).convert('RGB')
    gross = breite(im, 1280 if name.startswith('titel-') else 720)
    gross.save(os.path.join(wurzel, 'orte', name + '.webp'), 'WEBP', quality=76, method=6)
    breite(im, 200).save(os.path.join(wurzel, 'klein', name + '.webp'), 'WEBP', quality=72, method=6)
    hg = breite(im, 72).filter(ImageFilter.GaussianBlur(4))
    hg = ImageEnhance.Color(hg).enhance(1.6)
    hg.save(os.path.join(wurzel, 'hg', name + '.webp'), 'WEBP', quality=70, method=6)
    groessen = [os.path.getsize(os.path.join(wurzel, o, name + '.webp')) for o in ('orte', 'klein', 'hg')]
    summe += sum(groessen)
    print(f'{name:18} groß {groessen[0] // 1024:4} KB  klein {groessen[1] // 1024:3} KB  hg {groessen[2]:5} B')
print(f'zusammen {summe // 1024} KB')
