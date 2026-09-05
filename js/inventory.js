// ============================================================
// js/inventory.js — Инвентарь: карточки команды + привилегии (V2.3 с Stacking)
// ============================================================

import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js?v=20260905a';

let _db, _auth, _getState;

// ── Редкости ────────────────────────────────────────────────
export const RARITIES = {
  common: { label: 'Обычная', color: '#94a3b8', glow: 'rgba(148,163,184,0.4)', stars: 1, sellPrice: 15 },
  rare: { label: 'Редкая', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)', stars: 2, sellPrice: 50 },
  epic: { label: 'Эпическая', color: '#a78bfa', glow: 'rgba(167,139,250,0.6)', stars: 3, sellPrice: 120 },
  legendary: { label: 'Легендарная', color: '#fbbf24', glow: 'rgba(251,191,36,0.7)', stars: 4, sellPrice: 300 },
  topsecret: { label: 'Топ-сикрет', color: '#ef4444', glow: 'rgba(239,68,68,0.8)', stars: 5, sellPrice: 500 },
};

// Определяем редкость по категории участника
export function getRarityByCat(cat) {
  if (!cat) return 'common';
  const c = cat.toLowerCase();
  if (c.includes('администр') || c.includes('admin')) return 'legendary';
  if (c.includes('техн') || c.includes('монтаж') || c.includes('сводч') || c.includes('превью') || c.includes('саббер')) return 'rare';
  if (c.includes('куратор')) return 'epic';
  return 'common';
}

