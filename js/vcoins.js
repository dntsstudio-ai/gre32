// ============================================================
//  js/vcoins.js — VCoins: баланс, магазин, игры, переводы
// ============================================================

import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
    collection, query, orderBy, where, increment, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, showVCoinsPopup } from './core.js';
import { VCOINS_DEFAULT_PRICES } from '../config/config.js';
import { checkAndAwardAch } from './achievements.js';

let _prices   = { ...VCOINS_DEFAULT_PRICES };
let _db, _auth, _getState;

async function loadPrices() {
    try {
        const snap = await getDoc(doc(_db, 'settings', 'vcoins'));
        if (snap.exists()) _prices = { ..._prices, ...snap.data().prices };
    } catch(e) {}
}

// ── Начислить VCoins ──
export async function awardVCoins(amount, reason) {
    if (!_auth?.currentUser) return;
    const uid = _auth.currentUser.uid;
    const { userData } = _getState();
    if (!userData) return;
    try {
        await updateDoc(doc(_db, 'users', uid), { vcoins: increment(amount) });
        userData.vcoins = (userData.vcoins || 0) + amount;
        const el = document.getElementById('u-vcoins');
        if (el) el.textContent = userData.vcoins;
        const shopBal = document.getElementById('sn-shop-balance');
        if (shopBal) shopBal.textContent = userData.vcoins;
        showVCoinsPopup(amount, reason);
        await addDoc(collection(_db, `users/${uid}/vcoinLog`), { amount, reason, date: Date.now(), type: 'earn' });
        if (userData.vcoins >= 1000) await checkAndAwardAch(_db, _auth, userData, 'vcoins_1000');
    } catch(e) { console.warn('awardVCoins:', e); }
}

// ── Списать VCoins ──
async function spendVCoins(amount, reason) {
    const { userData } = _getState();
    if (!userData) return false;
    const balance = userData.vcoins || 0;
    if (balance < amount) { showToast('Недостаточно VCoins!', 'error'); return false; }
    const uid = _auth.currentUser.uid;
    try {
        await updateDoc(doc(_db, 'users', uid), { vcoins: increment(-amount) });
        userData.vcoins = balance - amount;
        const el = document.getElementById('u-vcoins');
        if (el) el.textContent = userData.vcoins;
        const shopBal = document.getElementById('sn-shop-balance');
        if (shopBal) shopBal.textContent = userData.vcoins;
        await addDoc(collection(_db, `users/${uid}/vcoinLog`), { amount: -amount, reason, date: Date.now(), type: 'spend' });
        return true;
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); return false; }
}

