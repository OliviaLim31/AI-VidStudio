/* AI-VidStudio · stickers.js — original sticker designs, generated as SVG.
 * The generated SVG is stored on each sticker (st.svg) so the renderer rasterises
 * exactly what the studio shows (renderer uses rsvg-convert). */
'use strict';
const measureCtx = document.createElement('canvas').getContext('2d');
/* font key -> [css family list, weight, style]; the first family is the studio's @font-face,
 * the second is the system name librsvg resolves through fontconfig */
const SVG_FONTS = {
  'display-black': ['F-display-black, Inter Display', 900, 'normal'],
  'display-black-i': ['F-display-black-i, Inter Display', 900, 'italic'],
  'inter-xb': ['F-inter-xb, Inter', 800, 'normal'],
  'inter-sb': ['F-inter-sb, Inter', 600, 'normal'],
  'poppins-b': ['F-poppins-b, Poppins', 700, 'normal'],
  'poppins-m': ['F-poppins-m, Poppins', 500, 'normal'],
  'adventor-b': ['F-adventor-b, TeX Gyre Adventor', 700, 'normal'],
  'adventor-bi': ['F-adventor-bi, TeX Gyre Adventor', 700, 'italic'],
  'lora': ['F-lora, Lora', 400, 'normal'],
  'lora-i': ['F-lora-i, Lora', 400, 'italic']
};
function textW(text, fontKey, size) { measureCtx.font = `${size}px "F-${fontKey}"`; return measureCtx.measureText(text).width; }
function fontAttrs(key) {
  const [fam, w, st] = SVG_FONTS[key] || SVG_FONTS['inter-xb'];
  return `font-family="${fam}" font-weight="${w}" font-style="${st}" style="font-synthesis:none"`;
}
const svgWrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">${body}</svg>`;
const SPARK = 'M100 10 C108 70 130 92 190 100 C130 108 108 130 100 190 C92 130 70 108 10 100 C70 92 92 70 100 10 Z';
function star5Path(cx, cy, r1, r2) {
  let d = '';
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? r2 : r1; d += (k ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1) + ' '; }
  return d + 'Z';
}

