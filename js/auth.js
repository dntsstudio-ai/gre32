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
    document.getElementById('btn-login').onclick = async function() {
        const e = document.getElementById('email').value.trim();
        const p = document.getElementById('pass').value;
        try {
            await signInWithEmailAndPassword(auth, e, p);
            showToast('Вход выполнен!'); loginAttempts = 0;
        } catch(err) {
            loginAttempts++;
            if (loginAttempts >= 3) document.getElementById('reset-pass-block').style.display = 'block';
            showToast(authErrorMsg(err.code), 'error');
        }
    };
    document.getElementById('btn-reg').onclick = async function() {
        const e = document.getElementById('email').value.trim();
        const p = document.getElementById('pass').value;
        if (!e || p.length < 6) return showToast('Email и пароль (мин. 6 символов)!','error');
        try {
            const cred = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db,'users',cred.user.uid), {
                nickname: 'User_' + Math.floor(Math.random()*10000),
                email: e, role: 'user', views: 0, subscribers: 0,
                publicBio: '', publicLink: '', curatorProject: '',
                achievements: [{ id:'newcomer', name:'Новичок', desc:'Зарегистрировался на сайте', img:'👋', date: Date.now(), hidden: false, giver:'Система' }]
            });
            showToast('Регистрация успешна!');
        } catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };
    document.getElementById('btn-logout').onclick = function() {
        signOut(auth).then(function(){ showToast('Вы вышли'); navigate('home'); });
    };
}

export function applyUserUI(userData, isAdmin, hasDubAccess) {
    document.getElementById('auth-ui').style.display        = 'none';
    document.getElementById('user-ui').style.display        = 'block';
    document.getElementById('comm-form').style.display      = 'block';
    document.getElementById('comm-auth-msg').style.display  = 'none';

    document.getElementById('u-nick').innerText  = userData.nickname;
    document.getElementById('ed-nick').value     = userData.nickname;
    document.getElementById('u-ava').src         = userData.avatar||'https://api.dicebear.com/7.x/identicon/svg';
    document.getElementById('ed-ava').value      = userData.avatar||'';
    document.getElementById('u-role-badge').innerHTML = getRoleBadgeHTML(userData.role, userData.curatorProject);
    document.getElementById('u-views').innerText = userData.views||0;
    document.getElementById('u-subs').innerText  = userData.subscribers||0;

    renderAchProfile(userData);

    document.getElementById('adm-btn-rel').style.display   = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('adm-btn-team').style.display  = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('adm-btn-role').style.display  = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('adm-ach-panel').style.display = isAdmin ? 'block' : 'none';

    const npl = document.getElementById('sn-playlists');
    if (npl) npl.style.display = 'flex';

    const pubBio  = document.getElementById('pub-bio');
    const pubLink = document.getElementById('pub-link');
    if (pubBio)  pubBio.value  = userData.publicBio  || '';
    if (pubLink) pubLink.value = userData.publicLink || '';
}

export function resetUserUI() {
    document.getElementById('auth-ui').style.display        = 'block';
    document.getElementById('user-ui').style.display        = 'none';
    document.getElementById('comm-form').style.display      = 'none';
    document.getElementById('comm-auth-msg').style.display  = 'block';
    ['adm-btn-rel','adm-btn-team','adm-btn-role','adm-ach-panel'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const npl = document.getElementById('sn-playlists');
    if (npl) npl.style.display = 'none';
}

export function bindAuthActions(auth, db, getState) {
    window.resetPassword = async function() {
        const e = document.getElementById('email').value.trim();
        if (!e) return showToast('Введите email!','error');
        try { await sendPasswordResetEmail(auth,e); showToast('Письмо отправлено!'); }
        catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };
    window.changeUserEmail = async function() {
        const newEmail = document.getElementById('ed-new-email').value.trim();
        if (!newEmail) return;
        try { await updateEmail(auth.currentUser, newEmail); showToast('Email изменён!'); closeModals(); }
        catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };
    window.changeUserPass = async function() {
        const newPass = document.getElementById('ed-new-pass').value;
        if (!newPass||newPass.length<6) return showToast('Минимум 6 символов!','error');
        try { await updatePassword(auth.currentUser, newPass); showToast('Пароль изменён!'); closeModals(); }
        catch(err) { showToast(authErrorMsg(err.code), 'error'); }
    };
    window.saveProfile = async function() {
        const { userData } = getState();
        const nick = document.getElementById('ed-nick').value.trim();
        const ava  = document.getElementById('ed-ava').value.trim();
        if (!nick) return showToast('Введите никнейм!','error');
        const snap = await getDocs(query(collection(db,'users'), where('nickname','==',nick)));
        if (!snap.empty && nick !== userData.nickname) return showToast('Этот никнейм занят!','error');
        await updateDoc(doc(db,'users',auth.currentUser.uid),{ nickname: nick, avatar: ava });
        userData.nickname = nick; userData.avatar = ava;
        document.getElementById('u-nick').innerText = nick;
        document.getElementById('u-ava').src        = ava||'https://api.dicebear.com/7.x/identicon/svg';
        showToast('Профиль обновлён!'); closeModals();
    };
}
