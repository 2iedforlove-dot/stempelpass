# Verkleinert die Ortsbilder fürs Handy: Orte auf 720 px Breite, Titelbilder auf 1280 px, JPEG Qualität 78.
# Aufruf: py werkzeug/verkleinern.py
import os
from PIL import Image, ImageOps

ordner = os.path.join(os.path.dirname(__file__), '..', 'bilder', 'orte')
for f in sorted(os.listdir(ordner)):
    if not f.lower().endswith('.jpg'):
        continue
    pfad = os.path.join(ordner, f)
    vorher = os.path.getsize(pfad)
    im = ImageOps.exif_transpose(Image.open(pfad)).convert('RGB')
    breite = 1280 if f.startswith('titel-') else 720
    if im.width > breite:
        im = im.resize((breite, round(im.height * breite / im.width)), Image.LANCZOS)
    im.save(pfad, 'JPEG', quality=78, optimize=True, progressive=True)
    print(f'{f:22} {vorher // 1024:5} KB -> {os.path.getsize(pfad) // 1024:4} KB  {im.width}x{im.height}')
