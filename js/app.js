// ============================================================
//  js/app.js — Voice Acting Team — Главный модуль
// ============================================================

import { initializeApp }               from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc }   from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage }                  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

import { FIREBASE_CONFIG, EMAILJS_CONFIG } from '../config/config.js?v=20260915p';
import { navigate, closeModals, showToast, canAccessDubin, canAccessRatings } from './core.js?v=20260915p';
import { initAuthListeners, applyUserUI, resetUserUI, bindAuthActions } from './auth.js?v=20260915p';
import { renderAchProfile, bindAchievements } from './achievements.js?v=20260915p';
import { loadReleases, renderGrid, bindReleases, enableSearch, disableSearch } from './releases.js?v=20260915p';
import { bindVCoins, awardVCoins, claimPendingGifts } from './vcoins.js?v=20260915p';
import { bindNotifications, listenNotifications } from './notifications.js?v=20260915p';
import { bindAdminPanel, updateLastSeen, startSessionTimer, incrementPageView } from './admin_panel.js?v=20260915p';
import { bindBanners } from './banners.js?v=20260915p';
import { checkMaintenance, startMaintenancePolling, injectMaintenanceStyles, prefetchMaintenance } from './maintenance.js?v=20260915p';

// ── Ленивая загрузка "неглавных" модулей ────────────────────────
// Раньше все ~20 файлов сайта подключались сразу при любом заходе —
// даже обычному посетителю, который просто смотрит список релизов,
// приходилось скачивать и выполнять код магазина, игр, DUB-in студии,
// плейлистов и т.п. Теперь эти модули (и их bindX()) подключаются через
// import() только в момент, когда человек реально открывает нужную
// страницу — см. вызовы ниже в navigate() и в обработчиках deep-link'ов.
const V = '20260915p';

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
bindAchievements(db, auth, getState);
bindAuthActions(auth, db, getState);
bindVCoins(db, auth, getState);
bindNotifications(db, auth, getState);
bindAdminPanel(db, auth, getState);
bindBanners(db, auth, getState);

window.closeModals = closeModals;
window.showToast   = showToast;
window._releasesEnableSearch  = enableSearch;
window._releasesDisableSearch = disableSearch;
window.awardVCoins = awardVCoins;

const _pendingNav = window._navQueue || [];

// users.js вызывается со множества страниц (профиль, состав, магазин,
// комментарии) — подключаем его тем же способом отовсюду, без дублей
function ensureUsersModule() {
    if (typeof window.openUserProfile === 'function') return Promise.resolve();
    return import(`./users.js?v=${V}`).then(m => m.bindUsers(db, auth, getState));
}

