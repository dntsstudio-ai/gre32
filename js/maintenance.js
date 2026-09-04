// ============================================================
//  js/maintenance.js — Система технических работ
//  Читает конфиг из Firebase Firestore: settings/maintenance
//  Включение/выключение — через Firebase Console или GitHub raw
// ============================================================

let _checkInterval = null;
let _db = null;

// ── Загрузить конфиг из Firestore ──
function _withTimeout(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
}

async function fetchMaintenanceConfig() {
    if (!_db) return null;
    try {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
        const snap = await _withTimeout(getDoc(doc(_db, 'settings', 'maintenance')), 5000, null);
        if (snap && snap.exists()) return snap.data();
        return null;
    } catch(e) {
        console.warn('[Maintenance] Ошибка чтения конфига:', e);
        return null;
    }
}

// ── Проверить доступ ──
function userHasAccess(config, userRole) {
    if (!config || !config.enabled) return true;
    if (!userRole) return false;
    const allowed = config.allowed_roles || ['admin', 'proxyadmin', 'developer'];
    return allowed.includes(userRole);
}

// ── Форматировать оставшееся время ──
function getRemainingSeconds(config) {
    if (!config) return 0;
    if (config.ends_at) {
        const endMs = config.ends_at.toMillis ? config.ends_at.toMillis() : new Date(config.ends_at).getTime();
        return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    }
    if (config.duration) return config.duration * 60;
    return 0;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── Показать страницу-заглушку ──
function showMaintenancePage(config) {
    if (document.getElementById('maintenance-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'maintenance-overlay';

    let remainingSec = getRemainingSeconds(config);
    const hasTimer = remainingSec > 0 && config.ends_at;

    overlay.innerHTML = `
    <canvas id="maint-canvas"></canvas>

    <button class="maint-login-btn" id="maint-login-btn" title="Войти для команды">
        <i class="fas fa-user"></i>
    </button>

    <div class="maint-content">
        <div class="maint-logo">
            <img src="img/logo.jpg" alt="VAT" onerror="this.parentElement.innerHTML='<span style=\'font-size:2.5rem\'>🎙️</span>'">
        </div>
        <div class="maint-badge">
            <i class="fas fa-tools"></i>
            <span>Технические работы</span>
        </div>
        <h1 class="maint-title">${config.title || 'Сайт на техническом обслуживании'}</h1>
        <p class="maint-message">${config.message || 'Мы обновляем сайт и скоро вернёмся. Спасибо за терпение!'}</p>

        <div class="maint-timer-wrap">
            <div class="maint-timer-label">${hasTimer ? 'Вернёмся через' : 'Работы ведутся'}</div>
            <div class="maint-timer ${hasTimer ? '' : 'maint-timer--pulse'}" id="maint-timer">
                ${hasTimer ? formatTime(remainingSec) : '⚙️'}
            </div>
        </div>

        <div class="maint-socials">
            <a href="https://t.me/VoiceActingTeam1" target="_blank" class="maint-social-btn" title="Telegram">
                <i class="fab fa-telegram-plane"></i>
            </a>
            <a href="https://vk.com/voiceactingteam1" target="_blank" class="maint-social-btn" title="ВКонтакте">
                <i class="fab fa-vk"></i>
            </a>
            <a href="https://youtube.com/@voiceactingteam1" target="_blank" class="maint-social-btn" title="YouTube">
                <i class="fab fa-youtube"></i>
            </a>
        </div>
        <p class="maint-footer-text">© Voice Acting Team · Следите за обновлениями в соцсетях</p>
    </div>

    <!-- Модальное окно входа для команды -->
    <div class="maint-modal-overlay" id="maint-modal-overlay">
        <div class="maint-modal">
            <button class="maint-modal-close" id="maint-modal-close">
                <i class="fas fa-times"></i>
            </button>
            <div class="maint-modal-logo">
                <img src="img/logo.jpg" alt="VAT" onerror="this.parentElement.innerHTML='🎙️'">
            </div>
            <h2 class="maint-modal-title">Вход для команды</h2>
            <p class="maint-modal-sub">Авторизуйтесь чтобы продолжить</p>
            <div id="maint-auth-error" class="maint-auth-error" style="display:none;"></div>
            <form onsubmit="return false;">
                <label class="maint-label">Email</label>
                <input type="email" id="maint-email" class="maint-input" placeholder="mail@example.com" autocomplete="username">
                <label class="maint-label">Пароль</label>
                <input type="password" id="maint-pass" class="maint-input" placeholder="Пароль" autocomplete="current-password">
                <button class="maint-submit-btn" id="maint-submit-btn" type="button">
                    <i class="fas fa-sign-in-alt"></i> Войти
                </button>
            </form>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    initMaintenanceCanvas();

    // Таймер обратного отсчёта
    if (hasTimer) {
        const timerEl = document.getElementById('maint-timer');
        const interval = setInterval(() => {
            remainingSec = getRemainingSeconds(config);
            if (timerEl) timerEl.textContent = formatTime(remainingSec);
            if (remainingSec <= 0) {
                clearInterval(interval);
                if (timerEl) timerEl.textContent = '00:00:00';
            }
        }, 1000);
    }

    // Кнопка логина
    const loginBtn   = document.getElementById('maint-login-btn');
    const modalOv    = document.getElementById('maint-modal-overlay');
    const closeBtn   = document.getElementById('maint-modal-close');
    const submitBtn  = document.getElementById('maint-submit-btn');
    const passInput  = document.getElementById('maint-pass');

    loginBtn?.addEventListener('click', () => {
        modalOv.classList.add('active');
        setTimeout(() => document.getElementById('maint-email')?.focus(), 150);
    });
    closeBtn?.addEventListener('click', () => modalOv.classList.remove('active'));
    modalOv?.addEventListener('click', e => { if (e.target === modalOv) modalOv.classList.remove('active'); });
    submitBtn?.addEventListener('click', () => handleMaintenanceLogin(config));
    passInput?.addEventListener('keydown', e => { if (e.key === 'Enter') handleMaintenanceLogin(config); });

    // Плавное появление
    requestAnimationFrame(() => overlay.classList.add('maint-visible'));
}

// ── Скрыть страницу-заглушку ──
function hideMaintenancePage() {
    const overlay = document.getElementById('maintenance-overlay');
    if (!overlay) return;
    overlay.classList.remove('maint-visible');
    setTimeout(() => overlay.remove(), 500);
}

// ── Вход через Firebase Auth ──
async function handleMaintenanceLogin(config) {
    const emailEl = document.getElementById('maint-email');
    const passEl  = document.getElementById('maint-pass');
    const btnEl   = document.getElementById('maint-submit-btn');
    const errEl   = document.getElementById('maint-auth-error');

    const email = emailEl?.value.trim();
    const pass  = passEl?.value;
    if (!email || !pass) { showMaintError('Введите email и пароль'); return; }

    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
    errEl.style.display = 'none';

    try {
        const { getAuth, signInWithEmailAndPassword } =
            await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js');
        const { getFirestore, doc, getDoc } =
            await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

        const auth = getAuth();
        const db   = getFirestore();

        const cred = await signInWithEmailAndPassword(auth, email, pass);
        const snap = await getDoc(doc(db, 'users', cred.user.uid));

        if (!snap.exists()) {
            showMaintError('Пользователь не найден в базе данных');
            await auth.signOut();
            return;
        }

        const role    = snap.data().role || 'user';
        const allowed = config.allowed_roles || ['admin', 'proxyadmin', 'developer'];

        if (!allowed.includes(role)) {
            showMaintError('Ваша роль не имеет доступа во время техработ');
            await auth.signOut();
            return;
        }

        // Успех — убираем заглушку и перезагружаем
        hideMaintenancePage();
        setTimeout(() => location.reload(), 400);

    } catch(e) {
        const msgs = {
            'auth/invalid-credential': 'Неверный email или пароль',
            'auth/wrong-password':     'Неверный пароль',
            'auth/user-not-found':     'Пользователь не найден',
            'auth/too-many-requests':  'Слишком много попыток. Подождите.',
            'auth/invalid-email':      'Неверный формат email',
        };
        showMaintError(msgs[e.code] || 'Ошибка: ' + e.message);
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
        }
    }
}

function showMaintError(msg) {
    const el = document.getElementById('maint-auth-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

// ── Анимированный фон ──
function initMaintenanceCanvas() {
    const canvas = document.getElementById('maint-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    const resize = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    const stars = Array.from({length: 160}, () => ({
        x: Math.random()*W, y: Math.random()*H,
        r: Math.random()*1.4+0.2,
        a: Math.random(), da: (Math.random()-0.5)*0.007,
        speed: Math.random()*0.07+0.02
    }));
    const orbs = [
        {x:0.2, y:0.3, r:260, col:'124,58,237', alpha:0.07, t:0},
        {x:0.8, y:0.7, r:300, col:'20,184,166', alpha:0.05, t:2},
    ];
    let t = 0, running = true;

    function animate() {
        if (!running || !document.getElementById('maint-canvas')) return;
        ctx.clearRect(0,0,W,H); t += 0.003;
        orbs.forEach(o => {
            const ox = (o.x + Math.sin(t*0.4+o.t)*0.05)*W;
            const oy = (o.y + Math.cos(t*0.3+o.t)*0.04)*H;
            const g = ctx.createRadialGradient(ox,oy,0,ox,oy,o.r);
            g.addColorStop(0, `rgba(${o.col},${o.alpha})`);
            g.addColorStop(1, 'transparent');
            ctx.beginPath(); ctx.arc(ox,oy,o.r,0,Math.PI*2);
            ctx.fillStyle = g; ctx.fill();
        });
        stars.forEach(s => {
            s.a += s.da;
            if (s.a <= 0.05 || s.a >= 1) s.da *= -1;
            s.y += s.speed;
            if (s.y > H) { s.y = 0; s.x = Math.random()*W; }
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
            ctx.fillStyle = `rgba(220,210,255,${s.a})`; ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();

    new MutationObserver(() => {
        if (!document.getElementById('maintenance-overlay')) { running = false; }
    }).observe(document.body, {childList: true});
}

// ── Инжектировать стили ──
export function injectMaintenanceStyles() {
    if (document.getElementById('maint-styles')) return;
    const style = document.createElement('style');
    style.id = 'maint-styles';
    style.textContent = `
    #maintenance-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: #07041a;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.5s ease;
        overflow: hidden;
        font-family: 'Exo 2', sans-serif;
    }
    #maintenance-overlay.maint-visible { opacity: 1; }

    #maint-canvas {
        position: absolute; inset: 0;
        pointer-events: none; z-index: 0;
    }

    /* Кнопка входа — правый верхний угол */
    .maint-login-btn {
        position: absolute; top: 20px; right: 20px; z-index: 10;
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(124,58,237,0.15);
        border: 1px solid rgba(124,58,237,0.4);
        color: rgba(167,139,250,0.85);
        font-size: 18px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.25s; backdrop-filter: blur(10px);
    }
    .maint-login-btn:hover {
        background: rgba(124,58,237,0.35);
        color: #fff; transform: scale(1.1);
        box-shadow: 0 0 20px rgba(124,58,237,0.5);
    }

    /* Основной блок */
    .maint-content {
        position: relative; z-index: 2;
        display: flex; flex-direction: column;
        align-items: center; text-align: center;
        padding: 40px 24px; max-width: 620px; width: 100%;
        animation: maintUp 0.7s cubic-bezier(0.4,0,0.2,1) 0.15s both;
    }
    @keyframes maintUp {
        from { opacity:0; transform:translateY(24px); }
        to   { opacity:1; transform:translateY(0); }
    }

    .maint-logo {
        width: 80px; height: 80px; border-radius: 20px;
        overflow: hidden; margin-bottom: 22px;
        border: 2px solid rgba(124,58,237,0.45);
        box-shadow: 0 0 36px rgba(124,58,237,0.3);
        background: rgba(124,58,237,0.1);
        display: flex; align-items: center; justify-content: center;
    }
    .maint-logo img { width:100%; height:100%; object-fit:cover; }

    .maint-badge {
        display: inline-flex; align-items: center; gap: 8px;
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.4);
        border-radius: 20px; padding: 6px 18px;
        font-size: 11px; font-weight: 800; letter-spacing: 2px;
        text-transform: uppercase; color: #fca5a5;
        margin-bottom: 20px;
        animation: badgePulse 2.5s ease infinite;
    }
    @keyframes badgePulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
        50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    }

    .maint-title {
        font-family: 'Cinzel', Georgia, serif;
        font-size: clamp(1.5rem, 4vw, 2.4rem);
        font-weight: 700; margin-bottom: 14px;
        background: linear-gradient(135deg, #c4b5fd, #5eead4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .maint-message {
        color: rgba(136,120,195,0.9);
        font-size: 15px; line-height: 1.7;
        margin-bottom: 36px; max-width: 460px;
        font-style: italic;
    }

    /* ТАЙМЕР — большой, по центру */
    .maint-timer-wrap {
        display: flex; flex-direction: column;
        align-items: center; gap: 10px;
        margin-bottom: 40px;
    }
    .maint-timer-label {
        font-size: 11px; font-weight: 700; letter-spacing: 3px;
        text-transform: uppercase; color: rgba(94,234,212,0.75);
    }
    .maint-timer {
        font-family: 'Cinzel', Georgia, serif;
        font-size: clamp(3.2rem, 11vw, 6rem);
        font-weight: 900; letter-spacing: 6px;
        background: linear-gradient(135deg, #a78bfa, #5eead4, #a78bfa);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: timerGrad 3s linear infinite;
        filter: drop-shadow(0 0 28px rgba(124,58,237,0.5));
        line-height: 1.1;
    }
    @keyframes timerGrad {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
    }
    .maint-timer--pulse {
        font-size: 4rem;
        animation: timerGrad 3s linear infinite, gearSpin 2s ease infinite;
    }
    @keyframes gearSpin {
        0%,100% { transform: rotate(0deg); }
        50%      { transform: rotate(30deg); }
    }

    /* Соцсети */
    .maint-socials { display: flex; gap: 12px; margin-bottom: 24px; }
    .maint-social-btn {
        width: 44px; height: 44px; border-radius: 12px;
        background: rgba(124,58,237,0.1);
        border: 1px solid rgba(124,58,237,0.25);
        color: rgba(167,139,250,0.75);
        font-size: 17px; text-decoration: none;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.25s;
    }
    .maint-social-btn:hover {
        background: linear-gradient(135deg, rgba(124,58,237,0.4), rgba(20,184,166,0.3));
        color: #fff; transform: translateY(-3px);
        box-shadow: 0 8px 20px rgba(124,58,237,0.3);
    }
    .maint-footer-text {
        font-size: 11px; color: rgba(74,61,122,0.8); letter-spacing: 1px;
    }

    /* Модальное окно входа */
    .maint-modal-overlay {
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0,0,0,0.88);
        backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s;
    }
    .maint-modal-overlay.active { opacity: 1; pointer-events: auto; }

    .maint-modal {
        background: #0f0b2a;
        border: 1px solid rgba(124,58,237,0.3);
        border-radius: 24px; padding: 40px 36px;
        width: 100%; max-width: 400px; position: relative;
        box-shadow: 0 24px 80px rgba(0,0,0,0.8);
        transform: scale(0.95);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
    }
    .maint-modal-overlay.active .maint-modal { transform: scale(1); }

    .maint-modal-close {
        position: absolute; top: 16px; right: 16px;
        width: 34px; height: 34px; border-radius: 10px;
        background: rgba(124,58,237,0.1);
        border: 1px solid rgba(124,58,237,0.2);
        color: rgba(167,139,250,0.7); cursor: pointer; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
    }
    .maint-modal-close:hover { background: rgba(239,68,68,0.2); color: #ef4444; }

    .maint-modal-logo {
        width: 60px; height: 60px; border-radius: 15px; overflow: hidden;
        margin: 0 auto 18px; border: 2px solid rgba(124,58,237,0.35);
        background: rgba(124,58,237,0.1);
        display: flex; align-items: center; justify-content: center; font-size: 1.8rem;
    }
    .maint-modal-logo img { width:100%; height:100%; object-fit:cover; }

    .maint-modal-title {
        text-align: center; font-family: 'Cinzel', Georgia, serif;
        font-size: 1.35rem; font-weight: 700; margin-bottom: 5px;
        background: linear-gradient(135deg, #c4b5fd, #5eead4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent; background-clip: text;
    }
    .maint-modal-sub {
        text-align: center; color: rgba(136,120,195,0.8);
        font-size: 13px; margin-bottom: 26px; font-style: italic;
    }

    .maint-label {
        display: block; font-size: 10px; font-weight: 700;
        color: rgba(136,120,195,0.75); text-transform: uppercase;
        letter-spacing: 1.5px; margin-bottom: 6px;
    }
    .maint-input {
        width: 100%; padding: 12px 16px;
        background: rgba(10,7,32,0.85);
        border: 1px solid rgba(124,58,237,0.25);
        border-radius: 12px; color: #f0eeff;
        font-size: 14px; font-family: 'Exo 2', sans-serif;
        margin-bottom: 14px; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
    }
    .maint-input:focus {
        border-color: rgba(20,184,166,0.6);
        box-shadow: 0 0 0 3px rgba(20,184,166,0.1);
    }
    .maint-input::placeholder { color: rgba(74,61,122,0.8); }

    .maint-submit-btn {
        width: 100%; padding: 14px;
        background: linear-gradient(135deg, #7c3aed, #14b8a6);
        border: none; border-radius: 12px;
        color: #fff; font-size: 12px; font-weight: 700;
        cursor: pointer; transition: all 0.25s;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        text-transform: uppercase; letter-spacing: 1px;
        font-family: 'Exo 2', sans-serif; margin-top: 4px;
    }
    .maint-submit-btn:hover:not(:disabled) {
        filter: brightness(1.15); transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(124,58,237,0.4);
    }
    .maint-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .maint-auth-error {
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
        border-radius: 10px; padding: 10px 14px; color: #fca5a5;
        font-size: 12px; margin-bottom: 14px; line-height: 1.4;
    }

    @media (max-width: 480px) {
        .maint-modal {
            position: fixed; bottom: 0; left: 0; right: 0;
            border-radius: 20px 20px 0 0; max-width: none; padding: 28px 20px;
        }
        .maint-modal-overlay { align-items: flex-end; }
        .maint-timer { font-size: clamp(2.5rem, 13vw, 4rem); }
    }
    `;
    document.head.appendChild(style);
}

// ── Главная точка входа ──
export async function checkMaintenance(db, userRole) {
    _db = db;
    const config = await fetchMaintenanceConfig();
    if (!config || !config.enabled) return false;
    if (userHasAccess(config, userRole)) return false;
    showMaintenancePage(config);
    return true;
}

// ── Периодическая проверка каждые 60 сек ──
export function startMaintenancePolling(db, getUserRole) {
    _db = db;
    if (_checkInterval) clearInterval(_checkInterval);
    _checkInterval = setInterval(async () => {
        const config = await fetchMaintenanceConfig();
        const role   = getUserRole();
        const overlay = document.getElementById('maintenance-overlay');
        if (config && config.enabled && !userHasAccess(config, role)) {
            if (!overlay) showMaintenancePage(config);
        } else {
            if (overlay) hideMaintenancePage();
        }
    }, 60000);
}
