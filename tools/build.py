#!/usr/bin/env python3
"""Build a studio page for one project.

Usage:
  python tools/build.py projects/keyboard            -> dist/keyboard/index.html (+ fonts)

The page loads its media from ./media/ next to index.html (see the project's
"sources" block); put preview copies of the clips there before opening it.
"""
import json, os, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build(project_dir, out_dir=None):
    name = os.path.basename(os.path.normpath(project_dir))
    out_dir = out_dir or os.path.join(REPO, "dist", name)
    os.makedirs(os.path.join(out_dir, "fonts"), exist_ok=True)
    tpl = open(os.path.join(REPO, "studio", "template.html"), encoding="utf-8").read()
    fonts = json.load(open(os.path.join(REPO, "studio", "fonts", "fonts.json"), encoding="utf-8"))
    project = json.load(open(os.path.join(project_dir, "project.json"), encoding="utf-8"))
    html = tpl.replace("__FONTS__", json.dumps(fonts, ensure_ascii=False)) \
              .replace("__PROJECT__", json.dumps(project, ensure_ascii=False))
    open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8").write(html)
    for f in fonts.values():
        shutil.copy(os.path.join(REPO, "studio", f["file"]), os.path.join(out_dir, "fonts"))
    media = os.path.join(project_dir, "media")
    if os.path.isdir(media):
        shutil.copytree(media, os.path.join(out_dir, "media"), dirs_exist_ok=True)
    print(f"built {out_dir}/index.html")
    return out_dir


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
