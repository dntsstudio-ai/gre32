// ============================================================
//  js/ratings.js — Система оценок даберов
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc,
    setDoc, updateDoc, deleteDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, canEditRatings, canAccessRatings } from './core.js';
import { PLACEHOLDER_TEAM_IMG } from '../config/config.js';

// Категории оборудования
const EQUIPMENT_CATS = [
    { key: 'mic',       label: 'Микрофон',       icon: 'fa-microphone' },
    { key: 'interface', label: 'Аудиоинтерфейс', icon: 'fa-plug' },
    { key: 'room',      label: 'Акустика / Помещение', icon: 'fa-home' },
    { key: 'headphones',label: 'Наушники / Мониторы',  icon: 'fa-headphones' },
    { key: 'software',  label: 'ПО / DAW',        icon: 'fa-laptop-code' },
];

// Ранги по суммарным баллам
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

function getMaxScore() { return EQUIPMENT_CATS.length * 20; } // 5 кат × 20 = 100

function calcRank(scores) {
    const total = EQUIPMENT_CATS.reduce(function(acc, c){ return acc + (scores[c.key]||0); }, 0);
    const pct   = Math.round((total / getMaxScore()) * 100);
    const rank  = RANKS.find(function(r){ return pct >= r.min; }) || RANKS[RANKS.length - 1];
    return { total, pct, rank };
}

function rankBadge(rank) {
    return '<span class="rank-badge" style="background:' + rank.color + ';box-shadow:0 0 16px ' + rank.glow + ';">' + rank.name + '</span>';
}

