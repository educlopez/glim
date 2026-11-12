# Icono de la app según la plantilla de iconos de macOS: lienzo de 1024 px, forma de 824 px con esquinas continuas
# (superelipse) y sombra propia. Estilo plano, como los iconos de Codex, Rex o Pond: fondo de color con luz suave
# desde arriba y un glifo blanco grande. Más la plantilla (negro sobre transparente) de la barra de menús, a 18 pt.
# Se dibuja a 2048 px y se reduce a 1024 para un antialias limpio.
# Uso: python3 -I icono.py '<json>'  con {tinta, glifo, avatar, iniciales, salida, barra}
import sys, json, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

TINTAS = {
    "naranja": "#ff7528", "mandarina": "#ff9f0a", "fresa": "#ff375f", "frambuesa": "#d6336c",
    "uva": "#bf5af2", "ciruela": "#7d4bd6", "arandano": "#3a75f0", "aqua": "#40b4e8",
    "teal": "#2fb5a8", "helecho": "#34c759", "musgo": "#7a9a3a", "moca": "#9a7350", "grafito": "#7c7c82",
    "noche": "#23263a",
}

S = 2048
K = S / 1024


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mezcla(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def superelipse(cx, cy, r, n=5.0, pasos=1440):
    pts = []
    for i in range(pasos):
        t = 2 * math.pi * i / pasos
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + r * math.copysign(abs(c) ** (2 / n), c), cy + r * math.copysign(abs(s) ** (2 / n), s)))
    return pts


def mascara_forma():
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon(superelipse(S / 2, S / 2, 412 * K), fill=255)
    return m


def degradado_vertical(c0, c1, alto=S):
    g = Image.new("RGB", (1, alto))
    for y in range(alto):
        g.putpixel((0, y), mezcla(c0, c1, y / (alto - 1)))
    return g.resize((S, alto))


INICIALES = "m"


