// ============================================================
//  js/shopSlides.js — Промо-слайды (карусель) на странице магазина
//  Не путать с js/banners.js (маленькая плашка "сейчас на сайте" в углу) —
//  это отдельная сущность, отдельная коллекция Firestore.
// ============================================================

import {
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js?v=20260915h';

let _db, _auth, _getState;
let _slides = [];
let _curIdx = 0;
let _rotateTimer = null;
let _saving = false;   // защита от повторной отправки формы (двойной клик / медленная сеть)
let _lastIsAdmin = false;

// ── Слайды по умолчанию (создаются только по явной кнопке админа) ──
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

function sortSlides() {
    _slides.sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Только чтение — используется один раз, при заходе на страницу магазина.
// Все последующие изменения (создание/редактирование/удаление) правят
// локальный массив _slides и перерисовывают из него напрямую, БЕЗ повторного
// похода в Firestore — на нестабильной сети свежесозданный документ мог ещё
// не долететь до немедленного повторного чтения, из-за чего после "Слайд
// создан" карусель визуально не менялась.
async function loadShopSlides() {
    try {
        const snap = await getDocs(collection(_db, 'shopSlides'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false);
    } catch(e) {
        console.warn('loadShopSlides:', e);
        showToast('Не удалось загрузить промо-слайды: ' + e.message, 'error');
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

// ── Точка входа со страницы (единственное место, которое ходит в сеть) ──
async function renderShopSlides(container, isAdmin) {
    if (!container) return;
    _lastIsAdmin = isAdmin;
    _slides = await loadShopSlides();
    sortSlides();
    _curIdx = 0;
    paintShopSlides();
}

// ── Перерисовка из уже известного на клиенте состояния _slides (без сети) ──
function paintShopSlides() {
    const container = document.getElementById('shop-hero');
    if (!container) return;
    const isAdmin = _lastIsAdmin;

    if (!_slides.length) {
        container.innerHTML = isAdmin
            ? `<div class="shop-hero-empty">
                 <button onclick="openSlideModal()"><i class="fas fa-plus"></i> Добавить слайд</button>
                 <button onclick="seedDefaultShopSlides()"><i class="fas fa-wand-magic-sparkles"></i> Создать 3 стандартных</button>
               </div>`
            : '';
        return;
    }

    if (_curIdx >= _slides.length) _curIdx = 0;

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
            <button onclick="resetShopSlides()" title="Удалить ВСЕ слайды (очистка дублей)" style="background:rgba(239,68,68,0.75);"><i class="fas fa-broom"></i></button>
        </div>` : ''}`;

    const track = document.getElementById('shop-hero-track');
    if (track) {
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
    }

    const dots = document.getElementById('shop-hero-dots');
    if (dots) {
        dots.innerHTML = _slides.map((_, i) =>
            `<button class="hero-dot ${i === 0 ? 'active' : ''}" onclick="_shopSlideGoto(${i})"></button>`).join('');
    }

    renderShopSlidePosition();
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
    if (_saving) return; // уже идёт сохранение — игнорируем повторный клик
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

    const btn = document.querySelector('#m-slide-form .btn-purple');
    _saving = true;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
        if (id) {
            await updateDoc(doc(_db, 'shopSlides', id), data);
            const idx = _slides.findIndex(s => s.id === id);
            if (idx !== -1) _slides[idx] = { id, ...data };
            showToast('Слайд обновлён!');
        } else {
            const ref = await addDoc(collection(_db, 'shopSlides'), data);
            _slides.push({ id: ref.id, ...data });
            showToast('<i class="fas fa-circle-check"></i> Новый слайд создан!');
        }
        sortSlides();
        document.getElementById('m-slide-form').style.display = 'none';
        paintShopSlides();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally {
        _saving = false;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
};

// ── Явный разовый посев стандартных слайдов (только по кнопке админа) ──
window.seedDefaultShopSlides = async function() {
    const { isAdmin } = _getState();
    if (!isAdmin || _saving) return;
    _saving = true;
    try {
        for (const s of SEED_SLIDES) {
            const ref = await addDoc(collection(_db, 'shopSlides'), s);
            _slides.push({ id: ref.id, ...s });
        }
        sortSlides();
        paintShopSlides();
        showToast('<i class="fas fa-circle-check"></i> 3 стандартных слайда созданы');
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally { _saving = false; }
};

// ── Полная очистка: удалить ВСЕ документы коллекции (включая дубли).
//    Ручной "аварийный выход" для накопившегося мусора — без похода в Firebase
//    Console. После очистки ничего не пересеивается автоматически — на пустой
//    карусели появятся кнопки "Добавить слайд" / "Создать 3 стандартных".
window.resetShopSlides = async function() {
    const { isAdmin } = _getState();
    if (!isAdmin || _saving) return;
    if (!confirm('Удалить ВСЕ текущие слайды (включая созданные вручную)? Отменить нельзя.')) return;
    _saving = true;
    try {
        const snap = await getDocs(collection(_db, 'shopSlides'));
        for (const d of snap.docs) await deleteDoc(doc(_db, 'shopSlides', d.id));
        _slides = [];
        paintShopSlides();
        showToast('<i class="fas fa-circle-check"></i> Все слайды удалены');
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally { _saving = false; }
};

window.deleteShopSlide = async function(id) {
    const { isAdmin } = _getState();
    if (!isAdmin || !id || _saving) return;
    if (!confirm('Удалить этот слайд?')) return;
    _saving = true;
    try {
        await deleteDoc(doc(_db, 'shopSlides', id));
        _slides = _slides.filter(s => s.id !== id);
        paintShopSlides();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally { _saving = false; }
};

export function bindShopSlides(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.renderShopSlides = renderShopSlides;
}
