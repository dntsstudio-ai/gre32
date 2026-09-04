// ============================================================
//  js/admin_panel.js — Панель Admin: роли, статистика
// ============================================================

import {
    collection, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
    doc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals, ROLE_LABELS } from './core.js';

let _db, _auth, _getState;

// ── Список пользователей с ролями ──
async function loadRolesPanel() {
    const wrap = document.getElementById('admin-roles-list');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Загрузка...</p>';

    try {
        const snap = await getDocs(collection(_db, 'users'));
        const users = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => u.role && u.role !== 'user')
            .sort((a, b) => {
                const order = { admin:0, proxyadmin:1, developer:2, curator:3, moderator:4, dub:5, subber:6, previewer:7, editor:8, mixer:9 };
                return (order[a.role] ?? 9) - (order[b.role] ?? 9);
            });

        if (!users.length) {
            wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет пользователей с ролями</p>';
            return;
        }

        // Группируем по роли
        const groups = {};
        users.forEach(u => {
            if (!groups[u.role]) groups[u.role] = [];
            groups[u.role].push(u);
        });

        // FIX: не используем async в .map() — строим HTML синхронно
        let html = '';
        for (const [role, members] of Object.entries(groups)) {
            const rl = ROLE_LABELS[role] || { label: role.toUpperCase(), icon: 'fa-user' };
            html += `
            <div class="admin-role-group">
                <div class="admin-role-group-header">
                    <i class="fas ${rl.icon || 'fa-user'}"></i>
                    ${rl.label || role.toUpperCase()}
                    <span class="admin-role-count">${members.length}</span>
                </div>
                ${members.map(u => `
                <div class="admin-role-row">
                    <img src="${esc(u.avatar || 'https://api.dicebear.com/7.x/identicon/svg')}"
                         class="admin-role-ava" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                    <div class="admin-role-info">
                        <div class="admin-role-nick">${esc(u.nickname)}</div>
                        <div class="admin-role-email">${esc(u.email || '—')}</div>
                        ${u.curatorProject ? `<div class="admin-role-project">📁 ${esc(u.curatorProject)}</div>` : ''}
                    </div>
                    <div class="admin-role-actions">
                        <button class="btn btn-sm btn-outline" onclick="openUserProfile('${u.id}')">
                            <i class="fas fa-user"></i>
                        </button>
                        <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:rgba(239,68,68,0.4);"
                                onclick="quickRemoveRole('${u.id}','${esc(u.nickname)}')">
                            <i class="fas fa-user-minus"></i>
                        </button>
                    </div>
                </div>`).join('')}
            </div>`;
        }
        wrap.innerHTML = html;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;font-size:13px;padding:16px;">Ошибка: ${e.message}</p>`;
        console.error('loadRolesPanel:', e);
    }
}

