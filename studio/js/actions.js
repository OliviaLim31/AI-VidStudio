/* AI-VidStudio · actions.js */
'use strict';
/* ---------- actions ---------- */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderInspector(); renderTimeline(); }));
$('leftBtn').onclick = () => { if (selSeg <= 0) return; commit(); const a = project.segments; [a[selSeg - 1], a[selSeg]] = [a[selSeg], a[selSeg - 1]]; selSeg--; refresh(true); };
$('rightBtn').onclick = () => { const a = project.segments; if (selSeg >= a.length - 1) return; commit(); [a[selSeg + 1], a[selSeg]] = [a[selSeg], a[selSeg + 1]]; selSeg++; refresh(true); };
$('dupBtn').onclick = () => { commit(); const c = clone(project.segments[selSeg]); c.id = uid('s'); c.name += ' 副本'; project.segments.splice(selSeg + 1, 0, c); selSeg++; refresh(true); };
$('delBtn').onclick = () => { if (project.segments.length <= 1) return; commit(); project.segments.splice(selSeg, 1); selSeg = Math.min(selSeg, project.segments.length - 1); selText = -1; refresh(true); toast('已删除，按撤销可以恢复'); };
$('addBtn').onclick = () => { commit(); project.segments.splice(selSeg + 1, 0, { id: uid('s'), name: '新片段', src: 'result', in: 0, out: 2, speed: 1, freeze: false, dim: false, sound: true, sfx: 'none', texts: [], frame: clone(FRAME_PRESETS.full.f), content: { x: 0, y: 0, w: 1080 }, bg: 'black', trans: { type: 'none', dur: 0.5 } }); selSeg++; selText = -1; tab = 'seg'; refresh(true); };
$('splitBtn').onclick = () => {
  const { i, local } = segAt(gTime); const seg = project.segments[i]; const d = segDur(seg);
  if (local < 0.15 || local > d - 0.15) { toast('播放头太靠近片段边缘了'); return; }
  commit();
  const a = clone(seg), b = clone(seg); b.id = uid('s'); b.name = seg.name + ' (2)';
  if (seg.freeze) { a.out = a.in + local; b.out = b.in + (d - local); }
  else { const cut = r2(seg.in + local * (seg.speed || 1)); a.out = cut; b.in = cut; b.sfx = 'none'; }
  b.trans = { type: 'none', dur: 0.5 };
  a.texts = (seg.texts || []).filter(t => t.start < local).map(t => ({ ...t, end: Math.min(t.end, local) }));
  b.texts = (seg.texts || []).filter(t => Math.min(t.end, d) > local).map(t => ({ ...t, start: Math.max(0, t.start - local), end: t.end >= 99 ? 99 : t.end - local }));
  project.segments.splice(i, 1, a, b); selSeg = i + 1; selText = -1; refresh(true); toast('已切开');
};
$('badgeOn').onchange = e => { commit(); project.badge.on = e.target.checked; refresh(false); };
$('badgeText').onfocus = () => commit();
$('badgeText').oninput = e => { project.badge.text = e.target.value; save(); lastKey = ''; };
$('undoBtn').onclick = () => { if (!history.length) return; project = JSON.parse(history.pop()); selSeg = Math.min(selSeg, project.segments.length - 1); selText = -1; selAudio = -1; project.audio.forEach(c => { attachAudio(c); }); markStage(); refresh(true); };
let resetArmed = false;
$('resetBtn').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('resetBtn').textContent = '再按一次确认'; setTimeout(() => { resetArmed = false; $('resetBtn').textContent = '还原'; }, 3000); return; }
  resetArmed = false; $('resetBtn').textContent = '还原'; commit(); project = clone(BASE); selSeg = 0; selText = -1; selAudio = -1; refresh(true); toast('已还原成第一版，按撤销可以回去');
};
$('playBtn').onclick = () => { if (!playing && gTime >= total() - 0.05) gTime = 0; setPlaying(!playing); };
$('restartBtn').onclick = () => seek(0);
$('soundBtn').onclick = () => { muted = !muted; $('soundBtn').textContent = muted ? '🔇 静音' : '🔊 有声'; applyFrame(false); };
$('safeChk').onchange = e => document.querySelectorAll('.safe').forEach(s => s.style.display = e.target.checked ? 'block' : 'none');
$('stage').addEventListener('pointerdown', e => {
  if (e.target.closest('.pill,#frameUI')) return;
  let changed = false;
  if (selText !== -1) { selText = -1; changed = true; }
  if (tab === 'seg' && selSeg !== segAt(gTime).i) { selSeg = segAt(gTime).i; changed = true; renderTimeline(); }
  if (changed) { renderInspector(); markStage(); applyFrame(false); }
});
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); $('playBtn').click(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); if (playing) setPlaying(false); seek(gTime + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30)); }
  else if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); $('splitBtn').click(); }
  else if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); $('undoBtn').click(); }
});
window.addEventListener('pointerup', () => { if (interacting) setTimeout(() => { interacting = false; dragPPS = 0; lastKey = ''; }, 0); });
window.addEventListener('pointercancel', () => { interacting = false; dragPPS = 0; });
window.addEventListener('resize', () => { markStage(); renderTimeline(); applyFrame(true); });
