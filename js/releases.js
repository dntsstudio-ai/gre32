// ============================================================
//  js/releases.js — Релизы, плеер SWS v2, избранное
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc, setDoc,
    updateDoc, deleteDoc, query, orderBy, increment, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals, navigate } from './core.js';
import { PLACEHOLDER_IMG, VIEW_COUNT_AFTER_MS } from '../config/config.js';
import { loadComments } from './comments.js';
import { checkAndAwardAch } from './achievements.js';

import {
    initPlayer, playerLoad, playerShowSkip, playerHideSkip,
    playerShowNext, playerHideNext, playerHideAllOverlays,
    playerSeekTo, playerUpdateEpisodes, playerSyncSettings,
    getYtVideoId, buildEmbedSrc, minsToSec,
    getPlayerStateExternal
} from './player.js';
import { renderPinnedPlaylists } from './playlists.js';

export let allRel  = [];
export let curProj = null;

let viewTimer      = null;
let playerSettings = { autoSkip: false, autoNext: false };
let currentEpIdx   = 0;
let introTimers    = [];
let searchEnabled  = false;   // поиск выключен до нажатия кнопки

const MAIN_ID    = 'sws-main-player';
const TRAILER_ID = 'sws-trailer-player';

// ── Загрузка релизов ──
export async function loadReleases(db, isAdmin) {
    const snap = await getDocs(query(collection(db,'releases'), orderBy('timestamp','desc')));
    allRel = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGrid(isAdmin);
}

export function renderGrid(isAdmin) {
    let res = [...allRel];
    // Поиск работает ТОЛЬКО когда searchEnabled=true
    if (searchEnabled) {
        const q = (document.getElementById('main-search')?.value || '').toLowerCase();
        if (q) res = res.filter(r => r.title?.toLowerCase().includes(q));
    }
    const g = document.getElementById('filter-genre')?.value || 'all';
    const s = document.getElementById('filter-sort')?.value  || 'new';
    if (g !== 'all') res = res.filter(r => r.genre === g);
    if (s === 'pop')    res.sort((a,b) => (b.views||0)-(a.views||0));
    else if (s === 'random') res.sort(() => 0.5-Math.random());
    else res.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));

    document.getElementById('main-grid').innerHTML = res.map(r => `
        <div class="card" onclick="openView('${r.id}')">
            ${isAdmin ? `<div class="adm-tools">
                <button class="btn-sm" style="background:#3897f0;" onclick="event.stopPropagation();openRelModal('${r.id}')">Ред</button>
                <button class="btn-sm" style="background:#ef4444;" onclick="event.stopPropagation();deleteRel('${r.id}')">Удал</button>
            </div>` : ''}
            <img src="${esc(r.img)}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
            <div class="card-info">
                <div><span class="tag">${esc(r.genre)}</span><span class="year-tag">${esc(r.year)}</span></div>
                <div class="card-title">${esc(r.title)}</div>
                <div style="font-size:10px;color:var(--text-dim);margin-top:5px;"><i class="fas fa-eye"></i> ${r.views||0}</div>
            </div>
        </div>`).join('');
}

// ── Включить поиск (вызывается из core.js при открытии) ──
export function enableSearch() { searchEnabled = true; }
export function disableSearch() {
    searchEnabled = false;
    // Сбросить поле и перерендерить
    const inp = document.getElementById('main-search');
    if (inp) inp.value = '';
}

