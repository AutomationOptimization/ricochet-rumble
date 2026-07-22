'use strict';
// Ranked ladder for Ricochet Rumble — persistent Elo ratings + global leaderboard in Azure Table Storage.
// Zero npm deps: Table Storage REST with SharedKeyLite auth via Node crypto.
const crypto = require('crypto');

function parseConn(conn) {
  const o = {};
  String(conn || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim(); });
  return { account: o.accountname || '', key: o.accountkey || '' };
}
const CONN = parseConn(process.env.AzureWebJobsStorage);
const TABLE = 'ranks';
const VER = '2019-02-02';
const BASE = () => `https://${CONN.account}.table.core.windows.net`;
// same session-token secret as the account function — used to verify ranked participants
const SECRET = crypto.createHash('sha256').update((CONN.key || 'x') + '::rr-acct-v1').digest();
function b64urlJson(s) { return JSON.parse(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
function verifyToken(tok) {
  try {
    const [h, p, s] = String(tok).split('.');
    if (!h || !p || !s) return null;
    const exp = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (s.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
    const payload = b64urlJson(p);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}

function authHeader(dateStr, canonResource) {
  const stringToSign = dateStr + '\n' + canonResource;
  const sig = crypto.createHmac('sha256', Buffer.from(CONN.key, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return `SharedKeyLite ${CONN.account}:${sig}`;
}
async function tbl(method, path, query, body) {
  const date = new Date().toUTCString();
  const canon = `/${CONN.account}${path}`;            // SharedKeyLite: path only, no query
  const headers = {
    'x-ms-date': date, 'x-ms-version': VER, 'Authorization': authHeader(date, canon),
    'Accept': 'application/json;odata=nometadata'
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE() + path + (query || ''), { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res;
}
async function ensureTable() {
  try { await tbl('POST', '/Tables', '', { TableName: TABLE }); } catch (e) {}  // 409 if exists — ignore
}
const ekey = id => `/${TABLE}(PartitionKey='p',RowKey='${id}')`;
async function getEntity(id) {
  const r = await tbl('GET', ekey(id));
  if (r.status === 200) return await r.json();
  return null;
}
async function putEntity(e) { await tbl('PUT', ekey(e.RowKey), '', e); }   // PUT w/o If-Match = insert-or-replace
async function listAll() {
  const r = await tbl('GET', `/${TABLE}()`, `?$filter=PartitionKey%20eq%20'p'&$top=1000`);
  if (r.status !== 200) return [];
  const j = await r.json();
  return (j.value || []);
}
const clean = h => String(h || 'Player').replace(/[^\w .\-]/g, '').slice(0, 16) || 'Player';

// ---- Heaven's Arena tower: floors 1→200, with inactivity decay ----
const DAY = 86400000, DECAY_GRACE_DAYS = 3, DECAY_PER_DAY = 4;
function floorFromRating(r) { return Math.max(1, Math.min(200, Math.round((((r || 1000) - 760) / 3.6)) + 1)); }
function entFloor(e) { return (e && typeof e.floor === 'number') ? e.floor : floorFromRating(e && e.rating); }
// mutate an entity to reflect idle decay; returns floors lost (0 if none). Caller persists when > 0.
function applyDecay(e) {
  if (!e || !e.lastPlayed) return 0;
  const f = entFloor(e); if (f <= 1) return 0;
  const idleDays = (Date.now() - e.lastPlayed) / DAY;
  if (idleDays <= DECAY_GRACE_DAYS) return 0;
  const periods = Math.floor(idleDays - DECAY_GRACE_DAYS); if (periods <= 0) return 0;
  const lost = Math.min(f - 1, periods * DECAY_PER_DAY);
  e.floor = f - lost;
  e.lastPlayed = e.lastPlayed + periods * DAY;                 // consume the decayed days so it keeps accruing
  e.rating = Math.max(100, (e.rating || 1000) - lost * 3);     // nudge rating down to keep matchmaking coherent
  return lost;
}

module.exports = async function (context, req) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers: cors }; return; }
  if (!CONN.account || !CONN.key) { context.res = { status: 500, headers: cors, body: { error: 'storage not configured' } }; return; }
  const ok = b => { context.res = { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: b }; };
  try {
    await ensureTable();
    if (req.method === 'GET') {
      const id = String((req.query && req.query.id) || '');
      const all = await listAll();
      // decay the queried player on read (persist if they slipped), so idleness actually costs floors
      const me = all.find(e => e.RowKey === id) || null;
      if (me) { const lost = applyDecay(me); if (lost > 0) await putEntity(me); }
      all.forEach(e => { e._floor = entFloor(e); });
      all.sort((a, b) => (b._floor - a._floor) || ((b.rating || 1000) - (a.rating || 1000)));   // tower ranks by floor
      const top = all.slice(0, 20).map(e => ({ handle: e.handle || 'Player', rating: e.rating || 1000, floor: e._floor, wins: e.wins || 0, games: e.games || 0 }));
      const rank = me ? all.findIndex(e => e.RowKey === id) + 1 : 0;
      ok({ rating: me ? (me.rating || 1000) : 1000, floor: me ? entFloor(me) : 1, lastPlayed: me ? (me.lastPlayed || 0) : 0,
           rank, total: all.length, games: me ? (me.games || 0) : 0, wins: me ? (me.wins || 0) : 0, losses: me ? (me.losses || 0) : 0, top });
      return;
    }
    // POST: submit a ranked result. body.results = [{token, handle}] ordered winner-first.
    // Each token is verified, and the account must have a confirmed email → no farming with throwaway accounts.
    const raw = (req.body && req.body.results) || [];
    const seen = new Set(), results = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const p = verifyToken(r && r.token);
      if (!p || !p.aid || seen.has(p.aid)) continue;      // invalid / expired / duplicate → skip
      const ar = await tbl('GET', `/accounts(PartitionKey='u',RowKey='${p.u}')`);   // cross-check email is confirmed
      if (ar.status !== 200) continue;
      const acc = await ar.json();
      if (!(acc.verified === true || acc.verified === 'true')) continue;            // unverified email → excluded
      seen.add(p.aid); results.push({ id: p.aid, handle: clean(r.handle) });
    }
    if (results.length < 2) { context.res = { status: 400, headers: cors, body: { error: 'need >= 2 email-verified players' } }; return; }
    const N = results.length, K = 28;
    const cur = [];
    for (const r of results) {
      const e = await getEntity(r.id) || {};
      cur.push({ id: String(r.id), handle: clean(r.handle || e.handle), rating: e.rating || 1000,
        floor: entFloor(e), wins: e.wins || 0, losses: e.losses || 0, games: e.games || 0 });
    }
    // pairwise Elo (winner-first order = placement)
    const delta = cur.map(() => 0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const Ei = 1 / (1 + Math.pow(10, (cur[j].rating - cur[i].rating) / 400));
      delta[i] += K * (1 - Ei); delta[j] += K * (0 - (1 - Ei));
    }
    // floor movement — Heaven's Arena: winners climb, losers slip; upsets move you more
    const fdelta = cur.map(() => 0);
    if (N === 2) {
      const gap = cur[1].floor - cur[0].floor;                 // loser − winner
      fdelta[0] = Math.max(1, Math.min(6, 1 + Math.round(gap / 25)));   // beating someone higher = more floors
      fdelta[1] = -Math.max(1, Math.min(3, 1 + Math.round(gap / 40)));  // losing to someone lower = steeper fall
    } else {
      for (let i = 0; i < N; i++) fdelta[i] = (i < N / 2) ? 1 : -1;
    }
    const now = Date.now();
    const out = [];
    for (let i = 0; i < N; i++) {
      const d = Math.round(delta[i] / Math.max(1, N - 1));
      const win = i < N / 2;                          // top half = win
      const nr = Math.max(100, cur[i].rating + d);
      const nf = Math.max(1, Math.min(200, cur[i].floor + fdelta[i]));
      await putEntity({ PartitionKey: 'p', RowKey: cur[i].id, handle: cur[i].handle,
        rating: nr, floor: nf, lastPlayed: now,
        wins: cur[i].wins + (win ? 1 : 0), losses: cur[i].losses + (win ? 0 : 1), games: cur[i].games + 1 });
      out.push({ id: cur[i].id, rating: nr, delta: d, win, floor: nf, floorDelta: nf - cur[i].floor });
    }
    ok({ ratings: out });
  } catch (e) {
    context.res = { status: 500, headers: cors, body: { error: String(e && e.message || e) } };
  }
};
