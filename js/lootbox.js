// ============================================================
// js/lootbox.js — Мини-игра: Открытие ящиков (Brawl Stars style)
// ============================================================
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, getDoc }
    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js?v=20260905a';
import { getRarityByCat, RARITIES, renderCard, addCardToInventory } from './inventory.js?v=20260905a';

let _db, _auth, _getState;

// ── Цены ящиков ────────────────────────────────────────────────
const BOXES = [
    {
        id: 'box_common',
        name: 'Обычный ящик',
        icon: '<i class="fas fa-box"></i>',
        price: 50,
        desc: 'Содержит карточку обычной или редкой редкости',
        gradient: 'linear-gradient(135deg,#475569,#64748b)',
        border: '#64748b',
        weights: { common: 70, rare: 25, epic: 4, legendary: 1 },
    },
    {
        id: 'box_rare',
        name: 'Редкий ящик',
        icon: '<i class="fas fa-gem"></i>',
        price: 150,
        desc: 'Повышенный шанс редкой и эпической карточки',
        gradient: 'linear-gradient(135deg,#0369a1,#38bdf8)',
        border: '#38bdf8',
        weights: { common: 30, rare: 45, epic: 20, legendary: 5 },
    },
    {
        id: 'box_legendary',
        name: 'Легендарный ящик',
        icon: '<i class="fas fa-crown"></i>',
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

// ── Загрузка кастомных карточек из Firebase ────────────────────
async function loadCustomCards() {
    try {
        const snap = await getDocs(collection(_db, 'custom_cards'));
        return snap.docs.map(d => ({ id: d.id, ...d.data(), isCustom: true }));
    } catch(e) {
        console.warn('loadCustomCards:', e);
        return [];
    }
}

// ── Рендер страницы лутбоксов ──────────────────────────────────
async function renderLootboxPage(wrap, balance) {
    const { userData, isAdmin } = _getState();
    const customCards = await loadCustomCards();

    wrap.innerHTML = `
    <div class="lootbox-page">
        <div class="lootbox-header">
            <div class="lootbox-title"><i class="fas fa-gift"></i> Открытие ящиков</div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <div class="lootbox-balance">Баланс: <b>${balance} VC</b></div>
                ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick="openCreateCardModal()"><i class="fas fa-plus"></i> Создать карточку</button>` : ''}
            </div>
        </div>
        <p class="lootbox-desc">Открывай ящики и собирай карточки участников студии. Продавай или добавляй в избранное!</p>
        <div class="lootbox-boxes">
            ${BOXES.map(box => `
            <div class="lootbox-box-card" style="--box-gradient:${box.gradient};--box-border:${box.border};">
                <div class="lootbox-box-shine"></div>
                <div class="lootbox-box-icon">${box.icon}</div>
                <div class="lootbox-box-name">${esc(box.name)}</div>
                <div class="lootbox-box-desc">${esc(box.desc)}</div>
                <div class="lootbox-box-price"><i class="fas fa-coins"></i> ${box.price} VC</div>
                <button class="btn lootbox-open-btn" onclick="openLootbox('${box.id}')">
                    Открыть
                </button>
            </div>`).join('')}
        </div>
        <div class="lootbox-drop-rates">
            <div class="lootbox-drop-title"><i class="fas fa-chart-column"></i> Шансы выпадения</div>
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
        ${customCards.length > 0 ? `
        <div class="lootbox-custom-section">
            <div class="lootbox-drop-title"><i class="fas fa-wand-magic-sparkles"></i> Особые карточки</div>
            <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;font-style:italic;">Эксклюзивные карточки с особыми шансами выпадения</p>
            <div class="inv-cards-grid">
                ${customCards.map(c => {
                    const r = RARITIES[c.rarity] || RARITIES.common;
                    return `
                    <div class="inv-card inv-card--${c.rarity}" style="--card-glow:${r.glow};--card-color:${r.color};cursor:default;">
                        <div class="inv-card__shine"></div>
                        <div class="inv-card__rarity-bar"></div>
                        <div class="inv-card__img-wrap">
                            <img src="${esc(c.img||'')}" alt="${esc(c.name)}"
                                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${esc(c.name)}'">
                        </div>
                        <div class="inv-card__body">
                            ${c.prefix ? `<div class="inv-card__prefix" style="color:${r.color};">${esc(c.prefix)}</div>` : ''}
                            <div class="inv-card__name">${esc(c.name)}</div>
                            <div class="inv-card__role">${esc(c.role||'')}</div>
                            ${c.description ? `<div class="inv-card__desc">${esc(c.description)}</div>` : ''}
                            <div class="inv-card__rarity-label" style="color:${r.color};">
                                <span class="inv-card__stars">${'<i class="fas fa-star"></i>'.repeat(r.stars)}${'<i class="far fa-star"></i>'.repeat(4-r.stars)}</span>
                                ${r.label}
                            </div>
                            <div class="inv-card__chance-badge"><i class="fas fa-dice"></i> Шанс: ${c.dropChance || 1}%</div>
                        </div>
                        ${isAdmin ? `
                        <div class="inv-card__actions">
                            <button class="inv-card__btn" onclick="editCustomCard('${esc(c.id)}')" title="Редактировать"><i class="fas fa-pen"></i>️</button>
                            <button class="inv-card__btn inv-card__btn--sell" onclick="deleteCustomCard('${esc(c.id)}')" title="Удалить"><i class="fas fa-trash"></i>️</button>
                        </div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}
    </div>`;
}

// ── Открытие ящика ─────────────────────────────────────────────
let _lootboxOpening = false;
window.openLootbox = async function(boxId) {
    if (_lootboxOpening) return; // защита от заклика
    const { userData } = _getState();
    if (!userData) return showToast('Войдите в аккаунт', 'error');

    const box = BOXES.find(b => b.id === boxId);
    if (!box) return;

    const balance = userData.vcoins || 0;
    if (balance < box.price) return showToast(`Недостаточно VCoins! Нужно ${box.price} VC`, 'error');

    if (!window.spendVCoinsGlobal) return showToast('Ошибка системы VCoins', 'error');
    _lootboxOpening = true;
    const ok = await window.spendVCoinsGlobal(box.price, `Открытие: ${box.name}`);
    if (!ok) { _lootboxOpening = false; return; }

    try {
        // Загружаем обычных участников и кастомные карточки
        const [teamSnap, customCards] = await Promise.all([
            getDocs(query(collection(_db, 'team'), orderBy('order'))),
            loadCustomCards()
        ]);
        const allMembers = teamSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!allMembers.length && !customCards.length) return showToast('Нет участников в базе', 'error');

        // Проверяем кастомные карточки с учётом их шанса выпадения
        let winner = null;
        let winnerRarity = null;
        let isCustomWinner = false;

        for (const cc of customCards) {
            const chance = parseFloat(cc.dropChance) || 1;
            if (Math.random() * 100 < chance) {
                winner = cc;
                winnerRarity = cc.rarity || 'rare';
                isCustomWinner = true;
                break;
            }
        }

        // Если кастомная не выпала — обычная логика
        if (!winner) {
            const rarity = pickRarity(box.weights);
            winnerRarity = rarity;
            let pool = allMembers.filter(m => getRarityByCat(m.cat) === rarity);
            if (!pool.length) pool = allMembers;
            winner = pool[Math.floor(Math.random() * pool.length)];
        }

        // Сохраняем карточку в инвентарь
        await addCardToInventory(winner.id, isCustomWinner);

        // Показываем анимацию
        showCardReveal(winner, winnerRarity, box, isCustomWinner);

    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
        console.error('openLootbox:', e);
    } finally {
        _lootboxOpening = false;
    }
};

// ── Анимация раскрытия карточки ────────────────────────────────
function showCardReveal(member, rarity, box, isCustom) {
    const r = RARITIES[rarity] || RARITIES.common;

    const overlay = document.createElement('div');
    overlay.id = 'lootbox-reveal-overlay';
    overlay.className = 'lb-reveal-overlay';

    const cardHtml = renderCard({ ...member, rarity }, { showActions: false, showDesc: true });

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
                ${cardHtml}
                ${isCustom ? '<div class="lb-custom-badge"><i class="fas fa-wand-magic-sparkles"></i> Особая карточка!</div>' : ''}
            </div>
        </div>
        <div class="lb-reveal-rarity-text" style="color:${r.color};">
            ${r.label.toUpperCase()}${isCustom ? ' · ОСОБАЯ' : ''}
        </div>
        <div class="lb-reveal-actions">
            <button class="btn lb-btn-keep" onclick="keepCard()">
                <i class="fas fa-briefcase"></i> В инвентарь
            </button>
            <button class="btn lb-btn-sell" onclick="quickSellCard('${esc(member.id)}', ${r.sellPrice}, ${isCustom})">
                <i class="fas fa-coins"></i> Продать за ${r.sellPrice} VC
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('lb-reveal-overlay--visible'));

    spawnParticles(r.color);

    // Звук должен играть ТОЛЬКО в момент клика пользователя (иначе браузер
    // блокирует автовоспроизведение) — см. revealCard() ниже.

    const boxWrap = document.getElementById('lb-box-wrap');
    if (boxWrap) {
        boxWrap.addEventListener('click', function onBoxClick() {
            boxWrap.removeEventListener('click', onBoxClick);
            revealCard(r, isCustom, member);
        }, { once: true });
    }

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeReveal();
    });
}

