// ============================================================
//  js/playlists.js — Пользовательские плейлисты
//  Firestore: users/{uid}/playlists/{playlistId}
//             users/{uid}/playlists/{playlistId}/items/{relId}
// ============================================================

import {
    collection, getDocs, getDoc, doc,
    addDoc, setDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals } from './core.js';
import { PLACEHOLDER_IMG } from '../config/config.js';

const MAX_PLAYLISTS   = 50;   // максимум плейлистов у пользователя
const MAX_PINNED      = 3;    // максимум закреплённых в профиле

// ── Состояние ──
let _db   = null;
let _auth = null;
let _getState = null;

export function bindPlaylists(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    // ── Открыть страницу плейлистов ──
    window.navigate_playlists = () => {
        const { userData } = getState();
        if (!userData) return showToast('Войдите в аккаунт', 'error');
        document.getElementById('playlists-section').style.display = 'block';
        loadPlaylistsPage();
    };

    // ── Публичный метод загрузки страницы плейлистов ──
    window.loadPlaylistsPage = () => loadPlaylistsPage();

    // ── Открыть страницу конкретного плейлиста ──
    window.openPlaylist = async (plId) => {
        await loadPlaylistDetail(plId);
    };

    // ── Создать / сохранить плейлист ──
    window.savePlaylist = async () => {
        const { userData } = getState();
        if (!userData) return;
        const uid   = _auth.currentUser.uid;
        const id    = document.getElementById('pl-edit-id').value;
        const name  = document.getElementById('pl-edit-name').value.trim();
        const desc  = document.getElementById('pl-edit-desc').value.trim();
        const img   = document.getElementById('pl-edit-img').value.trim();
        if (!name) return showToast('Введите название!', 'error');

        const plRef = id
            ? doc(_db, `users/${uid}/playlists`, id)
            : doc(collection(_db, `users/${uid}/playlists`));

        // Проверяем лимит при создании
        if (!id) {
            const snap = await getDocs(collection(_db, `users/${uid}/playlists`));
            if (snap.size >= MAX_PLAYLISTS) return showToast(`Максимум ${MAX_PLAYLISTS} плейлистов`, 'error');
        }

        await setDoc(plRef, { name, desc, img, updatedAt: Date.now() }, { merge: true });
        if (!id) await updateDoc(plRef, { createdAt: Date.now(), pinned: false });

        closeModals();
        showToast(id ? 'Плейлист обновлён!' : 'Плейлист создан!');
        loadPlaylistsPage();
        // Обновляем профиль если он открыт
        if (document.getElementById('profile')?.classList.contains('active')) {
            window.loadMyLists?.();
        }
    };

    // ── Удалить плейлист ──
    window.deletePlaylist = async (plId) => {
        if (!confirm('Удалить плейлист?')) return;
        const uid = _auth.currentUser.uid;
        // Удаляем все items подколлекции
        const items = await getDocs(collection(_db, `users/${uid}/playlists/${plId}/items`));
        for (const d of items.docs) await deleteDoc(d.ref);
        await deleteDoc(doc(_db, `users/${uid}/playlists`, plId));
        showToast('Плейлист удалён');
        loadPlaylistsPage();
        window.loadMyLists?.();
    };

    // ── Открепить / закрепить плейлист в профиле ──
    window.togglePinPlaylist = async (plId) => {
        const uid  = _auth.currentUser.uid;
        const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
        if (!plDoc.exists()) return;
        const isPinned = plDoc.data().pinned || false;

        if (!isPinned) {
            // Проверяем лимит закреплённых
            const all = await getDocs(collection(_db, `users/${uid}/playlists`));
            const pinnedCount = all.docs.filter(d => d.data().pinned).length;
            if (pinnedCount >= MAX_PINNED) {
                return showToast(`Можно закрепить максимум ${MAX_PINNED} плейлиста`, 'error');
            }
        }

        await updateDoc(doc(_db, `users/${uid}/playlists`, plId), { pinned: !isPinned });
        showToast(isPinned ? 'Откреплено из профиля' : 'Закреплено в профиле ✅');
        loadPlaylistsPage();
        window.loadMyLists?.();
    };

    // ── Удалить релиз из плейлиста ──
    window.removeFromPlaylist = async (plId, relId) => {
        const uid = _auth.currentUser.uid;
        await deleteDoc(doc(_db, `users/${uid}/playlists/${plId}/items`, relId));
        showToast('Убрано из плейлиста');
        loadPlaylistDetail(plId);
    };

    // ── Добавить релиз в плейлист (вызывается со страницы релиза) ──
    window.openAddToPlaylist = async (relId, relTitle, relImg) => {
        // If called with only relId (from releases.js), read title/img from curProj
        if (!relTitle && window._curProjData) {
            relTitle = window._curProjData.title || '';
            relImg   = window._curProjData.img   || '';
        }
        const { userData } = getState();
        if (!userData) return showToast('Войдите в аккаунт', 'error');
        const uid = _auth.currentUser.uid;

        // Загружаем плейлисты
        const snap = await getDocs(query(
            collection(_db, `users/${uid}/playlists`),
            orderBy('createdAt', 'desc')
        ));
        const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const listEl = document.getElementById('atp-list');
        if (!lists.length) {
            listEl.innerHTML = `<p style="font-size:13px;color:var(--text-dim);text-align:center;padding:20px 0;">
                У вас нет плейлистов.<br>Создайте первый!
            </p>`;
        } else {
            // Получаем где уже есть этот релиз
            const inLists = new Set();
            for (const pl of lists) {
                const itemDoc = await getDoc(doc(_db, `users/${uid}/playlists/${pl.id}/items`, relId));
                if (itemDoc.exists()) inLists.add(pl.id);
            }
            listEl.innerHTML = lists.map(pl => `
                <div class="atp-item ${inLists.has(pl.id) ? 'atp-item--in' : ''}"
                     onclick="toggleRelInPlaylist('${pl.id}','${relId}','${esc(relTitle)}','${esc(relImg)}')">
                    <div class="atp-item-cover">
                        ${pl.img
                            ? `<img src="${esc(pl.img)}" onerror="this.style.display='none'" alt="">`
                            : `<i class="fas fa-list" style="color:var(--text-dim);font-size:18px;"></i>`
                        }
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.name)}</div>
                        <div style="font-size:11px;color:var(--text-dim);">${pl.desc ? esc(pl.desc) : 'Без описания'}</div>
                    </div>
                    <i class="fas fa-${inLists.has(pl.id) ? 'check-circle' : 'plus-circle'}"
                       style="color:${inLists.has(pl.id) ? 'var(--green)' : 'var(--text-dim)'};font-size:18px;flex-shrink:0;"></i>
                </div>
            `).join('');
        }

        document.getElementById('atp-rel-id').value    = relId;
        document.getElementById('atp-rel-title').value = relTitle;
        document.getElementById('atp-rel-img').value   = relImg;
        document.getElementById('m-add-to-playlist').style.display = 'flex';
    };

    window.toggleRelInPlaylist = async (plId, relId, relTitle, relImg) => {
        const uid     = _auth.currentUser.uid;
        const itemRef = doc(_db, `users/${uid}/playlists/${plId}/items`, relId);
        const snap    = await getDoc(itemRef);
        if (snap.exists()) {
            await deleteDoc(itemRef);
            showToast('Убрано из плейлиста');
        } else {
            await setDoc(itemRef, {
                relId, title: relTitle, img: relImg, addedAt: Date.now()
            });
            // Обновляем счётчик и картинку плейлиста если не задана
            const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
            if (plDoc.exists() && !plDoc.data().img && relImg) {
                await updateDoc(doc(_db, `users/${uid}/playlists`, plId), { img: relImg });
            }
            showToast('Добавлено в плейлист ✅');
        }
        // Перезагружаем диалог
        await window.openAddToPlaylist(relId, relTitle, relImg);
    };

    // ── Открыть модал создания/редактирования ──
    window.openPlaylistModal = (plId = '', name = '', desc = '', img = '') => {
        document.getElementById('pl-edit-id').value   = plId;
        document.getElementById('pl-edit-name').value = name;
        document.getElementById('pl-edit-desc').value = desc;
        document.getElementById('pl-edit-img').value  = img;
        document.getElementById('pl-modal-title').textContent = plId ? 'Редактировать плейлист' : 'Новый плейлист';
        updatePlaylistImgPreview(img);
        document.getElementById('m-playlist-edit').style.display = 'flex';
    };

    window.updatePlaylistImgPreview = (url) => {
        const prev = document.getElementById('pl-img-preview');
        if (!prev) return;
        if (url && url.startsWith('http')) {
            prev.src = url;
            prev.style.display = 'block';
            prev.onerror = () => { prev.style.display = 'none'; };
        } else {
            prev.style.display = 'none';
        }
    };
}