def glifo_mascara(glifo, avatar=None):
    # Glifos grandes y planos (como los iconos de Codex, Rex o Pond): una forma rotunda que se lee a 16 px.
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    c = S / 2
    if glifo == "destello":
        # La marca de Glim: un destello alargado, cuatro puntas cóncavas (más alto que ancho), como el brillo de
        # una luz sobre una superficie. Sobre la tinta noche: una luz pequeña en lo oscuro.
        pts = []
        for i in range(1440):
            t = 2 * math.pi * i / 1440
            co, si = math.cos(t), math.sin(t)
            pts.append((c + 260 * K * math.copysign(abs(co) ** 3.0, co), c + 400 * K * math.copysign(abs(si) ** 3.0, si)))
        d.polygon(pts, fill=255)
    elif glifo == "musgo":
        # Hoja gruesa en diagonal con el nervio central vaciado (la marca de cuando la app se llamaba Moss).
        largo, ancho = 640 * K, 380 * K
        r = (largo * largo / 4 + ancho * ancho / 4) / ancho
        d0 = r - ancho / 2
        medio = math.asin((largo / 2) / r)
        pts = []
        for lado in (1, -1):
            for i in range(361):
                t = -medio + 2 * medio * i / 360
                pts.append((lado * (r * math.cos(t) - d0), r * math.sin(t) * lado))
        a_ = math.radians(45)
        rot = lambda x, y: (c + x * math.cos(a_) - y * math.sin(a_), c + x * math.sin(a_) + y * math.cos(a_))
        d.polygon([rot(x, y) for x, y in pts], fill=255)
        # Nervio: una línea que nace en el pecíolo y se afina hacia la punta.
        nervio = [rot(-14 * K, largo * 0.5), rot(14 * K, largo * 0.5), rot(5 * K, -largo * 0.30), rot(-5 * K, -largo * 0.30)]
        d.polygon(nervio, fill=0)
        # Pecíolo corto que sale por abajo a la izquierda.
        x0, y0 = rot(0, largo * 0.5)
        x1, y1 = rot(0, largo * 0.66)
        d.line((x0, y0, x1, y1), fill=255, width=int(40 * K))
        d.ellipse((x1 - 20 * K, y1 - 20 * K, x1 + 20 * K, y1 + 20 * K), fill=255)
    elif glifo == "brote":
        # Brote: dos hojas gruesas y un tallo redondeado.
        def hoja(px, py, largo, ancho, ang):
            pts = []
            r = (largo * largo / 4 + ancho * ancho / 4) / ancho
            d0 = r - ancho / 2
            medio = math.asin((largo / 2) / r)
            for lado in (1, -1):
                for i in range(361):
                    t = -medio + 2 * medio * i / 360
                    pts.append((lado * (r * math.cos(t) - d0), r * math.sin(t) * lado))
            a_ = math.radians(ang)
            d.polygon([(px + x * math.cos(a_) - (y - largo / 2) * math.sin(a_), py + x * math.sin(a_) + (y - largo / 2) * math.cos(a_)) for x, y in pts], fill=255)
        d.rounded_rectangle((c - 44 * K, c - 10 * K, c + 44 * K, c + 300 * K), radius=44 * K, fill=255)
        hoja(c - 10 * K, c + 20 * K, 440 * K, 250 * K, -48)
        hoja(c + 10 * K, c + 70 * K, 360 * K, 210 * K, 50)
    elif glifo == "estrella":
        r = 340 * K
        pts = []
        for i in range(1440):
            t = 2 * math.pi * i / 1440
            co, si = math.cos(t), math.sin(t)
            pts.append((c + r * math.copysign(abs(co) ** 3.2, co), c + r * math.copysign(abs(si) ** 3.2, si)))
        d.polygon(pts, fill=255)
    elif glifo == "ventana":
        w = 560 * K; h = 450 * K; g = 64 * K
        x0, y0 = c - w / 2, c - h / 2
        d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=110 * K, fill=255)
        d.rounded_rectangle((x0 + g, y0 + g, x0 + w - g, y0 + h - g), radius=56 * K, fill=0)
        d.rounded_rectangle((x0 + g + 30 * K, y0 + g + 30 * K, x0 + g + 160 * K, y0 + h - g - 30 * K), radius=34 * K, fill=255)
    elif glifo == "monograma":
        f = None
        for ruta in ("/System/Library/Fonts/SFNSRounded.ttf", "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
            try:
                f = ImageFont.truetype(ruta, int(560 * K))
                try:
                    f.set_variation_by_name("Heavy")
                except Exception:
                    try:
                        f.set_variation_by_name("Bold")
                    except Exception:
                        pass
                break
            except Exception:
                continue
        texto = (INICIALES or "m")[:2]
        bb = d.textbbox((0, 0), texto, font=f)
        d.text((c - (bb[0] + bb[2]) / 2, c - (bb[1] + bb[3]) / 2), texto, font=f, fill=255)
    else:  # avatar: el círculo donde va la foto
        r = 320 * K
        d.ellipse((c - r, c - r, c + r, c + r), fill=255)
    # Tamaño óptico: cada glifo ocupa más o menos lo mismo (en torno al 55 % de la forma) y queda centrado.
    escala = {"destello": 0.86, "musgo": 0.78, "brote": 0.72, "estrella": 0.78, "ventana": 0.70, "monograma": 0.68, "avatar": 0.9}.get(glifo, 0.8)
    caja = m.getbbox()
    if caja:
        recorte = m.crop(caja)
        lado = max(recorte.size)
        objetivo = int(824 * K * 0.62 * escala / 0.8)
        f = objetivo / lado
        recorte = recorte.resize((max(1, int(recorte.size[0] * f)), max(1, int(recorte.size[1] * f))), Image.LANCZOS)
        m = Image.new("L", (S, S), 0)
        m.paste(recorte, (int(c - recorte.size[0] / 2), int(c - recorte.size[1] / 2)))
    return m


def icono(tinta, glifo, apariencia=None, avatar=None):
    # Estilo plano: fondo de color vivo con un degradado suave (luz desde arriba), glifo blanco macizo con una
    # sombra corta del color del fondo, y un filo claro muy fino arriba. Sin versión oscura.
    base = hexrgb(TINTAS.get(tinta, TINTAS["noche"]))
    blanco, negro = (255, 255, 255), (0, 0, 0)
    forma = mascara_forma()
    lienzo = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    sombra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sombra.paste((0, 0, 0, 70), (0, int(10 * K)), forma.filter(ImageFilter.GaussianBlur(12 * K)))
    lienzo = Image.alpha_composite(lienzo, sombra)

    fondo = degradado_vertical(mezcla(base, blanco, 0.16), mezcla(base, negro, 0.10))
    capa = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    capa.paste(fondo, (0, 0), forma)
    lienzo = Image.alpha_composite(lienzo, capa)

    gm = glifo_mascara(glifo)
    gs = Image.new("RGBA", (S, S), mezcla(base, negro, 0.45) + (0,))
    gs.putalpha(gm.filter(ImageFilter.GaussianBlur(16 * K)).point(lambda v: v * 0.38))
    gs = gs.transform(gs.size, Image.AFFINE, (1, 0, 0, 0, 1, -14 * K))
    lienzo = Image.alpha_composite(lienzo, gs)
    if glifo == "avatar" and avatar:
        try:
            a = Image.open(avatar).convert("RGBA").resize((int(640 * K), int(640 * K)), Image.LANCZOS)
            hueco = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            hueco.paste(a, (int(S / 2 - 320 * K), int(S / 2 - 320 * K)))
            hueco.putalpha(gm)
            lienzo = Image.alpha_composite(lienzo, hueco)
        except Exception:
            pass
    else:
        solido = Image.new("RGBA", (S, S), (255, 255, 255, 255))
        solido.putalpha(gm)
        lienzo = Image.alpha_composite(lienzo, solido)

    canto = ImageChops.subtract(forma, forma.filter(ImageFilter.MinFilter(int(3 * K) | 1)))
    luz = degradado_vertical((255, 255, 255), (0, 0, 0)).convert("L")
    arriba = ImageChops.multiply(canto, luz.point(lambda v: v * 0.35))
    lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, arriba)))
    return lienzo.resize((1024, 1024), Image.LANCZOS)


