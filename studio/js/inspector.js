/* AI-VidStudio · inspector.js */
'use strict';
/* ---------- inspector helpers ---------- */
function numRange(label, val, min, max, step, onInput) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${label}</label><div class="inline"><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const [r, n] = row.querySelectorAll('input'); let started = false;
  const h = (a, b) => () => { const v = parseFloat(a.value); if (isNaN(v)) return; if (!started) { commit(); started = true; } b.value = v; onInput(v); save(); renderTimeline(); lastKey = ''; applyFrame(true); };
  r.addEventListener('input', h(r, n)); n.addEventListener('input', h(n, r));
  const done = () => { started = false; renderInspector(); };
  r.addEventListener('change', done); n.addEventListener('change', done);
  return row;
}
function selectRow(label, val, options, onChange) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${label}</label><select>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  const sel = row.querySelector('select'); sel.value = String(val);
  sel.addEventListener('change', () => { commit(); onChange(sel.value); refresh(true); });
  return row;
}
function checks(label, items) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${label}</label><div class="inline"></div>`;
  for (const [text, val, fn] of items) {
    const l = document.createElement('label'); l.className = 'chk';
    l.innerHTML = `<input type="checkbox" ${val ? 'checked' : ''}> ${text}`;
    l.querySelector('input').addEventListener('change', e => { commit(); fn(e.target.checked); refresh(true); });
    row.querySelector('.inline').appendChild(l);
  }
  return row;
}
function colorRow(label, items) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${label}</label><div class="inline"></div>`;
  for (const [text, val, fn] of items) {
    const w = document.createElement('label'); w.className = 'chk';
    w.innerHTML = `<input type="color" value="${val}"> <span class="hint">${text}</span>`;
    const inp = w.querySelector('input'); let started = false;
    inp.addEventListener('input', () => { if (!started) { commit(); started = true; } fn(inp.value); save(); lastKey = ''; applyFrame(false); });
    inp.addEventListener('change', () => { started = false; });
    row.querySelector('.inline').appendChild(w);
  }
  return row;
}
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
function button(text, fn, cls = 'btn small') { const b = el('button', cls); b.textContent = text; b.addEventListener('click', fn); return b; }

