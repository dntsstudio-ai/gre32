// ============================================================
//  js/vcoins.js — VCoins: баланс, магазин, игры, переводы
// ============================================================

import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
    collection, query, orderBy, where, increment, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, showVCoinsPopup } from './core.js';
import { VCOINS_DEFAULT_PRICES, VCOINS_REWARDS } from '../config/config.js';
import { checkAndAwardAch } from './achievements.js';

let _prices = { ...VCOINS_DEFAULT_PRICES };
let _db, _auth, _getState;

async function loadPrices() {
    try {
        const snap = await getDoc(doc(_db, 'settings', 'vcoins'));
        if (snap.exists()) _prices = { ..._prices, ...snap.data().prices };
    } catch(e) {}
}

export async function awardVCoins(amount, reason) {
    if (!_auth?.currentUser) return;
    const uid = _auth.currentUser.uid;
    const { userData } = _getState();
    if (!userData) return;
    try {
        await updateDoc(doc(_db, 'users', uid), { vcoins: increment(amount) });
        userData.vcoins = (userData.vcoins || 0) + amount;
        
        const el = document.getElementById('u-vcoins');
        const snEl = document.getElementById('sn-shop-balance');
        if (el) el.textContent = userData.vcoins;
        if (snEl) snEl.textContent = userData.vcoins;
        
        showVCoinsPopup(amount, reason);
        await addDoc(collection(_db, `users/${uid}/vcoinLog`), {
            amount, reason, date: Date.now(), type: 'earn'
        });
        if (userData.vcoins >= 1000) await checkAndAwardAch(_db, _auth, userData, 'vcoins_1000');
    } catch(e) {}
}

async function spendVCoins(amount, reason) {
    const { userData } = _getState();
    if (!userData) return false;
    const balance = userData.vcoins || 0;
    if (balance < amount) { showToast('Недостаточно VCoins!', 'error'); return false; }
    
    const uid = _auth.currentUser.uid;
    await updateDoc(doc(_db, 'users', uid), { vcoins: increment(-amount) });
    userData.vcoins = balance - amount;
    
    const el = document.getElementById('u-vcoins');
    const snEl = document.getElementById('sn-shop-balance');
    if (el) el.textContent = userData.vcoins;
    if (snEl) snEl.textContent = userData.vcoins;

    await addDoc(collection(_db, `users/${uid}/vcoinLog`), {
        amount: -amount, reason, date: Date.now(), type: 'spend'
    });
    return true;
}

const SHOP_ITEMS = [
    { id: 'colorNick', icon: '🎨', name: 'Цветной ник', desc: 'Цвет никнейма в профиле и комментариях', type: 'color', priceKey: 'colorNick' },
    { id: 'prefix_vip', icon: '⭐', name: 'Префикс [VIP]', desc: 'Отображается перед вашим ником', type: 'prefix', value: 'VIP', priceKey: 'prefix' },
    { id: 'prefix_pro', icon: '🔥', name: 'Префикс [PRO]', desc: 'Отображается перед вашим ником', type: 'prefix', value: 'PRO', priceKey: 'prefix' },
    { id: 'prefix_fan', icon: '🎭', name: 'Префикс [FAN]', desc: 'Отображается перед вашим ником', type: 'prefix', value: 'FAN', priceKey: 'prefix' },
    { id: 'prefix_legend', icon: '👑', name: 'Префикс [LEGEND]', desc: 'Отображается перед вашим ником', type: 'prefix', value: 'LEGEND', priceKey: 'prefix' },
];

const NICK_COLORS = [
    { name: 'Фиолетовый', hex: '#a78bfa' }, { name: 'Бирюзовый', hex: '#5eead4' },
    { name: 'Золотой', hex: '#fbbf24' }, { name: 'Розовый', hex: '#f472b6' },
    { name: 'Красный', hex: '#f87171' }, { name: 'Зелёный', hex: '#4ade80' },
    { name: 'Небесный', hex: '#38bdf8' }, { name: 'Белый', hex: '#f0eeff' },
];

