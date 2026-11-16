#!/usr/bin/env python3
"""AI-VidStudio renderer: turn a studio project (JSON) into a 1080x1920 MP4.

Usage:
  python renderer/render.py PROJECT.json OUT.mp4 --sources sources.local.json [--audio-dir DIR ...]

PROJECT.json may be the raw project, the text the studio copies ("STUDIO_PROJECT\\n{...}"),
or a backup file downloaded from the studio ({"format": "olivia-studio", "project": {...}}).
sources.local.json maps each source key in the project to the ORIGINAL full-quality file,
e.g. {"result": "/path/to/ai_result.mp4", "real": "/path/to/IMG_5258.mov"}.
Voice / music clips are looked up by file name in the --audio-dir folders.

Pipeline
  1. each clip -> its own 1080x1920 file: frame (move / crop / zoom / rotate / border / shadow),
     background, clip texts
  2. clips joined with xfade / acrossfade transitions (or plain cuts)
  3. global overlay (badge, word-by-word captions, stickers) drawn frame by frame and piped in,
     mixed with sound effects, voice and music, loudness-normalised.
Timing, geometry and animation curves mirror studio/js/core.js — keep them in sync.
"""
import argparse, glob, hashlib, json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO = os.path.join(REPO, "studio")
ASSETS = os.path.join(REPO, "renderer", "assets")
ORIG = {}          # filled from --sources
AUDIO_DIRS = []    # filled from --audio-dir
W, H = 1080, 1920
FPS = 30
FONTS = json.load(open(os.path.join(STUDIO, "fonts", "fonts.json")))
ENC = "-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2".split()
LH = 1.11  # line height multiple, must match the studio
BG = {"black": ((0, 0, 0), (0, 0, 0)), "white": ((255, 255, 255), (255, 255, 255)), "cream": ((251, 246, 238), (251, 246, 238)),
      "lav": ((246, 240, 255), (214, 196, 245)), "pink": ((255, 227, 240), (255, 194, 220))}
XFADE = {"fade": "fade", "slideleft": "slideleft", "slideup": "slideup", "wipe": "wipeleft", "smooth": "smoothleft",
         "zoom": "zoomin", "flash": "fadewhite", "blur": "hblur"}
PINK_YUV = (163, 134, 181)  # #ff7eb6 in BT.601 limited range (LIQUID_PINK in core.js)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed: {' '.join(cmd)}\n{r.stderr[-2500:]}")


def hex2rgba(h, a=255):
    h = (h or "#000000").lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def norm_text(t):
    """Fill defaults / migrate v1 text objects."""
    t = dict(t)
    if "font" not in t:
        t["font"] = "display-black" if t.get("weight", "black") == "black" else "inter-xb"
    if "color" not in t:
        white = t.get("style") == "white"
        t["color"] = "#5b2ba8" if white else "#ffffff"
        t["bgColor"] = "#ffffff" if white else "#5b2ba8"
        t["bg"] = "pill"
    t.setdefault("bg", "pill"); t.setdefault("bgColor", "#5b2ba8")
    t.setdefault("stroke", 0); t.setdefault("strokeColor", "#000000")
    t.setdefault("shadow", True); t.setdefault("x", 540); t.setdefault("rot", 0)
    return t


