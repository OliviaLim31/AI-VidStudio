const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2], port = +(process.argv[3] || 8765);
const types = { '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.otf': 'font/otf', '.ttf': 'font/ttf', '.json': 'application/json' };
http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(root, u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const st = fs.statSync(f), type = types[path.extname(f)] || 'application/octet-stream';
  const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
  if (m) { const s = +m[1], e = m[2] ? +m[2] : st.size - 1; r.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': type }); fs.createReadStream(f, { start: s, end: e }).pipe(r); }
  else { r.writeHead(200, { 'Content-Length': st.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(r); }
}).listen(port);