// ── Загрузить страницу плейлистов ──
async function loadPlaylistsPage() {
    const uid = _auth?.currentUser?.uid;
    if (!uid) return;

    const wrap = document.getElementById('playlists-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Загрузка...</p>`;

    try {
        const snap = await getDocs(query(
            collection(_db, `users/${uid}/playlists`),
            orderBy('createdAt', 'desc')
        ));
        const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Для каждого плейлиста считаем кол-во айтемов
        const counts = {};
        for (const pl of lists) {
            const items = await getDocs(collection(_db, `users/${uid}/playlists/${pl.id}/items`));
            counts[pl.id] = items.size;
        }

        wrap.innerHTML = lists.length === 0
            ? `<div class="pl-empty">
                <i class="fas fa-layer-group"></i>
                <p>Нет плейлистов</p>
                <span>Создайте первый и добавляйте релизы</span>
               </div>`
            : lists.map(pl => `
            <div class="pl-card">
                <div class="pl-card-cover" onclick="openPlaylist('${pl.id}')">
                    ${pl.img
                        ? `<img src="${esc(pl.img)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">`
                        : ''}
                    <div class="pl-card-cover-placeholder" style="${pl.img ? 'display:none;' : ''}">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <div class="pl-card-count">${counts[pl.id] || 0} релизов</div>
                    ${pl.pinned ? '<div class="pl-pinned-badge"><i class="fas fa-thumbtack"></i></div>' : ''}
                </div>
                <div class="pl-card-body">
                    <div class="pl-card-name" onclick="openPlaylist('${pl.id}')">${esc(pl.name)}</div>
                    ${pl.desc ? `<div class="pl-card-desc">${esc(pl.desc)}</div>` : ''}
                    <div class="pl-card-actions">
                        <button class="btn btn-sm btn-outline" title="${pl.pinned ? 'Открепить' : 'Закрепить в профиле'}"
                                onclick="togglePinPlaylist('${pl.id}')">
                            <i class="fas fa-thumbtack" style="color:${pl.pinned ? 'var(--green)' : 'var(--text-dim)'}"></i>
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
        wrap.innerHTML = `<p style="color:#ef4444;">Ошибка загрузки</p>`;
        console.error(e);
    }
}

// ── Загрузить детальную страницу плейлиста ──
async function loadPlaylistDetail(plId) {
    const uid = _auth?.currentUser?.uid;
    if (!uid) return;

    const plDoc = await getDoc(doc(_db, `users/${uid}/playlists`, plId));
    if (!plDoc.exists()) return showToast('Плейлист не найден', 'error');
    const pl = { id: plId, ...plDoc.data() };

    const items = await getDocs(collection(_db, `users/${uid}/playlists/${plId}/items`));
    const rels  = items.docs.map(d => d.data());

    const wrap = document.getElementById('playlists-wrap');
    if (!wrap) return;

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
                            <i class="fas fa-thumbtack" style="color:${pl.pinned ? 'var(--green)' : 'var(--text-dim)'}"></i>
                            ${pl.pinned ? 'Откреплено' : 'Закрепить в профиле'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="pl-detail-grid">
            ${rels.length === 0
                ? `<p style="color:var(--text-dim);grid-column:1/-1;text-align:center;padding:30px 0;font-size:13px;">
                    Плейлист пуст — добавляйте релизы со страниц релизов
                  </p>`
                : rels.map(r => `
                <div class="list-card" style="position:relative;">
                    <img src="${esc(r.img)}" onerror="this.src='${PLACEHOLDER_IMG}'" alt="" onclick="openView('${r.relId}')">
                    <div class="list-card-title" onclick="openView('${r.relId}')">${esc(r.title)}</div>
                    <button class="pl-item-remove" onclick="removeFromPlaylist('${plId}','${r.relId}')" title="Убрать из плейлиста">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`).join('')
            }
        </div>`;
}

// ── Рендер закреплённых плейлистов в профиле ──
export async function renderPinnedPlaylists(uid) {
    if (!uid || !_db) return '';
    try {
        const snap = await getDocs(collection(_db, `users/${uid}/playlists`));
        const pinned = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.pinned)
            .slice(0, MAX_PINNED);
        if (!pinned.length) return '';

        // Для каждого получаем кол-во
        let html = `<div style="background:var(--card-bg);padding:22px;border-radius:16px;border:1px solid var(--border);margin-bottom:20px;">
            <h4 style="font-size:15px;margin-bottom:18px;">
                <i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px;"></i> Мои плейлисты
            </h4>
            <div class="pl-profile-grid">`;

        for (const pl of pinned) {
            const items = await getDocs(collection(_db, `users/${uid}/playlists/${pl.id}/items`));
            html += `
            <div class="pl-profile-card" onclick="window.navigate('playlists')">
                <div class="pl-profile-cover">
                    ${pl.img ? `<img src="${esc(pl.img)}" onerror="this.style.display='none'" alt="">` : ''}
                    <div class="pl-profile-cover-icon" style="${pl.img?'display:none;':''}">
                        <i class="fas fa-layer-group"></i>
                    </div>
                </div>
                <div class="pl-profile-name">${esc(pl.name)}</div>
                <div class="pl-profile-count">${items.size} релизов</div>
            </div>`;
        }
        html += `</div></div>`;
        return html;
    } catch(e) {
        console.error('renderPinnedPlaylists:', e);
        return '';
    }
}