def text_png(t, path):
    t = norm_text(t)
    size = float(t["size"])
    f = ImageFont.truetype(os.path.join(STUDIO, FONTS[t["font"]]["file"]), round(size))
    lines = t["text"].split("\n")
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    sw = int(round(float(t["stroke"])))
    widths = [d0.textlength(l, font=f) for l in lines]
    padx, pady = size * 0.48, size * 0.28
    lh = size * LH
    bw, bh = max(widths) + padx * 2 + sw * 2, lh * len(lines) + pady * 2
    m = int(size * 0.8) + 30  # margin for shadow / rotation
    img = Image.new("RGBA", (int(bw + 2 * m), int(bh + 2 * m)), (0, 0, 0, 0))
    box = [m, m, m + bw, m + bh]
    radius = size * 0.44 if t["bg"] == "pill" else size * 0.14
    asc, desc = f.getmetrics()

    def draw_text(dr, fill, stroke_fill=None, width=0):
        cy = m + pady
        for l, w in zip(lines, widths):
            base = cy + (lh - (asc + desc)) / 2 + asc
            dr.text((m + bw / 2 - w / 2, base), l, font=f, fill=fill, anchor="ls",
                    stroke_width=width, stroke_fill=stroke_fill)
            cy += lh

    if t["shadow"]:
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sh)
        off = size * 0.09
        if t["bg"] != "none":
            ds.rounded_rectangle([box[0], box[1] + off, box[2], box[3] + off], radius, fill=(40, 10, 80, 72))
            sh = sh.filter(ImageFilter.GaussianBlur(size * 0.15))
        else:
            # text shadow
            cy = m + pady
            for l, w in zip(lines, widths):
                base = cy + (lh - (asc + desc)) / 2 + asc
                ds.text((m + bw / 2 - w / 2, base + off * 0.6), l, font=f, fill=(20, 5, 40, 150), anchor="ls",
                        stroke_width=sw, stroke_fill=(20, 5, 40, 150))
                cy += lh
            sh = sh.filter(ImageFilter.GaussianBlur(size * 0.08))
        img.alpha_composite(sh)
    d = ImageDraw.Draw(img)
    if t["bg"] != "none":
        d.rounded_rectangle(box, radius, fill=hex2rgba(t["bgColor"], 248))
    draw_text(d, hex2rgba(t["color"]), hex2rgba(t["strokeColor"]), sw)
    rot = float(t.get("rot", 0))
    if abs(rot) > 0.01:
        img = img.rotate(-rot, resample=Image.BICUBIC, expand=True)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = float(t["x"]), float(t["y"]) + bh / 2
    x0, y0 = int(round(cx - img.width / 2)), int(round(cy - img.height / 2))
    sx, sy = max(0, -x0), max(0, -y0)
    dx, dy = max(0, x0), max(0, y0)
    cw, ch = min(img.width - sx, W - dx), min(img.height - sy, H - dy)
    if cw > 0 and ch > 0:
        canvas.alpha_composite(img.crop((sx, sy, sx + cw, sy + ch)), (dx, dy))
    canvas.save(path)


def atempo(speed):
    parts, s = [], speed
    while s > 2.0: parts.append("atempo=2.0"); s /= 2.0
    while s < 0.5: parts.append("atempo=0.5"); s /= 0.5
    parts.append(f"atempo={s:.4f}")
    return ",".join(parts)


def find_upload(name):
    pool = [f for d in AUDIO_DIRS for f in glob.glob(os.path.join(d, "*"))]
    hits = [p for p in pool if os.path.basename(p) == name or os.path.basename(p).endswith("-" + name)]
    if not hits:
        stem = os.path.splitext(name)[0].replace(" ", "_")
        hits = [p for p in pool if stem in os.path.basename(p).replace(" ", "_")]
    return sorted(hits, key=os.path.getmtime)[-1] if hits else None




# ---------------------------------------------------------------- project model
def migrate(p):
    """Same as migrate() in studio/js/core.js (v2 -> v3)."""
    if (p.get("version") or 1) < 3:
        for s in p["segments"]:
            vs, vx, vy = s.get("vs") or 1, s.get("vx") or 0, s.get("vy") or 0
            if s.get("layout") == "phone":
                w, h = 1000 * vs, (s.get("ph") or 1400) * vs
                s["frame"] = dict(x=540 - w / 2 + vx, y=1080 - h / 2 + vy, w=w, h=h, rot=0, r=48 * vs, bw=0, bc="#ffffff", shadow=True, fill="#ffffff")
                s["content"] = dict(x=0, y=-(s.get("cropY") or 0) * vs, w=w)
                s["bg"] = "lav"
            else:
                w, h = W * vs, H * vs
                s["frame"] = dict(x=540 - w / 2 + vx, y=960 - h / 2 + vy, w=w, h=h, rot=0, r=0, bw=0, bc="#ffffff", shadow=False, fill="#000000")
                s["content"] = dict(x=0, y=0, w=w)
                s["bg"] = "lav" if s.get("bgc") == "lav" else "black"
            s.setdefault("trans", {"type": "none", "dur": 0.5})
        p["version"] = 3
    for k in ("audio", "captions", "stickers"):
        p.setdefault(k, [])
    p.setdefault("mix", {"videoVolume": 1})
    return p