function revealCard(r, isCustom, member) {
    const boxWrap  = document.getElementById('lb-box-wrap');
    const cardWrap = document.getElementById('lb-card-wrap');
    if (!boxWrap || !cardWrap) return;

    boxWrap.classList.add('lb-box--shake');
    playSound('shake');

    // "Разблокируем" кастомный звук ПРЯМО СЕЙЧАС, пока мы ещё внутри клика
    // пользователя (иначе браузер заблокирует запуск позже, из setTimeout).
    let revealAudio = null;
    if (isCustom && member.soundUrl) {
        try {
            revealAudio = new Audio(member.soundUrl);
            revealAudio.volume = 0;
            revealAudio.play().then(() => {
                revealAudio.pause();
                revealAudio.currentTime = 0;
                revealAudio.volume = 1;
            }).catch(() => { revealAudio = null; });
        } catch(e) { revealAudio = null; }
    }

    setTimeout(() => {
        boxWrap.classList.add('lb-box--explode');

        // Звук при выпадении (кастомный, уже разблокированный выше, или стандартный по редкости)
        if (isCustom && revealAudio) {
            revealAudio.play().catch(() => {});
        } else if (!isCustom) {
            playSound('reveal', r);
        }

        setTimeout(() => {
            boxWrap.style.display = 'none';
            cardWrap.style.display = 'flex';
            requestAnimationFrame(() => cardWrap.classList.add('lb-card--appear'));
            const bg = document.querySelector('.lb-reveal-bg');
            if (bg) { bg.classList.add('lb-bg--flash'); setTimeout(() => bg.classList.remove('lb-bg--flash'), 600); }
        }, 400);
    }, 600);
}

