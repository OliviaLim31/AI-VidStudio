/* AI-VidStudio · stage.js — draws the canvas: clip slots, frames, transitions,
 * segment texts, badge; and the on-canvas editing handles. */
'use strict';
let lastKey = '';
function markStage() { lastKey = ''; slots.forEach(s => s.key = ''); ovKey = ''; }

/* ---------- one clip inside a slot ---------- */
function layoutSlot(sl, i, local) {
  const seg = project.segments[i], s = S(), f = seg.frame, c = seg.content, src = project.sources[seg.src];
  sl.root.style.display = 'block';
  sl.bg.className = 'slot-bg bg-' + (seg.bg || 'black');
  Object.assign(sl.frame.style, {
    left: f.x * s + 'px', top: f.y * s + 'px', width: f.w * s + 'px', height: f.h * s + 'px',
    borderRadius: (f.r || 0) * s + 'px', transform: `rotate(${f.rot || 0}deg)`, background: f.fill || '#000',
    boxShadow: f.shadow ? `0 ${14 * s}px ${48 * s}px rgba(60,20,110,.35)` : 'none'
  });
  Object.assign(sl.border.style, { display: f.bw > 0 ? 'block' : 'none', border: `${(f.bw || 0) * s}px solid ${f.bc || '#fff'}`, borderRadius: (f.r || 0) * s + 'px' });
  const dim = seg.dim ? 'brightness(0.94)' : 'none';
  sl.bg.style.filter = dim; sl.frame.style.filter = dim;
  for (const [k, v] of Object.entries(sl.vids)) {
    if (k !== seg.src) { if (v.style.display !== 'none') { v.pause(); v.style.display = 'none'; } continue; }
    const z = seg.freeze ? 1 + 0.024 * local : 1;
    Object.assign(v.style, { display: 'block', left: c.x * s + 'px', top: c.y * s + 'px', width: c.w * s + 'px', height: c.w * src.aspect * s + 'px', transform: `scale(${z})` });
  }
  sl.seg = i;
}
function syncSlotVideo(sl, i, local, force) {
  const seg = project.segments[i], v = sl.vids[seg.src];
  const want = seg.freeze ? seg.in : seg.in + local * (seg.speed || 1);
  v.muted = muted || !seg.sound || seg.freeze;
  v.volume = clamp(project.mix.videoVolume, 0, 1);
  if (playing && !seg.freeze) {
    v.playbackRate = seg.speed || 1;
    if (Math.abs(v.currentTime - want) > 0.25 || force) v.currentTime = want;
    if (v.paused) v.play().catch(() => {});
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - want) > 0.03) v.currentTime = want;
  }
}

/* ---------- transitions (CSS approximations of the renderer's xfade) ---------- */
function resetSlotFx(sl) { Object.assign(sl.root.style, { transform: 'none', opacity: '1', clipPath: 'none', filter: 'none', webkitMaskImage: 'none', maskImage: 'none', zIndex: '' }); }
function applyTransition(A, B, type, p) {
  const fx = $('transFx'); fx.style.display = 'none'; fx.style.clipPath = 'none'; fx.style.opacity = '1';
  B.root.style.zIndex = 2; A.root.style.zIndex = 1;
  const pct = v => (v * 100).toFixed(2) + '%';
  switch (type) {
    case 'fade': B.root.style.opacity = p; break;
    case 'slideleft': A.root.style.transform = `translateX(-${pct(p)})`; B.root.style.transform = `translateX(${pct(1 - p)})`; break;
    case 'slideup': A.root.style.transform = `translateY(-${pct(p)})`; B.root.style.transform = `translateY(${pct(1 - p)})`; break;
    case 'wipe': B.root.style.clipPath = `inset(0 0 0 ${pct(1 - p)})`; break;
    case 'smooth': { const e = (1 - p) * 120 - 10; const m = `linear-gradient(90deg, transparent ${e}%, #000 ${e + 20}%)`; B.root.style.webkitMaskImage = m; B.root.style.maskImage = m; break; }
    case 'circle': B.root.style.clipPath = shapePolygon(circleRadius, p); break;
    case 'zoom': A.root.style.transform = `scale(${1 + 2.2 * Math.min(1, p * 1.6)})`; B.root.style.opacity = clamp((p - 0.45) / 0.55, 0, 1); break;
    case 'flash': fx.style.display = 'block'; fx.style.background = '#fff'; fx.style.opacity = 1 - Math.abs(2 * p - 1); B.root.style.opacity = p < 0.5 ? 0 : 1; break;
    case 'blur': A.root.style.filter = `blur(${(p * 14).toFixed(1)}px)`; B.root.style.filter = `blur(${((1 - p) * 14).toFixed(1)}px)`; B.root.style.opacity = p; break;
    case 'liquid': fx.style.display = 'block'; fx.style.background = LIQUID_PINK; fx.style.clipPath = shapePolygon(liquidRadius, p); B.root.style.opacity = p < 0.5 ? 0 : 1; break;
    case 'star': B.root.style.clipPath = shapePolygon(starRadius, p); break;
    default: B.root.style.opacity = p;
  }
}

