// ============================================================
//  worker/src/index.js — Приём платежей Robokassa (Cloudflare Worker)
//
//  Маршруты:
//   POST /create-payment   { email, pack }  -> { url }
//        Покупка НЕ требует входа в аккаунт — только почта. Берёт цену
//        пакета ТОЛЬКО из серверной таблицы (STARS_PACKS), возвращает
//        ссылку на оплату Robokassa.
//   POST /robokassa/result  — ResultURL, вызывается сервером Robokassa
//        после успешной оплаты. Проверяет подпись, создаёт одноразовый
//        промокод в той же коллекции promoCodes, что уже использует
//        сайт, и отправляет его письмом на почту покупателя. Отвечает
//        "OK{InvId}" (формат, который требует Robokassa).
//   GET  /robokassa/success, /robokassa/fail — SuccessURL/FailURL,
//        сюда Robokassa перенаправляет БРАУЗЕР пользователя — просто
//        отправляем его обратно в магазин с пометкой в адресе.
// ============================================================
import { buildPaymentUrl, verifyResultSignature, STARS_PACKS } from './robokassa.js';
import { getDoc, setDoc } from './firestore.js';
import { generatePromoCode } from './promocode.js';
import { sendPromoCodeEmail } from './email.js';

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleCreatePayment(req, env) {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'bad_request' }, 400); }

    const { email, pack } = body || {};
    if (!email || !pack) return json({ error: 'missing_fields' }, 400);
    if (!EMAIL_RE.test(String(email))) return json({ error: 'invalid_email' }, 400);
    if (!STARS_PACKS[String(pack)]) return json({ error: 'unknown_pack' }, 400);

    try {
        const url = buildPaymentUrl(env, { pack, email, isTest: env.ROBOKASSA_TEST_MODE === '1' });
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

    const pack   = shp.pack;
    const email  = shp.email;
    const amount = STARS_PACKS[pack];
    if (!amount) {
        console.warn('Robokassa: unknown pack in Shp_', pack, invId);
        return new Response('bad pack', { status: 400 });
    }

    // Идемпотентность — если этот InvId уже обработан, не создаём код и не
    // отправляем письмо повторно, но всё равно отвечаем "OK" (Robokassa
    // может повторять запрос).
    const markerPath = `processedPayments/robokassa_${invId}`;
    const already = await getDoc(env, markerPath);
    if (!already) {
        const code = generatePromoCode();
        await setDoc(env, `promoCodes/${code}`, {
            amount, maxUses: 1, usedBy: [], active: true, createdAt: Date.now(),
        });
        await setDoc(env, markerPath, {
            email, pack, amount, outSum, code, provider: 'robokassa', at: Date.now(),
        });
        try {
            await sendPromoCodeEmail(env, { toEmail: email, code, amount, price: outSum, pack });
        } catch(e) {
            // Код уже создан и отмечен обработанным — если письмо не ушло,
            // это видно в wrangler tail, код можно выдать вручную из лога.
            console.error('Не удалось отправить письмо с промокодом:', e.message, code, email);
        }
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
