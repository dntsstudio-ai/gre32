// ============================================================
//  js/fungames.js — развлекательные мини-игры без ставок и валюты
//  Камень-Ножницы-Бумага · Крестики-нолики · Змейка · Memory
// ============================================================

// ───────────────────────── Камень-Ножницы-Бумага ─────────────────────────
const RPS_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const RPS_NAMES = { rock: 'Камень', paper: 'Бумага', scissors: 'Ножницы' };
let _rpsScore = { win: 0, lose: 0, draw: 0 };

function _rpsBeats(a, b) {
    return (a === 'rock' && b === 'scissors') ||
           (a === 'paper' && b === 'rock') ||
           (a === 'scissors' && b === 'paper');
}

window._renderRPS = function(wrap) {
    wrap.innerHTML = `
    <div class="game-wrap-inner">
        <div class="game-header">
            <div class="game-title">✊ Камень-Ножницы-Бумага</div>
            <div class="game-balance">Счёт: <b id="rps-score">${_rpsScore.win}-${_rpsScore.lose}-${_rpsScore.draw}</b></div>
        </div>
        <div class="game-desc">Выбери фигуру и сыграй против бота — просто для веселья, без ставок.</div>
        <div class="rps-arena">
            <div class="rps-side">
                <div class="rps-label">Ты</div>
                <div class="rps-display" id="rps-you">❓</div>
            </div>
            <div class="rps-vs">VS</div>
            <div class="rps-side">
                <div class="rps-label">Бот</div>
                <div class="rps-display" id="rps-bot">❓</div>
            </div>
        </div>
        <div class="rps-choices">
            <button class="rps-choice-btn" onclick="playRPS('rock')">✊</button>
            <button class="rps-choice-btn" onclick="playRPS('paper')">✋</button>
            <button class="rps-choice-btn" onclick="playRPS('scissors')">✌️</button>
        </div>
        <div id="game-result"></div>
    </div>`;
};

window.playRPS = function(choice) {
    const picks = ['rock', 'paper', 'scissors'];
    const botChoice = picks[Math.floor(Math.random() * 3)];
    const youEl = document.getElementById('rps-you');
    const botEl = document.getElementById('rps-bot');
    const resEl = document.getElementById('game-result');
    if (youEl) youEl.textContent = RPS_EMOJI[choice];
    if (botEl) botEl.textContent = RPS_EMOJI[botChoice];

    let msg, color;
    if (choice === botChoice) {
        _rpsScore.draw++; msg = '🤝 Ничья!'; color = 'var(--text-dim)';
    } else if (_rpsBeats(choice, botChoice)) {
        _rpsScore.win++; msg = `🎉 Победа! ${RPS_NAMES[choice]} бьёт «${RPS_NAMES[botChoice]}»`; color = 'var(--teal)';
    } else {
        _rpsScore.lose++; msg = `😅 Бот выиграл: «${RPS_NAMES[botChoice]}» бьёт «${RPS_NAMES[choice]}»`; color = '#ef4444';
    }
    if (resEl) resEl.innerHTML = `<span style="color:${color}">${msg}</span>`;
    const scoreEl = document.getElementById('rps-score');
    if (scoreEl) scoreEl.textContent = `${_rpsScore.win}-${_rpsScore.lose}-${_rpsScore.draw}`;
};

// ───────────────────────── Крестики-нолики ─────────────────────────
const TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let _ttt = { board: Array(9).fill(''), over: false };
let _tttScore = { win: 0, lose: 0, draw: 0 };

