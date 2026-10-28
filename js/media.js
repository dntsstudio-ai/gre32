// ============================================================
//  js/media.js — Медиатека: картинки/гифки на Supabase Storage
// ============================================================

import { SUPABASE_CONFIG } from '../config/config.js?v=20261028b';
import { showToast } from './core.js?v=20261028b';

const BUCKET = SUPABASE_CONFIG.bucket || 'media';
const MAX_FILE_MB = 8;

let _sbClient = null;
async function getClient() {
    if (_sbClient) return _sbClient;
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    _sbClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return _sbClient;
}

function publicUrl(sb, path) {
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadMedia(file) {
    const sb = await getClient();
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${Date.now()}_${safeName}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return { name: path, url: publicUrl(sb, path) };
}

async function listMedia() {
    const sb = await getClient();
    const { data, error } = await sb.storage.from(BUCKET).list('', {
        limit: 200,
        sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) throw error;
    return (data || [])
        .filter(f => f.name && f.id) // отфильтровать служебный .emptyFolderPlaceholder
        .map(f => ({ name: f.name, url: publicUrl(sb, f.name), createdAt: f.created_at }));
}

async function deleteMedia(name) {
    const sb = await getClient();
    const { error } = await sb.storage.from(BUCKET).remove([name]);
    if (error) throw error;
}

// ── Режим "выбора" (когда медиатеку открыли, чтобы подставить URL
//    в конкретное поле формы) — null, если открыта просто для просмотра ──
let _pickTarget = null;

async function renderMediaGrid() {
    const grid = document.getElementById('media-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:30px;grid-column:1/-1;">Загрузка...</p>';
    try {
        const files = await listMedia();
        if (!files.length) {
            grid.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:30px;grid-column:1/-1;">Пока пусто — загрузите первую картинку.</p>';
            return;
        }
        grid.innerHTML = files.map(f => `
            <div class="media-tile" data-url="${esc(f.url)}" data-name="${esc(f.name)}">
                <img src="${esc(f.url)}" loading="lazy" alt="">
                <div class="media-tile-actions">
                    ${_pickTarget ? `<button class="media-tile-btn media-tile-btn--pick" data-act="pick" title="Выбрать"><i class="fas fa-check"></i></button>` : ''}
                    <button class="media-tile-btn" data-act="copy" title="Скопировать ссылку"><i class="fas fa-link"></i></button>
                    <button class="media-tile-btn media-tile-btn--danger" data-act="delete" title="Удалить"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        grid.innerHTML = `<p style="color:#ef4444;text-align:center;padding:30px;grid-column:1/-1;">Ошибка загрузки медиатеки: ${esc(e.message)}</p>`;
    }
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function bindMediaLibrary() {
    const grid = () => document.getElementById('media-grid');

    // Делегирование кликов по плиткам — без инлайн-onclick с URL внутри
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.media-tile-btn');
        if (!btn) return;
        const tile = btn.closest('.media-tile');
        if (!tile) return;
        const { url, name } = tile.dataset;
        if (btn.dataset.act === 'copy') {
            navigator.clipboard?.writeText(url)
                .then(() => showToast('Ссылка скопирована!'))
                .catch(() => showToast('Не удалось скопировать', 'error'));
        } else if (btn.dataset.act === 'pick') {
            window.pickMediaUrl(url);
        } else if (btn.dataset.act === 'delete') {
            window.deleteMediaFile(name);
        }
    });

    window.openMediaLibrary = function(targetInputId) {
        _pickTarget = targetInputId || null;
        const titleEl = document.getElementById('media-modal-title');
        if (titleEl) titleEl.textContent = _pickTarget ? 'Медиатека — выберите картинку' : 'Медиатека';
        const modal = document.getElementById('m-media');
        if (modal) modal.style.display = 'flex';
        renderMediaGrid();
    };

    window.uploadMediaFiles = async function(inputEl) {
        const files = Array.from(inputEl.files || []);
        if (!files.length) return;
        let ok = 0, fail = 0;
        for (const file of files) {
            if (!file.type.startsWith('image/')) { showToast(`"${file.name}" — не изображение`, 'error'); fail++; continue; }
            if (file.size > MAX_FILE_MB * 1024 * 1024) { showToast(`"${file.name}" больше ${MAX_FILE_MB} МБ`, 'error'); fail++; continue; }
            try { await uploadMedia(file); ok++; }
            catch(e) { showToast(`Ошибка загрузки "${file.name}": ${e.message}`, 'error'); fail++; }
        }
        inputEl.value = '';
        if (ok) showToast(`Загружено: ${ok}${fail ? `, ошибок: ${fail}` : ''}`);
        renderMediaGrid();
    };

    window.deleteMediaFile = async function(name) {
        if (!confirm('Удалить картинку из медиатеки?')) return;
        try { await deleteMedia(name); showToast('Удалено'); renderMediaGrid(); }
        catch(e) { showToast('Ошибка удаления: ' + e.message, 'error'); }
    };

    window.pickMediaUrl = function(url) {
        if (_pickTarget) {
            const el = document.getElementById(_pickTarget);
            if (el) { el.value = url; el.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        // Закрываем только саму медиатеку — closeModals() закрыл бы и
        // модалку "Управление релизом"/"Добавить медиа" под ней, из-за
        // чего казалось, что выбор картинки вообще ничего не делает.
        closeMediaModal();
        showToast('Картинка выбрана!');
    };

    window.closeMediaLibrary = closeMediaModal;
}

function closeMediaModal() {
    const modal = document.getElementById('m-media');
    if (modal) modal.style.display = 'none';
}
