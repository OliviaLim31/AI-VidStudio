# AI-VidStudio 🎬

A lightweight, browser-based editing studio for short vertical videos (Instagram Reels / TikTok, 9:16), paired with an FFmpeg renderer that turns the edit into a full-quality MP4.

The studio is for fast "tutorial-style" social videos: AI-generated clips, real footage and phone screen recordings, with bold captions, voice-over and music.

## Features

**Studio (browser)**
- 9:16 live preview with a timeline: reorder, split, duplicate and trim clips by dragging their edges
- **Frames**: move, corner-scale, edge-crop and rotate the video frame right on the canvas; pan / zoom the picture inside it to focus on what matters; rounded corners, border, shadow, background; presets for full screen, phone recording, letterbox, tilted photo frame and picture-in-picture
- **Transitions** between clips: fade, slide left / up, wipe, smooth wipe, circle, zoom, flash, blur, pink liquid, star
- **Clip texts** you can drag anywhere, rotate and resize; 10 bundled fonts, colours, pill / box / no background, outline, shadow, saved styles
- **Word-by-word captions** from a script, with `*keyword*` highlights, words-per-screen, pop-in animation
- **Stickers** (original designs): sparkle, star, sparkles, heart, cursor click, hand-drawn arrow, text selection box, Notes card, search bar, window bar, tag — with pop-in, twinkle, float, wiggle, spin and click animations
- Voice-over and music tracks: move, trim, volume, fade in / out, music ducking under the voice
- Per-clip speed, freeze frame, dim, original sound, entry sound effect (whoosh / pop)
- Instagram safe-zone overlay, 20–30 s length indicator, undo, cloud save with version history, downloads

**Renderer (Python + FFmpeg)**
- Reads the same project JSON and renders 1080×1920 @ 30 fps H.264 / AAC
- Same fonts, frame geometry, transition shapes and animation curves as the studio, so the render matches the preview
- Captions and stickers are stored as SVG by the studio and rasterised with `rsvg-convert`
- Loudness-normalised mix (−14 LUFS) with sound effects at cuts

## Layout

```
studio/
  index.html           the studio page shell
  css/studio.css       styles
  js/                  core · media · stickers · captions · stage · timeline · inspector · actions · storage · main
                       (js/data.js with the fonts table and the project is generated at build time)
  fonts/               bundled fonts + fonts.json + licences
renderer/
  render.py            project JSON -> MP4
  assets/              lavender background, whoosh / pop sound effects
projects/
  keyboard/project.json  example project ("My keyboard refused to fall")
tools/
  build.py             builds dist/<project>/index.html
  serve.js             tiny local server with HTTP range support (needed for video seeking)
```

Media files (`projects/*/media/`, renders, audio) are **git-ignored** on purpose: they contain personal footage.

## Quick start

```bash
# 1. put preview copies of the clips next to the project
#    (file names must match project.json -> sources)
mkdir -p projects/keyboard/media   # result.mp4, real.mp4, screen1.mp4 ...

# 2. build and open the studio
python tools/build.py projects/keyboard
node tools/serve.js dist/keyboard 8765    # open http://localhost:8765

# 3. render
#    sources.local.json maps each source key to the ORIGINAL full-quality file:
#    {"result": "/path/ai_result.mp4", "real": "/path/IMG_5258.mov", "screen1": "..."}
python renderer/render.py exported_project.json out.mp4 \
    --sources sources.local.json --audio-dir ./my_audio
```

Requirements: Python 3.10+, Pillow, FFmpeg 6+, librsvg (`rsvg-convert`), Node 18+ (only for the local server).

## Fonts

Bundled fonts are redistributed under their own licences:
Inter (The Inter Project Authors), Poppins (Indian Type Foundry) and Lora (The Lora Project Authors) under the
SIL Open Font License 1.1 (`studio/fonts/OFL-1.1.txt`); TeX Gyre Adventor (GUST e-foundry) under the
GUST Font License (`studio/fonts/GUST-FONT-LICENSE.txt`).

## License

Code: MIT © 2026 Olivia Lim
