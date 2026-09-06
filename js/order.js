// ============================================================
//  js/order.js — Voice Acting Team — Страница заказа
// ============================================================

import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { showToast } from './core.js?v=20260906b';
import { checkAndAwardAch } from './achievements.js?v=20260906b';

const TG_USER = 'Miki_angel22';

window.selectOrderType = (type) => {
    const grid = document.getElementById('order-type-grid');
    const free = document.getElementById('order-free-form');
    const paid = document.getElementById('order-paid-form');
    if (grid) grid.style.display = 'none';
    if (type === 'free') {
        if (free) free.style.display = 'block';
        if (paid) paid.style.display = 'none';
    } else {
        if (free) free.style.display = 'none';
        if (paid) paid.style.display = 'block';
        window.calcOrderPrice();
    }
};

window.backToOrderType = () => {
    const grid = document.getElementById('order-type-grid');
    const free = document.getElementById('order-free-form');
    const paid = document.getElementById('order-paid-form');
    if (grid) grid.style.display = 'grid';
    if (free) free.style.display = 'none';
    if (paid) paid.style.display = 'none';
};

window.calcOrderPrice = () => {
    const get = (id) => document.getElementById(id);
    const type       = get('ord-paid-type')?.value       || '';
    const episodes   = parseInt(get('ord-paid-episodes')?.value) || 1;
    const duration   = parseInt(get('ord-paid-duration')?.value) || 24;
    const popularity = get('ord-paid-popularity')?.value || 'unknown';
    const quality    = get('ord-paid-quality')?.value    || 'medium';
    const year       = parseInt(get('ord-paid-year')?.value) || new Date().getFullYear();
    const priceEl    = get('order-price-value');

    if (!type) { if (priceEl) priceEl.textContent = '— ₽'; return; }

    let ppm = 100;
    ppm *= ({ 'Аниме':1.1, 'Сериал':1.0, 'Фильм':1.15, 'Мультфильм':0.9, 'Другое':1.0 }[type] || 1.0);
    ppm *= ({ low:0.85, medium:1.0, high:1.1, ultra:1.2 }[quality] || 1.0);
    ppm *= ({ unknown:0.85, medium:1.0, popular:1.1, top:1.25 }[popularity] || 1.0);
    const age = new Date().getFullYear() - year;
    if (age > 20) ppm *= 1.1; else if (age > 10) ppm *= 1.05;

    const totalMin = episodes * duration;
    const base  = Math.round(totalMin * ppm);
    const price = Math.max(500, Math.round(base / 500) * 500);
    const min   = Math.max(500, Math.round(price * 0.85 / 500) * 500);
    const max   = Math.round(price * 1.2 / 500) * 500;
    if (priceEl) priceEl.textContent = min.toLocaleString('ru') + ' – ' + max.toLocaleString('ru') + ' ₽';
};

async function doSubmitFree(db, auth, getState) {
    const title  = document.getElementById('ord-free-title')?.value.trim() || '';
    const type   = document.getElementById('ord-free-type')?.value         || '';
    const link   = document.getElementById('ord-free-link')?.value.trim()  || '';
    const reason = document.getElementById('ord-free-reason')?.value.trim()|| '';
    if (!title || !type || !reason) return showToast('Заполните обязательные поля!', 'error');

    const { userData } = getState ? getState() : {};
    const senderName = userData?.nickname || document.getElementById('ord-free-name')?.value.trim() || 'Аноним';

    try {
        await addDoc(collection(db, 'suggestions'), {
            title, type, link, reason, senderName,
            uid: auth?.currentUser?.uid || null,
            date: Date.now(), status: 'new'
        });
    } catch(e) { console.warn('Firestore suggestion:', e); }

    const msg = [
        '<i class="fas fa-envelope-open-text"></i> Бесплатное предложение озвучки — Voice Acting Team', '',
        'Название: ' + title, 'Тип: ' + type,
        link   ? 'Ссылка: ' + link    : '',
        'Почему: ' + reason, '',
        'От: ' + senderName,
    ].filter(Boolean).join('\n');

    window.open('https://t.me/' + TG_USER + '?text=' + encodeURIComponent(msg), '_blank');
    showToast('Открываем Telegram... Спасибо! <i class="fas fa-champagne-glasses"></i>');
    if (userData && auth) await checkAndAwardAch(db, auth, userData, 'suggest_1');

    ['ord-free-title','ord-free-link','ord-free-reason','ord-free-name','ord-free-email'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    window.backToOrderType();
}

window.submitPaidOrder = () => {
    const get = (id) => document.getElementById(id);
    const title    = get('ord-paid-title')?.value.trim() || '';
    const type     = get('ord-paid-type')?.value         || '';
    if (!title || !type) return showToast('Укажите название и тип!', 'error');

    const pLabel = { unknown:'Малоизвестный', medium:'Средняя аудитория', popular:'Популярный', top:'Топ/Легенда' };
    const qLabel = { low:'Низкое SD', medium:'Среднее HD', high:'Высокое FHD', ultra:'Ультра 4K' };
    const pop  = get('ord-paid-popularity')?.value || 'unknown';
    const qual = get('ord-paid-quality')?.value    || 'medium';

    const parts = [
        '<i class="fas fa-gem"></i> Платный заказ озвучки — Voice Acting Team', '',
        'Название: '   + title,
        'Тип: '        + type,
        get('ord-paid-genre')?.value    ? 'Жанр: '        + get('ord-paid-genre').value    : null,
        get('ord-paid-year')?.value     ? 'Год: '         + get('ord-paid-year').value      : null,
        get('ord-paid-episodes')?.value ? 'Серий: '       + get('ord-paid-episodes').value  : null,
        get('ord-paid-duration')?.value ? 'Длит/эп: '     + get('ord-paid-duration').value + ' мин' : null,
        'Популярность: ' + (pLabel[pop]  || pop  || '—'),
        'Качество: '     + (qLabel[qual] || qual || '—'),
        get('ord-paid-link')?.value  ? 'Ссылка: '    + get('ord-paid-link').value    : null,
        get('ord-paid-notes')?.value ? 'Пожелания: ' + get('ord-paid-notes').value   : null,
        '',
        get('order-price-value')?.textContent ? 'Ориент. стоимость: ' + get('order-price-value').textContent : null,
    ].filter(Boolean).join('\n');

    window.open('https://t.me/' + TG_USER + '?text=' + encodeURIComponent(parts), '_blank');
    showToast('Открываем Telegram...', 'info');
};

export function bindOrder(db, auth, getState) {
    window.submitFreeOrder = () => doSubmitFree(db, auth, getState);
}
