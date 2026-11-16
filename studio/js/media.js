/* AI-VidStudio · media.js — video elements (two slots for transitions) and audio clips */
'use strict';
const S = () => $('stage').clientWidth / W;

/* Two stacked "slots" so the outgoing and incoming clips of a transition can both play.
 * Segment i always renders in slot i % 2. Each slot owns one <video> per source. */
const slots = [0, 1].map(n => {
  const root = el('div', 'slot'); root.dataset.slot = n;
  const bg = el('div', 'slot-bg');
  const frame = el('div', 'frame');
  const border = el('div', 'frame-border');
  const texts = el('div', 'slot-texts');
  frame.appendChild(border);
  root.append(bg, frame, texts);
  $('slots').appendChild(root);
  const vids = {};
  for (const [k, src] of Object.entries(project.sources)) {
    const v = document.createElement('video');
    v.src = src.file; v.preload = 'auto'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.style.display = 'none';
    frame.insertBefore(v, border); vids[k] = v;
  }
  return { n, root, bg, frame, border, texts, vids, seg: -1, key: '' };
});
const allVideos = () => slots.flatMap(s => Object.values(s.vids));

/* ---------- audio clips ---------- */
const audioEls = {}; // clip.id -> {el, url}
const fileStore = {}; // fileKey -> blob url
let idb = null;
try {
  const req = indexedDB.open('olivia-studio-files', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('files');
  req.onsuccess = () => { idb = req.result; project.audio.forEach(c => loadBlob(c)); };
} catch (e) {}
function storeBlob(key, blob) { try { if (idb) idb.transaction('files', 'readwrite').objectStore('files').put(blob, key); } catch (e) {} }
function loadBlob(c) {
  if (fileStore[c.fileKey]) return attachAudio(c);
  try {
    if (!idb) return;
    const r = idb.transaction('files').objectStore('files').get(c.fileKey);
    r.onsuccess = () => { if (r.result) { fileStore[c.fileKey] = URL.createObjectURL(r.result); attachAudio(c); renderTimeline(); if (tab === 'audio') renderInspector(); } };
  } catch (e) {}
}
function attachAudio(c) {
  const url = fileStore[c.fileKey]; if (!url) return;
  if (audioEls[c.id] && audioEls[c.id].url === url) return;
  const a = new Audio(url); a.preload = 'auto';
  audioEls[c.id] = { el: a, url };
}
const hasFile = c => !!fileStore[c.fileKey];
function addAudioFile(file, kind) {
  const url = URL.createObjectURL(file);
  const probe = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
  probe.preload = 'metadata'; probe.src = url;
  probe.onloadedmetadata = () => {
    const d = isFinite(probe.duration) ? probe.duration : 10;
    commit();
    const key = file.name + '|' + file.size;
    fileStore[key] = url; storeBlob(key, file);
    const c = { id: uid('a'), kind, name: file.name, fileKey: key, fileDur: r2(d), start: kind === 'music' ? 0 : r2(Math.min(gTime, Math.max(0, total() - 1))), in: 0, out: r2(kind === 'music' ? Math.min(d, total()) : d), volume: kind === 'music' ? 0.6 : 1, fadeIn: kind === 'music' ? 0.5 : 0, fadeOut: kind === 'music' ? 1 : 0, duck: kind === 'music', mute: false };
    project.audio.push(c); attachAudio(c); selAudio = project.audio.length - 1; tab = 'audio';
    refresh(true); toast(kind === 'voice' ? '人声已加入 🎙' : '音乐已加入 🎵');
  };
  probe.onerror = () => toast('这个文件读不了，换一个格式试试（m4a / mp3 / wav）');
}
function relinkAudio(c, file) {
  const url = URL.createObjectURL(file);
  c.fileKey = file.name + '|' + file.size; c.name = file.name;
  fileStore[c.fileKey] = url; storeBlob(c.fileKey, file); delete audioEls[c.id]; attachAudio(c); refresh(true);
}
function syncAudio(t) {
  const voiceOn = project.audio.some(c => c.kind === 'voice' && !c.mute && t >= c.start && t < c.start + clipDur(c));
  for (const c of project.audio) {
    const a = audioEls[c.id]; if (!a) continue;
    const au = a.el, local = t - c.start, d = clipDur(c);
    const active = playing && !c.mute && local >= 0 && local < d;
    if (!active) { if (!au.paused) au.pause(); continue; }
    let vol = c.volume;
    if (c.fadeIn > 0) vol *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0) vol *= clamp((d - local) / c.fadeOut, 0, 1);
    if (c.kind === 'music' && c.duck && voiceOn) vol *= 0.3;
    au.volume = clamp(vol, 0, 1); au.muted = muted;
    const want = c.in + local;
    if (Math.abs(au.currentTime - want) > 0.2) au.currentTime = want;
    if (au.paused) au.play().catch(() => {});
  }
}
