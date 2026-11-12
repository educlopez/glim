# Icono de la app según la plantilla de iconos de macOS (Apple Human Interface Guidelines, macOS):
#   - lienzo de 1024 px, forma de 824 px centrada (100 px de margen) con esquinas continuas (superelipse, no un
#     rectángulo redondeado: la curvatura empieza antes y no hay saltos)
#   - sombra propia bajo la forma, dentro del lienzo
#   - luz desde arriba: degradado de la tinta, brillo superior y un filo claro arriba y oscuro abajo
#   - glifo de cristal (estilo Liquid Glass de macOS 26): relleno translúcido, filo de luz y sombra de color
#   - versión plantilla (negro sobre transparente) para la barra de menús, a 18 pt
# Se dibuja a 2048 px y se reduce a 1024 para un antialias limpio.
# Uso: python3 -I icono.py '<json>'  con {tinta, glifo, apariencia, avatar, salida, barra}
import sys, json, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

TINTAS = {
    "naranja": "#ff7528", "mandarina": "#ff9f0a", "fresa": "#ff375f", "frambuesa": "#d6336c",
    "uva": "#bf5af2", "ciruela": "#7d4bd6", "arandano": "#3a75f0", "aqua": "#40b4e8",
    "teal": "#2fb5a8", "helecho": "#34c759", "musgo": "#7a9a3a", "moca": "#9a7350", "grafito": "#7c7c82",
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
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    c = S / 2
    if glifo == "estrella":
        # Destello de cuatro puntas: astroide con los lados algo hinchados.
        r = 318 * K
        pts = []
        for i in range(1440):
            t = 2 * math.pi * i / 1440
            co, si = math.cos(t), math.sin(t)
            pts.append((c + r * math.copysign(abs(co) ** 2.7, co), c + r * math.copysign(abs(si) ** 2.7, si)))
        d.polygon(pts, fill=255)
    elif glifo == "ventana":
        # Ventana: marco redondeado con una barra lateral, la forma del propio panel.
        w = 520 * K; h = 420 * K; g = 56 * K
        x0, y0 = c - w / 2, c - h / 2
        d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=96 * K, fill=255)
        d.rounded_rectangle((x0 + g, y0 + g, x0 + w - g, y0 + h - g), radius=52 * K, fill=0)
        d.rounded_rectangle((x0 + g + 24 * K, y0 + g + 24 * K, x0 + g + 140 * K, y0 + h - g - 24 * K), radius=28 * K, fill=255)
    elif glifo == "monograma":
        f = None
        for ruta in ("/System/Library/Fonts/SFNSRounded.ttf", "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
            try:
                f = ImageFont.truetype(ruta, int(470 * K))
                try:
                    f.set_variation_by_name("Bold")
                except Exception:
                    pass
                break
            except Exception:
                continue
        texto = (INICIALES or "m")[:2]
        bb = d.textbbox((0, 0), texto, font=f)
        d.text((c - (bb[0] + bb[2]) / 2, c - (bb[1] + bb[3]) / 2 - 10 * K), texto, font=f, fill=255)
    elif glifo == "brote":
        # Brote (el icono de Moss): dos hojas sobre un tallo corto.
        def hoja(px, py, largo, ancho, ang):
            # Hoja = intersección de dos círculos (vesica), girada `ang` grados desde la vertical.
            pts = []
            r = (largo * largo / 4 + ancho * ancho / 4) / ancho
            d0 = r - ancho / 2
            medio = math.asin((largo / 2) / r)
            for lado in (1, -1):
                for i in range(361):
                    t = -medio + 2 * medio * i / 360
                    x = lado * (r * math.cos(t) - d0)
                    y = r * math.sin(t) * lado
                    pts.append((x, y))
            a_ = math.radians(ang)
            out = []
            for x, y in pts:
                yy = y - largo / 2  # la base de la hoja en el origen
                out.append((px + x * math.cos(a_) - yy * math.sin(a_), py + x * math.sin(a_) + yy * math.cos(a_)))
            d.polygon(out, fill=255)
        base_y = c + 250 * K
        d.rounded_rectangle((c - 26 * K, c - 40 * K, c + 26 * K, base_y), radius=26 * K, fill=255)
        hoja(c - 6 * K, c - 10 * K, 400 * K, 190 * K, -42)
        hoja(c + 6 * K, c + 60 * K, 330 * K, 160 * K, 46)
    else:  # avatar: el círculo donde va la foto
        r = 290 * K
        d.ellipse((c - r, c - r, c + r, c + r), fill=255)
    return m


def icono(tinta, glifo, apariencia, avatar=None):
    base = hexrgb(TINTAS.get(tinta, TINTAS["naranja"]))
    blanco, negro = (255, 255, 255), (0, 0, 0)
    oscuro = apariencia == "oscuro"
    forma = mascara_forma()
    lienzo = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 1. Sombra de la forma: abajo y difusa, como la plantilla de Apple.
    sombra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sm = forma.filter(ImageFilter.GaussianBlur(14 * K))
    sombra.paste((0, 0, 0, 96), (0, int(12 * K)), sm)
    lienzo = Image.alpha_composite(lienzo, sombra)

    # 2. Fondo: degradado de luz desde arriba.
    if oscuro:
        fondo = degradado_vertical(mezcla((44, 44, 48), base, 0.10), (14, 14, 16))
    else:
        fondo = degradado_vertical(mezcla(base, blanco, 0.22), mezcla(base, negro, 0.12))
    capa = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    capa.paste(fondo, (0, 0), forma)
    lienzo = Image.alpha_composite(lienzo, capa)

    # 3. Brillo superior: elipse clara muy difusa, recortada a la forma.
    brillo = Image.new("L", (S, S), 0)
    ImageDraw.Draw(brillo).ellipse((S * 0.12, -S * 0.32, S * 0.88, S * 0.42), fill=70 if not oscuro else 34)
    brillo = ImageChops.multiply(brillo.filter(ImageFilter.GaussianBlur(70 * K)), forma)
    lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, brillo)))

    # 4. Glifo de cristal.
    gm = glifo_mascara(glifo)
    color_glifo = base if oscuro else blanco
    #   sombra de color bajo el glifo
    gs = Image.new("RGBA", (S, S), mezcla(base, negro, 0.55) + (0,))
    gs.putalpha(gm.filter(ImageFilter.GaussianBlur(22 * K)).point(lambda v: v * (0.42 if not oscuro else 0.6)))
    gs = gs.transform(gs.size, Image.AFFINE, (1, 0, 0, 0, 1, -16 * K))
    lienzo = Image.alpha_composite(lienzo, gs)
    if glifo == "avatar" and avatar:
        try:
            a = Image.open(avatar).convert("RGBA").resize((int(580 * K), int(580 * K)), Image.LANCZOS)
            hueco = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            hueco.paste(a, (int(S / 2 - 290 * K), int(S / 2 - 290 * K)))
            hueco.putalpha(gm)
            lienzo = Image.alpha_composite(lienzo, hueco)
            anillo = ImageChops.subtract(gm.filter(ImageFilter.MaxFilter(int(13 * K) | 1)), gm)
            lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, anillo.point(lambda v: v * 0.75))))
        except Exception:
            pass
    else:
        #   relleno translúcido, más opaco abajo
        rel = degradado_vertical(mezcla(color_glifo, blanco, 0.35), color_glifo)
        alfa = gm.point(lambda v: v * (0.82 if not oscuro else 0.92))
        rel_rgba = rel.convert("RGBA"); rel_rgba.putalpha(alfa)
        lienzo = Image.alpha_composite(lienzo, rel_rgba)
        #   brillo interior desde los bordes (el cristal recoge luz en el canto)
        borde_int = ImageChops.subtract(gm, gm.filter(ImageFilter.MinFilter(int(9 * K) | 1)))
        glow = borde_int.filter(ImageFilter.GaussianBlur(10 * K))
        glow = ImageChops.multiply(glow, gm).point(lambda v: min(255, v * 1.6))
        lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, glow.point(lambda v: v * 0.7))))
    #   filo de luz arriba del glifo
    filo = ImageChops.subtract(gm, gm.transform(gm.size, Image.AFFINE, (1, 0, 0, 0, 1, -5 * K)))
    luz_arriba = degradado_vertical((255, 255, 255), (60, 60, 60)).convert("L")
    filo = ImageChops.multiply(filo, luz_arriba)
    lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, filo)))

    # 5. Filo de la forma: claro arriba, oscuro abajo (2 px a 1024).
    canto = ImageChops.subtract(forma, forma.filter(ImageFilter.MinFilter(int(4 * K) | 1)))
    arriba = ImageChops.multiply(canto, luz_arriba.point(lambda v: v * (0.55 if not oscuro else 0.35)))
    abajo = ImageChops.multiply(canto, luz_arriba.point(lambda v: (255 - v) * 0.25))
    lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 255)] * 3, arriba)))
    lienzo = Image.alpha_composite(lienzo, Image.merge("RGBA", (*[Image.new("L", (S, S), 0)] * 3, abajo)))
    return lienzo.resize((1024, 1024), Image.LANCZOS)


def barra(glifo, salida):
    # Imagen plantilla para la barra de menús: negro y alfa; macOS la tiñe sola en claro y oscuro.
    g = glifo if glifo != "avatar" else "estrella"
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


if __name__ == "__main__":
    o = json.loads(sys.argv[1])
    INICIALES = str(o.get("iniciales") or "m")
    icono(o.get("tinta", "musgo"), o.get("glifo", "brote"), o.get("apariencia", "claro"), o.get("avatar")).save(o["salida"])
    if o.get("barra"):
        barra(o.get("glifo", "brote"), o["barra"])
    print("ok")
