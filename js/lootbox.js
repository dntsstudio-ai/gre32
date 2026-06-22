// ============================================================
//  js/lootbox.js — Лутбокс (открытие карточек)
// ============================================================

import {
    doc, getDoc, getDocs, updateDoc, collection, increment, addDoc,
    query, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate } from './core.js';
import { checkAndAwardAch } from './achievements.js';

const RARITIES = {
    common:    { label: 'Обычная',    color: '#94a3b8', glow: 'rgba(148,163,184,0.3)',  sellPrice: 10 },
    rare:      { label: 'Редкая',     color: '#3b82f6', glow: 'rgba(59,130,246,0.3)',   sellPrice: 50 },
    epic:      { label: 'Эпическая',  color: '#a855f7', glow: 'rgba(168,85,247,0.3)',   sellPrice: 150 },
    legendary: { label: 'Легендарная',color: '#fbbf24', glow: 'rgba(251,191,36,0.3)',   sellPrice: 500 }
};

export function bindLootbox(db, auth, getState) {

    // ── Открытие лутбокса ──
    window.openLootbox = async function(boxId, isCustom) {
        const { userData } = getState();
        if (!userData) return;

        try {
            const boxSnap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'lootboxes', boxId));
            if (!boxSnap.exists()) return showToast('Бокс не найден', 'error');

            const boxData = boxSnap.data();
            const rarity = boxData.rarity || 'common';
            const box = BOXES[rarity] || BOXES.common;

            // Получаем случайную карточку
            let member = null;
            if (isCustom && boxData.customCardId) {
                const customSnap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'customCards', boxData.customCardId));
                if (customSnap.exists()) member = { id: boxData.customCardId, ...customSnap.data() };
            } else {
                const cardsSnap = await getDocs(collection(db, 'cards'));
                const cards = cardsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(c => (c.rarity || 'common') === rarity);
                if (cards.length) member = cards[Math.floor(Math.random() * cards.length)];
            }

            if (!member) return showToast('Карточка не найдена', 'error');

            // Показываем оверлей с боксом
            showCardReveal(box, member, rarity, isCustom);

            // Удаляем бокс после открытия
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                lootboxes: increment(-1)
            });
            await updateDoc(doc(db, 'users', auth.currentUser.uid, 'lootboxes', boxId), {
                opened: true, openedAt: Date.now()
            });

            // Проверяем достижение
            await checkAndAwardAch(db, auth, userData, 'first_open');
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
            console.error('openLootbox:', e);
        }
    };

    // ── Быстрое открытие всех боксов ──
    window.quickOpenAll = async function() {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        const count = userData.lootboxes || 0;
        if (count === 0) return showToast('Нет боксов для открытия', 'info');

        try {
            const boxesSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'lootboxes'));
            const unopened = boxesSnap.docs.filter(d => !d.data().opened);

            if (unopened.length === 0) return showToast('Все боксы уже открыты', 'info');

            for (const boxDoc of unopened) {
                const boxData = boxDoc.data();
                const rarity = boxData.rarity || 'common';
                const box = BOXES[rarity] || BOXES.common;

                let member = null;
                if (boxData.customCardId) {
                    const customSnap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'customCards', boxData.customCardId));
                    if (customSnap.exists()) member = { id: boxData.customCardId, ...customSnap.data() };
                } else {
                    const cardsSnap = await getDocs(collection(db, 'cards'));
                    const cards = cardsSnap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter(c => (c.rarity || 'common') === rarity);
                    if (cards.length) member = cards[Math.floor(Math.random() * cards.length)];
                }

                if (member) {
                    // Добавляем в инвентарь
                    const field = boxData.customCardId ? 'customCards' : 'cards';
                    const inv = userData.inventory || {};
                    inv[field] = inv[field] || [];
                    if (!inv[field].includes(member.id)) inv[field].push(member.id);
                    userData.inventory = inv;

                    await updateDoc(doc(db, 'users', auth.currentUser.uid), { inventory: inv });
                }

                await updateDoc(doc(db, 'users', auth.currentUser.uid, 'lootboxes', boxDoc.id), {
                    opened: true, openedAt: Date.now()
                });
            }

            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                lootboxes: 0
            });

            showToast('✨ Все боксы открыты!');
            await checkAndAwardAch(db, auth, userData, 'bulk_open');
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
        }
    };

    // ── Оверлей с боксом ──
    function showCardReveal(box, member, rarity, isCustom) {
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
                    ${isCustom ? '<div class="lb-custom-badge">✨ Особая карточка!</div>' : ''}
                </div>
            </div>
            <div class="lb-reveal-rarity-text" style="color:${r.color};">
                ${r.label.toUpperCase()}${isCustom ? ' · ОСОБАЯ' : ''}
            </div>
            <div class="lb-reveal-actions">
                <button class="btn lb-btn-keep" onclick="keepCard()">
                    🎒 В инвентарь
                </button>
                <button class="btn lb-btn-sell" onclick="quickSellCard('${esc(member.id)}', ${r.sellPrice}, ${isCustom})">
                    💰 Продать за ${r.sellPrice} VC
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('lb-reveal-overlay--visible'));

        // Звук открытия (или кастомный звук карточки)
        if (isCustom && member.soundUrl) {
            playCustomSound(member.soundUrl);
        } else {
            playSound('open');
        }

        spawnParticles(r.color);

        const boxWrap = document.getElementById('lb-box-wrap');
        if (boxWrap) {
            // Обработка клика
            const handleBoxClick = () => {
                boxWrap.removeEventListener('click', handleBoxClick);
                boxWrap.removeEventListener('touchend', handleBoxClick);
                revealCard(r, isCustom, member);
            };
            
            boxWrap.addEventListener('click', handleBoxClick);
            boxWrap.addEventListener('touchend', handleBoxClick);
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

        setTimeout(() => {
            boxWrap.classList.add('lb-box--explode');

            // Звук при выпадении (кастомный или стандартный по редкости)
            if (isCustom && member.soundUrl) {
                playCustomSound(member.soundUrl);
            } else {
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
        closeReveal();
        showToast('✨ Карточка добавлена в инвентарь!');
    };

    window.closeReveal = function() {
        const overlay = document.getElementById('lootbox-reveal-overlay');
        if (overlay) {
            overlay.classList.remove('lb-reveal-overlay--visible');
            setTimeout(() => overlay.remove(), 300);
        }
    };

    window.quickSellCard = async function(cardId, price, isCustom) {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;

        try {
            const field = isCustom ? 'customCards' : 'cards';
            const inv = userData.inventory || {};
            inv[field] = inv[field] || [];
            inv[field] = inv[field].filter(id => id !== cardId);
            userData.inventory = inv;

            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                inventory: inv,
                vcoins: increment(price)
            });

            closeReveal();
            showToast(`💰 Продано за ${price} VC!`);
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
        }
    };
}