// ── Открытие страницы релиза ──
export async function openViewRelease(db, auth, id, userData, isAdmin) {
    clearTimeout(viewTimer);
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];

    const snap = await getDoc(doc(db,'releases',id));
    if (!snap.exists()) return showToast('Релиз не найден','error');
    curProj = { id, ...snap.data() };
    window._curProjData = curProj; // playlists.js needs this
    const idx = allRel.findIndex(x => x.id === id);
    if (idx >= 0) allRel[idx] = curProj;
    navigate('view');

    // Сохранение последней серии
    let watchedEpIdx = 0;
    if (userData) {
        try {
            const wSnap = await getDoc(doc(db,`users/${auth.currentUser.uid}/watched`,id));
            if (wSnap.exists() && wSnap.data().lastEpIdx !== undefined)
                watchedEpIdx = wSnap.data().lastEpIdx;
        } catch(e) {}
    }

    if (userData) {
        try {
            const viewedSnap = await getDoc(doc(db,`users/${auth.currentUser.uid}/viewed`,id));
            if (!viewedSnap.exists()) {
                viewTimer = setTimeout(async () => {
                    await updateDoc(doc(db,'releases',id), { views: increment(1) });
                    await setDoc(doc(db,`users/${auth.currentUser.uid}/viewed`,id),
                        { at: Date.now(), title: curProj.title, img: curProj.img });
                    await updateDoc(doc(db,'users',auth.currentUser.uid), { views: increment(1) });
                    curProj.views = (curProj.views||0)+1;
                    userData.views = (userData.views||0)+1;
                    await checkAndAwardAch(db, auth, userData, 'views_1');
                    if (userData.views >= 10) await checkAndAwardAch(db, auth, userData, 'views_10');
                    if (userData.views >= 50) await checkAndAwardAch(db, auth, userData, 'views_50');
                }, VIEW_COUNT_AFTER_MS);
            }
        } catch(e) {}
    }

    renderViewPage(db, auth, userData, isAdmin, watchedEpIdx);
}

