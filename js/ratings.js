// ============================================================
//  js/ratings.js — Система оценок даберов (исправленная)
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc,
    updateDoc, deleteDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, canEditRatings, canAccessRatings } from './core.js';
import { PLACEHOLDER_TEAM_IMG } from '../config/config.js';

// Категории оборудования (5 штук × макс 20 баллов = 100)
const EQUIPMENT_CATS = [
    { key: 'mic',        label: 'Микрофон',            icon: 'fa-microphone'  },
    { key: 'interface',  label: 'Аудиоинтерфейс',      icon: 'fa-plug'        },
    { key: 'room',       label: 'Акустика / Помещение', icon: 'fa-home'        },
    { key: 'headphones', label: 'Наушники / Мониторы',  icon: 'fa-headphones'  },
    { key: 'software',   label: 'ПО / DAW',             icon: 'fa-laptop-code' },
];

const RANKS = [
    { name:'S+', min:90, color:'#c084fc', glow:'rgba(192,132,252,0.4)' },
    { name:'S',  min:80, color:'#a78bfa', glow:'rgba(167,139,250,0.4)' },
    { name:'A+', min:72, color:'#34d399', glow:'rgba(52,211,153,0.4)'  },
    { name:'A',  min:64, color:'#10b981', glow:'rgba(16,185,129,0.4)'  },
    { name:'B+', min:56, color:'#5eead4', glow:'rgba(94,234,212,0.4)'  },
    { name:'B',  min:48, color:'#14b8a6', glow:'rgba(20,184,166,0.4)'  },
    { name:'C+', min:40, color:'#60a5fa', glow:'rgba(96,165,250,0.4)'  },
    { name:'C',  min:32, color:'#3b82f6', glow:'rgba(59,130,246,0.4)'  },
    { name:'D+', min:24, color:'#fbbf24', glow:'rgba(251,191,36,0.4)'  },
    { name:'D',  min:16, color:'#f59e0b', glow:'rgba(245,158,11,0.4)'  },
    { name:'E+', min:10, color:'#f97316', glow:'rgba(249,115,22,0.4)'  },
    { name:'E',  min:5,  color:'#ef4444', glow:'rgba(239,68,68,0.4)'   },
    { name:'F',  min:0,  color:'#6b7280', glow:'rgba(107,114,128,0.4)' },
];

function getMaxScore() { return EQUIPMENT_CATS.length * 20; }

function calcRank(scores) {
    const total = EQUIPMENT_CATS.reduce(function(acc, c) { return acc + (scores[c.key] || 0); }, 0);
    const pct   = Math.round((total / getMaxScore()) * 100);
    const rank  = RANKS.find(function(r) { return pct >= r.min; }) || RANKS[RANKS.length - 1];
    return { total, pct, rank };
}

function rankBadge(rank) {
    return '<span class="rank-badge" style="background:' + rank.color + ';box-shadow:0 0 16px ' + rank.glow + ';">' + rank.name + '</span>';
}

// Текущая редактируемая карточка
let _currentRatingId = null;

