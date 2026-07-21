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
      all.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
      const top = all.slice(0, 20).map(e => ({ handle: e.handle || 'Player', rating: e.rating || 1000, wins: e.wins || 0, games: e.games || 0 }));
      let me = all.find(e => e.RowKey === id);
      let rank = me ? all.findIndex(e => e.RowKey === id) + 1 : 0;
      ok({ rating: me ? me.rating : 1000, rank, total: all.length,
           games: me ? (me.games || 0) : 0, wins: me ? (me.wins || 0) : 0, losses: me ? (me.losses || 0) : 0, top });
      return;
    }
    // POST: submit a ranked result. body.results = [{token, handle}] ordered winner-first.
    // Each token is verified (issued by the account function) → identity can't be spoofed onto another account.
    const raw = (req.body && req.body.results) || [];
    const seen = new Set(), results = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const p = verifyToken(r && r.token);
      if (!p || !p.aid || seen.has(p.aid)) continue;      // invalid / expired / duplicate → skip
      seen.add(p.aid); results.push({ id: p.aid, handle: clean(r.handle) });
    }
    if (results.length < 2) { context.res = { status: 400, headers: cors, body: { error: 'need >= 2 signed-in players' } }; return; }
    const N = results.length, K = 28;
    const cur = [];
    for (const r of results) {
      const e = await getEntity(r.id) || {};
      cur.push({ id: String(r.id), handle: clean(r.handle || e.handle), rating: e.rating || 1000, wins: e.wins || 0, losses: e.losses || 0, games: e.games || 0 });
    }
    // pairwise Elo (winner-first order = placement)
    const delta = cur.map(() => 0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const Ei = 1 / (1 + Math.pow(10, (cur[j].rating - cur[i].rating) / 400));
      delta[i] += K * (1 - Ei); delta[j] += K * (0 - (1 - Ei));
    }
    const out = [];
    for (let i = 0; i < N; i++) {
      const d = Math.round(delta[i] / Math.max(1, N - 1));
      const win = i < N / 2;                          // top half = win
      const nr = Math.max(100, cur[i].rating + d);
      await putEntity({ PartitionKey: 'p', RowKey: cur[i].id, handle: cur[i].handle,
        rating: nr, wins: cur[i].wins + (win ? 1 : 0), losses: cur[i].losses + (win ? 0 : 1), games: cur[i].games + 1 });
      out.push({ id: cur[i].id, rating: nr, delta: d, win });
    }
    ok({ ratings: out });
  } catch (e) {
    context.res = { status: 500, headers: cors, body: { error: String(e && e.message || e) } };
  }
};
