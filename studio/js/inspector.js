/* AI-VidStudio · inspector.js — right-hand panel: 片段 · 文字 · 声音 */
'use strict';
/* ---------- helpers ---------- */
function numRange(label, val, min, max, step, onInput) {
  const row = el('div', 'row');
  row.innerHTML = `<label>${label}</label><div class="inline"><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const [r, n] = row.querySelectorAll('input'); let started = false;
  const h = (a, b) => () => { const v = parseFloat(a.value); if (isNaN(v)) return; if (!started) { commit(); started = true; } b.value = v; onInput(v); save(); renderTimeline(); markStage(); applyFrame(true); };
  r.addEventListener('input', h(r, n)); n.addEventListener('input', h(n, r));
  const done = () => { started = false; renderInspector(); };
  r.addEventListener('change', done); n.addEventListener('change', done);
  return row;
}
function selectRow(label, val, options, onChange) {
  const row = el('div', 'row');
  row.innerHTML = `<label>${label}</label><select>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  const sel = row.querySelector('select'); sel.value = String(val);
  sel.addEventListener('change', () => { commit(); onChange(sel.value); refresh(true); });
  return row;
}
function checks(label, items) {
  const row = el('div', 'row'); row.innerHTML = `<label>${label}</label><div class="inline"></div>`;
  for (const [text, val, fn] of items) {
    const l = el('label', 'chk'); l.innerHTML = `<input type="checkbox" ${val ? 'checked' : ''}> ${text}`;
    l.querySelector('input').addEventListener('change', e => { commit(); fn(e.target.checked); refresh(true); });
    row.querySelector('.inline').appendChild(l);
  }
  return row;
}
function colorRow(label, items) {
  const row = el('div', 'row'); row.innerHTML = `<label>${label}</label><div class="inline"></div>`;
  for (const [text, val, fn] of items) {
    const w = el('label', 'chk'); w.innerHTML = `<input type="color" value="${val}"> <span class="hint">${text}</span>`;
    const inp = w.querySelector('input'); let started = false;
    inp.addEventListener('input', () => { if (!started) { commit(); started = true; } fn(inp.value); save(); markStage(); applyFrame(true); });
    inp.addEventListener('change', () => { started = false; renderTimeline(); });
    row.querySelector('.inline').appendChild(w);
  }
  return row;
}
function button(text, fn, cls = 'btn small') { const b = el('button', cls); b.textContent = text; b.addEventListener('click', fn); return b; }
function textArea(val, onInput, rows = 2) {
  const ta = el('textarea'); ta.value = val; ta.rows = rows;
  ta.addEventListener('focus', () => commit(), { once: true });
  ta.addEventListener('input', () => { onInput(ta.value); save(); markStage(); applyFrame(false); renderTimeline(); });
  return ta;
}
const fontOptions = () => Object.entries(FONTS).map(([k, f]) => [k, f.label]);

/* ---------- panel switch ---------- */
function renderInspector() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('stage').dataset.tab = tab;
  const box = $('inspector'); box.innerHTML = '';
  ({ seg: segPanel, text: textPanel, audio: audioPanel }[tab] || segPanel)(box);
}