def seg_duration(s):
    return (s["out"] - s["in"]) if s.get("freeze") else (s["out"] - s["in"]) / (s.get("speed") or 1)


def trans_duration(segs, k, durs=None):
    if k <= 0 or k >= len(segs):
        return 0.0
    tr = segs[k].get("trans") or {}
    if tr.get("type", "none") == "none":
        return 0.0
    d = durs or [seg_duration(s) for s in segs]
    return max(0.1, min(float(tr.get("dur") or 0.5), min(d[k - 1], d[k]) * 0.5))


def starts(segs, durs=None):
    d = durs or [seg_duration(s) for s in segs]
    out, t = [], 0.0
    for k in range(len(segs)):
        if k > 0:
            t = t + d[k - 1] - trans_duration(segs, k, d)
        out.append(t)
    return out


def ease_out_back(x):
    c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def sticker_anim(st, t):
    a = dict(dy=0.0, scale=1.0, rot=0.0, alpha=1.0)
    if st.get("popIn") and t < 0.3:
        x = t / 0.3; a["scale"] = max(0.0, ease_out_back(x)); a["alpha"] = min(1.0, x * 2)
    anim = st.get("anim") or "none"
    if anim == "float":
        a["dy"] = -10 * math.sin(2 * math.pi * t / 1.6)
    elif anim == "spin":
        a["rot"] = 120 * t
    elif anim == "twinkle":
        w = math.sin(2 * math.pi * t * 1.4); a["scale"] *= 1 + 0.12 * w; a["alpha"] *= 0.8 + 0.2 * w
    elif anim == "wiggle":
        a["rot"] = 8 * math.sin(2 * math.pi * t * 1.2)
    elif anim == "click":
        ph = t % 1.4
        if 0.55 < ph < 0.75:
            a["scale"] *= 0.86
    return a


def caption_anim(cap, t):
    if cap.get("anim") != "pop" or t >= 0.15:
        return 1.0, 1.0
    x = t / 0.15
    return 0.8 + 0.2 * ease_out_back(x), min(1.0, x * 1.5)


# ---------------------------------------------------------------- helpers
def even(v):
    return max(2, int(round(v / 2)) * 2)


_probe = {}
def source_aspect(path):
    if path not in _probe:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
                              "-of", "json", path], capture_output=True, text=True).stdout
        st = json.loads(out)["streams"][0]
        w, h = st["width"], st["height"]
        rot = 0
        for sd in st.get("side_data_list", []) or []:
            rot = int(sd.get("rotation", 0) or 0)
        if abs(rot) in (90, 270):
            w, h = h, w
        _probe[path] = h / w
    return _probe[path]


def file_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout
    return float(out.strip())


