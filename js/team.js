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
        const snap = await getDocs(query(collection(db,'team'), orderBy('order')));
        const t    = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
        const cats = {};
        t.forEach(function(m){ const c = m.cat||'Без категории'; if(!cats[c]) cats[c]=[]; cats[c].push(m); });
        const w = document.getElementById('team-wrapper');
        w.innerHTML = '';
        Object.keys(cats).forEach(function(cat) {
            const safeId = 'cat_' + cat.replace(/[^a-zA-Zа-яА-Я0-9]/g,'_');
            const cDiv = document.createElement('div');
            cDiv.className = 'team-container';
            cDiv.innerHTML = '<div class="team-container-header" onclick="const g=document.getElementById(\'' + safeId + '\');g.style.display=g.style.display===\'none\'?\'grid\':\'none\'">' + esc(cat) + ' <i class="fas fa-chevron-down" style="font-size:11px;"></i></div><div class="grid" id="' + safeId + '"></div>';
            w.appendChild(cDiv);
            const grid = cDiv.querySelector('.grid');
            grid.innerHTML = cats[cat].map(function(m){
                return '<div class="card" data-id="' + m.id + '" onclick="openTeamPage(\'' + m.id + '\')">' +
                    '<div class="drag-handle"><i class="fas fa-grip-lines"></i> Перетащить</div>' +
                    (isAdmin ? '<div class="adm-tools"><button class="btn-sm" style="background:#3897f0;" onclick="event.stopPropagation();openTeamModal(\'' + m.id + '\')">Ред</button><button class="btn-sm" style="background:#ef4444;" onclick="event.stopPropagation();delTeam(\'' + m.id + '\')">Удал</button></div>' : '') +
                    '<img src="' + esc(m.img) + '" loading="lazy" style="width:100%;height:230px;object-fit:cover;" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'">' +
                    '<div class="card-info" style="text-align:center;"><div class="card-title" style="font-size:14px;">' + esc(m.name) + '</div><div style="color:var(--accent);font-size:11px;margin-top:5px;font-weight:bold;">' + esc(m.role) + '</div></div></div>';
            }).join('');

            if (isAdmin && window.Sortable) {
                new Sortable(grid, {
                    handle: '.drag-handle', animation: 150, ghostClass: 'sortable-ghost',
                    onEnd: async function() {
                        const items = Array.from(grid.children);
                        for (var i=0; i<items.length; i++)
                            await updateDoc(doc(db,'team',items[i].dataset.id),{ order: i });
                        showToast('Порядок сохранён');
                    }
                });
            }
        });
        if (isAdmin) document.body.classList.add('admin-mode');
        else document.body.classList.remove('admin-mode');
    };

    window.openTeamModal = async function(id) {
        if (!id) id = '';
        document.getElementById('ed-team-id').value = id;
        if (id) {
            const snap = await getDoc(doc(db,'team',id));
            const d = snap.data();
            ['name','role','img','cat'].forEach(function(f){ document.getElementById('ad-m-'+f).value = d[f]||''; });
        } else {
            ['name','role','img','cat'].forEach(function(f){ document.getElementById('ad-m-'+f).value = ''; });
        }
        document.getElementById('m-team').style.display = 'flex';
    };

    window.saveTeam = async function() {
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

    window.delTeam = async function(id) {
        if (!confirm('Удалить участника?')) return;
        await deleteDoc(doc(db,'team',id));
        await window.loadTeam(); showToast('Удалён');
    };

    window.openTeamPage = async function(id) {
        const { isAdmin, userData } = getState();
        const cardSnap = await getDoc(doc(db,'team',id));
        curTM = Object.assign({ id }, cardSnap.data());
        navigate('team-page');
        document.getElementById('adm-tp-controls').style.display = isAdmin ? 'flex' : 'none';
        const isLinked = userData && userData.linkedCardId === id;
        document.getElementById('own-tp-controls').style.display = (isLinked&&!isAdmin) ? 'flex' : 'none';

        // Участие в релизах
        const credits = curTM.credits || [];
        let creditsHtml = '';
        if (credits.length) {
            creditsHtml = '<div style="margin-top:20px;"><h4 style="margin-bottom:12px;font-family:var(--font-display);font-size:1rem;color:var(--teal);">🎬 Участие в релизах</h4><div style="display:flex;flex-direction:column;gap:8px;">' +
                credits.map(function(c){
                    var roleLabel = '';
                    if (c.creditRole === 'voice') roleLabel = '<span style="color:var(--violet-light);">🎙 Озвучивал: ' + esc(c.character||'') + '</span>';
                    else if (c.creditRole === 'tech') roleLabel = '<span style="color:var(--teal-light);">⚙️ ' + esc(c.techRole||'Тех. часть') + '</span>';
                    else if (c.creditRole === 'curator') roleLabel = '<span style="color:#f59e0b;">👑 Куратор</span>';
                    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--input-bg);border-radius:10px;border:1px solid var(--border);">' +
                        (c.relImg ? '<img src="' + esc(c.relImg) + '" style="width:36px;height:50px;border-radius:6px;object-fit:cover;flex-shrink:0;">' : '') +
                        '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(c.relTitle||'Релиз') + '</div><div style="font-size:11px;margin-top:2px;">' + roleLabel + '</div></div>' +
                        (c.relId ? '<button class="btn btn-sm btn-outline" onclick="openView(\'' + c.relId + '\')" style="flex-shrink:0;"><i class="fas fa-play"></i></button>' : '') +
                        '</div>';
                }).join('') + '</div></div>';
        }

        document.getElementById('team-page-view').innerHTML = '<div style="display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;"><img src="' + esc(curTM.img) + '" style="width:230px;height:320px;border-radius:14px;object-fit:cover;border:2px solid var(--accent);box-shadow:var(--shadow);" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'"><div style="flex:1;min-width:280px;"><h1 style="font-size:2.2rem;margin-bottom:8px;">' + esc(curTM.name) + '</h1><h3 style="color:var(--accent);margin-bottom:18px;">' + esc(curTM.role) + '</h3><div style="background:var(--input-bg);padding:18px;border-radius:10px;border:1px solid var(--border);margin-bottom:18px;"><h4 style="margin-bottom:8px;color:var(--text-dim);">О себе:</h4><p style="line-height:1.6;font-size:14px;white-space:pre-wrap;">' + esc(curTM.bio||'Информация пока не добавлена.') + '</p></div>' + (curTM.social ? '<a href="' + esc(curTM.social) + '" target="_blank" class="btn btn-outline" style="text-decoration:none;"><i class="fas fa-link"></i> Соцсети</a>' : '') + creditsHtml + '</div></div>';

        // Кнопка управления кредитами для админа
        if (isAdmin) {
            const adminBlock = document.getElementById('adm-tp-controls');
            if (adminBlock) {
                // Добавим кнопку если её нет
                if (!adminBlock.querySelector('#btn-manage-credits')) {
                    const btn = document.createElement('button');
                    btn.id = 'btn-manage-credits';
                    btn.className = 'btn btn-outline';
                    btn.innerHTML = '<i class="fas fa-film"></i> Участие в релизах';
                    btn.onclick = function() { openCreditsModal(); };
                    adminBlock.appendChild(btn);
                }
            }
        }
    };

    // ── Управление кредитами (участие в релизах) ──
    window.openCreditsModal = async function() {
        if (!curTM) return;
        const relSnap = await getDocs(query(collection(db,'releases'), orderBy('timestamp','desc')));
        const allRels = relSnap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });

        const credits = curTM.credits || [];

        document.getElementById('credits-member-name').textContent = curTM.name;
        renderCreditsList(credits, allRels);

        // Заполняем select релизов
        const sel = document.getElementById('credit-rel-select');
        sel.innerHTML = '<option value="">— Выберите релиз —</option>' +
            allRels.map(function(r){ return '<option value="' + r.id + '" data-img="' + esc(r.img||'') + '" data-title="' + esc(r.title||'') + '">' + esc(r.title) + ' (' + esc(r.year) + ')</option>'; }).join('');

        document.getElementById('m-credits').style.display = 'flex';
    };

    function renderCreditsList(credits, allRels) {
        const list = document.getElementById('credits-list');
        if (!credits.length) {
            list.innerHTML = '<p style="font-size:12px;color:var(--text-dim);font-style:italic;">Нет записей</p>';
            return;
        }
        list.innerHTML = credits.map(function(c, idx){
            var roleStr = '';
            if (c.creditRole === 'voice') roleStr = '🎙 ' + (c.character ? 'Озвучивал: ' + c.character : 'Озвучивал');
            else if (c.creditRole === 'tech') roleStr = '⚙️ ' + (c.techRole||'Тех. часть');
            else if (c.creditRole === 'curator') roleStr = '👑 Куратор';
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--input-bg);border-radius:8px;border:1px solid var(--border);margin-bottom:6px;">' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(c.relTitle||'') + '</div><div style="font-size:11px;color:var(--text-dim);">' + roleStr + '</div></div>' +
                '<button class="btn-sm" style="background:#ef4444;flex-shrink:0;" onclick="removeCredit(' + idx + ')"><i class="fas fa-times"></i></button>' +
                '</div>';
        }).join('');
    }

    window.onCreditRoleChange = function() {
        const val = document.getElementById('credit-role-select').value;
        document.getElementById('credit-voice-block').style.display = (val === 'voice') ? 'block' : 'none';
        document.getElementById('credit-tech-block').style.display  = (val === 'tech')  ? 'block' : 'none';
    };

    window.addCredit = async function() {
        if (!curTM) return;
        const relSel  = document.getElementById('credit-rel-select');
        const relId   = relSel.value;
        if (!relId) return showToast('Выберите релиз!','error');
        const selOpt  = relSel.options[relSel.selectedIndex];
        const relTitle= selOpt.dataset.title || selOpt.text;
        const relImg  = selOpt.dataset.img   || '';
        const creditRole = document.getElementById('credit-role-select').value;

        const entry = { relId, relTitle, relImg, creditRole };
        if (creditRole === 'voice') {
            entry.character = (document.getElementById('credit-character').value||'').trim();
        }
        if (creditRole === 'tech') {
            entry.techRole = document.getElementById('credit-tech-role').value;
        }

        const credits = curTM.credits ? curTM.credits.slice() : [];
        credits.push(entry);
        await updateDoc(doc(db,'team',curTM.id),{ credits });
        curTM.credits = credits;

        const relSnap = await getDocs(query(collection(db,'releases'), orderBy('timestamp','desc')));
        const allRels = relSnap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
        renderCreditsList(credits, allRels);
        showToast('Добавлено!');
        // reset
        document.getElementById('credit-rel-select').value = '';
        document.getElementById('credit-role-select').value = 'voice';
        document.getElementById('credit-voice-block').style.display = 'block';
        document.getElementById('credit-tech-block').style.display  = 'none';
        document.getElementById('credit-character').value = '';
    };

    window.removeCredit = async function(idx) {
        if (!curTM) return;
        const credits = curTM.credits ? curTM.credits.slice() : [];
        credits.splice(idx, 1);
        await updateDoc(doc(db,'team',curTM.id),{ credits });
        curTM.credits = credits;
        const relSnap = await getDocs(query(collection(db,'releases'), orderBy('timestamp','desc')));
        const allRels = relSnap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
        renderCreditsList(credits, allRels);
        showToast('Удалено');
    };

    window.openTPModal = function() {
        if (!curTM) return;
        document.getElementById('tp-bio').value    = curTM.bio   ||'';
        document.getElementById('tp-social').value = curTM.social||'';
        document.getElementById('m-tp-edit').style.display = 'flex';
    };
    window.saveTP = async function() {
        if (!curTM) return;
        await updateDoc(doc(db,'team',curTM.id),{
            bio:    document.getElementById('tp-bio').value,
            social: document.getElementById('tp-social').value
        });
        closeModals(); await window.openTeamPage(curTM.id); showToast('Страница обновлена');
    };
    window.deleteTP = async function() {
        if (!curTM||!confirm('Удалить страницу?')) return;
        await updateDoc(doc(db,'team',curTM.id),{ bio:'', social:'' });
        showToast('Удалена'); navigate('team');
    };
    window.openMyTPEdit = function() {
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
    window.saveMyTP = async function() {
        const { userData } = getState();
        if (!curTM||!userData) return;
        const perms = userData.cardPerms||{};
        const updates = { bio: document.getElementById('my-tp-bio').value, social: document.getElementById('my-tp-social').value };
        if (perms.canEditName) updates.name = document.getElementById('my-tp-name').value;
        if (perms.canEditImg)  updates.img  = document.getElementById('my-tp-img').value;
        await updateDoc(doc(db,'team',curTM.id), updates);
        closeModals(); await window.openTeamPage(curTM.id); showToast('Страница обновлена!');
    };
    window.openAccessModal = function() {
        document.getElementById('access-email').value = '';
        document.getElementById('acc-name').checked   = false;
        document.getElementById('acc-img').checked    = false;
        document.getElementById('m-access').style.display = 'flex';
    };
    window.grantCardAccess = async function() {
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