function _tttWinner(b) {
    for (const [a, c, d] of TTT_LINES) {
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return b.every(c => c) ? 'draw' : null;
}

function _tttBotMove(b) {
    for (const line of TTT_LINES) {
        const vals = line.map(i => b[i]);
        if (vals.filter(v => v === 'O').length === 2 && vals.includes('')) return line[vals.indexOf('')];
    }
    for (const line of TTT_LINES) {
        const vals = line.map(i => b[i]);
        if (vals.filter(v => v === 'X').length === 2 && vals.includes('')) return line[vals.indexOf('')];
    }
    if (!b[4]) return 4;
    const free = b.map((v, i) => v ? null : i).filter(i => i !== null);
    return free[Math.floor(Math.random() * free.length)];
}

window._renderTTT = function(wrap) {
    _ttt = { board: Array(9).fill(''), over: false };
    wrap.innerHTML = `
    <div class="game-wrap-inner">
        <div class="game-header">
            <div class="game-title">❌⭕ Крестики-нолики</div>
            <div class="game-balance">Счёт: <b id="ttt-score">${_tttScore.win}-${_tttScore.lose}-${_tttScore.draw}</b></div>
        </div>
        <div class="game-desc">Ты — ❌, бот — ⭕. Собери линию из трёх. Просто для веселья, без ставок.</div>
        <div class="ttt-board">
            ${_ttt.board.map((_, i) => `<button class="ttt-cell" id="ttt-c${i}" onclick="playTTT(${i})"></button>`).join('')}
        </div>
        <div id="game-result"></div>
        <div class="game-actions">
            <button class="btn btn-outline btn-sm" onclick="_renderTTT(document.getElementById('game-wrap'))">🔄 Новая игра</button>
        </div>
    </div>`;
};

window.playTTT = function(i) {
    if (_ttt.over || _ttt.board[i]) return;
    _ttt.board[i] = 'X';
    document.getElementById('ttt-c' + i).textContent = '❌';
    let winner = _tttWinner(_ttt.board);
    if (!winner) {
        const botI = _tttBotMove(_ttt.board);
        if (botI !== undefined) {
            _ttt.board[botI] = 'O';
            document.getElementById('ttt-c' + botI).textContent = '⭕';
        }
        winner = _tttWinner(_ttt.board);
    }
    if (!winner) return;
    _ttt.over = true;
    const resEl = document.getElementById('game-result');
    if (winner === 'draw') { _tttScore.draw++; resEl.innerHTML = '<span style="color:var(--text-dim)">🤝 Ничья!</span>'; }
    else if (winner === 'X') { _tttScore.win++; resEl.innerHTML = '<span style="color:var(--teal)">🎉 Ты выиграл!</span>'; }
    else { _tttScore.lose++; resEl.innerHTML = '<span style="color:#ef4444">😅 Бот выиграл!</span>'; }
    const scoreEl = document.getElementById('ttt-score');
    if (scoreEl) scoreEl.textContent = `${_tttScore.win}-${_tttScore.lose}-${_tttScore.draw}`;
};

// ───────────────────────── Змейка ─────────────────────────
const SNAKE_COLS = 15, SNAKE_ROWS = 15, SNAKE_CELL = 18;
let _snake = null;

function _snakeKeyHandler(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[e.key]) { e.preventDefault(); window._snakeDir(map[e.key]); }
}

function _snakeStop() {
    if (_snake?.interval) clearInterval(_snake.interval);
    if (_snake) _snake.over = true;
    document.removeEventListener('keydown', _snakeKeyHandler);
}
window._stopFunGames = _snakeStop;

function _snakeRandFood(cells) {
    let f;
    do {
        f = { x: Math.floor(Math.random() * SNAKE_COLS), y: Math.floor(Math.random() * SNAKE_ROWS) };
    } while (cells.some(c => c.x === f.x && c.y === f.y));
    return f;
}

function _snakeDraw(ctx) {
    ctx.fillStyle = '#0a0720';
    ctx.fillRect(0, 0, SNAKE_COLS * SNAKE_CELL, SNAKE_ROWS * SNAKE_CELL);
    _snake.cells.forEach((c, i) => {
        ctx.fillStyle = i === 0 ? '#5eead4' : '#14b8a6';
        ctx.fillRect(c.x * SNAKE_CELL + 1, c.y * SNAKE_CELL + 1, SNAKE_CELL - 2, SNAKE_CELL - 2);
    });
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(_snake.food.x * SNAKE_CELL + SNAKE_CELL / 2, _snake.food.y * SNAKE_CELL + SNAKE_CELL / 2, SNAKE_CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
}

function _snakeTick(ctx) {
    if (!_snake || _snake.over) return;
    if (!_snake.canvas.isConnected) { _snakeStop(); return; }
    _snake.dir = _snake.nextDir;
    const head = _snake.cells[0];
    const delta = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[_snake.dir];
    const newHead = { x: head.x + delta.x, y: head.y + delta.y };

    const hitWall = newHead.x < 0 || newHead.x >= SNAKE_COLS || newHead.y < 0 || newHead.y >= SNAKE_ROWS;
    const hitSelf = _snake.cells.some(c => c.x === newHead.x && c.y === newHead.y);
    if (hitWall || hitSelf) {
        _snakeStop();
        const resEl = document.getElementById('game-result');
        if (resEl) resEl.innerHTML = `<span style="color:#ef4444">💀 Игра окончена! Очки: ${_snake.score}</span>
            <button class="btn btn-sm btn-purple" style="margin-left:8px;" onclick="_renderSnake(document.getElementById('game-wrap'))">🔄 Заново</button>`;
        return;
    }

    _snake.cells.unshift(newHead);
    if (newHead.x === _snake.food.x && newHead.y === _snake.food.y) {
        _snake.score++;
        _snake.food = _snakeRandFood(_snake.cells);
        const scoreEl = document.getElementById('snake-score');
        if (scoreEl) scoreEl.textContent = _snake.score;
    } else {
        _snake.cells.pop();
    }
    _snakeDraw(ctx);
}

window._snakeDir = function(dir) {
    if (!_snake || _snake.over) return;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposite[dir] === _snake.dir) return;
    _snake.nextDir = dir;
};

