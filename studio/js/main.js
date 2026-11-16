/* AI-VidStudio · main.js */
'use strict';
/* ---------- boot ---------- */
initFrameUI();
project.audio.forEach(c => attachAudio(c));
renderTimeline(); renderInspector(); markDirty();
(async () => {
  if (!(window.claude && window.claude.use)) return;
  try { DL = await window.claude.use('downloads'); } catch (e) { DL = null; }
  try { DB = await window.claude.use('db'); } catch (e) { DB = null; }
  if (!DB) return;
  try {
    const snap = await withTimeout(DB.doc(PROJECT_DOC).get(), 10000);
    if (snap.exists) {
      const d = snap.data();
      if (d.savedAt > meta.editedAt && d.json !== JSON.stringify(project)) {
        project = migrate(JSON.parse(d.json)); meta.savedAt = d.savedAt; meta.editedAt = d.savedAt; writeLocal();
        project.audio.forEach(c => { attachAudio(c); loadBlob(c); }); refresh(true); meta.editedAt = meta.savedAt = d.savedAt; writeLocal(); toast('已载入云端存档（' + fmtTime(d.savedAt) + '）');
      } else { meta.savedAt = Math.max(meta.savedAt, d.savedAt); writeLocal(); }
      markDirty();
    }
  } catch (e) {}
})();
document.fonts && document.fonts.ready.then(() => { markStage(); });
requestAnimationFrame(t => { lastTick = t; tick(t); });
