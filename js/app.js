// ============================================================
//  js/app.js — Voice Acting Team — Главный модуль
// ============================================================

import { initializeApp }               from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc }   from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage }                  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

import { FIREBASE_CONFIG, EMAILJS_CONFIG } from '../config/config.js?v=20260906b';
import { navigate, closeModals, showToast, canAccessDubin, canAccessRatings } from './core.js?v=20260906b';
import { initAuthListeners, applyUserUI, resetUserUI, bindAuthActions } from './auth.js?v=20260906b';
import { renderAchProfile, bindAchievements } from './achievements.js?v=20260906b';
import { loadReleases, bindReleases, enableSearch, disableSearch } from './releases.js?v=20260906b';
import { bindComments }    from './comments.js?v=20260906b';
import { bindTeam }        from './team.js?v=20260906b';
import { bindUsers }       from './users.js?v=20260906b';
import { initDubinPanel, bindDubin } from './dubin.js?v=20260906b';
import { bindOrder }       from './order.js?v=20260906b';
import { bindPlaylists }   from './playlists.js?v=20260906b';
import { bindRatings }     from './ratings.js?v=20260906b';
import { bindVCoins, awardVCoins, claimPendingGifts } from './vcoins.js?v=20260906b';
import { bindInventory } from './inventory.js?v=20260906b';
import { bindLootbox } from './lootbox.js?v=20260906b';
import { bindNotifications, listenNotifications } from './notifications.js?v=20260906b';
import { bindUserSearch, bindProfileWall } from './users_search.js?v=20260906b';
import { bindAdminPanel, updateLastSeen, startSessionTimer, incrementPageView } from './admin_panel.js?v=20260906b';
import { bindBanners } from './banners.js?v=20260906b';
import { checkMaintenance, startMaintenancePolling, injectMaintenanceStyles } from './maintenance.js?v=20260906b';

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// ── Защита от зависания сайта, если Firestore недоступен (медленная сеть,
//    блокировки провайдера и т.п.) — не ждём ответ дольше указанного времени
function withTimeout(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
}

if (window.emailjs) emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });

const state = { userData: null, isAdmin: false, isDub: false, isMod: false, isCurator: false, curProj: null };
const getState = () => state;

injectMaintenanceStyles();

bindReleases(db, auth, getState, storage);
bindComments(db, auth, getState);
bindTeam(db, getState);
bindUsers(db, auth, getState);
bindAchievements(db, auth, getState);
bindDubin(db, auth, getState);
bindAuthActions(auth, db, getState);
bindOrder(db, auth, getState);
bindPlaylists(db, auth, getState);
bindRatings(db, auth, getState);
bindVCoins(db, auth, getState);
bindInventory(db, auth, getState);
bindLootbox(db, auth, getState);
bindNotifications(db, auth, getState);
bindUserSearch(db, auth, getState);
bindProfileWall(db, auth, getState);
bindAdminPanel(db, auth, getState);
bindBanners(db, auth, getState);

window.closeModals = closeModals;
window.showToast   = showToast;
window._releasesEnableSearch  = enableSearch;
window._releasesDisableSearch = disableSearch;
window.awardVCoins = awardVCoins;

const _pendingNav = window._navQueue || [];

window.navigate = function(page, pushState) {
    if (pushState === undefined) pushState = true;
    navigate(page, pushState);
    incrementPageView();
    if (page === 'team')      window.loadTeam?.();
    if (page === 'dubin')     { initDubinPanel(state.isAdmin, canAccessDubin(state.userData)); if (canAccessDubin(state.userData)) window.renderDubinProjects?.(); }
    if (page === 'ratings')   window.loadRatingsPage?.();
    if (page === 'shop')      window.loadShopPage?.();
    if (page === 'stats')     window.loadStatsPage?.();
    if (page === 'inventory') { if (!state.userData) { navigate('profile', pushState); return; } window.loadInventory?.(); }
    if (page === 'lootbox')   { if (!state.userData) { navigate('profile', pushState); return; } window.renderLootboxGame?.(document.getElementById('lootbox-wrap'), state.userData?.vcoins || 0); }
    if (page === 'playlists') { if (!state.userData) { navigate('profile', pushState); return; } window.loadPlaylistsPage?.(); }
    if (page === 'profile' && state.userData) { window.loadMyLists?.(); window.loadProfileWall?.(auth.currentUser?.uid); }
};

