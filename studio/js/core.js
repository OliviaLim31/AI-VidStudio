/* AI-VidStudio · core.js — shared state and helpers */
'use strict';
const STORE_KEY = 'olivia-studio-v2-keyboard';
const LH = 1.11;
const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 8);

/* fonts */
$('fontfaces').textContent = Object.entries(FONTS).map(([k, f]) => `@font-face{font-family:"F-${k}";src:url("${f.file}");font-weight:normal;font-style:normal;font-display:block}`).join('\n');
Object.keys(FONTS).forEach(k => { try { document.fonts.load(`40px "F-${k}"`); } catch (e) {} });

/* state */
let project = clone(DEFAULT);
let meta = { editedAt: 0, savedAt: 0 };
try {
  const s = localStorage.getItem(STORE_KEY);
  if (s) { const o = JSON.parse(s); const p = o && o.p ? o.p : o; if (p && p.segments && p.version === 2) project = p; if (o && o.meta) meta = o.meta; }
} catch (e) {}
project.audio = project.audio || []; project.styles = project.styles || clone(DEFAULT.styles); project.mix = project.mix || { videoVolume: 1 };
let history = [], selSeg = 0, selText = -1, selAudio = -1, tab = 'seg';
let playing = false, gTime = 0, lastTick = 0, muted = true, interacting = false;

const segDur = s => s.freeze ? (s.out - s.in) : (s.out - s.in) / (s.speed || 1);
const total = () => project.segments.reduce((a, s) => a + segDur(s), 0);
const segStart = i => project.segments.slice(0, i).reduce((a, s) => a + segDur(s), 0);
const clipDur = c => Math.max(0.05, c.out - c.in);
function segAt(t) {
  let acc = 0;
  for (let i = 0; i < project.segments.length; i++) {
    const d = segDur(project.segments[i]);
    if (t < acc + d || i === project.segments.length - 1) return { i, local: clamp(t - acc, 0, d) };
    acc += d;
  }
  return { i: 0, local: 0 };
}
function writeLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ p: project, meta })); } catch (e) {} }
function save() { meta.editedAt = Date.now(); writeLocal(); markDirty(); }
function markDirty() { const d = meta.editedAt > meta.savedAt; const b = $('saveBtn'); if (b) b.innerHTML = d ? '💾 保存<span class="dirty-dot" title="有未保存的修改"></span>' : '💾 已保存'; }
function commit() { history.push(JSON.stringify(project)); if (history.length > 80) history.shift(); $('undoBtn').disabled = false; }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1900); }
function refresh(full) { save(); renderTimeline(); markStage(); if (full) renderInspector(); applyFrame(true); }