/* ---------- inspector ---------- */
function renderInspector() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const box = $('inspector'); box.innerHTML = '';
  if (tab === 'seg') segPanel(box); else if (tab === 'text') textPanel(box); else audioPanel(box);
}
function segPanel(box) {
  const seg = project.segments[selSeg]; const src = project.sources[seg.src];
  const head = el('div', 'inline'); head.appendChild(el('h2', null, `片段 ${selSeg + 1}`));
  const name = el('input'); name.type = 'text'; name.value = seg.name; name.style.flex = '1';
  name.addEventListener('focus', () => commit(), { once: true });
  name.addEventListener('input', () => { seg.name = name.value; save(); renderTimeline(); });
  head.appendChild(name); box.appendChild(head);
  box.appendChild(el('div', 'hint', `长度 ${segDur(seg).toFixed(2)} 秒 · 从第 ${segStart(selSeg).toFixed(1)} 秒开始`));
  box.appendChild(el('h3', null, '画面'));
  box.appendChild(selectRow('素材', seg.src, Object.entries(project.sources).map(([k, s]) => [k, s.label]), v => {
    seg.src = v; const d = project.sources[v].dur; seg.in = Math.min(seg.in, d - 0.2); if (!seg.freeze) seg.out = Math.min(Math.max(seg.out, seg.in + 0.2), d); else seg.out = seg.in + (seg.out - seg.in);
    seg.layout = project.sources[v].screen ? 'phone' : 'full'; if (seg.layout === 'phone' && seg.cropY == null) seg.cropY = 60;
  }));
  box.appendChild(selectRow('版面', seg.layout, [['full', '全屏'], ['phone', '手机录屏（紫色背景）']], v => { seg.layout = v; if (v === 'phone' && seg.cropY == null) seg.cropY = 60; }));
  if (seg.freeze) {
    box.appendChild(numRange('定格画面(秒)', r2(seg.in), 0, r2(src.dur - 0.05), 0.05, v => { const d = seg.out - seg.in; seg.in = v; seg.out = v + d; }));
    box.appendChild(numRange('定格时长', r2(seg.out - seg.in), 0.3, 10, 0.1, v => { seg.out = seg.in + v; }));
  } else {
    box.appendChild(numRange('开始(秒)', r2(seg.in), 0, r2(src.dur - 0.1), 0.05, v => { seg.in = Math.min(v, seg.out - 0.1); }));
    box.appendChild(numRange('结束(秒)', r2(seg.out), 0.1, r2(src.dur), 0.05, v => { seg.out = Math.max(v, seg.in + 0.1); }));
    box.appendChild(numRange('速度(倍)', seg.speed || 1, 0.25, 4, 0.05, v => { seg.speed = Math.max(0.25, v); }));
  }
  box.appendChild(el('h3', null, '画面位置'));
  box.appendChild(el('div', 'hint', '也可以直接在左边画面上拖动影片（拖到正中会自动对齐）。'));
  box.appendChild(numRange('缩放(%)', Math.round((seg.vs || 1) * 100), 20, 250, 1, v => { seg.vs = v / 100; }));
  box.appendChild(numRange('左右', seg.vx || 0, -1080, 1080, 1, v => { seg.vx = v; }));
  box.appendChild(numRange('上下', seg.vy || 0, -1920, 1920, 1, v => { seg.vy = v; }));
  if (seg.layout === 'phone') {
    box.appendChild(numRange('手机框高度', seg.ph || 1400, 300, 2400, 1, v => { seg.ph = v; }));
    box.appendChild(numRange('录屏内容上下', seg.cropY || 0, 0, 1500, 1, v => { seg.cropY = v; }));
  } else {
    box.appendChild(selectRow('空白处背景', seg.bgc || 'black', [['black', '黑色'], ['lav', '薰衣草紫']], v => { seg.bgc = v; }));
  }
  const rp = el('div', 'inline');
  rp.appendChild(button('画面复位', () => { commit(); seg.vs = 1; seg.vx = 0; seg.vy = 0; if (seg.layout === 'phone') seg.ph = 1400; refresh(true); }));
  rp.appendChild(button('套用到所有同版面片段', () => { commit(); project.segments.forEach(o => { if (o !== seg && o.layout === seg.layout) { o.vs = seg.vs; o.vx = seg.vx; o.vy = seg.vy; if (seg.layout === 'phone') o.ph = seg.ph; else o.bgc = seg.bgc; } }); refresh(true); toast('已套用'); }));
  box.appendChild(rp);
  box.appendChild(el('h3', null, '其他'));
  box.appendChild(checks('选项', [
    ['定格', seg.freeze, v => { if (v) { seg.freeze = true; seg.out = seg.in + Math.min(2.6, Math.max(0.3, segDur(seg))); } else { seg.freeze = false; seg.out = Math.min(seg.in + 2, src.dur); seg.speed = 1; } }],
    ['变暗', !!seg.dim, v => { seg.dim = v; }],
    ['原声', !!seg.sound, v => { seg.sound = v; }]
  ]));
  box.appendChild(selectRow('进场音效', seg.sfx || 'none', [['none', '无'], ['whoosh', 'Whoosh 咻'], ['pop', 'Pop 啵']], v => { seg.sfx = v; }));
  box.appendChild(el('h3', null, '这个片段的文字'));
  const n = (seg.texts || []).length;
  const r = el('div', 'inline'); r.appendChild(el('span', 'hint', n ? `${n} 段文字` : '没有文字'));
  r.appendChild(button('去编辑文字 →', () => { tab = 'text'; renderInspector(); })); box.appendChild(r);
}
function applyStyle(t, st) { for (const k of ['font', 'color', 'bg', 'bgColor', 'stroke', 'strokeColor', 'shadow']) if (st[k] !== undefined) t[k] = st[k]; if (st.size) t.size = st.size; }
function textPanel(box) {
  const seg = project.segments[selSeg];
  const head = el('div', 'inline'); head.style.justifyContent = 'space-between';
  head.appendChild(el('h2', null, `片段 ${selSeg + 1} 的文字`));
  head.appendChild(button('＋ 加文字', () => { commit(); seg.texts = seg.texts || []; const st = project.styles[0] || {}; const t = { text: 'New text', size: 72, x: 540, y: 820, rot: 0, start: 0, end: 99, font: 'display-black', color: '#ffffff', bg: 'pill', bgColor: '#5b2ba8', stroke: 0, strokeColor: '#000000', shadow: true }; applyStyle(t, st); t.size = 72; seg.texts.push(t); selText = seg.texts.length - 1; refresh(true); }));
  box.appendChild(head);
  box.appendChild(el('div', 'hint', '在左边时间轴选别的片段，就能编辑那个片段的文字。'));
  if (!(seg.texts || []).length) box.appendChild(el('p', 'hint', '这个片段还没有文字，按"＋ 加文字"。'));
  (seg.texts || []).forEach((t, k) => {
    const card = el('div', 'card' + (k === selText ? ' sel' : ''));
    card.addEventListener('pointerdown', () => { if (selText !== k) { selText = k; document.querySelectorAll('.card').forEach((c, j) => c.classList.toggle('sel', j === k)); lastKey = ''; applyFrame(false); } });
    const ta = el('textarea'); ta.value = t.text; ta.rows = 2; ta.dataset.ta = k;
    ta.addEventListener('focus', () => commit(), { once: true });
    ta.addEventListener('input', () => { t.text = ta.value; save(); lastKey = ''; applyFrame(false); });
    card.appendChild(ta);
    // presets
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
    pw.appendChild(button('＋ 存成我的风格', () => {
      commit(); const nm = (t.text.split('\n')[0] || '风格').slice(0, 10);
      project.styles.push({ name: '我的 ' + nm, font: t.font, color: t.color, bg: t.bg, bgColor: t.bgColor, stroke: t.stroke, strokeColor: t.strokeColor, shadow: t.shadow, size: t.size });
      refresh(true); toast('已存成"我的风格"，其他文字一键就能套用');
    }));
    pr.appendChild(pw); card.appendChild(pr);
    card.appendChild(selectRow('字体', t.font, Object.entries(FONTS).map(([k2, f]) => [k2, f.label]), v => { t.font = v; }));
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
    acts.appendChild(button('复制这段', () => { commit(); const c = clone(t); c.y += 120; seg.texts.splice(k + 1, 0, c); selText = k + 1; refresh(true); }));
    acts.appendChild(button('删除', () => { commit(); seg.texts.splice(k, 1); selText = -1; refresh(true); }));
    card.appendChild(acts);
    box.appendChild(card);
  });
  box.appendChild(el('p', 'hint', '提示：Enter 换行。时间是"这个片段内"的秒数。在画面上双击文字会跳到这里。'));
}
function audioPanel(box) {
  box.appendChild(el('h2', null, '声音'));
  box.appendChild(numRange('影片原声音量', project.mix.videoVolume, 0, 1.5, 0.05, v => { project.mix.videoVolume = v; }));
  const up = el('div', 'inline'); up.style.margin = '8px 0';
  for (const [kind, label] of [['voice', '🎙 上传人声 / 配音'], ['music', '🎵 上传音乐']]) {
    const fb = el('span', 'btn filebtn' + (kind === 'voice' ? ' primary' : ''), label);
    const inp = el('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.m4a,.mp3,.wav,.aac,.mov,.mp4';
    inp.addEventListener('change', () => { if (inp.files[0]) addAudioFile(inp.files[0], kind); inp.value = ''; });
    fb.appendChild(inp); up.appendChild(fb);
  }
  box.appendChild(up);
  box.appendChild(el('div', 'hint', '🎙 网页不能直接开麦克风：先用手机"语音备忘录"录好，再上传。<br>🎵 音乐请用有授权的（例如 Picsart 音乐库、YouTube Audio Library），热门歌建议在 IG 里加。<br>⚠️ 渲染时要把同一个声音文件也发给 Claude。'));
  if (!project.audio.length) { box.appendChild(el('p', 'hint', '还没有声音素材。')); return; }
  project.audio.forEach((c, j) => {
    const card = el('div', 'card' + (j === selAudio ? ' sel' : ''));
    card.addEventListener('pointerdown', () => { if (selAudio !== j) { selAudio = j; document.querySelectorAll('.card').forEach((x, q) => x.classList.toggle('sel', q === j)); renderTimeline(); } });
    const h = el('div', 'inline'); h.appendChild(el('b', null, (c.kind === 'voice' ? '🎙 人声' : '🎵 音乐'))); const nm = el('span', 'hint'); nm.textContent = c.name; h.appendChild(nm);
    card.appendChild(h);
    if (!hasFile(c)) {
      const w = el('div', 'warn', '这台设备上找不到这个文件，请重新选一次同一个文件：'); card.appendChild(w);
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