window.keepCard = function() {
    showToast('<i class="fas fa-briefcase"></i> Карточка добавлена в инвентарь!');
    closeReveal();
};

window.quickSellCard = async function(cardId, price, isCustom) {
    const { userData } = _getState();
    if (!userData || !_auth.currentUser) return;
    try {
        const { doc: fDoc, getDoc: fGetDoc, updateDoc: fUpdateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const userRef = fDoc(_db, 'users', _auth.currentUser.uid);
        const snap = await fGetDoc(userRef);
        const inv = snap.data()?.inventory || {};

        if (isCustom) {
            const customCards = inv.customCards || [];
            const idx = customCards.lastIndexOf(cardId);
            if (idx !== -1) {
                const nc = [...customCards]; nc.splice(idx, 1);
                await fUpdateDoc(userRef, { 'inventory.customCards': nc });
                if (userData.inventory) userData.inventory.customCards = nc;
            }
        } else {
            const cards = inv.cards || [];
            const idx = cards.lastIndexOf(cardId);
            if (idx !== -1) {
                const nc = [...cards]; nc.splice(idx, 1);
                await fUpdateDoc(userRef, { 'inventory.cards': nc });
                if (userData.inventory) userData.inventory.cards = nc;
            }
        }

        if (window.awardVCoins) await window.awardVCoins(price, 'Быстрая продажа карточки');
        showToast(`<i class="fas fa-coins"></i> Продано за ${price} VC!`);
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
    if (window.loadShopPage) window.loadShopPage();
}

// ── Частицы ────────────────────────────────────────────────────
function spawnParticles(color) {
    const container = document.getElementById('lb-particles');
    if (!container) return;
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'lb-particle';
        const angle = Math.random() * 360;
        const dist  = 80 + Math.random() * 220;
        const size  = 4 + Math.random() * 10;
        const delay = Math.random() * 0.5;
        p.style.cssText = `
            left:50%;top:50%;
            width:${size}px;height:${size}px;
            background:${Math.random()>0.5?color:'#fff'};
            border-radius:${Math.random()>0.5?'50%':'2px'};
            animation:lb-particle-fly 1.4s ${delay}s ease-out forwards;
            --angle:${angle}deg;--dist:${dist}px;`;
        container.appendChild(p);
    }
}

// ── Звуки (Web Audio API) ──────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

// Кастомный звук по URL
function playCustomSound(url) {
    try {
        const audio = new Audio(url);
        audio.volume = 0.7;
        audio.play().catch(() => {});
    } catch(e) {}
}

function playSound(type, rarityObj) {
    try {
        const ctx = getAudioCtx();
        if (type === 'open') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'shake') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'reveal') {
            // Разные аккорды в зависимости от редкости
            const freqSets = {
                legendary: [523, 659, 784, 1047],
                epic:      [440, 554, 659, 880],
                rare:      [392, 494, 587],
                common:    [330, 415, 494],
            };
            const rLabel = rarityObj ? Object.keys(RARITIES).find(k => RARITIES[k] === rarityObj) : 'common';
            const freqs = freqSets[rLabel] || freqSets.common;
            freqs.forEach((freq, i) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                o.type = 'sine';
                o.frequency.value = freq;
                g.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
                g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.08 + 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.6);
                o.start(ctx.currentTime + i * 0.08);
                o.stop(ctx.currentTime + i * 0.08 + 0.7);
            });
        }
    } catch(e) {}
}

