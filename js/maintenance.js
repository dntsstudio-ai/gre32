// ============================================================
//  js/maintenance.js — Система технических работ
//  Читает maintenance.json из GitHub raw URL
//  Роли proxyadmin и developer — полный доступ
// ============================================================

import { MAINTENANCE_CONFIG_URL } from '../main/config.js';

let _maintenanceConfig = null;
let _checkInterval = null;

// ── Загрузить конфиг из GitHub raw ──
async function fetchMaintenanceConfig() {
    try {
        // cache-bust чтобы не получать кэш
        const url = MAINTENANCE_CONFIG_URL + '?t=' + Date.now();
        const resp = await fetch(url);
        if (!resp.ok) return null;
        return await resp.json();
    } catch(e) {
        console.warn('[Maintenance] Не удалось загрузить конфиг:', e);
        return null;
    }
}

// ── Проверить, имеет ли пользователь доступ в режиме техработ ──
function userHasAccess(config, userRole) {
    if (!config || !config.enabled) return true;
    if (!userRole) return false;
    const allowed = config.allowed_roles || ['admin', 'proxyadmin', 'developer'];
    return allowed.includes(userRole);
}

// ── Посчитать оставшееся время ──
function getRemainingSeconds(config) {
    if (!config) return 0;
    if (config.ends_at) {
        const end = new Date(config.ends_at).getTime();
        const now = Date.now();
        return Math.max(0, Math.floor((end - now) / 1000));
    }
    if (config.duration) {
        // duration в минутах — если нет ends_at, показываем просто duration
        return config.duration * 60;
    }
    return 0;
}