export function bindRatings(db, auth, getState) {

    window.loadRatingsPage = async function() {
        const { userData } = getState();
        if (!canAccessRatings(userData)) return;
        const isAdmin = canEditRatings(userData);

        const snap  = await getDocs(query(collection(db,'ratings'), orderBy('createdAt','desc')));
        const cards = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });

        const wrap = document.getElementById('ratings-wrap');
        if (!wrap) return;

        const adminBtn = isAdmin
            ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;"><button class="btn btn-blue" onclick="openRatingAddModal()"><i class="fas fa-plus"></i> Добавить дабера</button><button class="btn btn-outline" onclick="openRatingFromTeam()"><i class="fas fa-users"></i> Выбрать из состава</button></div>'
            : '';

        if (!cards.length) {
            wrap.innerHTML = adminBtn + '<div style="text-align:center;padding:60px 20px;color:var(--text-dim);"><i class="fas fa-star" style="font-size:3rem;opacity:0.2;display:block;margin-bottom:16px;color:var(--violet);"></i><p style="font-size:1rem;font-weight:700;font-family:var(--font-display);">Нет карточек оценки</p><span style="font-size:13px;font-style:italic;">Администратор добавит первую карточку</span></div>';
            return;
        }

        wrap.innerHTML = adminBtn + '<div class="ratings-grid">' +
            cards.map(function(c){
                const { rank } = calcRank(c.scores||{});
                return '<div class="rating-card" onclick="openRatingDetail(\'' + c.id + '\')">' +
                    '<div class="rating-card-inner">' +
                    '<img src="' + esc(c.img||PLACEHOLDER_TEAM_IMG) + '" class="rating-card-ava" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'">' +
                    '<div class="rating-card-info">' +
                    '<div class="rating-card-name">' + esc(c.name) + '</div>' +
                    '<div class="rating-card-role">' + esc(c.role||'Актёр дубляжа') + '</div>' +
                    rankBadge(rank) +
                    '</div></div></div>';
            }).join('') + '</div>';
    };

    window.openRatingDetail = async function(id) {
        const { userData } = getState();
        if (!canAccessRatings(userData)) return;
        const isAdmin = canEditRatings(userData);

        const snap = await getDoc(doc(db,'ratings',id));
        if (!snap.exists()) return;
        const c = Object.assign({ id }, snap.data());
        const scores = c.scores||{};
        const { total, pct, rank } = calcRank(scores);

        const equipRows = EQUIPMENT_CATS.map(function(cat){
            const score = scores[cat.key]||0;
            const pctW  = Math.round((score/20)*100);
            return '<tr><td style="padding:8px 12px;font-size:12px;color:var(--text-dim);white-space:nowrap;"><i class="fas ' + cat.icon + '" style="margin-right:6px;color:var(--violet-light);"></i>' + cat.label + '</td>' +
                '<td style="padding:8px 12px;"><div style="background:var(--input-bg);border-radius:6px;height:8px;overflow:hidden;"><div style="width:' + pctW + '%;height:100%;background:linear-gradient(90deg,var(--violet),var(--teal));border-radius:6px;transition:width 0.6s ease;"></div></div></td>' +
                '<td style="padding:8px 12px;text-align:right;font-weight:700;font-size:13px;">' + score + '/20</td>' +
                (isAdmin ? '<td style="padding:8px 6px;"><input type="number" min="0" max="20" value="' + score + '" id="score-' + cat.key + '" style="width:60px;margin:0;padding:4px 8px;font-size:12px;" onchange="previewRank()"></td>' : '') +
                '</tr>';
        }).join('');

        document.getElementById('rd-name').textContent  = c.name;
        document.getElementById('rd-role').textContent  = c.role||'Актёр дубляжа';
        document.getElementById('rd-ava').src           = c.img||PLACEHOLDER_TEAM_IMG;
        document.getElementById('rd-rank-badge').innerHTML = rankBadge(rank);
        document.getElementById('rd-score-total').textContent = total + '/' + getMaxScore() + ' (' + pct + '%)';
        document.getElementById('rd-equip-note').textContent  = c.equipNote||'';
        document.getElementById('rd-equip-table').innerHTML   = equipRows;
        document.getElementById('rd-preview-btn').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('rd-save-btn').style.display  = isAdmin ? 'block' : 'none';
        document.getElementById('rd-delete-btn').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('rd-save-btn').onclick = function() { saveRatingScores(id); };
        document.getElementById('rd-delete-btn').onclick = function() { deleteRating(id); };
        document.getElementById('m-rating-detail').style.display = 'flex';
        window._currentRatingId = id;
    };

    window.previewRank = function() {
        const scores = {};
        EQUIPMENT_CATS.forEach(function(cat){
            const el = document.getElementById('score-' + cat.key);
            scores[cat.key] = el ? Math.min(20, Math.max(0, parseInt(el.value)||0)) : 0;
        });
        const { total, pct, rank } = calcRank(scores);
        document.getElementById('rd-rank-badge').innerHTML    = rankBadge(rank);
        document.getElementById('rd-score-total').textContent = total + '/' + getMaxScore() + ' (' + pct + '%)';
    };

    const saveRatingScores = async function(id) {
        const scores = {};
        EQUIPMENT_CATS.forEach(function(cat){
            const el = document.getElementById('score-' + cat.key);
            scores[cat.key] = el ? Math.min(20, Math.max(0, parseInt(el.value)||0)) : 0;
        });
        const note = document.getElementById('rd-equip-note-edit') ? document.getElementById('rd-equip-note-edit').value : '';
        await updateDoc(doc(db,'ratings',id),{ scores, equipNote: note, updatedAt: Date.now() });
        showToast('Оценки сохранены!');
        closeModals();
        window.loadRatingsPage();
    };

    const deleteRating = async function(id) {
        if (!confirm('Удалить карточку оценки?')) return;
        await deleteDoc(doc(db,'ratings',id));
        showToast('Удалено'); closeModals();
        window.loadRatingsPage();
    };

    // ── Добавить нового дабера вручную ──
    window.openRatingAddModal = function() {
        ['ra-name','ra-role','ra-img','ra-note'].forEach(function(id){
            const el = document.getElementById(id); if(el) el.value='';
        });
        document.getElementById('m-rating-add').style.display = 'flex';
    };

    window.saveRatingNew = async function() {
        const name = (document.getElementById('ra-name')?.value||'').trim();
        const role = (document.getElementById('ra-role')?.value||'').trim();
        const img  = (document.getElementById('ra-img')?.value||'').trim();
        const note = (document.getElementById('ra-note')?.value||'').trim();
        if (!name) return showToast('Введите имя!','error');
        await addDoc(collection(db,'ratings'),{
            name, role: role||'Актёр дубляжа', img, equipNote: note,
            scores:{}, createdAt: Date.now(), teamId: ''
        });
        showToast('Карточка создана!'); closeModals();
        window.loadRatingsPage();
    };

    // ── Выбрать из состава (категория "Актёр дубляжа") ──
    window.openRatingFromTeam = async function() {
        const snap = await getDocs(query(collection(db,'team'), orderBy('order')));
        const members = snap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); })
            .filter(function(m){ return (m.cat||'').toLowerCase().includes('актёр') || (m.role||'').toLowerCase().includes('дабер') || (m.role||'').toLowerCase().includes('актёр'); });

        const list = document.getElementById('rft-list');
        if (!members.length) {
            list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Нет участников в категории «Актёр дубляжа»</p>';
        } else {
            list.innerHTML = members.map(function(m){
                return '<div class="rft-item" onclick="addRatingFromMember(\'' + m.id + '\',\'' + esc(m.name) + '\',\'' + esc(m.role) + '\',\'' + esc(m.img||'') + '\')">' +
                    '<img src="' + esc(m.img||PLACEHOLDER_TEAM_IMG) + '" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1px solid var(--border);" onerror="this.src=\'' + PLACEHOLDER_TEAM_IMG + '\'">' +
                    '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">' + esc(m.name) + '</div><div style="font-size:11px;color:var(--text-dim);">' + esc(m.role) + '</div></div>' +
                    '<i class="fas fa-plus-circle" style="color:var(--teal);font-size:18px;"></i></div>';
            }).join('');
        }
        document.getElementById('m-rating-from-team').style.display = 'flex';
    };

    window.addRatingFromMember = async function(teamId, name, role, img) {
        // Проверяем, не добавлен ли уже
        const existing = await getDocs(query(collection(db,'ratings'), where('teamId','==',teamId)));
        if (!existing.empty) { showToast('Карточка уже существует!','info'); return; }
        await addDoc(collection(db,'ratings'),{
            name, role, img, equipNote:'', scores:{},
            createdAt: Date.now(), teamId
        });
        showToast(name + ' добавлен!'); closeModals();
        window.loadRatingsPage();
    };
}
