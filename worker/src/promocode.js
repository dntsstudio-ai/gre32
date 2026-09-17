// ============================================================
//  worker/src/promocode.js — Генерация одноразового промокода
//  в той же схеме, что уже использует сайт (js/vcoins.js):
//  promoCodes/{code} = { amount, maxUses, usedBy: [], active, createdAt }
// ============================================================

// Без 0/O/1/I/L — чтобы код легко было прочитать и ввести вручную.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generatePromoCode() {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    let code = 'VAT-';
    for (let i = 0; i < bytes.length; i++) {
        code += ALPHABET[bytes[i] % ALPHABET.length];
        if (i === 4) code += '-';
    }
    return code;
}