// ── Форматировать секунды в HH:MM:SS ──
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── Создать и показать страницу техработ ──
function showMaintenancePage(config) {
    // Убедимся что её нет
    const existing = document.getElementById('maintenance-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'maintenance-overlay';

    let remainingSec = getRemainingSeconds(config);
    const hasTimer = remainingSec > 0;

    overlay.innerHTML = `
    <canvas id="maint-canvas"></canvas>

    <!-- Кнопка входа в углу -->
    <button class="maint-login-btn" id="maint-login-btn" title="Войти">
        <i class="fas fa-user"></i>
    </button>

    <div class="maint-content">
        <div class="maint-logo">
            <img src="img/logo.jpg" alt="VAT" onerror="this.parentElement.innerHTML='<span style=\'font-size:3rem\'>🎙️</span>'">
        </div>
        <div class="maint-badge">
            <i class="fas fa-tools"></i>
            <span>Технические работы</span>
        </div>
        <h1 class="maint-title">${config.title || 'Сайт на техническом обслуживании'}</h1>
        <p class="maint-message">${config.message || 'Мы обновляем сайт и скоро вернёмся. Спасибо за терпение!'}</p>

        ${hasTimer ? `
        <div class="maint-timer-wrap">
            <div class="maint-timer-label">Вернёмся через</div>
            <div class="maint-timer" id="maint-timer">${formatTime(remainingSec)}</div>
        </div>` : `
        <div class="maint-timer-wrap">
            <div class="maint-timer-label">Работы ведутся</div>
            <div class="maint-timer maint-timer--pulse" id="maint-timer">⚙️</div>
        </div>`}

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

        <p class="maint-footer-text">© Voice Acting Team · Следите за обновлениями в наших соцсетях</p>
    </div>

    <!-- Модальное окно входа -->
    <div class="maint-modal-overlay" id="maint-modal-overlay">
        <div class="maint-modal" id="maint-modal">
            <button class="maint-modal-close" id="maint-modal-close">
                <i class="fas fa-times"></i>
            </button>
            <div class="maint-modal-logo">
                <img src="img/logo.jpg" alt="VAT" onerror="this.parentElement.innerHTML='🎙️'">
            </div>
            <h2 class="maint-modal-title">Вход для команды</h2>
            <p class="maint-modal-sub">Введите данные аккаунта</p>
            <div id="maint-auth-error" class="maint-auth-error" style="display:none;"></div>
            <form onsubmit="return false;" autocomplete="off">
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

    // Запускаем фоновую анимацию
    initMaintenanceCanvas();

    // Таймер обратного отсчёта
    if (hasTimer && config.ends_at) {
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

    // Кнопка открытия модала
    const loginBtn = document.getElementById('maint-login-btn');
    const modalOverlay = document.getElementById('maint-modal-overlay');
    const closeBtn = document.getElementById('maint-modal-close');

    loginBtn?.addEventListener('click', () => {
        modalOverlay.classList.add('active');
        setTimeout(() => document.getElementById('maint-email')?.focus(), 200);
    });
    closeBtn?.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
    });
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });

    // Вход
    const submitBtn = document.getElementById('maint-submit-btn');
    submitBtn?.addEventListener('click', () => handleMaintenanceLogin(config));

    // Enter для входа
    document.getElementById('maint-pass')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleMaintenanceLogin(config);
    });

    // Анимация появления
    requestAnimationFrame(() => overlay.classList.add('maint-visible'));
}

// ── Скрыть страницу техработ ──
function hideMaintenancePage() {
    const overlay = document.getElementById('maintenance-overlay');
    if (!overlay) return;
    overlay.classList.remove('maint-visible');
    setTimeout(() => overlay.remove(), 600);
}

// ── Обработка входа на странице техработ ──
async function handleMaintenanceLogin(config) {
    const emailEl = document.getElementById('maint-email');
    const passEl  = document.getElementById('maint-pass');
    const errEl   = document.getElementById('maint-auth-error');
    const btnEl   = document.getElementById('maint-submit-btn');

    const email = emailEl?.value.trim();
    const pass  = passEl?.value;
    if (!email || !pass) {
        showMaintenanceError('Введите email и пароль');
        return;
    }

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
            showMaintenanceError('Пользователь не найден в базе данных');
            await auth.signOut();
            return;
        }

        const userData = snap.data();
        const userRole = userData.role || 'user';
        const allowed  = config.allowed_roles || ['admin','proxyadmin','developer'];

        if (!allowed.includes(userRole)) {
            showMaintenanceError('У вашей роли нет доступа во время техработ');
            await auth.signOut();
            return;
        }

        // Доступ разрешён — убираем заглушку
        hideMaintenancePage();
        // Перезагружаем страницу чтобы инициализировать всё приложение
        setTimeout(() => location.reload(), 400);

    } catch(e) {
        const msgs = {
            'auth/invalid-credential': 'Неверный email или пароль',
            'auth/wrong-password':     'Неверный пароль',
            'auth/user-not-found':     'Пользователь не найден',
            'auth/too-many-requests':  'Слишком много попыток. Подождите.',
            'auth/invalid-email':      'Неверный формат email',
        };
        showMaintenanceError(msgs[e.code] || 'Ошибка входа: ' + e.message);
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
        }
    }
}

function showMaintenanceError(msg) {
    const errEl = document.getElementById('maint-auth-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = 'block';
}

// ── Фоновая анимация звёзд на canvas ──
function initMaintenanceCanvas() {
    const canvas = document.getElementById('maint-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();
    const stars = [];
    for (let i = 0; i < 180; i++) {
        stars.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*1.4+0.2, a: Math.random(), da: (Math.random()-0.5)*0.008, speed: Math.random()*0.08+0.02 });
    }
    const orbs = [
        { x:0.2, y:0.3, r:280, col:[124,58,237], t:0, alpha:0.07 },
        { x:0.8, y:0.7, r:320, col:[20,184,166], t:2, alpha:0.05 },
    ];
    let t = 0;
    let animRunning = true;
    function animate() {
        if (!animRunning || !document.getElementById('maint-canvas')) return;
        ctx.clearRect(0,0,W,H);
        t += 0.003;
        orbs.forEach(o => {
            const ox=(o.x+Math.sin(t*0.4+o.t)*0.05)*W, oy=(o.y+Math.cos(t*0.3+o.t)*0.04)*H;
            const g = ctx.createRadialGradient(ox,oy,0,ox,oy,o.r);
            g.addColorStop(0,'rgba('+o.col+','+o.alpha+')'); g.addColorStop(1,'transparent');
            ctx.beginPath(); ctx.arc(ox,oy,o.r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
        });
        stars.forEach(s => {
            s.a+=s.da; if(s.a<=0.05||s.a>=1) s.da*=-1;
            s.y+=s.speed; if(s.y>H){s.y=0;s.x=Math.random()*W;}
            ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
            ctx.fillStyle='rgba(220,210,255,'+s.a+')'; ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();
    // Останавливаем когда оверлей удалён
    const observer = new MutationObserver(() => {
        if (!document.getElementById('maintenance-overlay')) { animRunning = false; observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true });
}

// ── Главная функция проверки ──
export async function checkMaintenance(userRole) {
    const config = await fetchMaintenanceConfig();
    _maintenanceConfig = config;

    if (!config || !config.enabled) return false;

    // Пользователь имеет доступ — не показываем заглушку
    if (userHasAccess(config, userRole)) return false;

    // Показываем заглушку
    showMaintenancePage(config);
    return true;
}

// ── Периодическая проверка (каждые 60 сек) ──
export function startMaintenancePolling(getUserRole) {
    if (_checkInterval) clearInterval(_checkInterval);
    _checkInterval = setInterval(async () => {
        const config = await fetchMaintenanceConfig();
        _maintenanceConfig = config;
        const role = getUserRole();
        const overlay = document.getElementById('maintenance-overlay');
        if (config && config.enabled && !userHasAccess(config, role)) {
            if (!overlay) showMaintenancePage(config);
        } else {
            if (overlay) hideMaintenancePage();
        }
    }, 60000);
}

// ── CSS стили для страницы техработ ──
export function injectMaintenanceStyles() {
    if (document.getElementById('maint-styles')) return;
    const style = document.createElement('style');
    style.id = 'maint-styles';
    style.textContent = `
    #maintenance-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: #07041a;
        display: flex; align-items: center; justify-content: center;
        flex-direction: column;
        opacity: 0; transition: opacity 0.6s ease;
        overflow: hidden;
    }
    #maintenance-overlay.maint-visible { opacity: 1; }

    #maint-canvas {
        position: absolute; inset: 0;
        pointer-events: none; z-index: 0;
    }

    /* ── Кнопка входа в углу ── */
    .maint-login-btn {
        position: absolute; top: 20px; right: 20px; z-index: 10;
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(124,58,237,0.15);
        border: 1px solid rgba(124,58,237,0.4);
        color: rgba(167,139,250,0.8);
        font-size: 18px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.25s;
        backdrop-filter: blur(10px);
    }
    .maint-login-btn:hover {
        background: rgba(124,58,237,0.35);
        border-color: rgba(124,58,237,0.7);
        color: #fff;
        transform: scale(1.1);
        box-shadow: 0 0 24px rgba(124,58,237,0.4);
    }

    /* ── Основной контент ── */
    .maint-content {
        position: relative; z-index: 2;
        display: flex; flex-direction: column;
        align-items: center; text-align: center;
        padding: 40px 24px;
        max-width: 640px; width: 100%;
        animation: maintFadeUp 0.8s cubic-bezier(0.4,0,0.2,1) 0.2s both;
    }
    @keyframes maintFadeUp {
        from { opacity:0; transform:translateY(30px); }
        to   { opacity:1; transform:translateY(0); }
    }

    .maint-logo {
        width: 80px; height: 80px; border-radius: 20px;
        overflow: hidden; margin-bottom: 24px;
        border: 2px solid rgba(124,58,237,0.4);
        box-shadow: 0 0 40px rgba(124,58,237,0.3);
        background: rgba(124,58,237,0.1);
        display: flex; align-items: center; justify-content: center;
    }
    .maint-logo img { width: 100%; height: 100%; object-fit: cover; }

    .maint-badge {
        display: inline-flex; align-items: center; gap: 8px;
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.35);
        border-radius: 20px; padding: 6px 18px;
        font-size: 11px; font-weight: 800;
        color: #fca5a5; letter-spacing: 2px; text-transform: uppercase;
        font-family: 'Exo 2', sans-serif;
        margin-bottom: 20px;
        animation: badgePulse 2s ease infinite;
    }
    @keyframes badgePulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
        50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    }

    .maint-title {
        font-family: 'Cinzel', Georgia, serif;
        font-size: clamp(1.6rem, 4vw, 2.6rem);
        font-weight: 700; margin-bottom: 16px;
        background: linear-gradient(135deg, #c4b5fd, #5eead4);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text; line-height: 1.2;
    }

    .maint-message {
        color: rgba(136,120,195,0.9);
        font-size: 15px; line-height: 1.7;
        margin-bottom: 40px; max-width: 480px;
        font-style: italic;
        font-family: 'Exo 2', sans-serif;
    }

    /* ── Таймер ── */
    .maint-timer-wrap {
        margin-bottom: 44px;
        display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .maint-timer-label {
        font-size: 11px; font-weight: 700; letter-spacing: 3px;
        text-transform: uppercase; color: rgba(94,234,212,0.7);
        font-family: 'Exo 2', sans-serif;
    }
    .maint-timer {
        font-family: 'Cinzel', Georgia, serif;
        font-size: clamp(3rem, 10vw, 5.5rem);
        font-weight: 900; letter-spacing: 4px;
        background: linear-gradient(135deg, #a78bfa, #5eead4, #a78bfa);
        background-size: 200% auto;
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: timerGradient 3s linear infinite;
        text-shadow: none;
        filter: drop-shadow(0 0 30px rgba(124,58,237,0.5));
        line-height: 1.1;
    }
    @keyframes timerGradient {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
    }
    .maint-timer--pulse {
        font-size: 4rem;
        animation: timerGradient 3s linear infinite, emojiBounce 1.5s ease infinite;
    }
    @keyframes emojiBounce {
        0%,100% { transform: translateY(0) rotate(0); }
        50%      { transform: translateY(-10px) rotate(180deg); }
    }

    /* ── Соцсети ── */
    .maint-socials {
        display: flex; gap: 12px; margin-bottom: 28px;
    }
    .maint-social-btn {
        width: 44px; height: 44px; border-radius: 12px;
        background: rgba(124,58,237,0.1);
        border: 1px solid rgba(124,58,237,0.25);
        color: rgba(167,139,250,0.7);
        font-size: 17px; text-decoration: none;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.25s;
    }
    .maint-social-btn:hover {
        background: linear-gradient(135deg, rgba(124,58,237,0.4), rgba(20,184,166,0.3));
        border-color: rgba(20,184,166,0.5); color: #fff;
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(124,58,237,0.3);
    }

    .maint-footer-text {
        font-size: 11px; color: rgba(74,61,122,0.8);
        letter-spacing: 1px; font-family: 'Exo 2', sans-serif;
    }

    /* ── Модальное окно входа ── */
    .maint-modal-overlay {
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s ease;
    }
    .maint-modal-overlay.active {
        opacity: 1; pointer-events: auto;
    }
    .maint-modal {
        background: #0f0b2a;
        border: 1px solid rgba(124,58,237,0.3);
        border-radius: 24px;
        padding: 40px 36px;
        width: 100%; max-width: 400px;
        position: relative;
        box-shadow: 0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.1);
        animation: none;
        transform: scale(0.95);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
    }
    .maint-modal-overlay.active .maint-modal {
        transform: scale(1);
    }

    .maint-modal-close {
        position: absolute; top: 16px; right: 16px;
        width: 34px; height: 34px; border-radius: 10px;
        background: rgba(124,58,237,0.1);
        border: 1px solid rgba(124,58,237,0.2);
        color: rgba(167,139,250,0.7); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; transition: all 0.2s;
    }
    .maint-modal-close:hover { background: rgba(239,68,68,0.2); color: #ef4444; border-color: rgba(239,68,68,0.3); }

    .maint-modal-logo {
        width: 60px; height: 60px; border-radius: 15px;
        overflow: hidden; margin: 0 auto 20px;
        border: 2px solid rgba(124,58,237,0.35);
        box-shadow: 0 0 24px rgba(124,58,237,0.2);
        background: rgba(124,58,237,0.1);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.8rem;
    }
    .maint-modal-logo img { width: 100%; height: 100%; object-fit: cover; }

    .maint-modal-title {
        text-align: center;
        font-family: 'Cinzel', Georgia, serif;
        font-size: 1.4rem; font-weight: 700; margin-bottom: 6px;
        background: linear-gradient(135deg, #c4b5fd, #5eead4);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    .maint-modal-sub {
        text-align: center; color: rgba(136,120,195,0.8);
        font-size: 13px; margin-bottom: 28px;
        font-style: italic; font-family: 'Exo 2', sans-serif;
    }

    .maint-label {
        display: block; font-size: 10px; font-weight: 700;
        color: rgba(136,120,195,0.7); text-transform: uppercase;
        letter-spacing: 1.5px; margin-bottom: 6px;
        font-family: 'Exo 2', sans-serif;
    }
    .maint-input {
        width: 100%; padding: 13px 16px;
        background: rgba(10,7,32,0.8);
        border: 1px solid rgba(124,58,237,0.25);
        border-radius: 12px; color: #f0eeff;
        font-size: 14px; font-family: 'Exo 2', sans-serif;
        margin-bottom: 14px; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
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
        color: #fff; font-size: 13px; font-weight: 700;
        cursor: pointer; transition: all 0.25s;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        text-transform: uppercase; letter-spacing: 1px;
        font-family: 'Exo 2', sans-serif; margin-top: 6px;
    }
    .maint-submit-btn:hover:not(:disabled) {
        filter: brightness(1.15); transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(124,58,237,0.4);
    }
    .maint-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .maint-auth-error {
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
        border-radius: 10px; padding: 10px 14px;
        color: #fca5a5; font-size: 12px; margin-bottom: 14px;
        font-family: 'Exo 2', sans-serif; line-height: 1.4;
    }

    @media (max-width: 480px) {
        .maint-modal { padding: 28px 20px; border-radius: 20px 20px 0 0; position: fixed; bottom: 0; left: 0; right: 0; max-width: none; }
        .maint-modal-overlay { align-items: flex-end; }
        .maint-timer { font-size: clamp(2.5rem, 12vw, 4rem); }
    }
    `;
    document.head.appendChild(style);
}
