// ============================================================
//  js/core.js — Voice Acting Team — Утилиты
// ============================================================

export const esc = (s) =>
    s ? s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

// ── Все роли сайта ──
export const ROLE_LABELS = {
    admin:      { label: 'АДМИНИСТРАТОР',   cls: 'role-admin',    icon: 'fa-shield-alt'      },
    proxyadmin: { label: 'ПРОКСИ-АДМИН',    cls: 'role-proxyadmin',icon: 'fa-user-shield'    },
    developer:  { label: 'РАЗРАБОТЧИК',     cls: 'role-developer', icon: 'fa-code'           },
    moderator:  { label: 'МОДЕРАТОР',       cls: 'role-mod',      icon: 'fa-user-check'      },
    dub:        { label: 'АКТЁР ДУБЛЯЖА',   cls: 'role-dub',      icon: 'fa-microphone-alt'  },
    curator:    { label: 'КУРАТОР',         cls: 'role-curator',  icon: 'fa-crown'           },
    subber:     { label: 'САББЕР',          cls: 'role-subber',   icon: 'fa-closed-captioning'},
    previewer:  { label: 'ПРЕВЬЮМЕЙКЕР',    cls: 'role-previewer',icon: 'fa-image'           },
    editor:     { label: 'МОНТАЖЁР',        cls: 'role-editor',   icon: 'fa-film'            },
    mixer:      { label: 'СВОДЧИК',         cls: 'role-mixer',    icon: 'fa-sliders-h'       },
    user:       { label: 'ПОЛЬЗОВАТЕЛЬ',    cls: 'role-user',     icon: 'fa-user'            }
};

// Все роли с доступом к DUB-in
const DUBIN_ACCESS = ['admin','dub','curator','subber','previewer','editor','mixer','proxyadmin','developer'];

export function getRoleBadgeHTML(role, curatorProject) {
    if (role === 'curator' && curatorProject) {
        return '<span class="role-badge role-curator"><i class="fas fa-crown"></i> Куратор: ' + esc(curatorProject) + '</span>';
    }
    const r = ROLE_LABELS[role] || ROLE_LABELS.user;
    return '<span class="role-badge ' + r.cls + '"><i class="fas ' + r.icon + '"></i> ' + r.label + '</span>';
}

export function canAccessDubin(userData) {
    if (!userData) return false;
    return DUBIN_ACCESS.includes(userData.role);
}
export function canAccessRatings(userData) {
    if (!userData) return false;
    return ['admin','curator','proxyadmin','developer'].includes(userData.role);
}
export function canEditRatings(userData) {
    if (!userData) return false;
    return ['admin','proxyadmin'].includes(userData.role);
}

// ── Toast ──
export function showToast(msg, type) {
    if (!type) type = 'success';
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(function() {
        t.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(function() { t.remove(); }, 300);
    }, 4000);
}

export function showAchievementPopup(ach, isFullscreen) {
    const existing = document.getElementById('ach-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'ach-popup';
    popup.className = isFullscreen ? 'ach-popup ach-popup--fs' : 'ach-popup';
    const imgDiv = document.createElement('div'); imgDiv.className='ach-popup-img'; imgDiv.textContent=ach.img;
    const textDiv = document.createElement('div'); textDiv.className='ach-popup-text';
    const labelDiv = document.createElement('div'); labelDiv.className='ach-popup-label'; labelDiv.textContent='Новое достижение!';
    const nameDiv = document.createElement('div'); nameDiv.className='ach-popup-name'; nameDiv.textContent=ach.name;
    const descDiv = document.createElement('div'); descDiv.className='ach-popup-desc'; descDiv.textContent=ach.desc;
    textDiv.appendChild(labelDiv); textDiv.appendChild(nameDiv); textDiv.appendChild(descDiv);
    popup.appendChild(imgDiv); popup.appendChild(textDiv);
    document.body.appendChild(popup);
    requestAnimationFrame(function() { popup.classList.add('ach-popup--visible'); });
    setTimeout(function() { popup.classList.remove('ach-popup--visible'); setTimeout(function(){ popup.remove(); },500); }, 5000);
}

// ── VCoins popup ──
export function showVCoinsPopup(amount, reason) {
    const popup = document.createElement('div');
    popup.className = 'vcoins-popup';
    popup.innerHTML = '<span class="vcoins-popup-coin">🪙</span><span>+' + amount + ' VC</span><span class="vcoins-popup-reason">' + esc(reason) + '</span>';
    document.body.appendChild(popup);
    requestAnimationFrame(function() { popup.classList.add('vcoins-popup--visible'); });
    setTimeout(function() { popup.classList.remove('vcoins-popup--visible'); setTimeout(function(){ popup.remove(); }, 600); }, 3000);
}

export function closeModals() {
    document.querySelectorAll('.modal').forEach(function(m) { m.style.display = 'none'; });
}

export function navigate(page, pushState) {
    if (pushState === undefined) pushState = true;
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('.nav-link').forEach(function(l) { l.classList.remove('active'); });
    document.querySelectorAll('.sidebar-link').forEach(function(l) { l.classList.remove('active'); });

    const target = document.getElementById(page);
    if (target) target.classList.add('active');

    const navMap  = { home:'n-home', view:'n-home', team:'n-team', 'team-page':'n-team', order:'n-order' };
    const sideMap = { profile:'sn-profile', playlists:'sn-playlists', dubin:'sn-dubin',
                      ratings:'sn-ratings', shop:'sn-shop', stats:'sn-stats' };

    const navEl  = document.getElementById(navMap[page]);
    if (navEl)  navEl.classList.add('active');
    const sideEl = document.getElementById(sideMap[page]);
    if (sideEl) sideEl.classList.add('active');

    if (page !== 'view') {
        document.querySelectorAll('.swsp-iframe').forEach(function(f){ try { f.src=''; } catch(e){} });
    }
    if (pushState) history.pushState(null, '', '#' + page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.closeSidebar && window.closeSidebar();
}

window.openSidebar = function() {
    document.getElementById('sidebar-overlay')?.classList.add('active');
    document.getElementById('app-sidebar')?.classList.add('open');
    document.body.style.overflow = 'hidden';
};
window.closeSidebar = function() {
    document.getElementById('sidebar-overlay')?.classList.remove('active');
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.body.style.overflow = '';
};

window.openSearch = function() {
    const wrap = document.getElementById('search-wrap');
    if (!wrap) return;
    wrap.classList.add('search-open');
    if (window._releasesEnableSearch) window._releasesEnableSearch();
    setTimeout(function(){ const input=document.getElementById('main-search'); if(input){input.focus();input.select();} }, 350);
};
window.closeSearch = function() {
    const wrap = document.getElementById('search-wrap');
    if (!wrap) return;
    wrap.classList.remove('search-open');
    const input = document.getElementById('main-search');
    if (input) input.value = '';
    if (window._releasesDisableSearch) window._releasesDisableSearch();
    if (window.filterData) window.filterData();
};
document.addEventListener('click', function(e) {
    const wrap = document.getElementById('search-wrap');
    if (!wrap) return;
    if (wrap.classList.contains('search-open') && !wrap.contains(e.target)) {
        const input = document.getElementById('main-search');
        if (!input || !input.value) window.closeSearch();
    }
}, true);
