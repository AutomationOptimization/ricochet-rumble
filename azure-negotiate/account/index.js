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
// Azure Communication Services Email (for verification codes)
function parseAcs(conn) { const o = {}; String(conn || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim(); }); return { endpoint: o.endpoint || '', key: o.accesskey || '' }; }
const ACS = parseAcs(process.env.ACS_CONN);
const ACS_FROM = process.env.ACS_FROM || '';
const emailHash = e => crypto.createHash('sha256').update(String(e).toLowerCase()).digest('hex');
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
function maskEmail(e) { const [l, d] = String(e || '').split('@'); if (!d) return ''; return (l.length <= 2 ? (l[0] || '') : l.slice(0, 2)) + '***@' + d; }
async function sendCode(to, code) {
  if (!ACS.endpoint || !ACS.key || !ACS_FROM) return false;
  try {
    const url = new URL(ACS.endpoint.replace(/\/$/, '') + '/emails:send?api-version=2023-03-31');
    const subject = 'Your Ricochet Rumble code: ' + code;
    const plain = `Your Ricochet Rumble verification code is ${code}\n\nEnter it in the game to confirm your email and unlock ranked. It expires in 20 minutes.\nIf you didn't sign up, you can ignore this email.`;
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:440px"><h2 style="color:#ff2d55;margin:0 0 4px">RICOCHET RUMBLE</h2><p>Your verification code is:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px;color:#0a0e1a;background:#ffcf3f;display:inline-block;padding:8px 18px;border-radius:6px">${code}</p><p>Enter it in the game to confirm your email and unlock <b>ranked</b>. Expires in 20 minutes.</p><p style="color:#888;font-size:12px">If you didn't sign up, ignore this email.</p></div>`;
    const body = JSON.stringify({ senderAddress: ACS_FROM, recipients: { to: [{ address: to }] }, content: { subject, plainText: plain, html } });
    const contentHash = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
    const date = new Date().toUTCString();
    const sts = `POST\n${url.pathname}${url.search}\n${date};${url.host};${contentHash}`;
    const sig = crypto.createHmac('sha256', Buffer.from(ACS.key, 'base64')).update(sts, 'utf8').digest('base64');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ms-date': date, 'x-ms-content-sha256': contentHash, 'Authorization': `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`, 'Operation-Id': crypto.randomUUID() }, body });
    return res.status === 202;
  } catch (e) { return false; }
}

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
async function putAcct(e) { await tbl('PUT', `/${TABLE}(PartitionKey='${e.PartitionKey || 'u'}',RowKey='${e.RowKey}')`, '', e); }

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
const pub = a => ({ aid: a.aid, username: a.username, handle: a.handle, rating: a.rating || 1000,
  verified: a.verified === true || a.verified === 'true', email: a.email ? maskEmail(a.email) : '' });

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
      const email = String(body.email || '').trim();
      if (!validUser(uname)) return done(400, { error: 'username must be 3–16 chars: letters, numbers, underscore' });
      if (pw.length < 8 || pw.length > 128) return done(400, { error: 'password must be at least 8 characters' });
      if (!validEmail(email)) return done(400, { error: 'enter a valid email address' });
      if (await getAcct(uname)) return done(409, { error: 'that username is taken' });
      const eh = emailHash(email);
      const idxRow = await tbl('GET', `/${TABLE}(PartitionKey='e',RowKey='${eh}')`);   // one-account-per-email index
      if (idxRow.status === 200) return done(409, { error: 'that email already has an account' });
      const salt = crypto.randomBytes(16);
      const code = genCode();
      const a = { PartitionKey: 'u', RowKey: uname, username: String(body.username).slice(0, 16), aid: 'a' + crypto.randomBytes(6).toString('hex'),
        handle: cleanHandle(body.handle || body.username), salt: salt.toString('hex'), hash: hashPw(pw, salt).toString('hex'), iter: PBKDF2_ITER,
        email, verified: false, vcode: code, vexp: nowSec + 1200, vsent: nowSec,
        rating: 1000, created: new Date().toISOString(), save: capSave(body.save) };
      await putAcct(a);
      await putAcct({ PartitionKey: 'e', RowKey: eh, username: uname });   // one account per email
      const sent = await sendCode(email, code);
      return done(200, { token: mkToken(a), account: pub(a), save: body.save || null, emailSent: sent });
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
    if (action === 'confirm') {
      if (a.verified === true || a.verified === 'true') return done(200, { ok: true, account: pub(a) });
      const code = String(body.code || '').trim();
      if (!a.vcode || !code || code !== String(a.vcode)) return done(400, { error: 'that code is wrong' });
      if (a.vexp && a.vexp < nowSec) return done(400, { error: 'that code expired — send a new one' });
      a.verified = true; a.vcode = ''; await putAcct(a);
      return done(200, { ok: true, account: pub(a) });
    }
    if (action === 'resend') {
      if (a.verified === true || a.verified === 'true') return done(200, { ok: true, account: pub(a) });
      if (!a.email) return done(400, { error: 'no email on file' });
      if (a.vsent && (nowSec - a.vsent) < 30) return done(429, { error: 'hold on — wait a moment before resending' });
      a.vcode = genCode(); a.vexp = nowSec + 1200; a.vsent = nowSec; await putAcct(a);
      const sent = await sendCode(a.email, a.vcode);
      return done(200, { ok: sent, account: pub(a) });
    }
    return done(400, { error: 'unknown action' });
  } catch (e) {
    return done(500, { error: String(e && e.message || e) });
  }
};
