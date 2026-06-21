// ============================================================
// js/lootbox.js — Мини-игра: Открытие ящиков (Brawl Stars style)
// ============================================================
import { collection, getDocs, query, orderBy }
    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js';
import { getRarityByCat, RARITIES, renderCard, addCardToInventory } from './inventory.js';

let _db, _auth, _getState;

// ── Цены ящиков ────────────────────────────────────────────────
const BOXES = [
    {
        id: 'box_common',
        name: 'Обычный ящик',
        icon: '📦',
        price: 50,
        desc: 'Содержит карточку обычной или редкой редкости',
        gradient: 'linear-gradient(135deg,#475569,#64748b)',
        border: '#64748b',
        weights: { common: 70, rare: 25, epic: 4, legendary: 1 },
    },
    {
        id: 'box_rare',
        name: 'Редкий ящик',
        icon: '💎',
        price: 150,
        desc: 'Повышенный шанс редкой и эпической карточки',
        gradient: 'linear-gradient(135deg,#0369a1,#38bdf8)',
        border: '#38bdf8',
        weights: { common: 30, rare: 45, epic: 20, legendary: 5 },
    },
    {
        id: 'box_legendary',
        name: 'Легендарный ящик',
        icon: '👑',
        price: 400,
        desc: 'Гарантированно эпическая или легендарная карточка!',
        gradient: 'linear-gradient(135deg,#92400e,#fbbf24)',
        border: '#fbbf24',
        weights: { common: 0, rare: 10, epic: 55, legendary: 35 },
    },
];

// ── Взвешенный случайный выбор редкости ───────────────────────
function pickRarity(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [rarity, w] of Object.entries(weights)) {
        r -= w;
        if (r <= 0) return rarity;
    }
    return 'common';
}

// ── Рендер страницы лутбоксов ──────────────────────────────────
function renderLootboxPage(wrap, balance) {
    wrap.innerHTML = `
    <div class="lootbox-page">
        <div class="lootbox-header">
            <div class="lootbox-title">🎁 Открытие ящиков</div>
            <div class="lootbox-balance">Баланс: <b>${balance} VC</b></div>
        </div>
        <p class="lootbox-desc">Открывай ящики и собирай карточки участников студии. Продавай или добавляй в избранное!</p>
        <div class="lootbox-boxes">
            ${BOXES.map(box => `
            <div class="lootbox-box-card" style="--box-gradient:${box.gradient};--box-border:${box.border};">
                <div class="lootbox-box-shine"></div>
                <div class="lootbox-box-icon">${box.icon}</div>
                <div class="lootbox-box-name">${esc(box.name)}</div>
                <div class="lootbox-box-desc">${esc(box.desc)}</div>
                <div class="lootbox-box-price">💰 ${box.price} VC</div>
                <button class="btn lootbox-open-btn" onclick="openLootbox('${box.id}')">
                    Открыть
                </button>
            </div>`).join('')}
        </div>
        <div class="lootbox-drop-rates">
            <div class="lootbox-drop-title">📊 Шансы выпадения</div>
            <div class="lootbox-drop-table">
                ${BOXES.map(box => `
                <div class="lootbox-drop-row">
                    <span>${box.icon} ${esc(box.name)}</span>
                    <div class="lootbox-drop-bars">
                        ${Object.entries(box.weights).filter(([,w])=>w>0).map(([r,w]) => `
                        <span class="lootbox-drop-chip" style="color:${RARITIES[r].color};">
                            ${RARITIES[r].label}: ${w}%
                        </span>`).join('')}
                    </div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}

// ── Открытие ящика ─────────────────────────────────────────────
window.openLootbox = async function(boxId) {
    const { userData } = _getState();
    if (!userData) return showToast('Войдите в аккаунт', 'error');

    const box = BOXES.find(b => b.id === boxId);
    if (!box) return;

    const balance = userData.vcoins || 0;
    if (balance < box.price) return showToast(`Недостаточно VCoins! Нужно ${box.price} VC`, 'error');

    // Списываем VCoins
    if (!window.spendVCoinsGlobal) return showToast('Ошибка системы VCoins', 'error');
    const ok = await window.spendVCoinsGlobal(box.price, `Открытие: ${box.name}`);
    if (!ok) return;

    // Загружаем участников из Firebase
    try {
        const snap = await getDocs(query(collection(_db, 'team'), orderBy('order')));
        const allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!allMembers.length) return showToast('Нет участников в базе', 'error');

        // Выбираем редкость
        const rarity = pickRarity(box.weights);

        // Фильтруем по редкости
        let pool = allMembers.filter(m => getRarityByCat(m.cat) === rarity);
        if (!pool.length) pool = allMembers; // fallback

        // Случайный участник
        const winner = pool[Math.floor(Math.random() * pool.length)];

        // Сохраняем карточку в инвентарь
        await addCardToInventory(winner.id);

        // Показываем анимацию
        showCardReveal(winner, rarity, box);

    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
        console.error('openLootbox:', e);
    }
};

