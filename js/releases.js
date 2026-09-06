// ============================================================
//  js/releases.js — Релизы, плеер, избранное
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc, setDoc,
    updateDoc, deleteDoc, query, orderBy, increment, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import {
    ref as storageRef, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

import { esc, showToast, closeModals, navigate, updatePageMeta } from './core.js?v=20260906a';
import { PLACEHOLDER_IMG, VIEW_COUNT_AFTER_MS, KODIK_TOKEN } from '../config/config.js?v=20260906a';
import { loadComments } from './comments.js?v=20260906a';
import { checkAndAwardAch } from './achievements.js?v=20260906a';

import {
    initPlayer, playerLoad, playerShowSkip, playerHideSkip,
    playerShowNext, playerHideNext, playerHideAllOverlays,
    playerSeekTo, playerUpdateEpisodes,
    getYtVideoId, buildEmbedSrc, minsToSec,
    getPlayerStateExternal
} from './player.js?v=20260906a';
import { renderPinnedPlaylists } from './playlists.js?v=20260906a';

export let allRel  = [];
export let curProj = null;

let viewTimer      = null;
let playerSettings = { autoSkip: false, autoNext: false };
let currentEpIdx   = 0;
let introTimers    = [];
let searchEnabled  = false;

const MAIN_ID    = 'sws-main-player';
const TRAILER_ID = 'sws-trailer-player';

// ── Собираем список источников для плеера: VAT (ep.url) + Kodik (ep.kodikUrl) ──
function buildSources(ep) {
    const sources = [];
    if (ep?.url)      sources.push({ url: ep.url, label: 'VAT' });
    if (ep?.kodikUrl) sources.push({ url: ep.kodikUrl, label: 'Kodik', type: 'kodik' });
    return sources;
}

// ── Поиск по названию через Kodik API ──
let kodikSearchTimer = null;
async function searchKodik(title) {
    const url = `https://kodik-api.com/search?token=${KODIK_TOKEN}&title=${encodeURIComponent(title)}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Kodik API вернул ошибку ' + res.status);
    const data = await res.json();
    return data.results || [];
}
function fixKodikLink(link) { return link && link.startsWith('//') ? 'https:' + link : link; }

window.onKodikSearchInput = (val) => {
    clearTimeout(kodikSearchTimer);
    const box = document.getElementById('kodik-results');
    if (!box) return;
    const q = (val || '').trim();
    if (q.length < 2) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = '<div class="kodik-result-msg">Ищу...</div>';
    kodikSearchTimer = setTimeout(async () => {
        try {
            const results = await searchKodik(q);
            if (!results.length) { box.innerHTML = '<div class="kodik-result-msg">Ничего не нашлось</div>'; return; }
            box.innerHTML = results.slice(0, 8).map((r, i) => `
                <button type="button" class="kodik-result-item" data-idx="${i}">
                    <span class="kodik-result-title">${esc(r.title)}${r.year ? ` (${r.year})` : ''}</span>
                    <span class="kodik-result-tr">${esc(r.translation?.title || '')}</span>
                </button>`).join('');
            box.querySelectorAll('.kodik-result-item').forEach((btn, i) => {
                btn.addEventListener('click', () => {
                    const link = fixKodikLink(results[i].link);
                    const kodikInput = document.getElementById('ad-ep-kodik');
                    if (kodikInput) kodikInput.value = link;
                    box.innerHTML = ''; box.style.display = 'none';
                    document.getElementById('ad-ep-kodik-search').value = '';
                    showToast('Kodik-ссылка подставлена!');
                });
            });
        } catch (e) {
            box.innerHTML = '<div class="kodik-result-msg kodik-result-msg--error">Ошибка поиска: ' + esc(e.message) + '</div>';
        }
    }, 450);
};

// ── Загрузка файла в Firebase Storage с прогресс-баром ──
function uploadToStorage(storage, file, folder, { onProgress, onDone, onError }) {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${folder}/${Date.now()}_${safeName}`;
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, file);
    task.on('state_changed',
        (snap) => { if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)); },
        (err)  => { if (onError) onError(err); },
        async () => { try { const url = await getDownloadURL(fileRef); if (onDone) onDone(url); } catch(e) { if (onError) onError(e); } }
    );
}

