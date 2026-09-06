// ============================================================
//  js/banners.js — Плашки (онлайн / смотрят / играют / реклама)
// ============================================================
//
// Тип "online" — считается честно, из реального поля lastSeen у users
// (никаких выдуманных цифр). Остальные типы ("watching","playing","ad","custom") —
// текст, который вручную вписывает админ — тоже не подделка, а то, что вы сами
// решаете показать.

import {
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js?v=20260906b';

let _db, _auth, _getState;
let _rotateTimer = null;
let _banners = [];
let _curIdx = 0;

const TYPE_META = {
    online:  { label: 'Онлайн на сайте', icon: 'fa-users',        defaultText: 'Сейчас на сайте: {count}' },
    watching:{ label: 'Сейчас смотрят',  icon: 'fa-eye',          defaultText: 'Сейчас смотрят: ' },
    playing: { label: 'Сейчас играют',   icon: 'fa-gamepad',      defaultText: 'Сейчас играют: ' },
    ad:      { label: 'Реклама',         icon: 'fa-bullhorn',     defaultText: '' },
    custom:  { label: 'Произвольная',    icon: 'fa-star',         defaultText: '' },
};

export function bindBanners(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    // ── Публичный виджет (для всех, даже без входа) ──
    window.startBannerWidget = async function() {
        try {
            const snap = await getDocs(query(collection(_db, 'banners'), where('active', '==', true)));
            _banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { _banners = []; }
        if (!_banners.length) return;

        let widget = document.getElementById('site-banner-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'site-banner-widget';
            document.body.appendChild(widget);
        }
        clearTimeout(_rotateTimer);
        _curIdx = 0;
        await showNextBanner(widget);
    };

    async function showNextBanner(widget) {
        if (!_banners.length) return;
        const b = _banners[_curIdx % _banners.length];
        _curIdx++;

        let text = b.text || '';
        if (b.type === 'online') {
            const count = await getOnlineCount();
            text = (b.text || TYPE_META.online.defaultText).replace('{count}', count);
        }

        widget.className = `site-banner site-banner--${b.placement || 'bottom-right'}`;
        widget.style.setProperty('--banner-color', b.color || '#7c3aed');
        widget.innerHTML = `
            <div class="site-banner-inner" onclick="dismissBannerWidget()">
                ${b.image ? `<img src="${esc(b.image)}" class="site-banner-img">` : `<i class="fas ${esc(b.icon || TYPE_META[b.type]?.icon || 'fa-star')}"></i>`}
                <span>${esc(text)}</span>
                <i class="fas fa-xmark site-banner-close"></i>
            </div>`;
        widget.classList.add('site-banner--visible');

        const duration = (b.duration || 8) * 1000;
        const frequency = (b.frequency || 20) * 1000;
        clearTimeout(_rotateTimer);
        _rotateTimer = setTimeout(() => {
            widget.classList.remove('site-banner--visible');
            _rotateTimer = setTimeout(() => showNextBanner(widget), Math.max(0, frequency - duration));
        }, duration);
    }

    window.dismissBannerWidget = () => {
        const widget = document.getElementById('site-banner-widget');
        if (widget) widget.classList.remove('site-banner--visible');
        clearTimeout(_rotateTimer);
    };

    async function getOnlineCount() {
        try {
            const cutoff = Date.now() - 5 * 60 * 1000; // активны последние 5 минут
            const snap = await getDocs(query(collection(_db, 'users'), where('lastSeen', '>', cutoff)));
            return snap.size;
        } catch(e) { return 0; }
    }

    // ── Админка: список / создание / редактирование ──
    window.openBannersAdmin = async function() {
        document.getElementById('m-banners-admin').style.display = 'flex';
        await renderBannersList();
    };

    async function renderBannersList() {
        const listEl = document.getElementById('banners-admin-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-dim);">Загрузка...</div>';
        try {
            const snap = await getDocs(collection(_db, 'banners'));
            _banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!_banners.length) { listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-dim);">Плашек пока нет</div>'; return; }
            listEl.innerHTML = _banners.map(b => `
                <div class="banner-admin-row">
                    <i class="fas ${esc(b.icon || TYPE_META[b.type]?.icon || 'fa-star')}" style="color:${esc(b.color || '#7c3aed')};"></i>
                    <div class="banner-admin-info">
                        <div class="banner-admin-title">${esc(TYPE_META[b.type]?.label || b.type)} ${b.active ? '' : '<span style="color:#ef4444;">(выкл)</span>'}</div>
                        <div class="banner-admin-sub">${esc(b.text || '')}</div>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="editBanner('${b.id}')">Ред.</button>
                    <button class="btn btn-sm" style="background:#ef4444;" onclick="deleteBanner('${b.id}')">Удал.</button>
                </div>`).join('');
        } catch(e) {
            listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444;">Ошибка: ' + esc(e.message) + '</div>';
        }
    }

    window.openBannerForm = (id) => {
        const b = id ? _banners.find(x => x.id === id) : null;
        document.getElementById('ed-banner-id').value = id || '';
        document.getElementById('bn-type').value       = b?.type || 'custom';
        document.getElementById('bn-text').value       = b?.text || '';
        document.getElementById('bn-icon').value       = b?.icon || '';
        document.getElementById('bn-color').value      = b?.color || '#7c3aed';
        document.getElementById('bn-image').value      = b?.image || '';
        document.getElementById('bn-placement').value  = b?.placement || 'bottom-right';
        document.getElementById('bn-frequency').value  = b?.frequency ?? 20;
        document.getElementById('bn-duration').value   = b?.duration ?? 8;
        document.getElementById('bn-active').checked   = b ? !!b.active : true;
        document.getElementById('m-banner-form').style.display = 'flex';
    };
    window.editBanner = (id) => window.openBannerForm(id);

    window.saveBannerForm = async () => {
        const id   = document.getElementById('ed-banner-id').value;
        const data = {
            type:      document.getElementById('bn-type').value,
            text:      document.getElementById('bn-text').value.trim(),
            icon:      document.getElementById('bn-icon').value.trim(),
            color:     document.getElementById('bn-color').value,
            image:     document.getElementById('bn-image').value.trim(),
            placement: document.getElementById('bn-placement').value,
            frequency: parseInt(document.getElementById('bn-frequency').value) || 20,
            duration:  parseInt(document.getElementById('bn-duration').value) || 8,
            active:    document.getElementById('bn-active').checked,
        };
        try {
            if (id) await updateDoc(doc(_db, 'banners', id), data);
            else    await addDoc(collection(_db, 'banners'), data);
            showToast('Плашка сохранена!');
            document.getElementById('m-banner-form').style.display = 'none';
            await renderBannersList();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.deleteBanner = async (id) => {
        if (!confirm('Удалить эту плашку?')) return;
        try {
            await deleteDoc(doc(_db, 'banners', id));
            await renderBannersList();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
