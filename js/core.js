// ============================================================
//  js/core.js — Voice Acting Team — Утилиты
// ============================================================

export const esc = (s) =>
    s ? s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

export const ROLE_LABELS = {
    admin:     { label: 'АДМИНИСТРАТОР', cls: 'role-admin', icon: 'fa-shield-alt'    },
    moderator: { label: 'МОДЕРАТОР',     cls: 'role-mod',   icon: 'fa-user-check'    },
    dub:       { label: 'АКТЁР ДУБЛЯЖА', cls: 'role-dub',   icon: 'fa-microphone-alt'},
    user:      { label: 'ПОЛЬЗОВАТЕЛЬ',  cls: 'role-user',  icon: 'fa-user'          }
};

export function getRoleBadgeHTML(role) {
    const r = ROLE_LABELS[role] || ROLE_LABELS.user;
    return `<span class="role-badge ${r.cls}"><i class="fas ${r.icon}"></i> ${r.label}</span>`;
}

// ── Toast ──
export function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ── Achievement popup ──
export function showAchievementPopup(ach, isFullscreen = false) {
    const existing = document.getElementById('ach-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'ach-popup';
    popup.className = isFullscreen ? 'ach-popup ach-popup--fs' : 'ach-popup';

    const imgDiv  = document.createElement('div');
    imgDiv.className = 'ach-popup-img';
    imgDiv.textContent = ach.img;

    const textDiv   = document.createElement('div');
    textDiv.className = 'ach-popup-text';

    const labelDiv  = document.createElement('div');
    labelDiv.className = 'ach-popup-label';
    labelDiv.textContent = 'Новое достижение!';

    const nameDiv   = document.createElement('div');
    nameDiv.className = 'ach-popup-name';
    nameDiv.textContent = ach.name;

    const descDiv   = document.createElement('div');
    descDiv.className = 'ach-popup-desc';
    descDiv.textContent = ach.desc;

    textDiv.appendChild(labelDiv);
    textDiv.appendChild(nameDiv);
    textDiv.appendChild(descDiv);
    popup.appendChild(imgDiv);
    popup.appendChild(textDiv);

    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add('ach-popup--visible'));
    setTimeout(() => {
        popup.classList.remove('ach-popup--visible');
        setTimeout(() => popup.remove(), 500);
    }, 5000);
}

// ── Modals ──
export function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

// ── Navigation ──
export function navigate(page, pushState = true) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(page);
    if (target) target.classList.add('active');
    const navMap = {
        home:'n-home', team:'n-team', 'team-page':'n-team',
        profile:'n-profile', dubin:'n-dubin', view:'n-home',
        order:'n-order', playlists:'n-playlists'
    };
    const navEl = document.getElementById(navMap[page]);
    if (navEl) navEl.classList.add('active');
    if (page !== 'view') {
        const iframes = document.querySelectorAll('.swsp-iframe');
        iframes.forEach(f => { try { f.src = ''; } catch(e) {} });
    }
    if (pushState) history.pushState(null, '', '#' + page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Search ──
window.openSearch = () => {
    const wrap  = document.getElementById('search-wrap');
    const input = document.getElementById('main-search');
    if (!wrap) return;
    wrap.classList.add('search-open');
    if (window._releasesEnableSearch) window._releasesEnableSearch();
    setTimeout(() => {
        if (input) { input.focus(); input.select(); }
    }, 350);
};

window.closeSearch = () => {
    const wrap  = document.getElementById('search-wrap');
    const input = document.getElementById('main-search');
    if (!wrap) return;
    wrap.classList.remove('search-open');
    if (input) input.value = '';
    if (window._releasesDisableSearch) window._releasesDisableSearch();
    if (window.filterData) window.filterData();
};

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('search-wrap');
    if (!wrap) return;
    if (wrap.classList.contains('search-open') && !wrap.contains(e.target)) {
        const input = document.getElementById('main-search');
        if (!input?.value) window.closeSearch();
    }
}, true);
