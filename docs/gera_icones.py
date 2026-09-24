"""Ícones do PWA: cápsula branca (metade cheia, metade contorno) sobre o índigo do app."""
from PIL import Image, ImageDraw
import os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IND = (91, 91, 240, 255)
def capsula(tam, fundo_cheio):
    S = tam * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if fundo_cheio: d.rectangle([0, 0, S, S], fill=IND)
    else: d.ellipse([0, 0, S - 1, S - 1], fill=IND)
    # cápsula desenhada na horizontal e girada
    c = Image.new("RGBA", (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(c)
    w, h = S * .56 * (0.8 if fundo_cheio else 1), S * .24 * (0.8 if fundo_cheio else 1)
    x0, y0 = (S - w) / 2, (S - h) / 2; x1, y1 = x0 + w, y0 + h
    esp = max(4, int(S * .028))
    g.rounded_rectangle([x0, y0, x1, y1], radius=h / 2, outline="white", width=esp)
    meio = (x0 + x1) / 2
    metade = Image.new("L", (S, S), 0); m = ImageDraw.Draw(metade)
    m.rounded_rectangle([x0, y0, x1, y1], radius=h / 2, fill=255)
    m.rectangle([meio, 0, S, S], fill=0)
    c.paste(Image.new("RGBA", (S, S), "white"), (0, 0), metade)
    g.line([meio, y0, meio, y1], fill="white", width=esp)
    c = c.rotate(35, resample=Image.BICUBIC, center=(S / 2, S / 2))
    im.alpha_composite(c)
    return im.resize((tam, tam), Image.LANCZOS)
os.makedirs(os.path.join(R, "icons"), exist_ok=True)
for t in (192, 512): capsula(t, False).save(os.path.join(R, "icons", f"icon-{t}.png"))
capsula(180, True).save(os.path.join(R, "icons", "icon-180.png"))
capsula(512, True).save(os.path.join(R, "icons", "icon-maskable-512.png"))
print("ok")
