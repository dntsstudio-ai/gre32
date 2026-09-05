// ============================================================
//  js/auth.js — Voice Acting Team — Авторизация
// ============================================================

import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, sendPasswordResetEmail, updatePassword, updateEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, setDoc, updateDoc, getDocs, collection, query, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { showToast, closeModals, navigate, getRoleBadgeHTML, canAccessDubin } from './core.js';
import { renderAchProfile } from './achievements.js';

let loginAttempts = 0;

function authErrorMsg(code) {
    const map = {
        'auth/email-already-in-use':   'Данный email уже занят!',
        'auth/invalid-email':          'Неверный формат email!',
        'auth/weak-password':          'Пароль слишком простой (мин. 6 символов)!',
        'auth/invalid-credential':     'Неверный пароль или email!',
        'auth/wrong-password':         'Неверный пароль!',
        'auth/user-not-found':         'Пользователь с таким email не найден!',
        'auth/too-many-requests':      'Слишком много попыток. Попробуйте позже.',
        'auth/network-request-failed': 'Ошибка сети. Проверьте подключение.',
        'auth/user-disabled':          'Этот аккаунт заблокирован.',
        'auth/requires-recent-login':  'Для этого действия войдите заново.',
    };
    return map[code] || 'Ошибка: попробуйте ещё раз.';
}

export function initAuthListeners(auth, db) {
    const btnLogin  = document.getElementById('btn-login');
    const btnReg    = document.getElementById('btn-reg');
    const btnLogout = document.getElementById('btn-logout');

    if (btnLogin && !btnLogin._bound) {
        btnLogin._bound = true;
        btnLogin.onclick = async function() {
            const e = document.getElementById('email')?.value.trim();
            const p = document.getElementById('pass')?.value;
            if (!e || !p) return showToast('Введите email и пароль!', 'error');
            try {
                await signInWithEmailAndPassword(auth, e, p);
                showToast('Вход выполнен!');
                loginAttempts = 0;
            } catch(err) {
                loginAttempts++;
                if (loginAttempts >= 3) {
                    const rb = document.getElementById('reset-pass-block');
                    if (rb) rb.style.display = 'block';
                }
                showToast(authErrorMsg(err.code), 'error');
            }
        };
    }

    if (btnReg && !btnReg._bound) {
        btnReg._bound = true;
        btnReg.onclick = async function() {
            const e = document.getElementById('email')?.value.trim();
            const p = document.getElementById('pass')?.value;
            if (!e || !p || p.length < 6) return showToast('Email и пароль (мин. 6 символов)!', 'error');
            try {
                const cred = await createUserWithEmailAndPassword(auth, e, p);
                await setDoc(doc(db, 'users', cred.user.uid), {
                    nickname:       'User_' + Math.floor(Math.random() * 10000),
                    email:          e,
                    role:           'user',
                    views:          0,
                    subscribers:    0,
                    vcoins:         0,
                    publicBio:      '',
                    publicLink:     '',
                    curatorProject: '',
                    createdAt:      Date.now(),
                    achievements: [{
                        id: 'newcomer', name: 'Новичок',
                        desc: 'Зарегистрировался на сайте',
                        img: '<i class="fas fa-hand"></i>', date: Date.now(),
                        hidden: false, giver: 'Система'
                    }]
                });
                showToast('Регистрация успешна!');
            } catch(err) {
                showToast(authErrorMsg(err.code), 'error');
            }
        };
    }

    if (btnLogout && !btnLogout._bound) {
        btnLogout._bound = true;
        btnLogout.onclick = function() {
            signOut(auth).then(function() {
                showToast('Вы вышли');
                navigate('home');
            }).catch(e => showToast('Ошибка выхода: ' + e.message, 'error'));
        };
    }
}