function renderShopPage() {
    const wrap = document.getElementById('shop-wrap');
    if (!wrap) return;
    const { userData } = _getState();
    const balance = userData?.vcoins || 0;

    wrap.innerHTML = `
    <div class="shop-balance-bar">
        <div class="shop-balance-inner">
            <span class="shop-balance-icon" style="color:#fbbf24;"><i class="fas fa-gem"></i></span>
            <span class="shop-balance-val">${balance}</span>
            <span class="shop-balance-label">VCoins</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.openGiftModal()">
            <i class="fas fa-gift"></i> Подарить
        </button>
        <button class="btn btn-outline btn-sm" onclick="window.openVcoinHistory()">
            <i class="fas fa-history"></i> История
        </button>
    </div>

    <div class="shop-section-title">🎨 Кастомизация профиля</div>
    <div class="shop-grid">
        ${SHOP_ITEMS.map(item => {
            const price = _prices[item.priceKey] || 999;
            const owned = userData?.shopItems?.includes(item.id);
            const active = userData?.activePrefix === item.value || (item.type==='color' && userData?.nickColor);
            return `<div class="shop-card ${owned?'shop-card--owned':''}">
                <div class="shop-card-icon">${item.icon}</div>
                <div class="shop-card-name">${esc(item.name)}</div>
                <div class="shop-card-desc">${esc(item.desc)}</div>
                <div class="shop-card-footer">
                    <span class="shop-price"><i class="fas fa-gem"></i> ${price}</span>
                    ${owned
                        ? `<button class="btn btn-sm" style="background:var(--teal);" onclick="window.activateShopItem('${item.id}')">Активировать</button>`
                        : `<button class="btn btn-sm btn-blue" onclick="window.buyShopItem('${item.id}')">Купить</button>`
                    }
                </div>
            </div>`;
        }).join('')}
    </div>

    <div class="shop-section-title" style="margin-top:32px;">🎮 Мини-игры</div>
    <div class="shop-grid shop-grid--games">
        <div class="shop-game-card" onclick="window.openGame('coinflip')">
            <div class="shop-game-icon">💎</div>
            <div class="shop-game-name">Монетка</div>
            <div class="shop-game-desc">Орёл или решка — удвой ставку</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="window.openGame('slots')">
            <div class="shop-game-icon">🎰</div>
            <div class="shop-game-name">Слоты</div>
            <div class="shop-game-desc">Три символа — выиграй до 10×</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
        <div class="shop-game-card" onclick="window.openGame('rocket')">
            <div class="shop-game-icon">🚀</div>
            <div class="shop-game-name">Ракета</div>
            <div class="shop-game-desc">Чем дольше летит — тем больше множитель</div>
            <button class="btn btn-sm btn-purple">Играть</button>
        </div>
    </div>`;
}

