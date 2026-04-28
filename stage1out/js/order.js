// ============================================================
//  js/order.js — Voice Acting Team — Страница заказа
// ============================================================

import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { showToast } from './core.js';
import { checkAndAwardAch } from './achievements.js';

const TG_FREE_USER = 'VoiceActingTeam1';
const TG_PAID_USER = 'VoiceActingTeam1';

window.selectOrderType = (type) => {
    document.getElementById('order-type-grid').style.display = 'none';
    if (type === 'free') {
        document.getElementById('order-free-form').style.display = 'block';
        document.getElementById('order-paid-form').style.display = 'none';
    } else {
        document.getElementById('order-free-form').style.display = 'none';
        document.getElementById('order-paid-form').style.display = 'block';
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
    const type       = document.getElementById('ord-paid-type')?.value || '';
    const episodes   = parseInt(document.getElementById('ord-paid-episodes')?.value) || 1;
    const duration   = parseInt(document.getElementById('ord-paid-duration')?.value) || 24;
    const popularity = document.getElementById('ord-paid-popularity')?.value || 'unknown';
    const quality    = document.getElementById('ord-paid-quality')?.value || 'medium';
    const year       = parseInt(document.getElementById('ord-paid-year')?.value) || new Date().getFullYear();
    const priceEl    = document.getElementById('order-price-value');

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
    const min   = Math.max(500,  Math.round(price * 0.85 / 500) * 500);
    const max   = Math.round(price * 1.2  / 500) * 500;

    if (priceEl) priceEl.textContent = min.toLocaleString('ru') + ' – ' + max.toLocaleString('ru') + ' ₽';
};

async function doSubmitFree(db, auth, getState) {
    const title  = document.getElementById('ord-free-title')?.value.trim();
    const type   = document.getElementById('ord-free-type')?.value;
    const link   = document.getElementById('ord-free-link')?.value.trim() || '';
    const reason = document.getElementById('ord-free-reason')?.value.trim();
    if (!title || !type || !reason) return showToast('Заполните обязательные поля!', 'error');

    const { userData } = getState ? getState() : {};
    const senderName  = userData?.nickname || document.getElementById('ord-free-name')?.value.trim() || 'Аноним';

    try {
        await addDoc(collection(db, 'suggestions'), {
            title, type, link, reason, senderName,
            uid: auth?.currentUser?.uid || null,
            date: Date.now(), status: 'new'
        });
    } catch(e) { console.warn('Firestore suggestion:', e); }

    const msg = [
        '📬 Бесплатное предложение озвучки — Voice Acting Team',
        '',
        'Название: ' + title,
        'Тип: ' + type,
        link   ? 'Ссылка: ' + link    : '',
        'Почему: ' + reason,
        '',
        'От: ' + senderName,
    ].filter(Boolean).join('\n');

    window.open('https://t.me/' + TG_FREE_USER + '?text=' + encodeURIComponent(msg), '_blank');
    showToast('Открываем Telegram... Спасибо! 🎉', 'success');

    if (userData && auth) {
        await checkAndAwardAch(db, auth, userData, 'suggest_1');
    }

    ['ord-free-title','ord-free-link','ord-free-reason','ord-free-name','ord-free-email'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    window.backToOrderType();
}

window.submitPaidOrder = () => {
    const title    = document.getElementById('ord-paid-title')?.value.trim();
    const type     = document.getElementById('ord-paid-type')?.value;
    const genre    = document.getElementById('ord-paid-genre')?.value.trim();
    const year     = document.getElementById('ord-paid-year')?.value;
    const episodes = document.getElementById('ord-paid-episodes')?.value;
    const duration = document.getElementById('ord-paid-duration')?.value;
    const pop      = document.getElementById('ord-paid-popularity')?.value;
    const qual     = document.getElementById('ord-paid-quality')?.value;
    const link     = document.getElementById('ord-paid-link')?.value.trim();
    const notes    = document.getElementById('ord-paid-notes')?.value.trim();
    const priceEl  = document.getElementById('order-price-value');

    if (!title || !type) return showToast('Укажите название и тип!', 'error');

    const pLabel = { unknown:'Малоизвестный', medium:'Средняя аудитория', popular:'Популярный', top:'Топ/Легенда' };
    const qLabel = { low:'Низкое SD', medium:'Среднее HD', high:'Высокое FHD', ultra:'Ультра 4K' };

    const parts = [
        '💎 Платный заказ озвучки — Voice Acting Team',
        '',
        'Название: '   + title,
        'Тип: '        + type,
        genre    ? 'Жанр: '     + genre                            : null,
        year     ? 'Год: '      + year                             : null,
        episodes ? 'Серий: '    + episodes                         : null,
        duration ? 'Длит/эп: '  + duration + ' мин'               : null,
        'Популярность: ' + (pLabel[pop]  || pop  || '—'),
        'Качество: '     + (qLabel[qual] || qual || '—'),
        link  ? 'Ссылка: '    + link  : null,
        notes ? 'Пожелания: ' + notes : null,
        '',
        priceEl?.textContent ? 'Ориент. стоимость: ' + priceEl.textContent : null,
    ].filter(Boolean).join('\n');

    window.open('https://t.me/' + TG_PAID_USER + '?text=' + encodeURIComponent(parts), '_blank');
    showToast('Открываем Telegram...', 'info');
};

export function bindOrder(db, auth, getState) {
    window.submitFreeOrder = () => doSubmitFree(db, auth, getState);
}
