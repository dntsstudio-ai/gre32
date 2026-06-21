// ============================================================
// js/inventory.js — Инвентарь: карточки команды + привилегии
// ============================================================
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, where }
    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js';

let _db, _auth, _getState;

// ── Редкости ──────────────────────────────────────────────────
export const RARITIES = {
    common:    { label: 'Обычная',     color: '#94a3b8', glow: 'rgba(148,163,184,0.4)', stars: 1, sellPrice: 15  },
    rare:      { label: 'Редкая',      color: '#38bdf8', glow: 'rgba(56,189,248,0.5)',  stars: 2, sellPrice: 50  },
    epic:      { label: 'Эпическая',   color: '#a78bfa', glow: 'rgba(167,139,250,0.6)', stars: 3, sellPrice: 120 },
    legendary: { label: 'Легендарная', color: '#fbbf24', glow: 'rgba(251,191,36,0.7)',  stars: 4, sellPrice: 300 },
};

// Определяем редкость по категории участника
export function getRarityByCat(cat) {
    if (!cat) return 'common';
    const c = cat.toLowerCase();
    if (c.includes('администр') || c.includes('admin')) return 'legendary';
    if (c.includes('техн') || c.includes('монтаж') || c.includes('сводч') ||
        c.includes('превью') || c.includes('саббер')) return 'rare';
    if (c.includes('куратор')) return 'epic';
    return 'common';
}

// ── Рендер одной карточки ──────────────────────────────────────
export function renderCard(card, opts = {}) {
    const r = RARITIES[card.rarity] || RARITIES.common;
    const isFav = opts.isFav || false;
    const showActions = opts.showActions !== false;
    const showDesc = opts.showDesc || false;
    const zoomable = opts.zoomable !== false && showActions;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(4 - r.stars);

    return `
    <div class="inv-card inv-card--${card.rarity}" data-card-id="${esc(card.id)}"
         style="--card-glow:${r.glow};--card-color:${r.color};"
         ${zoomable ? `onclick="zoomCard(event, '${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})"` : ''}>
        <div class="inv-card__shine"></div>
        <div class="inv-card__rarity-bar"></div>
        <div class="inv-card__img-wrap">
            <img src="${esc(card.img || '')}" alt="${esc(card.name)}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${esc(card.name)}'">
        </div>
        <div class="inv-card__body">
            ${card.prefix ? `<div class="inv-card__prefix" style="color:${r.color};">${esc(card.prefix)}</div>` : ''}
            <div class="inv-card__name">${esc(card.name)}</div>
            <div class="inv-card__role">${esc(card.role || card.cat || '')}</div>
            ${showDesc && card.description ? `<div class="inv-card__desc">${esc(card.description)}</div>` : ''}
            <div class="inv-card__rarity-label" style="color:${r.color};">
                <span class="inv-card__stars">${stars}</span>
                ${r.label}
            </div>
        </div>
        ${showActions ? `
        <div class="inv-card__actions" onclick="event.stopPropagation()">
            <button class="inv-card__btn inv-card__btn--fav ${isFav ? 'active' : ''}"
                    onclick="toggleFavCard('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})"
                    title="${isFav ? 'Убрать из избранного' : 'В избранное'}">
                ${isFav ? '❤️' : '🤍'}
            </button>
            <button class="inv-card__btn"
                    onclick="openGiftCardModal('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})"
                    title="Подарить карточку">
                🎁
            </button>
            <button class="inv-card__btn inv-card__btn--sell"
                    onclick="sellCard('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})"
                    title="Продать за ${r.sellPrice} VC">
                💰 ${r.sellPrice} VC
            </button>
        </div>` : ''}
    </div>`;
}