function updateSidebarVisibility() {
    const u = state.userData;
    const a = state.isAdmin;
    const show = (id, v, dt) => { const el = document.getElementById(id); if (el) el.style.display = v ? (dt||'flex') : 'none'; };
    show('sn-dubin',         canAccessDubin(u));
    show('sn-ratings',       canAccessRatings(u));
    show('sn-shop',          !!u);
    show('sn-inventory',     !!u);
    show('sn-playlists',     !!u);
    show('sn-stats',         a);
    show('notif-btn',        !!u);
    show('adm-btn-rel',      a, 'inline-flex');
    show('adm-btn-team',     a, 'inline-flex');
    show('adm-btn-role',     a, 'inline-flex');
    show('btn-admin-roles',  a, 'inline-flex');
    show('btn-admin-levers', a, 'inline-flex');
    show('btn-admin-banners', a, 'inline-flex');
    show('btn-admin-vcoins', a, 'inline-flex');
    const admAch = document.getElementById('adm-ach-panel');
    if (admAch) admAch.style.display = a ? 'block' : 'none';
    const shopBal = document.getElementById('sn-shop-balance');
    if (shopBal && u) shopBal.textContent = u.vcoins || 0;
    const invCount = document.getElementById('sn-inv-count');
    if (invCount && u) invCount.textContent = (u.inventory?.cards?.length || 0);
}

onAuthStateChanged(auth, async function(user) {
    if (user) {
        try {
            const snap = await withTimeout(getDoc(doc(db, 'users', user.uid)), 6000, null);
            if (snap && snap.exists()) {
                state.userData  = snap.data();
                state.isAdmin   = ['admin', 'proxyadmin', 'developer'].includes(state.userData.role);
                state.isDub     = canAccessDubin(state.userData);
                state.isMod     = state.userData.role === 'moderator';
                state.isCurator = state.userData.role === 'curator';
                applyUserUI(state.userData, state.isAdmin, state.isDub);
                renderAchProfile(state.userData);
                listenNotifications(user.uid);
                startSessionTimer(user.uid);
                updateLastSeen(user.uid);
                claimPendingGifts(user.uid);
                const lastDaily = state.userData.lastDailyBonus || 0;
                if (Date.now() - lastDaily > 86400000) {
                    setTimeout(async () => {
                        try {
                            await awardVCoins(5, 'Ежедневный вход');
                            const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
                            await updateDoc(doc(db, 'users', user.uid), { lastDailyBonus: Date.now() });
                        } catch(e) { console.warn('dailyBonus:', e); }
                    }, 2000);
                }
            } else { resetUserUI(); }
        } catch(e) { console.error('onAuthStateChanged:', e); resetUserUI(); }
    } else {
        state.userData = null; state.isAdmin = false; state.isDub = false;
        state.isMod = false; state.isCurator = false;
        resetUserUI();
    }

    updateSidebarVisibility();

    const userRole = state.userData?.role || null;
    const [inMaintenance] = await Promise.all([
        withTimeout(checkMaintenance(db, userRole), 6000, false),
        withTimeout(loadReleases(db, state.isAdmin), 6000, null)
    ]);
    startMaintenancePolling(db, () => state.userData?.role || null);
    if (inMaintenance) return;

    initAuthListeners(auth, db);

    const rawPath    = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const hashPage   = rawPath || 'home';
    const targetPage = _pendingNav.length > 0 ? _pendingNav[_pendingNav.length - 1][0] : hashPage;

    if (targetPage === 'dubin'   && !canAccessDubin(state.userData))   { window.navigate('home', false); return; }
    if (targetPage === 'ratings' && !canAccessRatings(state.userData)) { window.navigate('home', false); return; }
    if (targetPage === 'stats'   && !state.isAdmin)                    { window.navigate('home', false); return; }
    if (targetPage === 'shop'    && !state.userData)                   { window.navigate('home', false); return; }

    const viewMatch = targetPage.match(/^view\/(.+)$/);
    const teamMatch = targetPage.match(/^team-page\/(.+)$/);
    if (viewMatch && window.openView) {
        window.openView(viewMatch[1]);
    } else if (teamMatch && window.openTeamPage) {
        window.openTeamPage(teamMatch[1]);
    } else {
        window.navigate(targetPage, false);
    }
});

window.addEventListener('popstate', function() {
    const raw = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '') || 'home';
    const viewMatch = raw.match(/^view\/(.+)$/);
    const teamMatch = raw.match(/^team-page\/(.+)$/);
    if (viewMatch && window.openView) {
        window.openView(viewMatch[1]);
    } else if (teamMatch && window.openTeamPage) {
        window.openTeamPage(teamMatch[1]);
    } else {
        window.navigate(raw, false);
    }
});

// Плашки показываются всем посетителям, вне зависимости от входа в аккаунт
if (window.startBannerWidget) window.startBannerWidget();