/* ---------- main frame update ---------- */
function applyFrame(force) {
  const T = total(); gTime = clamp(gTime, 0, Math.max(0, T - 0.001));
  const { act, trans } = activeAt(gTime);
  const used = new Set();
  for (const a of act) {
    const sl = slots[a.i % 2]; used.add(sl.n);
    resetSlotFx(sl);
    const k = a.i + '|' + JSON.stringify(project.segments[a.i].frame) + JSON.stringify(project.segments[a.i].content) + project.segments[a.i].bg + S();
    if (force || sl.key !== k || project.segments[a.i].freeze) { layoutSlot(sl, a.i, a.local); sl.key = k; }
    syncSlotVideo(sl, a.i, a.local, force);
    renderTexts(sl, a.i, a.local, act.length === 1);
  }
  for (const sl of slots) if (!used.has(sl.n)) { sl.root.style.display = 'none'; Object.values(sl.vids).forEach(v => { if (!v.paused) v.pause(); }); sl.seg = -1; sl.key = ''; }
  $('transFx').style.display = 'none';
  if (trans) applyTransition(slots[(trans.i - 1) % 2], slots[trans.i % 2], trans.type, trans.p);
  syncAudio(gTime);
  renderOverlay(gTime);
  renderFrameUI(act.length === 1 ? act[0].i : -1);
  $('timeLbl').textContent = `${gTime.toFixed(1)} / ${T.toFixed(1)}s`;
  updatePlayhead();
}