/* ---------- 片段 ---------- */
function coverContent(f, aspect) { const w = Math.max(f.w, f.h / aspect); return { x: r2((f.w - w) / 2), y: r2((f.h - w * aspect) / 2), w: r2(w) }; }
const FRAME_PRESETS = {
  full: { label: '全屏', f: { x: 0, y: 0, w: 1080, h: 1920, rot: 0, r: 0, bw: 0, bc: '#ffffff', shadow: false, fill: '#000000' }, bg: 'black' },
  phone: { label: '手机录屏框', f: { x: 40, y: 380, w: 1000, h: 1400, rot: 0, r: 48, bw: 0, bc: '#ffffff', shadow: true, fill: '#ffffff' }, bg: 'lav', top: true },
  letterbox: { label: '横拍黑边', f: { x: 0, y: 656, w: 1080, h: 608, rot: 0, r: 0, bw: 0, bc: '#ffffff', shadow: false, fill: '#000000' }, bg: 'black' },
  polaroid: { label: '倾斜相框', f: { x: 150, y: 420, w: 780, h: 980, rot: -4, r: 14, bw: 18, bc: '#ffffff', shadow: true, fill: '#ffffff' }, bg: 'pink' },
  pip: { label: '子母画面小框', f: { x: 600, y: 300, w: 400, h: 540, rot: 3, r: 28, bw: 8, bc: '#ffffff', shadow: true, fill: '#ffffff' }, bg: null },
  focus: { label: '放大重点 ×2', zoom: 2 }
};
function applyFramePreset(seg, key) {
  const p = FRAME_PRESETS[key], a = project.sources[seg.src].aspect;
  if (p.zoom) { zoomContent(seg, p.zoom); return; }
  const nf = clone(p.f), nc = p.top ? { x: 0, y: 0, w: nf.w } : coverContent(nf, a);
  if (selFrame > 0 && seg.extra && seg.extra[selFrame - 1]) { seg.extra[selFrame - 1].frame = nf; seg.extra[selFrame - 1].content = nc; }
  else { seg.frame = nf; seg.content = nc; seg.extra = []; selFrame = 0; }
  if (p.bg) seg.bg = p.bg;
}
function zoomContent(seg, k) { // scale the picture inside the active frame around its centre
  const { f, c } = frameAt(seg, selFrame), cx = f.w / 2, cy = f.h / 2;
  c.x = r2(cx - (cx - c.x) * k); c.y = r2(cy - (cy - c.y) * k); c.w = r2(c.w * k);
}
/* Find the biggest empty (flat-colour) band inside frame 1 and split the frame into two around it. */
function autoSplit(seg) {
  const v = slots[selSeg % 2].vids[seg.src], src = project.sources[seg.src];
  if (!v || v.readyState < 2) { toast('画面还在载入，等一下再按'); return false; }
  const f = seg.frame, c = seg.content, q = 4;                    // q = canvas units per sample
  const cw = Math.round(c.w / q), ch = Math.round(c.w * src.aspect / q);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d'); g.drawImage(v, 0, 0, cw, ch);
  let data; try { data = g.getImageData(0, 0, cw, ch).data; } catch (e) { toast('读不到画面'); return false; }
  const y0 = clamp(Math.round(-c.y / q), 0, ch), y1 = clamp(Math.round((f.h - c.y) / q), 0, ch);
  const x0 = clamp(Math.round(-c.x / q) + 2, 0, cw), x1 = clamp(Math.round((f.w - c.x) / q) - 2, 0, cw);
  const flat = []; // per row: is the row a single flat colour?
  for (let y = y0; y < y1; y++) {
    let sum = 0, sq = 0, n = 0;
    for (let x = x0; x < x1; x += 2) { const p = (y * cw + x) * 4, l = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2]; sum += l; sq += l * l; n++; }
    const m = sum / n; flat.push(Math.sqrt(Math.max(0, sq / n - m * m)) < 3);
  }
  let best = [0, 0], cur = -1; // longest run of flat rows, not touching the edges
  for (let k = 0; k <= flat.length; k++) {
    if (k < flat.length && flat[k]) { if (cur < 0) cur = k; }
    else if (cur >= 0) { if (k - cur > best[1] - best[0] && cur > 0 && k < flat.length) best = [cur, k]; cur = -1; }
  }
  if ((best[1] - best[0]) * q < f.h * 0.15) { toast('找不到够大的留白'); return false; }
  const margin = 28, gap = 56;
  const topEnd = (y0 + best[0]) * q + c.y, botStart = (y0 + best[1]) * q + c.y; // in frame coords
  const A = clone(f); A.h = r2(topEnd + margin); A.rot = 0;
  const B = clone(f); B.rot = 0; B.h = r2(f.h - botStart + margin);
  const total = A.h + gap + B.h, top = f.y + (f.h - total) / 2;
  A.y = r2(top); B.y = r2(top + A.h + gap);
  const cB = { x: c.x, y: r2(c.y - (botStart - margin)), w: c.w };
  seg.frame = A; seg.extra = [{ frame: B, content: cB }]; selFrame = 0;
  return true;
}
function segPanel(box) {
  const seg = project.segments[selSeg]; const src = project.sources[seg.src];
  const head = el('div', 'inline'); head.appendChild(el('h2', null, `片段 ${selSeg + 1}`));
  const name = el('input'); name.type = 'text'; name.value = seg.name; name.style.flex = '1';
  name.addEventListener('focus', () => commit(), { once: true });
  name.addEventListener('input', () => { seg.name = name.value; save(); renderTimeline(); });
  head.appendChild(name); box.appendChild(head);
  box.appendChild(el('div', 'hint', `长度 ${segDur(seg).toFixed(2)} 秒 · 从第 ${segStart(selSeg).toFixed(1)} 秒开始`));

  if (selSeg > 0) {
    const sec = el('div', 'card'); sec.id = 'transSection';
    sec.appendChild(el('h3', null, '✨ 进场转场（上一段 → 这一段）'));
    const tr = seg.trans || (seg.trans = { type: 'none', dur: 0.5 });
    const grid = el('div', 'presets');
    for (const [k, label] of TRANSITIONS) {
      const b = el('span', 'preset' + (tr.type === k ? ' on' : ''), escapeHtml(label));
      b.addEventListener('click', () => { commit(); tr.type = k; refresh(true); seek(segStart(selSeg) + 0.01); setTimeout(() => { if (!playing) { gTime = Math.max(0, segStart(selSeg) - 0.6); setPlaying(true); } }, 50); });
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    if (tr.type !== 'none') sec.appendChild(numRange('转场时长(秒)', tr.dur || 0.5, 0.2, 1.5, 0.05, v => { tr.dur = v; }));
    sec.appendChild(el('div', 'hint', '点一下就会预览。转场会让前后两段重叠，总长度会稍微变短。'));
    box.appendChild(sec);
  }

  box.appendChild(el('h3', null, '画面'));
  box.appendChild(selectRow('素材', seg.src, Object.entries(project.sources).map(([k, s]) => [k, s.label]), v => {
    seg.src = v; const d = project.sources[v].dur; seg.in = Math.min(seg.in, d - 0.2); if (!seg.freeze) seg.out = Math.min(Math.max(seg.out, seg.in + 0.2), d);
    seg.content = coverContent(seg.frame, project.sources[v].aspect);
  }));
  if (seg.freeze) {
    box.appendChild(numRange('定格画面(秒)', r2(seg.in), 0, r2(src.dur - 0.05), 0.05, v => { const d = seg.out - seg.in; seg.in = v; seg.out = v + d; }));
    box.appendChild(numRange('定格时长', r2(seg.out - seg.in), 0.3, 10, 0.1, v => { seg.out = seg.in + v; }));
  } else {
    box.appendChild(numRange('开始(秒)', r2(seg.in), 0, r2(src.dur - 0.1), 0.05, v => { seg.in = Math.min(v, seg.out - 0.1); }));
    box.appendChild(numRange('结束(秒)', r2(seg.out), 0.1, r2(src.dur), 0.05, v => { seg.out = Math.max(v, seg.in + 0.1); }));
    box.appendChild(numRange('速度(倍)', seg.speed || 1, 0.25, 4, 0.05, v => { seg.speed = Math.max(0.25, v); }));
  }

  box.appendChild(el('h3', null, '🖼 画面框'));
  const chips = el('div', 'presets'); chips.style.marginBottom = '8px';
  for (let k = 0; k < frameCount(seg); k++) chips.appendChild(button('框 ' + (k + 1), () => { selFrame = k; renderInspector(); applyFrame(false); }, 'preset' + (selFrame === k ? ' on' : '')));
  chips.appendChild(button('＋ 加一个框', () => { commit(); const { f, c } = frameAt(seg, selFrame); const nf = clone(f); nf.x = r2(nf.x + 60); nf.y = r2(nf.y + 60); seg.extra = seg.extra || []; seg.extra.push({ frame: nf, content: clone(c) }); selFrame = frameCount(seg) - 1; refresh(true); }, 'preset'));
  if (frameCount(seg) > 1) chips.appendChild(button('删除这个框', () => { commit(); if (selFrame === 0) { const x = seg.extra.shift(); seg.frame = x.frame; seg.content = x.content; } else seg.extra.splice(selFrame - 1, 1); selFrame = 0; refresh(true); }, 'preset'));
  box.appendChild(chips);
  const sp = el('div', 'inline'); sp.style.marginBottom = '8px';
  sp.appendChild(button('✂ 去掉中间留白（自动分成两框）', () => { commit(); if (autoSplit(seg)) { refresh(true); toast('已分成两个框，可以再拖动微调'); } else history.pop(); }, 'btn small primary'));
  box.appendChild(sp);
  const pr = el('div', 'presets');
  for (const [k, p] of Object.entries(FRAME_PRESETS)) pr.appendChild(button(p.label, () => { commit(); applyFramePreset(seg, k); refresh(true); }, 'preset'));
  box.appendChild(pr);
  const mode = el('div', 'inline'); mode.style.margin = '8px 0';
  mode.appendChild(el('span', 'hint', '在画面上拖动：'));
  for (const [k, label] of [['frame', '移动框'], ['content', '移动框里的画面']]) mode.appendChild(button(label, () => { frameMode = k; renderInspector(); applyFrame(false); }, 'btn small' + (frameMode === k ? ' primary' : '')));
  box.appendChild(mode);
  box.appendChild(el('div', 'hint', '拖四个角 = 整个放大缩小；拖四条边 = 裁切框的长宽；上面的圆点 = 转角度。'));
  const { f, c } = frameAt(seg, selFrame);
  const more = el('details', 'more'); more.appendChild(el('summary', null, '更多调整（数字微调、圆角、边框、背景）'));
  if (frameMore) more.open = true;
  more.addEventListener('toggle', () => { frameMore = more.open; });
  box.appendChild(numRange('框里画面缩放(%)', Math.round(c.w / f.w * 100), 20, 500, 1, v => { zoomContent(seg, (v / 100 * f.w) / c.w); }));
  more.appendChild(numRange('框宽', Math.round(f.w), 40, 1600, 1, v => { const cx = f.x + f.w / 2; f.w = v; f.x = r2(cx - v / 2); }));
  more.appendChild(numRange('框高', Math.round(f.h), 40, 2400, 1, v => { const cy = f.y + f.h / 2; f.h = v; f.y = r2(cy - v / 2); }));
  more.appendChild(numRange('框左右', Math.round(f.x + f.w / 2), -400, 1480, 1, v => { f.x = r2(v - f.w / 2); }));
  more.appendChild(numRange('框上下', Math.round(f.y + f.h / 2), -400, 2320, 1, v => { f.y = r2(v - f.h / 2); }));
  more.appendChild(numRange('角度(°)', f.rot || 0, -180, 180, 1, v => { f.rot = v; }));
  more.appendChild(numRange('圆角', f.r || 0, 0, 300, 1, v => { f.r = v; }));
  more.appendChild(numRange('边框粗细', f.bw || 0, 0, 60, 1, v => { f.bw = v; }));
  more.appendChild(colorRow('颜色', [['边框', f.bc || '#ffffff', v => f.bc = v], ['框底', f.fill || '#000000', v => f.fill = v]]));
  more.appendChild(checks('效果', [['阴影', !!f.shadow, v => { f.shadow = v; }]]));
  more.appendChild(selectRow('画布背景', seg.bg || 'black', [['black', '黑色'], ['lav', '薰衣草紫'], ['pink', '粉红渐层'], ['cream', '奶油白'], ['white', '白色']], v => { seg.bg = v; }));
  const ap = el('div', 'inline');
  ap.appendChild(button('套用这个画面框到所有片段', () => { commit(); project.segments.forEach(o => { if (o === seg) return; o.frame = clone(seg.frame); o.content = coverContent(o.frame, project.sources[o.src].aspect); o.extra = []; o.bg = seg.bg; }); refresh(true); toast('已套用到所有片段'); }));
  more.appendChild(ap);
  box.appendChild(more);

  box.appendChild(el('h3', null, '其他'));
  box.appendChild(checks('选项', [
    ['定格', seg.freeze, v => { if (v) { seg.freeze = true; seg.out = seg.in + Math.min(2.6, Math.max(0.3, segDur(seg))); } else { seg.freeze = false; seg.out = Math.min(seg.in + 2, src.dur); seg.speed = 1; } }],
    ['变暗', !!seg.dim, v => { seg.dim = v; }],
    ['原声', !!seg.sound, v => { seg.sound = v; }]
  ]));
  box.appendChild(selectRow('进场音效', seg.sfx || 'none', [['none', '无'], ['whoosh', 'Whoosh 咻'], ['pop', 'Pop 啵']], v => { seg.sfx = v; }));
  const n = (seg.texts || []).length;
  const r = el('div', 'inline'); r.appendChild(el('span', 'hint', n ? `这个片段有 ${n} 段文字` : '这个片段没有文字'));
  r.appendChild(button('去编辑文字 →', () => { tab = 'text'; renderInspector(); applyFrame(false); })); box.appendChild(r);
}

/* ---------- 文字 (per clip) ---------- */
function applyStyle(t, st) { for (const k of ['font', 'color', 'bg', 'bgColor', 'stroke', 'strokeColor', 'shadow']) if (st[k] !== undefined) t[k] = st[k]; if (st.size) t.size = st.size; }
function textPanel(box) {
  const seg = project.segments[selSeg];
  const head = el('div', 'inline'); head.style.justifyContent = 'space-between';
  head.appendChild(el('h2', null, `片段 ${selSeg + 1} 的文字`));
  head.appendChild(button('＋ 加文字', () => { commit(); seg.texts = seg.texts || []; const st = project.styles[0] || {}; const t = { text: 'New text', size: 72, x: 540, y: 820, rot: 0, start: 0, end: 99, font: 'display-black', color: '#ffffff', bg: 'pill', bgColor: '#5b2ba8', stroke: 0, strokeColor: '#000000', shadow: true }; applyStyle(t, st); t.size = 72; seg.texts.push(t); selText = seg.texts.length - 1; refresh(true); }));
  box.appendChild(head);
  box.appendChild(el('div', 'hint', '这里的文字跟着片段走（转场时会一起移动）。'));
  if (!(seg.texts || []).length) box.appendChild(el('p', 'hint', '这个片段还没有文字，按"＋ 加文字"。'));
  (seg.texts || []).forEach((t, k) => {
    const card = el('div', 'card' + (k === selText ? ' sel' : ''));
    card.addEventListener('pointerdown', () => { if (selText !== k) { selText = k; document.querySelectorAll('.card').forEach((x, j) => x.classList.toggle('sel', j === k)); markStage(); applyFrame(false); } });
    const ta = textArea(t.text, v => { t.text = v; }); ta.dataset.ta = k; card.appendChild(ta);
    const pr = el('div', 'row'); pr.appendChild(el('label', null, '我的风格'));
    const pw = el('div', 'presets');
    project.styles.forEach((st, si) => {
      const p = el('span', 'preset'); p.textContent = st.name;
      Object.assign(p.style, { fontFamily: `"F-${st.font}"`, color: st.color, background: st.bg === 'none' ? '#888' : st.bgColor, WebkitTextStroke: st.stroke ? `1px ${st.strokeColor}` : '0' });
      p.addEventListener('click', ev => { if (ev.target.classList.contains('x')) return; commit(); applyStyle(t, st); refresh(true); });
      const x = el('span', 'x', '×'); x.title = '删除这个风格';
      x.addEventListener('click', () => { commit(); project.styles.splice(si, 1); refresh(true); });
      p.appendChild(x); pw.appendChild(p);
    });
    pw.appendChild(button('＋ 存成我的风格', () => { commit(); const nm = (t.text.split('\n')[0] || '风格').slice(0, 10); project.styles.push({ name: '我的 ' + nm, font: t.font, color: t.color, bg: t.bg, bgColor: t.bgColor, stroke: t.stroke, strokeColor: t.strokeColor, shadow: t.shadow, size: t.size }); refresh(true); toast('已存成"我的风格"'); }));
    pr.appendChild(pw); card.appendChild(pr);
    card.appendChild(selectRow('字体', t.font, fontOptions(), v => { t.font = v; }));
    card.appendChild(numRange('字号', t.size, 16, 260, 1, v => { t.size = v; }));
    card.appendChild(colorRow('颜色', [['字', t.color, v => t.color = v], ['底', t.bgColor, v => t.bgColor = v], ['描边', t.strokeColor, v => t.strokeColor = v]]));
    card.appendChild(selectRow('底的形状', t.bg, [['pill', '圆角胶囊'], ['box', '方块'], ['none', '没有底']], v => { t.bg = v; }));
    card.appendChild(numRange('描边粗细', t.stroke || 0, 0, 20, 1, v => { t.stroke = v; }));
    card.appendChild(checks('效果', [['阴影', !!t.shadow, v => { t.shadow = v; }]]));
    card.appendChild(numRange('左右位置', t.x, -200, 1280, 1, v => { t.x = v; }));
    card.appendChild(numRange('上下位置', t.y, -100, 1900, 1, v => { t.y = v; }));
    card.appendChild(numRange('角度(°)', t.rot || 0, -180, 180, 1, v => { t.rot = v; }));
    const d = segDur(seg);
    card.appendChild(numRange('出现(秒)', r2(t.start), 0, r2(d), 0.05, v => { t.start = v; }));
    card.appendChild(numRange('消失(秒)', r2(Math.min(t.end, d)), 0, r2(d), 0.05, v => { t.end = v >= d - 0.01 ? 99 : v; }));
    const acts = el('div', 'inline');
    acts.appendChild(button('置中', () => { commit(); t.x = 540; t.rot = 0; refresh(true); }));
    acts.appendChild(button('复制这段', () => { commit(); const cp = clone(t); cp.y += 120; seg.texts.splice(k + 1, 0, cp); selText = k + 1; refresh(true); }));
    acts.appendChild(button('删除', () => { commit(); seg.texts.splice(k, 1); selText = -1; refresh(true); }));
    card.appendChild(acts);
    box.appendChild(card);
  });
}

/* ---------- 声音 ---------- */
function audioPanel(box) {
  box.appendChild(el('h2', null, '🎵 声音'));
  box.appendChild(numRange('影片原声音量', project.mix.videoVolume, 0, 1.5, 0.05, v => { project.mix.videoVolume = v; }));
  const up = el('div', 'inline'); up.style.margin = '8px 0';
  for (const [kind, label] of [['voice', '🎙 上传人声 / 配音'], ['music', '🎵 上传音乐']]) {
    const fb = el('span', 'btn filebtn' + (kind === 'voice' ? ' primary' : ''), label);
    const inp = el('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.m4a,.mp3,.wav,.aac,.mov,.mp4';
    inp.addEventListener('change', () => { if (inp.files[0]) addAudioFile(inp.files[0], kind); inp.value = ''; });
    fb.appendChild(inp); up.appendChild(fb);
  }
  box.appendChild(up);
  box.appendChild(el('div', 'hint', '🎙 网页不能直接开麦克风：先用手机"语音备忘录"录好，再上传。<br>🎵 音乐请用有授权的，热门歌建议在 IG 里加。<br>⚠️ 渲染时要把同一个声音文件也发给 Claude。'));
  if (!project.audio.length) { box.appendChild(el('p', 'hint', '还没有声音素材。')); return; }
  project.audio.forEach((c, j) => {
    const card = el('div', 'card' + (j === selAudio ? ' sel' : ''));
    card.addEventListener('pointerdown', () => { if (selAudio !== j) { selAudio = j; document.querySelectorAll('.card').forEach((x, q) => x.classList.toggle('sel', q === j)); renderTimeline(); } });
    const h = el('div', 'inline'); h.appendChild(el('b', null, (c.kind === 'voice' ? '🎙 人声' : '🎵 音乐'))); const nm = el('span', 'hint'); nm.textContent = c.name; h.appendChild(nm);
    card.appendChild(h);
    if (!hasFile(c)) {
      card.appendChild(el('div', 'warn', '这台设备上找不到这个文件，请重新选一次同一个文件：'));
      const fb = el('span', 'btn small filebtn', '重新选文件'); const inp = el('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*';
      inp.addEventListener('change', () => { if (inp.files[0]) relinkAudio(c, inp.files[0]); }); fb.appendChild(inp); card.appendChild(fb);
    }
    card.appendChild(numRange('开始于(秒)', r2(c.start), 0, r2(Math.max(total(), c.start + 1)), 0.05, v => { c.start = v; }));
    card.appendChild(numRange('文件从(秒)', r2(c.in), 0, r2((c.fileDur || 60) - 0.1), 0.05, v => { c.in = Math.min(v, c.out - 0.1); }));
    card.appendChild(numRange('文件到(秒)', r2(c.out), 0.1, r2(c.fileDur || 60), 0.05, v => { c.out = Math.max(v, c.in + 0.1); }));
    card.appendChild(numRange('音量', c.volume, 0, 2, 0.05, v => { c.volume = v; }));
    card.appendChild(numRange('淡入(秒)', c.fadeIn || 0, 0, 5, 0.1, v => { c.fadeIn = v; }));
    card.appendChild(numRange('淡出(秒)', c.fadeOut || 0, 0, 5, 0.1, v => { c.fadeOut = v; }));
    const opts = [['静音这条', !!c.mute, v => { c.mute = v; }]];
    if (c.kind === 'music') opts.unshift(['有人声时自动变小声', c.duck !== false, v => { c.duck = v; }]);
    card.appendChild(checks('选项', opts));
    const acts = el('div', 'inline');
    acts.appendChild(button('对齐到播放头', () => { commit(); c.start = r2(gTime); refresh(true); }));
    acts.appendChild(button('删除', () => { commit(); project.audio.splice(j, 1); selAudio = -1; refresh(true); }));
    card.appendChild(acts);
    box.appendChild(card);
  });
}
