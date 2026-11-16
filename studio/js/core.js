/* AI-VidStudio · core.js — shared state, timing, geometry and animation maths.
 * Everything that the renderer must reproduce (timing, frame geometry, transition
 * shapes) lives here and is mirrored in
 * renderer/render.py. Keep the two in sync. */
'use strict';
const STORE_KEY = 'olivia-studio-v3-keyboard';
const LH = 1.11;
const W = 1080, H = 1920;
const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 8);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* fonts */
$('fontfaces').textContent = Object.entries(FONTS).map(([k, f]) => `@font-face{font-family:"F-${k}";src:url("${f.file}");font-weight:normal;font-style:normal;font-display:block}`).join('\n');
Object.keys(FONTS).forEach(k => { try { document.fonts.load(`40px "F-${k}"`); } catch (e) {} });

/* ---------- transitions catalogue (keys shared with the renderer) ---------- */
const TRANSITIONS = [
  ['none', '无'], ['fade', '淡入淡出'], ['slideleft', '左滑'], ['slideup', '上滑'], ['wipe', '擦除'],
  ['circle', '圆形展开'], ['zoom', '推近'], ['flash', '闪白'], ['blur', '模糊'], ['smooth', '柔光擦除'],
  ['liquid', '💗 粉红液体'], ['star', '⭐ 星星展开']
];
const LIQUID_PINK = '#ff7eb6';

/* ---------- migration ---------- */
function migrate(p) {
  p = clone(p);
  if ((p.version || 1) < 3) {
    for (const s of p.segments) {
      const vs = s.vs || 1, vx = s.vx || 0, vy = s.vy || 0;
      if (s.layout === 'phone') {
        const w = 1000 * vs, h = (s.ph || 1400) * vs;
        s.frame = { x: r2(540 - w / 2 + vx), y: r2(1080 - h / 2 + vy), w: r2(w), h: r2(h), rot: 0, r: r2(48 * vs), bw: 0, bc: '#ffffff', shadow: true, fill: '#ffffff' };
        s.content = { x: 0, y: r2(-(s.cropY || 0) * vs), w: r2(w) };
        s.bg = 'lav';
      } else {
        const w = W * vs, h = H * vs;
        s.frame = { x: r2(540 - w / 2 + vx), y: r2(960 - h / 2 + vy), w: r2(w), h: r2(h), rot: 0, r: 0, bw: 0, bc: '#ffffff', shadow: false, fill: '#000000' };
        s.content = { x: 0, y: 0, w: r2(w) };
        s.bg = s.bgc === 'lav' ? 'lav' : 'black';
      }
      s.trans = s.trans || { type: 'none', dur: 0.5 };
      for (const k of ['vs', 'vx', 'vy', 'ph', 'cropY', 'bgc', 'layout']) delete s[k];
    }
    p.version = 3;
  }
  p.audio = p.audio || []; p.styles = p.styles || []; p.mix = p.mix || { videoVolume: 1 };
  for (const [k, src] of Object.entries(p.sources)) if (!src.aspect) src.aspect = /screen/.test(k) ? 2796 / 1290 : 16 / 9;
  return p;
}

/* ---------- state ---------- */
const BASE = migrate(DEFAULT);
let project = clone(BASE);
let meta = { editedAt: 0, savedAt: 0 };
try {
  const s = localStorage.getItem(STORE_KEY);
  if (s) { const o = JSON.parse(s); if (o && o.p && o.p.segments) project = migrate(o.p); if (o && o.meta) meta = o.meta; }
} catch (e) {}
let history = [], selSeg = 0, selText = -1, selAudio = -1, tab = 'seg';
let playing = false, gTime = 0, lastTick = 0, muted = true, interacting = false, frameMode = 'frame', frameMore = false;

/* ---------- timing (mirrored in render.py: seg_duration / trans_duration / starts) ---------- */
const segDur = s => s.freeze ? (s.out - s.in) : (s.out - s.in) / (s.speed || 1);
function transDur(k) {
  const segs = project.segments; if (k <= 0 || k >= segs.length) return 0;
  const tr = segs[k].trans; if (!tr || tr.type === 'none') return 0;
  return clamp(tr.dur || 0.5, 0.1, Math.min(segDur(segs[k - 1]), segDur(segs[k])) * 0.5);
}
function starts() {
  const out = []; let t = 0;
  project.segments.forEach((s, k) => { if (k > 0) t = t + segDur(project.segments[k - 1]) - transDur(k); out.push(t); });
  return out;
}
const segStart = i => starts()[i];
const total = () => { const st = starts(), n = project.segments.length; return st[n - 1] + segDur(project.segments[n - 1]); };
const clipDur = c => Math.max(0.05, c.out - c.in);
/* segments visible at time t: [{i, local}] (two during a transition); trans = {i, p, type} when overlapping */
function activeAt(t) {
  const st = starts(), segs = project.segments, act = [];
  for (let i = 0; i < segs.length; i++) { const d = segDur(segs[i]); if (t >= st[i] - 1e-6 && t < st[i] + d) act.push({ i, local: clamp(t - st[i], 0, d) }); }
  if (!act.length) { const i = segs.length - 1; act.push({ i, local: segDur(segs[i]) }); }
  let trans = null;
  if (act.length > 1) { const b = act[act.length - 1]; trans = { i: b.i, p: clamp(b.local / transDur(b.i), 0, 1), type: segs[b.i].trans.type }; }
  return { act: act.slice(-2), trans };
}
function segAt(t) { const { act } = activeAt(t); return act[act.length - 1]; }

/* ---------- transition shapes (normalised by canvas width, centre origin) ---------- */
function liquidWobble(a, t) { return 0.07 * Math.sin(5 * a + 7 * t) + 0.04 * Math.sin(3 * a - 5 * t); }
function liquidRadius(a, t) { const R = 1.05; const r = t < 0.5 ? (t / 0.5) * R : (1 - (t - 0.5) / 0.5) * R; return r * (1 + liquidWobble(a, t)); }
function circleRadius(a, t) { return t * 1.1; }
function starRadius(a, t) { return t * 2.1 * (0.75 + 0.25 * Math.cos(5 * (a + 0.6 * t))); }
function shapePolygon(fn, t) { // CSS polygon() in % of the stage box
  const pts = [];
  for (let k = 0; k < 72; k++) {
    const a = -Math.PI + (k / 72) * 2 * Math.PI, r = fn(a, t);
    const x = 50 + 100 * r * Math.cos(a), y = 50 + 100 * r * Math.sin(a) * (W / H);
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

/* ---------- persistence / misc ---------- */
function writeLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ p: project, meta })); } catch (e) {} }
function save() { meta.editedAt = Date.now(); writeLocal(); markDirty(); }
function markDirty() { const d = meta.editedAt > meta.savedAt; const b = $('saveBtn'); if (b) b.innerHTML = d ? '💾 保存<span class="dirty-dot" title="有未保存的修改"></span>' : '💾 已保存'; }
function commit() { history.push(JSON.stringify(project)); if (history.length > 80) history.shift(); $('undoBtn').disabled = false; }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1900); }
function refresh(full) { save(); renderTimeline(); markStage(); if (full) renderInspector(); applyFrame(true); }
