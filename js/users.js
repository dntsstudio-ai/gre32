// ============================================================
//  js/users.js — Профили, подписки, роли
// ============================================================

import {
    doc, getDoc, getDocs, updateDoc, collection,
    query, where, increment, arrayUnion, arrayRemove, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate, getRoleBadgeHTML } from './core.js?v=20260906b';
import { checkAndAwardAch } from './achievements.js?v=20260906b';

export function bindUsers(db, auth, getState) {

    window.openUserProfile = async function(uid) {
        const { userData } = getState();
        if (userData && uid === auth.currentUser?.uid) { navigate('profile'); return; }
        closeModals();
        try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (!snap.exists()) return showToast('Пользователь не найден', 'error');
            const u = snap.data();

            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el[typeof val === 'string' && val.includes('<') ? 'innerHTML' : 'innerText'] = val; };

            const avaEl = document.getElementById('mu-ava');
            if (avaEl) avaEl.src = u.avatar || 'https://api.dicebear.com/7.x/identicon/svg';

            setEl('mu-nick', u.nickname || '');
            const roleEl = document.getElementById('mu-role-badge');
            if (roleEl) roleEl.innerHTML = getRoleBadgeHTML(u.role, u.curatorProject);
            setEl('mu-views-count', u.views || 0);
            setEl('mu-subs-count',  u.subscribers || 0);

            const pubBio  = document.getElementById('mu-bio');
            if (pubBio)  pubBio.innerText  = u.publicBio  || '';
            const pubLink = document.getElementById('mu-link');
            if (pubLink) {
                pubLink.href = u.publicLink || '#';
                pubLink.style.display = u.publicLink ? 'inline-flex' : 'none';
            }

            const subBtn = document.getElementById('btn-mu-sub');
            if (userData && subBtn) {
                const amISubbed = (u.subscribersList || []).includes(auth.currentUser.uid);
                subBtn.innerText = amISubbed ? 'Отписаться' : 'Подписаться';
                subBtn.className = amISubbed ? 'btn btn-outline' : 'btn';
                subBtn.onclick   = () => subscribeToUser(uid, amISubbed);
                subBtn.style.display = 'block';
            } else if (subBtn) {
                subBtn.style.display = 'none';
            }

            const { isAdmin } = getState();
            const isMod = userData && userData.role === 'moderator';
            const reportBtn = document.getElementById('btn-report-user');
            if (reportBtn) {
                reportBtn.style.display = (isMod || isAdmin) ? 'block' : 'none';
                reportBtn.onclick = () => reportUser(uid, u.nickname);
            }

            const achList = document.getElementById('mu-ach-list');
            if (achList) {
                const achs = (u.achievements || []).filter(a => !a.hidden);
                achList.innerHTML = achs.map(a =>
                    `<div class="ach-chip" title="${esc(a.name)}">${a.img}</div>`
                ).join('');
            }

            document.getElementById('m-user-profile').style.display = 'flex';
        } catch(e) {
            showToast('Ошибка загрузки профиля', 'error');
            console.error('openUserProfile:', e);
        }
    };

    window.openUserProfileByName = async function(nick) {
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('nickname', '==', nick)));
            if (!snap.empty) window.openUserProfile(snap.docs[0].id);
        } catch(e) { console.error('openUserProfileByName:', e); }
    };

    const subscribeToUser = async function(targetUid, isSubbed) {
        if (!auth.currentUser) return;
        const ref = doc(db, 'users', targetUid);
        try {
            if (isSubbed) {
                await updateDoc(ref, { subscribers: increment(-1), subscribersList: arrayRemove(auth.currentUser.uid) });
            } else {
                await updateDoc(ref, { subscribers: increment(1),  subscribersList: arrayUnion(auth.currentUser.uid)  });
            }
            showToast(isSubbed ? 'Вы отписались' : 'Вы подписались!');
            window.openUserProfile(targetUid);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.showMySubscribers = async function() {
        if (!auth.currentUser) return;
        try {
            const uDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const subs = uDoc.data()?.subscribersList || [];
            if (!subs.length) return showToast('Пока нет подписчиков');
            const list = document.getElementById('subs-list');
            if (!list) return;
            list.innerHTML = '';
            for (const sid of subs) {
                const sd = await getDoc(doc(db, 'users', sid));
                if (sd.exists()) {
                    list.innerHTML += `<div style="padding:10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
                        <img src="${esc(sd.data().avatar || 'https://api.dicebear.com/7.x/identicon/svg')}"
                             style="width:35px;height:35px;border-radius:50%;object-fit:cover;"
                             onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                        <b style="cursor:pointer;color:var(--accent);"
                           onclick="closeModals();openUserProfile('${sid}')">${esc(sd.data().nickname)}</b>
                    </div>`;
                }
            }
            document.getElementById('m-subs').style.display = 'flex';
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.savePublicProfile = async function() {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        const bio  = document.getElementById('pub-bio')?.value.trim()  || '';
        const link = document.getElementById('pub-link')?.value.trim() || '';
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { publicBio: bio, publicLink: link });
            userData.publicBio  = bio;
            userData.publicLink = link;
            showToast('Публичный профиль обновлён!');
            closeModals();
            await checkAndAwardAch(db, auth, userData, 'profile_ok');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    // ── Роли ──
    window.openRoleModal = function() {
        const emailEl = document.getElementById('role-email');
        if (emailEl) emailEl.value = '';
        const block = document.getElementById('curator-project-block');
        if (block) block.style.display = 'none';
        const sel = document.getElementById('role-select');
        if (sel) sel.value = 'moderator';
        document.getElementById('m-role').style.display = 'flex';
    };

    window.onRoleSelectChange = function() {
        const sel   = document.getElementById('role-select');
        const block = document.getElementById('curator-project-block');
        if (block) block.style.display = (sel && sel.value === 'curator') ? 'block' : 'none';
    };

    window.assignRole = async function() {
        const { isAdmin } = getState();
        if (!isAdmin) return showToast('Нет прав!', 'error');
        const email = document.getElementById('role-email')?.value.trim();
        const role  = document.getElementById('role-select')?.value;
        if (!email) return showToast('Введите email!', 'error');
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (snap.empty) return showToast('Пользователь не найден!', 'error');
            const targetData = snap.docs[0].data();
            if (targetData.role === 'admin') return showToast('Нельзя менять роль администратора!', 'error');

            const updates = { role };
            if (role === 'curator') {
                const proj = document.getElementById('curator-project-name')?.value.trim() || '';
                if (!proj) return showToast('Укажите название проекта!', 'error');
                updates.curatorProject = proj;
            } else {
                updates.curatorProject = '';
            }

            await updateDoc(doc(db, 'users', snap.docs[0].id), updates);
            showToast('Роль "' + role + '" назначена!');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.removeRole = async function() {
        const { isAdmin } = getState();
        if (!isAdmin) return showToast('Нет прав!', 'error');
        const email = document.getElementById('role-email')?.value.trim();
        if (!email) return showToast('Введите email!', 'error');
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (snap.empty) return showToast('Пользователь не найден!', 'error');
            const targetData = snap.docs[0].data();
            if (targetData.role === 'admin') return showToast('Нельзя снять роль администратора!', 'error');
            if (targetData.role === 'user')  return showToast('Пользователь уже без роли', 'info');
            await updateDoc(doc(db, 'users', snap.docs[0].id), { role: 'user', curatorProject: '' });
            showToast('Роль снята.');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    const reportUser = async function(uid, nick) {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        if (!confirm('Пожаловаться на пользователя @' + nick + '?')) return;
        try {
            await addDoc(collection(db, 'reports'), {
                type: 'user', targetUid: uid, targetNick: nick,
                reportedBy: userData.nickname, reporterUid: auth.currentUser.uid,
                date: Date.now(), status: 'new'
            });
            showToast('Жалоба отправлена', 'info');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.reportComment = async function(commentId, relId) {
        const { userData } = getState();
        if (!userData) return showToast('Войдите для отправки жалобы', 'error');
        if (!confirm('Пожаловаться на этот комментарий?')) return;
        try {
            await addDoc(collection(db, 'reports'), {
                type: 'comment', commentId, relId,
                reportedBy: userData.nickname, reporterUid: auth.currentUser.uid,
                date: Date.now(), status: 'new'
            });
            showToast('Жалоба отправлена', 'info');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
