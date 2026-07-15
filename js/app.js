// ============================================================
// js/app.js — Voice Acting Team — Главный модуль (V2.3 FINAL FIXED)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { FIREBASE_CONFIG, EMAILJS_CONFIG } from '../config/config.js';
import { navigate, closeModals, showToast, canAccessDubin, canAccessRatings } from './core.js';
import { initAuthListeners, applyUserUI, resetUserUI, bindAuthActions } from './auth.js';
import { renderAchProfile, bindAchievements } from './achievements.js';
import { loadReleases, bindReleases, enableSearch, disableSearch } from './releases.js';
import { bindComments } from './comments.js';
import { bindTeam } from './team.js';
import { bindUsers } from './users.js';
import { initDubinPanel, bindDubin } from './dubin.js';
import { bindOrder } from './order.js';
import { bindPlaylists } from './playlists.js';
import { bindRatings } from './ratings.js';
import { bindVCoins, awardVCoins } from './vcoins.js';
import { bindInventory } from './inventory.js';
import { bindLootbox } from './lootbox.js';
import { bindNotifications, listenNotifications } from './notifications.js';
import { bindUserSearch, bindProfileWall } from './users_search.js';
import { bindAdminPanel, updateLastSeen, startSessionTimer, incrementPageView } from './admin_panel.js';
import { checkMaintenance, startMaintenancePolling, injectMaintenanceStyles } from './maintenance.js';

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

if (window.emailjs) emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });

const state = { userData: null, isAdmin: false, isDub: false, isMod: false, isCurator: false, curProj: null };
const getState = () => state;

// Инициализация всех модулей
injectMaintenanceStyles();
bindReleases(db, auth, getState);
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

window.closeModals = closeModals;
window.showToast = showToast;
window._releasesEnableSearch = enableSearch;
window._releasesDisableSearch = disableSearch;
window.awardVCoins = awardVCoins;

// --- ФУНКЦИИ БОКОВОЙ ПАНЕЛИ (SIDEBAR) ---
window.openSidebar = function() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeSidebar = function() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
};

const _pendingNav = window._navQueue || [];

window.navigate = function(page, pushState) {
  if (pushState === undefined) pushState = true;
  navigate(page, pushState);
  incrementPageView();
  window.closeSidebar(); // Закрываем меню при переходе
  
  if (page === 'team') window.loadTeam?.();
  if (page === 'dubin') {
    initDubinPanel(state.isAdmin, canAccessDubin(state.userData));
    if (canAccessDubin(state.userData)) window.renderDubinProjects?.();
  }
  if (page === 'ratings') window.loadRatingsPage?.();
  if (page === 'shop') window.loadShopPage?.();
  if (page === 'stats') window.loadStatsPage?.();
  if (page === 'inventory') {
    if (!state.userData) { navigate('profile', pushState); return; }
    window.loadInventory?.();
  }
  if (page === 'lootbox') {
    if (!state.userData) { navigate('profile', pushState); return; }
    window.renderLootboxGame?.(document.getElementById('lootbox-wrap'), state.userData?.vcoins || 0);
  }
  if (page === 'playlists') {
    if (!state.userData) { navigate('profile', pushState); return; }
    window.loadPlaylistsPage?.();
  }
  if (page === 'profile' && state.userData) {
    window.loadMyLists?.();
    window.loadProfileWall?.(auth.currentUser?.uid);
  }
};