export function applyUserUI(userData, isAdmin, hasDubAccess) {
    // Переключаем auth/user блоки
    const authUi = document.getElementById('auth-ui');
    const userUi = document.getElementById('user-ui');
    if (authUi) authUi.style.display = 'none';
    if (userUi) userUi.style.display = 'block';

    // Комменты
    const commForm    = document.getElementById('comm-form');
    const commAuthMsg = document.getElementById('comm-auth-msg');
    if (commForm)    commForm.style.display    = 'block';
    if (commAuthMsg) commAuthMsg.style.display = 'none';

    // Основные поля профиля
    const uNick  = document.getElementById('u-nick');
    const edNick = document.getElementById('ed-nick');
    const uAva   = document.getElementById('u-ava');
    const edAva  = document.getElementById('ed-ava');
    const uRole  = document.getElementById('u-role-badge');
    const uViews = document.getElementById('u-views');
    const uSubs  = document.getElementById('u-subs');
    const uVC    = document.getElementById('u-vcoins');
    const prefEl = document.getElementById('u-nick-prefix');

    if (uNick)  uNick.innerText  = userData.nickname || '';
    if (edNick) edNick.value     = userData.nickname || '';
    if (uAva)   uAva.src         = userData.avatar   || 'https://api.dicebear.com/7.x/identicon/svg';
    if (edAva)  edAva.value      = userData.avatar   || '';
    if (uRole)  uRole.innerHTML  = getRoleBadgeHTML(userData.role, userData.curatorProject);
    if (uViews) uViews.innerText = userData.views     || 0;
    if (uSubs)  uSubs.innerText  = userData.subscribers || 0;
    if (uVC)    uVC.textContent  = userData.vcoins    || 0;

    // Цвет ника
    if (uNick && userData.nickColor) uNick.style.color = userData.nickColor;

    // Префикс
    if (prefEl) {
        if (userData.activePrefix) {
            prefEl.textContent   = '[' + userData.activePrefix + ']';
            prefEl.style.display = 'inline';
        } else {
            prefEl.style.display = 'none';
        }
    }

    // Публичный профиль
    const pubBio  = document.getElementById('pub-bio');
    const pubLink = document.getElementById('pub-link');
    if (pubBio)  pubBio.value  = userData.publicBio  || '';
    if (pubLink) pubLink.value = userData.publicLink  || '';

    renderAchProfile(userData);

    // Admin кнопки
    const setDsp = (id, show, displayType) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? (displayType || 'inline-flex') : 'none';
    };
    setDsp('adm-btn-rel',      isAdmin);
    setDsp('adm-btn-team',     isAdmin);
    setDsp('adm-btn-role',     isAdmin);
    setDsp('btn-admin-roles',  isAdmin);
    setDsp('btn-admin-vcoins', isAdmin);

    const admAch = document.getElementById('adm-ach-panel');
    if (admAch) admAch.style.display = isAdmin ? 'block' : 'none';

    // Sidebar
    const sideItems = [
        ['sn-playlists', true, 'flex'],
        ['sn-shop',      true, 'flex'],
        ['notif-btn',    true, 'flex'],
    ];
    sideItems.forEach(([id, show, dt]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? dt : 'none';
    });

    // VCoins баланс в sidebar
    const shopBal = document.getElementById('sn-shop-balance');
    if (shopBal) shopBal.textContent = userData.vcoins || 0;
}

export function resetUserUI() {
    const authUi = document.getElementById('auth-ui');
    const userUi = document.getElementById('user-ui');
    if (authUi) authUi.style.display = 'block';
    if (userUi) userUi.style.display = 'none';

    const commForm    = document.getElementById('comm-form');
    const commAuthMsg = document.getElementById('comm-auth-msg');
    if (commForm)    commForm.style.display    = 'none';
    if (commAuthMsg) commAuthMsg.style.display = 'block';

    ['adm-btn-rel','adm-btn-team','adm-btn-role','adm-ach-panel',
     'btn-admin-roles','btn-admin-vcoins',
     'sn-playlists','sn-shop','notif-btn'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

export function bindAuthActions(auth, db, getState) {
    window.resetPassword = async function() {
        const e = document.getElementById('email')?.value.trim();
        if (!e) return showToast('Введите email!', 'error');
        try {
            await sendPasswordResetEmail(auth, e);
            showToast('Письмо отправлено!');
        } catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };

    window.changeUserEmail = async function() {
        const newEmail = document.getElementById('ed-new-email')?.value.trim();
        if (!newEmail) return showToast('Введите новый email!', 'error');
        try {
            await updateEmail(auth.currentUser, newEmail);
            showToast('Email изменён!');
            closeModals();
        } catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };

    window.changeUserPass = async function() {
        const newPass = document.getElementById('ed-new-pass')?.value;
        if (!newPass || newPass.length < 6) return showToast('Минимум 6 символов!', 'error');
        try {
            await updatePassword(auth.currentUser, newPass);
            showToast('Пароль изменён!');
            closeModals();
        } catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };

    window.saveProfile = async function() {
        const { userData } = getState();
        const nick = document.getElementById('ed-nick')?.value.trim();
        const ava  = document.getElementById('ed-ava')?.value.trim();
        if (!nick) return showToast('Введите никнейм!', 'error');
        if (!auth.currentUser) return showToast('Вы не авторизованы!', 'error');
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('nickname', '==', nick)));
            if (!snap.empty && nick !== userData.nickname) return showToast('Этот никнейм занят!', 'error');
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { nickname: nick, avatar: ava });
            if (userData) { userData.nickname = nick; userData.avatar = ava; }
            const uNick = document.getElementById('u-nick');
            const uAva  = document.getElementById('u-ava');
            if (uNick) uNick.innerText = nick;
            if (uAva)  uAva.src        = ava || 'https://api.dicebear.com/7.x/identicon/svg';
            showToast('Профиль обновлён!');
            closeModals();
        } catch(err) { showToast('Ошибка: ' + err.message, 'error'); }
    };
}
