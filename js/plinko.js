// ═══════════════════════════════════════════════════════
//  🌌 PLINKO «ЧЁРНАЯ ДЫРА» — движок + ИИ-алгоритм шансов
// ═══════════════════════════════════════════════════════

(function() {
    'use strict';

    // ── Конфигурация поля ──────────────────────────────
    const ROWS        = 10;      // рядов штырей
    const BALL_R      = 7;       // радиус шарика
    const PEG_R       = 4;       // радиус штыря
    const GRAVITY     = 0.28;
    const FRICTION    = 0.995;
    const BOUNCE      = 0.52;
    const CANVAS_W    = 360;
    const CANVAS_H    = 420;

    // Множители ячеек (центр → края: от малых к большим)
    const MULTIPLIERS = [0, 0.5, 1, 1.5, 2, 2, 1.5, 1, 0.5, 0, 0];
    // Индексы «джекпот»-ячеек (крайние)
    const JACKPOT_IDX = [0, MULTIPLIERS.length - 1];

    // ── Состояние ИИ ──────────────────────────────────
    let _plinkoWinStreak  = 0;
    let _plinkoAvgBet     = 0;
    let _plinkoBetCount   = 0;
    let _plinkoRunning    = false;

    // ── Вычисление позиций штырей ─────────────────────
    function buildPegs(cw, ch) {
        const pegs = [];
        const topPad  = 60;
        const botPad  = 80;
        const rowH    = (ch - topPad - botPad) / (ROWS - 1);
        for (let r = 0; r < ROWS; r++) {
            const cols  = r + 3;
            const totalW = (cols - 1) * (cw / (ROWS + 2));
            const startX = (cw - totalW) / 2;
            for (let c = 0; c < cols; c++) {
                pegs.push({
                    x: startX + c * (totalW / (cols - 1)),
                    y: topPad + r * rowH
                });
            }
        }
        return pegs;
    }

    // ── Вычисление позиций ячеек ──────────────────────
    function buildBuckets(cw, ch) {
        const n       = MULTIPLIERS.length;
        const bw      = cw / n;
        const y       = ch - 60;
        return MULTIPLIERS.map((m, i) => ({
            x: i * bw,
            y,
            w: bw,
            h: 50,
            mult: m,
            idx: i
        }));
    }

    // ── ИИ: вычислить смещение шарика ─────────────────
    // Возвращает bias [-1..1]: отрицательный = к краям, положительный = к центру
    function _computeBias(bet) {
        // Обновляем скользящее среднее ставок
        _plinkoBetCount++;
        _plinkoAvgBet = _plinkoAvgBet + (bet - _plinkoAvgBet) / _plinkoBetCount;

        const isBigBet = bet >= Math.max(_plinkoAvgBet * 1.6, 80);

        if (isBigBet) {
            // Большая ставка → шарик тянем к центру (малые множители)
            return 0.55;
        }
        if (_plinkoWinStreak >= 3) {
            // Серия побед → слегка к центру
            const penalty = Math.min((_plinkoWinStreak - 2) * 0.12, 0.45);
            return 0.2 + penalty;
        }
        // Дофаминовый режим: лёгкое смещение к краям (интересные результаты)
        return -0.15;
    }

    // ── Физика шарика ─────────────────────────────────
    function createBall(cx, bias) {
        // bias > 0 → к центру, bias < 0 → к краям
        const jitter = (Math.random() - 0.5) * 4;
        return {
            x:  cx + jitter,
            y:  20,
            vx: (Math.random() - 0.5 + bias * 0.3) * 1.5,
            vy: 1.5,
            r:  BALL_R,
            trail: [],
            landed: false,
            bucketIdx: -1
        };
    }

    function stepBall(ball, pegs, buckets, bias) {
        if (ball.landed) return;

        // Гравитация
        ball.vy += GRAVITY;
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;

        // Лёгкое смещение ИИ на каждом кадре
        ball.vx += bias * 0.018;

        ball.x += ball.vx;
        ball.y += ball.vy;

        // Стены
        if (ball.x - ball.r < 0)           { ball.x = ball.r;           ball.vx = Math.abs(ball.vx) * BOUNCE; }
        if (ball.x + ball.r > CANVAS_W)    { ball.x = CANVAS_W - ball.r; ball.vx = -Math.abs(ball.vx) * BOUNCE; }

        // Столкновения со штырями
        for (const peg of pegs) {
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minD = ball.r + PEG_R;
            if (dist < minD && dist > 0.01) {
                const nx = dx / dist;
                const ny = dy / dist;
                // Отталкиваем
                ball.x = peg.x + nx * (minD + 0.5);
                ball.y = peg.y + ny * (minD + 0.5);
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dot * nx) * BOUNCE + (Math.random() - 0.5) * 0.6;
                ball.vy = (ball.vy - 2 * dot * ny) * BOUNCE;
                if (ball.vy < 0.5) ball.vy = 0.5;
            }
        }

        // Трейл
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 18) ball.trail.shift();

        // Попадание в ячейку
        for (const b of buckets) {
            if (ball.y + ball.r >= b.y && ball.x >= b.x && ball.x <= b.x + b.w) {
                ball.landed = true;
                ball.bucketIdx = b.idx;
                ball.x = b.x + b.w / 2;
                ball.y = b.y + b.h / 2 - 10;
                ball.vx = 0; ball.vy = 0;
                break;
            }
        }
    }

    // ── Рендер ────────────────────────────────────────
    function drawFrame(ctx, pegs, buckets, ball, highlightIdx, cw, ch, tick) {
        // Фон
        ctx.clearRect(0, 0, cw, ch);

        // Звёздный фон
        ctx.fillStyle = '#07041a';
        ctx.fillRect(0, 0, cw, ch);

        // Мерцающие звёзды (статичные)
        ctx.save();
        for (let i = 0; i < 40; i++) {
            const sx = ((i * 137 + 17) % cw);
            const sy = ((i * 97  + 31) % (ch - 80));
            const alpha = 0.2 + 0.3 * Math.abs(Math.sin(tick * 0.02 + i));
            ctx.globalAlpha = alpha;
            ctx.fillStyle = i % 3 === 0 ? '#c4b5fd' : i % 3 === 1 ? '#5eead4' : '#fff';
            ctx.beginPath();
            ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Трейл шарика
        if (ball.trail.length > 1) {
            for (let i = 1; i < ball.trail.length; i++) {
                const alpha = (i / ball.trail.length) * 0.5;
                const t = ball.trail[i];
                const tp = ball.trail[i - 1];
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#14b8a6';
                ctx.lineWidth = BALL_R * 2 * (i / ball.trail.length);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(tp.x, tp.y);
                ctx.lineTo(t.x, t.y);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Штыри
        for (const peg of pegs) {
            // Свечение
            const grd = ctx.createRadialGradient(peg.x, peg.y, 0, peg.x, peg.y, PEG_R * 3);
            grd.addColorStop(0, 'rgba(167,139,250,0.25)');
            grd.addColorStop(1, 'rgba(167,139,250,0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, PEG_R * 3, 0, Math.PI * 2);
            ctx.fill();
            // Штырь
            ctx.fillStyle = '#a78bfa';
            ctx.shadowColor = '#7c3aed';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, PEG_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Ячейки
        for (const b of buckets) {
            const isHighlight = b.idx === highlightIdx;
            const isJackpot   = JACKPOT_IDX.includes(b.idx);
            const isZero      = b.mult === 0;

            // Фон ячейки
            let fillColor;
            if (isHighlight) {
                fillColor = isZero ? 'rgba(239,68,68,0.7)' : 'rgba(20,184,166,0.7)';
            } else if (isZero) {
                fillColor = 'rgba(239,68,68,0.15)';
            } else if (b.mult >= 2) {
                fillColor = 'rgba(124,58,237,0.25)';
            } else {
                fillColor = 'rgba(20,184,166,0.1)';
            }
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.roundRect(b.x + 1, b.y + 2, b.w - 2, b.h - 4, 8);
            ctx.fill();

            // Рамка
            ctx.strokeStyle = isHighlight
                ? (isZero ? '#ef4444' : '#14b8a6')
                : (isZero ? 'rgba(239,68,68,0.4)' : 'rgba(124,58,237,0.35)');
            ctx.lineWidth = isHighlight ? 2 : 1;
            ctx.stroke();

            // Текст множителя
            ctx.fillStyle = isHighlight
                ? '#fff'
                : (isZero ? '#ef4444' : b.mult >= 2 ? '#c4b5fd' : '#5eead4');
            ctx.font = `bold ${isHighlight ? 13 : 11}px 'Exo 2', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                b.mult === 0 ? '✕' : `×${b.mult}`,
                b.x + b.w / 2,
                b.y + b.h / 2
            );
        }

        // Шарик
        if (!ball.landed || highlightIdx >= 0) {
            const ballGrd = ctx.createRadialGradient(
                ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, 1,
                ball.x, ball.y, ball.r * 1.5
            );
            ballGrd.addColorStop(0, '#fff');
            ballGrd.addColorStop(0.3, '#5eead4');
            ballGrd.addColorStop(1, '#0d9488');
            ctx.fillStyle = ballGrd;
            ctx.shadowColor = '#14b8a6';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Блик
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Главная функция игры ──────────────────────────
    window.startPlinko = async function() {
        if (_plinkoRunning) return;
        const { userData } = _getState();
        const betInput = document.getElementById('plinko-bet');
        const bet = parseInt(betInput?.value) || 0;
        if (bet <= 0) return showToast('Введите ставку', 'error');
        if (bet > 500) return showToast('Максимальная ставка — 500 VC', 'error');

        const ok = await spendVCoins(bet, 'Чёрная дыра — ставка');
        if (!ok) return;

        _plinkoRunning = true;
        const btn = document.getElementById('plinko-drop-btn');
        if (btn) btn.disabled = true;

        const canvas = document.getElementById('plinko-canvas');
        if (!canvas) { _plinkoRunning = false; return; }
        const ctx = canvas.getContext('2d');
        const cw = canvas.width;
        const ch = canvas.height;

        const pegs    = buildPegs(cw, ch);
        const buckets = buildBuckets(cw, ch);
        const bias    = _computeBias(bet);
        const ball    = createBall(cw / 2, bias);

        let tick = 0;
        let highlightIdx = -1;
        let resultShown  = false;

        const loop = async () => {
            tick++;
            if (!ball.landed) {
                stepBall(ball, pegs, buckets, bias);
            }

            drawFrame(ctx, pegs, buckets, ball, highlightIdx, cw, ch, tick);

            if (ball.landed && !resultShown) {
                resultShown  = true;
                highlightIdx = ball.bucketIdx;
                drawFrame(ctx, pegs, buckets, ball, highlightIdx, cw, ch, tick);

                const mult  = MULTIPLIERS[ball.bucketIdx];
                const prize = Math.floor(bet * mult);
                const resEl = document.getElementById('plinko-result');

                if (mult === 0) {
                    _plinkoWinStreak = 0;
                    if (resEl) resEl.innerHTML = `<span class="plinko-res-lose">💥 Чёрная дыра! Потерял ${bet} VC</span>`;
                } else if (prize > bet) {
                    _plinkoWinStreak++;
                    await awardVCoins(prize, 'Чёрная дыра — выигрыш ×' + mult);
                    if (resEl) resEl.innerHTML = `<span class="plinko-res-win">✨ ×${mult} Выигрыш! +${prize - bet} VC</span>`;
                    await checkAndAwardAch(_db, _auth, userData, 'game_win');
                } else {
                    _plinkoWinStreak = 0;
                    if (prize > 0) await awardVCoins(prize, 'Чёрная дыра — возврат ×' + mult);
                    if (resEl) resEl.innerHTML = `<span class="plinko-res-neutral">↩️ ×${mult} Возврат ${prize} VC</span>`;
                }

                const balEl = document.querySelector('.game-balance b');
                if (balEl) balEl.textContent = (userData?.vcoins || 0) + ' VC';

                _plinkoRunning = false;
                if (btn) btn.disabled = false;
                return; // стоп
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    };

    // ── Рендер HTML-шаблона игры ──────────────────────
    window._renderPlinko = function(wrap, balance) {
        wrap.innerHTML = `
        <div class="game-wrap-inner">
            <div class="game-header">
                <div class="game-title">🌌 Чёрная дыра</div>
                <div class="game-balance">Баланс: <b>${balance} VC</b></div>
            </div>
            <div class="game-desc">Шарик падает через штыри. Попади в высокий множитель — выиграй!</div>
            <div class="plinko-arena">
                <canvas id="plinko-canvas" width="360" height="420"></canvas>
            </div>
            <div class="game-bet-row">
                <label class="order-label">Ставка (VC)</label>
                <input type="number" id="plinko-bet" min="1" max="${Math.min(balance, 500)}" value="25">
            </div>
            <div style="display:flex;justify-content:center;margin-top:14px;padding:0 18px;">
                <button class="plinko-drop-btn" id="plinko-drop-btn" onclick="startPlinko()">
                    🌌 Бросить шарик
                </button>
            </div>
            <div id="plinko-result" style="min-height:36px;text-align:center;font-size:1rem;font-weight:700;padding:10px 18px 16px;"></div>
        </div>`;

        // Нарисовать начальное поле
        const canvas  = document.getElementById('plinko-canvas');
        const ctx     = canvas.getContext('2d');
        const pegs    = buildPegs(canvas.width, canvas.height);
        const buckets = buildBuckets(canvas.width, canvas.height);
        const dummyBall = { x: -100, y: -100, r: BALL_R, trail: [], landed: false, bucketIdx: -1 };
        drawFrame(ctx, pegs, buckets, dummyBall, -1, canvas.width, canvas.height, 0);
    };

})();
