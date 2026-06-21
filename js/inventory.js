// ============================================================
// js/inventory.js — Инвентарь: карточки команды + привилегии
// ============================================================
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy }
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
    return 'common'; // актёры дубляжа и прочие
}

// ── Рендер одной карточки ──────────────────────────────────────
export function renderCard(card, opts = {}) {
    const r = RARITIES[card.rarity] || RARITIES.common;
    const isFav = opts.isFav || false;
    const showActions = opts.showActions !== false;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(4 - r.stars);

    return `
    <div class="inv-card inv-card--${card.rarity}" data-card-id="${esc(card.id)}"
         style="--card-glow:${r.glow};--card-color:${r.color};">
        <div class="inv-card__shine"></div>
        <div class="inv-card__rarity-bar"></div>
        <div class="inv-card__img-wrap">
            <img src="${esc(card.img || '')}" alt="${esc(card.name)}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${esc(card.name)}'">
        </div>
        <div class="inv-card__body">
            <div class="inv-card__name">${esc(card.name)}</div>
            <div class="inv-card__role">${esc(card.role || card.cat || '')}</div>
            <div class="inv-card__rarity-label" style="color:${r.color};">
                <span class="inv-card__stars">${stars}</span>
                ${r.label}
            </div>
        </div>
        ${showActions ? `
        <div class="inv-card__actions">
            <button class="inv-card__btn inv-card__btn--fav ${isFav ? 'active' : ''}"
                    onclick="toggleFavCard('${esc(card.id)}')" title="${isFav ? 'Убрать из избранного' : 'В избранное'}">
                ${isFav ? '❤️' : '🤍'}
            </button>
            <button class="inv-card__btn inv-card__btn--sell"
                    onclick="sellCard('${esc(card.id)}')" title="Продать за ${r.sellPrice} VC">
                💰 ${r.sellPrice} VC
            </button>
        </div>` : ''}
    </div>`;
}

// ── Загрузка инвентаря ─────────────────────────────────────────
async function loadInventory() {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;

    const wrap = document.getElementById('inventory-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:32px;">Загрузка...</p>';

    try {
        // Загружаем данные всех карточек из коллекции team
        const teamSnap = await getDocs(query(collection(_db, 'team'), orderBy('order')));
        const teamMap = {};
        teamSnap.docs.forEach(d => { teamMap[d.id] = { id: d.id, ...d.data() }; });

        const userDoc = await getDoc(doc(_db, 'users', _auth.currentUser.uid));
        const fresh = userDoc.data();
        const cards = fresh?.inventory?.cards || [];
        const favs  = fresh?.inventory?.favCards || [];
        const items = fresh?.shopItems || [];

        // Вкладки
        const activeTab = wrap.dataset.tab || 'cards';

        wrap.innerHTML = `
        <div class="inv-tabs">
            <button class="inv-tab ${activeTab==='cards'?'active':''}" onclick="switchInvTab('cards')">
                🃏 Карточки <span class="inv-tab-count">${cards.length}</span>
            </button>
            <button class="inv-tab ${activeTab==='items'?'active':''}" onclick="switchInvTab('items')">
                🎁 Привилегии <span class="inv-tab-count">${items.length}</span>
            </button>
        </div>
        <div id="inv-tab-cards" class="inv-tab-content" style="display:${activeTab==='cards'?'block':'none'}">
            ${renderCardsTab(cards, favs, teamMap)}
        </div>
        <div id="inv-tab-items" class="inv-tab-content" style="display:${activeTab==='items'?'block':'none'}">
            ${renderItemsTab(items, fresh)}
        </div>`;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;text-align:center;padding:32px;">Ошибка загрузки: ${esc(e.message)}</p>`;
        console.error('loadInventory:', e);
    }
}

function renderCardsTab(cards, favs, teamMap) {
    if (!cards.length) return `
        <div class="inv-empty">
            <div class="inv-empty__icon">🃏</div>
            <p>У вас пока нет карточек</p>
            <p style="font-size:13px;color:var(--text-dim);">Откройте ящики в разделе «Магазин VCoins»</p>
        </div>`;

    // Сортируем: сначала избранные, потом по редкости
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
    const sorted = [...cards].sort((a, b) => {
        const af = favs.includes(a) ? -1 : 0;
        const bf = favs.includes(b) ? -1 : 0;
        if (af !== bf) return af - bf;
        const tm_a = teamMap[a]; const tm_b = teamMap[b];
        const ra = tm_a ? getRarityByCat(tm_a.cat) : 'common';
        const rb = tm_b ? getRarityByCat(tm_b.cat) : 'common';
        return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
    });

    const html = sorted.map(cardId => {
        const tm = teamMap[cardId];
        if (!tm) return '';
        const rarity = getRarityByCat(tm.cat);
        const isFav = favs.includes(cardId);
        return renderCard({ ...tm, rarity }, { isFav, showActions: true });
    }).join('');

    return `<div class="inv-cards-grid">${html}</div>`;
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
window.toggleFavCard = async function(cardId) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};
        const favs = inv.favCards || [];
        const newFavs = favs.includes(cardId)
            ? favs.filter(f => f !== cardId)
            : [...favs, cardId];
        await updateDoc(userRef, { 'inventory.favCards': newFavs });
        if (userData.inventory) userData.inventory.favCards = newFavs;
        else userData.inventory = { favCards: newFavs };
        showToast(newFavs.includes(cardId) ? '❤️ Добавлено в избранное' : '🤍 Убрано из избранного');
        await loadInventory();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Продажа карточки ───────────────────────────────────────────
window.sellCard = async function(cardId) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');

    try {
        const teamSnap = await getDoc(doc(_db, 'team', cardId));
        if (!teamSnap.exists()) return showToast('Карточка не найдена', 'error');
        const tm = teamSnap.data();
        const rarity = getRarityByCat(tm.cat);
        const price = RARITIES[rarity].sellPrice;

        // Показываем подтверждение
        const r = RARITIES[rarity];
        document.getElementById('sell-card-preview').innerHTML = renderCard(
            { ...tm, id: cardId, rarity }, { showActions: false }
        );
        document.getElementById('sell-card-price').textContent = price;
        document.getElementById('m-sell-card').style.display = 'flex';
        window._pendingSellCardId = cardId;
        window._pendingSellCardPrice = price;
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

window.confirmSellCard = async function() {
    const cardId = window._pendingSellCardId;
    const price  = window._pendingSellCardPrice;
    if (!cardId || !price) return;
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;

    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};
        const cards = inv.cards || [];
        const idx = cards.indexOf(cardId);
        if (idx === -1) return showToast('Карточка не найдена в инвентаре', 'error');

        const newCards = [...cards];
        newCards.splice(idx, 1);
        await updateDoc(userRef, { 'inventory.cards': newCards });
        if (userData.inventory) userData.inventory.cards = newCards;

        // Начисляем VCoins
        if (window.awardVCoins) await window.awardVCoins(price, `Продажа карточки`);

        document.getElementById('m-sell-card').style.display = 'none';
        showToast(`💰 Карточка продана за ${price} VC!`);
        await loadInventory();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Добавить карточку в инвентарь (вызывается из lootbox) ──────
export async function addCardToInventory(cardId) {
    if (!_auth.currentUser) return;
    try {
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const inv = snap.data()?.inventory || {};
        const cards = inv.cards || [];
        await updateDoc(userRef, { 'inventory.cards': [...cards, cardId] });
        const { userData } = _getState();
        if (userData) {
            if (!userData.inventory) userData.inventory = { cards: [], favCards: [] };
            userData.inventory.cards = [...(userData.inventory.cards || []), cardId];
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