def barra(glifo, salida):
    # Imagen plantilla para la barra de menús: negro y alfa; macOS la tiñe sola en claro y oscuro.
    g = glifo if glifo != "avatar" else "destello"
    m = glifo_mascara(g)
    caja = m.getbbox()
    m = m.crop(caja)
    lado = max(m.size)
    cuadro = Image.new("L", (lado, lado), 0)
    cuadro.paste(m, ((lado - m.size[0]) // 2, (lado - m.size[1]) // 2))
    for px, sufijo in ((18, ""), (36, "@2x")):
        a = cuadro.resize((int(px * 0.88), int(px * 0.88)), Image.LANCZOS)
        im = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        negro = Image.new("RGBA", a.size, (0, 0, 0, 255)); negro.putalpha(a)
        im.paste(negro, ((px - a.size[0]) // 2, (px - a.size[1]) // 2), negro)
        im.save(salida.replace(".png", f"{sufijo}.png"))


def documento_icon(tinta, glifo, destino, avatar=None):
    # Documento de Icon Composer (.icon): fondo con degradado automático de la tinta y el glifo como capa de cristal.
    # macOS 26 genera solo las versiones oscura, transparente y tintada a partir de las capas.
    import os
    os.makedirs(os.path.join(destino, "Assets"), exist_ok=True)
    gm = glifo_mascara(glifo)
    # En el lienzo de Icon Composer el glifo se ve más pequeño: se amplía un 18 % alrededor del centro.
    lado = int(S * 1.28)
    grande = gm.resize((lado, lado), Image.LANCZOS)
    off = (lado - S) // 2
    gm = grande.crop((off, off, off + S, off + S)).resize((1024, 1024), Image.LANCZOS)
    if glifo == "avatar" and avatar:
        capa = Image.open(avatar).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    else:
        capa = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
    capa.putalpha(gm)
    capa.save(os.path.join(destino, "Assets", "glifo.png"))
    r, g, b = hexrgb(TINTAS.get(tinta, TINTAS["noche"]))
    doc = {
        "fill": {"automatic-gradient": f"extended-srgb:{r / 255:.5f},{g / 255:.5f},{b / 255:.5f},1.00000"},
        "groups": [{
            "layers": [{"image-name": "glifo.png", "name": "glifo"}],
            "shadow": {"kind": "neutral", "opacity": 0.5},
            "translucency": {"enabled": False, "value": 0.5},
        }],
        "supported-platforms": {"squares": ["macOS"]},
    }
    with open(os.path.join(destino, "icon.json"), "w") as f:
        json.dump(doc, f, indent=2)


def encuadrar(ruta):
    # ictool exporta la forma a sangre (1024 px). En el Dock un icono de macOS ocupa 824 px con su sombra debajo:
    # se reduce, se centra y se le pone la sombra de la plantilla para que mida lo mismo que los demás.
    img = Image.open(ruta).convert("RGBA").resize((824, 824), Image.LANCZOS)
    lienzo = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    sombra = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    alfa = Image.new("L", (1024, 1024), 0)
    alfa.paste(img.getchannel("A"), (100, 110))
    sombra.putalpha(alfa.filter(ImageFilter.GaussianBlur(10)).point(lambda v: v * 0.30))
    lienzo = Image.alpha_composite(lienzo, sombra)
    lienzo.alpha_composite(img, (100, 100))
    lienzo.save(ruta)


if __name__ == "__main__":
    o = json.loads(sys.argv[1])
    INICIALES = str(o.get("iniciales") or "m")
    if o.get("encuadrar"):
        encuadrar(o["encuadrar"])
        print("ok")
        sys.exit(0)
    if o.get("documento"):
        documento_icon(o.get("tinta", "noche"), o.get("glifo", "destello"), o["documento"], o.get("avatar"))
    if o.get("salida"):
        icono(o.get("tinta", "noche"), o.get("glifo", "destello"), avatar=o.get("avatar")).save(o["salida"])
    if o.get("barra"):
        barra(o.get("glifo", "destello"), o["barra"])
    print("ok")
