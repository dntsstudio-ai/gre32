// ============================================================
// js/app.js — Voice Acting Team — Главный модуль (V2.3 FIXED)
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
window.navigate = function(page, pushState = true) {
    navigate(page, pushState);
    incrementPageView();
    
    if (page === 'inventory') {
        if (!state.userData) return navigate('profile');
        window.loadInventory?.();
    }
    if (page === 'lootbox') {
        if (!state.userData) return navigate('profile');
        // Обновленный вызов для VAT V2.3
        const wrap = document.getElementById('lootbox-wrap');
        if (wrap) window.renderLootboxGame?.(wrap, state.userData?.vcoins || 0);
    }
    // ... остальные переходы
};

// Функция миграции инвентаря на Stacking
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
                customCardsStacked[id] = (customCardsStacked[customCardsStacked] || 0) + 1;
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
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            state.userData = snap.data();
            
            // Авто-миграция при входе
            const migrated = await migrateInventory(user.uid, state.userData);
            if (migrated) {
                const newSnap = await getDoc(doc(db, 'users', user.uid));
                state.userData = newSnap.data();
            }

            state.isAdmin = ['admin', 'proxyadmin'].includes(state.userData.role);
            applyUserUI(state.userData, state.isAdmin, canAccessDubin(state.userData));
            
            // Проверка дневного лимита при входе (визуально)
            const now = new Date().toISOString().split('T')[0];
            if (state.userData.dailyEarnings?.date !== now) {
                await updateDoc(doc(db, 'users', user.uid), {
                    'dailyEarnings.date': now,
                    'dailyEarnings.total': 0
                });
            }
        }
    }
    // ... остальной код app.js
});
