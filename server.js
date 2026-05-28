const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ── www redirect: non-www → www (catches both http and https bare domain) ──
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!host.startsWith('www.') && !host.startsWith('localhost') && !host.includes('railway')) {
    return res.redirect(301, 'https://www.' + host + req.url);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', site: 'elevatepause', ts: new Date().toISOString() }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/sponsorship', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sponsorship.html')));

app.listen(PORT, () => console.log(`elevatePAUSE running on port ${PORT}`));
