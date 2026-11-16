/* AI-VidStudio · captions.js — word-by-word captions with *highlighted* keywords.
 * A caption is a script ("vibe *coding* using Picsart") spread over [start, end].
 * It is cut into chunks of a few words; each chunk is laid out here and stored as SVG
 * (cap.chunks[k].svg) so the renderer draws exactly the same thing. */
'use strict';
const CAP_DEFAULT = { per: 3, font: 'display-black', size: 76, color: '#ffffff', hiBg: '#7c4ddb', hiText: '#ffffff', upper: true, stroke: 6, strokeColor: '#1a1026', shadow: true, x: 540, y: 1260, anim: 'pop' };

function parseWords(text) {
  const out = []; let hi = false;
  for (const raw of text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean)) {
    let w = raw, startHi = w.startsWith('*'), endHi = w.endsWith('*') && w.length > 1;
    if (startHi) { hi = true; w = w.slice(1); }
    if (endHi) w = w.slice(0, -1);
    if (w) out.push({ text: w, hi });
    if (endHi) hi = false;
  }
  return out;
}
function chunkWords(words, per) {
  const chunks = []; let cur = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= per || /[.,!?;:。，！？]$/.test(w.text)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
function captionSvg(cap, words) {
  const fs = cap.size, key = cap.font, lh = fs * 1.25, m = Math.max(fs * 0.3, cap.stroke * 2 + 6);
  const padX = fs * 0.18, padY = fs * 0.1, maxW = 960;
  const space = textW(' ', key, fs);
  const items = words.map(w => { const t = cap.upper ? w.text.toUpperCase() : w.text; return { t, hi: w.hi, w: textW(t, key, fs) + (w.hi ? 2 * padX : 0) }; });
  const lines = []; let line = [], lw = 0;
  for (const it of items) {
    const add = (line.length ? space : 0) + it.w;
    if (line.length && lw + add > maxW) { lines.push({ items: line, w: lw }); line = [it]; lw = it.w; } else { line.push(it); lw += add; }
  }
  if (line.length) lines.push({ items: line, w: lw });
  const wTot = Math.max(...lines.map(l => l.w)) + 2 * m, hTot = lines.length * lh + 2 * m;
  const fid = uid('f');
  const filt = cap.shadow ? `<defs><filter id="${fid}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(fs * 0.06).toFixed(1)}"/><feOffset dy="${(fs * 0.05).toFixed(1)}" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : '';
  let body = '';
  lines.forEach((l, li) => {
    let x = (wTot - l.w) / 2; const mid = m + li * lh + lh / 2, base = mid + fs * 0.36;
    l.items.forEach((it, k) => {
      if (k) x += space;
      if (it.hi) {
        body += `<rect x="${x.toFixed(1)}" y="${(mid - fs * 0.5 - padY).toFixed(1)}" width="${it.w.toFixed(1)}" height="${(fs + 2 * padY).toFixed(1)}" rx="${(fs * 0.2).toFixed(1)}" fill="${cap.hiBg}"/>`;
        body += `<text x="${(x + padX).toFixed(1)}" y="${base.toFixed(1)}" font-size="${fs}" ${fontAttrs(key)} fill="${cap.hiText}">${escapeHtml(it.t)}</text>`;
      } else {
        const stroke = cap.stroke > 0 ? ` stroke="${cap.strokeColor}" stroke-width="${2 * cap.stroke}" stroke-linejoin="round" paint-order="stroke"` : '';
        body += `<text x="${x.toFixed(1)}" y="${base.toFixed(1)}" font-size="${fs}" ${fontAttrs(key)} fill="${cap.color}"${stroke}>${escapeHtml(it.t)}</text>`;
      }
      x += it.w;
    });
  });
  const g = cap.shadow ? `<g filter="url(#${fid})">${body}</g>` : body;
  return { svg: svgWrap(wTot, hTot, filt + g), w: r2(wTot), h: r2(hTot) };
}
function buildCaption(cap) {
  const words = parseWords(cap.text || '');
  const chunks = chunkWords(words, Math.max(1, cap.per | 0));
  const weights = chunks.map(c => c.reduce((a, w) => a + w.text.length, 0) + 2);
  const sum = weights.reduce((a, b) => a + b, 0) || 1, span = Math.max(0.2, cap.end - cap.start);
  let t = cap.start;
  cap.chunks = chunks.map((c, k) => {
    const d = span * weights[k] / sum, g = captionSvg(cap, c);
    const ch = { t0: r2(t), t1: r2(t + d), svg: g.svg, w: g.w, h: g.h, words: c.map(w => w.text).join(' ') };
    t += d; return ch;
  });
  if (cap.chunks.length) cap.chunks[cap.chunks.length - 1].t1 = r2(cap.end);
  return cap;
}
function newCaption() {
  const t0 = Math.floor(gTime * 100) / 100;
  return buildCaption({ id: uid('c'), text: 'Vibe *coding* using Picsart', start: t0, end: r2(Math.min(t0 + 3, Math.max(total(), t0 + 1))), ...clone(CAP_DEFAULT) });
}
function rebuildAllGenerated() { project.captions.forEach(buildCaption); project.stickers.forEach(buildSticker); }
