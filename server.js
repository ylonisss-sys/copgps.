// CopGPS relay server (Node.js, no dependencies)
// Receives positions from players and returns the positions of the others in the same room.
const http = require('http');

const KEY = process.env.GPS_KEY || 'MY_SECRET_KEY';   // <-- change this (same key must be in the Lua script)
const TTL = 10000;                                    // ms without updates -> player disappears
const rooms = new Map();                              // room -> Map(nick -> {x,y,z,v,hp,t})

const clean = (s, n = 32) => String(s || '').replace(/[^\w.\-]/g, '').slice(0, n);
const cleanTag = (s) => String(s || '').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 12);
const cleanLv = (s) => (s === 'n' ? 'n' : 'e');
const cleanSt = (s) => (s === 'g' || s === 'y' || s === 'r' ? s : '');
const cleanIa = (v) => (Number.isFinite(v) && v >= 0 && v < 256 ? Math.floor(v) : 0);
const cleanInt = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.floor(v) : 0);
const cleanAlert = (s) => String(s || '').replace(/[^A-Za-z0-9 _.!?\-]/g, '').slice(0, 20);
const num = (v) => (Number.isFinite(v) && Math.abs(v) < 100000 ? v : null);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/ping')) {
    res.writeHead(200); return res.end('ok');
  }
  if (req.method !== 'POST' || req.url !== '/update') { res.writeHead(404); return res.end(); }

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    let d;
    try { d = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(); }
    if (d.key !== KEY) { res.writeHead(403); return res.end(); }

    const nick = clean(d.nick), room = clean(d.room) || 'default';
    if (!nick) { res.writeHead(400); return res.end(); }
    if (!rooms.has(room)) rooms.set(room, new Map());
    const players = rooms.get(room);
    const now = Date.now();

    if (d.off) {
      players.delete(nick);
    } else {
      const x = num(d.x), y = num(d.y), z = num(d.z);
      if (x === null || y === null || z === null) { res.writeHead(400); return res.end(); }
      players.set(nick, { x, y, z, v: d.v ? 1 : 0, hp: num(d.hp) || 0, tag: cleanTag(d.tag), al: cleanAlert(d.al), lv: cleanLv(d.lv), st: cleanSt(d.st), ia: cleanIa(d.ia), vm: cleanInt(d.vm, 65535), vid: cleanInt(d.vid, 2100), sd: d.sd === 0 ? 0 : 1, t: now });
    }

    const out = [];
    for (const [n, p] of players) {
      if (now - p.t > TTL) { players.delete(n); continue; }
      if (n !== nick) out.push({ n, x: p.x, y: p.y, z: p.z, v: p.v, hp: p.hp, tag: p.tag, al: p.al, lv: p.lv, st: p.st, ia: p.ia, vm: p.vm, vid: p.vid, sd: p.sd });
    }
    if (players.size === 0) rooms.delete(room);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

// Keep connections open longer than the proxy in front of the server (fixes sporadic 502/520 errors)
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) {}
});
process.on('uncaughtException', (e) => console.error('error:', e));

server.listen(process.env.PORT || 8080, () => console.log('CopGPS server started'));