// ── Зум карточки по клику ──────────────────────────────────────
window.zoomCard = function(event, cardId, isCustom) {
    // Не открываем если кликнули по кнопке
    if (event.target.closest('.inv-card__actions')) return;

    const overlay = document.createElement('div');
    overlay.className = 'inv-zoom-overlay';
    overlay.id = 'inv-zoom-overlay';

    // Находим данные карточки из DOM
    const cardEl = event.currentTarget;
    const cloned = cardEl.cloneNode(true);
    cloned.style.transform = 'none';
    cloned.style.cursor = 'default';
    cloned.removeAttribute('onclick');
    // Убираем кнопки из зума
    const actionsInClone = cloned.querySelector('.inv-card__actions');
    if (actionsInClone) actionsInClone.remove();

    overlay.innerHTML = `
    <div class="inv-zoom-backdrop"></div>
    <div class="inv-zoom-content">
        <div class="inv-zoom-card-wrap" id="inv-zoom-card-wrap"></div>
        <div class="inv-zoom-btns">
            <button class="btn inv-card__btn inv-card__btn--fav" id="inv-zoom-fav-btn"
                    onclick="toggleFavCard('${esc(cardId)}', ${isCustom}); closeCardZoom();">❤️ В избранное</button>
            <button class="btn" onclick="openGiftCardModal('${esc(cardId)}', ${isCustom}); closeCardZoom();">🎁 Подарить</button>
            <button class="btn lb-btn-sell" onclick="sellCard('${esc(cardId)}', ${isCustom}); closeCardZoom();">💰 Продать</button>
            <button class="btn btn-outline" onclick="closeCardZoom()">✕ Закрыть</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    document.getElementById('inv-zoom-card-wrap').appendChild(cloned);

    requestAnimationFrame(() => overlay.classList.add('inv-zoom-overlay--visible'));

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.classList.contains('inv-zoom-backdrop')) closeCardZoom();
    });
};

window.closeCardZoom = function() {
    const overlay = document.getElementById('inv-zoom-overlay');
    if (overlay) {
        overlay.classList.remove('inv-zoom-overlay--visible');
        setTimeout(() => overlay.remove(), 300);
    }
};

// ── Загрузка инвентаря ─────────────────────────────────────────
async function loadInventory() {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;

    const wrap = document.getElementById('inventory-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:32px;">Загрузка...</p>';

    try {
        // Загружаем обычных участников
        const teamSnap = await getDocs(query(collection(_db, 'team'), orderBy('order')));
        const teamMap = {};
        teamSnap.docs.forEach(d => { teamMap[d.id] = { id: d.id, ...d.data() }; });

        // Загружаем кастомные карточки
        const customSnap = await getDocs(collection(_db, 'custom_cards'));
        const customMap = {};
        customSnap.docs.forEach(d => { customMap[d.id] = { id: d.id, ...d.data(), isCustom: true }; });

        const userDoc = await getDoc(doc(_db, 'users', _auth.currentUser.uid));
        const fresh = userDoc.data();
        const cards       = fresh?.inventory?.cards || [];
        const customCards = fresh?.inventory?.customCards || [];
        const favs        = fresh?.inventory?.favCards || [];
        const items       = fresh?.shopItems || [];

        const activeTab = wrap.dataset.tab || 'cards';
        const totalCards = cards.length + customCards.length;

        wrap.innerHTML = `
        <div class="inv-tabs">
            <button class="inv-tab ${activeTab==='cards'?'active':''}" onclick="switchInvTab('cards')">
                🃏 Карточки <span class="inv-tab-count">${totalCards}</span>
            </button>
            <button class="inv-tab ${activeTab==='items'?'active':''}" onclick="switchInvTab('items')">
                🎁 Привилегии <span class="inv-tab-count">${items.length}</span>
            </button>
        </div>
        <div id="inv-tab-cards" class="inv-tab-content" style="display:${activeTab==='cards'?'block':'none'}">
            ${renderCardsTab(cards, customCards, favs, teamMap, customMap)}
        </div>
        <div id="inv-tab-items" class="inv-tab-content" style="display:${activeTab==='items'?'block':'none'}">
            ${renderItemsTab(items, fresh)}
        </div>`;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;text-align:center;padding:32px;">Ошибка загрузки: ${esc(e.message)}</p>`;
        console.error('loadInventory:', e);
    }
}