window._renderSnake = function(wrap) {
    wrap.innerHTML = `
    <div class="game-wrap-inner">
        <div class="game-header">
            <div class="game-title">🐍 Змейка</div>
            <div class="game-balance">Очки: <b id="snake-score">0</b></div>
        </div>
        <div class="game-desc">Стрелки на клавиатуре или кнопки ниже — собирай еду, не врежься в себя.</div>
        <div class="snake-canvas-wrap">
            <canvas id="snake-canvas" width="${SNAKE_COLS * SNAKE_CELL}" height="${SNAKE_ROWS * SNAKE_CELL}"></canvas>
        </div>
        <div class="snake-controls">
            <button class="snake-dpad-btn" onclick="_snakeDir('up')">⬆️</button>
            <div class="snake-dpad-row">
                <button class="snake-dpad-btn" onclick="_snakeDir('left')">⬅️</button>
                <button class="snake-dpad-btn" onclick="_snakeDir('down')">⬇️</button>
                <button class="snake-dpad-btn" onclick="_snakeDir('right')">➡️</button>
            </div>
        </div>
        <div id="game-result"></div>
    </div>`;

    _snakeStop();
    const startCells = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }];
    const canvas = document.getElementById('snake-canvas');
    _snake = {
        cells: startCells, dir: 'right', nextDir: 'right',
        food: _snakeRandFood(startCells), score: 0, over: false, canvas
    };
    const ctx = canvas.getContext('2d');
    document.addEventListener('keydown', _snakeKeyHandler);
    _snake.interval = setInterval(() => _snakeTick(ctx), 140);
    _snakeDraw(ctx);
};

// ───────────────────────── Memory (карточки на память) ─────────────────────────
const MEMORY_ICONS = ['🎮', '🎧', '🎬', '🎨', '🏆', '⭐', '🚀', '🎯'];
let _memory = null;

window._renderMemory = function(wrap) {
    const deck = [...MEMORY_ICONS, ...MEMORY_ICONS]
        .map(icon => ({ icon }))
        .sort(() => Math.random() - 0.5);
    _memory = { cards: deck, flipped: [], matched: [], moves: 0, busy: false };
    wrap.innerHTML = `
    <div class="game-wrap-inner">
        <div class="game-header">
            <div class="game-title">🧠 Memory</div>
            <div class="game-balance">Ходы: <b id="memory-moves">0</b></div>
        </div>
        <div class="game-desc">Найди все пары одинаковых карточек. Просто для веселья.</div>
        <div class="memory-grid">
            ${deck.map((_, i) => `<button class="memory-card" id="memory-c${i}" onclick="flipMemory(${i})">❓</button>`).join('')}
        </div>
        <div id="game-result"></div>
        <div class="game-actions">
            <button class="btn btn-outline btn-sm" onclick="_renderMemory(document.getElementById('game-wrap'))">🔄 Новая игра</button>
        </div>
    </div>`;
};

window.flipMemory = function(i) {
    if (!_memory || _memory.busy) return;
    if (_memory.matched.includes(i) || _memory.flipped.includes(i)) return;
    const cardEl = document.getElementById('memory-c' + i);
    cardEl.textContent = _memory.cards[i].icon;
    cardEl.classList.add('memory-card--flipped');
    _memory.flipped.push(i);
    if (_memory.flipped.length < 2) return;

    _memory.moves++;
    const movesEl = document.getElementById('memory-moves');
    if (movesEl) movesEl.textContent = _memory.moves;

    const [a, b] = _memory.flipped;
    if (_memory.cards[a].icon === _memory.cards[b].icon) {
        _memory.matched.push(a, b);
        document.getElementById('memory-c' + a).classList.add('memory-card--matched');
        document.getElementById('memory-c' + b).classList.add('memory-card--matched');
        _memory.flipped = [];
        if (_memory.matched.length === _memory.cards.length) {
            const resEl = document.getElementById('game-result');
            if (resEl) resEl.innerHTML = `<span style="color:var(--teal)">🎉 Готово! Ходов: ${_memory.moves}</span>`;
        }
    } else {
        _memory.busy = true;
        setTimeout(() => {
            [a, b].forEach(idx => {
                const el = document.getElementById('memory-c' + idx);
                if (el) { el.textContent = '❓'; el.classList.remove('memory-card--flipped'); }
            });
            _memory.flipped = [];
            _memory.busy = false;
        }, 700);
    }
};
