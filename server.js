/*
 * Loy Krathong 2569 - local relay
 *  - serves ./public (the three.js game)
 *  - connects to a TikTok LIVE room with zerodytrash/TikTok-Live-Connector (npm: tiktok-live-connector)
 *  - broadcasts simplified events to the game over WebSocket  ws://<host>:<port>/ws
 *
 * usage:  node server.js <tiktok_username> [--port 8080] [--demo]
 *   env:  TIKTOK_USERNAME, PORT, EULER_API_KEY (optional sign-server key), TIKTOK_SESSION_ID (optional)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const username = (positional[0] || process.env.TIKTOK_USERNAME || '').replace(/^@/, '');
const PORT = Number(opt('--port', process.env.PORT || 8080));
const DEMO = flag('--demo');
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
let status = { type: 'status', state: DEMO ? 'demo' : (username ? 'connecting' : 'idle'), username };
const broadcast = (obj) => { const s = JSON.stringify(obj); wss.clients.forEach((c) => c.readyState === 1 && c.send(s)); };
const setStatus = (state, extra = {}) => {
  status = { type: 'status', state, username, ...extra };
  broadcast(status);
  console.log('[status]', state, extra.message || '');
};
wss.on('connection', (ws) => { ws.send(JSON.stringify(status)); });

// ---------- helpers: normalise v1 / v2 payloads of tiktok-live-connector ----------
const userOf = (d) => {
  const u = d.user || {};
  const pic = (u.profilePicture && (u.profilePicture.url?.[0] || u.profilePicture.urls?.[0])) || d.profilePictureUrl || '';
  const id = u.userId ?? d.userId ?? u.uniqueId ?? d.uniqueId ?? Math.random();
  return {
    id: String(id),
    uniqueId: u.uniqueId ?? d.uniqueId ?? '',
    nickname: u.nickname ?? d.nickname ?? u.uniqueId ?? d.uniqueId ?? 'guest',
    avatar: pic,
  };
};
const emit = (type, d, extra = {}) => broadcast({ type, user: userOf(d), ts: Date.now(), ...extra });

// ---------- TikTok connection ----------
let conn = null;
async function startTikTok() {
  if (!username) {
    console.log('No TikTok username given - running as idle game only.  (node server.js <username>)');
    return;
  }
  let mod;
  try { mod = await import('tiktok-live-connector'); }
  catch (e) { setStatus('error', { message: 'run "npm install" first: ' + e.message }); return; }
  const lib = mod.TikTokLiveConnection || mod.WebcastPushConnection ? mod : (mod.default || mod);
  const Conn = lib.TikTokLiveConnection || lib.WebcastPushConnection;      // v2 || v1
  const WE = lib.WebcastEvent || {};
  const CE = lib.ControlEvent || {};
  const ev = (k, fallback) => WE[k] || fallback;

  const options = { processInitialData: false, enableExtendedGiftInfo: true };
  if (process.env.EULER_API_KEY) options.signApiKey = process.env.EULER_API_KEY;
  if (process.env.TIKTOK_SESSION_ID) options.sessionId = process.env.TIKTOK_SESSION_ID;

  let retryTimer = null;
  const retry = (ms) => { clearTimeout(retryTimer); retryTimer = setTimeout(connect, ms); };
  const connect = async () => {
    setStatus('connecting');
    conn = new Conn(username, options);
    conn.on(ev('CHAT', 'chat'), (d) => emit('chat', d, { comment: String(d.comment ?? '') }));
    conn.on(ev('MEMBER', 'member'), (d) => emit('join', d));
    conn.on(ev('FOLLOW', 'follow'), (d) => emit('follow', d));
    conn.on(ev('SHARE', 'share'), (d) => emit('share', d));
    conn.on(ev('LIKE', 'like'), (d) => emit('like', d, { count: Number(d.likeCount ?? 1), total: Number(d.totalLikeCount ?? 0) }));
    conn.on(ev('ROOM_USER', 'roomUser'), (d) => broadcast({ type: 'viewers', count: Number(d.viewerCount ?? 0) }));
    conn.on(ev('GIFT', 'gift'), (d) => {
      const det = d.giftDetails || d.extendedGiftInfo || {};
      const type = det.giftType ?? d.giftType;
      if (type === 1 && d.repeatEnd === false) return;                       // streak still running - count at the end only
      const per = Number(det.diamondCount ?? d.diamondCount ?? 1);
      const rep = Number(d.repeatCount ?? 1) || 1;
      emit('gift', d, { giftName: det.giftName ?? d.giftName ?? 'gift', diamonds: per * rep, count: rep });
    });
    conn.on(ev('STREAM_END', 'streamEnd'), () => setStatus('ended', { message: 'stream ended' }));
    conn.on(CE.DISCONNECTED || 'disconnected', () => { setStatus('disconnected'); retry(15000); });
    conn.on(CE.ERROR || 'error', (e) => console.error('[tiktok error]', (e && e.message) || e));
    try {
      const st = await conn.connect();
      setStatus('live', { roomId: st && st.roomId });
    } catch (e) {
      setStatus('offline', { message: String((e && e.message) || e) });      // not live yet / blocked - retry
      retry(20000);
    }
  };
  connect();
}

// ---------- demo generator (no TikTok needed) ----------
function startDemo() {
  const names = ['Nune', 'Beam', 'Malai', 'Tae', 'Por', 'Mina', 'Khaohom', 'Joy', 'Boss', 'Fon'];
  const says = ['สวัสดีค่ะ 🪷', 'ลอยกระทงปีนี้สวยมาก', 'ขอให้ร้ายๆ ลอยไปกับน้ำ', 'สาธุ 🙏', '555 มาแล้ว', 'พระจันทร์สวยจัง 🌕', 'ขอพรให้ได้โชค'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  setInterval(() => {
    const n = pick(names);
    const user = { id: 'demo-' + n, uniqueId: n.toLowerCase(), nickname: n, avatar: '' };
    const r = Math.random();
    if (r < 0.4) broadcast({ type: 'chat', user, comment: pick(says) });
    else if (r < 0.6) broadcast({ type: 'join', user });
    else if (r < 0.8) broadcast({ type: 'follow', user });
    else if (r < 0.9) broadcast({ type: 'like', user, count: 5 });
    else if (r < 0.95) broadcast({ type: 'share', user });
    else broadcast({ type: 'gift', user, giftName: 'Rose', diamonds: 1 + Math.floor(Math.random() * 60), count: 1 });
  }, 1800);
}

server.listen(PORT, () => {
  console.log(`\n  Loy Krathong 2569  ->  http://localhost:${PORT}/   (add ?hud=0 for a clean overlay)`);
  console.log(`  game websocket     ->  ws://localhost:${PORT}/ws\n`);
  if (DEMO) startDemo(); else startTikTok();
});
