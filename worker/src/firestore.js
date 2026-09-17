// ============================================================
//  worker/src/firestore.js — Минимальный REST-клиент Firestore
//  для Cloudflare Workers.
//
//  Здесь нет Node.js, поэтому обычный firebase-admin не подходит —
//  вместо него сами получаем access-токен сервисного аккаунта
//  Google (JWT, подписанный через Web Crypto) и ходим в Firestore
//  напрямую по REST API.
// ============================================================

let _cachedToken = null; // переживает несколько запросов в "тёплом" воркере, не гарантированно

function base64url(data) {
    const str = typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem) {
    const b64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

async function getAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);
    if (_cachedToken && _cachedToken.exp > now + 60) return _cachedToken.token;

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToDer(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const jwt = `${unsigned}.${base64url(sig)}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Firebase auth failed: ' + JSON.stringify(data));

    _cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return _cachedToken.token;
}

function fsDocUrl(env, path) {
    return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
}

function unwrapValue(v) {
    if (v == null) return null;
    if ('stringValue'  in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue'  in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('mapValue'     in v) return unwrapFields(v.mapValue.fields || {});
    return null;
}
function unwrapFields(fields) {
    const out = {};
    for (const k in fields) out[k] = unwrapValue(fields[k]);
    return out;
}
function wrapValue(v) {
    if (typeof v === 'string')  return { stringValue: v };
    if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (v && typeof v === 'object') return { mapValue: { fields: wrapFields(v) } };
    return { nullValue: null };
}
function wrapFields(obj) {
    const out = {};
    for (const k in obj) out[k] = wrapValue(obj[k]);
    return out;
}

// ── Прочитать документ. Возвращает null, если не существует ──
export async function getDoc(env, path) {
    const token = await getAccessToken(env);
    const res = await fetch(fsDocUrl(env, path), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore getDoc ${path}: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return unwrapFields(data.fields || {});
}

// ── Создать/полностью перезаписать документ по фиксированному пути.
//    Используем для меток идемпотентности (processedPayments/{invId}) ──
export async function setDoc(env, path, fields) {
    const token = await getAccessToken(env);
    const res = await fetch(fsDocUrl(env, path), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: wrapFields(fields) }),
    });
    if (!res.ok) throw new Error(`Firestore setDoc ${path}: ${res.status} ${await res.text()}`);
}

// ── Атомарно увеличить числовое поле документа (Firestore fieldTransform) ──
export async function incrementField(env, path, field, amount) {
    const token = await getAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`;
    const body = {
        writes: [{
            transform: {
                document: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,
                fieldTransforms: [{ fieldPath: field, increment: { integerValue: String(amount) } }],
            },
        }],
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Firestore incrementField ${path}.${field}: ${res.status} ${await res.text()}`);
}