// ── Подарить VCoins ──
async function giftVCoins(targetUid, targetNick, amount) {
    const { userData } = _getState();
    if (!userData) return;
    if (amount <= 0) return showToast('Введите корректную сумму', 'error');
    const ok = await spendVCoins(amount, 'Подарок → ' + targetNick);
    if (!ok) return;
    try {
        await updateDoc(doc(_db, 'users', targetUid), { vcoins: increment(amount) });
        await addDoc(collection(_db, `users/${targetUid}/vcoinLog`), { amount, reason: 'Подарок от ' + userData.nickname, date: Date.now(), type: 'gift' });
        await addDoc(collection(_db, `users/${targetUid}/notifications`), { type:'gift', text: userData.nickname + ' подарил вам ' + amount + ' VCoins!', date: Date.now(), read: false, icon: '🎁' });
        showToast('🎁 Отправлено ' + amount + ' VC → ' + targetNick + '!');
        closeModals();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

const SHOP_ITEMS = [
    { id:'colorNick',    icon:'🎨', name:'Цветной никнейм',    desc:'Выберите цвет своего никнейма', type:'color',  priceKey:'colorNick' },
    { id:'prefix_vip',   icon:'⭐', name:'Префикс [VIP]',     desc:'Отображается перед вашим ником', type:'prefix', value:'VIP',    priceKey:'prefix' },
    { id:'prefix_pro',   icon:'🔥', name:'Префикс [PRO]',     desc:'Отображается перед вашим ником', type:'prefix', value:'PRO',    priceKey:'prefix' },
    { id:'prefix_fan',   icon:'🎭', name:'Префикс [FAN]',     desc:'Отображается перед вашим ником', type:'prefix', value:'FAN',    priceKey:'prefix' },
    { id:'prefix_legend',icon:'👑', name:'Префикс [LEGEND]',  desc:'Отображается перед вашим ником', type:'prefix', value:'LEGEND', priceKey:'prefix' },
];

const NICK_COLORS = [
    { name:'Фиолетовый', hex:'#a78bfa' }, { name:'Бирюзовый', hex:'#5eead4' },
    { name:'Золотой',    hex:'#fbbf24' }, { name:'Розовый',   hex:'#f472b6' },
    { name:'Красный',    hex:'#f87171' }, { name:'Зелёный',   hex:'#4ade80' },
    { name:'Небесный',   hex:'#38bdf8' }, { name:'Белый',     hex:'#f0eeff' },
];

function renderShopPage() {
    const wrap = document.getElementById('shop-wrap');
    if (!wrap) return;
    const { userData } = _getState();
    const balance = userData?.vcoins || 0;

    wrap.innerHTML = `
    <div class="shop-balance-bar">
        <div class="shop-balance-inner">
            <span class="shop-balance-icon">🪙</span>
            <span class="shop-balance-val">${balance}</span>
            <span class="shop-balance-label">VCoins</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="openGiftModal()"><i class="fas fa-gift"></i> Подарить</button>
        <button class="btn btn-outline btn-sm" onclick="openVcoinHistory()"><i class="fas fa-history"></i> История</button>
    </div>

    <div class="shop-section-title">🎨 Кастомизация профиля</div>
    <div class="shop-grid">
        ${SHOP_ITEMS.map(item => {
            const price = _prices[item.priceKey] || 999;
            const owned = userData?.shopItems?.includes(item.id);
            return `<div class="shop-card ${owned ? 'shop-card--owned' : ''}">
                <div class="shop-card-icon">${item.icon}</div>
                <div class="shop-card-name">${esc(item.name)}</div>
                <div class="shop-card-desc">${esc(item.desc)}</div>
                <div class="shop-card-footer">
                    <span class="shop-price">🪙 ${price}</span>
                    ${owned
                        ? `<button class="btn btn-sm" style="background:var(--teal);" onclick="activateShopItem('${item.id}')">Активировать</button>`
                        : `<button class="btn btn-sm btn-blue" onclick="buyShopItem('${item.id}')">Купить</button>`}
                </div>
            </div>`;
        }).join('')}
    </div>

    <div class="shop-section-title" style="margin-top:32px;">🎮 Мини-игры</div>
    <div class="shop-grid shop-grid--games">
        <div class="shop-game-card" onclick="openGame('coinflip')">
            <div class="shop-game-icon">🪙</div>
            <div class="shop-game-name">Монетка</div>
            <div class="shop-game-desc">Орёл или решка — удвой ставку</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="openGame('slots')">
            <div class="shop-game-icon">🎰</div>
            <div class="shop-game-name">Слоты</div>
            <div class="shop-game-desc">Три символа — выиграй до 10× ставки</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="openGame('rocket')">
            <div class="shop-game-icon">🚀</div>
            <div class="shop-game-name">Ракета</div>
            <div class="shop-game-desc">Чем дольше летит — тем больше множитель</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
    </div>`;
}

async function buyShopItem(itemId) {
    const { userData } = _getState();
    if (!userData) return showToast('Войдите в аккаунт', 'error');
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    const price = _prices[item.priceKey] || 999;
    if (item.type === 'color') {
        document.getElementById('m-nick-color').style.display = 'flex';
        const ncPrice = document.getElementById('nc-price');
        if (ncPrice) ncPrice.textContent = price;
        window._pendingColorBuy = price;
        return;
    }
    const ok = await spendVCoins(price, 'Покупка: ' + item.name);
    if (!ok) return;
    const owned = [...(userData.shopItems || []), itemId];
    try {
        await updateDoc(doc(_db, 'users', _auth.currentUser.uid), { shopItems: owned });
        userData.shopItems = owned;
        showToast('✅ Куплено: ' + item.name);
        renderShopPage();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

async function activateShopItem(itemId) {
    const { userData } = _getState();
    if (!userData) return;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    const uid = _auth.currentUser.uid;
    if (item.type === 'prefix') {
        try {
            await updateDoc(doc(_db, 'users', uid), { activePrefix: item.value });
            userData.activePrefix = item.value;
            showToast('Префикс [' + item.value + '] активирован!');
            renderShopPage();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    }
}

function openGame(type) {
    const { userData } = _getState();
    if (!userData) return showToast('Войдите в аккаунт', 'error');
    document.getElementById('m-game').style.display = 'flex';
    renderGame(type);
}

function renderGame(type) {
    const wrap = document.getElementById('game-wrap');
    if (!wrap) return;
    const { userData } = _getState();
    const balance = userData?.vcoins || 0;

    if (type === 'coinflip') {
        wrap.innerHTML = `
        <div class="game-header"><div class="game-title">🪙 Монетка</div><div class="game-balance">Баланс: <b>${balance} VC</b></div></div>
        <div class="game-desc">Угадай — орёл или решка. Угадал — удваиваешь. Нет — теряешь.</div>
        <div class="game-coin-display" id="game-coin-img">🪙</div>
        <div class="game-bet-row">
            <label class="order-label">Ставка (VC)</label>
            <input type="number" id="game-bet" min="1" max="${balance}" value="10" style="text-align:center;max-width:140px;margin:0 auto;">
        </div>
        <div style="display:flex;gap:12px;margin-top:18px;justify-content:center;">
            <button class="btn btn-purple" onclick="playCoinflip('heads')">👑 Орёл</button>
            <button class="btn btn-blue"   onclick="playCoinflip('tails')">🪙 Решка</button>
        </div>
        <div id="game-result" style="margin-top:20px;text-align:center;font-size:1.1rem;font-weight:700;min-height:32px;"></div>`;
    } else if (type === 'slots') {
        wrap.innerHTML = `
        <div class="game-header"><div class="game-title">🎰 Слоты</div><div class="game-balance">Баланс: <b>${balance} VC</b></div></div>
        <div class="game-desc">3 одинаковых символа — выигрыш!</div>
        <div class="slots-display" id="slots-display">
            <div class="slot-reel" id="reel-0">❓</div>
            <div class="slot-reel" id="reel-1">❓</div>
            <div class="slot-reel" id="reel-2">❓</div>
        </div>
        <div class="game-bet-row">
            <label class="order-label">Ставка (VC)</label>
            <input type="number" id="game-bet" min="1" max="${balance}" value="10" style="text-align:center;max-width:140px;margin:0 auto;">
        </div>
        <button class="btn btn-purple" style="width:100%;margin-top:16px;" onclick="playSlots()">🎰 Крутить!</button>
        <div id="game-result" style="margin-top:16px;text-align:center;font-size:1.1rem;font-weight:700;min-height:32px;"></div>`;
    } else if (type === 'rocket') {
        wrap.innerHTML = `
        <div class="game-header"><div class="game-title">🚀 Ракета</div><div class="game-balance">Баланс: <b>${balance} VC</b></div></div>
        <div class="game-desc">Ракета взлетает — множитель растёт. Нажми «Забрать» до взрыва!</div>
        <div class="rocket-display">
            <div class="rocket-multiplier" id="rocket-mult">1.00×</div>
            <div class="rocket-ship" id="rocket-ship">🚀</div>
        </div>
        <div class="game-bet-row">
            <label class="order-label">Ставка (VC)</label>
            <input type="number" id="game-bet" min="1" max="${balance}" value="10" style="text-align:center;max-width:140px;margin:0 auto;">
        </div>
        <div style="display:flex;gap:12px;margin-top:16px;justify-content:center;">
            <button class="btn btn-purple" id="rocket-start-btn" onclick="startRocket()">🚀 Запустить</button>
            <button class="btn btn-blue"   id="rocket-cash-btn"  onclick="cashOutRocket()" disabled style="opacity:0.5;">💰 Забрать</button>
        </div>
        <div id="game-result" style="margin-top:16px;text-align:center;font-size:1.1rem;font-weight:700;min-height:32px;"></div>`;
    }

    const titleEl = document.getElementById('m-game-title');
    if (titleEl) titleEl.textContent = type==='coinflip'?'🪙 Монетка':type==='slots'?'🎰 Слоты':'🚀 Ракета';
    window._currentGame = type;
}

window.playCoinflip = async function(choice) {
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet <= 0) return showToast('Введите ставку', 'error');
    const ok = await spendVCoins(bet, 'Монетка — ставка');
    if (!ok) return;
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const win    = result === choice;
    const imgEl  = document.getElementById('game-coin-img');
    if (imgEl) { imgEl.textContent=''; imgEl.classList.add('spinning'); }
    setTimeout(async () => {
        if (imgEl) { imgEl.classList.remove('spinning'); imgEl.textContent = result==='heads'?'👑':'🪙'; }
        const resEl = document.getElementById('game-result');
        if (win) {
            await awardVCoins(bet*2, 'Монетка — выигрыш');
            if (resEl) resEl.innerHTML = `<span style="color:var(--teal)">✅ Выигрыш! +${bet} VC</span>`;
            await checkAndAwardAch(_db, _auth, userData, 'game_win');
        } else {
            if (resEl) resEl.innerHTML = `<span style="color:#ef4444">❌ Проигрыш! -${bet} VC</span>`;
        }
        const balEl = document.querySelector('.game-balance b');
        if (balEl) balEl.textContent = (userData?.vcoins||0) + ' VC';
    }, 900);
};

const SLOT_SYMBOLS = ['🍒','🍊','🍋','⭐','💎','7️⃣','🎭'];
window.playSlots = async function() {
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet <= 0) return showToast('Введите ставку', 'error');
    const ok = await spendVCoins(bet, 'Слоты — ставка');
    if (!ok) return;
    let ticks = 0;
    const interval = setInterval(() => {
        [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.textContent=SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]; });
        ticks++;
        if (ticks >= 15) {
            clearInterval(interval);
            const reels = [0,1,2].map(() => SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]);
            [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.textContent=reels[i]; });
            let mult = 0;
            if (reels[0]===reels[1]&&reels[1]===reels[2]) { mult = reels[0]==='7️⃣'?10:reels[0]==='💎'?7:5; }
            else if (reels[0]===reels[1]||reels[1]===reels[2]||reels[0]===reels[2]) { mult = 3; }
            (async () => {
                const resEl = document.getElementById('game-result');
                if (mult > 0) {
                    const prize = bet*mult;
                    await awardVCoins(prize, 'Слоты — выигрыш ×'+mult);
                    if (resEl) resEl.innerHTML=`<span style="color:var(--teal)">🎉 ×${mult} Выигрыш! +${prize-bet} VC</span>`;
                    await checkAndAwardAch(_db, _auth, userData, 'game_win');
                } else {
                    if (resEl) resEl.innerHTML=`<span style="color:#ef4444">❌ Нет совпадений. -${bet} VC</span>`;
                }
                const balEl = document.querySelector('.game-balance b');
                if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
            })();
        }
    }, 80);
};