// ── Создание / редактирование кастомной карточки (только для админов) ──
window.openCreateCardModal = function(existingId) {
    const modal = document.getElementById('m-create-card');
    if (!modal) return;

    // Сброс формы
    document.getElementById('cc-id').value      = existingId || '';
    document.getElementById('cc-name').value    = '';
    document.getElementById('cc-prefix').value  = '';
    document.getElementById('cc-role').value    = '';
    document.getElementById('cc-img').value     = '';
    document.getElementById('cc-desc').value    = '';
    document.getElementById('cc-rarity').value  = 'rare';
    refreshRarityDisplay();
    document.getElementById('cc-chance').value  = '5';
    document.getElementById('cc-sound').value   = '';
    document.getElementById('cc-preview-wrap').innerHTML = '';

    if (existingId) {
        // Загружаем данные для редактирования
        getDoc(doc(_db, 'custom_cards', existingId)).then(snap => {
            if (!snap.exists()) return;
            const d = snap.data();
            document.getElementById('cc-name').value   = d.name || '';
            document.getElementById('cc-prefix').value = d.prefix || '';
            document.getElementById('cc-role').value   = d.role || '';
            document.getElementById('cc-img').value    = d.img || '';
            document.getElementById('cc-desc').value   = d.description || '';
            document.getElementById('cc-rarity').value = d.rarity || 'rare';
            refreshRarityDisplay();
            document.getElementById('cc-chance').value = d.dropChance || '5';
            document.getElementById('cc-sound').value  = d.soundUrl || '';
            updateCardPreview();
        });
    }

    modal.style.display = 'flex';
};

window.editCustomCard = function(id) {
    window.openCreateCardModal(id);
};