function renderCardsTab(cards, customCards, favs, teamMap, customMap) {
    const allEmpty = !cards.length && !customCards.length;
    if (allEmpty) return `
        <div class="inv-empty">
            <div class="inv-empty__icon">🃏</div>
            <p>У вас пока нет карточек</p>
            <p style="font-size:13px;color:var(--text-dim);">Откройте ящики в разделе «Магазин VCoins»</p>
        </div>`;

    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };

    // Обычные карточки
    const sortedCards = [...cards].sort((a, b) => {
        const af = favs.includes(a) ? -1 : 0;
        const bf = favs.includes(b) ? -1 : 0;
        if (af !== bf) return af - bf;
        const ra = teamMap[a] ? getRarityByCat(teamMap[a].cat) : 'common';
        const rb = teamMap[b] ? getRarityByCat(teamMap[b].cat) : 'common';
        return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
    });

    // Кастомные карточки
    const sortedCustom = [...customCards].sort((a, b) => {
        const af = favs.includes('custom_' + a) ? -1 : 0;
        const bf = favs.includes('custom_' + b) ? -1 : 0;
        if (af !== bf) return af - bf;
        const ra = customMap[a]?.rarity || 'common';
        const rb = customMap[b]?.rarity || 'common';
        return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
    });

    const normalHtml = sortedCards.map(cardId => {
        const tm = teamMap[cardId];
        if (!tm) return '';
        const rarity = getRarityByCat(tm.cat);
        const isFav = favs.includes(cardId);
        return renderCard({ ...tm, rarity }, { isFav, showActions: true, zoomable: true });
    }).join('');

    const customHtml = sortedCustom.map(cardId => {
        const cc = customMap[cardId];
        if (!cc) return '';
        const isFav = favs.includes('custom_' + cardId);
        return renderCard({ ...cc, isCustom: true }, { isFav, showActions: true, showDesc: true, zoomable: true });
    }).join('');

    const hasCustom = customHtml.trim().length > 0;

    return `
    <div class="inv-cards-grid">
        ${normalHtml}
        ${hasCustom ? `
        <div class="inv-section-divider" style="grid-column:1/-1;">
            <span>✨ Особые карточки</span>
        </div>
        ${customHtml}` : ''}
    </div>`;
}

function renderItemsTab(items, userData) {
    const ITEM_DEFS = {
        colorNick:  { icon: '🎨', name: 'Цветной никнейм',    desc: 'Изменяет цвет вашего никнейма',        active: !!userData?.nickColor },
        prefix:     { icon: '🏷️', name: 'Префикс',            desc: `Активный: ${userData?.activePrefix || 'нет'}`, active: !!userData?.activePrefix },
        achSlot:    { icon: '🏆', name: 'Слот достижения',     desc: 'Дополнительный слот для достижения',   active: true },
    };

    if (!items.length) return `
        <div class="inv-empty">
            <div class="inv-empty__icon">🎁</div>
            <p>У вас пока нет привилегий</p>
            <p style="font-size:13px;color:var(--text-dim);">Купите их в разделе «Магазин VCoins»</p>
        </div>`;

    const html = items.map(id => {
        const def = ITEM_DEFS[id] || { icon: '✨', name: id, desc: 'Привилегия', active: true };
        return `
        <div class="inv-item-card ${def.active ? 'active' : ''}">
            <div class="inv-item-icon">${def.icon}</div>
            <div class="inv-item-info">
                <div class="inv-item-name">${esc(def.name)}</div>
                <div class="inv-item-desc">${esc(def.desc)}</div>
            </div>
            <div class="inv-item-status">${def.active ? '<span class="inv-badge-active">Активно</span>' : ''}</div>
        </div>`;
    }).join('');

    return `<div class="inv-items-list">${html}</div>`;
}

