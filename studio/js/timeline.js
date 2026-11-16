/* AI-VidStudio · timeline.js — lanes: clips (with transitions), voice, music */
'use strict';
let zoom = 1, dragPPS = 0;
function tlLen() {
  return Math.max(total(), ...project.audio.map(c => c.start + clipDur(c)), 1);
}
function pps() { if (dragPPS) return dragPPS; const w = $('tlScroll').clientWidth - 4; return (w / tlLen()) * zoom; }
const TRANS_ICON = { none: '＋', fade: '◐', slideleft: '⇠', slideup: '⇡', wipe: '▌', smooth: '▒', circle: '◯', zoom: '⊕', flash: '✦', blur: '◌', liquid: '💗', star: '⭐' };

function laneBlock(cls, left, width, label, sel, onDown, onTrim) {
  const b = el('div', 'blk ' + cls + (sel ? ' sel' : ''));
  Object.assign(b.style, { left: left + 'px', width: Math.max(width - 2, 8) + 'px' });
  b.innerHTML = `<span class="n"></span><div class="trim l"></div><div class="trim r"></div>`;
  b.querySelector('.n').textContent = label;
  b.addEventListener('pointerdown', e => { if (!e.target.classList.contains('trim')) onDown(e); });
  b.querySelector('.trim.l').addEventListener('pointerdown', e => onTrim(e, 'l'));
  b.querySelector('.trim.r').addEventListener('pointerdown', e => onTrim(e, 'r'));
  return b;
}
function renderTimeline() {
  const T = total(), P = pps(), tl = $('tl'), st = starts();
  tl.style.width = Math.max(tlLen() * P, $('tlScroll').clientWidth - 2) + 'px';
  tl.innerHTML = '';
  const ruler = el('div', 'ruler');
  const step = P > 60 ? 1 : P > 25 ? 2 : 5;
  for (let s = 0; s <= tlLen(); s += step) { const k = el('div', 'tick'); k.style.left = s * P + 'px'; k.textContent = s + 's'; ruler.appendChild(k); }
  ruler.addEventListener('pointerdown', e => { const r = tl.getBoundingClientRect(); seek((e.clientX - r.left) / P); });
  tl.appendChild(ruler);

  // clips
  const lane = el('div', 'lane');
  project.segments.forEach((s, i) => {
    const d = segDur(s);
    const b = el('div', 'blk ' + (s.freeze ? 'freeze' : (s.frame && s.frame.w < W - 1 ? 'phone' : 'full')) + (i === selSeg ? ' sel' : ''));
    Object.assign(b.style, { left: st[i] * P + 'px', width: Math.max(d * P - 2, 6) + 'px', zIndex: i });
    b.innerHTML = `<span class="n"></span><span class="d">${d.toFixed(1)}s${s.speed && s.speed !== 1 && !s.freeze ? ' · ' + s.speed + 'x' : ''}</span><div class="trim l"></div><div class="trim r"></div>`;
    b.querySelector('.n').textContent = s.name;
    b.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('trim')) return;
      const r = tl.getBoundingClientRect();
      selSeg = i; selText = -1; if (tab !== 'seg' && tab !== 'text') tab = 'seg';
      renderTimeline(); renderInspector(); seek((e.clientX - r.left) / P);
    });
    b.querySelector('.trim.l').addEventListener('pointerdown', e => trimSeg(e, i, 'l'));
    b.querySelector('.trim.r').addEventListener('pointerdown', e => trimSeg(e, i, 'r'));
    lane.appendChild(b);
    if (i > 0) { // transition marker at the cut
      const tr = s.trans || { type: 'none' };
      const m = el('button', 'trans-mk' + (tr.type !== 'none' ? ' on' : ''), TRANS_ICON[tr.type] || '＋');
      m.title = '转场：' + (TRANSITIONS.find(x => x[0] === tr.type) || ['', '无'])[1];
      m.style.left = (st[i] + transDur(i) / 2) * P + 'px';
      m.addEventListener('pointerdown', e => { e.stopPropagation(); selSeg = i; tab = 'seg'; renderTimeline(); renderInspector(); const sec = $('transSection'); sec && sec.scrollIntoView({ block: 'nearest' }); seek(st[i] + 0.01); });
      lane.appendChild(m);
    }
  });
  tl.appendChild(lane);

  // audio lanes: voice + music
  for (const [kind, label] of [['voice', '🎙 人声'], ['music', '🎵 音乐']]) {
    const al = el('div', 'lane small audio');
    if (!project.audio.some(c => c.kind === kind)) al.innerHTML = `<div class="lane-empty">${label}：在"声音"分页上传</div>`;
    project.audio.forEach((c, j) => {
      if (c.kind !== kind) return;
      const b = laneBlock(hasFile(c) ? c.kind : 'missing', c.start * P, clipDur(c) * P, (c.kind === 'voice' ? '🎙 ' : '🎵 ') + c.name, j === selAudio && tab === 'audio',
        e => moveClip(e, j, 'move'), (e, side) => moveClip(e, j, side));
      b.style.opacity = c.mute ? .45 : 1;
      al.appendChild(b);
    });
    tl.appendChild(al);
  }
  const ph = el('div', 'playhead'); ph.id = 'playhead'; ph.style.left = gTime * P + 'px'; tl.appendChild(ph);
  const lp = $('lenPill'); lp.textContent = `${T.toFixed(1)} 秒` + (T >= 20 && T <= 30 ? ' ✓' : ' · 建议 20–30 秒'); lp.classList.toggle('warn', !(T >= 20 && T <= 30));
  $('leftBtn').disabled = selSeg <= 0; $('rightBtn').disabled = selSeg >= project.segments.length - 1;
  $('delBtn').disabled = project.segments.length <= 1; $('undoBtn').disabled = !history.length;
  $('badgeOn').checked = project.badge.on; if (document.activeElement !== $('badgeText')) $('badgeText').value = project.badge.text;
}
function trimSeg(e, i, side) {
  const s = project.segments[i], src = project.sources[s.src];
  dragPPS = pps(); const P = dragPPS; const o = { in: s.in, out: s.out }; selSeg = i;
  dragGesture(e, dx => {
    const dt = dx / P, sp = s.freeze ? 1 : (s.speed || 1);
    if (s.freeze) s.out = s.in + clamp((o.out - o.in) + (side === 'r' ? dt : -dt), 0.3, 10);
    else if (side === 'l') s.in = r2(clamp(o.in + dt * sp, 0, s.out - 0.1));
    else s.out = r2(clamp(o.out + dt * sp, s.in + 0.1, src.dur));
    renderTimeline();
    gTime = segStart(i) + (side === 'l' ? 0 : segDur(s) - 0.01); interacting = false; applyFrame(true); interacting = true;
  }, () => { dragPPS = 0; refresh(true); });
}
function moveClip(e, j, mode) {
  const c = project.audio[j]; dragPPS = pps(); const P = dragPPS;
  const o = { start: c.start, in: c.in, out: c.out };
  if (selAudio !== j || tab !== 'audio') { selAudio = j; tab = 'audio'; renderInspector(); }
  dragGesture(e, dx => {
    const dt = dx / P;
    if (mode === 'move') c.start = r2(Math.max(0, o.start + dt));
    else if (mode === 'l') { const d = clamp(dt, -o.in, o.out - o.in - 0.1); c.in = r2(o.in + d); c.start = r2(Math.max(0, o.start + d)); }
    else c.out = r2(clamp(o.out + dt, c.in + 0.1, c.fileDur || 9999));
    renderTimeline();
  }, () => { dragPPS = 0; refresh(true); });
}
