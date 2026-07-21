'use strict';
// Accounts for Ricochet Rumble — username + password, PBKDF2-hashed, with signed session tokens
// and a cloud save. Zero npm deps: Azure Table Storage over SharedKeyLite REST + Node crypto.
const crypto = require('crypto');

function parseConn(conn) {
  const o = {};
  String(conn || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim(); });
  return { account: o.accountname || '', key: o.accountkey || '' };
}
const CONN = parseConn(process.env.AzureWebJobsStorage);
const TABLE = 'accounts';
const VER = '2019-02-02';
const BASE = () => `https://${CONN.account}.table.core.windows.net`;
// session-token secret derived from the storage key (secret, stable, no extra config)
const SECRET = crypto.createHash('sha256').update((CONN.key || 'x') + '::rr-acct-v1').digest();
const PBKDF2_ITER = 210000;

function authHeader(dateStr, canonResource) {
  const sts = dateStr + '\n' + canonResource;
  const sig = crypto.createHmac('sha256', Buffer.from(CONN.key, 'base64')).update(sts, 'utf8').digest('base64');
  return `SharedKeyLite ${CONN.account}:${sig}`;
}
async function tbl(method, path, query, body) {
  const date = new Date().toUTCString();
  const headers = { 'x-ms-date': date, 'x-ms-version': VER, 'Authorization': authHeader(date, `/${CONN.account}${path}`), 'Accept': 'application/json;odata=nometadata' };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(BASE() + path + (query || ''), { method, headers, body: body ? JSON.stringify(body) : undefined });
}
async function ensureTable() { try { await tbl('POST', '/Tables', '', { TableName: TABLE }); } catch (e) {} }
const ekey = u => `/${TABLE}(PartitionKey='u',RowKey='${u}')`;
async function getAcct(u) { const r = await tbl('GET', ekey(u)); return r.status === 200 ? r.json() : null; }
async function putAcct(e) { await tbl('PUT', ekey(e.RowKey), '', e); }

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlJson(s) { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
function signToken(payload) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return h + '.' + p + '.' + sig;
}
function verifyToken(tok) {
  try {
    const [h, p, s] = String(tok).split('.');
    if (!h || !p || !s) return null;
    const exp = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
    const payload = b64urlJson(p);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}
function hashPw(pw, salt) { return crypto.pbkdf2Sync(String(pw), salt, PBKDF2_ITER, 32, 'sha256'); }
const cleanHandle = h => String(h || 'Player').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
const validUser = u => /^[a-z0-9_]{3,16}$/.test(u);
const capSave = s => { try { const j = JSON.stringify(s); return j.length > 60000 ? '' : j; } catch (e) { return ''; } };
const pub = a => ({ aid: a.aid, username: a.username, handle: a.handle, rating: a.rating || 1000 });

module.exports = async function (context, req) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  const done = (status, body) => { context.res = { status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body }; };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers: cors }; return; }
  if (!CONN.account || !CONN.key) return done(500, { error: 'storage not configured' });
  const body = req.body || {};
  const action = String(body.action || '');
  try {
    await ensureTable();
    const nowSec = Math.floor(Date.now() / 1000);
    const mkToken = a => signToken({ u: a.RowKey, aid: a.aid, iat: nowSec, exp: nowSec + 60 * 60 * 24 * 30 });

    if (action === 'signup') {
      const uname = String(body.username || '').toLowerCase();
      const pw = String(body.password || '');
      if (!validUser(uname)) return done(400, { error: 'username must be 3–16 chars: letters, numbers, underscore' });
      if (pw.length < 8 || pw.length > 128) return done(400, { error: 'password must be at least 8 characters' });
      if (await getAcct(uname)) return done(409, { error: 'that username is taken' });
      const salt = crypto.randomBytes(16);
      const a = { PartitionKey: 'u', RowKey: uname, username: String(body.username).slice(0, 16), aid: 'a' + crypto.randomBytes(6).toString('hex'),
        handle: cleanHandle(body.handle || body.username), salt: salt.toString('hex'), hash: hashPw(pw, salt).toString('hex'), iter: PBKDF2_ITER,
        rating: 1000, created: new Date().toISOString(), save: capSave(body.save) };
      await putAcct(a);
      return done(200, { token: mkToken(a), account: pub(a), save: body.save || null });
    }

    if (action === 'login') {
      const uname = String(body.username || '').toLowerCase();
      const pw = String(body.password || '');
      const a = await getAcct(uname);
      const bad = { error: 'wrong username or password' };
      if (!a) { hashPw(pw, crypto.randomBytes(16)); return done(401, bad); }   // spend time anyway (reduce timing signal)
      const got = hashPw(pw, Buffer.from(a.salt, 'hex'));
      const exp = Buffer.from(a.hash, 'hex');
      if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return done(401, bad);
      let save = null; try { save = a.save ? JSON.parse(a.save) : null; } catch (e) {}
      return done(200, { token: mkToken(a), account: pub(a), save });
    }

    // token-protected actions
    const payload = verifyToken(body.token);
    if (!payload) return done(401, { error: 'session expired — sign in again' });
    const a = await getAcct(payload.u);
    if (!a || a.aid !== payload.aid) return done(401, { error: 'account not found' });

    if (action === 'me') {
      let save = null; try { save = a.save ? JSON.parse(a.save) : null; } catch (e) {}
      return done(200, { account: pub(a), save });
    }
    if (action === 'save') {
      a.save = capSave(body.save);
      if (body.handle) a.handle = cleanHandle(body.handle);
      await putAcct(a);
      return done(200, { ok: true, account: pub(a) });
    }
    return done(400, { error: 'unknown action' });
  } catch (e) {
    return done(500, { error: String(e && e.message || e) });
  }
};
