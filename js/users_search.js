// ============================================================
//  js/users_search.js — Поиск пользователей + стена профиля
// ============================================================

import {
    collection, getDocs, getDoc, addDoc, deleteDoc,
    doc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';

let _db, _auth, _getState;
let _searchTimeout = null;

// ── Поиск пользователей ──
export function bindUserSearch(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.openFindFriends = function() {
        const inp = document.getElementById('friend-search-input');
        const res = document.getElementById('friend-search-results');
        if (inp) inp.value = '';
        if (res) res.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Введите имя для поиска</p>';
        document.getElementById('m-find-friends').style.display = 'flex';
    };

    window.onFriendSearchInput = function() {
        clearTimeout(_searchTimeout);
        _searchTimeout = setTimeout(doSearch, 400);
    };

    async function doSearch() {
        const q   = document.getElementById('friend-search-input')?.value?.trim() || '';
        const res = document.getElementById('friend-search-results');
        if (!res) return;
        if (!q || q.length < 2) {
            res.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Введите минимум 2 символа</p>';
            return;
        }
        res.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Поиск...</div>';

        try {
            // Получаем всех пользователей и фильтруем клиентской стороной для лучших результатов
            const allUsersSnap = await getDocs(collection(_db, 'users'));
            const qLower = q.toLowerCase();
            
            const results = allUsersSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(u => {
                    const nick = (u.nickname || '').toLowerCase();
                    const email = (u.email || '').toLowerCase();
                    const bio = (u.publicBio || '').toLowerCase();
                    
                    // Точное совпадение в начале имени имеет приоритет
                    if (nick.startsWith(qLower)) return true;
                    // Затем ищем в любом месте имени
                    if (nick.includes(qLower)) return true;
                    // Затем ищем в email
                    if (email.includes(qLower)) return true;
                    // И в биографии
                    if (bio.includes(qLower)) return true;
                    
                    return false;
                })
                .sort((a, b) => {
                    // Сортируем: сначала начинающиеся с поиска, потом остальные
                    const aNick = (a.nickname || '').toLowerCase();
                    const bNick = (b.nickname || '').toLowerCase();
                    const aStarts = aNick.startsWith(qLower) ? 0 : 1;
                    const bStarts = bNick.startsWith(qLower) ? 0 : 1;
                    if (aStarts !== bStarts) return aStarts - bStarts;
                    // Затем по количеству подписчиков
                    return (b.subscribers || 0) - (a.subscribers || 0);
                })
                .slice(0, 20); // Ограничиваем результаты

            if (!results.length) {
                res.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Никого не нашли 🔍</p>';
                return;
            }

            const myUid = _auth?.currentUser?.uid;
            res.innerHTML = results.map(u => {
                if (u.id === myUid) return '';
                return `<div class="friend-result-card" onclick="openUserProfile('${u.id}')">
                    <img src="${esc(u.avatar || 'https://api.dicebear.com/7.x/identicon/svg')}"
                         class="friend-result-ava" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                    <div class="friend-result-info">
                        <div class="friend-result-nick" style="${u.nickColor ? 'color:'+u.nickColor+';' : ''}">
                            ${u.activePrefix ? `<span class="nick-prefix">[${esc(u.activePrefix)}]</span>` : ''}
                            ${esc(u.nickname)}
                        </div>
                        <div class="friend-result-meta">${u.subscribers||0} подписчиков · ${u.views||0} просмотрено</div>
                        ${u.publicBio ? `<div class="friend-result-bio">${esc(u.publicBio.slice(0,60))}${u.publicBio.length>60?'…':''}</div>` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openUserProfile('${u.id}')">
                        <i class="fas fa-user"></i>
                    </button>
                </div>`;
            }).join('') || '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Никого не нашли 🔍</p>';
        } catch(e) {
            res.innerHTML = '<p style="color:#ef4444;font-size:13px;text-align:center;padding:20px;">Ошибка поиска</p>';
            console.error('doSearch:', e);
        }
    }
}

// ── Стена профиля ──
export function bindProfileWall(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.loadProfileWall = async function(targetUid) {
        if (!targetUid) return;
        const wrap = document.getElementById('profile-wall-wrap');
        if (!wrap) return;
        wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Загрузка...</p>';

        try {
            const [postsSnap, settingsSnap] = await Promise.all([
                getDocs(query(collection(_db, `users/${targetUid}/wall`), orderBy('date', 'desc'), limit(20))),
                getDoc(doc(_db, 'users', targetUid))
            ]);

            const posts        = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const { userData } = getState();
            const myUid        = auth?.currentUser?.uid;
            const isOwner      = myUid === targetUid;
            const isAdmin      = userData?.role === 'admin' || userData?.role === 'proxyadmin';
            const wallSettings = settingsSnap.data()?.wallSettings || { allowAll: true, allowFriendsOnly: false, disabled: false };

            let formHtml = '';
            if (isOwner || isAdmin) {
                formHtml = buildWallForm(targetUid, true);
            } else if (myUid && !wallSettings.disabled) {
                const canPost = wallSettings.allowFriendsOnly
                    ? (settingsSnap.data()?.subscribersList || []).includes(myUid)
                    : wallSettings.allowAll !== false;
                if (canPost) formHtml = buildWallForm(targetUid, false);
                else formHtml = '<p style="color:var(--text-dim);font-size:13px;font-style:italic;margin-bottom:16px;">Владелец закрыл стену для записей.</p>';
            }

            wrap.innerHTML = formHtml + (posts.length === 0
                ? '<p style="color:var(--text-dim);font-size:13px;font-style:italic;text-align:center;padding:20px;">Пока нет записей на стене</p>'
                : posts.map(p => renderWallPost(p, myUid, isOwner, isAdmin, targetUid)).join(''));
        } catch(e) {
            if (wrap) wrap.innerHTML = '<p style="color:#ef4444;font-size:13px;">Ошибка загрузки стены</p>';
            console.error('loadProfileWall:', e);
        }
    };

    function buildWallForm(targetUid, isOwner) {
        return `<div class="wall-form">
            <textarea id="wall-post-text" placeholder="${isOwner ? 'Напишите что-то на своей стене...' : 'Написать на стене...'}" rows="3"></textarea>
            <div class="wall-form-row">
                <label class="wall-attach-btn" title="Прикрепить фото">
                    <i class="fas fa-image"></i> Фото
                    <input type="file" accept="image/*" style="display:none;" onchange="previewWallImage(this)">
                </label>
                <div id="wall-img-preview" style="display:none;display:flex;align-items:center;gap:6px;">
                    <img id="wall-img-preview-img" style="height:60px;border-radius:8px;object-fit:cover;" src="" alt="">
                    <button class="btn btn-sm" style="background:#ef4444;border-radius:50%;width:22px;height:22px;padding:0;" onclick="clearWallImage()"><i class="fas fa-times"></i></button>
                </div>
                <button class="btn btn-sm" onclick="postToWall('${targetUid}')"><i class="fas fa-paper-plane"></i> Опубликовать</button>
            </div>
        </div>`;
    }

    function renderWallPost(p, myUid, isOwner, isAdmin, targetUid) {
        const canDel = isOwner || isAdmin || p.authorUid === myUid;
        return `<div class="wall-post" id="wpost-${p.id}">
            <div class="wall-post-header">
                <img src="${esc(p.authorAva || 'https://api.dicebear.com/7.x/identicon/svg')}" class="wall-post-ava"
                     onclick="openUserProfile('${p.authorUid}')"
                     onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                <div class="wall-post-meta">
                    <span class="wall-post-nick" onclick="openUserProfile('${p.authorUid}')">${esc(p.authorNick)}</span>
                    <span class="wall-post-date">${new Date(p.date).toLocaleString('ru', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                ${canDel ? `<button class="wall-post-del" onclick="deleteWallPost('${targetUid}','${p.id}')"><i class="fas fa-times"></i></button>` : ''}
            </div>
            ${p.text   ? `<p class="wall-post-text">${esc(p.text).replace(/\n/g, '<br>')}</p>` : ''}
            ${p.imgUrl ? `<img src="${esc(p.imgUrl)}" class="wall-post-img" loading="lazy" onerror="this.style.display='none'">` : ''}
        </div>`;
    }

    window.previewWallImage = function(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return showToast('Фото не более 5 МБ', 'error');
        const reader = new FileReader();
        reader.onload = e => {
            const preview    = document.getElementById('wall-img-preview');
            const previewImg = document.getElementById('wall-img-preview-img');
            if (preview)    preview.style.display    = 'flex';
            if (previewImg) previewImg.src            = e.target.result;
            window._wallImgBase64 = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    window.clearWallImage = function() {
        const preview    = document.getElementById('wall-img-preview');
        const previewImg = document.getElementById('wall-img-preview-img');
        if (preview)    preview.style.display = 'none';
        if (previewImg) previewImg.src         = '';
        window._wallImgBase64 = null;
    };

    window.postToWall = async function(targetUid) {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return showToast('Войдите в аккаунт', 'error');
        const text   = document.getElementById('wall-post-text')?.value?.trim() || '';
        const imgUrl = window._wallImgBase64 || '';
        if (!text && !imgUrl) return showToast('Добавьте текст или фото', 'error');
        try {
            await addDoc(collection(_db, `users/${targetUid}/wall`), {
                text, imgUrl,
                authorUid:  auth.currentUser.uid,
                authorNick: userData.nickname,
                authorAva:  userData.avatar || '',
                date:       Date.now()
            });
            const textEl = document.getElementById('wall-post-text');
            if (textEl) textEl.value = '';
            window.clearWallImage();
            showToast('Запись добавлена!');
            window.loadProfileWall(targetUid);
        } catch(e) { showToast('Ошибка публикации: ' + e.message, 'error'); }
    };

    window.deleteWallPost = async function(targetUid, postId) {
        if (!confirm('Удалить запись?')) return;
        try {
            await deleteDoc(doc(_db, `users/${targetUid}/wall`, postId));
            showToast('Удалено');
            window.loadProfileWall(targetUid);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.saveWallSettings = async function() {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        const allowAll    = document.getElementById('wall-allow-all')?.checked    ?? true;
        const friendsOnly = document.getElementById('wall-friends-only')?.checked ?? false;
        const disabled    = document.getElementById('wall-disabled')?.checked     ?? false;
        try {
            await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js").then(async ({ updateDoc, doc: firestoreDoc }) => {
                await updateDoc(firestoreDoc(_db, 'users', auth.currentUser.uid), {
                    wallSettings: { allowAll, allowFriendsOnly: friendsOnly, disabled }
                });
            });
            showToast('Настройки стены сохранены!');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
