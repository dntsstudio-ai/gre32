// ============================================================
//  js/app.js — Voice Acting Team
// ============================================================

import { initializeApp }               from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc }   from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import { FIREBASE_CONFIG, EMAILJS_CONFIG } from '../config/config.js';
import { navigate, closeModals, showToast, canAccessDubin, canAccessRatings } from './core.js';
import { initAuthListeners, applyUserUI, resetUserUI, bindAuthActions } from './auth.js';
import { renderAchProfile, bindAchievements } from './achievements.js';
import { loadReleases, bindReleases, enableSearch, disableSearch } from './releases.js';
import { bindComments }  from './comments.js';
import { bindTeam }      from './team.js';
import { bindUsers }     from './users.js';
import { initDubinPanel, bindDubin } from './dubin.js';
import { bindOrder }     from './order.js';
import { bindPlaylists } from './playlists.js';
import { bindRatings }   from './ratings.js';

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

if (window.emailjs) emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });

const state = {
    userData: null,
    isAdmin:  false,
    isDub:    false,
    isMod:    false,
    isCurator: false,
    curProj:  null
};
const getState = () => state;

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

window.closeModals = closeModals;
window.showToast   = showToast;
window._releasesEnableSearch  = enableSearch;
window._releasesDisableSearch = disableSearch;

const _pendingNav = window._navQueue || [];

window.navigate = function(page, pushState) {
    if (pushState === undefined) pushState = true;
    navigate(page, pushState);

    if (page === 'team')  window.loadTeam && window.loadTeam();

    if (page === 'dubin') {
        initDubinPanel(state.isAdmin, canAccessDubin(state.userData));
        if (canAccessDubin(state.userData)) window.renderDubinProjects && window.renderDubinProjects();
    }

    if (page === 'ratings') {
        window.loadRatingsPage && window.loadRatingsPage();
    }

    if (page === 'profile' && state.userData) {
        window.loadMyLists && window.loadMyLists();
    }

    if (page === 'playlists') {
        if (!state.userData) { navigate('profile', pushState); return; }
        window.loadPlaylistsPage && window.loadPlaylistsPage();
    }
};

// ── Обновление sidebar видимости ──
function updateSidebarVisibility() {
    const dubinLink   = document.getElementById('sn-dubin');
    const ratingsLink = document.getElementById('sn-ratings');

    if (dubinLink) {
        dubinLink.style.display = canAccessDubin(state.userData) ? 'flex' : 'none';
    }
    if (ratingsLink) {
        ratingsLink.style.display = canAccessRatings(state.userData) ? 'flex' : 'none';
    }
}

onAuthStateChanged(auth, async function(user) {
    if (user) {
        try {
            const snap = await getDoc(doc(db, 'users', user.uid));
            if (snap.exists()) {
                state.userData  = snap.data();
                state.isAdmin   = state.userData.role === 'admin';
                state.isDub     = state.userData.role === 'dub' || state.isAdmin;
                state.isMod     = state.userData.role === 'moderator';
                state.isCurator = state.userData.role === 'curator';
                applyUserUI(state.userData, state.isAdmin, canAccessDubin(state.userData));
                renderAchProfile(state.userData);
            } else {
                resetUserUI();
            }
        } catch(e) {
            console.error('Профиль:', e);
            resetUserUI();
        }
    } else {
        state.userData  = null;
        state.isAdmin   = false;
        state.isDub     = false;
        state.isMod     = false;
        state.isCurator = false;
        resetUserUI();
    }

    updateSidebarVisibility();
    await loadReleases(db, state.isAdmin);
    initAuthListeners(auth, db);

    const hashPage = window.location.hash.replace('#', '') || 'home';
    const targetPage = _pendingNav.length > 0 ? _pendingNav[_pendingNav.length - 1][0] : hashPage;

    const restricted = ['dubin','ratings'];
    if (restricted.includes(targetPage)) {
        if (targetPage === 'dubin' && !canAccessDubin(state.userData)) {
            window.navigate('home', false); return;
        }
        if (targetPage === 'ratings' && !canAccessRatings(state.userData)) {
            window.navigate('home', false); return;
        }
    }
    window.navigate(targetPage, false);
});

window.addEventListener('popstate', function() {
    const page = window.location.hash.replace('#', '') || 'home';
    window.navigate(page, false);
});
