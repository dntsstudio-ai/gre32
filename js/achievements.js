// ============================================================
//  js/achievements.js — Достижения: ручные + авто
// ============================================================

import {
    doc, getDocs, updateDoc, collection, query, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, showAchievementPopup } from './core.js?v=20260906b';
import { AUTO_ACHIEVEMENTS } from '../config/config.js?v=20260906b';

let viewAchRealIdx = -1;

export function renderAchProfile(userData) {
    if (!userData) return;
    const el = document.getElementById('u-ach');
    if (!el) return;

    const allAchs = userData.achievements || [];
    const visible = allAchs
        .map((a, realIdx) => ({ ...a, realIdx }))
        .filter(a => !a.hidden);

    if (!visible.length) {
        el.innerHTML = '<p style="font-size:12px;color:var(--text-dim);">Пока нет достижений.</p>';
        return;
    }

    el.innerHTML = visible.map(a => {
        const div = document.createElement('div');
        div.className = 'ach-chip';
        div.title = a.name;
        div.textContent = a.img;
        div.setAttribute('onclick', `viewAch(${a.realIdx})`);
        return div.outerHTML;
    }).join('');
}

export async function checkAndAwardAch(db, auth, userData, trigger) {
    if (!userData || !auth.currentUser) return;
    const def = AUTO_ACHIEVEMENTS.find(a => a.trigger === trigger);
    if (!def) return;
    const already = (userData.achievements || []).find(a => a.id === def.id);
    if (already) return;
    const newAch = {
        id: def.id, name: def.name, desc: def.desc, img: def.img,
        date: Date.now(), hidden: false, giver: 'Система'
    };
    userData.achievements = [...(userData.achievements || []), newAch];
    try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { achievements: userData.achievements });
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        showAchievementPopup(newAch, isFs);
        renderAchProfile(userData);
    } catch(e) { console.warn('checkAndAwardAch:', e); }
}

export function bindAchievements(db, auth, getState) {

    window.openAchInventory = () => {
        const { userData } = getState();
        if (!userData) return;
        const achs = userData.achievements || [];

        document.getElementById('ach-inv-list').innerHTML = achs.map((a, i) => {
            const div = document.createElement('div');
            div.className = 'ach-inv-item';
            div.style.borderColor  = a.hidden ? '#ef4444' : 'var(--accent)';
            div.style.opacity      = a.hidden ? '0.5' : '1';
            div.setAttribute('onclick', `toggleAchVisibility(${i})`);
            div.innerHTML = `<div style="font-size:26px;margin-bottom:5px;"></div>
                <div style="font-size:10px;font-weight:bold;">${esc(a.name)}</div>
                <div style="font-size:9px;color:var(--text-dim);margin-top:4px;text-decoration:underline;"
                     onclick="event.stopPropagation();viewAch(${i})">Подробнее</div>`;
            div.querySelector('div').textContent = a.img;
            return div.outerHTML;
        }).join('');

        document.getElementById('m-ach-inv').style.display = 'flex';
    };

    window.toggleAchVisibility = async (realIdx) => {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        userData.achievements[realIdx].hidden = !userData.achievements[realIdx].hidden;
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { achievements: userData.achievements });
            window.openAchInventory();
            renderAchProfile(userData);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.viewAch = (realIdx) => {
        const { userData } = getState();
        if (!userData) return;
        viewAchRealIdx = realIdx;
        const a = userData.achievements[realIdx];
        if (!a) return;

        const imgEl  = document.getElementById('ach-v-img');
        const nameEl = document.getElementById('ach-v-name');
        const descEl = document.getElementById('ach-v-desc');
        const metaEl = document.getElementById('ach-v-meta');
        const delBtn = document.getElementById('btn-ach-del');

        if (imgEl)  imgEl.textContent  = a.img;
        if (nameEl) nameEl.textContent = a.name;
        if (descEl) descEl.textContent = a.desc;
        if (metaEl) metaEl.innerHTML =
            `<b>Получено:</b> ${new Date(a.date).toLocaleDateString()}<br>` +
            `<b>От:</b> ${esc(a.giver || 'Система')}`;

        if (delBtn) delBtn.style.display = 'block';
        document.getElementById('m-ach-inv').style.display = 'none';
        document.getElementById('m-ach-view').style.display = 'flex';
    };

    window.deleteAchievement = async () => {
        if (!confirm('Удалить достижение НАВСЕГДА?')) return;
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        userData.achievements.splice(viewAchRealIdx, 1);
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { achievements: userData.achievements });
            showToast('Достижение удалено!');
            closeModals();
            renderAchProfile(userData);
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.giveAch = async () => {
        const { userData } = getState();
        if (!userData) return;
        const email = document.getElementById('ga-uid')?.value.trim();
        if (!email) return showToast('Введите email!', 'error');
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (snap.empty) return showToast('Пользователь не найден!', 'error');
            const uRef = doc(db, 'users', snap.docs[0].id);
            const achs = [...(snap.docs[0].data().achievements || [])];
            achs.push({
                id:    'manual_' + Date.now(),
                name:  document.getElementById('ga-name')?.value || '',
                desc:  document.getElementById('ga-desc')?.value || '',
                img:   document.getElementById('ga-img')?.value  || '<i class="fas fa-medal"></i>',
                date:  Date.now(), hidden: false, giver: userData.nickname
            });
            await updateDoc(uRef, { achievements: achs });
            showToast('Достижение выдано!');
            closeModals();
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
}
