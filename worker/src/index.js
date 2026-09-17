// ============================================================
//  worker/src/index.js — Приём платежей (Cloudflare Worker)
//
//  Действующая схема — DIY через СБП по номеру телефона + SMS банка:
//   POST /create-order    { email, pack } -> { ref, amountRub, recipient }
//        Заводит заказ с уникальной "до копейки" суммой (см. order.js),
//        не требует входа в аккаунт — только почта, куда прислать код.
//   GET  /order-status?ref=...  -> { status: pending|paid|expired|not_found }
//        Опрос статуса с сайта, пока человек переводит деньги.
//   POST /sms-webhook?secret=...  — сюда телефон-приёмник (приложение
//        типа MacroDroid) пересылает текст входящего SMS банка о
//        зачислении. Находим совпадающую по сумме ожидающую оплату,
//        создаём одноразовый промокод в promoCodes и шлём его письмом.
//
//  Оставлено как заготовка на будущее (сейчас не используется с сайта,
//  Robokassa отклонила подключение магазина) — тот же принцип
//  "промокод письмом", но через подпись провайдера, а не SMS:
//   POST /create-payment, POST /robokassa/result,
//   GET  /robokassa/success, /robokassa/fail
// ============================================================
import { buildPaymentUrl, verifyResultSignature, STARS_PACKS } from './robokassa.js';
import { getDoc, setDoc } from './firestore.js';
import { generatePromoCode } from './promocode.js';
import { sendPromoCodeEmail } from './email.js';
import { createPendingOrder, isOrderActive } from './order.js';
import { extractAmountCandidates } from './sms.js';

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

// ── DIY-оплата: СБП по номеру телефона + разбор SMS банка ──

async function handleCreateOrder(req, env) {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'bad_request' }, 400); }

    const { email, pack } = body || {};
    if (!email || !pack) return json({ error: 'missing_fields' }, 400);
    if (!EMAIL_RE.test(String(email))) return json({ error: 'invalid_email' }, 400);
    const price = STARS_PACKS[String(pack)];
    if (!price) return json({ error: 'unknown_pack' }, 400);

    try {
        const { amountKopecks, amountRub } = await createPendingOrder(env, { email, pack, price });
        return json({
            ref: String(amountKopecks),
            amountRub,
            recipient: {
                phone: env.PAYOUT_PHONE || '',
                bank:  env.PAYOUT_BANK_NAME || '',
                name:  env.PAYOUT_RECEIVER_NAME || '',
            },
        });
    } catch(e) {
        return json({ error: 'internal', message: e.message }, 500);
    }
}

async function handleOrderStatus(req, env, url) {
    const ref = url.searchParams.get('ref');
    if (!ref) return json({ error: 'missing_ref' }, 400);
    const order = await getDoc(env, `pendingOrders/${ref}`);
    if (!order) return json({ status: 'not_found' });
    if (order.status === 'pending' && !isOrderActive(order)) return json({ status: 'expired' });
    return json({ status: order.status });
}

async function handleSmsWebhook(req, env) {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret') || req.headers.get('x-webhook-secret');
    if (!secret || secret !== env.SMS_WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
    }

    let text = '';
    const contentType = req.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) {
            const body = await req.json();
            text = body.text || body.message || body.sms || '';
        } else {
            text = await req.text();
        }
    } catch(e) { return new Response('bad body', { status: 400 }); }

    const candidates = extractAmountCandidates(text);
    for (const amountRub of candidates) {
        const amountKopecks = Math.round(amountRub * 100);
        const path = `pendingOrders/${amountKopecks}`;
        const order = await getDoc(env, path);
        if (!isOrderActive(order)) continue;

        // Идемпотентность — если по этому заказу уже отправили код, не дублировать
        // (форвардер может прислать одно и то же SMS повторно).
        const marker = `processedPayments/sms_${amountKopecks}_${order.createdAt}`;
        const already = await getDoc(env, marker);
        if (already) continue;

        const amount = STARS_PACKS[order.pack];
        const code = generatePromoCode();
        await setDoc(env, `promoCodes/${code}`, {
            amount, maxUses: 1, usedBy: [], active: true, createdAt: Date.now(),
        });
        await setDoc(env, path, { ...order, status: 'paid', code });
        await setDoc(env, marker, {
            email: order.email, pack: order.pack, amount, amountRub, code, provider: 'sbp_sms', at: Date.now(),
        });
        try {
            await sendPromoCodeEmail(env, { toEmail: order.email, code, amount, price: amountRub, pack: order.pack });
        } catch(e) {
            console.error('SMS webhook: письмо не отправлено', e.message, code, order.email);
        }
        return new Response('matched ' + amountKopecks);
    }

    console.warn('SMS webhook: нет совпадений среди сумм', candidates, text);
    // 200, а не 4xx/5xx — чтобы форвардер на телефоне не считал это ошибкой
    // и не пытался бесконечно повторять доставку.
    return new Response('no match');
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

        if (url.pathname === '/create-order' && req.method === 'POST') {
            return handleCreateOrder(req, env);
        }
        if (url.pathname === '/order-status' && req.method === 'GET') {
            return handleOrderStatus(req, env, url);
        }
        if (url.pathname === '/sms-webhook' && req.method === 'POST') {
            return handleSmsWebhook(req, env);
        }

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
