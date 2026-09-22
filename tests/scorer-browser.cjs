// Run: node tests/scorer-browser.cjs, then open http://localhost:4173/scorer.html
// Serves the real UI with an in-memory Supabase stub. No production writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
http.createServer((req, res) => {
  if (req.url === '/test-init.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync(path.join(__dirname, 'scorer-mock.js'), 'utf8') + `
      window.testClient = ScorerTest.mockClient();
      window.supabase = { createClient: () => testClient };
      window.confirm = () => true;
      window.alert = text => { window.lastAlert = text; };
    `);
  }
  if (req.url === '/results' && req.method === 'POST') {
    let body = ''; req.on('data', data => body += data); req.on('end', () => { console.log(body); res.end('ok'); }); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let content = fs.readFileSync(file);
    if (file.endsWith('scorer.html')) content = content.toString().replace(/<script src="https:\/\/cdn[^>]+><\/script>/,
      '<script src="/test-init.js"></script>').replace('</body>', '<script src="/tests/scorer-browser.js"></script></body>');
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' }[path.extname(file)];
    res.setHeader('Content-Type', type || 'application/octet-stream'); res.end(content);
  } catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Scorer mock test server: http://localhost:4173/scorer.html'));