// ── Рендер одной карточки ────────────────────────────────────
export function renderCard(card, opts = {}) {
  const r = RARITIES[card.rarity] || RARITIES.common;
  const isFav = opts.isFav || false;
  const showActions = opts.showActions !== false;
  const showDesc = opts.showDesc || false;
  const zoomable = opts.zoomable !== false && showActions;
  const count = opts.count || 1; // Количество карточек в стеке
  const stars = '<i class="fas fa-star"></i>'.repeat(r.stars) + '<i class="far fa-star"></i>'.repeat(4 - r.stars);

  // Если карточка секретная и не раскрыта
  const isSecretHidden = card.isSecret && opts.hideSecret;
  
  return `
    <div class="inv-card inv-card--${card.rarity}" data-card-id="${esc(card.id)}" style="--card-glow:${r.glow};--card-color:${r.color};" ${zoomable ? `onclick="zoomCard(event, '${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})"` : ''}>
      <div class="inv-card__shine"></div>
      <div class="inv-card__rarity-bar"></div>
      
      ${isSecretHidden ? `
        <div class="inv-card__img-wrap inv-card__img-wrap--secret">
          <div class="inv-card__secret-overlay">
            <div class="inv-card__secret-icon"><i class="fas fa-circle-question"></i></div>
            <div class="inv-card__secret-label">ЗАСЕКРЕЧЕННО</div>
          </div>
        </div>
      ` : `
        <div class="inv-card__img-wrap">
          <img src="${esc(card.img || '')}" alt="${esc(card.name)}" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${esc(card.name)}'">
        </div>
      `}
      
      <div class="inv-card__body">
        ${card.prefix ? `<div class="inv-card__prefix" style="color:${r.color};">${esc(card.prefix)}</div>` : ''}
        <div class="inv-card__name">${isSecretHidden ? 'Неизвестно' : esc(card.name)}</div>
        <div class="inv-card__role">${isSecretHidden ? '?' : esc(card.role || card.cat || '')}</div>
        ${showDesc && card.description && !isSecretHidden ? `<div class="inv-card__desc">${esc(card.description)}</div>` : ''}
        <div class="inv-card__rarity-label" style="color:${r.color};">
          <span class="inv-card__stars">${stars}</span>
          ${isSecretHidden ? 'ЗАСЕКРЕЧЕННО' : r.label}
        </div>
      </div>
      
      ${count > 1 ? `<div class="inv-card__count-badge">x${count}</div>` : ''}
      
      ${showActions ? `
        <div class="inv-card__actions" onclick="event.stopPropagation()">
          <button class="inv-card__btn inv-card__btn--fav ${isFav ? 'active' : ''}" onclick="toggleFavCard('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'})" title="${isFav ? 'Убрать из избранного' : 'В избранное'}">
            ${isFav ? '<i class="fas fa-heart"></i>️' : '<i class="far fa-heart"></i>'}
          </button>
          <button class="inv-card__btn" onclick="openGiftCardModal('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'}, ${count})" title="Подарить карточку">
            <i class="fas fa-gift"></i>
          </button>
          <button class="inv-card__btn inv-card__btn--sell" onclick="openSellCardModal('${esc(card.id)}', ${card.isCustom ? 'true' : 'false'}, ${count}, ${r.sellPrice})" title="Продать">
            <i class="fas fa-coins"></i> ${r.sellPrice} VC
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Зум карточки по клику ────────────────────────────────────
window.zoomCard = function(event, cardId, isCustom) {
  if (event.target.closest('.inv-card__actions')) return;
  
  const overlay = document.createElement('div');
  overlay.className = 'inv-zoom-overlay';
  overlay.id = 'inv-zoom-overlay';
  
  const cardEl = event.currentTarget;
  const cloned = cardEl.cloneNode(true);
  cloned.style.transform = 'none';
  cloned.style.cursor = 'default';
  cloned.removeAttribute('onclick');
  
  const actionsInClone = cloned.querySelector('.inv-card__actions');
  if (actionsInClone) actionsInClone.remove();
  
  overlay.innerHTML = `
    <div class="inv-zoom-backdrop"></div>
    <div class="inv-zoom-content">
      <div class="inv-zoom-card-wrap" id="inv-zoom-card-wrap"></div>
      <div class="inv-zoom-btns">
        <button class="btn inv-card__btn inv-card__btn--fav" id="inv-zoom-fav-btn" onclick="toggleFavCard('${esc(cardId)}', ${isCustom}); closeCardZoom();"><i class="fas fa-heart"></i>️ В избранное</button>
        <button class="btn" onclick="openGiftCardModal('${esc(cardId)}', ${isCustom}); closeCardZoom();"><i class="fas fa-gift"></i> Подарить</button>
        <button class="btn lb-btn-sell" onclick="openSellCardModal('${esc(cardId)}', ${isCustom}); closeCardZoom();"><i class="fas fa-coins"></i> Продать</button>
        <button class="btn btn-outline" onclick="closeCardZoom()"><i class="fas fa-xmark"></i> Закрыть</button>
      </div>
    </div>
  `;
  
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

// ── Загрузка инвентаря ───────────────────────────────────────
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
    teamSnap.docs.forEach(d => {
      teamMap[d.id] = { id: d.id, ...d.data() };
    });
    
    // Загружаем кастомные карточки
    const customSnap = await getDocs(collection(_db, 'custom_cards'));
    const customMap = {};
    customSnap.docs.forEach(d => {
      customMap[d.id] = { id: d.id, ...d.data(), isCustom: true };
    });
    
    const userDoc = await getDoc(doc(_db, 'users', _auth.currentUser.uid));
    const fresh = userDoc.data();
    
    // НОВАЯ СТРУКТУРА: объект с количеством вместо массива
    const cardsObj = fresh?.inventory?.cardsStacked || {}; // { cardId: count, ... }
    const customCardsObj = fresh?.inventory?.customCardsStacked || {};
    const favs = fresh?.inventory?.favCards || [];
    const items = fresh?.shopItems || [];
    
    const activeTab = wrap.dataset.tab || 'cards';
    const totalCards = Object.keys(cardsObj).length + Object.keys(customCardsObj).length;
    
    wrap.innerHTML = `
      <div class="inv-tabs">
        <button class="inv-tab ${activeTab==='cards'?'active':''}" onclick="switchInvTab('cards')">
          🃏 Карточки <span class="inv-tab-count">${totalCards}</span>
        </button>
        <button class="inv-tab ${activeTab==='items'?'active':''}" onclick="switchInvTab('items')">
          <i class="fas fa-gift"></i> Привилегии <span class="inv-tab-count">${items.length}</span>
        </button>
      </div>
      <div id="inv-tab-cards" class="inv-tab-content" style="display:${activeTab==='cards'?'block':'none'}">
        ${renderCardsTab(cardsObj, customCardsObj, favs, teamMap, customMap)}
      </div>
      <div id="inv-tab-items" class="inv-tab-content" style="display:${activeTab==='items'?'block':'none'}">
        ${renderItemsTab(items, fresh)}
      </div>
    `;
  } catch(e) {
    wrap.innerHTML = `<p style="color:#ef4444;text-align:center;padding:32px;">Ошибка загрузки: ${esc(e.message)}</p>`;
    console.error('loadInventory:', e);
  }
}