const STICKERS = {
  spark4: { label: '闪光星', color: '#ffd84d', scale: 0.55, gen: st => ({ w: 200, h: 200, body: `<path d="${SPARK}" fill="${st.color}" stroke="#3b2b00" stroke-width="7" stroke-linejoin="round"/>` }) },
  star5: { label: '涂鸦星星', color: '#ffd84d', scale: 0.5, gen: st => ({ w: 200, h: 200, body: `<path d="${star5Path(100, 104, 88, 40)}" fill="${st.color}" stroke="#3b2b00" stroke-width="8" stroke-linejoin="round"/>` }) },
  sparkles: { label: '闪闪', color: '#ffd84d', scale: 0.7, gen: st => ({ w: 200, h: 200, body: [[70, 112, 0.62], [152, 52, 0.3], [158, 152, 0.22]].map(([x, y, k]) => `<g transform="translate(${x - 100 * k} ${y - 100 * k}) scale(${k})"><path d="${SPARK}" fill="${st.color}" stroke="#3b2b00" stroke-width="${(7 / k * 0.7).toFixed(1)}" stroke-linejoin="round"/></g>`).join('') }) },
  heart: { label: '爱心', color: '#ff6fae', scale: 0.5, gen: st => ({ w: 200, h: 200, body: `<path d="M100 178 C40 130 10 95 30 60 C48 28 88 30 100 62 C112 30 152 28 170 60 C190 95 160 130 100 178 Z" fill="${st.color}" stroke="#5a1033" stroke-width="6" stroke-linejoin="round"/><ellipse cx="62" cy="68" rx="14" ry="9" fill="#fff" opacity=".65" transform="rotate(-35 62 68)"/>` }) },
  cursor: { label: '鼠标点击', color: '#ff4f9a', scale: 0.55, gen: st => ({ w: 200, h: 200, body: `<g stroke="${st.color}" stroke-width="8" stroke-linecap="round"><line x1="52" y1="34" x2="38" y2="16"/><line x1="44" y1="50" x2="22" y2="50"/><line x1="68" y1="26" x2="68" y2="6"/></g><path d="M64 44 L64 178 L100 142 L124 194 L148 183 L124 132 L172 132 Z" fill="#fff" stroke="#14121c" stroke-width="9" stroke-linejoin="round"/>` }) },
  arrow: { label: '手绘箭头', color: '#ff4f9a', scale: 0.6, gen: st => ({ w: 200, h: 200, body: `<g fill="none" stroke="${st.color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"><path d="M28 160 C58 66 126 42 168 74"/><path d="M134 54 L170 76 L146 110"/></g>` }) },
  select: {
    label: '文字选取框', color: '#3d7bff', text: 'Uni', scale: 1, gen: st => {
      const fs = 56, tw = textW(st.text, 'inter-xb', fs), px = 22, py = 12, m = 10;
      const bw = tw + 2 * px, bh = fs * 1.2 + 2 * py, w = bw + 2 * m, h = bh + 2 * m;
      const hs = [[m, m], [m + bw, m], [m, m + bh], [m + bw, m + bh]].map(([x, y]) => `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" fill="#fff" stroke="${st.color}" stroke-width="3"/>`).join('');
      return { w, h, body: `<rect x="${m}" y="${m}" width="${bw}" height="${bh}" rx="6" fill="#ffffff" stroke="${st.color}" stroke-width="4"/><text x="${m + px}" y="${m + py + fs * 0.98}" font-size="${fs}" ${fontAttrs('inter-xb')} fill="#1b1830">${escapeHtml(st.text)}</text>${hs}` };
    }
  },
  notes: {
    label: 'Notes 便条', color: '#ff5e8a', text: 'Way to meet\nnew friends', scale: 1, rot: -4, gen: st => {
      const lines = st.text.split('\n').slice(0, 4), fs = 46, hfs = 32, pad = 30;
      const tw = Math.max(260, ...lines.map(l => textW(l, 'inter-xb', fs)));
      const w = tw + 2 * pad, h = pad + hfs * 1.3 + 12 + lines.length * fs * 1.15 + pad;
      const body = lines.map((l, k) => `<text x="${pad}" y="${pad + hfs * 1.3 + 12 + fs * 0.9 + k * fs * 1.15}" font-size="${fs}" ${fontAttrs('inter-xb')} fill="${st.color}">${escapeHtml(l)}</text>`).join('');
      return { w, h, body: `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="22" fill="#fff" stroke="#e6ddf5" stroke-width="3"/><text x="${pad}" y="${pad + hfs}" font-size="${hfs}" ${fontAttrs('inter-sb')} fill="#e0a100">‹ Notes</text>${body}` };
    }
  },
  search: {
    label: '搜索栏', color: '#7c4ddb', text: 'Forest Blue', scale: 1, gen: st => {
      const fs = 44, tw = textW(st.text, 'inter-sb', fs), hgt = 96, w = 40 + tw + 30 + 72 + 12;
      const cx = w - 12 - 36, cy = hgt / 2;
      return { w, h: hgt, body: `<rect x="2" y="2" width="${w - 4}" height="${hgt - 4}" rx="${hgt / 2 - 2}" fill="#fff" stroke="#ddd3f2" stroke-width="3"/><text x="40" y="${cy + fs * 0.35}" font-size="${fs}" ${fontAttrs('inter-sb')} fill="#2a2340">${escapeHtml(st.text)}</text><circle cx="${cx}" cy="${cy}" r="34" fill="${st.color}"/><circle cx="${cx - 4}" cy="${cy - 4}" r="13" fill="none" stroke="#fff" stroke-width="5"/><line x1="${cx + 6}" y1="${cy + 6}" x2="${cx + 16}" y2="${cy + 16}" stroke="#fff" stroke-width="6" stroke-linecap="round"/>` };
    }
  },
  window: {
    label: '视窗标题栏', color: '#f3ecff', text: 'Picsart', scale: 1, gen: st => {
      const fs = 36, tw = textW(st.text, 'inter-xb', fs), w = Math.max(600, tw + 260), h = 84;
      const dots = ['#ff5f57', '#febc2e', '#28c840'].map((c, k) => `<circle cx="${40 + k * 30}" cy="${h / 2}" r="10" fill="${c}"/>`).join('');
      return { w, h, body: `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="24" fill="${st.color}" stroke="#d9cdf5" stroke-width="3"/>${dots}<text x="${w / 2 - tw / 2}" y="${h / 2 + fs * 0.36}" font-size="${fs}" ${fontAttrs('inter-xb')} fill="#3b2a5c">${escapeHtml(st.text)}</text>` };
    }
  },
  tag: {
    label: '彩色标签', color: '#ff7eb6', text: 'NEW!', scale: 1, rot: -6, gen: st => {
      const fs = 46, tw = textW(st.text, 'inter-xb', fs), h = 86, w = tw + 68;
      return { w, h, body: `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${h / 2 - 3}" fill="${st.color}" stroke="#fff" stroke-width="5"/><text x="34" y="${h / 2 + fs * 0.36}" font-size="${fs}" ${fontAttrs('inter-xb')} fill="#fff">${escapeHtml(st.text)}</text>` };
    }
  }
};
function buildSticker(st) {
  const def = STICKERS[st.type]; if (!def) return st;
  const g = def.gen(st);
  st.w = r2(g.w); st.h = r2(g.h); st.svg = svgWrap(g.w, g.h, g.body);
  return st;
}
function newSticker(type) {
  const def = STICKERS[type], t0 = Math.floor(gTime * 100) / 100;
  const st = { id: uid('k'), type, text: def.text || '', color: def.color, x: 540, y: 760, scale: def.scale, rot: def.rot || 0, start: t0, end: r2(Math.min(t0 + 2.5, Math.max(total(), t0 + 0.5))), anim: type === 'cursor' ? 'click' : (/spark|star/.test(type) ? 'twinkle' : 'none'), popIn: true };
  return buildSticker(st);
}
function stickerThumb(type) { const def = STICKERS[type]; const st = { type, text: def.text || '', color: def.color }; buildSticker(st); return st.svg; }
