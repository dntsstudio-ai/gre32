// ============================================================
//  worker/src/email.js — Отправка письма с промокодом через EmailJS
//  REST API (https://api.emailjs.com/api/v1.0/email/send).
//
//  EmailJS обычно работает из браузера, но у него есть обычный HTTP
//  API, который можно звать и с сервера (Cloudflare Worker), если:
//  1) в личном кабинете EmailJS включены запросы не из браузера
//     (Account -> Security -> "Allow API calls from non-browser
//     applications" — переключить в ON), и/или
//  2) передавать приватный ключ (accessToken) — он не связан с
//     проверкой Origin, поэтому надёжнее. Взять его в EmailJS:
//     Account -> API Keys -> Private Key.
//
//  Шаблон в EmailJS должен использовать переменные:
//    to_email, code, amount, price, pack
// ============================================================

export async function sendPromoCodeEmail(env, { toEmail, code, amount, price, pack }) {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_STARSCODE,
            user_id: env.EMAILJS_PUBLIC_KEY,
            accessToken: env.EMAILJS_PRIVATE_KEY,
            template_params: {
                to_email: toEmail,
                code, amount, price, pack,
            },
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`EmailJS ответил ${res.status}: ${text}`);
    }
}