export function bindVCoins(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.loadShopPage = async function() {
        await loadPrices();
        renderShopPage();
    };

    window.buyShopItem = async function(itemId) {
        const { userData } = _getState();
        if (!userData) return showToast('Войдите в аккаунт', 'error');
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return;
        const price = _prices[item.priceKey] || 999;

        if (item.type === 'color') {
            document.getElementById('m-nick-color').style.display = 'flex';
            document.getElementById('nc-price').textContent = price;
            window._pendingColorBuy = price;
            return;
        }

        const ok = await spendVCoins(price, 'Покупка: ' + item.name);
        if (!ok) return;
        const owned = [...(userData.shopItems || []), itemId];
        await updateDoc(doc(_db, 'users', _auth.currentUser.uid), { shopItems: owned });
        userData.shopItems = owned;
        showToast('✅ Куплено: ' + item.name);
        renderShopPage();
    };

    window.activateShopItem = async function(itemId) {
        const { userData } = _getState();
        if (!userData) return;
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return;
        if (item.type === 'prefix') {
            await updateDoc(doc(_db, 'users', _auth.currentUser.uid), { activePrefix: item.value });
            userData.activePrefix = item.value;
            showToast('Префикс активирован!');
        }
        renderShopPage();
    };

    window.openGame = function(type) {
        const { userData } = _getState();
        if (!userData) return showToast('Войдите в аккаунт', 'error');
        document.getElementById('m-game').style.display = 'flex';
        const wrap = document.getElementById('game-wrap');
        const balance = userData?.vcoins || 0;
        
        if (type === 'coinflip') {
            wrap.innerHTML = `
            <div class="game-header">
                <div class="game-title">💎 Орёл / Решка</div>
                <div class="game-balance">Баланс: <b class="g-bal">${balance} VC</b></div>
            </div>
            <div class="game-desc">Угадай — орёл или решка. Угадал — удваиваешь. Нет — теряешь.</div>
            <div class="game-coin-display" id="game-coin-img">💎</div>
            <div class="game-bet-row">
                <input type="number" id="game-bet" min="1" value="10" style="text-align:center;max-width:140px;">
            </div>
            <div style="display:flex;gap:12px;margin-top:18px;justify-content:center;">
                <button class="btn btn-purple" onclick="window.playCoinflip('heads')">👑 Орёл</button>
                <button class="btn btn-blue" onclick="window.playCoinflip('tails')">💎 Решка</button>
            </div>
            <div id="game-result" style="margin-top:20px;text-align:center;font-weight:700;min-height:32px;"></div>`;
        } else if (type === 'slots') {
            wrap.innerHTML = `
            <div class="game-header">
                <div class="game-title">🎰 Слоты</div>
                <div class="game-balance">Баланс: <b class="g-bal">${balance} VC</b></div>
            </div>
            <div class="slots-display">
                <div class="slot-reel" id="reel-0">❓</div>
                <div class="slot-reel" id="reel-1">❓</div>
                <div class="slot-reel" id="reel-2">❓</div>
            </div>
            <div class="game-bet-row">
                <input type="number" id="game-bet" min="1" value="10" style="text-align:center;max-width:140px;">
            </div>
            <button class="btn btn-purple" style="width:100%;margin-top:16px;" onclick="window.playSlots()">🎰 Крутить!</button>
            <div id="game-result" style="margin-top:16px;text-align:center;font-weight:700;min-height:32px;"></div>`;
        }
        document.getElementById('m-game-title').textContent = 'Мини-игра';
    };

    window.playCoinflip = async function(choice) {
        const { userData } = _getState();
        const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
        if (bet <= 0) return showToast('Введите ставку', 'error');
        const ok = await spendVCoins(bet, 'Игра: Монетка');
        if (!ok) return;
        
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const win = result === choice;
        const imgEl = document.getElementById('game-coin-img');
        if (imgEl) { imgEl.textContent = '...'; imgEl.classList.add('spinning'); }
        
        setTimeout(async () => {
            if (imgEl) { imgEl.classList.remove('spinning'); imgEl.textContent = result==='heads'?'👑':'💎'; }
            const resEl = document.getElementById('game-result');
            if (win) {
                await awardVCoins(bet * 2, 'Победа: Монетка');
                if (resEl) resEl.innerHTML = `<span style="color:var(--teal)">✅ Выигрыш! +${bet} VC</span>`;
            } else {
                if (resEl) resEl.innerHTML = `<span style="color:#ef4444">❌ Проигрыш! -${bet} VC</span>`;
            }
            const balEl = document.querySelector('.g-bal');
            if (balEl) balEl.textContent = (userData?.vcoins||0) + ' VC';
        }, 900);
    };

    const SLOT_SYMBOLS = ['🍒','🍊','🍋','⭐','💎','7️⃣','🎭'];
    window.playSlots = async function() {
        const { userData } = _getState();
        const bet = parseInt(document.getElementById('game-bet')?.value) || 0;
        if (bet <= 0) return showToast('Введите ставку', 'error');
        const ok = await spendVCoins(bet, 'Игра: Слоты');
        if (!ok) return;
        
        let ticks = 0;
        const interval = setInterval(() => {
            [0,1,2].forEach(i => {
                const el = document.getElementById('reel-'+i);
                if (el) el.textContent = SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)];
            });
            ticks++;
            if (ticks >= 15) {
                clearInterval(interval);
                const reels = [0,1,2].map(() => SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]);
                [0,1,2].forEach(i => { const el = document.getElementById('reel-'+i); if(el) el.textContent=reels[i]; });
                let mult = 0;
                if (reels[0]===reels[1] && reels[1]===reels[2]) {
                    mult = reels[0]==='7️⃣' ? 10 : reels[0]==='💎' ? 7 : 5;
                } else if (reels[0]===reels[1] || reels[1]===reels[2] || reels[0]===reels[2]) {
                    mult = 2; // Упростили множитель
                }
                const resEl = document.getElementById('game-result');
                (async () => {
                    if (mult > 0) {
                        const prize = bet * mult;
                        await awardVCoins(prize, `Победа: Слоты x${mult}`);
                        if (resEl) resEl.innerHTML = `<span style="color:var(--teal)">🎉 ×${mult} Выигрыш! +${prize-bet} VC</span>`;
                    } else {
                        if (resEl) resEl.innerHTML = `<span style="color:#ef4444">❌ Мимо. -${bet} VC</span>`;
                    }
                    const balEl = document.querySelector('.g-bal');
                    if (balEl) balEl.textContent = (userData?.vcoins||0) + ' VC';
                })();
            }
        }, 80);
    };

    window.openVcoinHistory = async function() {
        if (!_auth?.currentUser) return;
        const list = document.getElementById('vcoin-history-list');
        if (list) list.innerHTML = '<div class="search-loading">Загрузка...</div>';
        document.getElementById('m-vcoin-history').style.display = 'flex';
        
        try {
            const snap = await getDocs(query(collection(_db, `users/${_auth.currentUser.uid}/vcoinLog`), orderBy('date','desc'), limit(30)));
            const logs = snap.docs.map(d => d.data());
            if (list) {
                list.innerHTML = logs.length === 0
                    ? '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет транзакций</p>'
                    : logs.map(l => {
                        const plus = l.amount > 0;
                        return `<div class="vcoin-log-row">
                            <span class="vcoin-log-reason">${esc(l.reason)}</span>
                            <span class="vcoin-log-amount ${plus?'vcoin-log--plus':'vcoin-log--minus'}">${plus?'+':''}${l.amount}</span>
                            <span class="vcoin-log-date">${new Date(l.date).toLocaleDateString('ru')}</span>
                        </div>`;
                    }).join('');
            }
        } catch(e) {
            if(list) list.innerHTML = '<p style="color:#ef4444;text-align:center;">Ошибка загрузки</p>';
        }
    };

    window.openGiftModal = function() {
        document.getElementById('gift-nick').value = '';
        document.getElementById('gift-amount').value = '';
        document.getElementById('gift-target-info').innerHTML = '';
        document.getElementById('m-gift-vcoins').style.display = 'flex';
    };

    window.searchGiftTarget = async function() {
        const nick = document.getElementById('gift-nick').value.trim();
        if (!nick) return;
        const snap = await getDocs(query(collection(_db,'users'), where('nickname','==',nick)));
        const info = document.getElementById('gift-target-info');
        if (snap.empty) {
            info.innerHTML = '<p style="color:#ef4444;font-size:12px;">Пользователь не найден</p>';
            window._giftTargetUid = null;
        } else {
            const u = snap.docs[0].data();
            window._giftTargetUid = snap.docs[0].id;
            info.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--input-bg);border-radius:10px;border:1px solid var(--teal);">
                <img src="${esc(u.avatar||'https://api.dicebear.com/7.x/identicon/svg')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                <span style="font-weight:700;">${esc(u.nickname)}</span>
            </div>`;
        }
    };

    window.sendGift = async function() {
        if (!window._giftTargetUid) return showToast('Найдите получателя', 'error');
        const nick = document.getElementById('gift-nick').value.trim();
        const amount = parseInt(document.getElementById('gift-amount').value) || 0;
        if (amount <= 0) return showToast('Введите сумму', 'error');
        
        const ok = await spendVCoins(amount, 'Подарок → ' + nick);
        if (!ok) return;
        
        await updateDoc(doc(_db, 'users', window._giftTargetUid), { vcoins: increment(amount) });
        await addDoc(collection(_db, `users/${window._giftTargetUid}/vcoinLog`), {
            amount, reason: 'Подарок от ' + _getState().userData.nickname, date: Date.now(), type: 'gift'
        });
        showToast('🎁 Отправлено ' + amount + ' VC → ' + nick);
        closeModals();
    };

    window.renderNickColorPicker = function() {
        const grid = document.getElementById('nc-color-grid');
        if (!grid) return;
        grid.innerHTML = NICK_COLORS.map(c =>
            `<div class="nc-color-swatch" style="background:${c.hex};" title="${c.name}" onclick="window.selectNickColor('${c.hex}')"></div>`
        ).join('');
    };

    window.selectNickColor = async function(hex) {
        if (!window._pendingColorBuy) return;
        const price = window._pendingColorBuy;
        const ok = await spendVCoins(price, 'Цветной никнейм');
        if (!ok) return;
        const { userData } = _getState();
        const uid = _auth.currentUser.uid;
        await updateDoc(doc(_db, 'users', uid), { nickColor: hex, shopItems: [...(userData.shopItems||[]), 'colorNick'] });
        userData.nickColor = hex;
        userData.shopItems = [...(userData.shopItems||[]), 'colorNick'];
        showToast('Цвет ника изменён!');
        closeModals();
        renderShopPage();
    };
}