// ── Переключение вкладок ───────────────────────────────────────
window.switchInvTab = function(tab) {
    const wrap = document.getElementById('inventory-wrap');
    if (wrap) wrap.dataset.tab = tab;
    document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.inv-tab-content').forEach(c => c.style.display = 'none');
    const activeTab = document.querySelector(`.inv-tab[onclick="switchInvTab('${tab}')"]`);
    if (activeTab) activeTab.classList.add('active');
    const content = document.getElementById(`inv-tab-${tab}`);
    if (content) content.style.display = 'block';
};

// ── Избранное ──────────────────────────────────────────────────
window.toggleFavCard = async function(cardId, isCustom) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
    const favKey = isCustom ? 'custom_' + cardId : cardId;
    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};
        const favs = inv.favCards || [];
        const newFavs = favs.includes(favKey)
            ? favs.filter(f => f !== favKey)
            : [...favs, favKey];
        await updateDoc(userRef, { 'inventory.favCards': newFavs });
        if (userData.inventory) userData.inventory.favCards = newFavs;
        else userData.inventory = { favCards: newFavs };
        showToast(newFavs.includes(favKey) ? '❤️ Добавлено в избранное' : '🤍 Убрано из избранного');
        await loadInventory();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Продажа карточки ───────────────────────────────────────────
