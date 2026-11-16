/* AI-VidStudio · stage.js */
'use strict';
/* ---------- frame ---------- */
function applyFrame(force) {
  const T = total(); gTime = clamp(gTime, 0, Math.max(0, T - 0.001));
  const { i, local } = segAt(gTime);
  const seg = project.segments[i];
  if (i !== activeIdx || force) activate(i);
  const v = videos[seg.src];
  const want = seg.freeze ? seg.in : seg.in + local * (seg.speed || 1);
  v.muted = muted || !seg.sound || seg.freeze;
  v.volume = clamp(project.mix.videoVolume, 0, 1);
  v.style.transform = seg.freeze && seg.layout !== 'phone' ? `scale(${1 + 0.024 * local})` : 'none';
  v.style.filter = seg.dim ? 'brightness(0.94)' : 'none';
  if (playing && !seg.freeze) {
    v.playbackRate = seg.speed || 1;
    if (Math.abs(v.currentTime - want) > 0.25 || force) v.currentTime = want;
    if (v.paused) v.play().catch(() => {});
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - want) > 0.03) v.currentTime = want;
  }
  syncAudio(gTime);
  renderTexts(i, local);
  $('timeLbl').textContent = `${gTime.toFixed(1)} / ${T.toFixed(1)}s`;
  $('playhead') && ($('playhead').style.left = gTime * pps() + 'px');
}

/* ---------- text rendering ---------- */
let lastKey = '';
function pillCss(t, s) {
  const size = t.size * s, sw = (t.stroke || 0) * s;
  const css = {
    left: t.x * s + 'px', top: t.y * s + 'px', fontFamily: `"F-${t.font}"`, fontSize: size + 'px', lineHeight: LH * size + 'px',
    padding: `${0.28 * size}px ${0.48 * size + sw}px`, color: t.color,
    transform: `translateX(-50%) rotate(${t.rot || 0}deg)`,
    borderRadius: (t.bg === 'pill' ? 0.44 : 0.14) * size + 'px',
    background: t.bg === 'none' ? 'transparent' : t.bgColor,
    boxShadow: t.shadow && t.bg !== 'none' ? `0 ${0.09 * size}px ${0.3 * size}px rgba(40,10,80,.28)` : 'none',
    textShadow: t.shadow && t.bg === 'none' ? `0 ${0.054 * size}px ${0.16 * size}px rgba(20,5,40,.6)` : 'none',
    webkitTextStroke: sw > 0 ? `${2 * sw}px ${t.strokeColor}` : '0', paintOrder: 'stroke fill'
  };
  return css;
}
function renderTexts(i, local, force) {
  if (interacting) return;
  const seg = project.segments[i], d = segDur(seg);
  const vis = (seg.texts || []).map((t, k) => ({ t, k })).filter(({ t }) => t.text.trim() && local >= t.start && local <= Math.min(t.end, d) + 0.001);
  const key = i + '|' + vis.map(x => x.k).join(',') + '|' + selSeg + ':' + selText + '|' + $('stage').clientWidth + JSON.stringify(seg.texts) + JSON.stringify(project.badge);
  if (key === lastKey && !force) return;
  lastKey = key;
  const layer = $('textLayer'); layer.innerHTML = ''; const s = S();
  if (project.badge.on) {
    const b = document.createElement('div'); b.className = 'badge'; b.textContent = project.badge.text;
    Object.assign(b.style, { left: 40 * s + 'px', top: 150 * s + 'px', fontSize: 30 * s + 'px', padding: `${12 * s}px ${22 * s}px`, borderRadius: 30 * s + 'px' });
    layer.appendChild(b);
  }
  for (const { t, k } of vis) {
    const el = document.createElement('div');
    const sel = i === selSeg && k === selText;
    el.className = 'pill' + (sel ? ' sel' : '');
    el.textContent = t.text; Object.assign(el.style, pillCss(t, s)); el.style.webkitTextStroke = pillCss(t, s).webkitTextStroke;
    if (sel) {
      const hr = document.createElement('div'); hr.className = 'h-rot'; el.appendChild(hr);
      const hs = document.createElement('div'); hs.className = 'h-scale'; el.appendChild(hs);
      hr.addEventListener('pointerdown', e => dragText(e, i, k, el, 'rot'));
      hs.addEventListener('pointerdown', e => dragText(e, i, k, el, 'scale'));
    }
    el.addEventListener('pointerdown', e => dragText(e, i, k, el, 'move'));
    el.addEventListener('dblclick', () => { tab = 'text'; renderInspector(); const ta = document.querySelector(`[data-ta="${k}"]`); ta && ta.focus(); });
    layer.appendChild(el);
  }
}
function dragText(e, i, k, el, mode) {
  e.preventDefault(); e.stopPropagation();
  const t = project.segments[i].texts[k], s = S();
  if (selSeg !== i || selText !== k || tab !== 'text') {
    selSeg = i; selText = k; tab = 'text'; renderTimeline(); renderInspector(); lastKey = ''; applyFrame(false);
    return; // first tap selects; next drag edits (handles appear)
  }
  const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const o = { x: t.x, y: t.y, size: t.size, rot: t.rot || 0, px: e.clientX, py: e.clientY, dist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1 };
  let moved = false; interacting = true;
  const tgt = window;
  const move = ev => {
    const dx = ev.clientX - o.px, dy = ev.clientY - o.py;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    if (!moved) { moved = true; commit(); }
    if (mode === 'move') {
      let nx = o.x + dx / s; const snap = Math.abs(nx - 540) < 14; if (snap) nx = 540;
      t.x = Math.round(clamp(nx, -200, 1280)); t.y = Math.round(clamp(o.y + dy / s, -100, 1900));
      $('guide').style.display = snap ? 'block' : 'none';
    } else if (mode === 'rot') {
      let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      if (a > 180) a -= 360;
      for (const sn of [0, 90, -90, 180, -180]) if (Math.abs(a - sn) < 4) a = sn;
      t.rot = Math.round(a);
    } else {
      const dnow = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      t.size = Math.round(clamp(o.size * dnow / o.dist, 16, 260));
    }
    Object.assign(el.style, pillCss(t, s)); el.style.webkitTextStroke = pillCss(t, s).webkitTextStroke;
  };
  const up = () => {
    interacting = false; $('guide').style.display = 'none';
    tgt.removeEventListener('pointermove', move); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up);
    if (moved) { save(); renderInspector(); } lastKey = ''; applyFrame(false);
  };
  tgt.addEventListener('pointermove', move); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
}
function markStage() { lastKey = ''; }

/* ---------- loop ---------- */
function tick(now) {
  if (playing && !interacting) {
    gTime += Math.min((now - lastTick) / 1000, 0.1);
    if (gTime >= total() - 0.002) { gTime = total() - 0.002; setPlaying(false); }
  }
  lastTick = now;
  applyFrame(false);
  requestAnimationFrame(tick);
}
function setPlaying(p) {
  playing = p; lastTick = performance.now();
  $('playBtn').textContent = p ? '⏸ 暂停' : '▶ 播放';
  if (!p) { Object.values(videos).forEach(v => v.pause()); Object.values(audioEls).forEach(a => a.el.pause()); }
  applyFrame(true);
}
function seek(t) { gTime = clamp(t, 0, total() - 0.001); applyFrame(true); }