// ── Рендер страницы релиза ──
function renderViewPage(db, auth, userData, isAdmin, startEpIdx = 0) {
    const eps     = curProj.episodes || [];
    const trailer = eps.find(e => e.type === 'trailer');
    const series  = eps.filter(e => e.type !== 'trailer');
    currentEpIdx  = startEpIdx;

    const userListBtns = userData ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <button class="btn btn-outline btn-sm" id="btn-watch-later" onclick="toggleWatchList('later')">
                <i class="fas fa-clock"></i> Буду смотреть
            </button>
            <button class="btn btn-outline btn-sm" id="btn-favorite" onclick="toggleWatchList('favorite')">
                <i class="fas fa-star"></i> Избранное
            </button>
            <button class="btn btn-outline btn-sm" id="btn-add-playlist" onclick="openAddToPlaylist('${curProj.id}')">
                <i class="fas fa-layer-group"></i> В плейлист
            </button>
        </div>` : '';

    const adminBtn = isAdmin
        ? `<button class="btn btn-blue btn-sm" onclick="openEpManager()"><i class="fas fa-film"></i> Серии</button>`
        : '';

    document.getElementById('v-info').innerHTML = `
        <div class="view-ivi-wrap">

            ${trailer ? `
            <div class="trailer-section">
                <div class="trailer-label"><i class="fas fa-play-circle"></i> Трейлер</div>
                <div class="sws-player-container sws-trailer-size" id="${TRAILER_ID}"></div>
            </div>` : ''}

            <div class="view-meta-row">
                <img src="${esc(curProj.img)}" class="v-poster" onerror="this.src='${PLACEHOLDER_IMG}'">
                <div class="view-meta-info">
                    <h1 class="view-title">${esc(curProj.title)}</h1>
                    <p style="color:var(--text-dim);margin-bottom:10px;font-size:14px;">${esc(curProj.year)} · ${esc(curProj.genre)}</p>
                    <p style="font-size:13px;line-height:1.7;color:#ddd;margin-bottom:14px;">${esc(curProj.desc)}</p>
                    <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;"><b>Авторы:</b> ${esc(curProj.authors)}</div>
                    <div style="font-size:12px;color:var(--text-dim);"><b style="color:var(--accent);">Озвучка:</b> ${esc(curProj.voiceover)}</div>
                    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center;">
                        <button id="btn-like" class="react-btn" onclick="rateProj('like')">
                            <i class="fas fa-thumbs-up"></i> <span id="v-like-cnt">0</span>
                        </button>
                        <button id="btn-dislike" class="react-btn" onclick="rateProj('dislike')">
                            <i class="fas fa-thumbs-down"></i> <span id="v-dislike-cnt">0</span>
                        </button>
                        ${adminBtn}
                    </div>
                    ${userListBtns}
                </div>
            </div>

            <!-- ОСНОВНОЙ ПЛЕЕР -->
            <div class="main-player-section">
                <h3 id="v-current-ep-title" style="font-size:1rem;color:var(--accent);margin-bottom:10px;">
                    ${esc(series[startEpIdx]?.name || '')}
                </h3>

                ${series.length === 0 ? `
                <div class="sws-player-container" id="${MAIN_ID}">
                    <div class="no-episodes-placeholder">
                        <i class="fas fa-hourglass-start"></i>
                        <h3>Серий пока нет</h3><p>Скоро появятся!</p>
                    </div>
                </div>` : `
                <div class="sws-player-container" id="${MAIN_ID}"></div>`}

                <!-- Панель серий под плеером -->
                ${series.length > 1 ? `
                <div class="ep-panel-outer">
                    <div class="ep-panel-toggle" onclick="toggleEpPanel()">
                        <span><i class="fas fa-list"></i> Серии (${series.length})</span>
                        <i class="fas fa-chevron-down ep-panel-chevron" id="ep-panel-chev"></i>
                    </div>
                    <div class="ep-panel-scroll" id="ep-panel-scroll">
                        <div class="ep-panel-list" id="ep-panel-list"></div>
                    </div>
                </div>` : ''}

                <div class="ep-grid" id="v-ep-list"></div>
            </div>
        </div>`;

    updateLikesUI(auth, userData);

    // Инит трейлера
    if (trailer?.url) {
        initPlayer(TRAILER_ID, {
            url:       trailer.url,
            title:     'Трейлер — ' + curProj.title,
            muted:     true,
            isTrailer: true,
        });
    }

    // Инит основного плеера
    if (series.length > 0) {
        const firstEp = series[startEpIdx];
        initPlayer(MAIN_ID, {
            url:        firstEp.url,
            title:      firstEp.name + (firstEp.title ? ' — ' + firstEp.title : ''),
            episodes:   series,
            currentIdx: startEpIdx,
            autoSkip:   playerSettings.autoSkip,
            autoNext:   playerSettings.autoNext,
        });
        renderEpGrid(series, isAdmin);
        renderEpPanelBtns(series);
        scheduleIntroTimers(series, startEpIdx);
    }

    if (userData) loadWatchListStatus(db, auth, curProj.id);
    loadComments(db, auth, curProj, userData, isAdmin);
}

// ── Панель серий под плеером ──
window.toggleEpPanel = () => {
    const scroll = document.getElementById('ep-panel-scroll');
    const chev   = document.getElementById('ep-panel-chev');
    if (!scroll) return;
    const open = scroll.classList.toggle('ep-panel-scroll--open');
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
};

function renderEpPanelBtns(series) {
    const list = document.getElementById('ep-panel-list');
    if (!list) return;
    list.innerHTML = series.map((ep, i) => `
        <button class="ep-panel-thumb-btn ${i===currentEpIdx?'active':''}"
                onclick="playEpByIdxGlobal(${i})">
            ${ep.thumb ? `<img src="${esc(ep.thumb)}" onerror="this.style.display='none'" alt="">` : ''}
            <span class="ep-panel-thumb-name">${esc(ep.name)}</span>
        </button>`).join('');
}

// ── Сетка эпизодов ──
function renderEpGrid(series, isAdmin) {
    const globalIndices = series.map(ep =>
        (curProj.episodes||[]).findIndex(e =>
            e === ep || (e.url === ep.url && e.name === ep.name && e.type === ep.type)
        )
    );
    const epList = document.getElementById('v-ep-list');
    if (epList) epList.innerHTML = series.map((ep, i) => `
        <div class="ep-card ${i===currentEpIdx?'ep-card--active':''}" onclick="playEpByIdxGlobal(${i})">
            <div class="ep-card-thumb">
                ${ep.thumb ? `<img src="${esc(ep.thumb)}" alt="" onerror="this.style.display='none'">` : ''}
                <span style="${ep.thumb?'display:none;':''}width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:var(--text-dim);">
                    <i class="fas fa-film"></i>
                </span>
                ${isAdmin ? `
                <div class="ep-card-adm">
                    <button class="ep-adm-btn ep-adm-btn--edit" title="Редактировать"
                        onclick="event.stopPropagation();editEp(${globalIndices[i]})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="ep-adm-btn ep-adm-btn--del" title="Удалить"
                        onclick="event.stopPropagation();delEp(${globalIndices[i]})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>` : ''}
            </div>
            <div class="ep-card-name">${esc(ep.name)}</div>
            ${ep.title ? `<div class="ep-card-title">${esc(ep.title)}</div>` : ''}
        </div>`).join('');
}

// ── Тайминги заставок ──
// introStart — абсолютная секунда начала заставки в видео
// introEnd   — абсолютная секунда конца заставки в видео
// outroStart — абсолютная секунда для кнопки "следующая серия"
function scheduleIntroTimers(series, idx) {
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];
    playerHideAllOverlays(MAIN_ID);
    const ep = series[idx];
    if (!ep) return;

    // ── Кнопка «Пропустить заставку» ──
    // introStart = начало заставки (секунды в видео)
    // introEnd   = конец заставки (секунды в видео)
    const hasIntro = ep.introStart > 0 && ep.introEnd > 0 && ep.introEnd > ep.introStart;

    if (hasIntro) {
        // Показываем кнопку через introStart секунд после начала воспроизведения
        const t1 = setTimeout(() => {
            if (currentEpIdx !== idx) return;
            if (playerSettings.autoSkip) {
                // Для YouTube — seek, для Drive — только скрываем кнопку (seek невозможен)
                playerSeekTo(MAIN_ID, ep.introEnd);
                return;
            }
            playerShowSkip(MAIN_ID, () => {
                playerSeekTo(MAIN_ID, ep.introEnd);
            });
            // Прячем кнопку когда заставка закончится
            const duration = ep.introEnd - ep.introStart;
            const t2 = setTimeout(() => {
                if (currentEpIdx !== idx) return;
                playerHideSkip(MAIN_ID);
            }, duration * 1000);
            introTimers.push(t2);
        }, ep.introStart * 1000);
        introTimers.push(t1);
    }

    // ── Кнопка «Следующая серия» ──
    if (ep.outroStart && ep.outroStart > 0) {
        const t3 = setTimeout(() => {
            if (currentEpIdx !== idx) return;
            if (idx >= series.length - 1) return; // последняя серия
            if (playerSettings.autoNext) { playNextEp(); return; }
            playerShowNext(MAIN_ID, () => playNextEp());
        }, ep.outroStart * 1000);
        introTimers.push(t3);
    }
}

// ── Воспроизвести эпизод ──
function playEp(series, idx, isAdmin) {
    if (!series[idx]) return;
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];
    currentEpIdx = idx;
    const ep = series[idx];
    playerLoad(MAIN_ID, ep.url, ep.name + (ep.title ? ' — ' + ep.title : ''));
    playerUpdateEpisodes(MAIN_ID, series, idx);
    const titleEl = document.getElementById('v-current-ep-title');
    if (titleEl) titleEl.innerText = ep.name + (ep.title ? ' — ' + ep.title : '');
    document.querySelectorAll('.ep-card').forEach((c, i) => c.classList.toggle('ep-card--active', i===idx));
    document.querySelectorAll('.ep-panel-thumb-btn').forEach((b, i) => b.classList.toggle('active', i===idx));
    scheduleIntroTimers(series, idx);
}

window.playEpByIdxGlobal = (idx) => {
    const series = (curProj?.episodes||[]).filter(e => e.type !== 'trailer');
    playEp(series, idx, document.body.classList.contains('admin-mode'));
};

window.playNextEp = () => {
    const series = (curProj?.episodes||[]).filter(e => e.type !== 'trailer');
    if (currentEpIdx < series.length - 1)
        playEp(series, currentEpIdx + 1, document.body.classList.contains('admin-mode'));
};

window.updatePlayerSettings = () => {
    // Читаем из состояния плеера (не из чекбоксов — их больше нет)
    const st = getPlayerStateExternal(MAIN_ID);
    if (st) {
        playerSettings.autoSkip = st.autoSkip || false;
        playerSettings.autoNext = st.autoNext || false;
    }
};

// Вызывается из player.js при переключении тоглов
window._syncPlayerSettings = (containerId) => {
    if (containerId !== MAIN_ID) return;
    window.updatePlayerSettings();
};

function updateLikesUI(auth, userData) {
    const uid = userData ? auth.currentUser?.uid : null;
    const lc = document.getElementById('v-like-cnt');
    const dc = document.getElementById('v-dislike-cnt');
    if (lc) lc.innerText = (curProj?.likes    || []).length;
    if (dc) dc.innerText = (curProj?.dislikes || []).length;
    document.getElementById('btn-like')?.classList.toggle('active',    !!(uid&&(curProj?.likes   ||[]).includes(uid)));
    document.getElementById('btn-dislike')?.classList.toggle('active', !!(uid&&(curProj?.dislikes||[]).includes(uid)));
}

async function loadWatchListStatus(db, auth, relId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
        const snap = await getDoc(doc(db,`users/${uid}/watchlist`,relId));
        if (!snap.exists()) return;
        const { type } = snap.data();
        if (type === 'later') {
            const b = document.getElementById('btn-watch-later');
            if (b) { b.classList.add('btn-active'); b.innerHTML = '<i class="fas fa-check"></i> В списке'; }
        }
        if (type === 'favorite') {
            const b = document.getElementById('btn-favorite');
            if (b) { b.classList.add('btn-active'); b.innerHTML = '<i class="fas fa-star"></i> В избранном'; }
        }
    } catch(e) {}
}

// ═══════════════════════════════════════════════════
//  BIND
// ═══════════════════════════════════════════════════
export function bindReleases(db, auth, getState) {

    // Поиск — только когда включён
    window.filterData = () => { const { isAdmin } = getState(); renderGrid(isAdmin); };

    window.openView = async (id) => {
        const { userData, isAdmin } = getState();
        await openViewRelease(db, auth, id, userData, isAdmin);
        getState().curProj = curProj;
    };

    window.rateProj = async (type) => {
        const { userData } = getState();
        if (!userData) return showToast('Авторизуйтесь для оценки','error');
        const uid = auth.currentUser.uid;
        let likes = [...(curProj.likes||[])], dislikes = [...(curProj.dislikes||[])];
        if (type==='like') {
            if (likes.includes(uid)) likes = likes.filter(x=>x!==uid);
            else { likes.push(uid); dislikes = dislikes.filter(x=>x!==uid); }
        } else {
            if (dislikes.includes(uid)) dislikes = dislikes.filter(x=>x!==uid);
            else { dislikes.push(uid); likes = likes.filter(x=>x!==uid); }
        }
        curProj.likes = likes; curProj.dislikes = dislikes;
        await updateDoc(doc(db,'releases',curProj.id), { likes, dislikes });
        updateLikesUI(auth, userData);
        await checkAndAwardAch(db, auth, userData, 'like_1');
    };

    window.toggleWatchList = async (type) => {
        const { userData } = getState();
        if (!userData) return showToast('Войдите для добавления в список','error');
        const uid  = auth.currentUser.uid;
        const ref  = doc(db,`users/${uid}/watchlist`,curProj.id);
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().type === type) {
            await deleteDoc(ref);
            if (type==='later') {
                const b = document.getElementById('btn-watch-later');
                if (b) { b.classList.remove('btn-active'); b.innerHTML='<i class="fas fa-clock"></i> Буду смотреть'; }
            } else {
                const b = document.getElementById('btn-favorite');
                if (b) { b.classList.remove('btn-active'); b.innerHTML='<i class="fas fa-star"></i> Избранное'; }
            }
            showToast('Удалено из списка');
        } else {
            await setDoc(ref, { type, relId: curProj.id, title: curProj.title, img: curProj.img, addedAt: Date.now() });
            if (type==='later') {
                const b = document.getElementById('btn-watch-later');
                if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-check"></i> В списке'; }
                showToast('Добавлено в «Буду смотреть»');
            } else {
                const b = document.getElementById('btn-favorite');
                if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-star"></i> В избранном'; }
                showToast('Добавлено в избранное ⭐');
                await checkAndAwardAch(db, auth, userData, 'favorite_1');
            }
        }
    };

    window.openEpManager = () => {
        const editIdxEl = document.getElementById('ed-ep-idx');
        if (editIdxEl) editIdxEl.value = '';
        ['ad-ep-name','ad-ep-title','ad-ep-url','ad-ep-thumb'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        ['ad-ep-intro-start','ad-ep-intro-dur','ad-ep-outro-start'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        const h = document.getElementById('m-ep-heading');
        if (h) h.textContent = 'Добавить медиа';
        document.getElementById('m-ep').style.display = 'flex';
    };

    window.editEp = (globalIdx) => {
        const ep = (curProj.episodes||[])[globalIdx];
        if (!ep) return;
        const editIdxEl = document.getElementById('ed-ep-idx');
        if (editIdxEl) editIdxEl.value = globalIdx;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        const toMM = (sec) => {
            if (!sec || sec <= 0) return '';
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return `${m}:${String(s).padStart(2,'0')}`;
        };
        set('ad-ep-type',        ep.type || 'series');
        set('ad-ep-name',        ep.name);
        set('ad-ep-title',       ep.title);
        set('ad-ep-url',         ep.url);
        set('ad-ep-thumb',       ep.thumb);
        set('ad-ep-intro-start', toMM(ep.introStart));
        set('ad-ep-intro-end',   toMM(ep.introEnd));
        set('ad-ep-outro-start', toMM(ep.outroStart));
        const h = document.getElementById('m-ep-heading');
        if (h) h.textContent = 'Редактировать медиа';
        document.getElementById('m-ep').style.display = 'flex';
    };

    window.saveEp = async () => {
        if (!curProj) return;
        const { isAdmin } = getState();
        const editIdxEl = document.getElementById('ed-ep-idx');
        const editIdx = (editIdxEl?.value !== '' && editIdxEl?.value !== undefined)
            ? parseInt(editIdxEl.value) : -1;

        // Конвертируем мм:сс → секунды
        const introStartRaw = document.getElementById('ad-ep-intro-start')?.value || '';
        const introEndRaw   = document.getElementById('ad-ep-intro-end')?.value   || '';
        const outroStartRaw = document.getElementById('ad-ep-outro-start')?.value || '';

        const parseMinSec = (val) => {
            if (!val) return 0;
            val = String(val).replace(/[^0-9:]/g, '');
            if (val.includes(':')) {
                const [m, s] = val.split(':').map(Number);
                return (m || 0) * 60 + (s || 0);
            }
            return parseInt(val) || 0;
        };

        const introStart = parseMinSec(introStartRaw);
        const introEnd   = parseMinSec(introEndRaw);

        const ep = {
            type:       document.getElementById('ad-ep-type').value,
            name:       document.getElementById('ad-ep-name').value.trim(),
            title:      document.getElementById('ad-ep-title')?.value.trim() || '',
            url:        document.getElementById('ad-ep-url').value.trim(),
            thumb:      document.getElementById('ad-ep-thumb')?.value.trim() || '',
            introStart,
            introEnd,
            outroStart: parseMinSec(outroStartRaw),
        };
        if (!ep.name || !ep.url) return showToast('Заполните название и URL!','error');
        if (ep.introEnd > 0 && ep.introEnd <= ep.introStart) {
            return showToast('Конец заставки должен быть позже начала!','error');
        }

        const eps = [...(curProj.episodes||[])];
        if (editIdx >= 0 && editIdx < eps.length) {
            eps[editIdx] = ep;
        } else {
            eps.push(ep);
        }
        await updateDoc(doc(db,'releases',curProj.id), { episodes: eps });
        curProj.episodes = eps;
        closeModals();

        const series = eps.filter(e => e.type !== 'trailer');
        renderEpGrid(series, isAdmin);
        renderEpPanelBtns(series);
        playerUpdateEpisodes(MAIN_ID, series, currentEpIdx);
        if (editIdx < 0 && series.length === 1) playEp(series, 0, isAdmin);
        showToast(editIdx >= 0 ? 'Медиа обновлено!' : 'Медиа добавлено!');

        ['ad-ep-name','ad-ep-title','ad-ep-url','ad-ep-thumb'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        if (editIdxEl) editIdxEl.value = '';
    };

    window.delEp = async (globalIdx) => {
        if (!confirm('Удалить медиа?')) return;
        const { isAdmin } = getState();
        const eps = [...(curProj.episodes||[])];
        eps.splice(globalIdx, 1);
        await updateDoc(doc(db,'releases',curProj.id), { episodes: eps });
        curProj.episodes = eps;
        const series = eps.filter(e => e.type !== 'trailer');
        if (currentEpIdx >= series.length) currentEpIdx = Math.max(0, series.length - 1);
        renderEpGrid(series, isAdmin);
        renderEpPanelBtns(series);
        playerUpdateEpisodes(MAIN_ID, series, currentEpIdx);
        if (series.length > 0) playEp(series, currentEpIdx, isAdmin);
        showToast('Удалено');
    };

    window.openRelModal = async (id='') => {
        document.getElementById('ed-rel-id').value = id;
        if (id) {
            const r = allRel.find(x=>x.id===id);
            if (r) {
                ['title','year','voiceover','authors','img','desc'].forEach(f => {
                    const el = document.getElementById('ad-'+f); if (el) el.value = r[f]||'';
                });
                const g = document.getElementById('ad-genre'); if (g) g.value = r.genre||'';
            }
        } else {
            ['title','year','voiceover','authors','img','desc'].forEach(f => {
                const el = document.getElementById('ad-'+f); if (el) el.value = '';
            });
        }
        document.getElementById('m-rel').style.display = 'flex';
    };

    window.saveRel = async () => {
        const { isAdmin } = getState();
        const id = document.getElementById('ed-rel-id').value;
        const data = {
            title:     document.getElementById('ad-title').value,
            genre:     document.getElementById('ad-genre').value,
            year:      document.getElementById('ad-year').value,
            voiceover: document.getElementById('ad-voiceover').value,
            authors:   document.getElementById('ad-authors').value,
            img:       document.getElementById('ad-img').value,
            desc:      document.getElementById('ad-desc').value,
            timestamp: id ? (allRel.find(x=>x.id===id)?.timestamp||Date.now()) : Date.now()
        };
        if (!data.title) return showToast('Введите название!','error');
        if (!id) await addDoc(collection(db,'releases'), data);
        else     await updateDoc(doc(db,'releases',id), data);
        closeModals(); await loadReleases(db, isAdmin); showToast('Релиз сохранён!');
    };

    window.deleteRel = async (id) => {
        if (!confirm('Удалить релиз?')) return;
        const { isAdmin } = getState();
        await deleteDoc(doc(db,'releases',id));
        await loadReleases(db, isAdmin); showToast('Удалено');
    };

    window.openPrivacy = async () => {
        const { isAdmin } = getState();
        try {
            const snap = await getDoc(doc(db,'settings','privacy'));
            document.getElementById('priv-text').innerText = snap.exists() ? snap.data().text : 'Текст не добавлен.';
        } catch { document.getElementById('priv-text').innerText = 'Текст не добавлен.'; }
        document.getElementById('priv-adm-btns').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('m-privacy').style.display = 'flex';
    };

    window.editPriv = () => {
        const txt = document.getElementById('priv-text').innerText;
        document.getElementById('priv-text').style.display    = 'none';
        document.getElementById('priv-edit').style.display    = 'block';
        document.getElementById('priv-edit').value            = txt;
        document.getElementById('priv-btn-edit').style.display = 'none';
        document.getElementById('priv-btn-save').style.display = 'block';
    };

    window.savePriv = async () => {
        const txt = document.getElementById('priv-edit').value;
        await setDoc(doc(db,'settings','privacy'), { text: txt });
        document.getElementById('priv-text').innerText         = txt;
        document.getElementById('priv-text').style.display     = 'block';
        document.getElementById('priv-edit').style.display     = 'none';
        document.getElementById('priv-btn-edit').style.display = 'block';
        document.getElementById('priv-btn-save').style.display = 'none';
        showToast('Сохранено!');
    };

    window.loadMyLists = async () => {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const container = document.getElementById('my-lists-wrap');
        if (!container) return;
        container.innerHTML = `<p style="font-size:12px;color:var(--text-dim);">Загрузка...</p>`;
        try {
            const wSnap    = await getDocs(collection(db,`users/${uid}/watchlist`));
            const all      = wSnap.docs.map(d => d.data());
            const later    = all.filter(x => x.type === 'later');
            const favorite = all.filter(x => x.type === 'favorite');
            const vSnap    = await getDocs(collection(db,`users/${uid}/viewed`));
            const viewed   = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            for (const v of viewed) {
                if (!v.title) {
                    const found = allRel.find(r => r.id === v.id);
                    v.title = found?.title || '(неизвестный релиз)';
                    v.img   = found?.img   || '';
                }
            }
            const mkSection = (id, icon, title, count, content) => `
                <div class="list-section-wrap">
                    <div class="list-section-header" onclick="toggleListSection('${id}')">
                        <span>${icon} <b>${title}</b>&nbsp;<span style="color:var(--text-dim);font-size:12px;">(${count})</span></span>
                        <i class="fas fa-chevron-down list-section-chevron" id="chev-${id}"></i>
                    </div>
                    <div class="list-section-body" id="body-${id}">${content}</div>
                </div>`;
            const favHtml = favorite.length
                ? `<div class="lists-grid">${favorite.map(r=>`<div class="list-card" onclick="openView('${r.relId}')"><img src="${esc(r.img)}" onerror="this.src='${PLACEHOLDER_IMG}'"><div class="list-card-title">${esc(r.title)}</div></div>`).join('')}</div>`
                : `<p class="list-empty">Пусто — нажмите ⭐ на странице релиза</p>`;
            const laterHtml = later.length
                ? `<div class="lists-grid">${later.map(r=>`<div class="list-card" onclick="openView('${r.relId}')"><img src="${esc(r.img)}" onerror="this.src='${PLACEHOLDER_IMG}'"><div class="list-card-title">${esc(r.title)}</div></div>`).join('')}</div>`
                : `<p class="list-empty">Пусто — нажмите 🕐 на странице релиза</p>`;
            const viewedHtml = viewed.length
                ? viewed.map(v=>`<div class="viewed-row" onclick="openView('${v.id}')">
                    ${v.img?`<img src="${esc(v.img)}" class="viewed-thumb" onerror="this.style.display='none'">`:''}
                    <div style="flex:1;min-width:0;"><div class="viewed-title">${esc(v.title)}</div>
                    <div class="viewed-date"><i class="fas fa-check-circle" style="color:#22c55e;font-size:10px;"></i> ${new Date(v.at).toLocaleDateString('ru')}</div></div></div>`).join('')
                : `<p class="list-empty">Пусто — смотрите релизы более 10 мин</p>`;
            // Закреплённые кастомные плейлисты
            let pinnedSection = '';
            try {
                const pinnedHtml = await renderPinnedPlaylists(uid);
                if (pinnedHtml) {
                    pinnedSection = '<div class="list-section-wrap">'
                        + '<div class="list-section-header" onclick="toggleListSection(\'pinned\')">'
                        + '<span><i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px;"></i>'
                        + ' <b>Плейлисты</b>&nbsp;<span style="color:var(--text-dim);font-size:12px;">(закреплённые)</span></span>'
                        + '<i class="fas fa-chevron-down list-section-chevron" id="chev-pinned"></i>'
                        + '</div>'
                        + '<div class="list-section-body list-section-open" id="body-pinned">' + pinnedHtml + '</div>'
                        + '</div>';
                }
            } catch(pe) { console.warn('Pinned playlists error:', pe); }

            container.innerHTML =
                mkSection('fav',    '⭐','Избранное',     favorite.length, favHtml)
              + mkSection('later',  '🕐','Буду смотреть', later.length,    laterHtml)
              + mkSection('viewed', '👁', 'Просмотрено',  viewed.length,   viewedHtml)
              + pinnedSection;
        } catch(e) {
            container.innerHTML = `<p style="color:#ef4444;font-size:13px;">Ошибка загрузки.</p>`;
            console.error(e);
        }
    };

    window.toggleListSection = (id) => {
        const body = document.getElementById('body-'+id);
        const chev = document.getElementById('chev-'+id);
        if (!body) return;
        const open = body.classList.toggle('list-section-open');
        if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
    };
}
