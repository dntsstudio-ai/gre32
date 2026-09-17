// ============================================================
//  worker/src/order.js — Заказы для DIY-оплаты через СБП по номеру
//  телефона + разбор SMS-уведомлений банка.
//
//  Идея: у каждого одновременно ожидающего оплату заказа — своя,
//  уникальная до копейки сумма (цена пакета + случайные копейки).
//  Это позволяет опознать, какой именно заказ оплачен, просто по
//  сумме из SMS — без ID заказа в платеже (человек переводит как в
//  обычном переводе другу, никаких доп. полей у СБП по номеру нет).
//
//  Сам номер документа в Firestore — сумма в копейках, поэтому для
//  поиска "кто оплатил вот эту сумму" достаточно getDoc по пути,
//  без отдельного индекса/запроса по коллекции.
// ============================================================
import { getDoc, setDoc } from './firestore.js';

export const ORDER_TTL_MS = 30 * 60 * 1000; // 30 минут на оплату, потом сумма освобождается

function toKopecks(rub) {
    return Math.round(rub * 100);
}

export function isOrderActive(order) {
    return !!order && order.status === 'pending' && (Date.now() - order.createdAt) < ORDER_TTL_MS;
}

export async function createPendingOrder(env, { email, pack, price }) {
    const baseKopecks = toKopecks(price);
    for (let attempt = 0; attempt < 40; attempt++) {
        const offsetKop = 1 + Math.floor(Math.random() * 98); // от 0.01 до 0.98 — чтобы сумма не была "круглой"
        const amountKopecks = baseKopecks + offsetKop;
        const path = `pendingOrders/${amountKopecks}`;
        const existing = await getDoc(env, path);
        if (isOrderActive(existing)) continue; // эта сумма занята другим свежим заказом — пробуем другую копейку

        await setDoc(env, path, { email, pack: String(pack), status: 'pending', createdAt: Date.now() });
        return { amountKopecks, amountRub: (amountKopecks / 100).toFixed(2) };
    }
    throw new Error('Не удалось подобрать свободную сумму для заказа, попробуйте ещё раз');
}