// ── Звуки (Web Audio API) ──────────────────────────────────────
let _audioCtx = null;
let _currentAudioElements = [];
const MAX_CONCURRENT_SOUNDS = 5;

function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

// Управление одновременным воспроизведением звуков
function cleanupOldAudio() {
    _currentAudioElements = _currentAudioElements.filter(audio => !audio.paused);
    if (_currentAudioElements.length >= MAX_CONCURRENT_SOUNDS) {
        const oldest = _currentAudioElements.shift();
        oldest.pause();
        oldest.currentTime = 0;
    }
}

// Кастомный звук по URL
function playCustomSound(url) {
    try {
        cleanupOldAudio();
        const audio = new Audio(url);
        audio.volume = 0.7;
        _currentAudioElements.push(audio);
        audio.play().catch(() => {});
        
        // Очистка после завершения
        audio.addEventListener('ended', () => {
            _currentAudioElements = _currentAudioElements.filter(a => a !== audio);
        }, { once: true });
    } catch(e) {
        console.error('playCustomSound error:', e);
    }
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
    } catch(e) {
        console.error('playSound error:', e);
    }
}

// ── Частицы ──
function spawnParticles(color) {
    const container = document.getElementById('lb-particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'lb-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.background = color;
        p.style.opacity = Math.random() * 0.7 + 0.3;
        container.appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
}

// ── Боксы ──
const BOXES = {
    common: {
        icon: '📦',
        gradient: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
        border: '#64748b'
    },
    rare: {
        icon: '💎',
        gradient: 'linear-gradient(135deg, #bfdbfe, #3b82f6)',
        border: '#1e40af'
    },
    epic: {
        icon: '✨',
        gradient: 'linear-gradient(135deg, #e9d5ff, #a855f7)',
        border: '#6d28d9'
    },
    legendary: {
        icon: '👑',
        gradient: 'linear-gradient(135deg, #fef3c7, #fbbf24)',
        border: '#b45309'
    }
};

// Функция рендеринга карточки (заглушка)
function renderCard(card, opts) {
    return `
    <div class="card-item" style="padding:20px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:10px;">${card.icon || '🎴'}</div>
        <div style="font-weight:700;font-size:1.1rem;">${esc(card.name || 'Карточка')}</div>
        ${opts.showDesc && card.description ? `<div style="font-size:0.9rem;color:var(--text-dim);margin-top:8px;">${esc(card.description)}</div>` : ''}
    </div>
    `;
}