window.navigate = async function(page, pushState) {
    if (pushState === undefined) pushState = true;
    navigate(page, pushState);
    incrementPageView();
    if (page === 'team') {
        const [m] = await Promise.all([import(`./team.js?v=${V}`), ensureUsersModule()]);
        m.bindTeam(db, getState);
        window.loadTeam?.();
    }
    if (page === 'dubin') {
        const m = await import(`./dubin.js?v=${V}`);
        m.bindDubin(db, auth, getState);
        m.initDubinPanel(state.isAdmin, canAccessDubin(state.userData));
        if (canAccessDubin(state.userData)) window.renderDubinProjects?.();
    }
    if (page === 'ratings') {
        const m = await import(`./ratings.js?v=${V}`);
        m.bindRatings(db, auth, getState);
        window.loadRatingsPage?.();
    }
    if (page === 'shop') {
        const [m] = await Promise.all([import(`./shopSlides.js?v=${V}`), ensureUsersModule()]);
        m.bindShopSlides(db, auth, getState);
        window.loadShopPage?.();
    }
    if (page === 'stats')     window.loadStatsPage?.();
    if (page === 'inventory') {
        if (!state.userData) { navigate('profile', pushState); return; }
        const m = await import(`./inventory.js?v=${V}`);
        m.bindInventory(db, auth, getState);
        window.loadInventory?.();
    }
    if (page === 'lootbox') {
        if (!state.userData) { navigate('profile', pushState); return; }
        // lootbox.js использует addCardToInventory() из inventory.js — тому
        // нужен собственный bindInventory(), иначе выигранная карточка не
        // сохранится (inventory.js подтянется сам через lootbox.js, но без
        // вызова bind у него не будет своих _db/_auth)
        const [invMod, lbMod] = await Promise.all([
            import(`./inventory.js?v=${V}`),
            import(`./lootbox.js?v=${V}`),
        ]);
        invMod.bindInventory(db, auth, getState);
        lbMod.bindLootbox(db, auth, getState);
        window.renderLootboxGame?.(document.getElementById('lootbox-wrap'), state.userData?.vcoins || 0);
    }
    if (page === 'games') {
        if (!state.userData) { navigate('profile', pushState); return; }
        window.renderGamesPage?.(document.getElementById('games-wrap'));
    }
    if (page === 'playlists') {
        if (!state.userData) { navigate('profile', pushState); return; }
        const m = await import(`./playlists.js?v=${V}`);
        m.bindPlaylists(db, auth, getState);
        window.loadPlaylistsPage?.();
    }
    if (page === 'profile' && state.userData) {
        const [plMod, usMod] = await Promise.all([
            import(`./playlists.js?v=${V}`),
            import(`./users_search.js?v=${V}`),
            ensureUsersModule(),
        ]);
        plMod.bindPlaylists(db, auth, getState);
        usMod.bindUserSearch(db, auth, getState);
        usMod.bindProfileWall(db, auth, getState);
        window.loadMyLists?.();
        window.loadProfileWall?.(auth.currentUser?.uid);
    }
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

    // Секции целиком (включая заголовок "Студия"/"Администрация") — видны,
    // только если у пользователя есть доступ хотя бы к одному пункту внутри
    const studioVisible = canAccessDubin(u) || canAccessRatings(u);
    show('sidebar-sec-studio', studioVisible, 'block');
    show('sidebar-sec-studio-divider', studioVisible, 'block');
    show('sidebar-sec-admin', a, 'block');
    show('sidebar-sec-admin-divider', a, 'block');
    show('profile-admin-group', a, 'block');

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
    // Запускаем сетевые запросы, которые не зависят друг от друга, ОДНОВРЕМЕННО,
    // а не одной длинной цепочкой — иначе на медленной связи они складываются
    // и сайт "виснет" на сумму всех таймаутов вместо одного самого долгого.
    prefetchMaintenance(db);
    const releasesPromise = withTimeout(loadReleases(db, false), 6000, null);

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
    const inMaintenance = await withTimeout(checkMaintenance(db, userRole), 6000, false);
    await releasesPromise;
    renderGrid(state.isAdmin); // перерисовать с учётом реальной роли (карточки уже загружены выше параллельно)
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
    } else if (teamMatch) {
        const [m] = await Promise.all([import(`./team.js?v=${V}`), ensureUsersModule()]);
        m.bindTeam(db, getState);
        window.openTeamPage?.(teamMatch[1]);
    } else {
        window.navigate(targetPage, false);
    }
});

window.addEventListener('popstate', async function() {
    const raw = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '') || 'home';
    const viewMatch = raw.match(/^view\/(.+)$/);
    const teamMatch = raw.match(/^team-page\/(.+)$/);
    if (viewMatch && window.openView) {
        window.openView(viewMatch[1]);
    } else if (teamMatch) {
        const [m] = await Promise.all([import(`./team.js?v=${V}`), ensureUsersModule()]);
        m.bindTeam(db, getState);
        window.openTeamPage?.(teamMatch[1]);
    } else {
        window.navigate(raw, false);
    }
});

// Плашки показываются всем посетителям, вне зависимости от входа в аккаунт
if (window.startBannerWidget) window.startBannerWidget();
