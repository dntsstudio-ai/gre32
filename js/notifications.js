// ============================================================
//  js/notifications.js — Push-уведомления + in-app уведомления
// ============================================================

import {
    collection, addDoc, getDocs, updateDoc, deleteDoc,
    doc, query, orderBy, where, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast } from './core.js';

let _db, _auth, _getState;
let _unsubNotifs = null;

// ── Запросить разрешение на push ──
export async function requestPushPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
}

// ── Показать push-уведомление ──
export function sendPushNotif(title, body, icon) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, {
            body: body || '',
            icon: icon || 'img/logo.jpg',
            badge: 'img/logo.jpg'
        });
    } catch(e) {}
}

// ── Подписаться на уведомления в реальном времени ──
export function listenNotifications(uid) {
    if (_unsubNotifs) { _unsubNotifs(); _unsubNotifs = null; }
    if (!uid || !_db) return;
    _unsubNotifs = onSnapshot(
        query(collection(_db, `users/${uid}/notifications`),
              orderBy('date', 'desc'), limit(20)),
        function(snap) {
            const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderNotifBadge(notifs.filter(n => !n.read).length);
            renderNotifList(notifs);
        },
        function(err) { console.warn('listenNotifications error:', err); }
    );
}

function renderNotifBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderNotifList(notifs) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifs.length) {
        list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет уведомлений</p>';
        return;
    }
    list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? 'notif-item--read' : ''}" onclick="markNotifRead('${n.id}')">
            <span class="notif-icon">${n.icon || '🔔'}</span>
            <div class="notif-body">
                <p class="notif-text">${esc(n.text)}</p>
                <span class="notif-date">${new Date(n.date).toLocaleString('ru', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
            ${!n.read ? '<span class="notif-dot"></span>' : ''}
        </div>`).join('');
}

window.markNotifRead = async function(id) {
    const uid = _auth?.currentUser?.uid;
    if (!uid || !_db) return;
    try {
        await updateDoc(doc(_db, `users/${uid}/notifications`, id), { read: true });
    } catch(e) { console.warn('markNotifRead:', e); }
};

window.markAllNotifsRead = async function() {
    const uid = _auth?.currentUser?.uid;
    if (!uid || !_db) return;
    try {
        const snap = await getDocs(query(
            collection(_db, `users/${uid}/notifications`),
            where('read', '==', false)
        ));
        const promises = snap.docs.map(d => updateDoc(d.ref, { read: true }));
        await Promise.all(promises);
        showToast('Всё прочитано');
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
};

// ── Отправить уведомление пользователю ──
export async function notifyUser(targetUid, icon, text, pushTitle) {
    if (!_db) return;
    try {
        await addDoc(collection(_db, `users/${targetUid}/notifications`), {
            icon, text, date: Date.now(), read: false
        });
        if (_auth?.currentUser?.uid === targetUid) {
            sendPushNotif(pushTitle || 'Voice Acting Team', text, 'img/logo.jpg');
        }
    } catch(e) { console.warn('notifyUser:', e); }
}

// ── Уведомить подписчиков релиза ──
export async function notifyNewEpisode(db, releaseId, releaseTitle, epName) {
    try {
        const snap = await getDocs(
            query(collection(db, 'releaseSubscribers'),
                  where('releaseId', '==', releaseId))
        );
        const uids = snap.docs.map(d => d.data().uid);
        const promises = uids.map(uid => notifyUser(uid, '🎬',
            'Новая серия в «' + releaseTitle + '»: ' + epName,
            'Новая серия — ' + releaseTitle
        ));
        await Promise.all(promises);
    } catch(e) { console.warn('notifyNewEpisode:', e); }
}

// ── Подписка/отписка на релиз ──
window.toggleReleaseSubscription = async function(releaseId, releaseTitle) {
    const uid = _auth?.currentUser?.uid;
    if (!uid) return showToast('Войдите в аккаунт', 'error');
    if (!_db) return;
    try {
        const q = query(collection(_db, 'releaseSubscribers'),
                        where('releaseId', '==', releaseId),
                        where('uid', '==', uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            // FIX: используем deleteDoc импортированный напрямую
            await deleteDoc(snap.docs[0].ref);
            showToast('Уведомления отключены');
            const btn = document.getElementById('btn-rel-subscribe');
            if (btn) { btn.classList.remove('btn-active'); btn.innerHTML = '<i class="fas fa-bell"></i> Уведомлять о сериях'; }
        } else {
            await addDoc(collection(_db, 'releaseSubscribers'), { releaseId, releaseTitle, uid, date: Date.now() });
            const perm = await requestPushPermission();
            if (!perm) showToast('Разрешите уведомления в браузере', 'info');
            showToast('🔔 Вы подписались на новые серии!');
            const btn = document.getElementById('btn-rel-subscribe');
            if (btn) { btn.classList.add('btn-active'); btn.innerHTML = '<i class="fas fa-bell-slash"></i> Отписаться'; }
        }
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); console.error(e); }
};

export function bindNotifications(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.openNotifPanel = function() {
        document.getElementById('m-notifications').style.display = 'flex';
    };
}
