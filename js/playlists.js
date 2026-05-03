// ============================================================
//  js/playlists.js — Пользовательские плейлисты
// ============================================================

import {
    collection, getDocs, getDoc, doc,
    addDoc, setDoc, updateDoc, deleteDoc,
    query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals } from './core.js';
import { PLACEHOLDER_IMG } from '../config/config.js';

const MAX_PLAYLISTS = 50;
const MAX_PINNED    = 3;

let _db, _auth, _getState;

export function bindPlaylists(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.loadPlaylistsPage = () => loadPlaylistsPage();

    window.openPlaylist = async (plId) => { await loadPlaylistDetail(plId); };

    window.savePlaylist = async () => {
        const { userData } = getState();
        if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
        const uid  = _auth.currentUser.uid;
        const id   = document.getElementById('pl-edit-id')?.value   || '';
        const name = document.getElementById('pl-edit-name')?.value.trim() || '';
        const desc = document.getElementById('pl-edit-desc')?.value.trim() || '';
        const img  = document.getElementById('pl-edit-img')?.value.trim()  || '';
        if (!name) return showToast('Введите название!', 'error');

        try {
            const plRef = id
                ? doc(_db, `users/${uid}/playlists`, id)
                : doc(collection(_db, `users/${uid}/playlists`));

            if (!id) {
                const snap = await getDocs(collection(_db, `users/${uid}/playlists`));
                if (snap.size >= MAX_PLAYLISTS) return showToast(`Максимум ${MAX_PLAYLISTS} плейлистов`, 'error');
            }

            await setDoc(plRef, { name, desc, img, updatedAt: Date.now() }, { merge: true });
            if (!id) await updateDoc(plRef, { createdAt: Date.now(), pinned: false });

            closeModals();
            showToast(id ? 'Плейлист обновлён!' : 'Плейлист создан!');
            loadPlaylistsPage();
            window.loadMyLists?.();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.deletePlaylist = async (plId) => {
        if (!confirm('Удалить плейлист?')) return;
        const uid = _auth.currentUser?.uid;
        if (!uid) return;
        try {
            const items = await getDocs(collection(_db, `users/${uid}/playlists/${plId}/items`));
            await Promise.all(items.docs.map(d => deleteDoc(d.ref)));
            await deleteDoc(doc(_db, `users/${uid}/playlists`, plId));
            showToast('Плейлист удалён');
            loadPlaylistsPage();
            window.loadMyLists?.();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.togglePinPlaylist = async (plId) => {
        const uid = _auth.currentUser?.uid;
        if (!uid) return;
        try {
            const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
            if (!plDoc.exists()) return;
            const isPinned = plDoc.data().pinned || false;
            if (!isPinned) {
                const all = await getDocs(collection(_db, `users/${uid}/playlists`));
                const pinnedCount = all.docs.filter(d => d.data().pinned).length;
                if (pinnedCount >= MAX_PINNED) return showToast(`Можно закрепить максимум ${MAX_PINNED} плейлиста`, 'error');
            }
            await updateDoc(doc(_db, `users/${uid}/playlists`, plId), { pinned: !isPinned });
            showToast(isPinned ? 'Откреплено из профиля' : 'Закреплено в профиле ✅');
            loadPlaylistsPage();
            window.loadMyLists?.();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.removeFromPlaylist = async (plId, relId) => {
        const uid = _auth.currentUser?.uid;
        if (!uid) return;
        try {
            await deleteDoc(doc(_db, `users/${uid}/playlists/${plId}/items`, relId));
            showToast('Убрано из плейлиста');
            loadPlaylistDetail(plId);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openAddToPlaylist = async (relId, relTitle, relImg) => {
        if (!relTitle && window._curProjData) {
            relTitle = window._curProjData.title || '';
            relImg   = window._curProjData.img   || '';
        }
        const { userData } = getState();
        if (!userData || !_auth.currentUser) return showToast('Войдите в аккаунт', 'error');
        const uid = _auth.currentUser.uid;

        try {
            const snap = await getDocs(query(collection(_db, `users/${uid}/playlists`), orderBy('createdAt', 'desc')));
            const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const listEl = document.getElementById('atp-list');
            if (!listEl) return;

            if (!lists.length) {
                listEl.innerHTML = `<p style="font-size:13px;color:var(--text-dim);text-align:center;padding:20px 0;">У вас нет плейлистов.<br>Создайте первый!</p>`;
            } else {
                const inLists = new Set();
                for (const pl of lists) {
                    try {
                        const itemDoc = await getDoc(doc(_db, `users/${uid}/playlists/${pl.id}/items`, relId));
                        if (itemDoc.exists()) inLists.add(pl.id);
                    } catch(e) {}
                }
                listEl.innerHTML = lists.map(pl => `
                    <div class="atp-item ${inLists.has(pl.id) ? 'atp-item--in' : ''}"
                         onclick="toggleRelInPlaylist('${pl.id}','${relId}','${esc(relTitle)}','${esc(relImg)}')">
                        <div class="atp-item-cover">
                            ${pl.img ? `<img src="${esc(pl.img)}" onerror="this.style.display='none'" alt="">` : '<i class="fas fa-list" style="color:var(--text-dim);font-size:18px;"></i>'}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.name)}</div>
                            <div style="font-size:11px;color:var(--text-dim);">${pl.desc ? esc(pl.desc) : 'Без описания'}</div>
                        </div>
                        <i class="fas fa-${inLists.has(pl.id) ? 'check-circle' : 'plus-circle'}"
                           style="color:${inLists.has(pl.id) ? 'var(--teal)' : 'var(--text-dim)'};font-size:18px;flex-shrink:0;"></i>
                    </div>`).join('');
            }

            const setHid = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            setHid('atp-rel-id', relId); setHid('atp-rel-title', relTitle); setHid('atp-rel-img', relImg);
            document.getElementById('m-add-to-playlist').style.display = 'flex';
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.toggleRelInPlaylist = async (plId, relId, relTitle, relImg) => {
        const uid = _auth.currentUser?.uid;
        if (!uid) return;
        try {
            const itemRef = doc(_db, `users/${uid}/playlists/${plId}/items`, relId);
            const snap    = await getDoc(itemRef);
            if (snap.exists()) {
                await deleteDoc(itemRef);
                showToast('Убрано из плейлиста');
            } else {
                await setDoc(itemRef, { relId, title: relTitle, img: relImg, addedAt: Date.now() });
                const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
                if (plDoc.exists() && !plDoc.data().img && relImg) {
                    await updateDoc(doc(_db, `users/${uid}/playlists`, plId), { img: relImg });
                }
                showToast('Добавлено в плейлист ✅');
            }
            const relTitle2 = document.getElementById('atp-rel-title')?.value || relTitle;
            const relImg2   = document.getElementById('atp-rel-img')?.value   || relImg;
            await window.openAddToPlaylist(relId, relTitle2, relImg2);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openPlaylistModal = (plId='', name='', desc='', img='') => {
        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setV('pl-edit-id',   plId);
        setV('pl-edit-name', name);
        setV('pl-edit-desc', desc);
        setV('pl-edit-img',  img);
        const titleEl = document.getElementById('pl-modal-title');
        if (titleEl) titleEl.textContent = plId ? 'Редактировать плейлист' : 'Новый плейлист';
        updatePlaylistImgPreview(img);
        document.getElementById('m-playlist-edit').style.display = 'flex';
    };

    window.updatePlaylistImgPreview = (url) => {
        const prev = document.getElementById('pl-img-preview');
        if (!prev) return;
        if (url && url.startsWith('http')) {
            prev.src = url; prev.style.display = 'block';
            prev.onerror = () => { prev.style.display = 'none'; };
        } else { prev.style.display = 'none'; }
    };
}

async function loadPlaylistsPage() {
    const uid = _auth?.currentUser?.uid;
    if (!uid) return;
    const wrap = document.getElementById('playlists-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Загрузка...</p>';

    try {
        const snap = await getDocs(query(collection(_db, `users/${uid}/playlists`), orderBy('createdAt', 'desc')));
        const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const counts = {};
        for (const pl of lists) {
            try {
                const items = await getDocs(collection(_db, `users/${uid}/playlists/${pl.id}/items`));
                counts[pl.id] = items.size;
            } catch(e) { counts[pl.id] = 0; }
        }

        if (!lists.length) {
            wrap.innerHTML = `<div class="pl-empty">
                <i class="fas fa-layer-group"></i>
                <p>Нет плейлистов</p>
                <span>Создайте первый и добавляйте релизы</span>
            </div>`;
            return;
        }

        wrap.innerHTML = lists.map(pl => `
        <div class="pl-card">
            <div class="pl-card-cover" onclick="openPlaylist('${pl.id}')">
                ${pl.img ? `<img src="${esc(pl.img)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">` : ''}
                <div class="pl-card-cover-placeholder" style="${pl.img?'display:none;':''}">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="pl-card-count">${counts[pl.id] || 0} релизов</div>
                ${pl.pinned ? '<div class="pl-pinned-badge"><i class="fas fa-thumbtack"></i></div>' : ''}
            </div>
            <div class="pl-card-body">
                <div class="pl-card-name" onclick="openPlaylist('${pl.id}')">${esc(pl.name)}</div>
                ${pl.desc ? `<div class="pl-card-desc">${esc(pl.desc)}</div>` : ''}
                <div class="pl-card-actions">
                    <button class="btn btn-sm btn-outline" onclick="togglePinPlaylist('${pl.id}')">
                        <i class="fas fa-thumbtack" style="color:${pl.pinned?'var(--teal)':'var(--text-dim)'}"></i>
                        ${pl.pinned ? 'Откреплён' : 'В профиль'}
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="openPlaylistModal('${pl.id}','${esc(pl.name)}','${esc(pl.desc||'')}','${esc(pl.img||'')}')">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:rgba(239,68,68,0.4);"
                            onclick="deletePlaylist('${pl.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`).join('');
    } catch(e) {
        if (wrap) wrap.innerHTML = '<p style="color:#ef4444;">Ошибка загрузки</p>';
        console.error('loadPlaylistsPage:', e);
    }
}

async function loadPlaylistDetail(plId) {
    const uid = _auth?.currentUser?.uid;
    if (!uid) return;
    const wrap = document.getElementById('playlists-wrap');
    if (!wrap) return;
    try {
        const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
        if (!plDoc.exists()) return showToast('Плейлист не найден', 'error');
        const pl = { id: plId, ...plDoc.data() };
        const items = await getDocs(collection(_db, `users/${uid}/playlists/${plId}/items`));
        const rels  = items.docs.map(d => d.data());

        wrap.innerHTML = `
        <div class="pl-detail-header">
            <button class="btn btn-outline btn-sm" onclick="loadPlaylistsPage()">← Назад</button>
            <div class="pl-detail-info">
                ${pl.img ? `<img src="${esc(pl.img)}" class="pl-detail-cover" onerror="this.style.display='none'" alt="">` : ''}
                <div>
                    <h2 style="font-size:1.5rem;font-weight:900;margin-bottom:6px;">${esc(pl.name)}</h2>
                    ${pl.desc ? `<p style="color:var(--text-dim);font-size:13px;margin-bottom:8px;">${esc(pl.desc)}</p>` : ''}
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:12px;color:var(--text-dim);">${rels.length} релизов</span>
                        <button class="btn btn-sm btn-outline" onclick="openPlaylistModal('${plId}','${esc(pl.name)}','${esc(pl.desc||'')}','${esc(pl.img||'')}')">
                            <i class="fas fa-pen"></i> Редактировать
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="togglePinPlaylist('${plId}')">
                            <i class="fas fa-thumbtack" style="color:${pl.pinned?'var(--teal)':'var(--text-dim)'}"></i>
                            ${pl.pinned ? 'Откреплено' : 'Закрепить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="pl-detail-grid">
            ${rels.length === 0
                ? `<p style="color:var(--text-dim);grid-column:1/-1;text-align:center;padding:30px 0;font-size:13px;">Плейлист пуст — добавляйте релизы со страниц релизов</p>`
                : rels.map(r => `
                <div class="list-card" style="position:relative;">
                    <img src="${esc(r.img)}" onerror="this.src='${PLACEHOLDER_IMG}'" alt="" onclick="openView('${r.relId}')">
                    <div class="list-card-title" onclick="openView('${r.relId}')">${esc(r.title)}</div>
                    <button class="pl-item-remove" onclick="removeFromPlaylist('${plId}','${r.relId}')" title="Убрать">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`).join('')}
        </div>`;
    } catch(e) {
        console.error('loadPlaylistDetail:', e);
        showToast('Ошибка загрузки плейлиста', 'error');
    }
}

export async function renderPinnedPlaylists(uid) {
    if (!uid || !_db) return '';
    try {
        const snap = await getDocs(collection(_db, `users/${uid}/playlists`));
        const pinned = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.pinned)
            .slice(0, MAX_PINNED);
        if (!pinned.length) return '';

        let html = `<div style="background:var(--card-bg);padding:22px;border-radius:16px;border:1px solid var(--border);margin-bottom:20px;">
            <h4 style="font-size:15px;margin-bottom:18px;">
                <i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px;"></i> Мои плейлисты
            </h4>
            <div class="pl-profile-grid">`;

        for (const pl of pinned) {
            let itemCount = 0;
            try {
                const items = await getDocs(collection(_db, `users/${uid}/playlists/${pl.id}/items`));
                itemCount = items.size;
            } catch(e) {}
            html += `
            <div class="pl-profile-card" onclick="window.navigate('playlists')">
                <div class="pl-profile-cover">
                    ${pl.img ? `<img src="${esc(pl.img)}" onerror="this.style.display='none'" alt="">` : ''}
                    <div class="pl-profile-cover-icon" style="${pl.img?'display:none;':''}">
                        <i class="fas fa-layer-group"></i>
                    </div>
                </div>
                <div class="pl-profile-name">${esc(pl.name)}</div>
                <div class="pl-profile-count">${itemCount} релизов</div>
            </div>`;
        }
        html += `</div></div>`;
        return html;
    } catch(e) {
        console.error('renderPinnedPlaylists:', e);
        return '';
    }
}
