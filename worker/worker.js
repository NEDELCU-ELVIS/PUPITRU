/**
 * PUPITRU — serviciu de notificări (Cloudflare Worker)
 * ---------------------------------------------------
 * Primește de pe telefon lista de memento-uri și le trimite ca notificări push
 * la ora potrivită, chiar dacă aplicația e închisă.
 *
 * Variabile necesare (Settings → Variables):
 *   VAPID_PUBLIC       — cheia publică (text)
 *   VAPID_PRIVATE_JWK  — cheia privată, JSON {kty,crv,d,x,y}  (Secret)
 *   VAPID_SUBJECT      — mailto:adresa@ta
 * Legătură KV:  PUSH_KV
 * Declanșator cron:  la fiecare 5 minute (vezi instrucțiunile de instalare)
 */

const enc = new TextEncoder();

/* ---------- utilitare base64url ---------- */
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ---------- HKDF (RFC 5869), folosit de RFC 8291 ---------- */
async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/* ---------- criptare payload aes128gcm (RFC 8188 + RFC 8291) ---------- */
export async function encryptPayload(plaintext, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // o singură înregistrare: text + delimitator 0x02
  const record = concat(enc.encode(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));

  // antet: salt(16) | rs(4) | idlen(1) | as_public(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* ---------- jeton VAPID (ES256) ---------- */
export async function vapidHeaders(endpoint, publicKey, privateJwk, subject) {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject
  })));
  const signingInput = enc.encode(header + '.' + payload);
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', d: privateJwk.d, x: privateJwk.x, y: privateJwk.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput));
  const jwt = header + '.' + payload + '.' + bytesToB64url(sig);
  return { Authorization: 'vapid t=' + jwt + ', k=' + publicKey };
}

/* ---------- trimiterea unei notificări ---------- */
export async function sendPush(sub, payloadObj, env) {
  const body = await encryptPayload(JSON.stringify(payloadObj), sub.keys.p256dh, sub.keys.auth);
  const privateJwk = typeof env.VAPID_PRIVATE_JWK === 'string' ? JSON.parse(env.VAPID_PRIVATE_JWK) : env.VAPID_PRIVATE_JWK;
  const vh = await vapidHeaders(sub.endpoint, env.VAPID_PUBLIC, privateJwk, env.VAPID_SUBJECT || 'mailto:admin@example.com');
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...vh,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body
  });
}

/* ---------- utilitare ---------- */
async function deviceKey(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return 'd:' + bytesToB64url(new Uint8Array(h)).slice(0, 24);
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/* ---------- API + cron ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'pupitru-push', vapidPublic: env.VAPID_PUBLIC || null });
    }

    if (url.pathname === '/api/sync' && request.method === 'POST') {
      const data = await request.json();
      if (!data.sub || !data.sub.endpoint || !data.sub.keys) return json({ error: 'subscription lipsă' }, 400);
      const key = await deviceKey(data.sub.endpoint);
      const prev = await env.PUSH_KV.get(key, 'json');
      const items = Array.isArray(data.items) ? data.items.slice(0, 200) : [];
      const rec = {
        sub: data.sub,
        items,
        sent: (prev && prev.sent ? prev.sent : []).filter(id => items.some(i => i.id === id)),
        updated: Date.now()
      };
      await env.PUSH_KV.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
      return json({ ok: true, stored: items.length });
    }

    if (url.pathname === '/api/test' && request.method === 'POST') {
      const data = await request.json();
      if (!data.sub) return json({ error: 'subscription lipsă' }, 400);
      const res = await sendPush(data.sub, {
        title: 'PUPITRU',
        body: 'Notificările funcționează. Serviciul e pornit.',
        tag: 'test',
        url: data.appUrl || '/'
      }, env);
      return json({ ok: res.ok, status: res.status });
    }

    /* raport: primește HTML-ul și îl servește ca pagină, ca să poată fi imprimat din Safari */
    if (url.pathname === '/api/report' && request.method === 'POST') {
      const data = await request.json();
      if (!data.html || typeof data.html !== 'string') return json({ error: 'raport lipsă' }, 400);
      if (data.html.length > 2000000) return json({ error: 'raport prea mare' }, 413);
      const id = bytesToB64url(crypto.getRandomValues(new Uint8Array(12)));
      await env.PUSH_KV.put('r:' + id, data.html, { expirationTtl: 60 * 60 * 6 });
      return json({ ok: true, url: url.origin + '/r/' + id });
    }

    if (url.pathname.startsWith('/r/') && request.method === 'GET') {
      const id = url.pathname.slice(3);
      const html = await env.PUSH_KV.get('r:' + id);
      if (!html) return new Response('Raportul a expirat. Generează-l din nou din aplicație.', {
        status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return new Response(html, { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }});
    }

    if (url.pathname === '/api/unsubscribe' && request.method === 'POST') {
      const data = await request.json();
      if (data.sub && data.sub.endpoint) await env.PUSH_KV.delete(await deviceKey(data.sub.endpoint));
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env));
  }
};

export async function runSchedule(env, now = Date.now()) {
  const list = await env.PUSH_KV.list({ prefix: 'd:' });
  let sentCount = 0;
  for (const k of list.keys) {
    const rec = await env.PUSH_KV.get(k.name, 'json');
    if (!rec || !rec.sub) continue;
    const due = (rec.items || []).filter(i =>
      i.at <= now && i.at > now - 6 * 3600 * 1000 && !(rec.sent || []).includes(i.id)
    ).sort((a, b) => a.at - b.at).slice(0, 3);   // cel mult 3 odată, fără avalanșă
    if (!due.length) continue;

    let drop = false;
    for (const item of due) {
      try {
        const res = await sendPush(rec.sub, {
          title: item.title, body: item.body, tag: item.tag || item.id,
          url: item.url || '/', badge: item.badge
        }, env);
        if (res.status === 404 || res.status === 410) { drop = true; break; }
        if (res.ok || res.status === 201) { rec.sent = (rec.sent || []).concat(item.id); sentCount++; }
      } catch (e) { /* reîncearcă la următoarea rulare */ }
    }
    if (drop) { await env.PUSH_KV.delete(k.name); continue; }
    rec.sent = (rec.sent || []).slice(-300);
    await env.PUSH_KV.put(k.name, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
  }
  return sentCount;
}
