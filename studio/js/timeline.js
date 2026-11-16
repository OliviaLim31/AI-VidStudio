/* AI-VidStudio · timeline.js — CapCut-style timeline.
 *  · drag the playhead / ruler (or click empty space) to scrub
 *  · click a clip to select it; drag a selected clip's white handles to trim
 *  · drag a clip (mouse) to reorder; on touch use 往前移 / 往后移
 *  · Ctrl/⌘ + wheel or pinch to zoom, wheel to scroll; playhead is followed while playing
 *  · clips show thumbnails; voice / music lanes below */
'use strict';
let zoom = 1, dragPPS = 0, scrubbing = false;
const TL_PAD = 14;
function tlLen() { return Math.max(total(), ...project.audio.map(c => c.start + clipDur(c)), 1); }
function pps() {
  if (dragPPS) return dragPPS;
  const w = $('tlScroll').clientWidth - 2 * TL_PAD - 4;
  const base = Math.max(w / tlLen(), w < 600 ? 40 : 0); // phones: keep clips wide enough to grab, scroll sideways like CapCut
  return base * zoom;
}
const timeToX = t => TL_PAD + t * pps();
const xToTime = x => (x - TL_PAD) / pps();
const tlLocalX = clientX => clientX - $('tl').getBoundingClientRect().left;
function fmtTC(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(s % 1 ? 1 : 0).padStart(s % 1 ? 4 : 2, '0')}`; }
const TRANS_ICON = { none: '＋', fade: '◐', slideleft: '⇠', slideup: '⇡', wipe: '▌', smooth: '▒', circle: '◯', zoom: '⊕', flash: '✦', blur: '◌', liquid: '💗', star: '⭐' };

/* ---------- clip thumbnails (same-origin preview files → canvas) ---------- */
const thumbCache = {}, thumbQueue = [], thumbVids = {};
let thumbBusy = false, tlTimer = 0;
function scheduleTL() { clearTimeout(tlTimer); tlTimer = setTimeout(() => { if (!interacting && !scrubbing) renderTimeline(); }, 80); }
function getThumb(src, t) {
  const tt = Math.round(t * 2) / 2, k = src + '@' + tt;
  if (thumbCache[k] === undefined) { thumbCache[k] = null; thumbQueue.push([src, tt, k]); pumpThumbs(); }
  return thumbCache[k];
}
async function pumpThumbs() {
  if (thumbBusy) return; thumbBusy = true; let made = 0;
  while (thumbQueue.length) {
    const [src, t, k] = thumbQueue.shift();
    try { thumbCache[k] = await grabThumb(src, t); made++; } catch (e) { thumbCache[k] = ''; }
    if (made && made % 8 === 0) scheduleTL();
  }
  thumbBusy = false; if (made) scheduleTL();
}
function grabThumb(src, t) {
  return new Promise((res, rej) => {
    let v = thumbVids[src];
    if (!v) { v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = project.sources[src].file; thumbVids[src] = v; }
    const timer = setTimeout(() => rej('timeout'), 5000);
    const draw = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas'); c.width = 60; c.height = 106; const g = c.getContext('2d');
        const vw = v.videoWidth, vh = v.videoHeight, sh = Math.min(vh, vw * 106 / 60), sw = sh * 60 / 106;
        g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 60, 106);
        res(c.toDataURL('image/jpeg', 0.6));
      } catch (e) { rej(e); }
    };
    const go = () => {
      const target = Math.max(0, Math.min(t, (v.duration || t + 1) - 0.05));
      if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) return draw();
      v.addEventListener('seeked', draw, { once: true }); v.currentTime = target;
    };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  });
}

/* ---------- drawing ---------- */
function renderTimeline() {
  const T = total(), P = pps(), tl = $('tl'), st = starts();
  tl.style.width = Math.max(2 * TL_PAD + tlLen() * P, $('tlScroll').clientWidth) + 'px';
  tl.innerHTML = '';

  // ruler with major / minor ticks
  const ruler = el('div', 'ruler');
  const major = [0.5, 1, 2, 5, 10, 15, 30, 60].find(s => s * P >= 64) || 60, minor = major / (major >= 2 ? 4 : 5);
  for (let k = 0; k * minor <= tlLen() + 1e-6; k++) {
    const t = k * minor, isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    const tk = el('div', 'tick' + (isMajor ? ' major' : '')); tk.style.left = timeToX(t) + 'px';
    if (isMajor) tk.textContent = fmtTC(t);
    ruler.appendChild(tk);
  }
  ruler.addEventListener('pointerdown', scrubStart);
  tl.appendChild(ruler);

  // video lane
  const lane = el('div', 'lane video-lane');
  lane.addEventListener('pointerdown', e => { if (e.target === lane) laneTap(e); });
  project.segments.forEach((s, i) => {
    const d = segDur(s), left = timeToX(st[i]), width = Math.max(d * P - 2, 6), sel = i === selSeg;
    const b = el('div', 'blk clip' + (sel ? ' sel' : '') + (s.freeze ? ' freeze' : ''));
    Object.assign(b.style, { left: left + 'px', width: width + 'px', zIndex: sel ? 30 : i + 1 });
    const strip = el('div', 'thumbs'), n = Math.max(1, Math.round(width / 30));
    for (let k = 0; k < n; k++) {
      const t = s.freeze ? s.in : s.in + (s.out - s.in) * (k + 0.5) / n;
      const u = getThumb(s.src, t); const tile = el('div', 'tile'); if (u) tile.style.backgroundImage = `url(${u})`;
      strip.appendChild(tile);
    }
    b.appendChild(strip);
    const lab = el('div', 'lab'); lab.innerHTML = `<span class="n"></span><span class="d">${d.toFixed(1)}s${s.speed && s.speed !== 1 && !s.freeze ? ' · ' + s.speed + 'x' : ''}${s.freeze ? ' · 定格' : ''}</span>`;
    lab.querySelector('.n').textContent = s.name; b.appendChild(lab);
    if (sel) {
      const l = el('div', 'trim l'), r = el('div', 'trim r'); b.append(l, r);
      l.addEventListener('pointerdown', e => trimSeg(e, i, 'l')); r.addEventListener('pointerdown', e => trimSeg(e, i, 'r'));
    }
    b.addEventListener('pointerdown', e => { if (!e.target.classList.contains('trim')) clipDown(e, i); });
    lane.appendChild(b);
    if (i > 0) {
      const tr = s.trans || { type: 'none' };
      const m = el('button', 'trans-mk' + (tr.type !== 'none' ? ' on' : ''), TRANS_ICON[tr.type] || '＋');
      m.title = '转场：' + (TRANSITIONS.find(x => x[0] === tr.type) || ['', '无'])[1];
      m.style.left = timeToX(st[i] + transDur(i) / 2) + 'px';
      m.addEventListener('pointerdown', e => e.stopPropagation());
      m.addEventListener('click', e => { e.stopPropagation(); selSeg = i; tab = 'seg'; renderTimeline(); renderInspector(); const sec = $('transSection'); sec && sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); seek(st[i] + 0.01); });
      lane.appendChild(m);
    }
  });
  tl.appendChild(lane);

  // audio lanes
  for (const [kind, label] of [['voice', '🎙 人声'], ['music', '🎵 音乐']]) {
    const al = el('div', 'lane small audio');
    al.addEventListener('pointerdown', e => { if (e.target === al) laneTap(e); });
    if (!project.audio.some(c => c.kind === kind)) al.innerHTML = `<div class="lane-empty">${label}：在"声音"分页上传</div>`;
    project.audio.forEach((c, j) => {
      if (c.kind !== kind) return;
      const sel = j === selAudio && tab === 'audio';
      const b = el('div', 'blk ' + (hasFile(c) ? c.kind : 'missing') + (sel ? ' sel' : ''));
      Object.assign(b.style, { left: timeToX(c.start) + 'px', width: Math.max(clipDur(c) * P - 2, 8) + 'px', opacity: c.mute ? .45 : 1 });
      b.innerHTML = `<span class="n"></span><div class="trim l"></div><div class="trim r"></div>`;
      b.querySelector('.n').textContent = (c.kind === 'voice' ? '🎙 ' : '🎵 ') + c.name;
      b.addEventListener('pointerdown', e => { if (!e.target.classList.contains('trim')) moveClip(e, j, 'move'); });
      b.querySelector('.trim.l').addEventListener('pointerdown', e => moveClip(e, j, 'l'));
      b.querySelector('.trim.r').addEventListener('pointerdown', e => moveClip(e, j, 'r'));
      al.appendChild(b);
    });
    tl.appendChild(al);
  }

  // playhead with a draggable head on the ruler
  const ph = el('div', 'playhead'); ph.id = 'playhead'; ph.style.left = timeToX(gTime) + 'px';
  const head = el('div', 'ph-head'); ph.appendChild(head);
  head.addEventListener('pointerdown', scrubStart);
  tl.appendChild(ph);
  const snap = el('div', 'snapline'); snap.id = 'snapline'; tl.appendChild(snap);

  const lp = $('lenPill'); lp.textContent = `${T.toFixed(1)} 秒` + (T >= 20 && T <= 30 ? ' ✓' : ' · 建议 20–30 秒'); lp.classList.toggle('warn', !(T >= 20 && T <= 30));
  $('leftBtn').disabled = selSeg <= 0; $('rightBtn').disabled = selSeg >= project.segments.length - 1;
  $('delBtn').disabled = project.segments.length <= 1; $('undoBtn').disabled = !history.length;
  $('badgeOn').checked = project.badge.on; if (document.activeElement !== $('badgeText')) $('badgeText').value = project.badge.text;
  $('zoom').value = zoom;
}

/* ---------- playhead ---------- */
function updatePlayhead() {
  const ph = $('playhead'); if (!ph) return;
  const x = timeToX(gTime); ph.style.left = x + 'px';
  if (playing && !scrubbing && !interacting) { // follow the playhead like CapCut
    const sc = $('tlScroll');
    if (x < sc.scrollLeft + 10 || x > sc.scrollLeft + sc.clientWidth - 30) sc.scrollLeft = x - sc.clientWidth * 0.25;
  }
}
function autoScrollEdge(clientX) {
  const sc = $('tlScroll'), r = sc.getBoundingClientRect();
  if (clientX < r.left + 30) sc.scrollLeft -= 14; else if (clientX > r.right - 30) sc.scrollLeft += 14;
}
function scrubStart(e) {
  if (e.button > 0) return;
  e.preventDefault(); e.stopPropagation();
  if (playing) setPlaying(false);
  scrubbing = true;
  const set = ev => { seek(clamp(xToTime(tlLocalX(ev.clientX)), 0, total() - 0.001)); updatePlayhead(); autoScrollEdge(ev.clientX); };
  set(e);
  const up = () => { scrubbing = false; window.removeEventListener('pointermove', set); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  window.addEventListener('pointermove', set); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function laneTap(e) { // mouse: scrub straight away; touch: a tap seeks, a swipe scrolls the timeline
  if (e.pointerType !== 'touch') return scrubStart(e);
  const x0 = e.clientX, y0 = e.clientY;
  const up = ev => { window.removeEventListener('pointerup', up); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) { if (playing) setPlaying(false); seek(clamp(xToTime(tlLocalX(ev.clientX)), 0, total() - 0.001)); } };
  window.addEventListener('pointerup', up);
}

/* ---------- clips: select, reorder, trim ---------- */
function clipDown(e, i) {
  if (e.button > 0) return;
  const seg = project.segments[i], st = starts();
  const changed = selSeg !== i;
  selSeg = i; selText = -1; if (tab === 'audio') tab = 'seg';
  if (gTime < st[i] || gTime >= st[i] + segDur(seg)) gTime = st[i] + 0.01;
  if (changed) { renderInspector(); renderTimeline(); }
  applyFrame(true);
  if (e.pointerType === 'touch') return; // touch: tap selects, swipe scrolls
  e.preventDefault();
  const x0 = e.clientX; let dragging = false, target = i, ghost = null, marker = null;
  const others = project.segments.map((s, k) => ({ k, d: segDur(s) })).filter(o => o.k !== i);
  const move = ev => {
    if (!dragging && Math.abs(ev.clientX - x0) < 6) return;
    if (!dragging) {
      dragging = true; interacting = true; dragPPS = pps();
      const blk = $('tl').querySelectorAll('.clip')[i], lane = blk.parentNode;
      ghost = blk.cloneNode(true); ghost.classList.add('ghost'); lane.appendChild(ghost); blk.classList.add('dragging');
      marker = el('div', 'insert-mark'); lane.appendChild(marker);
    }
    const t = xToTime(tlLocalX(ev.clientX));
    let acc = 0; target = 0;
    for (const o of others) { if (t > acc + o.d / 2) target++; acc += o.d; }
    ghost.style.left = (tlLocalX(ev.clientX) - parseFloat(ghost.style.width) / 2) + 'px';
    let mt = 0; for (let k = 0; k < target; k++) mt += others[k].d;
    marker.style.left = timeToX(mt) + 'px';
    autoScrollEdge(ev.clientX);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (!dragging) return;
    interacting = false; dragPPS = 0;
    if (target !== i) {
      commit(); const [s] = project.segments.splice(i, 1); project.segments.splice(target, 0, s);
      selSeg = target; gTime = starts()[target] + 0.01; refresh(true); toast('已调整顺序');
    } else renderTimeline();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function trimSeg(e, i, side) {
  const s = project.segments[i], src = project.sources[s.src];
  dragPPS = pps(); const P = dragPPS; const o = { in: s.in, out: s.out }; selSeg = i;
  if (playing) setPlaying(false);
  dragGesture(e, dx => {
    const dt = dx / P, sp = s.freeze ? 1 : (s.speed || 1);
    if (s.freeze) s.out = s.in + clamp((o.out - o.in) + (side === 'r' ? dt : -dt), 0.3, 10);
    else if (side === 'l') s.in = r2(clamp(o.in + dt * sp, 0, s.out - 0.1));
    else s.out = r2(clamp(o.out + dt * sp, s.in + 0.1, src.dur));
    renderTimeline();
    gTime = segStart(i) + (side === 'l' ? 0 : segDur(s) - 0.01); interacting = false; applyFrame(true); interacting = true;
  }, () => { dragPPS = 0; refresh(true); });
}

/* ---------- audio clips: move / trim with snapping to the playhead and clip edges ---------- */
function snapTime(t, P, exclude) {
  const pts = [gTime, 0, total(), ...starts(), ...project.audio.filter(c => c !== exclude).flatMap(c => [c.start, c.start + clipDur(c)])];
  let best = null;
  for (const p of pts) if (Math.abs(p - t) * P < 8 && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
  const sl = $('snapline'); if (sl) { sl.style.display = best === null ? 'none' : 'block'; if (best !== null) sl.style.left = timeToX(best) + 'px'; }
  return best === null ? t : best;
}
function moveClip(e, j, mode) {
  const c = project.audio[j]; dragPPS = pps(); const P = dragPPS;
  const o = { start: c.start, in: c.in, out: c.out };
  if (selAudio !== j || tab !== 'audio') { selAudio = j; tab = 'audio'; renderInspector(); }
  dragGesture(e, dx => {
    const dt = dx / P;
    let snapAt = null;
    if (mode === 'move') {
      let ns = Math.max(0, o.start + dt); const d = clipDur(c);
      const s1 = snapTime(ns, P, c); if (s1 !== ns) { ns = s1; snapAt = s1; } else { const s2 = snapTime(ns + d, P, c); if (s2 !== ns + d) { ns = s2 - d; snapAt = s2; } }
      c.start = r2(Math.max(0, ns));
    } else if (mode === 'l') { const ns = snapTime(o.start + dt, P, c); if (ns !== o.start + dt) snapAt = ns; const dd = clamp(ns - o.start, -o.in, o.out - o.in - 0.1); c.in = r2(o.in + dd); c.start = r2(Math.max(0, o.start + dd)); }
    else { const raw = o.start + (o.out - o.in) + dt, end = snapTime(raw, P, c); if (end !== raw) snapAt = end; c.out = r2(clamp(o.in + (end - o.start), c.in + 0.1, c.fileDur || 9999)); }
    renderTimeline();
    const sl = $('snapline'); sl.style.display = snapAt === null ? 'none' : 'block'; if (snapAt !== null) sl.style.left = timeToX(snapAt) + 'px';
  }, () => { dragPPS = 0; refresh(true); });
}

/* ---------- zoom & scroll ---------- */
function setZoom(z, anchorClientX) {
  const sc = $('tlScroll'), r = sc.getBoundingClientRect();
  const ax = anchorClientX !== undefined ? anchorClientX : (r.left + timeToX(gTime) - sc.scrollLeft);
  const at = xToTime(ax - r.left + sc.scrollLeft);
  zoom = clamp(z, 1, 20); renderTimeline();
  sc.scrollLeft = timeToX(at) - (ax - r.left);
}
function initTimelineControls() {
  const sc = $('tlScroll');
  sc.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX); return; }
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && sc.scrollWidth > sc.clientWidth + 2) { e.preventDefault(); sc.scrollLeft += e.deltaY; }
  }, { passive: false });
  $('zoom').oninput = e => setZoom(parseFloat(e.target.value));
  $('zoomIn').onclick = () => setZoom(zoom * 1.5);
  $('zoomOut').onclick = () => setZoom(zoom / 1.5);
  $('zoomFit').onclick = () => { zoom = 1; renderTimeline(); sc.scrollLeft = 0; };
}
