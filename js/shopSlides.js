// ============================================================
//  js/shopSlides.js — Промо-слайды (карусель) на странице магазина
//  Не путать с js/banners.js (маленькая плашка "сейчас на сайте" в углу) —
//  это отдельная сущность, отдельная коллекция Firestore.
// ============================================================

import {
    collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js?v=20260906e';

let _db, _auth, _getState;
let _slides = [];
let _curIdx = 0;
let _rotateTimer = null;

// ── Слайды по умолчанию (переносятся в Firestore один раз, при первом заходе) ──
const SEED_SLIDES = [
    {
        eyebrow: 'Донат', title: 'Пакеты Старс — от 85 ₽',
        desc: 'Пополни баланс и открывай премиум-ящики с эксклюзивными предметами.',
        icon: 'fa-star', colorFrom: '#3b0764', colorTo: '#a78bfa',
        cta: 'Открыть Донат', target: 'donate', order: 0, active: true,
    },
    {
        eyebrow: 'Новинка', title: 'Легендарный ящик пополнился',
        desc: 'Новые карточки участников студии — шанс на легендарную редкость выше.',
        icon: 'fa-box-open', colorFrom: '#7c2d12', colorTo: '#fbbf24',
        cta: 'В Ящики', target: 'lootbox', order: 1, active: true,
    },
    {
        eyebrow: 'Топ недели', title: 'Стань первым в топе по играм',
        desc: 'Побеждай в мини-играх и попади в еженедельный рейтинг студии.',
        icon: 'fa-trophy', colorFrom: '#042f2e', colorTo: '#5eead4',
        cta: 'Смотреть топы', target: 'tops', order: 2, active: true,
    },
];

async function loadShopSlides() {
    try {
        const snap = await getDocs(collection(_db, 'shopSlides'));
        if (snap.empty) {
            // Сохраняем сид-слайды и используем НАСТОЯЩИЕ id документов —
            // раньше тут возвращались фейковые локальные id ('seed_0' и т.п.),
            // которые не совпадали ни с чем в базе: редактирование такого
            // слайда создавало дубликат вместо обновления, а удаление было
            // заблокировано вовсе.
            const seeded = [];
            for (const s of SEED_SLIDES) {
                const ref = await addDoc(collection(_db, 'shopSlides'), s);
                seeded.push({ id: ref.id, ...s });
            }
            return seeded.sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.active !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch(e) {
        console.warn('loadShopSlides:', e);
        return [];
    }
}

function goToSlideTarget(target) {
    if (target === 'lootbox' || target === 'games') { window.navigate?.(target); return; }
    const acc = document.querySelector(`.acc[data-cat="${target}"]`);
    if (!acc) return;
    if (!acc.classList.contains('open')) {
        const head = acc.querySelector('.art-head');
        if (head) window.toggleShopAcc?.(head);
    }
    acc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderShopSlides(container, isAdmin) {
    if (!container) return;
    _slides = await loadShopSlides();
    _curIdx = 0;

    if (!_slides.length) {
        container.innerHTML = isAdmin
            ? `<div class="shop-hero shop-hero--empty" onclick="openSlideModal()"><i class="fas fa-plus"></i> Добавить промо-слайд</div>`
            : '';
        return;
    }

    container.innerHTML = `
        <div class="hero-glow"><span></span><span></span><span></span></div>
        <div class="hero-track" id="shop-hero-track"></div>
        <div class="hero-sheen"></div>
        <button class="hero-arrow prev" onclick="shiftShopSlide(-1)"><i class="fas fa-chevron-left"></i></button>
        <button class="hero-arrow next" onclick="shiftShopSlide(1)"><i class="fas fa-chevron-right"></i></button>
        <div class="hero-dots" id="shop-hero-dots"></div>
        ${isAdmin ? `<div class="hero-admin">
            <button class="add" onclick="openSlideModal()" title="Добавить слайд"><i class="fas fa-plus"></i></button>
            <button onclick="openSlideModal(_shopSlideCurrentId())" title="Редактировать текущий"><i class="fas fa-pen"></i></button>
            <button onclick="deleteShopSlide(_shopSlideCurrentId())" title="Удалить текущий"><i class="fas fa-trash"></i></button>
        </div>` : ''}`;

    const track = document.getElementById('shop-hero-track');
    track.innerHTML = _slides.map(s => `
        <div class="hero-slide" style="--slide-from:${esc(s.colorFrom || '#3b0764')};--slide-to:${esc(s.colorTo || '#a78bfa')};" onclick="_shopSlideClick(event,'${esc(s.target || 'donate')}')">
            <div class="hero-icon"><i class="fas ${esc(s.icon || 'fa-star')}"></i></div>
            <div class="hero-copy">
                <div class="hero-eyebrow">${esc(s.eyebrow || '')}</div>
                <div class="hero-title">${esc(s.title || '')}</div>
                <div class="hero-desc">${esc(s.desc || '')}</div>
                <div class="hero-cta">${esc(s.cta || 'Подробнее')} <i class="fas fa-arrow-right"></i></div>
            </div>
        </div>`).join('');

    document.getElementById('shop-hero-dots').innerHTML = _slides.map((_, i) =>
        `<button class="hero-dot ${i === 0 ? 'active' : ''}" onclick="_shopSlideGoto(${i})"></button>`).join('');

    startShopSlideAuto();
    container.onmouseenter = () => clearInterval(_rotateTimer);
    container.onmouseleave = startShopSlideAuto;
}

function renderShopSlidePosition() {
    const track = document.getElementById('shop-hero-track');
    if (track) track.style.transform = `translateX(-${_curIdx * 100}%)`;
    document.querySelectorAll('#shop-hero-dots .hero-dot').forEach((d, i) => d.classList.toggle('active', i === _curIdx));
}
function startShopSlideAuto() {
    clearInterval(_rotateTimer);
    if (_slides.length < 2) return;
    _rotateTimer = setInterval(() => { _curIdx = (_curIdx + 1) % _slides.length; renderShopSlidePosition(); }, 5000);
}

window.shiftShopSlide = function(dir) {
    if (!_slides.length) return;
    _curIdx = (_curIdx + dir + _slides.length) % _slides.length;
    renderShopSlidePosition();
    startShopSlideAuto();
};
window._shopSlideGoto = function(i) {
    _curIdx = i;
    renderShopSlidePosition();
    startShopSlideAuto();
};
window._shopSlideClick = function(e, target) {
    goToSlideTarget(target);
};
window._shopSlideCurrentId = function() {
    return _slides[_curIdx]?.id;
};

// ── Админка: создание / редактирование / удаление слайда ──
window.openSlideModal = function(id) {
    const s = id ? _slides.find(x => x.id === id) : null;
    document.getElementById('sl-id').value       = id || '';
    document.getElementById('sl-eyebrow').value  = s?.eyebrow || '';
    document.getElementById('sl-title').value    = s?.title   || '';
    document.getElementById('sl-desc').value     = s?.desc    || '';
    document.getElementById('sl-icon').value     = (s?.icon || 'fa-star').replace(/^fa-/, '');
    document.getElementById('sl-target').value   = s?.target  || 'donate';
    document.getElementById('sl-color-from').value = s?.colorFrom || '#3b0764';
    document.getElementById('sl-color-to').value    = s?.colorTo   || '#a78bfa';
    document.getElementById('sl-cta').value      = s?.cta     || '';
    document.getElementById('sl-order').value    = s?.order ?? _slides.length;
    document.getElementById('sl-active').checked = s ? s.active !== false : true;
    document.getElementById('m-slide-form').style.display = 'flex';
};

window.saveShopSlide = async function() {
    const { isAdmin } = _getState();
    if (!isAdmin) return showToast('Нет прав', 'error');
    const id = document.getElementById('sl-id').value;
    const iconRaw = document.getElementById('sl-icon').value.trim() || 'star';
    const data = {
        eyebrow:   document.getElementById('sl-eyebrow').value.trim(),
        title:     document.getElementById('sl-title').value.trim(),
        desc:      document.getElementById('sl-desc').value.trim(),
        icon:      'fa-' + iconRaw.replace(/^fa-/, ''),
        target:    document.getElementById('sl-target').value,
        colorFrom: document.getElementById('sl-color-from').value,
        colorTo:   document.getElementById('sl-color-to').value,
        cta:       document.getElementById('sl-cta').value.trim() || 'Подробнее',
        order:     parseInt(document.getElementById('sl-order').value) || 0,
        active:    document.getElementById('sl-active').checked,
    };
    if (!data.title) return showToast('Введите заголовок слайда', 'error');
    try {
        if (id) await updateDoc(doc(_db, 'shopSlides', id), data);
        else    await addDoc(collection(_db, 'shopSlides'), data);
        showToast('Слайд сохранён!');
        document.getElementById('m-slide-form').style.display = 'none';
        await renderShopSlides(document.getElementById('shop-hero'), true);
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
};

window.deleteShopSlide = async function(id) {
    const { isAdmin } = _getState();
    if (!isAdmin || !id) return;
    if (!confirm('Удалить этот слайд?')) return;
    try {
        await deleteDoc(doc(_db, 'shopSlides', id));
        await renderShopSlides(document.getElementById('shop-hero'), true);
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
};

export function bindShopSlides(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.renderShopSlides = renderShopSlides;
}