const RARITY_META = {
    common:    { label: 'Обычная',     color: '#9ca3af' },
    rare:      { label: 'Редкая',      color: '#3b82f6' },
    epic:      { label: 'Эпическая',   color: '#a855f7' },
    legendary: { label: 'Легендарная', color: '#eab308' },
};
function refreshRarityDisplay() {
    const sel = document.getElementById('cc-rarity');
    const meta = RARITY_META[sel?.value] || RARITY_META.rare;
    const label = document.getElementById('cc-rarity-label');
    const icon = document.querySelector('#cc-rarity-trigger i.fa-circle');
    if (label) label.textContent = meta.label;
    if (icon) icon.style.color = meta.color;
}
window.toggleRarityDropdown = () => {
    const opts = document.getElementById('cc-rarity-options');
    if (opts) opts.style.display = opts.style.display === 'none' ? 'block' : 'none';
};
window.selectRarity = (val) => {
    const sel = document.getElementById('cc-rarity');
    if (sel) sel.value = val;
    refreshRarityDisplay();
    const opts = document.getElementById('cc-rarity-options');
    if (opts) opts.style.display = 'none';
    if (typeof window.updateCardPreview === 'function') window.updateCardPreview();
};
document.addEventListener('click', (e) => {
    const dd = document.getElementById('cc-rarity-dropdown');
    const opts = document.getElementById('cc-rarity-options');
    if (dd && opts && !dd.contains(e.target)) opts.style.display = 'none';
});

window.updateCardPreview = function() {
    const name    = document.getElementById('cc-name')?.value || 'Имя';
    const prefix  = document.getElementById('cc-prefix')?.value || '';
    const role    = document.getElementById('cc-role')?.value || '';
    const img     = document.getElementById('cc-img')?.value || '';
    const rarity  = document.getElementById('cc-rarity')?.value || 'rare';
    const desc    = document.getElementById('cc-desc')?.value || '';
    const wrap    = document.getElementById('cc-preview-wrap');
    if (!wrap) return;
    wrap.innerHTML = renderCard({ id: '_preview', name, prefix, role, img, rarity, description: desc }, { showActions: false, showDesc: true });
};

window.saveCustomCard = async function() {
    const { isAdmin } = _getState();
    if (!isAdmin) return showToast('Нет прав', 'error');

    const id      = document.getElementById('cc-id')?.value?.trim() || `custom_${Date.now()}`;
    const name    = document.getElementById('cc-name')?.value?.trim();
    const prefix  = document.getElementById('cc-prefix')?.value?.trim();
    const role    = document.getElementById('cc-role')?.value?.trim();
    const img     = document.getElementById('cc-img')?.value?.trim();
    const desc    = document.getElementById('cc-desc')?.value?.trim();
    const rarity  = document.getElementById('cc-rarity')?.value || 'rare';
    const chance  = parseFloat(document.getElementById('cc-chance')?.value) || 5;
    const sound   = document.getElementById('cc-sound')?.value?.trim();

    if (!name) return showToast('Введите имя карточки', 'error');

    try {
        await setDoc(doc(_db, 'custom_cards', id), {
            name, prefix: prefix || '', role: role || '',
            img: img || '', description: desc || '',
            rarity, dropChance: chance,
            soundUrl: sound || '',
            createdAt: Date.now(),
        });
        showToast('<i class="fas fa-circle-check"></i> Карточка сохранена!');
        document.getElementById('m-create-card').style.display = 'none';
        // Перерендер страницы ящиков
        const wrap = document.getElementById('lootbox-wrap');
        const { userData } = _getState();
        if (wrap) await renderLootboxPage(wrap, userData?.vcoins || 0);
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

window.deleteCustomCard = async function(id) {
    const { isAdmin } = _getState();
    if (!isAdmin) return showToast('Нет прав', 'error');
    if (!confirm('Удалить эту карточку?')) return;
    try {
        await deleteDoc(doc(_db, 'custom_cards', id));
        showToast('<i class="fas fa-trash"></i>️ Карточка удалена');
        const wrap = document.getElementById('lootbox-wrap');
        const { userData } = _getState();
        if (wrap) await renderLootboxPage(wrap, userData?.vcoins || 0);
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Рендер в renderGame ────────────────────────────────────────
export function renderLootboxGame(wrap, balance) {
    renderLootboxPage(wrap, balance);
}

// ── Экспорт ────────────────────────────────────────────────────
export function bindLootbox(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.renderLootboxGame = renderLootboxGame;
}
