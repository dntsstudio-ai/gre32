// ============================================================
//  js/admin_panel.js — Панель Admin: роли, статистика, куки
// ============================================================

import {
    collection, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
    doc, query, where, orderBy, limit, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals, ROLE_LABELS } from './core.js';

let _db, _auth, _getState;

// ── Список пользователей с ролями ──
async function loadRolesPanel() {
    const wrap = document.getElementById('admin-roles-list');
    if (!wrap) return;
    wrap.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Загрузка ролей...</div>';

    try {
        // ИСПРАВЛЕНИЕ: Запрашиваем только тех, у кого роль НЕ user (экономит лимиты и обходит лимиты чтения)
        const q = query(collection(_db, 'users'), where('role', '!=', 'user'));
        const snap = await getDocs(q);
        
        const users = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a,b) => {
                const order = {admin:0,curator:1,moderator:2,dub:3,subber:4,previewer:5,editor:6,mixer:7};
                return (order[a.role]??9) - (order[b.role]??9);
            });

        if (!users.length) {
            wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет пользователей с ролями</p>';
            return;
        }

        const groups = {};
        users.forEach(u => {
            if (!groups[u.role]) groups[u.role] = [];
            groups[u.role].push(u);
        });

        wrap.innerHTML = Object.entries(groups).map(([role, members]) => {
            const rl = ROLE_LABELS[role] || { label: role.toUpperCase(), icon:'fa-user' };
            return `
            <div class="admin-role-group">
                <div class="admin-role-group-header">
                    <i class="fas ${rl.icon||'fa-user'}"></i>
                    ${rl.label||role.toUpperCase()} <span class="admin-role-count">${members.length}</span>
                </div>
                ${members.map(u => `
                <div class="admin-role-row">
                    <img src="${esc(u.avatar||'https://api.dicebear.com/7.x/identicon/svg')}"
                         class="admin-role-ava" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg'">
                    <div class="admin-role-info">
                        <div class="admin-role-nick">${esc(u.nickname)}</div>
                        <div class="admin-role-email">${esc(u.email||'—')}</div>
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
        }).join('');
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;font-size:13px;padding:20px;">Ошибка: ${e.message}</p>`;
    }
}

window.quickRemoveRole = async function(uid, nick) {
    if (!confirm('Снять роль у ' + nick + '?')) return;
    await updateDoc(doc(_db,'users',uid), { role:'user', curatorProject:'' });
    showToast('Роль снята у ' + nick);
    loadRolesPanel();
};

// ── Статистика сайта ──
async function loadSiteStats() {
    const wrap = document.getElementById('stats-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> Загрузка статистики...</div>';

    try {
        // ИСПРАВЛЕНИЕ: Используем getCountFromServer, чтобы не выкачивать всю БД и не получать ошибку прав
        const [usersCountSnap, relCountSnap, statsDoc, onlineSnap] = await Promise.all([
            getCountFromServer(collection(_db, 'users')),
            getCountFromServer(collection(_db, 'releases')),
            getDoc(doc(_db, 'settings', 'siteStats')), // Берем из doc, а не из collection!
            getDocs(query(collection(_db, 'users'), where('lastSeen', '>', Date.now() - 5 * 60 * 1000))) // Онлайн за 5 мин
        ]);

        const totalUsers = usersCountSnap.data().count;
        const totalRels  = relCountSnap.data().count;
        const onlineUsers = onlineSnap.size;
        const stats = statsDoc.exists() ? statsDoc.data() : {};

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
                <div class="stats-card-icon">🎬</div>
                <div class="stats-card-val">${totalRels}</div>
                <div class="stats-card-label">Релизов на сайте</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-icon">👁</div>
                <div class="stats-card-val">${stats.totalPageViews||0}</div>
                <div class="stats-card-label">Просмотров страниц</div>
            </div>
        </div>

        <div style="background:var(--card-bg);padding:20px;border-radius:var(--radius);border:1px solid var(--border);margin-top:22px;">
            <h4 style="font-size:14px;margin-bottom:14px;font-family:var(--font-display);">Активные пользователи (Онлайн)</h4>
            <div id="stats-online-list">
                ${onlineSnap.docs.map(d => {
                        const u = d.data();
                        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
                            <span class="online-dot"></span>
                            <img src="${esc(u.avatar||'https://api.dicebear.com/7.x/identicon/svg')}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                            <span style="font-size:13px;font-weight:700;">${esc(u.nickname)}</span>
                            <span style="font-size:11px;color:var(--text-dim);margin-left:auto;">${u.role||'user'}</span>
                        </div>`;
                    }).join('') || '<p style="color:var(--text-dim);font-size:13px;">Никого онлайн</p>'}
            </div>
        </div>`;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;padding:20px;">Ошибка загрузки статистики: ${e.message}</p>`;
    }
}

export async function updateLastSeen(uid) {
    if (!uid) return;
    try { await updateDoc(doc(_db,'users',uid), { lastSeen: Date.now() }); } catch(e) {}
}

export async function incrementPageView() {
    try {
        const ref = doc(_db,'settings','siteStats');
        const snap = await getDoc(ref);
        if (snap.exists()) {
            await updateDoc(ref, { totalPageViews: (snap.data().totalPageViews||0)+1 });
        } else {
            await setDoc(ref, { totalPageViews: 1 });
        }
    } catch(e) {}
}

let _sessionStart = Date.now();
export function startSessionTimer(uid) {
    if (!uid) return;
    _sessionStart = Date.now();
    const interval = setInterval(async () => {
        if (!document.hidden) {
            await updateLastSeen(uid);
            try {
                const uDoc = await getDoc(doc(_db,'users',uid));
                await updateDoc(doc(_db,'users',uid), {
                    totalMinutes: (uDoc.data()?.totalMinutes || 0) + 2
                });
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
    window.openSiteStats = function() {
        window.navigate('stats');
        loadSiteStats();
    };
    window.loadStatsPage = function() { loadSiteStats(); };
}
