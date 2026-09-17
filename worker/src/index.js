// ============================================================
//  worker/src/index.js — Приём платежей Robokassa (Cloudflare Worker)
//
//  Маршруты:
//   POST /create-payment   { idToken, pack }  -> { url }
//        Проверяет Firebase ID-токен пользователя, берёт цену пакета
//        ТОЛЬКО из серверной таблицы (STARS_PACKS), возвращает ссылку
//        на оплату Robokassa.
//   POST /robokassa/result  — ResultURL, вызывается сервером Robokassa
//        после успешной оплаты. Проверяет подпись, начисляет Старс,
//        отвечает "OK{InvId}" (формат, который требует Robokassa).
//   GET  /robokassa/success, /robokassa/fail — SuccessURL/FailURL,
//        сюда Robokassa перенаправляет БРАУЗЕР пользователя — просто
//        отправляем его обратно в магазин с пометкой в адресе.
// ============================================================
import { buildPaymentUrl, verifyResultSignature, STARS_PACKS } from './robokassa.js';
import { getDoc, setDoc, incrementField } from './firestore.js';

const SITE_URL = 'https://voiceactingteam-dub.ru';
const ALLOWED_ORIGIN = SITE_URL;

function cors(res) {
    res.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return res;
}
function json(data, status = 200) {
    return cors(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

// ── Проверка Firebase ID-токена через REST (без firebase-admin) ──
async function verifyIdToken(env, idToken) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.users?.[0];
    return user ? user.localId : null;
}

async function handleCreatePayment(req, env) {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'bad_request' }, 400); }

    const { idToken, pack } = body || {};
    if (!idToken || !pack) return json({ error: 'missing_fields' }, 400);
    if (!STARS_PACKS[String(pack)]) return json({ error: 'unknown_pack' }, 400);

    const uid = await verifyIdToken(env, idToken);
    if (!uid) return json({ error: 'invalid_token' }, 401);

    try {
        const url = buildPaymentUrl(env, { pack, uid, isTest: env.ROBOKASSA_TEST_MODE === '1' });
        return json({ url });
    } catch(e) {
        return json({ error: 'internal', message: e.message }, 500);
    }
}

async function handleRobokassaResult(req, env) {
    const contentType = req.headers.get('content-type') || '';
    let params;
    if (contentType.includes('application/json')) {
        const body = await req.json();
        params = new URLSearchParams(body);
    } else {
        params = new URLSearchParams(await req.text());
    }

    const { ok, outSum, invId, shp } = verifyResultSignature(env, params);
    if (!ok) {
        console.warn('Robokassa: invalid signature', invId);
        return new Response('bad sign', { status: 400 });
    }

    const pack = shp.pack;
    const uid  = shp.uid;
    const amount = STARS_PACKS[pack];
    if (!amount) {
        console.warn('Robokassa: unknown pack in Shp_', pack, invId);
        return new Response('bad pack', { status: 400 });
    }

    // Идемпотентность — если этот InvId уже обработан, не начисляем повторно,
    // но всё равно отвечаем "OK" (Robokassa может повторять запрос).
    const markerPath = `processedPayments/robokassa_${invId}`;
    const already = await getDoc(env, markerPath);
    if (!already) {
        await incrementField(env, `users/${uid}`, 'vstars', amount);
        await incrementField(env, `users/${uid}`, 'totalStarsDonated', amount);
        await setDoc(env, markerPath, {
            uid, pack, amount, outSum, provider: 'robokassa', at: Date.now(),
        });
    }

    return new Response(`OK${invId}`);
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);

        if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

        if (url.pathname === '/create-payment' && req.method === 'POST') {
            return handleCreatePayment(req, env);
        }
        if (url.pathname === '/robokassa/result' && req.method === 'POST') {
            return handleRobokassaResult(req, env);
        }
        if (url.pathname === '/robokassa/success') {
            return Response.redirect(`${SITE_URL}/shop?stars=success`, 302);
        }
        if (url.pathname === '/robokassa/fail') {
            return Response.redirect(`${SITE_URL}/shop?stars=fail`, 302);
        }

        return new Response('Not found', { status: 404 });
    },
};
