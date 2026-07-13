// ============================================================
// js/vcoins.js — Система VCoins (V2.3 с Дневным лимитом)
// ============================================================

import { doc, getDoc, updateDoc, setDoc, collection, addDoc, query, orderBy, limit, getDocs, where, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';

let _db, _auth, _getState;
let _prices = { colorNick: 500, prefix: 300, achSlot: 200 };

// Конфигурация лимитов
const DAILY_LIMIT = 3000;

// ── Проверка и обновление дневного лимита ────────────────────
async function checkDailyLimit(amount) {
  if (!_auth.currentUser) return { allowed: false, reason: 'Auth required' };
  
  const uid = _auth.currentUser.uid;
  const userRef = doc(_db, 'users', uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // ГГГГ-ММ-ДД
  
  const dailyData = data.dailyEarnings || { date: '', total: 0 };
  
  // Если день сменился — сбрасываем лимит
  if (dailyData.date !== todayStr) {
    dailyData.date = todayStr;
    dailyData.total = 0;
  }
  
  const remaining = DAILY_LIMIT - dailyData.total;
  
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, total: dailyData.total };
  }
  
  // Если сумма превышает остаток — даем только остаток
  const allowedAmount = Math.min(amount, remaining);
  
  return { 
    allowed: true, 
    amount: allowedAmount, 
    remaining: remaining - allowedAmount,
    total: dailyData.total + allowedAmount,
    todayStr
  };
}

// ── Начисление VCoins с учетом лимита ────────────────────────
export async function awardVCoins(amount, reason = 'Награда') {
  if (!_auth.currentUser || amount <= 0) return false;
  
  try {
    const limitCheck = await checkDailyLimit(amount);
    
    if (!limitCheck.allowed) {
      showToast(`⚠️ Дневной лимит (3000 VC) исчерпан!`, 'warning');
      return false;
    }
    
    const actualAmount = limitCheck.amount;
    const uid = _auth.currentUser.uid;
    const userRef = doc(_db, 'users', uid);
    
    // Обновляем баланс и дневную статистику
    await updateDoc(userRef, {
      vcoins: increment(actualAmount),
      'dailyEarnings.date': limitCheck.todayStr,
      'dailyEarnings.total': limitCheck.total
    });
    
    // Логируем транзакцию
    await addDoc(collection(_db, `users/${uid}/transactions`), {
      amount: actualAmount,
      reason: reason,
      date: Date.now(),
      type: 'award'
    });
    
    // Обновляем локальное состояние если нужно
    const { userData } = _getState();
    if (userData) {
      userData.vcoins = (userData.vcoins || 0) + actualAmount;
      userData.dailyEarnings = { date: limitCheck.todayStr, total: limitCheck.total };
    }
    
    if (actualAmount < amount) {
      showToast(`💰 Получено ${actualAmount} VC (Лимит!)`);
    } else {
      showToast(`💰 Получено ${actualAmount} VC`);
    }
    
    return true;
  } catch(e) {
    console.error('awardVCoins error:', e);
    return false;
  }
}

// ── Списание VCoins (лимит не применяется) ────────────────────
export async function spendVCoins(amount, reason = 'Покупка') {
  if (!_auth.currentUser || amount <= 0) return false;
  
  const { userData } = _getState();
  const balance = userData?.vcoins || 0;
  
  if (balance < amount) {
    showToast('Недостаточно VCoins!', 'error');
    return false;
  }
  
  try {
    const uid = _auth.currentUser.uid;
    const userRef = doc(_db, 'users', uid);
    
    await updateDoc(userRef, {
      vcoins: increment(-amount)
    });
    
    await addDoc(collection(_db, `users/${uid}/transactions`), {
      amount: -amount,
      reason: reason,
      date: Date.now(),
      type: 'spend'
    });
    
    if (userData) userData.vcoins -= amount;
    
    return true;
  } catch(e) {
    console.error('spendVCoins error:', e);
    showToast('Ошибка транзакции', 'error');
    return false;
  }
}

// ── Лототрон: Динамическая сложность ──────────────────────────
// Вероятность выигрыша падает при серии побед
export function getLotoChance(baseChance, consecutiveWins) {
  // Уменьшаем шанс на 15% за каждую победу подряд
  const penalty = consecutiveWins * 0.15;
  const finalChance = Math.max(0.05, baseChance - penalty); // Минимум 5%
  return finalChance;
}

// ── Инициализация и привязка ──────────────────────────────────
export function bindVCoins(db, auth, getState) {
  _db = db;
  _auth = auth;
  _getState = getState;
  
  window.awardVCoins = awardVCoins;
  window.spendVCoinsGlobal = spendVCoins;
  window.getLotoChance = getLotoChance;
  
  // Прочие функции (оставлены для совместимости)
  window.loadPrices = async () => {
    const snap = await getDoc(doc(_db, 'settings', 'vcoins'));
    if (snap.exists()) _prices = { ..._prices, ...snap.data().prices };
  };
}