def gradient_bg(kind):
    top, bot = BG.get(kind or "black", BG["black"])
    img = Image.new("RGB", (1, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(int(top[k] + (bot[k] - top[k]) * t) for k in range(3))
    return img.resize((W, H)).convert("RGBA")


def rasterize_svg(svg, w, h, work):
    w, h = max(1, int(round(w))), max(1, int(round(h)))
    key = hashlib.md5((svg + f"{w}x{h}").encode()).hexdigest()[:16]
    png = os.path.join(work, f"svg_{key}.png")
    if not os.path.exists(png):
        sp = os.path.join(work, f"svg_{key}.svg")
        open(sp, "w", encoding="utf-8").write(svg)
        run(["rsvg-convert", "-w", str(w), "-h", str(h), "-o", png, sp])
    return Image.open(png).convert("RGBA")


def badge_img(text):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(os.path.join(STUDIO, FONTS["inter-sb"]["file"]), 30)
    b = d.textbbox((0, 0), text, font=f)
    x, y = 40, 150
    d.rounded_rectangle([x, y, x + b[2] - b[0] + 44, y + b[3] - b[1] + 28], 30, fill=(20, 10, 35, 120))
    d.text((x + 22 - b[0], y + 14 - b[1]), text, font=f, fill=(255, 255, 255, 240))
    return img


def paste_center(canvas, img, cx, cy):
    x0, y0 = int(round(cx - img.width / 2)), int(round(cy - img.height / 2))
    sx, sy = max(0, -x0), max(0, -y0)
    dx, dy = max(0, x0), max(0, y0)
    cw, ch = min(img.width - sx, W - dx), min(img.height - sy, H - dy)
    if cw > 0 and ch > 0:
        canvas.alpha_composite(img.crop((sx, sy, sx + cw, sy + ch)), (dx, dy))


# ---------------------------------------------------------------- 1. one clip
def render_segment(i, s, dur, work):
    src = ORIG[s["src"]]; speed = s.get("speed") or 1
    f, c = s["frame"], s["content"]
    aspect = source_aspect(src)
    rot = float(f.get("rot") or 0); r = float(f.get("r") or 0); bw = float(f.get("bw") or 0)
    dim = ",eq=brightness=-0.06" if s.get("dim") else ""
    inputs, fc = [], []
    full = (abs(f["x"]) < .5 and abs(f["y"]) < .5 and abs(f["w"] - W) < .5 and abs(f["h"] - H) < .5 and not rot and not r and not bw
            and abs(c["x"]) < .5 and abs(c["y"]) < .5 and abs(c["w"] - W) < .5 and abs(aspect - H / W) < 0.01)
    CW, CH = (W, H) if full else (even(c["w"]), even(c["w"] * aspect))
    if s.get("freeze"):
        frame = os.path.join(work, f"freeze{i}.png")
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(s["in"]), "-i", src, "-frames:v", "1", frame])
        inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", frame]
        src_chain = (f"[0:v]scale={CW}:{CH}:flags=lanczos,setsar=1,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                     f":d=1:s={CW}x{CH}:fps={FPS}")
    else:
        inputs += ["-ss", str(s["in"]), "-t", f"{s['out'] - s['in']:.3f}", "-i", src]
        src_chain = f"[0:v]setpts=PTS/{speed},scale={CW}:{CH}:flags=lanczos" + (",unsharp=5:5:0.4" if full else "") + f",setsar=1,fps={FPS}"
    if full:
        fc.append(f"{src_chain}{dim}[v0]")
    else:
        FW, FH = even(f["w"]), even(f["h"])
        fcx, fcy = f["x"] + f["w"] / 2, f["y"] + f["h"] / 2
        # background + soft shadow of the (rotated) frame
        bg = gradient_bg(s.get("bg"))
        if f.get("shadow"):
            sh = Image.new("RGBA", (FW + 200, FH + 200), (0, 0, 0, 0))
            ImageDraw.Draw(sh).rounded_rectangle([100, 100, 100 + FW, 100 + FH], r, fill=(60, 20, 110, 90))
            if rot:
                sh = sh.rotate(-rot, resample=Image.BICUBIC, expand=True)
            sh = sh.filter(ImageFilter.GaussianBlur(24))
            paste_center(bg, sh, fcx, fcy + 14)
        bpath = os.path.join(work, f"bg{i}.png"); bg.convert("RGB").save(bpath)
        bi = inputs.count("-i"); inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", bpath]
        ci = inputs.count("-i"); inputs += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", f"color=c={f.get('fill', '#000000').replace('#', '0x')}:s={FW}x{FH}:r={FPS}"]
        fc.append(f"{src_chain}[sv]")
        fc.append(f"[{ci}:v][sv]overlay={int(round(c['x']))}:{int(round(c['y']))}:eof_action=repeat,format=rgba[fr0]")
        last = "fr0"
        if r > 0 or rot:
            mask = Image.new("L", (FW, FH), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, FW - 1, FH - 1], r, fill=255)
            mpath = os.path.join(work, f"mask{i}.png"); mask.save(mpath)
            mi = inputs.count("-i"); inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", mpath]
            fc.append(f"[{mi}:v]format=gray[m{i}];[{last}][m{i}]alphamerge[fr1]"); last = "fr1"
        if bw > 0:
            bord = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            ImageDraw.Draw(bord).rounded_rectangle([bw / 2, bw / 2, FW - 1 - bw / 2, FH - 1 - bw / 2], max(0, r - bw / 2), outline=hex2rgba(f.get("bc", "#ffffff")), width=int(round(bw)))
            opath = os.path.join(work, f"border{i}.png"); bord.save(opath)
            oi = inputs.count("-i"); inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", opath]
            fc.append(f"[{last}][{oi}:v]overlay=0:0:format=auto[fr2]"); last = "fr2"
        if rot:
            fc.append(f"[{last}]rotate=a={rot}*PI/180:ow=rotw({rot}*PI/180):oh=roth({rot}*PI/180):c=none[fr3]"); last = "fr3"
        fc.append(f"[{bi}:v]fps={FPS},setsar=1[b{i}];[b{i}][{last}]overlay=x='{fcx:.2f}-w/2':y='{fcy:.2f}-h/2':shortest=1,format=yuv420p{dim}[v0]")
    n_in = inputs.count("-i"); last = "v0"
    for k, t in enumerate(s.get("texts", [])):
        if not t.get("text", "").strip():
            continue
        png = os.path.join(work, f"t{i}_{k}.png"); text_png(t, png)
        inputs += ["-i", png]
        st_, en = float(t.get("start", 0)), min(float(t.get("end", 99)), dur)
        fc.append(f"[{last}][{n_in}:v]overlay=enable='between(t,{st_:.3f},{en:.3f})'[v{k + 1}x]")
        last = f"v{k + 1}x"; n_in += 1
    fc.append(f"[{last}]format=yuv420p,trim=duration={dur:.3f},setpts=PTS-STARTPTS[vo]")
    vvol = float(PROJECT.get("mix", {}).get("videoVolume", 1))
    if s.get("sound") and not s.get("freeze") and s["src"] in ("result", "real"):
        fc.append(f"[0:a]aresample=48000,{atempo(speed)},volume={vvol},apad,atrim=duration={dur:.3f}[ao]")
    else:
        inputs += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        fc.append(f"[{n_in}:a]anull[ao]")
    out = os.path.join(work, f"seg{i:02d}.mp4")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc),
         "-map", "[vo]", "-map", "[ao]", "-t", f"{dur:.3f}", *ENC, out])
    return out


