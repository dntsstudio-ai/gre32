// ============================================================
//  worker/src/robokassa.js — Ссылка на оплату + проверка подписи
//  ResultURL (вебхука) от Robokassa.
//
//  Как это устроено:
//  - Цены заданы здесь, на сервере — клиент передаёт только размер
//    пакета ("100"/"300"/...), сумму в рублях мы всегда берём из
//    STARS_PACKS, а не из запроса, иначе можно было бы подделать сумму.
//  - Кто покупает и что покупает передаём через Shp_-параметры
//    Robokassa — они попадают в подпись, поэтому подделать их без
//    знания Пароля#2 нельзя. Отдельная запись "заказа" в Firestore
//    не нужна.
// ============================================================
import { md5 } from './md5.js';

export const STARS_PACKS = {
    '100':  85,
    '300':  255,
    '500':  425,
    '1000': 850,
};

function generateInvId() {
    // Достаточно широкий диапазон, чтобы коллизии были статистически
    // невозможны при разумных объёмах платежей; и даже при коллизии
    // единственное следствие — платёж один раз посчитают "уже обработанным"
    // (безопасное направление ошибки, а не повторное начисление).
    return Math.floor(Math.random() * 2000000000);
}

// Shp_-параметры сортируются по алфавиту и подпись, и в самой ссылке
function buildShpString(shp) {
    return Object.keys(shp).sort().map(k => `Shp_${k}=${shp[k]}`).join(':');
}

export function buildPaymentUrl(env, { pack, uid, isTest }) {
    const price = STARS_PACKS[String(pack)];
    if (!price) throw new Error('Неизвестный пакет Старс: ' + pack);

    const outSum = price.toFixed(2);
    const invId  = generateInvId();
    const shp    = { pack: String(pack), uid: String(uid) };
    const shpStr = buildShpString(shp);

    const sigBase = `${env.ROBOKASSA_MERCHANT_LOGIN}:${outSum}:${invId}:${env.ROBOKASSA_PASSWORD1}:${shpStr}`;
    const signature = md5(sigBase);

    const params = new URLSearchParams({
        MerchantLogin: env.ROBOKASSA_MERCHANT_LOGIN,
        OutSum: outSum,
        InvId: String(invId),
        Description: `Пополнение Старс: ${pack} шт.`,
        SignatureValue: signature,
        Culture: 'ru',
    });
    for (const k of Object.keys(shp).sort()) params.set(`Shp_${k}`, shp[k]);
    if (isTest) params.set('IsTest', '1');

    return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}

// ── Проверка подписи входящего ResultURL-запроса от Robokassa ──
export function verifyResultSignature(env, params) {
    const outSum    = params.get('OutSum');
    const invId     = params.get('InvId');
    const signature = (params.get('SignatureValue') || '').toLowerCase();

    const shp = {};
    for (const [k, v] of params.entries()) {
        if (k.startsWith('Shp_')) shp[k.slice(4)] = v;
    }
    const shpStr = buildShpString(shp);

    const sigBase = `${outSum}:${invId}:${env.ROBOKASSA_PASSWORD2}${shpStr ? ':' + shpStr : ''}`;
    const expected = md5(sigBase);

    return {
        ok: expected.toLowerCase() === signature,
        outSum, invId, shp,
    };
}