// ── Загрузка релизов ──
export async function loadReleases(db, isAdmin) {
    try {
        const snap = await getDocs(query(collection(db, 'releases'), orderBy('timestamp', 'desc')));
        allRel = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGrid(isAdmin);
    } catch(e) {
        console.error('loadReleases:', e);
        const grid = document.getElementById('main-grid');
        if (grid) grid.innerHTML = '<p style="color:#ef4444;grid-column:1/-1;text-align:center;padding:40px;">Ошибка загрузки релизов</p>';
    }
}

export function renderGrid(isAdmin) {
    let res = [...allRel];
    if (searchEnabled) {
        const q = (document.getElementById('main-search')?.value || '').toLowerCase();
        if (q) res = res.filter(r => r.title?.toLowerCase().includes(q));
    }
    const g = document.getElementById('filter-genre')?.value || 'all';
    const s = document.getElementById('filter-sort')?.value  || 'new';
    if (g !== 'all') res = res.filter(r => r.genre === g);
    if (s === 'pop')    res.sort((a, b) => (b.views||0) - (a.views||0));
    else if (s === 'random') res.sort(() => 0.5 - Math.random());
    else res.sort((a, b) => (b.timestamp||0) - (a.timestamp||0));

    const grid = document.getElementById('main-grid');
    if (!grid) return;
    grid.innerHTML = res.map(r => `
        <a class="card" href="/view/${r.id}" onclick="event.preventDefault();openView('${r.id}')">
            ${isAdmin ? `<div class="adm-tools">
                <button class="btn-sm" style="background:#3897f0;" onclick="event.stopPropagation();openRelModal('${r.id}')">Ред</button>
                <button class="btn-sm" style="background:#ef4444;" onclick="event.stopPropagation();deleteRel('${r.id}')">Удал</button>
            </div>` : ''}
            <img src="${esc(r.img)}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'" alt="${esc(r.title)}">
            <div class="card-info">
                <div><span class="tag">${esc(r.genre)}</span><span class="year-tag">${esc(r.year)}</span></div>
                <div class="card-title">${esc(r.title)}</div>
                <div style="font-size:10px;color:var(--text-dim);margin-top:5px;"><i class="fas fa-eye"></i> ${r.views||0}</div>
            </div>
        </a>`).join('');
}

export function enableSearch()  { searchEnabled = true; }
export function disableSearch() {
    searchEnabled = false;
    const inp = document.getElementById('main-search');
    if (inp) inp.value = '';
}

// ── Открытие страницы релиза ──
export async function openViewRelease(db, auth, id, userData, isAdmin) {
    clearTimeout(viewTimer);
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];

    try {
        const snap = await getDoc(doc(db, 'releases', id));
        if (!snap.exists()) return showToast('Релиз не найден', 'error');
        curProj = { id, ...snap.data() };
        window._curProjData = curProj;
        const idx = allRel.findIndex(x => x.id === id);
        if (idx >= 0) allRel[idx] = curProj;
        navigate('view');
        history.replaceState(null, '', '/view/' + id);

        updatePageMeta({
            title: curProj.title,
            description: curProj.desc ? curProj.desc.slice(0, 200) : undefined,
            image: curProj.img,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': curProj.type === 'film' ? 'Movie' : 'TVSeries',
                name: curProj.title,
                description: curProj.desc || undefined,
                image: curProj.img || undefined,
                datePublished: curProj.year ? String(curProj.year) : undefined,
                genre: curProj.genre || undefined,
            },
        });

        let watchedEpIdx = 0;
        if (userData && auth.currentUser) {
            try {
                const wSnap = await getDoc(doc(db, `users/${auth.currentUser.uid}/watched`, id));
                if (wSnap.exists() && wSnap.data().lastEpIdx !== undefined)
                    watchedEpIdx = wSnap.data().lastEpIdx;
            } catch(e) {}

            try {
                const viewedSnap = await getDoc(doc(db, `users/${auth.currentUser.uid}/viewed`, id));
                if (!viewedSnap.exists()) {
                    viewTimer = setTimeout(async () => {
                        try {
                            await updateDoc(doc(db, 'releases', id), { views: increment(1) });
                            await setDoc(doc(db, `users/${auth.currentUser.uid}/viewed`, id),
                                { at: Date.now(), title: curProj.title, img: curProj.img });
                            await updateDoc(doc(db, 'users', auth.currentUser.uid), { views: increment(1) });
                            curProj.views = (curProj.views||0) + 1;
                            userData.views = (userData.views||0) + 1;
                            await checkAndAwardAch(db, auth, userData, 'views_1');
                            if (userData.views >= 10) await checkAndAwardAch(db, auth, userData, 'views_10');
                            if (userData.views >= 50) await checkAndAwardAch(db, auth, userData, 'views_50');
                            if (window.awardVCoins) await window.awardVCoins(10, 'Просмотр: ' + (curProj.title||''));
                        } catch(e) { console.warn('viewCount:', e); }
                    }, VIEW_COUNT_AFTER_MS);
                }
            } catch(e) {}
        }

        renderViewPage(db, auth, userData, isAdmin, watchedEpIdx);
    } catch(e) {
        showToast('Ошибка загрузки релиза', 'error');
        console.error('openViewRelease:', e);
    }
}