export function bindRatings(db, auth, getState) {

    // ── Загрузить страницу ──
    window.loadRatingsPage = async function() {
        const { userData } = getState();
        if (!canAccessRatings(userData)) return;
        const isAdmin = canEditRatings(userData);

        const wrap = document.getElementById('ratings-wrap');
        if (!wrap) return;
        wrap.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px 0;">Загрузка...</p>';

        const snap  = await getDocs(query(collection(db, 'ratings'), orderBy('createdAt', 'desc')));
        const cards = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });

        const adminBtns = isAdmin
            ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;">' +
              '<button class="btn btn-blue" onclick="openRatingAddModal()"><i class="fas fa-plus"></i> Добавить дабера</button>' +
              '<button class="btn btn-outline" onclick="openRatingFromTeam()"><i class="fas fa-users"></i> Выбрать из состава</button>' +
              '</div>'
            : '';

        if (!cards.length) {
            wrap.innerHTML = adminBtns +
                '<div style="text-align:center;padding:60px 20px;color:var(--text-dim);">' +
                '<i class="fas fa-star" style="font-size:3rem;opacity:0.2;display:block;margin-bottom:16px;color:var(--violet);"></i>' +
                '<p style="font-size:1rem;font-weight:700;font-family:var(--font-display);">Нет карточек оценки</p>' +
                '<span style="font-size:13px;font-style:italic;">Администратор добавит первую карточку</span></div>';
            return;
        }

        wrap.innerHTML = adminBtns + '<div class="ratings-grid">' +
            cards.map(function(c) {
                const { rank } = calcRank(c.scores || {});
                return '<div class="rating-card" onclick="openRatingDetail(\'' + c.id + '\')">' +
                    '<div class="rating-card-inner">' +
                    '<img src="' + esc(c.img || PLACEHOLDER_TEAM_IMG) + '" class="rating-card-ava" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'">' +
                    '<div class="rating-card-info">' +
                    '<div class="rating-card-name">' + esc(c.name) + '</div>' +
                    '<div class="rating-card-role">' + esc(c.role || 'Актёр дубляжа') + '</div>' +
                    rankBadge(rank) +
                    '</div>' +
                    '</div></div>';
            }).join('') + '</div>';
    };

    // ── Открыть детальную карточку ──
    window.openRatingDetail = async function(id) {
        const { userData } = getState();
        if (!canAccessRatings(userData)) return;
        const isAdmin = canEditRatings(userData);
        _currentRatingId = id;

        const snap = await getDoc(doc(db, 'ratings', id));
        if (!snap.exists()) return showToast('Карточка не найдена', 'error');
        const c      = Object.assign({ id }, snap.data());
        const scores = c.scores || {};
        const { total, pct, rank } = calcRank(scores);

        // Шапка
        const rdAva  = document.getElementById('rd-ava');
        const rdName = document.getElementById('rd-name');
        const rdRole = document.getElementById('rd-role');
        const rdRank = document.getElementById('rd-rank-badge');
        const rdTotal= document.getElementById('rd-score-total');
        const rdNote = document.getElementById('rd-equip-note');
        const rdTbl  = document.getElementById('rd-equip-table');
        const rdPrev = document.getElementById('rd-preview-btn');
        const rdSave = document.getElementById('rd-save-btn');
        const rdDel  = document.getElementById('rd-delete-btn');

        if (rdAva)   rdAva.src = c.img || PLACEHOLDER_TEAM_IMG;
        if (rdName)  rdName.textContent  = c.name;
        if (rdRole)  rdRole.textContent  = c.role || 'Актёр дубляжа';
        if (rdRank)  rdRank.innerHTML    = rankBadge(rank);
        if (rdTotal) rdTotal.textContent = total + ' / ' + getMaxScore() + ' (' + pct + '%)';
        if (rdNote)  rdNote.value        = c.equipNote || '';

        // Таблица оборудования
        if (rdTbl) {
            rdTbl.innerHTML = '<thead><tr>' +
                '<th style="text-align:left;padding:6px 12px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Категория</th>' +
                '<th style="padding:6px 12px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Прогресс</th>' +
                '<th style="padding:6px 12px;text-align:right;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Баллы</th>' +
                (isAdmin ? '<th style="padding:6px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Изм.</th>' : '') +
                '</tr></thead><tbody>' +
                EQUIPMENT_CATS.map(function(cat) {
                    const score = Math.min(20, Math.max(0, scores[cat.key] || 0));
                    const pctW  = Math.round((score / 20) * 100);
                    return '<tr style="border-top:1px solid rgba(124,58,237,0.1);">' +
                        '<td style="padding:10px 12px;font-size:12px;color:var(--text-dim);white-space:nowrap;">' +
                        '<i class="fas ' + cat.icon + '" style="margin-right:8px;color:var(--violet-light);width:14px;"></i>' + cat.label + '</td>' +
                        '<td style="padding:10px 12px;">' +
                        '<div style="background:var(--input-bg);border-radius:6px;height:8px;overflow:hidden;">' +
                        '<div style="width:' + pctW + '%;height:100%;background:linear-gradient(90deg,var(--violet),var(--teal));border-radius:6px;transition:width 0.6s ease;"></div>' +
                        '</div></td>' +
                        '<td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;color:var(--text);">' + score + '<span style="font-size:10px;color:var(--text-dim);font-weight:400;">/20</span></td>' +
                        (isAdmin
                            ? '<td style="padding:10px 6px;">' +
                              '<input type="number" min="0" max="20" value="' + score + '" id="score-' + cat.key + '"' +
                              ' style="width:56px;margin:0;padding:4px 8px;font-size:12px;text-align:center;"' +
                              ' oninput="previewRank()">' +
                              '</td>'
                            : '') +
                        '</tr>';
                }).join('') + '</tbody>';
        }

        // Кнопки (только для admin)
        if (rdPrev) rdPrev.style.display = isAdmin ? 'block' : 'none';
        if (rdSave) {
            rdSave.style.display = isAdmin ? 'block' : 'none';
            rdSave.onclick = function() { saveRatingScores(id); };
        }
        if (rdDel) {
            rdDel.style.display = isAdmin ? 'block' : 'none';
            rdDel.onclick = function() { deleteRating(id); };
        }

        document.getElementById('m-rating-detail').style.display = 'flex';
    };

    // ── Предпросмотр ранга при изменении баллов ──
    window.previewRank = function() {
        const scores = {};
        EQUIPMENT_CATS.forEach(function(cat) {
            const el = document.getElementById('score-' + cat.key);
            scores[cat.key] = el ? Math.min(20, Math.max(0, parseInt(el.value) || 0)) : 0;
        });
        const { total, pct, rank } = calcRank(scores);
        const rdRank  = document.getElementById('rd-rank-badge');
        const rdTotal = document.getElementById('rd-score-total');
        if (rdRank)  rdRank.innerHTML    = rankBadge(rank);
        if (rdTotal) rdTotal.textContent = total + ' / ' + getMaxScore() + ' (' + pct + '%)';
    };

    // ── Сохранить оценки ──
    async function saveRatingScores(id) {
        const scores = {};
        EQUIPMENT_CATS.forEach(function(cat) {
            const el = document.getElementById('score-' + cat.key);
            scores[cat.key] = el ? Math.min(20, Math.max(0, parseInt(el.value) || 0)) : 0;
        });
        const noteEl = document.getElementById('rd-equip-note');
        const note   = noteEl ? noteEl.value : '';
        try {
            await updateDoc(doc(db, 'ratings', id), { scores, equipNote: note, updatedAt: Date.now() });
            showToast('Оценки сохранены! ✅');
            closeModals();
            window.loadRatingsPage();
        } catch(e) {
            console.error(e);
            showToast('Ошибка сохранения: ' + e.message, 'error');
        }
    }

    // ── Удалить карточку ──
    async function deleteRating(id) {
        if (!confirm('Удалить карточку оценки?')) return;
        try {
            await deleteDoc(doc(db, 'ratings', id));
            showToast('Карточка удалена');
            closeModals();
            window.loadRatingsPage();
        } catch(e) {
            showToast('Ошибка удаления: ' + e.message, 'error');
        }
    }

    // ── Открыть форму добавления нового дабера ──
    window.openRatingAddModal = function() {
        const fields = ['ra-name', 'ra-role', 'ra-img', 'ra-note'];
        fields.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('m-rating-add').style.display = 'flex';
    };

    // ── Сохранить нового дабера (ручной ввод) ──
    window.saveRatingNew = async function() {
        const name = (document.getElementById('ra-name')?.value || '').trim();
        const role = (document.getElementById('ra-role')?.value || '').trim();
        const img  = (document.getElementById('ra-img')?.value  || '').trim();
        const note = (document.getElementById('ra-note')?.value || '').trim();
        if (!name) return showToast('Введите имя!', 'error');
        try {
            await addDoc(collection(db, 'ratings'), {
                name,
                role:      role || 'Актёр дубляжа',
                img,
                equipNote: note,
                scores:    {},
                createdAt: Date.now(),
                teamId:    ''
            });
            showToast('Карточка создана!');
            closeModals();
            window.loadRatingsPage();
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
        }
    };

    // ── Выбрать дабера из состава ──
    window.openRatingFromTeam = async function() {
        const listEl = document.getElementById('rft-list');
        if (!listEl) return;
        listEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px;">Загрузка...</p>';
        document.getElementById('m-rating-from-team').style.display = 'flex';

        try {
            const snap = await getDocs(query(collection(db, 'team'), orderBy('order')));
            const members = snap.docs
                .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
                .filter(function(m) {
                    const cat  = (m.cat  || '').toLowerCase();
                    const role = (m.role || '').toLowerCase();
                    return cat.includes('актёр') || cat.includes('дабер') ||
                           role.includes('дабер') || role.includes('актёр') || role.includes('дублёр');
                });

            if (!members.length) {
                listEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет участников в категории «Актёр дубляжа».<br><span style="font-size:11px;opacity:0.7;">Убедитесь, что в карточке указана правильная категория.</span></p>';
                return;
            }

            // Получаем уже добавленных
            const existSnap  = await getDocs(collection(db, 'ratings'));
            const existIds   = existSnap.docs.map(function(d) { return d.data().teamId; }).filter(Boolean);

            listEl.innerHTML = members.map(function(m) {
                const already = existIds.includes(m.id);
                return '<div class="rft-item" style="' + (already ? 'opacity:0.5;pointer-events:none;' : '') + '" onclick="addRatingFromMember(\'' + m.id + '\',\'' + esc(m.name) + '\',\'' + esc(m.role) + '\',\'' + esc(m.img || '') + '\')">' +
                    '<img src="' + esc(m.img || PLACEHOLDER_TEAM_IMG) + '" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1px solid var(--border);" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:700;font-size:13px;">' + esc(m.name) + '</div>' +
                    '<div style="font-size:11px;color:var(--text-dim);">' + esc(m.role) + '</div>' +
                    '</div>' +
                    (already
                        ? '<span style="font-size:10px;color:var(--text-dim);">Уже добавлен</span>'
                        : '<i class="fas fa-plus-circle" style="color:var(--teal);font-size:18px;"></i>') +
                    '</div>';
            }).join('');
        } catch(e) {
            listEl.innerHTML = '<p style="color:#ef4444;font-size:13px;padding:16px;">Ошибка загрузки: ' + e.message + '</p>';
        }
    };

    window.addRatingFromMember = async function(teamId, name, role, img) {
        try {
            await addDoc(collection(db, 'ratings'), {
                name, role, img,
                equipNote: '',
                scores:    {},
                createdAt: Date.now(),
                teamId
            });
            showToast(name + ' добавлен!');
            closeModals();
            window.loadRatingsPage();
        } catch(e) {
            showToast('Ошибка: ' + e.message, 'error');
        }
    };
}
