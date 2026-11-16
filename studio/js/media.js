/* AI-VidStudio · media.js */
'use strict';
/* ---------- video sources ---------- */
const videos = {};
for (const [k, src] of Object.entries(project.sources)) {
  const v = document.createElement('video');
  v.src = src.file; v.preload = 'auto'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.style.display = 'none';
  videos[k] = v; $('fullLayer').appendChild(v);
}
let activeKey = null, activeIdx = -1;
const S = () => $('stage').clientWidth / 1080;
function activate(i) {
  const seg = project.segments[i], v = videos[seg.src];
  if (activeKey && activeKey !== seg.src) { videos[activeKey].pause(); videos[activeKey].style.display = 'none'; }
  const phone = seg.layout === 'phone';
  const target = phone ? $('phone') : $('fullLayer');
  if (v.parentNode !== target) target.appendChild(v);
  v.style.display = 'block';
  $('phoneLayer').style.display = phone ? 'block' : 'none';
  $('fullLayer').style.display = phone ? 'none' : 'block';
  activeKey = seg.src; activeIdx = i;
  positionVideo(seg);
}
/* geometry shared with the renderer (canvas units, 1080x1920) */
function videoBox(seg) {
  const vs = seg.vs || 1, vx = seg.vx || 0, vy = seg.vy || 0;
  if (seg.layout === 'phone') {
    const w = 1000 * vs, h = (seg.ph || 1400) * vs;
    return { x: 540 - w / 2 + vx, y: 1080 - h / 2 + vy, w, h, r: 48 * vs, cy: (seg.cropY || 0) * vs };
  }
  const w = 1080 * vs, h = 1920 * vs;
  return { x: 540 - w / 2 + vx, y: 960 - h / 2 + vy, w, h };
}
function positionVideo(seg) {
  const v = videos[seg.src], s = S(), b = videoBox(seg);
  if (seg.layout === 'phone') {
    Object.assign($('phone').style, { left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px', borderRadius: b.r * s + 'px' });
    Object.assign(v.style, { position: 'absolute', left: '0', width: b.w * s + 'px', height: 'auto', top: -b.cy * s + 'px' });
  } else {
    $('fullLayer').className = 'layer full ' + (seg.bgc === 'lav' ? 'lav' : 'black');
    Object.assign(v.style, { position: 'absolute', left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px' });
  }
}

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
  const el = new Audio(url); el.preload = 'auto';
  audioEls[c.id] = { el, url };
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
    const el = a.el, local = t - c.start, d = clipDur(c);
    const active = playing && !c.mute && local >= 0 && local < d;
    if (!active) { if (!el.paused) el.pause(); continue; }
    let vol = c.volume;
    if (c.fadeIn > 0) vol *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0) vol *= clamp((d - local) / c.fadeOut, 0, 1);
    if (c.kind === 'music' && c.duck && voiceOn) vol *= 0.3;
    el.volume = clamp(vol, 0, 1); el.muted = muted;
    const want = c.in + local;
    if (Math.abs(el.currentTime - want) > 0.2) el.currentTime = want;
    if (el.paused) el.play().catch(() => {});
  }
}
