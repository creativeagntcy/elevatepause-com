const express = require('express');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// ── Sponsorship password gate ──
const SPONSOR_PASSWORD = (process.env.SPONSOR_PASSWORD || 'EVEVATED').toUpperCase();
const COOKIE_NAME = 'ep_access';
const COOKIE_SALT = process.env.COOKIE_SALT || 'ep-salt-2026-im';

function makeToken(pw) {
  return crypto.createHmac('sha256', COOKIE_SALT).update(pw).digest('hex');
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURIComponent(parts.join('=').trim());
  });
  return list;
}

function hasAccess(req) {
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] === makeToken(SPONSOR_PASSWORD);
}

// ── www redirect: non-www → www (catches both http and https bare domain) ──
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!host.startsWith('www.') && !host.startsWith('localhost') && !host.includes('railway')) {
    return res.redirect(301, 'https://www.' + host + req.url);
  }
  next();
});

// Redirect removed pages before static middleware can intercept
app.get(['/agenda', '/agenda/'], (req, res) => res.redirect(301, '/'));

// ── Coming Soon gate ────────────────────────────────────────────────────────
const COMING_SOON = process.env.COMING_SOON === 'true';
const PREVIEW_SECRET = process.env.PREVIEW_SECRET || 'elevatepause-preview-2026';
app.use((req, res, next) => {
  if (!COMING_SOON) return next();
  // Allow: health check, static assets, sponsorship routes, preview bypass
  if (
    req.path.startsWith('/health') ||
    req.path.startsWith('/assets') ||
    req.path.startsWith('/sponsorship') ||
    req.path.startsWith('/api') ||
    req.path.startsWith('/portal') ||
    req.path.startsWith('/vtl') ||
    req.query.preview === PREVIEW_SECRET
  ) return next();
  // Serve coming soon page
  res.sendFile(path.join(__dirname, 'public', 'coming-soon.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', site: 'elevatepause', ts: new Date().toISOString() }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/speakers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'speakers', 'index.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html')));

// Sponsorship login page
app.get('/sponsorship/enter', (req, res) => {
  const error = req.query.error ? '<p style="color:#c0392b;font-size:14px;margin-top:12px;">Incorrect password. Try again.</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Partner Access — elevatePAUSE™</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
           background: #f1efff; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 400px;
            width: 100%; box-shadow: 0 8px 40px rgba(61,24,96,0.12); text-align: center; }
    .brand { font-family: Georgia, serif; font-size: 20px; margin-bottom: 28px; }
    .brand-e { color: #3d1860; }
    .brand-p { color: #735fcf; }
    h1 { font-family: Georgia, serif; font-size: 22px; color: #3d1860; margin-bottom: 8px; }
    p { font-size: 14px; color: #666; margin-bottom: 28px; line-height: 1.5; }
    input[type=password] { width: 100%; padding: 13px 16px; border: 1.5px solid #c8c4e8;
      border-radius: 8px; font-size: 16px; color: #3d1860; outline: none;
      transition: border-color 0.2s; margin-bottom: 16px; letter-spacing: 0.08em; }
    input[type=password]:focus { border-color: #735fcf; }
    button { width: 100%; background: #3d1860; color: #fff; border: none; border-radius: 8px;
      padding: 14px; font-size: 15px; font-weight: 600; letter-spacing: 0.04em;
      cursor: pointer; transition: background 0.2s; }
    button:hover { background: #735fcf; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="brand-e">elevate</span><span class="brand-p">PAUSE</span><span class="brand-e">™</span></div>
    <h1>Partner Access</h1>
    <p>This page is for prospective sponsors and partners. Enter the access code to continue.</p>
    <form method="POST" action="/sponsorship/enter">
      <input type="password" name="password" placeholder="Access code" autofocus />
      ${error}
      <button type="submit">Continue &rarr;</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/sponsorship/enter', express.urlencoded({ extended: false }), (req, res) => {
  const submitted = (req.body.password || '').trim().toUpperCase();
  if (submitted === SPONSOR_PASSWORD) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${makeToken(SPONSOR_PASSWORD)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.redirect(302, '/sponsorship');
  }
  res.redirect(302, '/sponsorship/enter?error=1');
});

// Protected sponsorship page
app.get('/sponsorship', (req, res) => {
  if (!hasAccess(req)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.redirect(302, '/sponsorship/enter');
  }
  res.setHeader('Cache-Control', 'no-store, private');
  res.sendFile(path.join(__dirname, 'protected', 'sponsorship.html'));
});

// Sponsorship login — also no-cache
app.use('/sponsorship', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  next();
});

app.listen(PORT, () => console.log(`elevatePAUSE running on port ${PORT}`));
