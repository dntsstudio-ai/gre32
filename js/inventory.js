// ============================================================
// js/inventory.js — Система инвентаря (V2.3 FULL)
// ============================================================

import { doc, getDoc, updateDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';

let _db, _auth, _getState;

export const RARITIES = {
    common: { label: 'Обычная', color: '#94a3b8', glow: 'rgba(148,163,184,0.2)', sellPrice: 10 },
    rare: { label: 'Редкая', color: '#3b82f6', glow: 'rgba(59,130,246,0.3)', sellPrice: 30 },
    epic: { label: 'Эпическая', color: '#a855f7', glow: 'rgba(168,85,247,0.4)', sellPrice: 100 },
    legendary: { label: 'Легендарная', color: '#eab308', glow: 'rgba(234,179,8,0.5)', sellPrice: 250 },
    topsecret: { label: 'Топ-сикрет', color: '#ef4444', glow: 'rgba(239,68,68,0.6)', sellPrice: 1000 }
};

export function getRarityByCat(cat) {
    if (['admin', 'proxyadmin'].includes(cat)) return 'legendary';
    if (['dub', 'moderator'].includes(cat)) return 'epic';
    if (['curator', 'helper'].includes(cat)) return 'rare';
    return 'common';
}

export function renderCard(card, options = {}) {
    const { showActions = true, count = 1, hideSecret = false } = options;
    const rarity = card.rarity || getRarityByCat(card.cat);
    const r = RARITIES[rarity] || RARITIES.common;
    
    if (hideSecret && card.isSecret) {
        return `
            <div class="inv-card inv-card--secret inv-card--${rarity}">
                <div class="inv-card__img-wrap inv-card__img-wrap--secret">
                    <div class="inv-card__secret-overlay">
                        <div class="inv-card__secret-icon">❓</div>
                        <div class="inv-card__secret-label">ЗАСЕКРЕЧЕНО</div>
                    </div>
                </div>
                <div class="inv-card__body">
                    <div class="inv-card__name">???</div>
                    <div class="inv-card__role">Неизвестно</div>
                </div>
            </div>
        `;
    }

    return `
        <div class="inv-card inv-card--${rarity}" data-id="${card.id}">
            <div class="inv-card__img-wrap">
                <img src="${esc(card.img || card.avatar || 'https://api.dicebear.com/7.x/identicon/svg')}" alt="${esc(card.name || card.nickname)}" loading="lazy" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                ${count > 1 ? `<div class="inv-card__count-badge">x${count}</div>` : ''}
                <div class="inv-card__rarity-bar"></div>
                <div class="inv-card__shine"></div>
            </div>
            <div class="inv-card__body">
                <div class="inv-card__name">${esc(card.name || card.nickname)}</div>
                <div class="inv-card__role">${esc(card.role || card.cat)}</div>
                ${card.isSecret ? '<div class="lb-secret-badge-mini" style="font-size:8px;background:#ef4444;color:#fff;padding:2px 4px;border-radius:4px;margin-top:4px;display:inline-block;">🤐 SECRET</div>' : ''}
            </div>
            ${showActions ? `
                <div class="inv-card__actions">
                    <button class="btn btn-sm btn-outline" onclick="openGiftCardModal('${card.id}', ${!!card.isCustom})">🎁</button>
                    <button class="btn btn-sm btn-outline" onclick="sellCard('${card.id}', ${r.sellPrice}, ${!!card.isCustom})">💰</button>
                </div>
            ` : ''}
        </div>
    `;
}

export async function addCardToInventory(cardId, isCustom = false) {
    if (!_auth?.currentUser) return;
    const userRef = doc(_db, 'users', _auth.currentUser.uid);
    const field = isCustom ? 'inventory.customCardsStacked' : 'inventory.cardsStacked';
    const currentVal = _getState().userData?.inventory?.[isCustom ? 'customCardsStacked' : 'cardsStacked']?.[cardId] || 0;
    
    const update = {};
    update[field + '.' + cardId] = currentVal + 1;
    await updateDoc(userRef, update);
}

window.loadInventory = async function() {
    const wrap = document.getElementById('inventory-cards-grid');
    if (!wrap) return;
    
    wrap.innerHTML = '<div class="loading">Загрузка инвентаря...</div>';
    
    try {
        const { userData } = _getState();
        const [teamSnap, customSnap] = await Promise.all([
            getDocs(collection(_db, 'team')),
            getDocs(collection(_db, 'custom_cards'))
        ]);
        
        const allMembers = teamSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const allCustom = customSnap.docs.map(d => ({ id: d.id, ...d.data(), isCustom: true }));
        
        const inv = userData.inventory || {};
        const stacked = inv.cardsStacked || {};
        const customStacked = inv.customCardsStacked || {};
        
        let html = '';
        
        // Рендерим обычные карты
        for (const [id, count] of Object.entries(stacked)) {
            const member = allMembers.find(m => m.id === id);
            if (member) html += renderCard(member, { count });
        }
        
        // Рендерим кастомные карты
        for (const [id, count] of Object.entries(customStacked)) {
            const card = allCustom.find(c => c.id === id);
            if (card) html += renderCard(card, { count });
        }
        
        wrap.innerHTML = html || '<div class="empty-hint">Ваш инвентарь пуст</div>';
    } catch(e) {
        wrap.innerHTML = '<div class="error">Ошибка загрузки</div>';
        console.error(e);
    }
};

window.openGiftCardModal = function(cardId, isCustom) {
    const modal = document.getElementById('m-gift-card');
    if (!modal) return;
    window._giftData = { cardId, isCustom };
    modal.style.display = 'flex';
    document.getElementById('gift-search-results').innerHTML = '';
    document.getElementById('gift-user-input').value = '';
};

window.searchGiftRecipient = async function() {
    const q = document.getElementById('gift-user-input').value.trim().toLowerCase();
    const res = document.getElementById('gift-search-results');
    if (q.length < 2) return;
    
    res.innerHTML = 'Поиск...';
    const snap = await getDocs(collection(_db, 'users'));
    const users = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== _auth.currentUser.uid && (u.nickname||'').toLowerCase().includes(q))
        .slice(0, 5);
        
    res.innerHTML = users.map(u => `
        <div class="user-select-card" onclick="confirmGift('${u.id}', '${esc(u.nickname)}')">
            <img src="${u.avatar || ''}" style="width:30px;height:30px;border-radius:50%">
            <span>${esc(u.nickname)}</span>
        </div>
    `).join('') || 'Никого не нашли';
};