function renderCardsTab(cardsObj, customCardsObj, favs, teamMap, customMap) {
  const allEmpty = Object.keys(cardsObj).length === 0 && Object.keys(customCardsObj).length === 0;
  
  if (allEmpty) return `
    <div class="inv-empty">
      <div class="inv-empty__icon">🃏</div>
      <p>У вас пока нет карточек</p>
      <p style="font-size:13px;color:var(--text-dim);">Откройте ящики в разделе «Магазин VCoins»</p>
    </div>
  `;
  
  const rarityOrder = { legendary: 0, topsecret: 0.5, epic: 1, rare: 2, common: 3 };
  
  // Обычные карточки
  const sortedCards = Object.entries(cardsObj)
    .map(([cardId, count]) => ({ cardId, count, data: teamMap[cardId] }))
    .filter(item => item.data)
    .sort((a, b) => {
      const af = favs.includes(a.cardId) ? -1 : 0;
      const bf = favs.includes(b.cardId) ? -1 : 0;
      if (af !== bf) return af - bf;
      
      const ra = getRarityByCat(a.data.cat);
      const rb = getRarityByCat(b.data.cat);
      return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
    });
  
  // Кастомные карточки
  const sortedCustom = Object.entries(customCardsObj)
    .map(([cardId, count]) => ({ cardId, count, data: customMap[cardId] }))
    .filter(item => item.data)
    .sort((a, b) => {
      const af = favs.includes('custom_' + a.cardId) ? -1 : 0;
      const bf = favs.includes('custom_' + b.cardId) ? -1 : 0;
      if (af !== bf) return af - bf;
      
      const ra = a.data?.rarity || 'common';
      const rb = b.data?.rarity || 'common';
      return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
    });
  
  const normalHtml = sortedCards.map(item => {
    const tm = item.data;
    const rarity = getRarityByCat(tm.cat);
    const isFav = favs.includes(item.cardId);
    return renderCard({ ...tm, rarity }, { isFav, showActions: true, zoomable: true, count: item.count });
  }).join('');
  
  const customHtml = sortedCustom.map(item => {
    const cc = item.data;
    const isFav = favs.includes('custom_' + item.cardId);
    return renderCard({ ...cc, isCustom: true }, { isFav, showActions: true, showDesc: true, zoomable: true, count: item.count, hideSecret: cc.isSecret });
  }).join('');
  
  const hasCustom = customHtml.trim().length > 0;
  
  return `
    <div class="inv-cards-grid">
      ${normalHtml}
      ${hasCustom ? `
        <div class="inv-section-divider" style="grid-column:1/-1;">
          <span><i class="fas fa-wand-magic-sparkles"></i> Особые карточки</span>
        </div>
        ${customHtml}
      ` : ''}
    </div>
  `;
}