let _rocketInterval=null, _rocketMult=1.0, _rocketBet=0, _rocketRunning=false, _rocketCrashAt=1.0;

window.startRocket = async function() {
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet<=0) return showToast('Введите ставку','error');
    if (_rocketRunning) return;
    const ok = await spendVCoins(bet, 'Ракета — ставка');
    if (!ok) return;
    // Жёсткое ограничение ставки — не более 100 VC за раз
    const cappedBet = Math.min(bet, 100);
    _rocketBet=cappedBet; _rocketMult=1.0; _rocketRunning=true;
    // Жёсткие шансы: ракета взрывается очень рано в большинстве случаев
    // 50% шанс взрыва почти сразу (1.0x - 1.2x)
    // 35% шанс взрыва до 1.8x
    // 14% шанс взрыва до 3.0x
    //  1% шанс долететь до 3.0x - 4.0x (максимум!)
    const rand = Math.random();
    if (rand < 0.50) {
        _rocketCrashAt = 1.0 + Math.random() * 0.2;
    } else if (rand < 0.85) {
        _rocketCrashAt = 1.2 + Math.random() * 0.6;
    } else if (rand < 0.99) {
        _rocketCrashAt = 1.8 + Math.random() * 1.2;
    } else {
        _rocketCrashAt = 3.0 + Math.random() * 1.0;
    }
    const startBtn = document.getElementById('rocket-start-btn');
    const cashBtn  = document.getElementById('rocket-cash-btn');
    if (startBtn) { startBtn.disabled=true; startBtn.style.opacity='0.5'; }
    if (cashBtn)  { cashBtn.disabled=false; cashBtn.style.opacity='1'; }
    document.getElementById('game-result').textContent='';
    const ship = document.getElementById('rocket-ship');
    let pos = 0;
    _rocketInterval = setInterval(async () => {
        _rocketMult += 0.05; pos = Math.min(pos+2, 120);
        const multEl = document.getElementById('rocket-mult');
        if (multEl) multEl.textContent = _rocketMult.toFixed(2)+'×';
        if (ship) ship.style.transform = `translateY(-${pos}px)`;
        if (_rocketMult >= _rocketCrashAt) {
            clearInterval(_rocketInterval); _rocketRunning=false;
            if (ship) ship.textContent='💥';
            const resEl = document.getElementById('game-result');
            if (resEl) resEl.innerHTML=`<span style="color:#ef4444">💥 Взрыв на ${_rocketMult.toFixed(2)}×! Проигрыш -${_rocketBet} VC</span>`;
            if (startBtn) { startBtn.disabled=false; startBtn.style.opacity='1'; }
            if (cashBtn)  { cashBtn.disabled=true;   cashBtn.style.opacity='0.5'; }
            const balEl = document.querySelector('.game-balance b');
            if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
        }
    }, 100);
};

