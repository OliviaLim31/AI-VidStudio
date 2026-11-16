/* AI-VidStudio · storage.js */
'use strict';
/* ---------- cloud save (db) & downloads ---------- */
const PROJECT_DOC = 'projects/keyboard', SAVES = 'projects/keyboard/saves';
let DB = null, DL = null, saving = false;
const fmtTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);
async function cloudSave(label) {
  if (saving) return false;
  saving = true;
  const now = Date.now();
  const body = { json: JSON.stringify(project), savedAt: now, label: label || '手动保存', total: r2(total()) };
  try {
    if (!DB) throw { code: 'no_db' };
    await withTimeout(DB.doc(PROJECT_DOC).set(body), 15000);
    try {
      await DB.collection(SAVES).add(body);
      const all = await DB.collection(SAVES).orderBy('savedAt', 'desc').get();
      for (const d of all.docs.slice(15)) { try { await DB.collection(SAVES).doc(d.id).delete(); } catch (e) {} }
    } catch (e) {}
    meta.savedAt = now; if (meta.editedAt > now) meta.editedAt = now; writeLocal(); markDirty();
    saving = false; return true;
  } catch (e) {
    saving = false;
    meta.savedAt = now; writeLocal(); markDirty();
    toast(e && e.code === 'no_db' ? '这里不能云端保存，已先存在这台设备上' : '云端保存失败，已先存在这台设备上，稍后再按一次');
    return false;
  }
}
$('saveBtn').onclick = async () => { $('saveBtn').disabled = true; const ok = await cloudSave('手动保存'); $('saveBtn').disabled = false; if (ok) toast('💾 已保存到云端'); };
$('savesBtn').onclick = async () => {
  $('savesModal').classList.add('on'); const list = $('saveList'); list.innerHTML = '<p class="hint">读取中…</p>';
  if (!DB) { list.innerHTML = '<p class="hint">这里读不到云端存档。请在 claude.ai 打开工作室。</p>'; return; }
  try {
    const snap = await withTimeout(DB.collection(SAVES).orderBy('savedAt', 'desc').limit(15).get(), 10000);
    if (snap.empty) { list.innerHTML = '<p class="hint">还没有存档，按"💾 保存"就会出现在这里。</p>'; return; }
    list.innerHTML = '';
    snap.docs.forEach(d => {
      const x = d.data(); const row = el('div', 'saveitem');
      const info = el('div'); info.innerHTML = `<b>${fmtTime(x.savedAt)}</b> <span class="hint">· ${x.label || ''} · ${x.total || '?'} 秒</span>`;
      row.appendChild(info);
      row.appendChild(button('打开', () => { try { commit(); project = JSON.parse(x.json); selSeg = 0; selText = -1; selAudio = -1; project.audio.forEach(c => { attachAudio(c); loadBlob(c); }); refresh(true); $('savesModal').classList.remove('on'); toast('已打开 ' + fmtTime(x.savedAt) + ' 的存档'); } catch (e) { toast('这个存档读不了'); } }));
      list.appendChild(row);
    });
  } catch (e) { list.innerHTML = '<p class="hint">暂时读不到存档，请稍后再试。</p>'; }
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.remove('on'));

let renderMeta = null;
async function checkRender() {
  try {
    const r = await fetch('renders/latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw 0;
    renderMeta = await r.json();
    $('renderInfo').textContent = `最新成品：${renderMeta.label || ''}（${renderMeta.when || ''}，${renderMeta.duration || '?'} 秒）`;
    $('dlVideo').disabled = !DL;
  } catch (e) { renderMeta = null; $('renderInfo').textContent = '还没有成品。先按"✨ 发给 Claude 渲染"，渲染好后这里就能下载。'; $('dlVideo').disabled = true; }
}
async function offer(filename, data) {
  if (!DL) { toast('这里不能下载，请在 claude.ai 打开工作室'); return; }
  try { await DL.save({ filename, data }); toast('⬇ 已下载'); }
  catch (e) { if (e && e.code === 'declined') return; toast(e && e.code === 'rate_limited' ? '请稍等一下再按' : '下载没有成功：' + (e && e.code || '')); }
}
$('dlBtn').onclick = () => { $('dlModal').classList.add('on'); $('dlNote').textContent = DL ? '' : '⚠️ 这个视图不支持下载，请在 claude.ai 打开工作室。'; checkRender(); };
$('dlVideo').onclick = async () => {
  if (!renderMeta) return;
  $('dlVideo').disabled = true; $('dlVideo').textContent = '准备中…';
  try { const r = await fetch('renders/' + renderMeta.file + '?t=' + Date.now()); if (!r.ok) throw 0; const blob = await r.blob(); await offer(renderMeta.downloadName || 'olivia-video.mp4', blob); }
  catch (e) { toast('成品文件读不到'); }
  $('dlVideo').disabled = false; $('dlVideo').textContent = '下载成品';
};
$('dlProject').onclick = () => offer(`olivia-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'olivia-studio', project }, null, 1));

/* ---------- send to Claude ---------- */
const exportText = () => 'STUDIO_PROJECT\n' + JSON.stringify(project);
$('exportBtn').onclick = async () => {
  $('modal').classList.add('on'); $('exportText').value = exportText();
  const files = [...new Set(project.audio.filter(c => !c.mute).map(c => c.name))];
  $('fileList').innerHTML = files.length ? `<div class="warn" style="margin:8px 0">⚠️ 也要把这些声音文件一起发给 Claude：<br>${files.map(f => '• ' + f.replace(/</g, '&lt;')).join('<br>')}</div>` : '';
  $('modalMsg').innerHTML = '保存中…';
  const ok = await cloudSave('发给 Claude 渲染');
  $('modalMsg').innerHTML = ok
    ? '✅ 已保存到云端！回到对话里跟 Claude 说<b>"渲染"</b>就可以了，不用复制贴上。<br><span class="hint">渲染好后，按"⬇ 下载"就能下载成品。</span>'
    : '这里不能云端保存。请打开下面的"备用：手动复制设定"，复制后贴到对话里。';
  $('copyBox').open = !ok;
};
$('copyAgain').onclick = async () => { try { await navigator.clipboard.writeText(exportText()); toast('已复制'); } catch (e) { $('exportText').focus(); toast('请长按文字全选、复制'); } };
$('closeModal').onclick = () => $('modal').classList.remove('on');
$('exportText').addEventListener('focus', e => e.target.select());