function renderViewPage(db, auth, userData, isAdmin, startEpIdx=0) {
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
            <button class="btn btn-outline btn-sm" id="btn-rel-subscribe" onclick="toggleReleaseSubscription('${curProj.id}','${(curProj.title||'').replace(/'/g,'')}')">
                <i class="fas fa-bell"></i> Уведомлять о сериях
            </button>
        </div>` : '';

    const adminBtn = isAdmin
        ? `<button class="btn btn-blue btn-sm" onclick="openEpManager()"><i class="fas fa-film"></i> Серии</button>`
        : '';

    const vInfo = document.getElementById('v-info');
    if (!vInfo) return;

    vInfo.innerHTML = `
        <div class="view-ivi-wrap">
            ${trailer ? `
            <div class="trailer-section">
                <div class="trailer-label"><i class="fas fa-play-circle"></i> Трейлер</div>
                <div class="sws-player-container sws-trailer-size" id="${TRAILER_ID}"></div>
            </div>` : ''}

            <div class="view-meta-row">
                <img src="${esc(curProj.img)}" class="v-poster" onerror="this.src='${PLACEHOLDER_IMG}'" alt="${esc(curProj.title)}">
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
                </div>` : `<div class="sws-player-container" id="${MAIN_ID}"></div>`}

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

    if (trailer?.url) {
        initPlayer(TRAILER_ID, { url: trailer.url, title: 'Трейлер — ' + curProj.title, muted: true, isTrailer: true });
    }

    if (series.length > 0) {
        const firstEp = series[startEpIdx];
        initPlayer(MAIN_ID, {
            sources: buildSources(firstEp),
            title: firstEp.name + (firstEp.title ? ' — ' + firstEp.title : ''),
            episodes: series, currentIdx: startEpIdx,
            autoSkip: playerSettings.autoSkip, autoNext: playerSettings.autoNext,
        });
        renderEpGrid(series, isAdmin);
        renderEpPanelBtns(series);
        scheduleIntroTimers(series, startEpIdx);
    }

    if (userData) loadWatchListStatus(db, auth, curProj.id);
    loadComments(db, auth, curProj, userData, isAdmin);
}

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
        <button class="ep-panel-thumb-btn ${i===currentEpIdx?'active':''}" onclick="playEpByIdxGlobal(${i})">
            ${ep.thumb ? `<img src="${esc(ep.thumb)}" onerror="this.style.display='none'" alt="">` : ''}
            <span class="ep-panel-thumb-name">${esc(ep.name)}</span>
        </button>`).join('');
}