// ── Анимация раскрытия карточки (Brawl Stars style) ────────────
function showCardReveal(member, rarity, box) {
    const r = RARITIES[rarity];

    // Создаём оверлей
    const overlay = document.createElement('div');
    overlay.id = 'lootbox-reveal-overlay';
    overlay.className = 'lb-reveal-overlay';
    overlay.innerHTML = `
    <div class="lb-reveal-bg" style="--rarity-color:${r.color};--rarity-glow:${r.glow};"></div>
    <div class="lb-reveal-particles" id="lb-particles"></div>
    <div class="lb-reveal-box-wrap" id="lb-box-wrap">
        <div class="lb-reveal-box" style="background:${box.gradient};border-color:${box.border};">
            <div class="lb-reveal-box-icon">${box.icon}</div>
        </div>
        <p class="lb-reveal-tap-hint">Нажмите, чтобы открыть</p>
    </div>
    <div class="lb-reveal-card-wrap" id="lb-card-wrap" style="display:none;">
        <div class="lb-reveal-card-inner" id="lb-card-inner">
            <div class="lb-reveal-card-front">
                ${renderCard({ ...member, rarity }, { showActions: false })}
            </div>
        </div>
        <div class="lb-reveal-rarity-text" style="color:${r.color};">
            ${r.label.toUpperCase()}
        </div>
        <div class="lb-reveal-actions">
            <button class="btn lb-btn-keep" onclick="keepCard()">
                🎒 В инвентарь
            </button>
            <button class="btn lb-btn-sell" onclick="quickSellCard('${esc(member.id)}', ${r.sellPrice})">
                💰 Продать за ${r.sellPrice} VC
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('lb-reveal-overlay--visible'));

    // Звук открытия
    playSound('open');

    // Частицы
    spawnParticles(r.color);

    // Клик по ящику — раскрываем карточку
    const boxWrap = document.getElementById('lb-box-wrap');
    if (boxWrap) {
        boxWrap.addEventListener('click', function onBoxClick() {
            boxWrap.removeEventListener('click', onBoxClick);
            revealCard(r);
        }, { once: true });
    }

    // Закрытие по клику вне карточки
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeReveal();
    });
}

function revealCard(r) {
    const boxWrap  = document.getElementById('lb-box-wrap');
    const cardWrap = document.getElementById('lb-card-wrap');
    if (!boxWrap || !cardWrap) return;

    // Анимация ящика — встряска и исчезновение
    boxWrap.classList.add('lb-box--shake');
    playSound('shake');

    setTimeout(() => {
        boxWrap.classList.add('lb-box--explode');
        playSound('reveal');
        setTimeout(() => {
            boxWrap.style.display = 'none';
            cardWrap.style.display = 'flex';
            requestAnimationFrame(() => cardWrap.classList.add('lb-card--appear'));
            // Вспышка света
            const bg = document.querySelector('.lb-reveal-bg');
            if (bg) { bg.classList.add('lb-bg--flash'); setTimeout(() => bg.classList.remove('lb-bg--flash'), 600); }
        }, 400);
    }, 600);
}

window.keepCard = function() {
    showToast('🎒 Карточка добавлена в инвентарь!');
    closeReveal();
};

window.quickSellCard = async function(cardId, price) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;
    try {
        // Удаляем последнюю добавленную карточку этого типа из инвентаря
        const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const userRef = doc(_db, 'users', _auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const cards = snap.data()?.inventory?.cards || [];
        const idx = cards.lastIndexOf(cardId);
        if (idx !== -1) {
            const newCards = [...cards];
            newCards.splice(idx, 1);
            await updateDoc(userRef, { 'inventory.cards': newCards });
            if (userData.inventory) userData.inventory.cards = newCards;
        }
        if (window.awardVCoins) await window.awardVCoins(price, 'Быстрая продажа карточки');
        showToast(`💰 Продано за ${price} VC!`);
        closeReveal();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

function closeReveal() {
    const overlay = document.getElementById('lootbox-reveal-overlay');
    if (overlay) {
        overlay.classList.remove('lb-reveal-overlay--visible');
        setTimeout(() => overlay.remove(), 400);
    }
    // Обновляем баланс в интерфейсе
    if (window.loadShopPage) window.loadShopPage();
}

// ── Частицы ────────────────────────────────────────────────────
function spawnParticles(color) {
    const container = document.getElementById('lb-particles');
    if (!container) return;
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'lb-particle';
        const angle = Math.random() * 360;
        const dist  = 80 + Math.random() * 200;
        const size  = 4 + Math.random() * 8;
        const delay = Math.random() * 0.5;
        p.style.cssText = `
            left: 50%; top: 50%;
            width: ${size}px; height: ${size}px;
            background: ${Math.random() > 0.5 ? color : '#fff'};
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            animation: lb-particle-fly 1.2s ${delay}s ease-out forwards;
            --angle: ${angle}deg; --dist: ${dist}px;`;
        container.appendChild(p);
    }
}

// ── Звуки (Web Audio API) ──────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'open') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'shake') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'reveal') {
            // Аккорд из 3 нот
            [523, 659, 784].forEach((freq, i) => {
                const o2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                o2.connect(g2); g2.connect(ctx.destination);
                o2.type = 'sine';
                o2.frequency.value = freq;
                g2.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
                g2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.08 + 0.05);
                g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.5);
                o2.start(ctx.currentTime + i * 0.08);
                o2.stop(ctx.currentTime + i * 0.08 + 0.5);
            });
        }
    } catch(e) { /* Тихо игнорируем ошибки аудио */ }
}

// ── Рендер в renderGame ────────────────────────────────────────
export function renderLootboxGame(wrap, balance) {
    renderLootboxPage(wrap, balance);
}

// ── Экспорт ────────────────────────────────────────────────────
export function bindLootbox(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.renderLootboxGame = renderLootboxGame;
}