function renderItemsTab(items, userData) {
  const ITEM_DEFS = {
    colorNick: { icon: '<i class="fas fa-palette"></i>', name: 'Цветной никнейм', desc: 'Изменяет цвет вашего никнейма', active: !!userData?.nickColor },
    prefix: { icon: '<i class="fas fa-tag"></i>️', name: 'Префикс', desc: `Активный: ${userData?.activePrefix || 'нет'}`, active: !!userData?.activePrefix },
    achSlot: { icon: '<i class="fas fa-trophy"></i>', name: 'Слот достижения', desc: 'Дополнительный слот для достижения', active: true },
  };
  
  if (!items.length) return `
    <div class="inv-empty">
      <div class="inv-empty__icon"><i class="fas fa-gift"></i></div>
      <p>У вас пока нет привилегий</p>
      <p style="font-size:13px;color:var(--text-dim);">Купите их в разделе «Магазин VCoins»</p>
    </div>
  `;
  
  const html = items.map(id => {
    const def = ITEM_DEFS[id] || { icon: '<i class="fas fa-wand-magic-sparkles"></i>', name: id, desc: 'Привилегия', active: true };
    return `
      <div class="inv-item-card ${def.active ? 'active' : ''}">
        <div class="inv-item-icon">${def.icon}</div>
        <div class="inv-item-info">
          <div class="inv-item-name">${esc(def.name)}</div>
          <div class="inv-item-desc">${esc(def.desc)}</div>
        </div>
        <div class="inv-item-status">${def.active ? '<span class="inv-badge-active">Активно</span>' : ''}</div>
      </div>
    `;
  }).join('');
  
  return `<div class="inv-items-list">${html}</div>`;
}

// ── Переключение вкладок ─────────────────────────────────────
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