function updateSidebarVisibility() {
  const u = state.userData;
  const a = state.isAdmin;
  const show = (id, v, dt) => {
    const el = document.getElementById(id);
    if (el) el.style.display = v ? (dt||'flex') : 'none';
  };
  show('sn-dubin', canAccessDubin(u));
  show('sn-ratings', canAccessRatings(u));
  show('sn-shop', !!u);
  show('sn-inventory', !!u);
  show('sn-playlists', !!u);
  show('sn-stats', a);
  show('notif-btn', !!u);
  show('adm-btn-rel', a, 'inline-flex');
  show('adm-btn-team', a, 'inline-flex');
  show('adm-btn-role', a, 'inline-flex');
  show('btn-admin-roles', a, 'inline-flex');
  show('btn-admin-vcoins', a, 'inline-flex');
  const admAch = document.getElementById('adm-ach-panel');
  if (admAch) admAch.style.display = a ? 'block' : 'none';
  const shopBal = document.getElementById('sn-shop-balance');
  if (shopBal && u) shopBal.textContent = u.vcoins || 0;
  const invCount = document.getElementById('sn-inv-count');
  if (invCount && u) {
      const cards = u.inventory?.cardsStacked ? Object.values(u.inventory.cardsStacked).reduce((a,b)=>a+b,0) : (u.inventory?.cards?.length || 0);
      invCount.textContent = cards;
  }
}

async function migrateInventory(uid, userData) {
    if (userData.inventory?.cards && !userData.inventory?.cardsStacked) {
        console.log("Migrating inventory to stacking system...");
        const cardsStacked = {};
        userData.inventory.cards.forEach(id => {
            cardsStacked[id] = (cardsStacked[id] || 0) + 1;
        });
        const customCardsStacked = {};
        if (userData.inventory.customCards) {
            userData.inventory.customCards.forEach(id => {
                customCardsStacked[id] = (customCardsStacked[id] || 0) + 1;
            });
        }
        await updateDoc(doc(db, 'users', uid), {
            'inventory.cardsStacked': cardsStacked,
            'inventory.customCardsStacked': customCardsStacked,
            'inventory.migrated': true
        });
        return true;
    }
    return false;
}

onAuthStateChanged(auth, async function(user) {
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        state.userData = snap.data();
        
        const migrated = await migrateInventory(user.uid, state.userData);
        if (migrated) {
            const newSnap = await getDoc(doc(db, 'users', user.uid));
            state.userData = newSnap.data();
        }

        state.isAdmin = ['admin', 'proxyadmin'].includes(state.userData.role);
        state.isDub = canAccessDubin(state.userData);
        state.isMod = state.userData.role === 'moderator';
        state.isCurator = state.userData.role === 'curator';
        applyUserUI(state.userData, state.isAdmin, state.isDub);
        renderAchProfile(state.userData);
        listenNotifications(user.uid);
        startSessionTimer(user.uid);
        updateLastSeen(user.uid);
        
        const nowStr = new Date().toISOString().split('T')[0];
        if (state.userData.dailyEarnings?.date !== nowStr) {
            await updateDoc(doc(db, 'users', user.uid), {
                'dailyEarnings.date': nowStr,
                'dailyEarnings.total': 0
            });
        }

        const lastDaily = state.userData.lastDailyBonus || 0;
        if (Date.now() - lastDaily > 86400000) {
          setTimeout(async () => {
            try {
              await awardVCoins(5, 'Ежедневный вход');
              await updateDoc(doc(db, 'users', user.uid), { lastDailyBonus: Date.now() });
            } catch(e) { console.warn('dailyBonus:', e); }
          }, 2000);
        }
      } else { resetUserUI(); }
    } catch(e) { console.error('onAuthStateChanged:', e); resetUserUI(); }
  } else {
    state.userData = null;
    state.isAdmin = false;
    state.isDub = false;
    state.isMod = false;
    state.isCurator = false;
    resetUserUI();
  }
  updateSidebarVisibility();
  const userRole = state.userData?.role || null;
  const inMaintenance = await checkMaintenance(db, userRole);
  startMaintenancePolling(db, () => state.userData?.role || null);
  if (inMaintenance) return;
  await loadReleases(db, state.isAdmin);
  initAuthListeners(auth, db);
  const hashPage = window.location.hash.replace('#', '') || 'home';
  const targetPage = _pendingNav.length > 0 ? _pendingNav[_pendingNav.length - 1][0] : hashPage;
  window.navigate(targetPage, false);
});

window.addEventListener('popstate', function() {
  window.navigate(window.location.hash.replace('#', '') || 'home', false);
});