window.confirmGift = async function(toUid, toNick) {
    if (!confirm(`Подарить карточку пользователю ${toNick}?`)) return;
    const { cardId, isCustom } = window._giftData;
    const fromUid = _auth.currentUser.uid;
    
    try {
        const fromRef = doc(_db, 'users', fromUid);
        const toRef = doc(_db, 'users', toUid);
        
        const field = isCustom ? 'inventory.customCardsStacked' : 'inventory.cardsStacked';
        const fromCount = _getState().userData.inventory[isCustom ? 'customCardsStacked' : 'cardsStacked'][cardId];
        
        if (fromCount <= 0) return showToast('У вас нет этой карточки', 'error');
        
        const toSnap = await getDoc(toRef);
        const toData = toSnap.data();
        const toCount = (toData.inventory?.[isCustom ? 'customCardsStacked' : 'cardsStacked']?.[cardId] || 0);
        
        const updFrom = {}; updFrom[`${field}.${cardId}`] = fromCount - 1;
        const updTo = {}; updTo[`${field}.${cardId}`] = toCount + 1;
        
        await updateDoc(fromRef, updFrom);
        await updateDoc(toRef, updTo);
        
        showToast(`Карточка подарена ${toNick}!`);
        closeModals();
        window.loadInventory();
    } catch(e) {
        showToast('Ошибка дарения', 'error');
    }
};

window.sellCard = async function(cardId, price, isCustom) {
    if (!confirm(`Продать карточку за ${price} VC?`)) return;
    try {
        const uid = _auth.currentUser.uid;
        const userRef = doc(_db, 'users', uid);
        const field = isCustom ? 'inventory.customCardsStacked' : 'inventory.cardsStacked';
        const count = _getState().userData.inventory[isCustom ? 'customCardsStacked' : 'cardsStacked'][cardId];
        
        const upd = {}; 
        upd[`${field}.${cardId}`] = count - 1;
        upd['vcoins'] = (_getState().userData.vcoins || 0) + price;
        
        await updateDoc(userRef, upd);
        showToast(`Продано за ${price} VC`);
        window.loadInventory();
    } catch(e) {
        showToast('Ошибка продажи', 'error');
    }
};

export function bindInventory(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
}