// ── Избранное ────────────────────────────────────────────────
window.toggleFavCard = async function(cardId, isCustom) {
  const { userData } = _getState();
  if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
  
  const favKey = isCustom ? 'custom_' + cardId : cardId;
  
  try {
    const userRef = doc(_db, 'users', _auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const inv = snap.data()?.inventory || {};
    const favs = inv.favCards || [];
    
    const newFavs = favs.includes(favKey) ? favs.filter(f => f !== favKey) : [...favs, favKey];
    
    await updateDoc(userRef, { 'inventory.favCards': newFavs });
    
    if (userData.inventory) userData.inventory.favCards = newFavs;
    else userData.inventory = { favCards: newFavs };
    
    showToast(newFavs.includes(favKey) ? '<i class="fas fa-heart"></i>️ Добавлено в избранное' : '<i class="far fa-heart"></i> Убрано из избранного');
    await loadInventory();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    console.error('toggleFavCard:', e);
  }
};

// ── Добавление карточки в инвентарь (с группировкой) ────────
export async function addCardToInventory(cardId, isCustom = false) {
  if (!_auth?.currentUser || !_db) return false;
  
  try {
    const userRef = doc(_db, 'users', _auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const inv = snap.data()?.inventory || {};
    
    if (isCustom) {
      const customObj = inv.customCardsStacked || {};
      customObj[cardId] = (customObj[cardId] || 0) + 1;
      await updateDoc(userRef, { 'inventory.customCardsStacked': customObj });
    } else {
      const cardsObj = inv.cardsStacked || {};
      cardsObj[cardId] = (cardsObj[cardId] || 0) + 1;
      await updateDoc(userRef, { 'inventory.cardsStacked': cardsObj });
    }
    
    return true;
  } catch(e) {
    console.error('addCardToInventory:', e);
    return false;
  }
}

// ── Открытие модального окна продажи ──────────────────────────
window.openSellCardModal = function(cardId, isCustom, count, sellPrice) {
  const modal = document.getElementById('m-sell-card');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModals()">
      <div class="modal-content" style="max-width:400px;">
        <div class="modal-header">
          <h2>Продать карточку</h2>
          <button class="modal-close" onclick="closeModals()"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:16px;">Доступно: <strong>x${count}</strong></p>
          <label style="display:block;margin-bottom:12px;">
            Количество для продажи:
            <input type="number" id="sell-card-qty" min="1" max="${count}" value="1" style="width:100%;padding:8px;margin-top:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--input-bg);color:var(--text);">
          </label>
          <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px;">
            Получите: <strong id="sell-card-total"><i class="fas fa-coins"></i> ${sellPrice} VC</strong>
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModals()">Отмена</button>
          <button class="btn btn-blue" onclick="confirmSellCard('${esc(cardId)}', ${isCustom}, ${sellPrice})">Продать</button>
        </div>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
  
  // Обновляем сумму при изменении количества
  document.getElementById('sell-card-qty').addEventListener('input', function() {
    const qty = parseInt(this.value) || 1;
    const total = qty * sellPrice;
    document.getElementById('sell-card-total').innerHTML = `<i class="fas fa-coins"></i> ${total} VC`;
  });
};

window.confirmSellCard = async function(cardId, isCustom, baseSellPrice) {
  const qty = parseInt(document.getElementById('sell-card-qty')?.value) || 1;
  const totalPrice = qty * baseSellPrice;
  
  const { userData } = _getState();
  if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
  
  try {
    const userRef = doc(_db, 'users', _auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const inv = snap.data()?.inventory || {};
    
    if (isCustom) {
      const customObj = inv.customCardsStacked || {};
      if (!customObj[cardId] || customObj[cardId] < qty) return showToast('Недостаточно карточек', 'error');
      
      customObj[cardId] -= qty;
      if (customObj[cardId] === 0) delete customObj[cardId];
      
      await updateDoc(userRef, { 'inventory.customCardsStacked': customObj });
    } else {
      const cardsObj = inv.cardsStacked || {};
      if (!cardsObj[cardId] || cardsObj[cardId] < qty) return showToast('Недостаточно карточек', 'error');
      
      cardsObj[cardId] -= qty;
      if (cardsObj[cardId] === 0) delete cardsObj[cardId];
      
      await updateDoc(userRef, { 'inventory.cardsStacked': cardsObj });
    }
    
    // Добавляем VCoins
    if (window.awardVCoins) await window.awardVCoins(totalPrice, `Продажа карточек (x${qty})`);
    
    showToast(`<i class="fas fa-coins"></i> Продано за ${totalPrice} VC!`);
    closeModals();
    await loadInventory();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    console.error('confirmSellCard:', e);
  }
};

// ── Открытие модального окна дарения ──────────────────────────
window.openGiftCardModal = function(cardId, isCustom, count) {
  const modal = document.getElementById('m-gift-card');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModals()">
      <div class="modal-content" style="max-width:450px;">
        <div class="modal-header">
          <h2>Подарить карточку</h2>
          <button class="modal-close" onclick="closeModals()"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:16px;">Доступно: <strong>x${count}</strong></p>
          
          <label style="display:block;margin-bottom:12px;">
            Поиск получателя:
            <input type="text" id="gift-recipient-search" placeholder="Введите никнейм..." style="width:100%;padding:8px;margin-top:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--input-bg);color:var(--text);" oninput="searchGiftRecipient()">
          </label>
          
          <div id="gift-recipient-results" style="max-height:200px;overflow-y:auto;margin-bottom:16px;border:1px solid var(--border);border-radius:var(--radius);padding:8px;background:var(--card-bg);display:none;">
          </div>
          
          <div id="gift-recipient-selected" style="margin-bottom:16px;padding:12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius);display:none;">
            <strong>Получатель:</strong> <span id="gift-recipient-name"></span>
          </div>
          
          <label style="display:block;margin-bottom:16px;">
            Количество для дарения:
            <input type="number" id="gift-card-qty" min="1" max="${count}" value="1" style="width:100%;padding:8px;margin-top:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--input-bg);color:var(--text);">
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModals()">Отмена</button>
          <button class="btn btn-blue" onclick="confirmGiftCard('${esc(cardId)}', ${isCustom})">Подарить</button>
        </div>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
  window._giftCardId = cardId;
  window._giftCardIsCustom = isCustom;
  window._giftRecipientUid = null;
};

window.searchGiftRecipient = async function() {
  const query = document.getElementById('gift-recipient-search')?.value.trim() || '';
  const resultsDiv = document.getElementById('gift-recipient-results');
  
  if (!query || query.length < 2) {
    resultsDiv.style.display = 'none';
    return;
  }
  
  try {
    const snap = await getDocs(collection(_db, 'users'));
    const qLower = query.toLowerCase();
    const results = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => {
        const nick = (u.nickname || '').toLowerCase();
        return nick.includes(qLower) && u.id !== _auth.currentUser.uid;
      })
      .slice(0, 10);
    
    if (results.length === 0) {
      resultsDiv.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:8px;">Не найдено</p>';
      resultsDiv.style.display = 'block';
      return;
    }
    
    resultsDiv.innerHTML = results.map(u => `
      <div style="padding:8px;cursor:pointer;border-radius:4px;hover:background:var(--border);" onclick="selectGiftRecipient('${u.id}', '${esc(u.nickname)}')">
        <strong>${esc(u.nickname)}</strong>
        <span style="color:var(--text-dim);font-size:12px;"> · ${u.subscribers || 0} подписчиков</span>
      </div>
    `).join('');
    
    resultsDiv.style.display = 'block';
  } catch(e) {
    console.error('searchGiftRecipient:', e);
  }
};

window.selectGiftRecipient = function(uid, nickname) {
  window._giftRecipientUid = uid;
  document.getElementById('gift-recipient-search').value = nickname;
  document.getElementById('gift-recipient-results').style.display = 'none';
  document.getElementById('gift-recipient-selected').style.display = 'block';
  document.getElementById('gift-recipient-name').textContent = nickname;
};

window.confirmGiftCard = async function(cardId, isCustom) {
  if (!window._giftRecipientUid) return showToast('Выберите получателя', 'error');
  
  const qty = parseInt(document.getElementById('gift-card-qty')?.value) || 1;
  const { userData } = _getState();
  
  if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
  
  try {
    const senderRef = doc(_db, 'users', _auth.currentUser.uid);
    const recipientRef = doc(_db, 'users', window._giftRecipientUid);
    
    const senderSnap = await getDoc(senderRef);
    const recipientSnap = await getDoc(recipientRef);
    
    const senderInv = senderSnap.data()?.inventory || {};
    const recipientInv = recipientSnap.data()?.inventory || {};
    
    if (isCustom) {
      const senderCustom = senderInv.customCardsStacked || {};
      if (!senderCustom[cardId] || senderCustom[cardId] < qty) return showToast('Недостаточно карточек', 'error');
      
      senderCustom[cardId] -= qty;
      if (senderCustom[cardId] === 0) delete senderCustom[cardId];
      
      const recipientCustom = recipientInv.customCardsStacked || {};
      recipientCustom[cardId] = (recipientCustom[cardId] || 0) + qty;
      
      await updateDoc(senderRef, { 'inventory.customCardsStacked': senderCustom });
      await updateDoc(recipientRef, { 'inventory.customCardsStacked': recipientCustom });
    } else {
      const senderCards = senderInv.cardsStacked || {};
      if (!senderCards[cardId] || senderCards[cardId] < qty) return showToast('Недостаточно карточек', 'error');
      
      senderCards[cardId] -= qty;
      if (senderCards[cardId] === 0) delete senderCards[cardId];
      
      const recipientCards = recipientInv.cardsStacked || {};
      recipientCards[cardId] = (recipientCards[cardId] || 0) + qty;
      
      await updateDoc(senderRef, { 'inventory.cardsStacked': senderCards });
      await updateDoc(recipientRef, { 'inventory.cardsStacked': recipientCards });
    }
    
    showToast(`<i class="fas fa-gift"></i> Подарено x${qty} карточек!`);
    closeModals();
    await loadInventory();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    console.error('confirmGiftCard:', e);
  }
};

// ── Инициализация ────────────────────────────────────────────
export function bindInventory(db, auth, getState) {
  _db = db;
  _auth = auth;
  _getState = getState;
  
  window.loadInventory = loadInventory;
}
