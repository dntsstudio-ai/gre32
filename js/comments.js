// ============================================================
//  js/comments.js — Комментарии: @упоминания по email→никнейм
// ============================================================

import {
    collection, getDocs, addDoc, deleteDoc,
    doc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast } from './core.js';
import { checkAndAwardAch } from './achievements.js';

// ── Загрузка и рендер комментариев ──
export async function loadComments(db, auth, curProj, userData, isAdmin) {
    const snap = await getDocs(
        query(collection(db, `releases/${curProj.id}/comments`), orderBy('time','desc'))
    );
    document.getElementById('comm-count').innerText = snap.size;
    document.getElementById('comm-list').innerHTML = snap.docs.map(d => {
        const c    = d.data();
        // Упоминания хранятся как @никнейм (уже разрешённые при отправке)
        const text = esc(c.text).replace(/@([\wа-яА-ЯёЁ_-]+)/g,
            `<a href="#" class="mention-link" onclick="openUserProfileByName('$1');return false;">@$1</a>`);
        const canDel = isAdmin || (userData && c.uid === auth.currentUser?.uid);
        return `<div class="comm-item">
            <img src="${esc(c.ava)||'https://api.dicebear.com/7.x/identicon/svg'}"
                 class="comm-ava" style="cursor:pointer;" onclick="openUserProfile('${c.uid}')">
            <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px;">
                    <b style="font-size:14px;cursor:pointer;" onclick="openUserProfile('${c.uid}')">${esc(c.nick)}</b>
                    <span style="font-size:10px;color:var(--text-dim);">${new Date(c.time).toLocaleString()}</span>
                </div>
                <p style="font-size:13px;margin-top:5px;word-break:break-word;line-height:1.5;">${text}</p>
                ${canDel ? `<button class="btn-sm" style="background:transparent;color:red;margin-top:5px;padding:0;"
                    onclick="delComm('${d.id}')">Удалить</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Разрешить @email → никнейм перед сохранением ──
async function resolveEmailMentions(db, text) {
    // Ищем @что-то@домен.зона (email pattern)
    const emailPattern = /@([\w.+-]+@[\w.-]+\.\w+)/g;
    let resolved = text;
    const matches = [...text.matchAll(emailPattern)];
    for (const m of matches) {
        const email = m[1];
        try {
            const snap = await getDocs(query(collection(db,'users'), where('email','==',email)));
            if (!snap.empty) {
                const nick = snap.docs[0].data().nickname;
                resolved = resolved.replace('@' + email, '@' + nick);
            }
        } catch (e) { /* оставляем как есть */ }
    }
    return resolved;
}

export function bindComments(db, auth, getState) {
    window.sendComment = async () => {
        const { curProj, userData, isAdmin } = getState();
        if (!curProj || !userData) return showToast('Войдите, чтобы оставить комментарий', 'error');
        const rawText = document.getElementById('comm-text').value.trim();
        if (!rawText) return;
        // Разрешаем @email → @никнейм
        const text = await resolveEmailMentions(db, rawText);
        await addDoc(collection(db, `releases/${curProj.id}/comments`), {
            uid: auth.currentUser.uid, nick: userData.nickname,
            ava: userData.avatar||'', text, time: Date.now()
        });
        document.getElementById('comm-text').value = '';
        await loadComments(db, auth, curProj, userData, isAdmin);
        showToast('Комментарий отправлен!');
        // Авто-ачивка
        await checkAndAwardAch(db, auth, userData, 'comment_1');
    };

    window.delComm = async (id) => {
        if (!confirm('Удалить комментарий?')) return;
        const { curProj, userData, isAdmin } = getState();
        await deleteDoc(doc(db, `releases/${curProj.id}/comments`, id));
        await loadComments(db, auth, curProj, userData, isAdmin);
        showToast('Удалено');
    };
}
