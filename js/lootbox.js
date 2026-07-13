// ============================================================
// js/lootbox.js — Мини-игра: Открытие ящиков (V2.3 Advanced)
// ============================================================

import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';
import { getRarityByCat, RARITIES, renderCard, addCardToInventory } from './inventory.js';

let _db, _auth, _getState;

// ── Цены ящиков ────────────────────────────────────────────────
const BOXES = [
  { 
    id: 'box_common', name: 'Обычный ящик', icon: '📦', price: 50, 
    weights: { common: 65, rare: 20, epic: 4, legendary: 1, miss: 10 } 
  },
  { 
    id: 'box_rare', name: 'Редкий ящик', icon: '💎', price: 150, 
    weights: { common: 25, rare: 45, epic: 20, legendary: 5, miss: 5 } 
  },
  { 
    id: 'box_legendary', name: 'Легендарный ящик', icon: '👑', price: 400, 
    weights: { common: 0, rare: 10, epic: 50, legendary: 38, miss: 2 } 
  },
];

// ── Взвешенный случайный выбор редкости ───────────────────────
function pickRarity(weights, consecutiveWins = 0) {
  // Применяем лототрон: увеличиваем шанс "miss" при серии побед
  const adjustedWeights = { ...weights };
  if (consecutiveWins > 0) {
    const penalty = consecutiveWins * 10;
    adjustedWeights.miss = (adjustedWeights.miss || 0) + penalty;
  }

  const total = Object.values(adjustedWeights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, w] of Object.entries(adjustedWeights)) {
    r -= w;
    if (r <= 0) return rarity;
  }
  return 'common';
}

// ── Открытие ящика ─────────────────────────────────────────────
window.openLootbox = async function(boxId) {
  const { userData } = _getState();
  if (!userData) return showToast('Войдите в аккаунт', 'error');
  
  const box = BOXES.find(b => b.id === boxId);
  if (!box) return;
  
  const balance = userData.vcoins || 0;
  if (balance < box.price) return showToast(`Недостаточно VCoins!`, 'error');
  
  const ok = await window.spendVCoinsGlobal(box.price, `Открытие: ${box.name}`);
  if (!ok) return;

  try {
    // Получаем серию побед для лототрона
    const winStreak = userData.lootboxStreak || 0;

    const [teamSnap, customSnap] = await Promise.all([
      getDocs(query(collection(_db, 'team'), orderBy('order'))),
      getDocs(collection(_db, 'custom_cards'))
    ]);
    
    const allMembers = teamSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const customCards = customSnap.docs.map(d => ({ id: d.id, ...d.data(), isCustom: true }));
    
    // 1. Проверка на редкость "miss" (Промах)
    const rarity = pickRarity(box.weights, winStreak);
    
    if (rarity === 'miss') {
      userData.lootboxStreak = 0; // Сброс серии
      await updateDoc(doc(_db, 'users', _auth.currentUser.uid), { lootboxStreak: 0 });
      showMissReveal(box);
      return;
    }

    // 2. Проверка кастомных (в т.ч. секретных) карточек
    let winner = null;
    let winnerRarity = rarity;
    let isCustomWinner = false;

    // Сначала ищем среди кастомных подходящей редкости
    const poolCustom = customCards.filter(c => c.rarity === rarity);
    if (poolCustom.length > 0 && Math.random() < 0.3) { // 30% шанс на кастомную если редкость совпала
      winner = poolCustom[Math.floor(Math.random() * poolCustom.length)];
      isCustomWinner = true;
    }

    // 3. Если не выпала кастомная — обычная логика
    if (!winner) {
      let pool = allMembers.filter(m => getRarityByCat(m.cat) === rarity);
      if (!pool.length) pool = allMembers;
      winner = pool[Math.floor(Math.random() * pool.length)];
      winnerRarity = rarity;
    }

    // Обновляем серию побед
    const newStreak = winStreak + 1;
    await updateDoc(doc(_db, 'users', _auth.currentUser.uid), { lootboxStreak: newStreak });
    userData.lootboxStreak = newStreak;

    // Сохраняем в инвентарь
    await addCardToInventory(winner.id, isCustomWinner);
    
    // Показываем анимацию
    showCardReveal(winner, winnerRarity, box, isCustomWinner);
    
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    console.error('openLootbox:', e);
  }
};