window.quickRemoveRole = async function(uid, nick) {
    if (!confirm('Снять роль у ' + nick + '?')) return;
    try {
        await updateDoc(doc(_db, 'users', uid), { role: 'user', curatorProject: '' });
        showToast('Роль снята у ' + nick);
        loadRolesPanel();
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
};

// ── Статистика сайта ──
async function loadSiteStats() {
    const wrap = document.getElementById('stats-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> Загрузка статистики...</div>';

    try {
        const [usersSnap, relSnap] = await Promise.all([
            getDocs(collection(_db, 'users')),
            getDocs(collection(_db, 'releases')),
        ]);

        const totalUsers = usersSnap.size;
        const totalRels  = relSnap.size;

        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const onlineUsers = usersSnap.docs.filter(d => (d.data().lastSeen || 0) > fiveMinAgo).length;

        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayUsers = usersSnap.docs.filter(d => (d.data().createdAt || 0) > todayStart.getTime()).length;

        const totalMinutes = usersSnap.docs.reduce((acc, d) => acc + (d.data().totalMinutes || 0), 0);

        const statsDoc = await getDoc(doc(_db, 'settings', 'siteStats'));
        const stats = statsDoc.exists() ? statsDoc.data() : {};

        const onlineList = usersSnap.docs
            .filter(d => (d.data().lastSeen || 0) > fiveMinAgo)
            .map(d => {
                const u = d.data();
                return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
                    <span class="online-dot"></span>
                    <img src="${esc(u.avatar || 'https://api.dicebear.com/7.x/identicon/svg')}"
                         style="width:30px;height:30px;border-radius:50%;object-fit:cover;"
                         onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                    <span style="font-size:13px;font-weight:700;">${esc(u.nickname)}</span>
                    <span style="font-size:11px;color:var(--text-dim);margin-left:auto;">${u.role || 'user'}</span>
                </div>`;
            }).join('') || '<p style="color:var(--text-dim);font-size:13px;">Никого онлайн</p>';

        wrap.innerHTML = `
        <div class="stats-grid">
            <div class="stats-card stats-card--online">
                <div class="stats-card-icon">🟢</div>
                <div class="stats-card-val">${onlineUsers}</div>
                <div class="stats-card-label">Онлайн сейчас</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">👥</div>
                <div class="stats-card-val">${totalUsers}</div>
                <div class="stats-card-label">Всего пользователей</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">🆕</div>
                <div class="stats-card-val">${todayUsers}</div>
                <div class="stats-card-label">Регистраций сегодня</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">🎬</div>
                <div class="stats-card-val">${totalRels}</div>
                <div class="stats-card-label">Релизов на сайте</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">⏱</div>
                <div class="stats-card-val">${Math.round(totalMinutes / 60)}ч</div>
                <div class="stats-card-label">Суммарное время</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">👁</div>
                <div class="stats-card-val">${stats.totalPageViews || 0}</div>
                <div class="stats-card-label">Просмотров страниц</div>
            </div>
        </div>
        <div style="background:var(--card-bg);padding:20px;border-radius:var(--radius);border:1px solid var(--border);margin-top:22px;">
            <h4 style="font-size:14px;margin-bottom:14px;font-family:var(--font-display);">Активные пользователи</h4>
            <div id="stats-online-list">${onlineList}</div>
        </div>`;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;padding:16px;">Ошибка загрузки статистики: ${e.message}</p>`;
        console.error('loadSiteStats:', e);
    }
}

// ── Обновить lastSeen ──
export async function updateLastSeen(uid) {
    if (!uid || !_db) return;
    try {
        await updateDoc(doc(_db, 'users', uid), { lastSeen: Date.now() });
    } catch(e) {}
}

// ── Счётчик страниц ──
export async function incrementPageView() {
    if (!_db) return;
    try {
        const ref = doc(_db, 'settings', 'siteStats');
        const snap = await getDoc(ref);
        if (snap.exists()) {
            await updateDoc(ref, { totalPageViews: (snap.data().totalPageViews || 0) + 1 });
        } else {
            await setDoc(ref, { totalPageViews: 1 });
        }
    } catch(e) {}
}

// ── Учёт времени на сайте ──
export function startSessionTimer(uid) {
    if (!uid || !_db) return;
    const interval = setInterval(async () => {
        if (!document.hidden) {
            await updateLastSeen(uid);
            try {
                const snap = await getDoc(doc(_db, 'users', uid));
                const cur = snap.exists() ? (snap.data().totalMinutes || 0) : 0;
                await updateDoc(doc(_db, 'users', uid), { totalMinutes: cur + 2 });
            } catch(e) {}
        }
    }, 2 * 60 * 1000);
    window.addEventListener('beforeunload', () => clearInterval(interval));
}

export function bindAdminPanel(db, auth, getState) {
    _db = db; _auth = auth; _getState = getState;

    window.openAdminRolesPanel = function() {
        document.getElementById('m-admin-roles').style.display = 'flex';
        loadRolesPanel();
    };

    window.loadStatsPage = function() { loadSiteStats(); };
}
