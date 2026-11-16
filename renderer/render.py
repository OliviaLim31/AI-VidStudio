#!/usr/bin/env python3
"""AI-VidStudio renderer: turn a studio project (JSON) into a 1080x1920 MP4.

Usage:
  python renderer/render.py PROJECT.json OUT.mp4 --sources sources.local.json [--audio-dir DIR ...]

PROJECT.json may be the raw project, or the text the studio copies ("STUDIO_PROJECT\n{...}").
sources.local.json maps each source key in the project to the ORIGINAL full-quality file,
e.g. {"result": "/path/to/ai_result.mp4", "real": "/path/to/IMG_5258.mov"}.
Voice / music clips are looked up by file name in the --audio-dir folders.
"""
import argparse, glob, json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO = os.path.join(REPO, "studio")
ASSETS = os.path.join(REPO, "renderer", "assets")
ORIG = {}          # filled from --sources
AUDIO_DIRS = []    # filled from --audio-dir
W, H = 1080, 1920
FONTS = json.load(open(os.path.join(STUDIO, "fonts", "fonts.json")))
ENC = "-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2".split()
LH = 1.11  # line height multiple, must match the studio


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


def badge_png(text, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(os.path.join(STUDIO, FONTS["inter-sb"]["file"]), 30)
    b = d.textbbox((0, 0), text, font=f)
    x, y = 40, 150
    d.rounded_rectangle([x, y, x + b[2] - b[0] + 44, y + b[3] - b[1] + 28], 30, fill=(20, 10, 35, 120))
    d.text((x + 22 - b[0], y + 14 - b[1]), text, font=f, fill=(255, 255, 255, 240))
    img.save(path)


def atempo(speed):
    parts, s = [], speed
    while s > 2.0: parts.append("atempo=2.0"); s /= 2.0
    while s < 0.5: parts.append("atempo=0.5"); s /= 0.5
    parts.append(f"atempo={s:.4f}")
    return ",".join(parts)


def seg_duration(s):
    return (s["out"] - s["in"]) if s.get("freeze") else (s["out"] - s["in"]) / s.get("speed", 1)


def find_upload(name):
    pool = [f for d in AUDIO_DIRS for f in glob.glob(os.path.join(d, "*"))]
    hits = [p for p in pool if os.path.basename(p) == name or os.path.basename(p).endswith("-" + name)]
    if not hits:
        stem = os.path.splitext(name)[0].replace(" ", "_")
        hits = [p for p in pool if stem in os.path.basename(p).replace(" ", "_")]
    return sorted(hits, key=os.path.getmtime)[-1] if hits else None


def render(project_path, out_path):
    raw = open(project_path).read()
    if raw.startswith("STUDIO_PROJECT"):
        raw = raw.split("\n", 1)[1]
    p = json.loads(raw)
    work = os.path.join(os.path.dirname(os.path.abspath(out_path)), ".render_work"); os.makedirs(work, exist_ok=True)
    for f in glob.glob(os.path.join(work, "*")): os.remove(f)
    badge = None
    if p.get("badge", {}).get("on", True):
        badge = os.path.join(work, "badge.png"); badge_png(p["badge"].get("text", "Made with Picsart"), badge)
    vvol = float(p.get("mix", {}).get("videoVolume", 1))
    seg_files, cuts, t_acc = [], [], 0.0
    for i, s in enumerate(p["segments"]):
        dur = seg_duration(s); src = ORIG[s["src"]]; speed = s.get("speed", 1)
        inputs, fc = [], []
        phone = s.get("layout") == "phone"
        vs = float(s.get("vs") or 1); vx = float(s.get("vx") or 0); vy = float(s.get("vy") or 0)
        dim = ",eq=brightness=-0.06" if s.get("dim") else ""
        even = lambda v: max(2, int(round(v / 2)) * 2)
        if s.get("freeze"):
            frame = os.path.join(work, f"freeze{i}.png")
            run(["ffmpeg", "-v", "error", "-y", "-ss", str(s["in"]), "-i", src, "-frames:v", "1", frame])
            inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", frame]
            src_chain = "[0:v]fps=30" if phone else \
                "[0:v]scale=1080:1920:flags=lanczos,setsar=1,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30"
        else:
            inputs += ["-ss", str(s["in"]), "-t", f"{s['out'] - s['in']:.3f}", "-i", src]
            src_chain = f"[0:v]setpts=PTS/{speed}" + ("" if phone else ",scale=1080:1920:flags=lanczos,unsharp=5:5:0.4,setsar=1,fps=30")
        if phone:
            w, h = even(1000 * vs), even(float(s.get("ph") or 1400) * vs)
            x, y = int(round(540 - w / 2 + vx)), int(round(1080 - h / 2 + vy))
            cy = int(round(float(s.get("cropY") or 0) * vs)); rad = 48 * vs
            mask = Image.new("L", (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], rad, fill=255)
            mpath = os.path.join(work, f"mask{i}.png"); mask.save(mpath)
            bg = Image.open(os.path.join(ASSETS, "bg_lav.png")).convert("RGBA")
            sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(sh).rounded_rectangle([x, y + 14 * vs, x + w, y + h + 14 * vs], rad, fill=(60, 20, 110, 90))
            bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(24 * vs + 1)))
            bpath = os.path.join(work, f"bg{i}.png"); bg.convert("RGB").save(bpath)
            bi = inputs.count("-i"); inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", bpath, "-loop", "1", "-t", f"{dur:.3f}", "-i", mpath]
            fc.append(f"{src_chain},scale={w}:-2:flags=lanczos,setsar=1,pad={w}:'max(ih,{cy + h})':0:0:white,crop={w}:{h}:0:{cy},fps=30[p]")
            fc.append(f"[{bi}:v]fps=30,setsar=1[b];[{bi + 1}:v]fps=30,format=gray[m];[p][m]alphamerge[pm];[b][pm]overlay={x}:{y}:shortest=1{dim}[v0]")
        elif abs(vs - 1) < 1e-6 and vx == 0 and vy == 0:
            fc.append(f"{src_chain}{dim}[v0]")
        else:
            w, h = even(1080 * vs), even(1920 * vs)
            x, y = int(round(540 - w / 2 + vx)), int(round(960 - h / 2 + vy))
            bi = inputs.count("-i")
            if s.get("bgc") == "lav":
                inputs += ["-loop", "1", "-t", f"{dur:.3f}", "-i", os.path.join(ASSETS, "bg_lav.png")]
            else:
                inputs += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "color=c=black:s=1080x1920:r=30"]
            fc.append(f"{src_chain},scale={w}:{h}:flags=lanczos,setsar=1[sv];[{bi}:v]scale=1080:1920,fps=30,setsar=1[b];[b][sv]overlay={x}:{y}:shortest=1{dim}[v0]")
        n_in = inputs.count("-i"); last = "v0"
        for k, t in enumerate(s.get("texts", [])):
            if not t.get("text", "").strip(): continue
            png = os.path.join(work, f"t{i}_{k}.png"); text_png(t, png)
            inputs += ["-i", png]
            st, en = float(t.get("start", 0)), min(float(t.get("end", 99)), dur)
            fc.append(f"[{last}][{n_in}:v]overlay=enable='between(t,{st:.3f},{en:.3f})'[v{k + 1}x]")
            last = f"v{k + 1}x"; n_in += 1
        if badge:
            inputs += ["-i", badge]; fc.append(f"[{last}][{n_in}:v]overlay[vb]"); last = "vb"; n_in += 1
        fc.append(f"[{last}]format=yuv420p,trim=duration={dur:.3f}[vo]")
        if s.get("sound") and not s.get("freeze") and s["src"] in ("result", "real"):
            fc.append(f"[0:a]aresample=48000,{atempo(speed)},volume={vvol},apad,atrim=duration={dur:.3f}[ao]")
        else:
            inputs += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
            fc.append(f"[{n_in}:a]anull[ao]")
        out = os.path.join(work, f"seg{i:02d}.mp4")
        run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc),
             "-map", "[vo]", "-map", "[ao]", "-t", f"{dur:.3f}", *ENC, out])
        seg_files.append(out); cuts.append((t_acc, s.get("sfx", "none"))); t_acc += dur
    lst = os.path.join(work, "list.txt")
    open(lst, "w").write("".join(f"file '{f}'\n" for f in seg_files))
    joined = os.path.join(work, "joined.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])

    # ---- final mix: video sound + sfx + voice/music tracks ----
    total = t_acc
    inputs, fc, labels = ["-i", joined], [], ["[0:a]"]
    n = 1
    for t, k in cuts:
        if k not in ("whoosh", "pop"): continue
        inputs += ["-i", os.path.join(ASSETS, f"{k}.wav")]
        ms = int(max(0, t - 0.25 if k == "whoosh" else t) * 1000)
        fc.append(f"[{n}:a]adelay={ms}|{ms}[x{n}]"); labels.append(f"[x{n}]"); n += 1
    clips = [c for c in p.get("audio", []) if c.get("name")]
    voice_spans = [(c["start"], c["start"] + (c["out"] - c["in"])) for c in clips if c.get("kind") == "voice" and not c.get("mute")]
    missing = []
    for c in clips:
        if c.get("mute"): continue
        path = find_upload(c["name"])
        if not path: missing.append(c["name"]); continue
        dur = max(0.05, c["out"] - c["in"])
        vol = float(c.get("volume", 1))
        fi, fo = float(c.get("fadeIn", 0)), float(c.get("fadeOut", 0))
        chain = f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim={c['in']:.3f}:{c['in'] + dur:.3f},asetpts=PTS-STARTPTS,volume={vol}"
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
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_path])
    print(f"{out_path}  {total:.2f}s")
    if missing: print("MISSING AUDIO:", ", ".join(missing))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Render an AI-VidStudio project to MP4")
    ap.add_argument("project"); ap.add_argument("out")
    ap.add_argument("--sources", required=True, help="JSON file mapping source keys to original media files")
    ap.add_argument("--audio-dir", action="append", default=[], help="folder(s) holding uploaded voice/music files")
    a = ap.parse_args()
    ORIG.update(json.load(open(a.sources)))
    AUDIO_DIRS.extend(a.audio_dir)
    render(a.project, a.out)