// ── Анимация промаха ──────────────────────────────────────────
function showMissReveal(box) {
  const overlay = document.createElement('div');
  overlay.className = 'lb-reveal-overlay lb-reveal-overlay--visible';
  overlay.innerHTML = `
    <div class="lb-reveal-bg" style="background: #1a1a1a;"></div>
    <div class="lb-reveal-box-wrap lb-box--shake">
      <div class="lb-reveal-box" style="filter: grayscale(1); opacity: 0.5;">
        <div class="lb-reveal-box-icon">💨</div>
      </div>
    </div>
    <div class="lb-reveal-card-wrap" style="display:flex; flex-direction:column; align-items:center; gap:20px;">
      <div class="inv-card inv-card--common" style="filter: grayscale(1); border: 2px dashed #444;">
        <div class="inv-card__img-wrap" style="display:flex; align-items:center; justify-content:center; font-size:48px;">
          ❌
        </div>
        <div class="inv-card__body" style="text-align:center;">
          <div class="inv-card__name">ПРОМАХ</div>
          <div class="inv-card__role">Вам не повезло</div>
          <div class="inv-card__desc">В этот раз ящик оказался пустым...</div>
        </div>
      </div>
      <button class="btn btn-outline" onclick="this.closest('.lb-reveal-overlay').remove()">Закрыть</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ── Анимация раскрытия (улучшенная) ───────────────────────────
function showCardReveal(member, rarity, box, isCustom) {
  const r = RARITIES[rarity] || RARITIES.common;
  const isSecret = isCustom && member.isSecret;
  
  const overlay = document.createElement('div');
  overlay.id = 'lootbox-reveal-overlay';
  overlay.className = 'lb-reveal-overlay';
  
  // Рендерим карточку (если секретная — скрываем данные для анимации)
  const cardHtml = renderCard({ ...member, rarity }, { 
    showActions: false, 
    showDesc: true, 
    hideSecret: isSecret 
  });

  overlay.innerHTML = `
    <div class="lb-reveal-bg" style="--rarity-color:${r.color};--rarity-glow:${r.glow};"></div>
    <div class="lb-reveal-box-wrap" id="lb-box-wrap">
      <div class="lb-reveal-box" style="background:${box.gradient};border-color:${box.border};">
        <div class="lb-reveal-box-icon">${box.icon}</div>
      </div>
      <p class="lb-reveal-tap-hint">Нажмите, чтобы открыть</p>
    </div>
    <div class="lb-reveal-card-wrap" id="lb-card-wrap" style="display:none;">
      <div class="lb-reveal-card-inner">
        ${cardHtml}
        ${isSecret ? '<div class="lb-secret-badge">🤐 СОВЕРШЕННО СЕКРЕТНО</div>' : ''}
      </div>
      <div class="lb-reveal-rarity-text" style="color:${r.color};">
        ${isSecret ? 'ТОП-СИКРЕТ' : r.label.toUpperCase()}
      </div>
      <div class="lb-reveal-actions">
        <button class="btn lb-btn-keep" onclick="keepCard()">🎒 В инвентарь</button>
        ${!isSecret ? `<button class="btn lb-btn-sell" onclick="quickSellCard('${esc(member.id)}', ${r.sellPrice}, ${isCustom})">💰 Продать за ${r.sellPrice} VC</button>` : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('lb-reveal-overlay--visible'));

  const boxWrap = document.getElementById('lb-box-wrap');
  boxWrap.onclick = () => {
    boxWrap.classList.add('lb-box--explode');
    setTimeout(() => {
      boxWrap.style.display = 'none';
      const cardWrap = document.getElementById('lb-card-wrap');
      cardWrap.style.display = 'flex';
      cardWrap.classList.add('lb-card--appear');
    }, 500);
  };
}

window.keepCard = () => {
  showToast('🎒 Карточка добавлена в инвентарь!');
  document.getElementById('lootbox-reveal-overlay')?.remove();
};

export function bindLootbox(db, auth, getState) {
  _db = db;
  _auth = auth;
  _getState = getState;
}
