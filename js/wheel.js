// ============================================================
//  js/wheel.js — Мини-игра: Колесо Фортуны
// ============================================================
import { esc, showToast } from './core.js?v=20260915p';
import { awardVCoins, getOddsMultiplier, incrementGamesWon } from './vcoins.js?v=20260915p';
import { checkAndAwardAch } from './achievements.js?v=20260915p';

let _db, _auth, _getState;
let _wheelSpinning = false;
let _wheelRotation = 0; // накопленный угол — крутим всегда вперёд, не сбрасывая

// ── Картинки оформления (арт от админа) — если не заданы, используется
//    простой запасной вариант без картинок, игра всё равно работает ──
const WHEEL_RING_IMG    = 'https://i.ibb.co/KcTkpk7q/Chat-GPT-Image-16-2026-00-52-33.png';
const WHEEL_HUB_IMG     = 'https://i.ibb.co/3y2DpyGk/Chat-GPT-Image-16-2026-00-51-24.png';
const WHEEL_POINTER_IMG = 'https://i.ibb.co/bRy1LbRV/Chat-GPT-Image-16-2026-00-49-49.png';

// ── Сегменты колеса: множитель + цвет. 8 секторов по 45°.
//    Сумма/8 — средняя отдача (сейчас 0.9375, т.е. ~6% в пользу студии) ──
const SEGMENTS = [
    { mult: 0,   color: '#1a1a1a' },
    { mult: 1,   color: '#7f1d1d' },
    { mult: 0.5, color: '#450a0a' },
    { mult: 3,   color: '#facc15' },
    { mult: 0,   color: '#1a1a1a' },
    { mult: 1.5, color: '#b91c1c' },
    { mult: 0.5, color: '#450a0a' },
    { mult: 1,   color: '#7f1d1d' },
];
const SEG_ANGLE = 360 / SEGMENTS.length;
const SPIN_MS   = 4200;

function buildWheelGradient() {
    let stops = [];
    SEGMENTS.forEach((s, i) => {
        const from = (i * SEG_ANGLE).toFixed(2);
        const to   = ((i + 1) * SEG_ANGLE).toFixed(2);
        stops.push(`${s.color} ${from}deg ${to}deg`);
    });
    return `conic-gradient(${stops.join(', ')})`;
}

function buildWheelLabels() {
    // Радиус подписи — заметно ближе к центру, чем край колеса: снаружи
    // их закрывает металлический обод рамки-кольца (сама рамка — картинка
    // сверху, и с ней нельзя точно угадать, где у неё "прозрачная" часть).
    // Проигрышный сектор (0×) подписываем крестиком — понятнее, чем "0×".
    return SEGMENTS.map((s, i) => {
        const angle = i * SEG_ANGLE + SEG_ANGLE / 2;
        const label = s.mult === 0 ? '<i class="fas fa-xmark"></i>' : `${s.mult}×`;
        const cls = s.mult === 0 ? 'wheel-seg-label wheel-seg-label--lose' : 'wheel-seg-label';
        return `<span class="${cls}" style="transform:rotate(${angle}deg) translateY(-75px) rotate(${-angle}deg);">${label}</span>`;
    }).join('');
}

// ── Взвешенный выбор сектора: "0×" — базовый вес, остальные множатся на
//    админский рычаг шансов (как и в остальных играх/ящиках) ──
function pickSegmentIndex(oddsM) {
    const weights = SEGMENTS.map(s => s.mult === 0 ? 1 : oddsM);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
    }
    return 0;
}