/* ---------- segment texts (inside the slot, so they move with transitions) ---------- */
function pillCss(t, s) {
  const size = t.size * s, sw = (t.stroke || 0) * s;
  return {
    left: t.x * s + 'px', top: t.y * s + 'px', fontFamily: `"F-${t.font}"`, fontSize: size + 'px', lineHeight: LH * size + 'px',
    padding: `${0.28 * size}px ${0.48 * size + sw}px`, color: t.color,
    transform: `translateX(-50%) rotate(${t.rot || 0}deg)`,
    borderRadius: (t.bg === 'pill' ? 0.44 : 0.14) * size + 'px',
    background: t.bg === 'none' ? 'transparent' : t.bgColor,
    boxShadow: t.shadow && t.bg !== 'none' ? `0 ${0.09 * size}px ${0.3 * size}px rgba(40,10,80,.28)` : 'none',
    textShadow: t.shadow && t.bg === 'none' ? `0 ${0.054 * size}px ${0.16 * size}px rgba(20,5,40,.6)` : 'none',
    webkitTextStroke: sw > 0 ? `${2 * sw}px ${t.strokeColor}` : '0', paintOrder: 'stroke fill'
  };
}
function renderTexts(sl, i, local, editable) {
  if (interacting) return;
  const seg = project.segments[i], d = segDur(seg);
  const vis = (seg.texts || []).map((t, k) => ({ t, k })).filter(({ t }) => t.text.trim() && local >= t.start && local <= Math.min(t.end, d) + 0.001);
  const key = i + '|' + vis.map(x => x.k).join(',') + '|' + selSeg + ':' + selText + ':' + tab + '|' + S() + JSON.stringify(seg.texts) + editable;
  if (key === sl.tkey) return;
  sl.tkey = key; sl.texts.innerHTML = ''; const s = S();
  for (const { t, k } of vis) {
    const p = el('div');
    const sel = editable && i === selSeg && k === selText && tab === 'text';
    p.className = 'pill' + (sel ? ' sel' : '');
    p.textContent = t.text; const css = pillCss(t, s); Object.assign(p.style, css); p.style.webkitTextStroke = css.webkitTextStroke;
    if (sel) {
      const hr = el('div', 'h-rot'); const hs = el('div', 'h-scale'); p.append(hr, hs);
      hr.addEventListener('pointerdown', e => dragText(e, i, k, p, 'rot'));
      hs.addEventListener('pointerdown', e => dragText(e, i, k, p, 'scale'));
    }
    if (editable) p.addEventListener('pointerdown', e => dragText(e, i, k, p, 'move'));
    p.addEventListener('dblclick', () => { tab = 'text'; renderInspector(); const ta = document.querySelector(`[data-ta="${k}"]`); ta && ta.focus(); });
    sl.texts.appendChild(p);
  }
}
/* generic drag helper: listeners on window so DOM rebuilds can't drop the gesture */
function dragGesture(e, onMove, onEnd) {
  e.preventDefault(); e.stopPropagation();
  const o = { px: e.clientX, py: e.clientY }; let moved = false;
  const move = ev => {
    const dx = ev.clientX - o.px, dy = ev.clientY - o.py;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    if (!moved) { moved = true; commit(); interacting = true; }
    onMove(dx, dy, ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    interacting = false; $('guide').style.display = 'none'; $('hguide').style.display = 'none';
    onEnd(moved);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function dragText(e, i, k, node, mode) {
  const t = project.segments[i].texts[k], s = S();
  if (selSeg !== i || selText !== k || tab !== 'text') {
    e.preventDefault(); e.stopPropagation();
    selSeg = i; selText = k; tab = 'text'; renderTimeline(); renderInspector(); markStage(); applyFrame(false);
    return;
  }
  const r = node.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const o = { x: t.x, y: t.y, size: t.size, dist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1 };
  dragGesture(e, (dx, dy, ev) => {
    if (mode === 'move') {
      let nx = o.x + dx / s; const snap = Math.abs(nx - 540) < 14; if (snap) nx = 540;
      t.x = Math.round(clamp(nx, -200, 1280)); t.y = Math.round(clamp(o.y + dy / s, -100, 1900));
      $('guide').style.display = snap ? 'block' : 'none';
    } else if (mode === 'rot') {
      let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; if (a > 180) a -= 360;
      for (const sn of [0, 90, -90, 180, -180]) if (Math.abs(a - sn) < 4) a = sn;
      t.rot = Math.round(a);
    } else t.size = Math.round(clamp(o.size * Math.hypot(ev.clientX - cx, ev.clientY - cy) / o.dist, 16, 260));
    const css = pillCss(t, s); Object.assign(node.style, css); node.style.webkitTextStroke = css.webkitTextStroke;
  }, moved => { if (moved) { save(); renderInspector(); } markStage(); applyFrame(false); });
}

/* ---------- global overlay: badge ---------- */
let ovKey = '';
function renderOverlay() {
  const s = S(), key = [project.badge.on, project.badge.text, s].join('|');
  if (key === ovKey) return;
  ovKey = key; const layer = $('ovLayer'); layer.innerHTML = '';
  if (!project.badge.on) return;
  const b = el('div', 'badge'); b.textContent = project.badge.text;
  Object.assign(b.style, { left: 40 * s + 'px', top: 150 * s + 'px', fontSize: 30 * s + 'px', padding: `${12 * s}px ${22 * s}px`, borderRadius: 30 * s + 'px' });
  layer.appendChild(b);
}

/* ---------- frame editing UI (片段 tab): move / resize / crop / rotate the video frame ---------- */
const rad = d => d * Math.PI / 180;
function frameCenter(f) { return { x: f.x + f.w / 2, y: f.y + f.h / 2 }; }
function renderFrameUI(i) {
  const ui = $('frameUI');
  if (i < 0 || tab !== 'seg' || playing || i !== selSeg) { ui.style.display = 'none'; return; }
  const f = project.segments[i].frame, s = S();
  ui.style.display = 'block';
  Object.assign(ui.style, { left: f.x * s + 'px', top: f.y * s + 'px', width: f.w * s + 'px', height: f.h * s + 'px', transform: `rotate(${f.rot || 0}deg)` });
  ui.classList.toggle('content-mode', frameMode === 'content');
}
function initFrameUI() {
  const ui = $('frameUI');
  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
  for (const h of handles) { const d = el('div', 'fh fh-' + h); d.dataset.h = h; ui.appendChild(d); }
  ui.addEventListener('pointerdown', e => {
    const seg = project.segments[selSeg]; if (!seg) return;
    const h = e.target.dataset.h || (frameMode === 'content' ? 'content' : 'move');
    frameDrag(e, seg, h);
  });
}
function frameDrag(e, seg, h) {
  const s = S(), f = seg.frame, c = seg.content;
  const o = { f: clone(f), c: clone(c) };
  const th = rad(f.rot || 0), cos = Math.cos(th), sin = Math.sin(th);
  const c0 = frameCenter(o.f);
  const toLocal = (dx, dy) => ({ x: dx * cos + dy * sin, y: -dx * sin + dy * cos });
  const toWorld = (lx, ly) => ({ x: lx * cos - ly * sin, y: lx * sin + ly * cos });
  const stage = $('stage').getBoundingClientRect();
  dragGesture(e, (dx, dy, ev) => {
    dx /= s; dy /= s;
    if (h === 'move') {
      let nx = o.f.x + dx, ny = o.f.y + dy;
      const cx = nx + f.w / 2, cy = ny + f.h / 2, sx = Math.abs(cx - 540) < 14, sy = Math.abs(cy - 960) < 14;
      if (sx) nx = 540 - f.w / 2; if (sy) ny = 960 - f.h / 2;
      f.x = r2(nx); f.y = r2(ny);
      $('guide').style.display = sx ? 'block' : 'none'; $('hguide').style.display = sy ? 'block' : 'none';
    } else if (h === 'content') {
      const l = toLocal(dx, dy); c.x = r2(o.c.x + l.x); c.y = r2(o.c.y + l.y);
    } else if (h === 'rot') {
      const px = (ev.clientX - stage.left) / s, py = (ev.clientY - stage.top) / s;
      let a = Math.atan2(py - c0.y, px - c0.x) * 180 / Math.PI + 90; if (a > 180) a -= 360;
      for (const sn of [0, 90, -90, 180, -180]) if (Math.abs(a - sn) < 4) a = sn;
      f.rot = Math.round(a);
    } else if (h.length === 2) { // corner: scale frame + content together, opposite corner fixed
      const sx = h[1] === 'e' ? 1 : -1, sy = h[0] === 's' ? 1 : -1;
      const l = toLocal(dx, dy);
      const diag0 = Math.hypot(o.f.w, o.f.h);
      const proj = (l.x * sx * o.f.w + l.y * sy * o.f.h) / diag0;
      const k = clamp((diag0 + proj) / diag0, 0.08, 8);
      f.w = r2(o.f.w * k); f.h = r2(o.f.h * k);
      c.x = r2(o.c.x * k); c.y = r2(o.c.y * k); c.w = r2(o.c.w * k);
      const opp = toWorld(-sx * o.f.w / 2, -sy * o.f.h / 2), oppW = { x: c0.x + opp.x, y: c0.y + opp.y };
      const nc = toWorld(sx * f.w / 2, sy * f.h / 2);
      const cx = oppW.x + nc.x, cy = oppW.y + nc.y;
      f.x = r2(cx - f.w / 2); f.y = r2(cy - f.h / 2);
    } else { // edge: crop (content stays where it is on the canvas)
      const l = toLocal(dx, dy);
      let dw = 0, dh = 0, shiftX = 0, shiftY = 0;
      if (h === 'e') { dw = l.x; shiftX = l.x / 2; }
      if (h === 'w') { dw = -l.x; shiftX = l.x / 2; }
      if (h === 's') { dh = l.y; shiftY = l.y / 2; }
      if (h === 'n') { dh = -l.y; shiftY = l.y / 2; }
      const nw = Math.max(40, o.f.w + dw), nh = Math.max(40, o.f.h + dh);
      if (nw === 40) shiftX = 0; if (nh === 40) shiftY = 0;
      f.w = r2(nw); f.h = r2(nh);
      const sh = toWorld(shiftX, shiftY), cx = c0.x + sh.x, cy = c0.y + sh.y;
      f.x = r2(cx - f.w / 2); f.y = r2(cy - f.h / 2);
      if (h === 'w') c.x = r2(o.c.x - (f.w - o.f.w));
      if (h === 'n') c.y = r2(o.c.y - (f.h - o.f.h));
    }
    const sl = slots[selSeg % 2]; layoutSlot(sl, selSeg, segAt(gTime).local); sl.key = ''; renderFrameUI(selSeg);
  }, moved => { if (moved) { save(); renderInspector(); } markStage(); applyFrame(true); });
}

/* ---------- loop ---------- */
function tick(now) {
  if (playing && !interacting) {
    gTime += Math.min((now - lastTick) / 1000, 0.1);
    if (gTime >= total() - 0.002) { gTime = total() - 0.002; setPlaying(false); }
  }
  lastTick = now;
  if (!interacting) applyFrame(false);
  requestAnimationFrame(tick);
}
function setPlaying(p) {
  playing = p; lastTick = performance.now();
  $('playBtn').textContent = p ? '⏸ 暂停' : '▶ 播放';
  if (!p) { allVideos().forEach(v => v.pause()); Object.values(audioEls).forEach(a => a.el.pause()); }
  applyFrame(true);
}
function seek(t) { gTime = clamp(t, 0, total() - 0.001); applyFrame(true); }