window.cashOutRocket = async function() {
    if (!_rocketRunning) return;
    clearInterval(_rocketInterval); _rocketRunning=false;
    const { userData } = _getState();
    // Максимальный выигрыш ограничен 400 VC (100 ставка × 4.0x)
    const rawPrize = Math.floor(_rocketBet * _rocketMult);
    const prize = Math.min(rawPrize, 400);
    await awardVCoins(prize, 'Ракета — выигрыш ×'+_rocketMult.toFixed(2));
    const resEl = document.getElementById('game-result');
    if (resEl) resEl.innerHTML=`<span style="color:var(--teal)">💰 Забрал на ${_rocketMult.toFixed(2)}×! +${prize-_rocketBet} VC</span>`;
    const startBtn = document.getElementById('rocket-start-btn');
    const cashBtn  = document.getElementById('rocket-cash-btn');
    if (startBtn) { startBtn.disabled=false; startBtn.style.opacity='1'; }
    if (cashBtn)  { cashBtn.disabled=true;   cashBtn.style.opacity='0.5'; }
    const balEl = document.querySelector('.game-balance b');
    if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
    if (_rocketMult >= 3) await checkAndAwardAch(_db, _auth, userData, 'game_win');
};

async function openVcoinHistory() {
    if (!_auth?.currentUser) return;
    try {
        const snap = await getDocs(query(collection(_db, `users/${_auth.currentUser.uid}/vcoinLog`), orderBy('date','desc'), limit(30)));
        const logs = snap.docs.map(d => d.data());
        const list = document.getElementById('vcoin-history-list');
        if (list) {
            list.innerHTML = !logs.length
                ? '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет транзакций</p>'
                : logs.map(l => {
                    const plus = l.amount > 0;
                    return `<div class="vcoin-log-row">
                        <span class="vcoin-log-reason">${esc(l.reason)}</span>
                        <span class="vcoin-log-amount ${plus?'vcoin-log--plus':'vcoin-log--minus'}">${plus?'+':''}${l.amount} VC</span>
                        <span class="vcoin-log-date">${new Date(l.date).toLocaleDateString('ru')}</span>
                    </div>`;
                }).join('');
        }
        document.getElementById('m-vcoin-history').style.display = 'flex';
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}
window.openVcoinHistory = openVcoinHistory;

async function openGiftModal() {
    const emailEl  = document.getElementById('gift-nick');
    const amountEl = document.getElementById('gift-amount');
    const infoEl   = document.getElementById('gift-target-info');
    if (emailEl)  emailEl.value  = '';
    if (amountEl) amountEl.value = '';
    if (infoEl)   infoEl.innerHTML = '';
    document.getElementById('m-gift-vcoins').style.display = 'flex';
}
window.openGiftModal = openGiftModal;

window.searchGiftTarget = async function() {
    const nick   = document.getElementById('gift-nick')?.value.trim() || '';
    const info   = document.getElementById('gift-target-info');
    if (!nick || !info) return;
    try {
        const snap = await getDocs(query(collection(_db,'users'), where('nickname','==',nick)));
        if (snap.empty) {
            info.innerHTML = '<p style="color:#ef4444;font-size:12px;">Пользователь не найден</p>';
            window._giftTargetUid = null;
        } else {
            const u = snap.docs[0].data();
            window._giftTargetUid = snap.docs[0].id;
            info.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--input-bg);border-radius:10px;border:1px solid var(--teal);">
                <img src="${esc(u.avatar||'https://api.dicebear.com/7.x/identicon/svg')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"
                     onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                <span style="font-weight:700;">${esc(u.nickname)}</span>
            </div>`;
        }
    } catch(e) { if (info) info.innerHTML = '<p style="color:#ef4444;font-size:12px;">Ошибка поиска</p>'; }
};

window.sendGift = async function() {
    if (!window._giftTargetUid) return showToast('Найдите получателя', 'error');
    const nick   = document.getElementById('gift-nick')?.value.trim()  || '';
    const amount = parseInt(document.getElementById('gift-amount')?.value) || 0;
    if (amount <= 0) return showToast('Введите сумму', 'error');
    await giftVCoins(window._giftTargetUid, nick, amount);
};

async function openVcoinsAdminPanel() {
    await loadPrices();
    const setV = (id, v) => { const el=document.getElementById(id); if(el) el.value=v; };
    setV('price-colorNick', _prices.colorNick || 500);
    setV('price-prefix',    _prices.prefix    || 300);
    setV('price-achSlot',   _prices.achSlot   || 200);
    document.getElementById('m-vcoins-admin').style.display = 'flex';
}
window.openVcoinsAdminPanel = openVcoinsAdminPanel;

window.saveVcoinPrices = async function() {
    const getN = (id) => parseInt(document.getElementById(id)?.value) || 0;
    const prices = { colorNick: getN('price-colorNick')||500, prefix: getN('price-prefix')||300, achSlot: getN('price-achSlot')||200 };
    try {
        await setDoc(doc(_db, 'settings', 'vcoins'), { prices });
        _prices = { ..._prices, ...prices };
        showToast('Цены обновлены!');
        closeModals();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
};

window.selectNickColor = async function(hex) {
    if (!window._pendingColorBuy) return;
    const price = window._pendingColorBuy;
    const ok = await spendVCoins(price, 'Цветной никнейм');
    if (!ok) return;
    const { userData } = _getState();
    const uid = _auth.currentUser.uid;
    try {
        await updateDoc(doc(_db, 'users', uid), { nickColor: hex, shopItems: [...(userData.shopItems||[]), 'colorNick'] });
        userData.nickColor = hex;
        userData.shopItems = [...(userData.shopItems||[]), 'colorNick'];
        showToast('Цвет ника изменён!');
        closeModals();
        renderShopPage();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
};

export function bindVCoins(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.openGame         = openGame;
    window.buyShopItem      = buyShopItem;
    window.activateShopItem = activateShopItem;

    window.loadShopPage = async function() {
        await loadPrices();
        renderShopPage();
    };

    window.renderNickColorPicker = function() {
        const grid = document.getElementById('nc-color-grid');
        if (!grid) return;
        grid.innerHTML = NICK_COLORS.map(c =>
            `<div class="nc-color-swatch" style="background:${c.hex};" title="${c.name}" onclick="selectNickColor('${c.hex}')"></div>`
        ).join('');
    };
}
