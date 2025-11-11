const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
function loadEnv(file = path.join(__dirname, '.env')) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = /^(\w[\w_\d]*)=(.*)$/.exec(line.trim());
      if (!m) return;
      const key = m[1];
      const val = m[2];
      if (!(key in process.env)) process.env[key] = val;
    });
  } catch (_) {}
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const SERVE_STATIC = (process.env.SERVE_STATIC || 'true').toLowerCase() !== 'false';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const dataFiles = ['NewArrivals.json', 'Tops.json', 'Bottoms.json', 'Accessories.json'];
function safeJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')); }
  catch (e) { console.warn('JSON load failed', file, e.message); return []; }
}
function normalize(item, sourceTag) {
  return {
    id: item.id ?? item.ID ?? item.sku ?? undefined,
    name: String(item.name || item.title || '').trim(),
    description: String(item.description || item.desc || '').trim(),
    price: typeof item.price === 'number' ? item.price : Number(item.price) || undefined,
    category: String(item.category || sourceTag || '').trim(),
    image: item.image || item.img || undefined,
    source: sourceTag
  };
}
const KB = [];
for (const f of dataFiles) {
  const tag = path.basename(f, path.extname(f)).toLowerCase();
  const arr = safeJson(f);
  if (Array.isArray(arr)) arr.forEach((x) => KB.push(normalize(x, tag)));
}

function topMatches(query, max = 12) {
  const q = String(query || '').toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const score = (it) => {
    const hay = `${it.name}\n${it.description}\n${it.category}`.toLowerCase();
    let s = 0; for (const t of tokens) if (hay.includes(t)) s += t.length > 3 ? 2 : 1;
    if (q && it.name && q.includes(it.name.toLowerCase())) s += 3;
    return s;
  };
  return KB.map(it => ({ it, s: score(it) }))
           .filter(x => x.s > 0)
           .sort((a, b) => b.s - a.s)
           .slice(0, Math.min(max, 25))
           .map(x => x.it);
}

function formatContext(items) {
  if (!items?.length) return 'No matching items found in the catalog.';
  return items.map((p, i) => {
    const price = typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : 'N/A';
    return `#${i + 1} [${p.source}] ${p.name} — ${price}\nID: ${p.id || 'n/a'}\n${p.description || '(no description)'}\n`;
  }).join('\n');
}
function serveStatic(req, res) {
  if (!SERVE_STATIC) return false;
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  let filePath = decodeURIComponent(parsed.pathname);
  if (filePath.endsWith('/')) filePath += 'index.html';
  if (filePath === '/') filePath = '/index.html';
  const safe = path.normalize(filePath).replace(/^\.+/, '');
  const abs = path.join(__dirname, safe);
  if (!abs.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return true; }
  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) { res.writeHead(403); res.end('Forbidden'); return true; }
    const ext = path.extname(abs).toLowerCase();
    const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.mp4':'video/mp4' };
    const type = types[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
      res.writeHead(404); res.end('index.html not found');
    } else { return false; }
  }
  return true;
}
function callGemini(model, apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }]}]
    });
    const options = {
      method: 'POST',
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (d) => data += d);
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
async function handleChat(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { 'Access-Control-Allow-Origin': '*' }); res.end('Method Not Allowed'); return; }
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const message = (parsed.message || '').trim();
  if (!message) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: 'Missing message' })); return; }

      const items = topMatches(message, Number(parsed.k) || 12);
      const context = formatContext(items);
      const system = 'You are an assistant for an online fashion store (Avant Atelier). Answer only using the context from our catalog below. If unknown, say you do not have that information and suggest contacting support. Keep answers concise.';
      const prompt = `${system}\n\nContext:\n---\n${context}\n---\n\nUser question:\n${message}`;

      if (!GEMINI_API_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured in .env' }));
        return;
      }

      const reply = await callGemini(GEMINI_MODEL, GEMINI_API_KEY, prompt);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ reply, used: items.map(i => ({ id: i.id, name: i.name, category: i.category })) }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Chat failed', detail: String(e?.message || e) }));
    }
  });
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/api/chat') return handleChat(req, res);
  if (u.pathname.startsWith('/api/') && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  if (SERVE_STATIC && (req.method === 'GET' || req.method === 'HEAD')) {
    const ok = serveStatic(req, res);
    if (ok) return;
  }
  res.writeHead(404); res.end('Not found');
});
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Static: ${SERVE_STATIC ? 'on' : 'off'}, Catalog items: ${KB.length}`);
});
