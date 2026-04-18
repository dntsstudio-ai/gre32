// ============================================================
//  js/team.js — Команда студии: список, страница участника
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc,
    updateDoc, deleteDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate } from './core.js';
import { PLACEHOLDER_TEAM_IMG } from '../config/config.js';

export let curTM = null;

export function bindTeam(db, getState) {

    window.loadTeam = async () => {
        const { isAdmin } = getState();
        const snap = await getDocs(query(collection(db,'team'), orderBy('order')));
        const t    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const cats = {};
        t.forEach(m => { const c = m.cat||'Без категории'; if(!cats[c]) cats[c]=[]; cats[c].push(m); });
        const w = document.getElementById('team-wrapper');
        w.innerHTML = '';
        Object.keys(cats).forEach(cat => {
            const safeId = 'cat_' + cat.replace(/[^a-zA-Zа-яА-Я0-9]/g,'_');
            const cDiv = document.createElement('div');
            cDiv.className = 'team-container';
            cDiv.innerHTML = `
                <div class="team-container-header"
                     onclick="const g=document.getElementById('${safeId}');g.style.display=g.style.display==='none'?'grid':'none'">
                    ${esc(cat)} <i class="fas fa-chevron-down" style="font-size:11px;"></i>
                </div>
                <div class="grid" id="${safeId}"></div>`;
            w.appendChild(cDiv);
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
                    onEnd: async () => {
                        const items = Array.from(grid.children);
                        for (let i=0; i<items.length; i++)
                            await updateDoc(doc(db,'team',items[i].dataset.id),{ order: i });
                        showToast('Порядок сохранён');
                    }
                });
            }
        });
        if (isAdmin) document.body.classList.add('admin-mode');
        else document.body.classList.remove('admin-mode');
    };

    window.openTeamModal = async (id='') => {
        document.getElementById('ed-team-id').value = id;
        if (id) {
            const snap = await getDoc(doc(db,'team',id));
            const d = snap.data();
            ['name','role','img','cat'].forEach(f=>document.getElementById(`ad-m-${f}`).value=d[f]||'');
        } else {
            ['name','role','img','cat'].forEach(f=>document.getElementById(`ad-m-${f}`).value='');
        }
        document.getElementById('m-team').style.display = 'flex';
    };

    window.saveTeam = async () => {
        const id = document.getElementById('ed-team-id').value;
        const data = {
            name: document.getElementById('ad-m-name').value,
            role: document.getElementById('ad-m-role').value,
            img:  document.getElementById('ad-m-img').value,
            cat:  document.getElementById('ad-m-cat').value||'Без категории'
        };
        if (!data.name) return showToast('Введите никнейм!','error');
        if (!id) { data.order=999; await addDoc(collection(db,'team'),data); }
        else await updateDoc(doc(db,'team',id),data);
        closeModals(); await window.loadTeam(); showToast('Участник сохранён!');
    };

    window.delTeam = async (id) => {
        if (!confirm('Удалить участника?')) return;
        await deleteDoc(doc(db,'team',id));
        await window.loadTeam(); showToast('Удалён');
    };

    window.openTeamPage = async (id) => {
        const { isAdmin, userData } = getState();
        const cardSnap = await getDoc(doc(db,'team',id));
        curTM = { id, ...cardSnap.data() };
        navigate('team-page');
        document.getElementById('adm-tp-controls').style.display = isAdmin ? 'flex' : 'none';
        const isLinked = userData && userData.linkedCardId === id;
        document.getElementById('own-tp-controls').style.display = (isLinked&&!isAdmin) ? 'flex' : 'none';
        document.getElementById('team-page-view').innerHTML = `
            <div style="display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;">
                <img src="${esc(curTM.img)}" style="width:230px;height:320px;border-radius:14px;object-fit:cover;border:2px solid var(--accent);box-shadow:var(--shadow);"
                     onerror="this.src='${PLACEHOLDER_TEAM_IMG}'">
                <div style="flex:1;min-width:280px;">
                    <h1 style="font-size:2.2rem;margin-bottom:8px;">${esc(curTM.name)}</h1>
                    <h3 style="color:var(--accent);margin-bottom:18px;">${esc(curTM.role)}</h3>
                    <div style="background:var(--input-bg);padding:18px;border-radius:10px;border:1px solid var(--border);margin-bottom:18px;">
                        <h4 style="margin-bottom:8px;color:var(--text-dim);">О себе:</h4>
                        <p style="line-height:1.6;font-size:14px;white-space:pre-wrap;">${esc(curTM.bio||'Информация пока не добавлена.')}</p>
                    </div>
                    ${curTM.social?`<a href="${esc(curTM.social)}" target="_blank" class="btn btn-outline" style="text-decoration:none;"><i class="fas fa-link"></i> Соцсети</a>`:''}
                </div>
            </div>`;
    };

    window.openTPModal = () => {
        if (!curTM) return;
        document.getElementById('tp-bio').value    = curTM.bio   ||'';
        document.getElementById('tp-social').value = curTM.social||'';
        document.getElementById('m-tp-edit').style.display = 'flex';
    };

    window.saveTP = async () => {
        if (!curTM) return;
        await updateDoc(doc(db,'team',curTM.id),{
            bio:    document.getElementById('tp-bio').value,
            social: document.getElementById('tp-social').value
        });
        closeModals(); await window.openTeamPage(curTM.id); showToast('Страница обновлена');
    };

    window.deleteTP = async () => {
        if (!curTM||!confirm('Удалить страницу?')) return;
        await updateDoc(doc(db,'team',curTM.id),{ bio:'', social:'' });
        showToast('Удалена'); navigate('team');
    };

    window.openMyTPEdit = () => {
        const { userData } = getState();
        if (!curTM||!userData) return;
        const perms = userData.cardPerms||{};
        document.getElementById('my-tp-name-block').style.display = perms.canEditName ? 'block' : 'none';
        document.getElementById('my-tp-img-block').style.display  = perms.canEditImg  ? 'block' : 'none';
        document.getElementById('my-tp-name').value   = curTM.name  ||'';
        document.getElementById('my-tp-img').value    = curTM.img   ||'';
        document.getElementById('my-tp-bio').value    = curTM.bio   ||'';
        document.getElementById('my-tp-social').value = curTM.social||'';
        document.getElementById('m-my-tp-edit').style.display = 'flex';
    };

    window.saveMyTP = async () => {
        const { userData } = getState();
        if (!curTM||!userData) return;
        const perms = userData.cardPerms||{};
        const updates = { bio: document.getElementById('my-tp-bio').value, social: document.getElementById('my-tp-social').value };
        if (perms.canEditName) updates.name = document.getElementById('my-tp-name').value;
        if (perms.canEditImg)  updates.img  = document.getElementById('my-tp-img').value;
        await updateDoc(doc(db,'team',curTM.id), updates);
        closeModals(); await window.openTeamPage(curTM.id); showToast('Страница обновлена!');
    };

    window.openAccessModal = () => {
        document.getElementById('access-email').value = '';
        document.getElementById('acc-name').checked   = false;
        document.getElementById('acc-img').checked    = false;
        document.getElementById('m-access').style.display = 'flex';
    };

    window.grantCardAccess = async () => {
        if (!curTM) return;
        const email       = document.getElementById('access-email').value.trim();
        const canEditName = document.getElementById('acc-name').checked;
        const canEditImg  = document.getElementById('acc-img').checked;
        if (!email) return showToast('Укажите email!','error');
        const snap = await getDocs(query(collection(db,'users'), where('email','==',email)));
        if (snap.empty) return showToast('Пользователь не найден!','error');
        await updateDoc(doc(db,'users',snap.docs[0].id),{ linkedCardId: curTM.id, cardPerms: { canEditName, canEditImg } });
        showToast('Доступ выдан!'); closeModals();
    };
}