function renderWheelGame(wrap, balance) {
    if (!wrap) return;
    wrap.innerHTML = `
    <div class="game-wrap-inner">
        <div class="game-header">
            <div class="game-title"><i class="fas fa-dharmachakra"></i> Колесо Фортуны</div>
            <div class="game-balance">Баланс: <b>${balance} VC</b></div>
        </div>
        <div class="game-desc">Крути колесо — выигрыш зависит от сектора, в который укажет стрелка.</div>

        <div class="wheel-outer">
            ${WHEEL_POINTER_IMG ? `<img src="${esc(WHEEL_POINTER_IMG)}" class="wheel-pointer-img" alt="">` : `<div class="wheel-pointer-fallback"></div>`}
            <div class="wheel-face" id="wheel-face" style="background:${buildWheelGradient()};transform:rotate(${_wheelRotation}deg);">
                ${buildWheelLabels()}
            </div>
            ${WHEEL_RING_IMG ? `<img src="${esc(WHEEL_RING_IMG)}" class="wheel-ring-img" alt="">` : ''}
            ${WHEEL_HUB_IMG
                ? `<img src="${esc(WHEEL_HUB_IMG)}" class="wheel-hub-img" id="wheel-spin-btn" onclick="spinWheel()" alt="Крутить">`
                : `<button class="wheel-hub-fallback" id="wheel-spin-btn" onclick="spinWheel()">Крутить</button>`}
        </div>

        <div class="game-bet-row">
            <label class="order-label">Ставка (VC)</label>
            <input type="number" id="wheel-bet" min="1" max="${balance}" value="10">
        </div>
        <div id="wheel-result" style="min-height:36px;text-align:center;font-size:1rem;font-weight:700;padding:10px 18px 0;"></div>
    </div>`;
}

async function spinWheel() {
    if (_wheelSpinning) return;
    const { userData } = _getState();
    if (!userData) return showToast('Войдите в аккаунт', 'error');

    const betInput = document.getElementById('wheel-bet');
    const bet = parseInt(betInput?.value) || 0;
    const balance = userData.vcoins || 0;
    if (bet < 1) return showToast('Введите ставку', 'error');
    if (bet > balance) return showToast('Недостаточно VCoins!', 'error');
    if (!window.spendVCoinsGlobal) return showToast('Ошибка системы VCoins', 'error');

    const btn = document.getElementById('wheel-spin-btn');
    _wheelSpinning = true;
    if (btn) btn.style.pointerEvents = 'none';

    const ok = await window.spendVCoinsGlobal(bet, 'Колесо Фортуны — ставка');
    if (!ok) { _wheelSpinning = false; if (btn) btn.style.pointerEvents = ''; return; }

    const oddsM = await getOddsMultiplier();
    const idx = pickSegmentIndex(oddsM);
    const mult = SEGMENTS[idx].mult;

    // Целимся так, чтобы центр выбранного сектора оказался ровно под
    // стрелкой (стрелка сверху = 0°), плюс несколько полных оборотов и
    // небольшой случайный разброс внутри сектора для естественности.
    const segCenter    = idx * SEG_ANGLE + SEG_ANGLE / 2;
    const jitter        = (Math.random() - 0.5) * (SEG_ANGLE * 0.7);
    const fullSpins      = 5;
    const targetInCircle = (360 - segCenter + jitter + 360) % 360;
    const currentInCircle = ((_wheelRotation % 360) + 360) % 360;
    let delta = targetInCircle - currentInCircle;
    if (delta <= 0) delta += 360;
    _wheelRotation += fullSpins * 360 + delta;

    const wheelEl = document.getElementById('wheel-face');
    if (wheelEl) wheelEl.style.transform = `rotate(${_wheelRotation}deg)`;

    const resEl = document.getElementById('wheel-result');
    if (resEl) resEl.innerHTML = '';

    setTimeout(async () => {
        const prize = Math.floor(bet * mult);
        if (mult === 0) {
            if (resEl) resEl.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-xmark"></i> Мимо! Потерял ${bet} VC</span>`;
        } else {
            await awardVCoins(prize, 'Колесо Фортуны — ×' + mult);
            if (prize > bet) {
                if (resEl) resEl.innerHTML = `<span style="color:var(--teal);"><i class="fas fa-coins"></i> ×${mult} Выигрыш! +${prize - bet} VC</span>`;
                await checkAndAwardAch(_db, _auth, userData, 'game_win');
                await incrementGamesWon();
            } else {
                if (resEl) resEl.innerHTML = `<span style="color:var(--text-dim);"><i class="fas fa-rotate-left"></i> ×${mult} Возврат ${prize} VC</span>`;
            }
        }
        _wheelSpinning = false;
        if (btn) btn.style.pointerEvents = '';
    }, SPIN_MS);
}

// ── Экспорт ────────────────────────────────────────────────────
export function bindWheel(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;
    window.renderWheelGame = renderWheelGame;
    window.spinWheel = spinWheel;
}
