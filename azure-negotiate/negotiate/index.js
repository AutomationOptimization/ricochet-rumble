'use strict';
// Mints a short-lived Azure Web PubSub client access URL for the Ricochet Rumble lobby.
// Pure Node crypto — no npm dependencies, so nothing to install on deploy.
const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload, key) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', key).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return data + '.' + sig;
}
function parseConn(conn) {
  const out = {};
  String(conn || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  });
  return { endpoint: (out.endpoint || '').replace(/\/+$/, ''), key: out.accesskey || '' };
}

module.exports = async function (context, req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers: cors }; return; }

  const { endpoint, key } = parseConn(process.env.WPS_CONN);
  if (!endpoint || !key) {
    context.res = { status: 500, headers: cors, body: { error: 'lobby not configured' } };
    return;
  }
  const hub = String((req.query && req.query.hub) || 'lobby').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'lobby';
  const audience = endpoint + '/client/hubs/' + hub;
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({
    aud: audience,
    iat: now,
    exp: now + 3600,
    role: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup']
  }, key);

  context.res = {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors),
    body: { url: audience.replace(/^http/, 'ws') + '?access_token=' + token }
  };
};
