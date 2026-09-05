// ============================================================
//  js/team.js — Команда студии + участие в релизах
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc,
    updateDoc, deleteDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate } from './core.js';
import { PLACEHOLDER_TEAM_IMG } from '../config/config.js';

export let curTM = null;

export function bindTeam(db, getState) {

    window.loadTeam = async function() {
        const { isAdmin } = getState();
        const wrapper = document.getElementById('team-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '<p style="color:var(--text-dim);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Загрузка...</p>';

        try {
            const snap = await getDocs(query(collection(db, 'team'), orderBy('order')));
            const t    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const cats = {};
            t.forEach(m => { const c = m.cat || 'Без категории'; if (!cats[c]) cats[c] = []; cats[c].push(m); });

            wrapper.innerHTML = '';
            Object.keys(cats).forEach(cat => {
                const safeId = 'cat_' + cat.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
                const cDiv = document.createElement('div');
                cDiv.className = 'team-container';
                cDiv.innerHTML = `
                    <div class="team-container-header" onclick="
                        const g=document.getElementById('${safeId}');
                        g.style.display=g.style.display==='none'?'grid':'none'">
                        ${esc(cat)} <i class="fas fa-chevron-down" style="font-size:11px;"></i>
                    </div>
                    <div class="grid" id="${safeId}"></div>`;
                wrapper.appendChild(cDiv);

                const grid = cDiv.querySelector('.grid');
                grid.innerHTML = cats[cat].map(m => `
                    <div class="card" data-id="${m.id}" onclick="openTeamPage('${m.id}')">
                        <div class="drag-handle"><i class="fas fa-grip-lines"></i> Перетащить</div>
                        ${isAdmin ? `<div class="adm-tools">
                            <button class="btn-sm" style="background:#3897f0;" onclick="event.stopPropagation();openTeamModal('${m.id}')">Ред</button>
                            <button class="btn-sm" style="background:#ef4444;" onclick="event.stopPropagation();delTeam('${m.id}')">Удал</button>
                        </div>` : ''}
                        <img src="${esc(m.img)}" loading="lazy" style="width:100%;height:230px;object-fit:cover;"
                             onerror="this.src='${PLACEHOLDER_TEAM_IMG}'">
                        <div class="card-info" style="text-align:center;">
                            <div class="card-title" style="font-size:14px;">${esc(m.name)}</div>
                            <div style="color:var(--accent);font-size:11px;margin-top:5px;font-weight:bold;">${esc(m.role)}</div>
                        </div>
                    </div>`).join('');

                if (isAdmin && window.Sortable) {
                    new Sortable(grid, {
                        handle: '.drag-handle', animation: 150, ghostClass: 'sortable-ghost',
                        onEnd: async function() {
                            const items = Array.from(grid.children);
                            for (let i = 0; i < items.length; i++) {
                                try {
                                    await updateDoc(doc(db, 'team', items[i].dataset.id), { order: i });
                                } catch(e) {}
                            }
                            showToast('Порядок сохранён');
                        }
                    });
                }
            });

            if (isAdmin) document.body.classList.add('admin-mode');
            else document.body.classList.remove('admin-mode');
        } catch(e) {
            if (wrapper) wrapper.innerHTML = `<p style="color:#ef4444;">Ошибка загрузки команды: ${e.message}</p>`;
            console.error('loadTeam:', e);
        }
    };

    window.openTeamModal = async function(id = '') {
        document.getElementById('ed-team-id').value = id;
        if (id) {
            try {
                const snap = await getDoc(doc(db, 'team', id));
                if (snap.exists()) {
                    const d = snap.data();
                    ['name','role','img','cat'].forEach(f => {
                        const el = document.getElementById('ad-m-' + f);
                        if (el) el.value = d[f] || '';
                    });
                }
            } catch(e) { console.error(e); }
        } else {
            ['name','role','img','cat'].forEach(f => {
                const el = document.getElementById('ad-m-' + f);
                if (el) el.value = '';
            });
        }
        document.getElementById('m-team').style.display = 'flex';
    };

    window.saveTeam = async function() {
        const id   = document.getElementById('ed-team-id')?.value || '';
        const data = {
            name: document.getElementById('ad-m-name')?.value || '',
            role: document.getElementById('ad-m-role')?.value || '',
            img:  document.getElementById('ad-m-img')?.value  || '',
            cat:  document.getElementById('ad-m-cat')?.value  || 'Без категории'
        };
        if (!data.name) return showToast('Введите никнейм!', 'error');
        try {
            if (!id) { data.order = 999; await addDoc(collection(db, 'team'), data); }
            else await updateDoc(doc(db, 'team', id), data);
            closeModals();
            await window.loadTeam();
            showToast('Участник сохранён!');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.delTeam = async function(id) {
        if (!confirm('Удалить участника?')) return;
        try {
            await deleteDoc(doc(db, 'team', id));
            await window.loadTeam();
            showToast('Удалён');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openTeamPage = async function(id) {
        const { isAdmin, userData } = getState();
        try {
            const cardSnap = await getDoc(doc(db, 'team', id));
            if (!cardSnap.exists()) return showToast('Участник не найден', 'error');
            curTM = { id, ...cardSnap.data() };
            navigate('team-page');

            const admControls = document.getElementById('adm-tp-controls');
            const ownControls = document.getElementById('own-tp-controls');
            if (admControls) admControls.style.display = isAdmin ? 'flex' : 'none';
            const isLinked = userData && userData.linkedCardId === id;
            if (ownControls) ownControls.style.display = (isLinked && !isAdmin) ? 'flex' : 'none';

            const credits    = curTM.credits || [];
            let creditsHtml  = '';
            if (credits.length) {
                creditsHtml = `<div style="margin-top:20px;">
                    <h4 style="margin-bottom:12px;font-family:var(--font-display);font-size:1rem;color:var(--teal);"><i class="fas fa-clapperboard"></i> Участие в релизах</h4>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                    ${credits.map(c => {
                        let roleLabel = '';
                        if (c.creditRole === 'voice')   roleLabel = `<span style="color:var(--violet-light);"><i class="fas fa-microphone"></i> Озвучивал: ${esc(c.character||'')}</span>`;
                        else if (c.creditRole === 'tech')    roleLabel = `<span style="color:var(--teal-light);"><i class="fas fa-gear"></i>️ ${esc(c.techRole||'Тех. часть')}</span>`;
                        else if (c.creditRole === 'curator') roleLabel = `<span style="color:#f59e0b;"><i class="fas fa-crown"></i> Куратор</span>`;
                        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--input-bg);border-radius:10px;border:1px solid var(--border);">
                            ${c.relImg ? `<img src="${esc(c.relImg)}" style="width:36px;height:50px;border-radius:6px;object-fit:cover;flex-shrink:0;">` : ''}
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.relTitle||'Релиз')}</div>
                                <div style="font-size:11px;margin-top:2px;">${roleLabel}</div>
                            </div>
                            ${c.relId ? `<button class="btn btn-sm btn-outline" onclick="openView('${c.relId}')" style="flex-shrink:0;"><i class="fas fa-play"></i></button>` : ''}
                        </div>`;
                    }).join('')}
                    </div></div>`;
            }

            const view = document.getElementById('team-page-view');
            if (view) {
                view.innerHTML = `
                <div style="display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;">
                    <img src="${esc(curTM.img)}" style="width:230px;height:320px;border-radius:14px;object-fit:cover;border:2px solid var(--accent);box-shadow:var(--shadow);"
                         onerror="this.src='${PLACEHOLDER_TEAM_IMG}'">
                    <div style="flex:1;min-width:280px;">
                        <h1 style="font-size:2.2rem;margin-bottom:8px;">${esc(curTM.name)}</h1>
                        <h3 style="color:var(--accent);margin-bottom:18px;">${esc(curTM.role)}</h3>
                        <div style="background:var(--input-bg);padding:18px;border-radius:10px;border:1px solid var(--border);margin-bottom:18px;">
                            <h4 style="margin-bottom:8px;color:var(--text-dim);">О себе:</h4>
                            <p style="line-height:1.6;font-size:14px;white-space:pre-wrap;">${esc(curTM.bio || 'Информация пока не добавлена.')}</p>
                        </div>
                        ${curTM.social ? `<a href="${esc(curTM.social)}" target="_blank" class="btn btn-outline" style="text-decoration:none;"><i class="fas fa-link"></i> Соцсети</a>` : ''}
                        ${creditsHtml}
                    </div>
                </div>`;
            }
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
            console.error('openTeamPage:', e);
        }
    };

    // ── Управление кредитами ──
    window.openCreditsModal = async function() {
        if (!curTM) return;
        try {
            const relSnap = await getDocs(query(collection(db, 'releases'), orderBy('timestamp', 'desc')));
            const allRels = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const credits = curTM.credits || [];

            document.getElementById('credits-member-name').textContent = curTM.name;
            renderCreditsList(credits, allRels);

            const sel = document.getElementById('credit-rel-select');
            if (sel) {
                sel.innerHTML = '<option value="">— Выберите релиз —</option>' +
                    allRels.map(r => `<option value="${r.id}" data-img="${esc(r.img||'')}" data-title="${esc(r.title||'')}">${esc(r.title)} (${esc(r.year)})</option>`).join('');
            }
            document.getElementById('m-credits').style.display = 'flex';
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    function renderCreditsList(credits, allRels) {
        const list = document.getElementById('credits-list');
        if (!list) return;
        if (!credits.length) {
            list.innerHTML = '<p style="font-size:12px;color:var(--text-dim);font-style:italic;">Нет записей об участии в релизах.</p>';
            return;
        }
        list.innerHTML = credits.map((c, idx) => {
            let roleStr = '';
            if (c.creditRole === 'voice')   roleStr = '<i class="fas fa-microphone"></i> ' + (c.character ? 'Озвучивал: ' + esc(c.character) : 'Озвучивал');
            else if (c.creditRole === 'tech')    roleStr = '<i class="fas fa-gear"></i>️ ' + esc(c.techRole || 'Тех. часть');
            else if (c.creditRole === 'curator') roleStr = '<i class="fas fa-crown"></i> Куратор';
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--border);margin-bottom:8px;">
                ${c.relImg ? `<img src="${esc(c.relImg)}" style="width:32px;height:44px;border-radius:5px;object-fit:cover;flex-shrink:0;">` : ''}
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.relTitle||'Релиз')}</div>
                    <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${roleStr}</div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0;">
                    <button class="btn btn-sm" style="background:var(--violet);width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;"
                        onclick="editCredit(${idx})"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-sm" style="background:#ef4444;width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;"
                        onclick="removeCredit(${idx})"><i class="fas fa-times"></i></button>
                </div>
            </div>`;
        }).join('');
    }

    window.onCreditRoleChange = function() {
        const val = document.getElementById('credit-role-select')?.value;
        const vb  = document.getElementById('credit-voice-block');
        const tb  = document.getElementById('credit-tech-block');
        if (vb) vb.style.display = val === 'voice' ? 'block' : 'none';
        if (tb) tb.style.display = val === 'tech'  ? 'block' : 'none';
    };

    window.addCredit = async function() {
        if (!curTM) return;
        const relSel = document.getElementById('credit-rel-select');
        const relId  = relSel?.value;
        if (!relId) return showToast('Выберите релиз!', 'error');
        const selOpt   = relSel.options[relSel.selectedIndex];
        const relTitle = selOpt.dataset.title || selOpt.text;
        const relImg   = selOpt.dataset.img   || '';
        const creditRole = document.getElementById('credit-role-select')?.value || 'voice';

        const entry = { relId, relTitle, relImg, creditRole };
        if (creditRole === 'voice') entry.character = document.getElementById('credit-character')?.value.trim() || '';
        if (creditRole === 'tech')  entry.techRole  = document.getElementById('credit-tech-role')?.value || 'Монтажёр';

        const credits = [...(curTM.credits || []), entry];
        try {
            await updateDoc(doc(db, 'team', curTM.id), { credits });
            curTM.credits = credits;
            const relSnap = await getDocs(query(collection(db, 'releases'), orderBy('timestamp', 'desc')));
            const allRels = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderCreditsList(credits, allRels);
            showToast('Добавлено!');
            if (relSel) relSel.value = '';
            const roleEl = document.getElementById('credit-role-select');
            if (roleEl) roleEl.value = 'voice';
            window.onCreditRoleChange();
            const charEl = document.getElementById('credit-character');
            if (charEl) charEl.value = '';
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.editCredit = async function(idx) {
        if (!curTM) return;
        const c = (curTM.credits || [])[idx];
        if (!c) return;
        const relSel = document.getElementById('credit-rel-select');
        if (relSel && c.relId) {
            Array.from(relSel.options).forEach(opt => { if (opt.value === c.relId) opt.selected = true; });
        }
        const roleSel = document.getElementById('credit-role-select');
        if (roleSel) { roleSel.value = c.creditRole || 'voice'; window.onCreditRoleChange(); }
        if (c.creditRole === 'voice') {
            const charEl = document.getElementById('credit-character');
            if (charEl) charEl.value = c.character || '';
        }
        if (c.creditRole === 'tech') {
            const techEl = document.getElementById('credit-tech-role');
            if (techEl) techEl.value = c.techRole || 'Монтажёр';
        }
        await window.removeCredit(idx);
        showToast('Запись загружена для редактирования', 'info');
    };

    window.removeCredit = async function(idx) {
        if (!curTM) return;
        const credits = [...(curTM.credits || [])];
        credits.splice(idx, 1);
        try {
            await updateDoc(doc(db, 'team', curTM.id), { credits });
            curTM.credits = credits;
            const relSnap = await getDocs(query(collection(db, 'releases'), orderBy('timestamp', 'desc')));
            const allRels = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderCreditsList(credits, allRels);
            showToast('Удалено');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openTPModal = function() {
        if (!curTM) return;
        const bio    = document.getElementById('tp-bio');
        const social = document.getElementById('tp-social');
        if (bio)    bio.value    = curTM.bio    || '';
        if (social) social.value = curTM.social || '';
        document.getElementById('m-tp-edit').style.display = 'flex';
    };

    window.saveTP = async function() {
        if (!curTM) return;
        try {
            await updateDoc(doc(db, 'team', curTM.id), {
                bio:    document.getElementById('tp-bio')?.value    || '',
                social: document.getElementById('tp-social')?.value || ''
            });
            closeModals();
            await window.openTeamPage(curTM.id);
            showToast('Страница обновлена');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.deleteTP = async function() {
        if (!curTM || !confirm('Удалить страницу?')) return;
        try {
            await updateDoc(doc(db, 'team', curTM.id), { bio: '', social: '' });
            showToast('Удалена');
            navigate('team');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openMyTPEdit = function() {
        const { userData } = getState();
        if (!curTM || !userData) return;
        const perms = userData.cardPerms || {};
        const nb = document.getElementById('my-tp-name-block');
        const ib = document.getElementById('my-tp-img-block');
        if (nb) nb.style.display = perms.canEditName ? 'block' : 'none';
        if (ib) ib.style.display = perms.canEditImg  ? 'block' : 'none';
        const setV = (id, v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
        setV('my-tp-name',   curTM.name);
        setV('my-tp-img',    curTM.img);
        setV('my-tp-bio',    curTM.bio);
        setV('my-tp-social', curTM.social);
        document.getElementById('m-my-tp-edit').style.display = 'flex';
    };

    window.saveMyTP = async function() {
        const { userData } = getState();
        if (!curTM || !userData) return;
        const perms   = userData.cardPerms || {};
        const updates = {
            bio:    document.getElementById('my-tp-bio')?.value    || '',
            social: document.getElementById('my-tp-social')?.value || ''
        };
        if (perms.canEditName) updates.name = document.getElementById('my-tp-name')?.value || '';
        if (perms.canEditImg)  updates.img  = document.getElementById('my-tp-img')?.value  || '';
        try {
            await updateDoc(doc(db, 'team', curTM.id), updates);
            closeModals();
            await window.openTeamPage(curTM.id);
            showToast('Страница обновлена!');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openAccessModal = function() {
        const emailEl = document.getElementById('access-email');
        const accName = document.getElementById('acc-name');
        const accImg  = document.getElementById('acc-img');
        if (emailEl) emailEl.value   = '';
        if (accName)  accName.checked = false;
        if (accImg)   accImg.checked  = false;
        document.getElementById('m-access').style.display = 'flex';
    };

    window.grantCardAccess = async function() {
        if (!curTM) return;
        const email      = document.getElementById('access-email')?.value.trim() || '';
        const canEditName= document.getElementById('acc-name')?.checked || false;
        const canEditImg = document.getElementById('acc-img')?.checked  || false;
        if (!email) return showToast('Укажите email!', 'error');
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (snap.empty) return showToast('Пользователь не найден!', 'error');
            await updateDoc(doc(db, 'users', snap.docs[0].id), {
                linkedCardId: curTM.id,
                cardPerms: { canEditName, canEditImg }
            });
            showToast('Доступ выдан!');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
