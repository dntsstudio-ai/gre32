// ============================================================
// js/inventory.js — Система инвентаря (V2.3 FINAL)
// ============================================================

import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';

// Константы редкостей (Включая ТОП-СИКРЕТ)
export const RARITIES = {
    common: { label: 'Обычная', color: '#94a3b8', glow: 'rgba(148,163,184,0.2)', sellPrice: 10 },
    rare: { label: 'Редкая', color: '#3b82f6', glow: 'rgba(59,130,246,0.3)', sellPrice: 30 },
    epic: { label: 'Эпическая', color: '#a855f7', glow: 'rgba(168,85,247,0.4)', sellPrice: 100 },
    legendary: { label: 'Легендарная', color: '#eab308', glow: 'rgba(234,179,8,0.5)', sellPrice: 250 },
    topsecret: { label: 'Топ-сикрет', color: '#ef4444', glow: 'rgba(239,68,68,0.6)', sellPrice: 1000 }
};

// Функция получения редкости по категории (для обычных карт команды)
export function getRarityByCat(cat) {
    if (['admin', 'proxyadmin'].includes(cat)) return 'legendary';
    if (['dub', 'moderator'].includes(cat)) return 'epic';
    if (['curator', 'helper'].includes(cat)) return 'rare';
    return 'common';
}

// Рендеринг карточки с поддержкой Stacking и Secret
export function renderCard(card, options = {}) {
    const { showActions = true, count = 1, hideSecret = false } = options;
    const rarity = card.rarity || getRarityByCat(card.cat);
    const r = RARITIES[rarity] || RARITIES.common;
    
    // Если карточка секретная и мы в режиме "скрыто" (например, при выпадении)
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
                <img src="${esc(card.img || card.avatar)}" alt="${esc(card.name || card.nickname)}" loading="lazy">
                ${count > 1 ? `<div class="inv-card__count-badge">x${count}</div>` : ''}
                <div class="inv-card__rarity-bar"></div>
                <div class="inv-card__shine"></div>
            </div>
            <div class="inv-card__body">
                <div class="inv-card__name">${esc(card.name || card.nickname)}</div>
                <div class="inv-card__role">${esc(card.role || card.cat)}</div>
                ${card.isSecret ? '<div class="lb-secret-badge-mini">🤐 SECRET</div>' : ''}
            </div>
            ${showActions ? `
                <div class="inv-card__actions">
                    <button class="btn btn-sm btn-outline" onclick="openGiftCardModal('${card.id}', ${card.isCustom || false})">🎁</button>
                    <button class="btn btn-sm btn-outline" onclick="sellCard('${card.id}', ${r.sellPrice}, ${card.isCustom || false})">💰</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Добавление в инвентарь (Stacking)
export async function addCardToInventory(cardId, isCustom = false) {
    const { _db, _auth, _getState } = window._VAT_CORE || {}; // Предполагаем глобальный доступ или импорт
    if (!_auth?.currentUser) return;

    const userRef = doc(_db, 'users', _auth.currentUser.uid);
    const field = isCustom ? 'inventory.customCardsStacked' : 'inventory.cardsStacked';
    
    // Используем dot-notation для инкремента в объекте (Firebase 9+)
    const update = {};
    update[`${field}.${cardId}`] = (window._VAT_STATE?.userData?.inventory?.[isCustom ? 'customCardsStacked' : 'cardsStacked']?.[cardId] || 0) + 1;
    
    await updateDoc(userRef, update);
}

// Инициализация
export function bindInventory(db, auth, getState) {
    window._VAT_CORE = { _db: db, _auth: auth, _getState: getState };
    window._VAT_STATE = getState();
    // ... остальной код
}