function renderEpGrid(series, isAdmin) {
    const globalIndices = series.map(ep =>
        (curProj.episodes||[]).findIndex(e =>
            e === ep || (e.url === ep.url && e.name === ep.name && e.type === ep.type)
        )
    );
    const epList = document.getElementById('v-ep-list');
    if (!epList) return;
    epList.innerHTML = series.map((ep, i) => `
        <div class="ep-card ${i===currentEpIdx?'ep-card--active':''}" onclick="playEpByIdxGlobal(${i})">
            <div class="ep-card-thumb">
                ${ep.thumb ? `<img src="${esc(ep.thumb)}" alt="" onerror="this.style.display='none'">` : ''}
                <span style="${ep.thumb?'display:none;':''}width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:var(--text-dim);">
                    <i class="fas fa-film"></i>
                </span>
                ${isAdmin ? `
                <div class="ep-card-adm">
                    <button class="ep-adm-btn ep-adm-btn--edit" onclick="event.stopPropagation();editEp(${globalIndices[i]})"><i class="fas fa-pen"></i></button>
                    <button class="ep-adm-btn ep-adm-btn--del"  onclick="event.stopPropagation();delEp(${globalIndices[i]})"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>
            <div class="ep-card-name">${esc(ep.name)}</div>
            ${ep.title ? `<div class="ep-card-title">${esc(ep.title)}</div>` : ''}
        </div>`).join('');
}

function scheduleIntroTimers(series, idx) {
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];
    playerHideAllOverlays(MAIN_ID);
    const ep = series[idx];
    if (!ep) return;

    const hasIntro = ep.introStart > 0 && ep.introEnd > 0 && ep.introEnd > ep.introStart;
    if (hasIntro) {
        const t1 = setTimeout(() => {
            if (currentEpIdx !== idx) return;
            if (playerSettings.autoSkip) { playerSeekTo(MAIN_ID, ep.introEnd); return; }
            playerShowSkip(MAIN_ID, () => playerSeekTo(MAIN_ID, ep.introEnd));
            const duration = ep.introEnd - ep.introStart;
            const t2 = setTimeout(() => { if (currentEpIdx !== idx) return; playerHideSkip(MAIN_ID); }, duration * 1000);
            introTimers.push(t2);
        }, ep.introStart * 1000);
        introTimers.push(t1);
    }

    if (ep.outroStart && ep.outroStart > 0) {
        const t3 = setTimeout(() => {
            if (currentEpIdx !== idx) return;
            if (idx >= series.length - 1) return;
            if (playerSettings.autoNext) { playNextEp(); return; }
            playerShowNext(MAIN_ID, () => playNextEp());
        }, ep.outroStart * 1000);
        introTimers.push(t3);
    }
}

function playEp(series, idx, isAdmin) {
    if (!series[idx]) return;
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];
    currentEpIdx = idx;
    const ep = series[idx];
    playerLoad(MAIN_ID, { sources: buildSources(ep) }, ep.name + (ep.title ? ' — ' + ep.title : ''));
    playerUpdateEpisodes(MAIN_ID, series, idx);
    const titleEl = document.getElementById('v-current-ep-title');
    if (titleEl) titleEl.innerText = ep.name + (ep.title ? ' — ' + ep.title : '');
    document.querySelectorAll('.ep-card').forEach((c, i) => c.classList.toggle('ep-card--active', i===idx));
    document.querySelectorAll('.ep-panel-thumb-btn').forEach((b, i) => b.classList.toggle('active', i===idx));
    scheduleIntroTimers(series, idx);
}

window.playEpByIdxGlobal = (idx) => {
    const series = (curProj?.episodes||[]).filter(e => e.type !== 'trailer');
    playEp(series, idx, false);
};

window.playNextEp = () => {
    const series = (curProj?.episodes||[]).filter(e => e.type !== 'trailer');
    if (currentEpIdx < series.length - 1) playEp(series, currentEpIdx + 1, false);
};

window._syncPlayerSettings = (containerId) => {
    if (containerId !== MAIN_ID) return;
    const st = getPlayerStateExternal(MAIN_ID);
    if (st) { playerSettings.autoSkip = st.autoSkip||false; playerSettings.autoNext = st.autoNext||false; }
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
        const snap = await getDoc(doc(db, `users/${uid}/watchlist`, relId));
        if (!snap.exists()) return;
        const { type } = snap.data();
        if (type === 'later') {
            const b = document.getElementById('btn-watch-later');
            if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-check"></i> В списке'; }
        }
        if (type === 'favorite') {
            const b = document.getElementById('btn-favorite');
            if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-star"></i> В избранном'; }
        }
    } catch(e) {}
}

export function bindReleases(db, auth, getState, storage) {

    // ── Загрузка постера файлом ──
    window.uploadPosterFile = (inputEl) => {
        const file = inputEl.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('Нужен файл изображения', 'error');
        if (file.size > 8 * 1024 * 1024) return showToast('Файл слишком большой (макс. 8 МБ)', 'error');
        const wrap = document.getElementById('poster-upload-wrap');
        const bar  = document.getElementById('poster-upload-bar');
        if (wrap) wrap.style.display = 'block';
        uploadToStorage(storage, file, 'posters', {
            onProgress: (pct) => { if (bar) bar.style.width = pct + '%'; },
            onDone: (url) => {
                const img = document.getElementById('ad-img'); if (img) img.value = url;
                if (wrap) wrap.style.display = 'none';
                showToast('Постер загружен!');
            },
            onError: (err) => { if (wrap) wrap.style.display = 'none'; showToast('Ошибка загрузки: ' + err.message, 'error'); },
        });
    };

    // ── Загрузка видео файлом (VAT-источник) ──
    window.uploadEpVideoFile = (inputEl) => {
        const file = inputEl.files[0];
        if (!file) return;
        if (!file.type.startsWith('video/')) return showToast('Нужен видеофайл', 'error');
        if (file.size > 3 * 1024 * 1024 * 1024) return showToast('Файл слишком большой (макс. 3 ГБ)', 'error');
        const wrap = document.getElementById('ep-upload-wrap');
        const bar  = document.getElementById('ep-upload-bar');
        const saveBtn = document.getElementById('ep-save-btn');
        if (wrap) wrap.style.display = 'block';
        if (saveBtn) saveBtn.disabled = true;
        uploadToStorage(storage, file, 'videos', {
            onProgress: (pct) => { if (bar) bar.style.width = pct + '%'; if (bar) bar.textContent = pct + '%'; },
            onDone: (url) => {
                const urlEl = document.getElementById('ad-ep-url'); if (urlEl) urlEl.value = url;
                if (wrap) wrap.style.display = 'none';
                if (saveBtn) saveBtn.disabled = false;
                showToast('Видео загружено!');
            },
            onError: (err) => { if (wrap) wrap.style.display = 'none'; if (saveBtn) saveBtn.disabled = false; showToast('Ошибка загрузки: ' + err.message, 'error'); },
        });
    };

    // ── Загрузка превью эпизода файлом ──
    window.uploadEpThumbFile = (inputEl) => {
        const file = inputEl.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('Нужен файл изображения', 'error');
        if (file.size > 5 * 1024 * 1024) return showToast('Файл слишком большой (макс. 5 МБ)', 'error');
        uploadToStorage(storage, file, 'thumbs', {
            onDone: (url) => { const el = document.getElementById('ad-ep-thumb'); if (el) el.value = url; showToast('Превью загружено!'); },
            onError: (err) => showToast('Ошибка загрузки: ' + err.message, 'error'),
        });
    };

    window.filterData = () => { const { isAdmin } = getState(); renderGrid(isAdmin); };

    window.openView = async (id) => {
        const { userData, isAdmin } = getState();
        await openViewRelease(db, auth, id, userData, isAdmin);
        getState().curProj = curProj;
    };

    window.rateProj = async (type) => {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return showToast('Авторизуйтесь для оценки', 'error');
        const uid = auth.currentUser.uid;
        let likes = [...(curProj.likes||[])], dislikes = [...(curProj.dislikes||[])];
        if (type === 'like') {
            if (likes.includes(uid)) likes = likes.filter(x=>x!==uid);
            else { likes.push(uid); dislikes = dislikes.filter(x=>x!==uid); }
        } else {
            if (dislikes.includes(uid)) dislikes = dislikes.filter(x=>x!==uid);
            else { dislikes.push(uid); likes = likes.filter(x=>x!==uid); }
        }
        curProj.likes = likes; curProj.dislikes = dislikes;
        try {
            await updateDoc(doc(db, 'releases', curProj.id), { likes, dislikes });
            updateLikesUI(auth, userData);
            await checkAndAwardAch(db, auth, userData, 'like_1');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.toggleWatchList = async (type) => {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return showToast('Войдите для добавления в список', 'error');
        const uid  = auth.currentUser.uid;
        const ref  = doc(db, `users/${uid}/watchlist`, curProj.id);
        try {
            const snap = await getDoc(ref);
            if (snap.exists() && snap.data().type === type) {
                await deleteDoc(ref);
                if (type === 'later') {
                    const b = document.getElementById('btn-watch-later');
                    if (b) { b.classList.remove('btn-active'); b.innerHTML='<i class="fas fa-clock"></i> Буду смотреть'; }
                } else {
                    const b = document.getElementById('btn-favorite');
                    if (b) { b.classList.remove('btn-active'); b.innerHTML='<i class="fas fa-star"></i> Избранное'; }
                }
                showToast('Удалено из списка');
            } else {
                await setDoc(ref, { type, relId: curProj.id, title: curProj.title, img: curProj.img, addedAt: Date.now() });
                if (type === 'later') {
                    const b = document.getElementById('btn-watch-later');
                    if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-check"></i> В списке'; }
                    showToast('Добавлено в «Буду смотреть»');
                } else {
                    const b = document.getElementById('btn-favorite');
                    if (b) { b.classList.add('btn-active'); b.innerHTML='<i class="fas fa-star"></i> В избранном'; }
                    showToast('Добавлено в избранное <i class="fas fa-star"></i>');
                    await checkAndAwardAch(db, auth, userData, 'favorite_1');
                }
            }
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openEpManager = () => {
        const editIdxEl = document.getElementById('ed-ep-idx');
        if (editIdxEl) editIdxEl.value = '';
        ['ad-ep-name','ad-ep-title','ad-ep-url','ad-ep-kodik','ad-ep-thumb',
         'ad-ep-intro-start','ad-ep-intro-end','ad-ep-outro-start'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        ['ad-ep-file','ad-ep-thumb-file'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const kSearch = document.getElementById('ad-ep-kodik-search'); if (kSearch) kSearch.value = '';
        const kBox = document.getElementById('kodik-results'); if (kBox) { kBox.innerHTML = ''; kBox.style.display = 'none'; }
        const barWrap = document.getElementById('ep-upload-wrap'); if (barWrap) barWrap.style.display = 'none';
        const h = document.getElementById('m-ep-heading');
        if (h) h.textContent = 'Добавить медиа';
        document.getElementById('m-ep').style.display = 'flex';
    };

    window.editEp = (globalIdx) => {
        const ep = (curProj.episodes||[])[globalIdx];
        if (!ep) return;
        const editIdxEl = document.getElementById('ed-ep-idx');
        if (editIdxEl) editIdxEl.value = globalIdx;
        const toMM = (sec) => {
            if (!sec || sec <= 0) return '';
            const m = Math.floor(sec/60), s = Math.floor(sec%60);
            return `${m}:${String(s).padStart(2,'0')}`;
        };
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v||''; };
        set('ad-ep-type',        ep.type  || 'series');
        set('ad-ep-name',        ep.name  || '');
        set('ad-ep-title',       ep.title || '');
        set('ad-ep-url',         ep.url   || '');
        set('ad-ep-kodik',       ep.kodikUrl || '');
        set('ad-ep-thumb',       ep.thumb || '');
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

        const parseMinSec = (val) => {
            if (!val) return 0;
            val = String(val).replace(/[^0-9:]/g, '');
            if (val.includes(':')) {
                const [m, s] = val.split(':').map(Number);
                return (m||0)*60 + (s||0);
            }
            return parseInt(val) || 0;
        };

        const introStart = parseMinSec(document.getElementById('ad-ep-intro-start')?.value || '');
        const introEnd   = parseMinSec(document.getElementById('ad-ep-intro-end')?.value   || '');
        const outroStart = parseMinSec(document.getElementById('ad-ep-outro-start')?.value || '');

        const ep = {
            type:       document.getElementById('ad-ep-type')?.value         || 'series',
            name:       document.getElementById('ad-ep-name')?.value.trim()  || '',
            title:      document.getElementById('ad-ep-title')?.value.trim() || '',
            url:        document.getElementById('ad-ep-url')?.value.trim()   || '',
            kodikUrl:   document.getElementById('ad-ep-kodik')?.value.trim() || '',
            thumb:      document.getElementById('ad-ep-thumb')?.value.trim() || '',
            introStart, introEnd, outroStart,
        };
        if (!ep.name || !ep.url) return showToast('Заполните название и URL!', 'error');
        if (ep.introEnd > 0 && ep.introEnd <= ep.introStart)
            return showToast('Конец заставки должен быть позже начала!', 'error');

        const eps = [...(curProj.episodes||[])];
        if (editIdx >= 0 && editIdx < eps.length) eps[editIdx] = ep;
        else eps.push(ep);

        try {
            await updateDoc(doc(db, 'releases', curProj.id), { episodes: eps });
            curProj.episodes = eps;
            closeModals();
            const series = eps.filter(e => e.type !== 'trailer');
            renderEpGrid(series, isAdmin);
            renderEpPanelBtns(series);
            playerUpdateEpisodes(MAIN_ID, series, currentEpIdx);
            if (editIdx < 0 && series.length === 1) playEp(series, 0, isAdmin);
            showToast(editIdx >= 0 ? 'Медиа обновлено!' : 'Медиа добавлено!');
            if (editIdxEl) editIdxEl.value = '';
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.delEp = async (globalIdx) => {
        if (!confirm('Удалить медиа?')) return;
        const { isAdmin } = getState();
        const eps = [...(curProj.episodes||[])];
        eps.splice(globalIdx, 1);
        try {
            await updateDoc(doc(db, 'releases', curProj.id), { episodes: eps });
            curProj.episodes = eps;
            const series = eps.filter(e => e.type !== 'trailer');
            if (currentEpIdx >= series.length) currentEpIdx = Math.max(0, series.length-1);
            renderEpGrid(series, isAdmin);
            renderEpPanelBtns(series);
            playerUpdateEpisodes(MAIN_ID, series, currentEpIdx);
            if (series.length > 0) playEp(series, currentEpIdx, isAdmin);
            showToast('Удалено');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openRelModal = async (id='') => {
        const edId = document.getElementById('ed-rel-id');
        if (edId) edId.value = id;
        if (id) {
            const r = allRel.find(x => x.id === id);
            if (r) {
                ['title','year','voiceover','authors','img','desc'].forEach(f => {
                    const el = document.getElementById('ad-' + f); if (el) el.value = r[f]||'';
                });
                const g = document.getElementById('ad-genre'); if (g) g.value = r.genre||'';
            }
        } else {
            ['title','year','voiceover','authors','img','desc'].forEach(f => {
                const el = document.getElementById('ad-' + f); if (el) el.value = '';
            });
        }
        document.getElementById('m-rel').style.display = 'flex';
    };

    window.saveRel = async () => {
        const { isAdmin } = getState();
        const id = document.getElementById('ed-rel-id')?.value;
        const data = {
            title:     document.getElementById('ad-title')?.value     || '',
            genre:     document.getElementById('ad-genre')?.value     || '',
            year:      document.getElementById('ad-year')?.value      || '',
            voiceover: document.getElementById('ad-voiceover')?.value || '',
            authors:   document.getElementById('ad-authors')?.value   || '',
            img:       document.getElementById('ad-img')?.value       || '',
            desc:      document.getElementById('ad-desc')?.value      || '',
            timestamp: id ? (allRel.find(x=>x.id===id)?.timestamp||Date.now()) : Date.now()
        };
        if (!data.title) return showToast('Введите название!', 'error');
        try {
            if (!id) await addDoc(collection(db, 'releases'), data);
            else     await updateDoc(doc(db, 'releases', id), data);
            closeModals();
            await loadReleases(db, isAdmin);
            showToast('Релиз сохранён!');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.deleteRel = async (id) => {
        if (!confirm('Удалить релиз?')) return;
        const { isAdmin } = getState();
        try {
            await deleteDoc(doc(db, 'releases', id));
            await loadReleases(db, isAdmin);
            showToast('Удалено');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.openPrivacy = async () => {
        const { isAdmin } = getState();
        try {
            const snap = await getDoc(doc(db, 'settings', 'privacy'));
            const textEl = document.getElementById('priv-text');
            if (textEl) textEl.innerText = snap.exists() ? snap.data().text : 'Текст не добавлен.';
        } catch(e) {
            const textEl = document.getElementById('priv-text');
            if (textEl) textEl.innerText = 'Текст не добавлен.';
        }
        const admBtns = document.getElementById('priv-adm-btns');
        if (admBtns) admBtns.style.display = isAdmin ? 'block' : 'none';
        document.getElementById('m-privacy').style.display = 'flex';
    };

    window.editPriv = () => {
        const txt    = document.getElementById('priv-text');
        const edit   = document.getElementById('priv-edit');
        const btnEd  = document.getElementById('priv-btn-edit');
        const btnSav = document.getElementById('priv-btn-save');
        if (txt)    txt.style.display    = 'none';
        if (edit)   { edit.style.display = 'block'; edit.value = txt?.innerText || ''; }
        if (btnEd)  btnEd.style.display  = 'none';
        if (btnSav) btnSav.style.display = 'block';
    };

    window.savePriv = async () => {
        const edit   = document.getElementById('priv-edit');
        const txt    = document.getElementById('priv-text');
        const btnEd  = document.getElementById('priv-btn-edit');
        const btnSav = document.getElementById('priv-btn-save');
        const text   = edit?.value || '';
        try {
            await setDoc(doc(db, 'settings', 'privacy'), { text });
            if (txt)    { txt.innerText    = text; txt.style.display = 'block'; }
            if (edit)   edit.style.display   = 'none';
            if (btnEd)  btnEd.style.display  = 'block';
            if (btnSav) btnSav.style.display = 'none';
            showToast('Сохранено!');
        } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
    };

    window.loadMyLists = async () => {
        const { userData } = getState();
        if (!userData || !auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const container = document.getElementById('my-lists-wrap');
        if (!container) return;
        container.innerHTML = '<p style="font-size:12px;color:var(--text-dim);">Загрузка...</p>';
        try {
            const [wSnap, vSnap] = await Promise.all([
                getDocs(collection(db, `users/${uid}/watchlist`)),
                getDocs(collection(db, `users/${uid}/viewed`)),
            ]);
            const all      = wSnap.docs.map(d => d.data());
            const later    = all.filter(x => x.type === 'later');
            const favorite = all.filter(x => x.type === 'favorite');
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

            const cardHtml = (r) => `<div class="list-card" onclick="openView('${r.relId||r.id}')">
                <img src="${esc(r.img)}" onerror="this.src='${PLACEHOLDER_IMG}'" alt="">
                <div class="list-card-title">${esc(r.title)}</div>
            </div>`;

            const favHtml   = favorite.length ? `<div class="lists-grid">${favorite.map(cardHtml).join('')}</div>` : `<p class="list-empty">Пусто — нажмите <i class="fas fa-star"></i> на странице релиза</p>`;
            const laterHtml = later.length    ? `<div class="lists-grid">${later.map(cardHtml).join('')}</div>`    : `<p class="list-empty">Пусто — нажмите <i class="fas fa-clock"></i> на странице релиза</p>`;
            const viewedHtml= viewed.length
                ? viewed.map(v => `<div class="viewed-row" onclick="openView('${v.id}')">
                    ${v.img ? `<img src="${esc(v.img)}" class="viewed-thumb" onerror="this.style.display='none'" alt="">` : ''}
                    <div style="flex:1;min-width:0;">
                        <div class="viewed-title">${esc(v.title)}</div>
                        <div class="viewed-date"><i class="fas fa-check-circle" style="color:#22c55e;font-size:10px;"></i> ${new Date(v.at).toLocaleDateString('ru')}</div>
                    </div></div>`).join('')
                : `<p class="list-empty">Пусто — смотрите релизы более 10 мин</p>`;

            let pinnedSection = '';
            try {
                const pinnedHtml = await renderPinnedPlaylists(uid);
                if (pinnedHtml) {
                    pinnedSection = `<div class="list-section-wrap">
                        <div class="list-section-header" onclick="toggleListSection('pinned')">
                            <span><i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px;"></i>
                            <b>Плейлисты</b>&nbsp;<span style="color:var(--text-dim);font-size:12px;">(закреплённые)</span></span>
                            <i class="fas fa-chevron-down list-section-chevron" id="chev-pinned"></i>
                        </div>
                        <div class="list-section-body list-section-open" id="body-pinned">${pinnedHtml}</div>
                    </div>`;
                }
            } catch(pe) { console.warn('Pinned playlists:', pe); }

            container.innerHTML =
                mkSection('fav',    '<i class="fas fa-star"></i>', 'Избранное',     favorite.length, favHtml)
              + mkSection('later',  '<i class="fas fa-clock"></i>', 'Буду смотреть', later.length,    laterHtml)
              + mkSection('viewed', '<i class="fas fa-eye"></i>',  'Просмотрено',  viewed.length,   viewedHtml)
              + pinnedSection;
        } catch(e) {
            container.innerHTML = `<p style="color:#ef4444;font-size:13px;">Ошибка загрузки.</p>`;
            console.error('loadMyLists:', e);
        }
    };

    window.toggleListSection = (id) => {
        const body = document.getElementById('body-' + id);
        const chev = document.getElementById('chev-' + id);
        if (!body) return;
        const open = body.classList.toggle('list-section-open');
        if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
    };
}
