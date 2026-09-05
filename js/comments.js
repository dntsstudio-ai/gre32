// ============================================================
//  js/comments.js — Комментарии: @упоминания
// ============================================================

import {
    collection, getDocs, addDoc, deleteDoc,
    doc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast } from './core.js?v=20260905a';
import { checkAndAwardAch } from './achievements.js?v=20260905a';

export async function loadComments(db, auth, curProj, userData, isAdmin) {
    if (!curProj) return;
    try {
        const snap = await getDocs(
            query(collection(db, `releases/${curProj.id}/comments`), orderBy('time', 'desc'))
        );
        const countEl = document.getElementById('comm-count');
        const listEl  = document.getElementById('comm-list');
        if (countEl) countEl.innerText = snap.size;
        if (!listEl) return;

        listEl.innerHTML = snap.docs.map(d => {
            const c    = d.data();
            const text = esc(c.text).replace(/@([\wа-яА-ЯёЁ_-]+)/g,
                `<a href="#" class="mention-link" onclick="openUserProfileByName('$1');return false;">@$1</a>`);
            const canDel = isAdmin || (userData && c.uid === auth.currentUser?.uid);
            return `<div class="comm-item">
                <img src="${esc(c.ava) || 'https://api.dicebear.com/7.x/identicon/svg'}"
                     class="comm-ava" style="cursor:pointer;" onclick="openUserProfile('${c.uid}')"
                     onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px;">
                        <b style="font-size:14px;cursor:pointer;" onclick="openUserProfile('${c.uid}')">${esc(c.nick)}</b>
                        <span style="font-size:10px;color:var(--text-dim);">${new Date(c.time).toLocaleString()}</span>
                    </div>
                    <p style="font-size:13px;margin-top:5px;word-break:break-word;line-height:1.5;">${text}</p>
                    ${canDel ? `<button class="btn-sm" style="background:transparent;color:red;margin-top:5px;padding:0;border:none;cursor:pointer;"
                        onclick="delComm('${d.id}')">Удалить</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.error('loadComments:', e); }
}

async function resolveEmailMentions(db, text) {
    const emailPattern = /@([\w.+-]+@[\w.-]+\.\w+)/g;
    let resolved = text;
    const matches = [...text.matchAll(emailPattern)];
    for (const m of matches) {
        const email = m[1];
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (!snap.empty) {
                const nick = snap.docs[0].data().nickname;
                resolved = resolved.replace('@' + email, '@' + nick);
            }
        } catch(e) { /* оставляем как есть */ }
    }
    return resolved;
}

export function bindComments(db, auth, getState) {
    window.sendComment = async () => {
        const { curProj, userData, isAdmin } = getState();
        if (!curProj || !userData) return showToast('Войдите, чтобы оставить комментарий', 'error');
        const textEl = document.getElementById('comm-text');
        const rawText = textEl?.value.trim();
        if (!rawText) return;

        try {
            const text = await resolveEmailMentions(db, rawText);
            await addDoc(collection(db, `releases/${curProj.id}/comments`), {
                uid:  auth.currentUser.uid,
                nick: userData.nickname,
                ava:  userData.avatar || '',
                text,
                time: Date.now()
            });
            if (textEl) textEl.value = '';
            await loadComments(db, auth, curProj, userData, isAdmin);
            showToast('Комментарий отправлен!');
            await checkAndAwardAch(db, auth, userData, 'comment_1');
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
            console.error('sendComment:', e);
        }
    };

    window.delComm = async (id) => {
        if (!confirm('Удалить комментарий?')) return;
        const { curProj, userData, isAdmin } = getState();
        if (!curProj) return;
        try {
            await deleteDoc(doc(db, `releases/${curProj.id}/comments`, id));
            await loadComments(db, auth, curProj, userData, isAdmin);
            showToast('Удалено');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
