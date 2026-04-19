// ============================================================
//  js/users.js — Профили, подписки, роли + куратор
// ============================================================

import {
    doc, getDoc, getDocs, updateDoc, collection,
    query, where, increment, arrayUnion, arrayRemove, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate, getRoleBadgeHTML } from './core.js';
import { checkAndAwardAch } from './achievements.js';

export function bindUsers(db, auth, getState) {

    window.openUserProfile = async function(uid) {
        const { userData } = getState();
        if (userData && uid === auth.currentUser?.uid) { navigate('profile'); return; }
        const snap = await getDoc(doc(db,'users',uid));
        if (!snap.exists()) return;
        const u = snap.data();
        document.getElementById('mu-ava').src             = u.avatar||'https://api.dicebear.com/7.x/identicon/svg';
        document.getElementById('mu-nick').innerText       = u.nickname;
        document.getElementById('mu-role-badge').innerHTML = getRoleBadgeHTML(u.role, u.curatorProject);
        document.getElementById('mu-views-count').innerText= u.views||0;
        document.getElementById('mu-subs-count').innerText = u.subscribers||0;
        const pubBio  = document.getElementById('mu-bio');
        if (pubBio)  pubBio.innerText  = u.publicBio  || '';
        const pubLink = document.getElementById('mu-link');
        if (pubLink) {
            pubLink.href = u.publicLink || '#';
            pubLink.style.display = u.publicLink ? 'inline-flex' : 'none';
        }
        const subBtn = document.getElementById('btn-mu-sub');
        if (userData) {
            const amISubbed = (u.subscribersList||[]).includes(auth.currentUser.uid);
            subBtn.innerText = amISubbed ? 'Отписаться' : 'Подписаться';
            subBtn.className = amISubbed ? 'btn btn-outline' : 'btn';
            subBtn.onclick   = function() { subscribeToUser(uid, amISubbed); };
            subBtn.style.display = 'block';
        } else { subBtn.style.display = 'none'; }

        const { isAdmin } = getState();
        const isMod = userData && userData.role === 'moderator';
        const reportBtn = document.getElementById('btn-report-user');
        if (reportBtn) reportBtn.style.display = (isMod || isAdmin) ? 'block' : 'none';
        if (reportBtn) reportBtn.onclick = function() { reportUser(uid, u.nickname); };

        const achs = (u.achievements||[]).filter(function(a){ return !a.hidden; });
        document.getElementById('mu-ach-list').innerHTML = achs.map(function(a){
            return '<div class="ach-chip" title="' + esc(a.name) + '">' + a.img + '</div>';
        }).join('');
        document.getElementById('m-user-profile').style.display = 'flex';
    };

    window.openUserProfileByName = async function(nick) {
        const snap = await getDocs(query(collection(db,'users'), where('nickname','==',nick)));
        if (!snap.empty) window.openUserProfile(snap.docs[0].id);
    };

    const subscribeToUser = async function(targetUid, isSubbed) {
        const ref = doc(db,'users',targetUid);
        if (isSubbed) await updateDoc(ref,{ subscribers: increment(-1), subscribersList: arrayRemove(auth.currentUser.uid) });
        else          await updateDoc(ref,{ subscribers: increment(1),  subscribersList: arrayUnion(auth.currentUser.uid) });
        showToast(isSubbed ? 'Вы отписались' : 'Вы подписались!');
        window.openUserProfile(targetUid);
    };

    window.showMySubscribers = async function() {
        const uDoc = await getDoc(doc(db,'users',auth.currentUser.uid));
        const subs = uDoc.data().subscribersList||[];
        if (!subs.length) return showToast('Пока нет подписчиков');
        const list = document.getElementById('subs-list');
        list.innerHTML = '';
        for (var i = 0; i < subs.length; i++) {
            const sd = await getDoc(doc(db,'users',subs[i]));
            var sid = subs[i];
            if (sd.exists()) list.innerHTML += '<div style="padding:10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;"><img src="' + (sd.data().avatar||'https://api.dicebear.com/7.x/identicon/svg') + '" style="width:35px;height:35px;border-radius:50%;object-fit:cover;"><b style="cursor:pointer;color:var(--accent);" onclick="closeModals();openUserProfile(\'' + sid + '\')">' + esc(sd.data().nickname) + '</b></div>';
        }
        document.getElementById('m-subs').style.display = 'flex';
    };

    window.savePublicProfile = async function() {
        const { userData } = getState();
        if (!userData) return;
        const bio  = (document.getElementById('pub-bio')?.value  || '').trim();
        const link = (document.getElementById('pub-link')?.value || '').trim();
        await updateDoc(doc(db,'users',auth.currentUser.uid), { publicBio: bio, publicLink: link });
        userData.publicBio  = bio;
        userData.publicLink = link;
        showToast('Публичный профиль обновлён!'); closeModals();
        await checkAndAwardAch(db, auth, userData, 'profile_ok');
    };

    // ── Роли ──
    window.openRoleModal = function() {
        document.getElementById('role-email').value    = '';
        document.getElementById('curator-project-block').style.display = 'none';
        const sel = document.getElementById('role-select');
        if (sel) { sel.value = 'moderator'; }
        document.getElementById('m-role').style.display = 'flex';
    };

    // Показываем/скрываем поле проекта куратора
    window.onRoleSelectChange = function() {
        const sel = document.getElementById('role-select');
        const block = document.getElementById('curator-project-block');
        if (block) block.style.display = (sel && sel.value === 'curator') ? 'block' : 'none';
    };

    window.assignRole = async function() {
        const { isAdmin } = getState();
        if (!isAdmin) return showToast('Нет прав!','error');
        const email = document.getElementById('role-email').value.trim();
        const role  = document.getElementById('role-select').value;
        if (!email) return showToast('Введите email!','error');

        const snap = await getDocs(query(collection(db,'users'), where('email','==',email)));
        if (snap.empty) return showToast('Пользователь не найден!','error');
        const targetData = snap.docs[0].data();
        if (targetData.role === 'admin') return showToast('Нельзя менять роль администратора!','error');

        const updates = { role };
        if (role === 'curator') {
            const proj = (document.getElementById('curator-project-name')?.value || '').trim();
            if (!proj) return showToast('Укажите название проекта для куратора!','error');
            updates.curatorProject = proj;
        } else {
            updates.curatorProject = '';
        }

        await updateDoc(doc(db,'users',snap.docs[0].id), updates);
        showToast('Роль "' + role + '" назначена!'); closeModals();
    };

    window.removeRole = async function() {
        const { isAdmin } = getState();
        if (!isAdmin) return showToast('Нет прав!','error');
        const email = document.getElementById('role-email').value.trim();
        if (!email) return showToast('Введите email!','error');
        const snap = await getDocs(query(collection(db,'users'), where('email','==',email)));
        if (snap.empty) return showToast('Пользователь не найден!','error');
        const targetData = snap.docs[0].data();
        if (targetData.role === 'admin') return showToast('Нельзя снять роль администратора!','error');
        if (targetData.role === 'user')  return showToast('Пользователь уже без роли','info');
        await updateDoc(doc(db,'users',snap.docs[0].id),{ role: 'user', curatorProject: '' });
        showToast('Роль снята.'); closeModals();
    };

    const reportUser = async function(uid, nick) {
        const { userData } = getState();
        if (!userData) return;
        if (!confirm('Пожаловаться на пользователя @' + nick + '?')) return;
        await addDoc(collection(db,'reports'),{
            type:'user', targetUid:uid, targetNick:nick,
            reportedBy:userData.nickname, reporterUid:auth.currentUser.uid,
            date:Date.now(), status:'new'
        });
        showToast('Жалоба отправлена','info'); closeModals();
    };

    window.reportComment = async function(commentId, relId) {
        const { userData } = getState();
        if (!userData) return showToast('Войдите для отправки жалобы','error');
        if (!confirm('Пожаловаться на этот комментарий?')) return;
        await addDoc(collection(db,'reports'),{
            type:'comment', commentId, relId,
            reportedBy:userData.nickname, reporterUid:auth.currentUser.uid,
            date:Date.now(), status:'new'
        });
        showToast('Жалоба отправлена','info');
    };
}