# ---------------------------------------------------------------- 2. transitions
def custom_expr(kind):
    pre = "st(0,1-P);st(1,X/W-0.5);st(2,(Y/H-0.5)*1.7778);st(3,hypot(ld(1),ld(2)));st(4,atan2(ld(2),ld(1)));"
    if kind == "liquid":
        y, u, v = PINK_YUV
        pink = f"if(eq(PLANE,0),{y},if(eq(PLANE,1),{u},{v}))"
        return (pre + "st(5,0.07*sin(5*ld(4)+7*ld(0))+0.04*sin(3*ld(4)-5*ld(0)));"
                "st(6,if(lt(ld(0),0.5),ld(0)/0.5*1.05,(1-(ld(0)-0.5)/0.5)*1.05)*(1+ld(5)));"
                f"if(lt(ld(3),ld(6)),{pink},if(lt(ld(0),0.5),A,B))")
    if kind == "circle":
        return pre + "if(lt(ld(3),ld(0)*1.1),B,A)"
    # star
    return pre + "st(6,ld(0)*2.1*(0.75+0.25*cos(5*(ld(4)+0.6*ld(0)))));if(lt(ld(3),ld(6)),B,A)"


def join_segments(files, segs, work):
    durs = [file_duration(p) for p in files]
    st = starts(segs, durs)
    inputs, fc = [], []
    for k, p in enumerate(files):
        inputs += ["-i", p]
        fc.append(f"[{k}:v]settb=AVTB,setpts=PTS-STARTPTS,fps={FPS},format=yuv420p[iv{k}];[{k}:a]asetpts=PTS-STARTPTS[ia{k}]")
    v, a = "[iv0]", "[ia0]"
    for k in range(1, len(files)):
        td = trans_duration(segs, k, durs)
        if td > 0:
            kind = segs[k]["trans"]["type"]
            if kind in ("liquid", "star", "circle"):
                xf = f"xfade=transition=custom:duration={td:.3f}:offset={st[k]:.3f}:expr='{custom_expr(kind)}'"
            else:
                xf = f"xfade=transition={XFADE.get(kind, 'fade')}:duration={td:.3f}:offset={st[k]:.3f}"
            fc.append(f"{v}[iv{k}]{xf}[jv{k}];{a}[ia{k}]acrossfade=d={td:.3f}:c1=tri:c2=tri[ja{k}]")
        else:
            fc.append(f"{v}{a}[iv{k}][ia{k}]concat=n=2:v=1:a=1[cv{k}][ja{k}];[cv{k}]settb=AVTB,fps={FPS}[jv{k}]")
        v, a = f"[jv{k}]", f"[ja{k}]"
    out = os.path.join(work, "joined.mp4")
    # custom xfade expressions keep state in st()/ld() registers, which are not thread-safe
    threads = ["-filter_complex_threads", "1"] if any((s.get("trans") or {}).get("type") in ("liquid", "star", "circle") for s in segs[1:]) else []
    run(["ffmpeg", "-v", "error", "-y", *threads, *inputs, "-filter_complex", ";".join(fc), "-map", v, "-map", a,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", out])
    return out, st, durs


# ---------------------------------------------------------------- 3. overlay track
def overlay_frames(p, total, work):
    """Yield (n_frames, generator of RGBA frame bytes) for badge + captions + stickers, or None."""
    caps, stks = p.get("captions", []), p.get("stickers", [])
    badge = p.get("badge", {}).get("on", True)
    if not (caps or stks or badge):
        return None
    base = badge_img(p["badge"].get("text", "Made with Picsart")) if badge else Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cap_imgs = {(ci, k): rasterize_svg(ch["svg"], ch["w"], ch["h"], work) for ci, c in enumerate(caps) for k, ch in enumerate(c.get("chunks", []))}
    stk_imgs = {si: rasterize_svg(st["svg"], st["w"] * st["scale"], st["h"] * st["scale"], work) for si, st in enumerate(stks) if st.get("svg")}
    n = int(round(total * FPS))

    def frames():
        prev_key, prev_bytes = None, None
        for fi in range(n):
            t = fi / FPS
            items = []
            for ci, c in enumerate(caps):
                if not (c["start"] <= t < c["end"]):
                    continue
                for k, ch in enumerate(c.get("chunks", [])):
                    if ch["t0"] <= t < ch["t1"]:
                        sc, al = caption_anim(c, t - ch["t0"])
                        items.append(("c", ci, k, round(sc, 3), round(al, 3), c["x"], c["y"] + ch["h"] / 2, 0.0))
                        break
            for si, st in enumerate(stks):
                if si in stk_imgs and st["start"] <= t < st["end"]:
                    a = sticker_anim(st, t - st["start"])
                    items.append(("s", si, 0, round(a["scale"], 3), round(a["alpha"], 3), st["x"], st["y"] + round(a["dy"], 1), round((st.get("rot") or 0) + a["rot"], 1)))
            key = tuple(items)
            if key != prev_key:
                canvas = base.copy()
                for kind, a_, b_, sc, al, cx, cy, rot in items:
                    img = cap_imgs[(a_, b_)] if kind == "c" else stk_imgs[a_]
                    if sc <= 0.01 or al <= 0.01:
                        continue
                    if abs(sc - 1) > 1e-3:
                        img = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BICUBIC)
                    if abs(rot) > 0.05:
                        img = img.rotate(-rot, resample=Image.BICUBIC, expand=True)
                    if al < 0.999:
                        img = img.copy(); img.putalpha(img.getchannel("A").point(lambda v: int(v * al)))
                    paste_center(canvas, img, cx, cy)
                prev_key, prev_bytes = key, canvas.tobytes()
            yield prev_bytes
    return n, frames()


# ---------------------------------------------------------------- main
PROJECT = {}


def load_project(path):
    raw = open(path, encoding="utf-8").read()
    if raw.startswith("STUDIO_PROJECT"):
        raw = raw.split("\n", 1)[1]
    p = json.loads(raw)
    if p.get("format") == "olivia-studio":
        p = p["project"]
    return migrate(p)


def render(project_path, out_path):
    global PROJECT
    p = PROJECT = load_project(project_path)
    work = os.path.join(os.path.dirname(os.path.abspath(out_path)), ".render_work"); os.makedirs(work, exist_ok=True)
    for f in glob.glob(os.path.join(work, "*")):
        if not os.path.basename(f).startswith("svg_"):
            os.remove(f)
    segs = p["segments"]
    files = [render_segment(i, s, seg_duration(s), work) for i, s in enumerate(segs)]
    joined, st, durs = join_segments(files, segs, work)
    total = st[-1] + durs[-1]

    inputs, fc, labels = ["-i", joined], [], ["[0:a]"]
    ov = overlay_frames(p, total, work)
    vlabel = "0:v"
    if ov:
        inputs += ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0"]
        fc.append("[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[vout]"); vlabel = "[vout]"
    n = inputs.count("-i")
    for k in range(1, len(segs)):
        kind = segs[k].get("sfx", "none")
        if kind not in ("whoosh", "pop"):
            continue
        inputs += ["-i", os.path.join(ASSETS, f"{kind}.wav")]
        ms = int(max(0, st[k] - 0.25 if kind == "whoosh" else st[k]) * 1000)
        fc.append(f"[{n}:a]adelay={ms}|{ms}[x{n}]"); labels.append(f"[x{n}]"); n += 1
    clips = [c for c in p.get("audio", []) if c.get("name")]
    voice_spans = [(c["start"], c["start"] + (c["out"] - c["in"])) for c in clips if c.get("kind") == "voice" and not c.get("mute")]
    missing = []
    for c in clips:
        if c.get("mute"):
            continue
        path = find_upload(c["name"])
        if not path:
            missing.append(c["name"]); continue
        dur = max(0.05, c["out"] - c["in"])
        chain = f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim={c['in']:.3f}:{c['in'] + dur:.3f},asetpts=PTS-STARTPTS,volume={float(c.get('volume', 1))}"
        fi, fo = float(c.get("fadeIn", 0)), float(c.get("fadeOut", 0))
        if fi > 0: chain += f",afade=t=in:d={fi:.2f}"
        if fo > 0: chain += f",afade=t=out:st={max(0, dur - fo):.2f}:d={fo:.2f}"
        ms = int(max(0, c["start"]) * 1000)
        chain += f",adelay={ms}|{ms}"
        if c.get("kind") == "music" and c.get("duck", True) and voice_spans:
            cond = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in voice_spans)
            chain += f",volume='if(gt({cond},0),0.3,1)':eval=frame"
        inputs += ["-i", path]
        fc.append(chain + f"[c{n}]"); labels.append(f"[c{n}]"); n += 1
    fc.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,atrim=duration={total:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", vlabel, "-map", "[a]",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", out_path]
    errlog = open(os.path.join(work, "final.log"), "w")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE if ov else None, stderr=errlog)
    if ov:
        try:
            for frame in ov[1]:
                proc.stdin.write(frame)
        except BrokenPipeError:
            pass
        proc.stdin.close()
    if proc.wait():
        errlog.close(); sys.exit("final ffmpeg failed:\n" + open(os.path.join(work, "final.log")).read()[-2500:])
    print(f"{out_path}  {total:.2f}s")
    if missing:
        print("MISSING AUDIO:", ", ".join(missing))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Render an AI-VidStudio project to MP4")
    ap.add_argument("project"); ap.add_argument("out")
    ap.add_argument("--sources", required=True, help="JSON file mapping source keys to original media files")
    ap.add_argument("--audio-dir", action="append", default=[], help="folder(s) holding uploaded voice/music files")
    a = ap.parse_args()
    ORIG.update(json.load(open(a.sources)))
    AUDIO_DIRS.extend(a.audio_dir)
    render(a.project, a.out)