window.sellCard = async function(cardId, isCustom) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');

    try {
        let cardData, rarity, price;
        if (isCustom) {
            const snap = await getDoc(doc(_db, 'custom_cards', cardId));
            if (!snap.exists()) return showToast('Карточка не найдена', 'error');
            cardData = { ...snap.data(), id: cardId, isCustom: true };
            rarity = cardData.rarity || 'rare';
            price = RARITIES[rarity]?.sellPrice || 50;
        } else {
            const snap = await getDoc(doc(_db, 'team', cardId));
            if (!snap.exists()) return showToast('Карточка не найдена', 'error');
            cardData = { ...snap.data(), id: cardId };
            rarity = getRarityByCat(cardData.cat);
            price = RARITIES[rarity].sellPrice;
        }

        document.getElementById('sell-card-preview').innerHTML = renderCard(
            { ...cardData, rarity }, { showActions: false, showDesc: true }
        );
        document.getElementById('sell-card-price').textContent = price;
        document.getElementById('m-sell-card').style.display = 'flex';
        window._pendingSellCardId = cardId;
        window._pendingSellCardPrice = price;
        window._pendingSellCardCustom = isCustom;
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

window.confirmSellCard = async function() {
    const cardId   = window._pendingSellCardId;
    const price    = window._pendingSellCardPrice;
    const isCustom = window._pendingSellCardCustom;
    if (!cardId || !price) return;
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;

    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};

        if (isCustom) {
            const cards = inv.customCards || [];
            const idx = cards.indexOf(cardId);
            if (idx === -1) return showToast('Карточка не найдена в инвентаре', 'error');
            const newCards = [...cards]; newCards.splice(idx, 1);
            await updateDoc(userRef, { 'inventory.customCards': newCards });
            if (userData.inventory) userData.inventory.customCards = newCards;
        } else {
            const cards = inv.cards || [];
            const idx = cards.indexOf(cardId);
            if (idx === -1) return showToast('Карточка не найдена в инвентаре', 'error');
            const newCards = [...cards]; newCards.splice(idx, 1);
            await updateDoc(userRef, { 'inventory.cards': newCards });
            if (userData.inventory) userData.inventory.cards = newCards;
        }

        if (window.awardVCoins) await window.awardVCoins(price, `Продажа карточки`);
        document.getElementById('m-sell-card').style.display = 'none';
        showToast(`💰 Карточка продана за ${price} VC!`);
        await loadInventory();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Дарение карточки по никнейму ──────────────────────────────
window.openGiftCardModal = function(cardId, isCustom) {
    const modal = document.getElementById('m-gift-card');
    if (!modal) return;
    document.getElementById('gift-card-id').value      = cardId;
    document.getElementById('gift-card-custom').value  = isCustom ? '1' : '0';
    document.getElementById('gift-card-nick').value    = '';
    document.getElementById('gift-card-target-info').innerHTML = '';
    document.getElementById('gift-card-confirm-btn').style.display = 'none';
    window._giftCardTargetUid = null;
    modal.style.display = 'flex';
};

window.searchGiftCardTarget = async function() {
    const nick = document.getElementById('gift-card-nick')?.value?.trim();
    const info = document.getElementById('gift-card-target-info');
    const btn  = document.getElementById('gift-card-confirm-btn');
    if (!nick) return;
    info.innerHTML = '<span style="color:var(--text-dim);font-size:13px;">Поиск...</span>';
    btn.style.display = 'none';
    window._giftCardTargetUid = null;

    try {
        const snap = await getDocs(query(collection(_db, 'users'), where('nick', '==', nick)));
        if (snap.empty) {
            info.innerHTML = '<span style="color:#ef4444;font-size:13px;">Пользователь не найден</span>';
            return;
        }
        const target = snap.docs[0];
        const td = target.data();
        window._giftCardTargetUid = target.id;
        info.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(20,184,166,0.08);border-radius:8px;border:1px solid rgba(20,184,166,0.2);">
            <img src="${esc(td.avatar||'https://api.dicebear.com/7.x/identicon/svg')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
            <div>
                <div style="font-weight:700;font-size:14px;">${esc(td.nick||nick)}</div>
                <div style="font-size:11px;color:var(--text-dim);">${esc(td.role||'')}</div>
            </div>
        </div>`;
        btn.style.display = 'block';
    } catch(e) {
        info.innerHTML = `<span style="color:#ef4444;font-size:13px;">Ошибка: ${esc(e.message)}</span>`;
    }
};

window.confirmGiftCard = async function() {
    const cardId   = document.getElementById('gift-card-id')?.value;
    const isCustom = document.getElementById('gift-card-custom')?.value === '1';
    const targetUid = window._giftCardTargetUid;
    const { userData } = _getState();

    if (!cardId || !targetUid || !userData || !_auth.currentUser) return;
    if (targetUid === _auth.currentUser.uid) return showToast('Нельзя подарить самому себе', 'error');

    try {
        const senderRef = doc(_db, 'users', _auth.currentUser.uid);
        const targetRef = doc(_db, 'users', targetUid);

        const [senderSnap, targetSnap] = await Promise.all([getDoc(senderRef), getDoc(targetRef)]);
        const senderInv = senderSnap.data()?.inventory || {};
        const targetInv = targetSnap.data()?.inventory || {};

        const field = isCustom ? 'customCards' : 'cards';
        const senderCards = senderInv[field] || [];
        const targetCards = targetInv[field] || [];

        const idx = senderCards.indexOf(cardId);
        if (idx === -1) return showToast('Карточка не найдена в вашем инвентаре', 'error');

        // Убираем у отправителя, добавляем получателю
        const newSenderCards = [...senderCards]; newSenderCards.splice(idx, 1);
        const newTargetCards = [...targetCards, cardId];

        await Promise.all([
            updateDoc(senderRef, { [`inventory.${field}`]: newSenderCards }),
            updateDoc(targetRef, { [`inventory.${field}`]: newTargetCards }),
        ]);

        // Обновляем локальное состояние
        if (userData.inventory) userData.inventory[field] = newSenderCards;

        document.getElementById('m-gift-card').style.display = 'none';
        showToast('🎁 Карточка подарена!');
        await loadInventory();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Добавить карточку в инвентарь (вызывается из lootbox) ──────
export async function addCardToInventory(cardId, isCustom) {
    if (!_auth.currentUser) return;
    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};
        const field = isCustom ? 'customCards' : 'cards';
        const cards = inv[field] || [];
        await updateDoc(userRef, { [`inventory.${field}`]: [...cards, cardId] });
        const { userData } = _getState();
        if (userData) {
            if (!userData.inventory) userData.inventory = { cards: [], customCards: [], favCards: [] };
            userData.inventory[field] = [...(userData.inventory[field] || []), cardId];
        }
    } catch(e) {
        console.error('addCardToInventory:', e);
    }
}

// ── Экспорт ────────────────────────────────────────────────────
export function bindInventory(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.loadInventory = loadInventory;
}
