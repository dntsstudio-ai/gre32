// ============================================================
//  js/videolib.js — Видеотека: серии/фильмы на Firebase Storage
//  (не Supabase — там лимит на размер файла, а видео VAT бывает до 3 ГБ)
// ============================================================

import {
    ref as storageRef, listAll, getDownloadURL, getMetadata,
    deleteObject, uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { showToast } from './core.js?v=20261028a';

const FOLDER = 'videos';
const MAX_FILE_GB = 3;

let _storage = null;
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

function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU'); } catch(e) { return ''; }
}

async function listVideos() {
    const folderRef = storageRef(_storage, FOLDER);
    const res = await listAll(folderRef);
    const items = await Promise.all(res.items.map(async itemRef => {
        const [url, meta] = await Promise.all([getDownloadURL(itemRef), getMetadata(itemRef)]);
        return { name: itemRef.name, url, size: meta.size, createdAt: meta.timeCreated };
    }));
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return items;
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
            <div class="videolib-row" data-url="${esc(v.url)}" data-name="${esc(v.name)}">
                <div class="videolib-row-icon"><i class="fas fa-film"></i></div>
                <div class="videolib-row-info">
                    <div class="videolib-row-name" title="${esc(v.name)}">${esc(v.name)}</div>
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

export function bindVideoLib(storage) {
    _storage = storage;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.videolib-row .media-tile-btn');
        if (!btn) return;
        const row = btn.closest('.videolib-row');
        if (!row) return;
        const { url, name } = row.dataset;
        if (btn.dataset.act === 'copy') {
            navigator.clipboard?.writeText(url)
                .then(() => showToast('Ссылка скопирована!'))
                .catch(() => showToast('Не удалось скопировать', 'error'));
        } else if (btn.dataset.act === 'pick') {
            window.pickVideoUrl(url);
        } else if (btn.dataset.act === 'delete') {
            window.deleteVideoFile(name);
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
            () => {
                if (wrap) wrap.style.display = 'none';
                inputEl.value = '';
                showToast('Видео загружено!');
                renderVideoList();
            }
        );
    };

    window.deleteVideoFile = async function(name) {
        if (!confirm('Удалить видео из видеотеки? Если оно используется в релизах, ссылка в них перестанет работать.')) return;
        try {
            await deleteObject(storageRef(_storage, `${FOLDER}/${name}`));
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
