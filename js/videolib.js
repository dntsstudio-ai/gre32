// ============================================================
//  js/videolib.js — Видеотека: серии/фильмы на Firebase Storage
//  (не Supabase — там лимит на размер файла, а видео VAT бывает до 3 ГБ)
//
//  Список файлов хранится не через Storage listAll() (та операция
//  капризна к правилам/CORS — в проде упала с storage/retry-limit-
//  exceeded), а отдельной коллекцией videoLibrary в Firestore, как и
//  весь остальной "каталог" на этом сайте. Storage — только блобы.
// ============================================================

import {
    ref as storageRef, deleteObject, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import {
    collection, addDoc, deleteDoc, doc, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { showToast } from './core.js?v=20261028b';

const FOLDER = 'videos';
const COLLECTION = 'videoLibrary';
const MAX_FILE_GB = 3;

let _storage = null;
let _db = null;
let _pickTarget = null;

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function fmtSize(bytes) {
    if (!bytes) return '—';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return gb.toFixed(2) + ' ГБ';
    return (bytes / (1024 ** 2)).toFixed(1) + ' МБ';
}

function fmtDate(ms) {
    if (!ms) return '';
    try { return new Date(ms).toLocaleDateString('ru-RU'); } catch(e) { return ''; }
}

// Вызывается из releases.js после успешной загрузки видео эпизода тем
// же "Файл"-инпутом (не только из этой библиотеки) — чтобы в видеотеке
// оказывались вообще все загруженные видео, а не только те, что
// загрузили через саму модалку видеотеки.
export async function registerVideoInLibrary(db, { name, url, size, path }) {
    try {
        await addDoc(collection(db, COLLECTION), { name, url, size, path, createdAt: Date.now() });
    } catch(e) { console.warn('registerVideoInLibrary:', e); }
}

async function listVideos() {
    const snap = await getDocs(query(collection(_db, COLLECTION), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderVideoList() {
    const list = document.getElementById('videolib-list');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:30px;">Загрузка...</p>';
    try {
        const videos = await listVideos();
        if (!videos.length) {
            list.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:30px;">Пока пусто — загрузите первое видео.</p>';
            return;
        }
        list.innerHTML = videos.map(v => `
            <div class="videolib-row" data-id="${esc(v.id)}" data-url="${esc(v.url)}" data-path="${esc(v.path || '')}">
                <div class="videolib-row-icon"><i class="fas fa-film"></i></div>
                <div class="videolib-row-info">
                    <div class="videolib-row-name" title="${esc(v.name || '')}">${esc(v.name || v.url)}</div>
                    <div class="videolib-row-meta">${fmtSize(v.size)} · ${fmtDate(v.createdAt)}</div>
                </div>
                <div class="videolib-row-actions">
                    ${_pickTarget ? `<button class="media-tile-btn media-tile-btn--pick" data-act="pick" title="Использовать"><i class="fas fa-check"></i></button>` : ''}
                    <button class="media-tile-btn" data-act="copy" title="Скопировать ссылку"><i class="fas fa-link"></i></button>
                    <button class="media-tile-btn media-tile-btn--danger" data-act="delete" title="Удалить"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        list.innerHTML = `<p style="color:#ef4444;text-align:center;padding:30px;">Ошибка загрузки видеотеки: ${esc(e.message)}</p>`;
    }
}

export function bindVideoLib(storage, db) {
    _storage = storage;
    _db = db;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.videolib-row .media-tile-btn');
        if (!btn) return;
        const row = btn.closest('.videolib-row');
        if (!row) return;
        const { id, url, path } = row.dataset;
        if (btn.dataset.act === 'copy') {
            navigator.clipboard?.writeText(url)
                .then(() => showToast('Ссылка скопирована!'))
                .catch(() => showToast('Не удалось скопировать', 'error'));
        } else if (btn.dataset.act === 'pick') {
            window.pickVideoUrl(url);
        } else if (btn.dataset.act === 'delete') {
            window.deleteVideoFile(id, path);
        }
    });

    window.openVideoLibrary = function(targetInputId) {
        _pickTarget = targetInputId || null;
        const titleEl = document.getElementById('videolib-modal-title');
        if (titleEl) titleEl.textContent = _pickTarget ? 'Видеотека — выберите видео' : 'Видеотека';
        const modal = document.getElementById('m-videolib');
        if (modal) modal.style.display = 'flex';
        renderVideoList();
    };

    window.closeVideoLibrary = function() {
        const modal = document.getElementById('m-videolib');
        if (modal) modal.style.display = 'none';
    };

    window.uploadVideoLibFile = function(inputEl) {
        const file = inputEl.files[0];
        if (!file) return;
        if (!file.type.startsWith('video/')) { inputEl.value = ''; return showToast('Нужен видеофайл', 'error'); }
        if (file.size > MAX_FILE_GB * 1024 ** 3) { inputEl.value = ''; return showToast(`Файл слишком большой (макс. ${MAX_FILE_GB} ГБ)`, 'error'); }
        const wrap = document.getElementById('videolib-upload-wrap');
        const bar  = document.getElementById('videolib-upload-bar');
        if (wrap) wrap.style.display = 'block';
        const safeName = file.name.replace(/[^\w.\-]/g, '_');
        const path = `${FOLDER}/${Date.now()}_${safeName}`;
        const fileRef = storageRef(_storage, path);
        const task = uploadBytesResumable(fileRef, file);
        task.on('state_changed',
            (snap) => {
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                if (bar) { bar.style.width = pct + '%'; bar.textContent = pct + '%'; }
            },
            (err) => {
                if (wrap) wrap.style.display = 'none';
                showToast('Ошибка загрузки: ' + err.message, 'error');
            },
            async () => {
                if (wrap) wrap.style.display = 'none';
                inputEl.value = '';
                const url = await getDownloadURL(fileRef);
                await registerVideoInLibrary(_db, { name: file.name, url, size: file.size, path });
                showToast('Видео загружено!');
                renderVideoList();
            }
        );
    };

    window.deleteVideoFile = async function(docId, path) {
        if (!confirm('Удалить видео из видеотеки? Если оно используется в релизах, ссылка в них перестанет работать.')) return;
        try {
            if (path) await deleteObject(storageRef(_storage, path)).catch(e => console.warn('deleteObject:', e));
            await deleteDoc(doc(_db, COLLECTION, docId));
            showToast('Удалено');
            renderVideoList();
        } catch(e) { showToast('Ошибка удаления: ' + e.message, 'error'); }
    };

    window.pickVideoUrl = function(url) {
        if (_pickTarget) {
            const el = document.getElementById(_pickTarget);
            if (el) { el.value = url; el.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        window.closeVideoLibrary();
        showToast('Видео выбрано!');
    };
}
