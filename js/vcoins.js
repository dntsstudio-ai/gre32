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
    const ok = await spendVCoins(amount, 'Подарок пользователю ' + targetNick);
    if (!ok) return;
    try {
        await updateDoc(doc(_db, 'users', targetUid), { vcoins: increment(amount) });
        await addDoc(collection(_db, `users/${targetUid}/vcoinLog`), { amount, reason: 'Подарок от ' + userData.nickname, date: Date.now(), type: 'gift' });
        await addDoc(collection(_db, `users/${targetUid}/notifications`), { type:'gift', text: userData.nickname + ' подарил вам ' + amount + ' VCoins!', date: Date.now(), read: false, icon: '<i class="fas fa-gift"></i>' });
        showToast('<i class="fas fa-gift"></i> Отправлено ' + amount + ' VC <i class="fas fa-arrow-right"></i> ' + targetNick + '!');
        closeModals();
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

const SHOP_ITEMS = [
    { id:'colorNick',    icon:'<i class="fas fa-palette"></i>', name:'Цветной никнейм',    desc:'Выберите цвет своего никнейма', type:'color',  priceKey:'colorNick' },
    { id:'prefix_vip',   icon:'<i class="fas fa-star"></i>', name:'Префикс [VIP]',     desc:'Отображается перед вашим ником', type:'prefix', value:'VIP',    priceKey:'prefix' },
    { id:'prefix_pro',   icon:'<i class="fas fa-fire"></i>', name:'Префикс [PRO]',     desc:'Отображается перед вашим ником', type:'prefix', value:'PRO',    priceKey:'prefix' },
    { id:'prefix_fan',   icon:'<i class="fas fa-masks-theater"></i>', name:'Префикс [FAN]',     desc:'Отображается перед вашим ником', type:'prefix', value:'FAN',    priceKey:'prefix' },
    { id:'prefix_legend',icon:'<i class="fas fa-crown"></i>', name:'Префикс [LEGEND]',  desc:'Отображается перед вашим ником', type:'prefix', value:'LEGEND', priceKey:'prefix' },
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
            <span class="shop-balance-icon"><i class="fas fa-coins"></i></span>
            <span class="shop-balance-val">${balance}</span>
            <span class="shop-balance-label">VCoins</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="openGiftModal()"><i class="fas fa-gift"></i> Подарить</button>
        <button class="btn btn-outline btn-sm" onclick="openVcoinHistory()"><i class="fas fa-history"></i> История</button>
    </div>

    <div class="shop-section-title"><i class="fas fa-palette"></i> Кастомизация профиля</div>
    <div class="shop-grid">
        ${SHOP_ITEMS.map(item => {
            const price = _prices[item.priceKey] || 999;
            const owned = userData?.shopItems?.includes(item.id);
            return `<div class="shop-card ${owned ? 'shop-card--owned' : ''}">
                <div class="shop-card-icon">${item.icon}</div>
                <div class="shop-card-name">${esc(item.name)}</div>
                <div class="shop-card-desc">${esc(item.desc)}</div>
                <div class="shop-card-footer">
                    <span class="shop-price"><i class="fas fa-coins"></i> ${price}</span>
                    ${owned
                        ? `<button class="btn btn-sm" style="background:var(--teal);" onclick="activateShopItem('${item.id}')">Активировать</button>`
                        : `<button class="btn btn-sm btn-blue" onclick="buyShopItem('${item.id}')">Купить</button>`}
                </div>
            </div>`;
        }).join('')}
    </div>

    <div class="shop-section-title" style="margin-top:32px;"><i class="fas fa-gamepad"></i> Мини-игры</div>
    <div class="shop-grid shop-grid--games">
        <div class="shop-game-card" onclick="openGame('coinflip')">
            <div class="shop-game-icon"><i class="fas fa-coins"></i></div>
            <div class="shop-game-name">Монетка</div>
            <div class="shop-game-desc">Орёл или решка — удвой ставку</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="openGame('slots')">
            <div class="shop-game-icon"><i class="fas fa-dice"></i></div>
            <div class="shop-game-name">Слоты</div>
            <div class="shop-game-desc">Три символа — выиграй до 10× ставки</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="openGame('rocket')">
            <div class="shop-game-icon"><i class="fas fa-rocket"></i></div>
            <div class="shop-game-name">Ракета</div>
            <div class="shop-game-desc">Чем дольше летит — тем больше множитель</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="openGame('plinko')">
            <div class="shop-game-icon"><i class="fas fa-meteor"></i></div>
            <div class="shop-game-name">Чёрная дыра</div>
            <div class="shop-game-desc">Шарик падает через штыри — попади в множитель</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card shop-game-card--lootbox" onclick="navigate('lootbox')">
            <div class="shop-game-icon"><i class="fas fa-gift"></i></div>
            <div class="shop-game-name">Ящики</div>
            <div class="shop-game-desc">Открывай ящики и собирай карточки участников студии</div>
            <button class="btn btn-sm" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a1a2e;">Открыть</button>
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
        showToast('<i class="fas fa-circle-check"></i> Куплено: ' + item.name);
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
        <div class="game-wrap-inner">
            <div class="game-header">
                <div class="game-title"><i class="fas fa-coins"></i> Монетка</div>
                <div class="game-balance">Баланс: <b>${balance} VC</b></div>
            </div>
            <div class="game-desc">Угадай — орёл или решка. Угадал — удваиваешь. Нет — теряешь.</div>
            <div class="game-coin-arena">
                <div class="game-coin-display" id="game-coin-img"><i class="fas fa-coins"></i></div>
            </div>
            <div class="game-bet-row">
                <label class="order-label">Ставка (VC)</label>
                <input type="number" id="game-bet" min="1" max="${balance}" value="10">
            </div>
            <div class="coin-choice-row">
                <button class="coin-choice-btn coin-btn-heads" id="coin-btn-heads" onclick="playCoinflip('heads')"><i class="fas fa-crown"></i> Орёл</button>
                <button class="coin-choice-btn coin-btn-tails" id="coin-btn-tails" onclick="playCoinflip('tails')"><i class="fas fa-coins"></i> Решка</button>
            </div>
            <div id="game-result"></div>
        </div>`;
    } else if (type === 'slots') {
        wrap.innerHTML = `
        <div class="game-wrap-inner">
            <div class="game-header">
                <div class="game-title"><i class="fas fa-dice"></i> Слоты</div>
                <div class="game-balance">Баланс: <b>${balance} VC</b></div>
            </div>
            <div class="game-desc">3 одинаковых символа — выигрыш! Два совпадения — ×3.</div>
            <div class="slots-arena">
                <div class="slots-display" id="slots-display">
                    <div class="slot-reel" id="reel-0"><i class="fas fa-circle-question"></i></div>
                    <div class="slot-divider"></div>
                    <div class="slot-reel" id="reel-1"><i class="fas fa-circle-question"></i></div>
                    <div class="slot-divider"></div>
                    <div class="slot-reel" id="reel-2"><i class="fas fa-circle-question"></i></div>
                </div>
                <button class="slots-spin-btn" id="slots-spin-btn" onclick="playSlots()"><i class="fas fa-dice"></i> Крутить!</button>
            </div>
            <div class="game-bet-row">
                <label class="order-label">Ставка (VC)</label>
                <input type="number" id="game-bet" min="1" max="${balance}" value="10">
            </div>
            <div id="game-result"></div>
        </div>`;
    } else if (type === 'rocket') {
        wrap.innerHTML = `
        <div class="game-wrap-inner">
            <div class="game-header">
                <div class="game-title"><i class="fas fa-rocket"></i> Ракета</div>
                <div class="game-balance">Баланс: <b>${balance} VC</b></div>
            </div>
            <div class="game-desc">Ракета взлетает — множитель растёт. Забери до взрыва!</div>
            <div class="rocket-arena" id="rocket-arena">
                <div class="rocket-trail" id="rocket-trail"></div>
                <div class="rocket-multiplier" id="rocket-mult">1.00×</div>
                <div class="rocket-ship" id="rocket-ship"><i class="fas fa-rocket"></i></div>
                <div class="rocket-exhaust" id="rocket-exhaust"></div>
            </div>
            <div class="rocket-streak-bar">
                <span>Серия:</span>
                <div class="rocket-streak-dots" id="rocket-streak-dots">
                    <div class="rocket-streak-dot" id="sd0"></div>
                    <div class="rocket-streak-dot" id="sd1"></div>
                    <div class="rocket-streak-dot" id="sd2"></div>
                    <div class="rocket-streak-dot" id="sd3"></div>
                    <div class="rocket-streak-dot" id="sd4"></div>
                </div>
            </div>
            <div class="game-bet-row">
                <label class="order-label">Ставка (VC)</label>
                <input type="number" id="game-bet" min="1" max="${balance}" value="10">
            </div>
            <div class="rocket-actions">
                <button class="rocket-launch-btn" id="rocket-start-btn" onclick="startRocket()"><i class="fas fa-rocket"></i> Запустить</button>
                <button class="rocket-cash-btn" id="rocket-cash-btn" onclick="cashOutRocket()" disabled><i class="fas fa-coins"></i> Забрать</button>
            </div>
            <div id="game-result"></div>
        </div>`;
    } else if (type === 'plinko') {
        if (typeof _renderPlinko === 'function') {
            _renderPlinko(wrap, balance);
        }
    }

    const titleEl = document.getElementById('m-game-title');
    const gameTitles = { coinflip:'<i class="fas fa-coins"></i> Монетка', slots:'<i class="fas fa-dice"></i> Слоты', rocket:'<i class="fas fa-rocket"></i> Ракета', plinko:'<i class="fas fa-meteor"></i> Чёрная дыра' };
    if (titleEl) titleEl.innerHTML = gameTitles[type] || type;
    window._currentGame = type;
}

window.playCoinflip = async function(choice) {
    const btnH = document.getElementById('coin-btn-heads');
    const btnT = document.getElementById('coin-btn-tails');
    if (btnH?.disabled || btnT?.disabled) return; // защита от заклика — розыгрыш уже идёт
    if (btnH) btnH.disabled = true;
    if (btnT) btnT.disabled = true;
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet <= 0) { if(btnH)btnH.disabled=false; if(btnT)btnT.disabled=false; return showToast('Введите ставку', 'error'); }
    const ok = await spendVCoins(bet, 'Монетка — ставка');
    if (!ok) { if(btnH)btnH.disabled=false; if(btnT)btnT.disabled=false; return; }
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const win    = result === choice;
    const imgEl  = document.getElementById('game-coin-img');
    if (imgEl) { imgEl.textContent=''; imgEl.classList.add('spinning'); }
    setTimeout(async () => {
        if (imgEl) { imgEl.classList.remove('spinning'); imgEl.innerHTML = result==='heads'?'<i class="fas fa-crown"></i>':'<i class="fas fa-coins"></i>'; }
        const resEl = document.getElementById('game-result');
        if (win) {
            await awardVCoins(bet*2, 'Монетка — выигрыш');
            if (resEl) resEl.innerHTML = `<span style="color:var(--teal)"><i class="fas fa-circle-check"></i> Выигрыш! +${bet} VC</span>`;
            await checkAndAwardAch(_db, _auth, userData, 'game_win');
        } else {
            if (resEl) resEl.innerHTML = `<span style="color:#ef4444"><i class="fas fa-circle-xmark"></i> Проигрыш! -${bet} VC</span>`;
        }
        const balEl = document.querySelector('.game-balance b');
        if (balEl) balEl.textContent = (userData?.vcoins||0) + ' VC';
        if (btnH) btnH.disabled = false;
        if (btnT) btnT.disabled = false;
    }, 900);
};

const SLOT_SYMBOLS = [
    '<i class="fas fa-fire" style="color:#ef4444;"></i>',
    '<i class="fas fa-sun" style="color:#f97316;"></i>',
    '<i class="fas fa-bolt" style="color:#eab308;"></i>',
    '<i class="fas fa-star" style="color:#facc15;"></i>',
    '<i class="fas fa-gem" style="color:#06b6d4;"></i>',
    '<i class="fas fa-crown" style="color:#facc15;"></i>',
    '<i class="fas fa-masks-theater" style="color:#a855f7;"></i>',
];
const SLOT_JACKPOT_SYMBOL = SLOT_SYMBOLS[5]; // корона — джекпот x10
window.playSlots = async function() {
    const spinBtn = document.getElementById('slots-spin-btn');
    if (spinBtn?.disabled) return; // защита от заклика
    if (spinBtn) spinBtn.disabled = true;
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet <= 0) { if (spinBtn) spinBtn.disabled = false; return showToast('Введите ставку', 'error'); }
    const ok = await spendVCoins(bet, 'Слоты — ставка');
    if (!ok) { if (spinBtn) spinBtn.disabled = false; return; }
    // Анимация вращения барабанов
    [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.classList.add('spinning-reel'); });
    let ticks = 0;
    const interval = setInterval(() => {
        [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.innerHTML=SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]; });
        ticks++;
        if (ticks >= 15) {
            clearInterval(interval);
            [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.classList.remove('spinning-reel'); });
            const reels = [0,1,2].map(() => SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]);
            [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.innerHTML=reels[i]; });
            let mult = 0;
            if (reels[0]===reels[1]&&reels[1]===reels[2]) { mult = reels[0]===SLOT_JACKPOT_SYMBOL?10:7; }
            else if (reels[0]===reels[1]||reels[1]===reels[2]||reels[0]===reels[2]) { mult = 3; }
            (async () => {
                const resEl = document.getElementById('game-result');
                if (mult > 0) {
                    [0,1,2].forEach(i => { const el=document.getElementById('reel-'+i); if(el) el.classList.add('win-reel'); });
                    const prize = bet*mult;
                    await awardVCoins(prize, 'Слоты — выигрыш ×'+mult);
                    if (resEl) resEl.innerHTML=`<span style="color:var(--teal)"><i class="fas fa-champagne-glasses"></i> ×${mult} Выигрыш! +${prize-bet} VC</span>`;
                    await checkAndAwardAch(_db, _auth, userData, 'game_win');
                } else {
                    if (resEl) resEl.innerHTML=`<span style="color:#ef4444"><i class="fas fa-circle-xmark"></i> Нет совпадений. -${bet} VC</span>`;
                }
                const balEl = document.querySelector('.game-balance b');
                if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
                if (spinBtn) spinBtn.disabled = false;
            })();
        }
    }, 80);
};

let _rocketInterval=null, _rocketMult=1.0, _rocketBet=0, _rocketRunning=false, _rocketCrashAt=1.0;

// ── Психологический ИИ ракеты ──
// _rocketAvgBet   — скользящее среднее ставок игрока (обновляется каждый раунд)
// _rocketBetCount — сколько раундов сыграно (для нормализации среднего)
// _rocketWinStreak — победы подряд (для дофаминового разогрева)
let _rocketWinStreak = 0;
let _rocketAvgBet    = 0;
let _rocketBetCount  = 0;

window.startRocket = async function() {
    if (_rocketRunning) return; // защита от заклика
    const { userData } = _getState();
    const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
    if (bet<=0) return showToast('Введите ставку','error');
    _rocketRunning = true;
    const ok = await spendVCoins(bet, 'Ракета — ставка');
    if (!ok) { _rocketRunning = false; return; }

    // Ограничение ставки — не более 500 VC за раз
    const cappedBet = Math.min(bet, 500);
    _rocketBet = cappedBet; _rocketMult = 1.0;

    // ── Обновляем скользящее среднее ставок ──
    _rocketBetCount++;
    _rocketAvgBet = _rocketAvgBet + (cappedBet - _rocketAvgBet) / _rocketBetCount;

    // ── Психологический ИИ: определяем режим раунда ──
    //
    // «Большая ставка» = ставка >= 1.5× от среднего (или >= половины баланса)
    // При большой ставке — почти гарантированный ранний взрыв (90%+)
    //
    // При малой/средней ставке — дофаминовый режим:
    //   первые 3 победы подряд дают хорошие множители (до 4–8×)
    //   после 3 побед подряд шанс раннего взрыва начинает расти

    const balance = userData?.vcoins || 0;
    const isBigBet = (_rocketBetCount > 2) &&
                     (cappedBet >= _rocketAvgBet * 1.5 || cappedBet >= balance * 0.5);

    let rand = Math.random();

    if (isBigBet) {
        // ── БОЛЬШАЯ СТАВКА: взрыв почти гарантирован ──
        if (rand < 0.92) {
            _rocketCrashAt = 1.0 + Math.random() * 0.15;   // взрыв сразу
        } else {
            _rocketCrashAt = 1.15 + Math.random() * 0.35;  // чуть выше, но всё равно проигрыш
        }
    } else if (_rocketWinStreak < 3) {
        // ── ДОФАМИНОВЫЙ РЕЖИМ: даём выигрывать, разогреваем азарт ──
        if (rand < 0.20) {
            _rocketCrashAt = 1.0 + Math.random() * 0.2;    // 20% — ранний взрыв (не скучно)
        } else if (rand < 0.55) {
            _rocketCrashAt = 1.5 + Math.random() * 1.5;    // 35% — средний полёт (1.5–3.0×)
        } else if (rand < 0.85) {
            _rocketCrashAt = 3.0 + Math.random() * 2.0;    // 30% — хороший полёт (3–5×)
        } else {
            _rocketCrashAt = 5.0 + Math.random() * 3.0;    // 15% — большой полёт (5–8×) <i class="fas fa-fire"></i>
        }
    } else {
        // ── СЕРИЯ 3+ ПОБЕД: постепенно ужесточаем ──
        const streakPenalty = Math.min((_rocketWinStreak - 2) * 0.12, 0.55);
        const earlyBoom = 0.35 + streakPenalty; // растёт с каждой победой
        if (rand < earlyBoom) {
            _rocketCrashAt = 1.0 + Math.random() * 0.2;
        } else if (rand < earlyBoom + 0.35) {
            _rocketCrashAt = 1.2 + Math.random() * 0.8;
        } else {
            _rocketCrashAt = 2.0 + Math.random() * 1.5;
        }
    }
    const startBtn = document.getElementById('rocket-start-btn');
    const cashBtn  = document.getElementById('rocket-cash-btn');
    if (startBtn) { startBtn.disabled=true; }
    if (cashBtn)  { cashBtn.disabled=false; }
    document.getElementById('game-result').textContent='';
    const ship    = document.getElementById('rocket-ship');
    const exhaust = document.getElementById('rocket-exhaust');
    const trail   = document.getElementById('rocket-trail');
    const multEl  = document.getElementById('rocket-mult');
    // Анимация полёта
    if (ship)    { ship.classList.add('flying'); }
    if (exhaust) { exhaust.classList.add('active'); }
    // Обновляем точки серии
    _updateStreakDots();
    let pos = 0;
    _rocketInterval = setInterval(async () => {
        _rocketMult += 0.05;
        pos = Math.min(pos + 2, 130);
        if (multEl) {
            multEl.textContent = _rocketMult.toFixed(2)+'×';
            // Красный множитель когда близко к взрыву
            if (_rocketMult >= _rocketCrashAt * 0.85) multEl.classList.add('danger');
        }
        if (ship) ship.style.bottom = (32 + pos) + 'px';
        if (trail) trail.style.height = pos + 'px';
        if (exhaust) exhaust.style.height = (12 + Math.random() * 10) + 'px';
        if (_rocketMult >= _rocketCrashAt) {
            clearInterval(_rocketInterval); _rocketRunning=false;
            if (ship) { ship.innerHTML='<i class="fas fa-explosion"></i>'; ship.classList.remove('flying'); ship.classList.add('exploded'); }
            if (exhaust) { exhaust.classList.remove('active'); exhaust.style.height='0'; }
            if (multEl) multEl.classList.remove('danger');
            const resEl = document.getElementById('game-result');
            _rocketWinStreak = 0;
            _updateStreakDots();
            if (resEl) resEl.innerHTML=`<span style="color:#ef4444"><i class="fas fa-explosion"></i> Взрыв на ${_rocketMult.toFixed(2)}×! Проигрыш -${_rocketBet} VC</span>`;
            if (startBtn) { startBtn.disabled=false; }
            if (cashBtn)  { cashBtn.disabled=true; }
            const balEl = document.querySelector('.game-balance b');
            if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
        }
    }, 100);
};

function _updateStreakDots() {
    for (let i = 0; i < 5; i++) {
        const dot = document.getElementById('sd'+i);
        if (!dot) continue;
        dot.classList.remove('active','danger');
        if (i < _rocketWinStreak) {
            dot.classList.add(i >= 3 ? 'danger' : 'active');
        }
    }
}

window.cashOutRocket = async function() {
    if (!_rocketRunning) return;
    clearInterval(_rocketInterval); _rocketRunning=false;
    const { userData } = _getState();
    // Останавливаем визуальные эффекты
    const ship    = document.getElementById('rocket-ship');
    const exhaust = document.getElementById('rocket-exhaust');
    const multEl  = document.getElementById('rocket-mult');
    if (ship)    { ship.classList.remove('flying'); }
    if (exhaust) { exhaust.classList.remove('active'); exhaust.style.height='0'; }
    if (multEl)  { multEl.classList.remove('danger'); }
    // Максимальный выигрыш ограничен: не более 2000 VC за раунд
    const rawPrize = Math.floor(_rocketBet * _rocketMult);
    const prize = Math.min(rawPrize, 2000);
    _rocketWinStreak++;
    _updateStreakDots();
    await awardVCoins(prize, 'Ракета — выигрыш ×'+_rocketMult.toFixed(2));
    const resEl = document.getElementById('game-result');
    if (resEl) resEl.innerHTML=`<span style="color:var(--teal)"><i class="fas fa-coins"></i> Забрал на ${_rocketMult.toFixed(2)}×! +${prize-_rocketBet} VC</span>`;
    const startBtn = document.getElementById('rocket-start-btn');
    const cashBtn  = document.getElementById('rocket-cash-btn');
    if (startBtn) { startBtn.disabled=false; }
    if (cashBtn)  { cashBtn.disabled=true; }
    const balEl = document.querySelector('.game-balance b');
    if (balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
    if (_rocketMult >= 3) await checkAndAwardAch(_db, _auth, userData, 'game_win');
};

// ═══════════════════════════════════════════════════════
//  <i class="fas fa-meteor"></i> PLINKO «ЧЁРНАЯ ДЫРА»
// ═══════════════════════════════════════════════════════
(function(){
    'use strict';
    const _P_ROWS=10, _P_BALL_R=7, _P_PEG_R=4;
    const _P_GRAVITY=0.28, _P_FRICTION=0.995, _P_BOUNCE=0.52;
    const _P_MULTS=[0,0.5,1,1.5,2,2,1.5,1,0.5,0,0];
    let _plinkoRunning=false, _plinkoWinStreak=0, _plinkoAvgBet=0, _plinkoBetCount=0;

    function _buildPegs(cw,ch){
        const pegs=[],topPad=56,botPad=80,rowH=(ch-topPad-botPad)/(_P_ROWS-1);
        for(let r=0;r<_P_ROWS;r++){
            const cols=r+3,totalW=(cols-1)*(cw/(_P_ROWS+2)),startX=(cw-totalW)/2;
            for(let c=0;c<cols;c++) pegs.push({x:startX+c*(totalW/(cols-1)),y:topPad+r*rowH});
        }
        return pegs;
    }
    function _buildBuckets(cw,ch){
        const n=_P_MULTS.length,bw=cw/n,y=ch-62;
        return _P_MULTS.map((m,i)=>({x:i*bw,y,w:bw,h:52,mult:m,idx:i}));
    }
    function _pBias(bet){
        _plinkoBetCount++;
        _plinkoAvgBet=_plinkoAvgBet+(bet-_plinkoAvgBet)/_plinkoBetCount;
        if(bet>=Math.max(_plinkoAvgBet*1.6,80)) return 0.55;
        if(_plinkoWinStreak>=3) return 0.2+Math.min((_plinkoWinStreak-2)*0.12,0.45);
        return -0.15;
    }
    function _pCreateBall(cx,bias){
        return{x:cx+(Math.random()-0.5)*4,y:20,vx:(Math.random()-0.5+bias*0.3)*1.5,vy:1.5,
               r:_P_BALL_R,trail:[],landed:false,bucketIdx:-1};
    }
    function _pStep(ball,pegs,buckets,bias,cw){
        if(ball.landed) return;
        ball.vy+=_P_GRAVITY; ball.vx*=_P_FRICTION; ball.vy*=_P_FRICTION;
        ball.vx+=bias*0.018; ball.x+=ball.vx; ball.y+=ball.vy;
        if(ball.x-ball.r<0){ball.x=ball.r;ball.vx=Math.abs(ball.vx)*_P_BOUNCE;}
        if(ball.x+ball.r>cw){ball.x=cw-ball.r;ball.vx=-Math.abs(ball.vx)*_P_BOUNCE;}
        for(const p of pegs){
            const dx=ball.x-p.x,dy=ball.y-p.y,d=Math.sqrt(dx*dx+dy*dy),minD=ball.r+_P_PEG_R;
            if(d<minD&&d>0.01){
                const nx=dx/d,ny=dy/d;
                ball.x=p.x+nx*(minD+0.5); ball.y=p.y+ny*(minD+0.5);
                const dot=ball.vx*nx+ball.vy*ny;
                ball.vx=(ball.vx-2*dot*nx)*_P_BOUNCE+(Math.random()-0.5)*0.6;
                ball.vy=(ball.vy-2*dot*ny)*_P_BOUNCE;
                if(ball.vy<0.5) ball.vy=0.5;
            }
        }
        ball.trail.push({x:ball.x,y:ball.y});
        if(ball.trail.length>18) ball.trail.shift();
        for(const b of buckets){
            if(ball.y+ball.r>=b.y&&ball.x>=b.x&&ball.x<=b.x+b.w){
                ball.landed=true; ball.bucketIdx=b.idx;
                ball.x=b.x+b.w/2; ball.y=b.y+b.h/2-10; ball.vx=0; ball.vy=0; break;
            }
        }
    }
    function _pDraw(ctx,pegs,buckets,ball,hlIdx,cw,ch,tick){
        ctx.clearRect(0,0,cw,ch);
        ctx.fillStyle='#07041a'; ctx.fillRect(0,0,cw,ch);
        ctx.save();
        for(let i=0;i<45;i++){
            const sx=((i*137+17)%cw),sy=((i*97+31)%(ch-80));
            ctx.globalAlpha=0.15+0.3*Math.abs(Math.sin(tick*0.02+i));
            ctx.fillStyle=i%3===0?'#c4b5fd':i%3===1?'#5eead4':'#fff';
            ctx.beginPath(); ctx.arc(sx,sy,0.8,0,Math.PI*2); ctx.fill();
        }
        ctx.restore();
        if(ball.trail.length>1){
            for(let i=1;i<ball.trail.length;i++){
                const t=ball.trail[i],tp=ball.trail[i-1];
                ctx.save(); ctx.globalAlpha=(i/ball.trail.length)*0.5;
                ctx.strokeStyle='#14b8a6'; ctx.lineWidth=_P_BALL_R*2*(i/ball.trail.length);
                ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(tp.x,tp.y); ctx.lineTo(t.x,t.y); ctx.stroke();
                ctx.restore();
            }
        }
        for(const p of pegs){
            const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,_P_PEG_R*3.5);
            g.addColorStop(0,'rgba(167,139,250,0.22)'); g.addColorStop(1,'rgba(167,139,250,0)');
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,_P_PEG_R*3.5,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#a78bfa'; ctx.shadowColor='#7c3aed'; ctx.shadowBlur=7;
            ctx.beginPath(); ctx.arc(p.x,p.y,_P_PEG_R,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
        }
        for(const b of buckets){
            const isHL=b.idx===hlIdx,isZ=b.mult===0,isH=b.mult>=2;
            ctx.fillStyle=isHL?(isZ?'rgba(239,68,68,0.75)':'rgba(20,184,166,0.75)'):(isZ?'rgba(239,68,68,0.14)':isH?'rgba(124,58,237,0.22)':'rgba(20,184,166,0.09)');
            ctx.beginPath(); ctx.roundRect(b.x+1,b.y+2,b.w-2,b.h-4,8); ctx.fill();
            ctx.strokeStyle=isHL?(isZ?'#ef4444':'#14b8a6'):(isZ?'rgba(239,68,68,0.4)':isH?'rgba(124,58,237,0.45)':'rgba(20,184,166,0.25)');
            ctx.lineWidth=isHL?2:1; ctx.stroke();
            if(isHL){
                ctx.save(); ctx.globalAlpha=0.35;
                const gw=ctx.createRadialGradient(b.x+b.w/2,b.y+b.h/2,0,b.x+b.w/2,b.y+b.h/2,b.w);
                gw.addColorStop(0,isZ?'#ef4444':'#14b8a6'); gw.addColorStop(1,'transparent');
                ctx.fillStyle=gw; ctx.beginPath(); ctx.roundRect(b.x+1,b.y+2,b.w-2,b.h-4,8); ctx.fill(); ctx.restore();
            }
            ctx.fillStyle=isHL?'#fff':(isZ?'#ef4444':isH?'#c4b5fd':'#5eead4');
            ctx.font=`bold ${isHL?13:11}px 'Exo 2',sans-serif`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(b.mult===0?'✕':`×${b.mult}`,b.x+b.w/2,b.y+b.h/2);
        }
        if(!ball.landed||hlIdx>=0){
            const bg=ctx.createRadialGradient(ball.x-ball.r*0.3,ball.y-ball.r*0.3,1,ball.x,ball.y,ball.r*1.6);
            bg.addColorStop(0,'#fff'); bg.addColorStop(0.3,'#5eead4'); bg.addColorStop(1,'#0d9488');
            ctx.fillStyle=bg; ctx.shadowColor='#14b8a6'; ctx.shadowBlur=16;
            ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
            ctx.fillStyle='rgba(255,255,255,0.65)';
            ctx.beginPath(); ctx.arc(ball.x-ball.r*0.3,ball.y-ball.r*0.3,ball.r*0.35,0,Math.PI*2); ctx.fill();
        }
    }

    window._renderPlinko = function(wrap, balance){
        wrap.innerHTML=`
        <div class="game-wrap-inner">
            <div class="game-header">
                <div class="game-title"><i class="fas fa-meteor"></i> Чёрная дыра</div>
                <div class="game-balance">Баланс: <b>${balance} VC</b></div>
            </div>
            <div class="game-desc">Шарик падает через штыри. Попади в высокий множитель — выиграй!</div>
            <div class="plinko-arena">
                <canvas id="plinko-canvas" width="360" height="400"></canvas>
            </div>
            <div class="plinko-quick-bets">
                <button class="plinko-quick-bet" onclick="document.getElementById('plinko-bet').value=10">10</button>
                <button class="plinko-quick-bet" onclick="document.getElementById('plinko-bet').value=25">25</button>
                <button class="plinko-quick-bet" onclick="document.getElementById('plinko-bet').value=50">50</button>
                <button class="plinko-quick-bet" onclick="document.getElementById('plinko-bet').value=100">100</button>
                <button class="plinko-quick-bet" onclick="document.getElementById('plinko-bet').value=250">250</button>
            </div>
            <div class="game-bet-row">
                <label class="order-label">Ставка (VC)</label>
                <input type="number" id="plinko-bet" min="1" max="${Math.min(balance,500)}" value="25">
            </div>
            <div style="display:flex;justify-content:center;margin-top:14px;padding:0 18px;">
                <button class="plinko-drop-btn" id="plinko-drop-btn" onclick="startPlinko()"><i class="fas fa-meteor"></i> Бросить шарик</button>
            </div>
            <div id="plinko-result" style="min-height:36px;text-align:center;font-size:1rem;font-weight:700;padding:10px 18px 16px;"></div>
        </div>`;
        const canvas=document.getElementById('plinko-canvas');
        const ctx=canvas.getContext('2d');
        const pegs=_buildPegs(canvas.width,canvas.height);
        const buckets=_buildBuckets(canvas.width,canvas.height);
        const dummy={x:-100,y:-100,r:_P_BALL_R,trail:[],landed:false,bucketIdx:-1};
        _pDraw(ctx,pegs,buckets,dummy,-1,canvas.width,canvas.height,0);
    };

    window.startPlinko = async function(){
        if(_plinkoRunning) return;
        const {userData}=_getState();
        const bet=parseInt(document.getElementById('plinko-bet')?.value)||0;
        if(bet<=0) return showToast('Введите ставку','error');
        if(bet>500) return showToast('Максимальная ставка — 500 VC','error');
        _plinkoRunning=true;
        const btn=document.getElementById('plinko-drop-btn');
        if(btn) btn.disabled=true;
        const ok=await spendVCoins(bet,'Чёрная дыра — ставка');
        if(!ok) { _plinkoRunning=false; if(btn) btn.disabled=false; return; }
        const canvas=document.getElementById('plinko-canvas');
        if(!canvas){_plinkoRunning=false;return;}
        const ctx=canvas.getContext('2d');
        const cw=canvas.width,ch=canvas.height;
        const pegs=_buildPegs(cw,ch),buckets=_buildBuckets(cw,ch);
        const bias=_pBias(bet),ball=_pCreateBall(cw/2,bias);
        let tick=0,hlIdx=-1,done=false;
        const loop=async()=>{
            tick++;
            if(!ball.landed) _pStep(ball,pegs,buckets,bias,cw);
            _pDraw(ctx,pegs,buckets,ball,hlIdx,cw,ch,tick);
            if(ball.landed&&!done){
                done=true; hlIdx=ball.bucketIdx;
                _pDraw(ctx,pegs,buckets,ball,hlIdx,cw,ch,tick);
                const mult=_P_MULTS[ball.bucketIdx];
                const prize=Math.floor(bet*mult);
                const resEl=document.getElementById('plinko-result');
                if(mult===0){
                    _plinkoWinStreak=0;
                    if(resEl) resEl.innerHTML=`<span style="color:#ef4444"><i class="fas fa-explosion"></i> Чёрная дыра! Потерял ${bet} VC</span>`;
                } else if(prize>bet){
                    _plinkoWinStreak++;
                    await awardVCoins(prize,'Чёрная дыра — выигрыш ×'+mult);
                    if(resEl) resEl.innerHTML=`<span style="color:var(--teal)"><i class="fas fa-wand-magic-sparkles"></i> ×${mult} Выигрыш! +${prize-bet} VC</span>`;
                    await checkAndAwardAch(_db,_auth,userData,'game_win');
                } else {
                    _plinkoWinStreak=0;
                    if(prize>0) await awardVCoins(prize,'Чёрная дыра — возврат ×'+mult);
                    if(resEl) resEl.innerHTML=`<span style="color:#a78bfa"><i class="fas fa-rotate-left"></i>️ ×${mult} Возврат ${prize} VC</span>`;
                }
                const balEl=document.querySelector('.game-balance b');
                if(balEl) balEl.textContent=(userData?.vcoins||0)+' VC';
                _plinkoRunning=false;
                if(btn) btn.disabled=false;
                return;
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    };
})();

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

    // Глобальный хелпер для lootbox.js (не может импортировать spendVCoins напрямую)
    window.spendVCoinsGlobal = spendVCoins;

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
