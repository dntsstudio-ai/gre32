// ============================================================
//  js/player.js — SWS Player v4 (VAT native video + source tabs)
// ============================================================
//
// Обратная совместимость: initPlayer/playerLoad/... принимают,
// как и раньше, { url, episodes, ... }. Плюс новое: если у
// эпизода есть ep.sources = [{type:'vat'|'kodik'|..., url, label}],
// сверху появляются вкладки-переключатели источника.
// Если sources нет — просто определяем тип по одной ссылке (url),
// ничего не ломая в текущей схеме данных.

export const PLAYER_CONFIG = { controlsTimeout: 3500, accentColor: 'var(--accent)' };

export function minsToSec(val) {
    if (!val && val !== 0) return 0;
    const s = String(val).trim();
    if (s.includes(':')) { const [m, sec] = s.split(':').map(Number); return (m||0)*60+(sec||0); }
    return parseFloat(s) || 0;
}
export function secToMins(sec) {
    if (!sec || sec <= 0) return '0:00';
    const m = Math.floor(sec/60), s = Math.floor(sec%60);
    return `${m}:${String(s).padStart(2,'0')}`;
}
export function getYtVideoId(url) {
    if (!url) return '';
    try {
        if (url.includes('youtube.com/watch'))  return new URL(url).searchParams.get('v') || '';
        if (url.includes('youtu.be/'))          return url.split('youtu.be/')[1]?.split('?')[0] || '';
        if (url.includes('youtube.com/embed/')) return url.split('youtube.com/embed/')[1]?.split('?')[0] || '';
    } catch(e) {}
    return '';
}
export function buildEmbedSrc(url, startSec=0) {
    if (!url) return '';
    const ytId = getYtVideoId(url);
    if (ytId) {
        const start = startSec > 0 ? `&start=${Math.floor(startSec)}` : '';
        return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1${start}`;
    }
    if (url.includes('drive.google.com')) return url.replace(/\/view.*$/, '/preview');
    return url;
}

// ── Определяем тип источника по ссылке ──────────────────────
const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mov|ogg)(\?|$)/i;
export function detectSourceType(url) {
    if (!url) return 'iframe';
    if (getYtVideoId(url)) return 'youtube';
    if (url.includes('drive.google.com')) return 'drive';
    if (url.includes('kodik')) return 'kodik';
    if (VIDEO_EXT_RE.test(url) || url.includes('firebasestorage') || url.includes('r2.dev') || url.includes('.r2.cloudflarestorage.com'))
        return 'vat';
    return 'iframe';
}
function labelForType(type) {
    return { vat: 'VAT', kodik: 'Kodik', youtube: 'YouTube', drive: 'Google Drive', iframe: 'Плеер' }[type] || 'Плеер';
}
// ── Нормализуем набор источников для эпизода/трейлера ───────
// Принимает либо { url }, либо { sources:[{type,url,label}], url? }
function normalizeSources(epLike) {
    if (!epLike) return [];
    if (Array.isArray(epLike.sources) && epLike.sources.length) {
        return epLike.sources
            .filter(s => s && s.url)
            .map(s => ({ type: s.type || detectSourceType(s.url), url: s.url, label: s.label || labelForType(s.type || detectSourceType(s.url)) }));
    }
    if (epLike.url) {
        const type = detectSourceType(epLike.url);
        return [{ type, url: epLike.url, label: labelForType(type) }];
    }
    return [];
}

function getPlayerState(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return {};
    if (!el._swsState) el._swsState = {
        sources: [], activeSrcIdx: 0, type: 'iframe',
        isYoutube:false, isTrailer:false, menuOpen:false, controlsTimer:null,
        autoSkip:false, autoNext:false, episodes:[], currentIdx:0,
        onNext:null, onSkip:null, title:'', muted:false,
    };
    return el._swsState;
}

// ── Публичный вход: инициализация плеера ─────────────────────
export function initPlayer(containerId, options={}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const {
        url='', sources=null, title='', muted=false,
        episodes=[], currentIdx=0, autoSkip=false, autoNext=false,
        onNext=null, onSkip=null, isTrailer=false, startSec=0,
    } = options;

    const st = getPlayerState(containerId);
    st.sources = normalizeSources(sources ? { sources } : { url });
    st.activeSrcIdx = 0;
    st.isTrailer = isTrailer; st.episodes = episodes; st.currentIdx = currentIdx;
    st.autoSkip = autoSkip; st.autoNext = autoNext; st.onNext = onNext; st.onSkip = onSkip;
    st.title = title; st.muted = muted;

    renderPlayer(containerId, startSec);
}

function activeSource(st) { return st.sources[st.activeSrcIdx] || { type:'iframe', url:'' }; }

function renderPlayer(containerId, startSec=0) {
    const container = document.getElementById(containerId);
    const st = getPlayerState(containerId);
    if (!container) return;
    const src = activeSource(st);
    st.type = src.type === 'vat' ? 'vat' : (src.type === 'youtube' ? 'youtube' : (src.type === 'drive' ? 'drive' : 'iframe'));
    st.isYoutube = src.type === 'youtube';

    container.innerHTML = buildTabsHTML(containerId, st) + `<div class="swsp" id="swsp-${containerId}">` +
        (st.type === 'vat' ? buildVideoHTML(containerId, src.url, st, startSec) : buildIframeHTML(containerId, src, st)) +
        `</div>`;

    attachTabEvents(containerId);
    if (st.type === 'vat') attachVideoEvents(containerId, startSec);
    else attachIframeEvents(containerId);
}

// ── Вкладки-переключатели источника ──────────────────────────
function buildTabsHTML(containerId, st) {
    if (st.sources.length <= 1) return '';
    return `<div class="swsp-tabs" id="swsp-tabs-${containerId}">${st.sources.map((s,i) => `
        <button class="swsp-tab ${i===st.activeSrcIdx?'swsp-tab--active':''}" data-idx="${i}">${s.label}</button>
    `).join('')}</div>`;
}
function attachTabEvents(containerId) {
    const wrap = document.getElementById(`swsp-tabs-${containerId}`);
    if (!wrap) return;
    wrap.querySelectorAll('.swsp-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const st = getPlayerState(containerId);
            st.activeSrcIdx = parseInt(btn.dataset.idx);
            renderPlayer(containerId, 0);
        });
    });
}

// ── VAT: нативный <video> со своим скином ────────────────────
function buildVideoHTML(containerId, url, st, startSec) {
    return `
    <video class="swsp-video" id="swsp-video-${containerId}" src="${url}" ${st.muted?'muted':''} playsinline preload="metadata"></video>
    <div class="swsp-overlay swsp-ov--active" id="swsp-ov-${containerId}">
        <div class="swsp-top">${st.title?`<span class="swsp-title">${st.title}</span>`:''}
            <i class="swsp-ep-menu-btn fas fa-list" id="swsp-eplist-btn-${containerId}" style="${st.episodes.length>1?'':'display:none;'}"></i>
        </div>
        <div class="swsp-midzone" id="swsp-mid-${containerId}"></div>
        <div class="swsp-bottom">
            <button class="swsp-skip-btn" id="swsp-skip-${containerId}" style="display:none;"><i class="fas fa-forward"></i> Пропустить заставку</button>
            <button class="swsp-next-btn" id="swsp-next-${containerId}" style="display:none;">Следующая серия <i class="fas fa-step-forward"></i></button>
            <div class="swsp-progress-row">
                <span class="swsp-time" id="swsp-time-cur-${containerId}">0:00</span>
                <div class="swsp-progress" id="swsp-progress-${containerId}">
                    <div class="swsp-progress-fill" id="swsp-progress-fill-${containerId}"></div>
                    <div class="swsp-progress-thumb" id="swsp-progress-thumb-${containerId}"></div>
                </div>
                <span class="swsp-time" id="swsp-time-dur-${containerId}">0:00</span>
            </div>
            <div class="swsp-ctrl-row">
                <button class="swsp-btn" id="swsp-play-${containerId}" title="Пауза"><i class="fas fa-pause"></i></button>
                <button class="swsp-btn" id="swsp-vol-btn-${containerId}" title="Звук"><i class="fas fa-${st.muted?'volume-mute':'volume-up'}"></i></button>
                <div class="swsp-vol-slider" id="swsp-vol-slider-${containerId}"><div class="swsp-vol-fill" id="swsp-vol-fill-${containerId}"></div></div>
                <div style="flex:1"></div>
                <button class="swsp-btn swsp-speed-btn" id="swsp-speed-${containerId}" title="Скорость">1x</button>
                <button class="swsp-btn" id="swsp-menu-btn-${containerId}" title="Настройки"><i class="fas fa-chevron-up"></i></button>
                <button class="swsp-btn" id="swsp-fs-btn-${containerId}" title="Полный экран"><i class="fas fa-expand" id="swsp-fs-icon-${containerId}"></i></button>
            </div>
        </div>
    </div>
    ${buildSettingsMenuHTML(containerId, st)}`;
}

function attachVideoEvents(containerId, startSec) {
    const container = document.getElementById(containerId);
    const st = getPlayerState(containerId);
    const video   = document.getElementById(`swsp-video-${containerId}`);
    const root    = document.getElementById(`swsp-${containerId}`);
    const overlay = document.getElementById(`swsp-ov-${containerId}`);
    const mid     = document.getElementById(`swsp-mid-${containerId}`);
    const playBtn = document.getElementById(`swsp-play-${containerId}`);
    const volBtn  = document.getElementById(`swsp-vol-btn-${containerId}`);
    const volSl   = document.getElementById(`swsp-vol-slider-${containerId}`);
    const volFill = document.getElementById(`swsp-vol-fill-${containerId}`);
    const speedBtn= document.getElementById(`swsp-speed-${containerId}`);
    const progress= document.getElementById(`swsp-progress-${containerId}`);
    const progFill= document.getElementById(`swsp-progress-fill-${containerId}`);
    const progThumb=document.getElementById(`swsp-progress-thumb-${containerId}`);
    const timeCur = document.getElementById(`swsp-time-cur-${containerId}`);
    const timeDur = document.getElementById(`swsp-time-dur-${containerId}`);
    const skipBtn = document.getElementById(`swsp-skip-${containerId}`);
    const nextBtn = document.getElementById(`swsp-next-${containerId}`);
    if (!video) return;

    video.volume = 1;
    if (volFill) volFill.style.width = '100%';

    if (startSec > 0) video.currentTime = startSec;
    video.play().catch(()=>{});

    function showOverlay() {
        overlay.classList.add('swsp-ov--active');
        clearTimeout(st.controlsTimer);
        if (!st.menuOpen) st.controlsTimer = setTimeout(() => { if (!video.paused) overlay.classList.remove('swsp-ov--active'); }, PLAYER_CONFIG.controlsTimeout);
    }
    overlay.addEventListener('mousemove', showOverlay);
    overlay.addEventListener('touchstart', showOverlay, {passive:true});
    if (mid) mid.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });

    video.addEventListener('play',  () => { if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>'; showOverlay(); });
    video.addEventListener('pause', () => { if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>'; overlay.classList.add('swsp-ov--active'); clearTimeout(st.controlsTimer); });
    if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); video.paused ? video.play() : video.pause(); });

    video.addEventListener('loadedmetadata', () => { if (timeDur) timeDur.textContent = secToMins(video.duration); });
    video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        const pct = (video.currentTime / video.duration) * 100;
        if (progFill)  progFill.style.width = pct + '%';
        if (progThumb) progThumb.style.left = pct + '%';
        if (timeCur)   timeCur.textContent = secToMins(video.currentTime);
    });

    function seekFromEvent(e) {
        const rect = progress.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        if (video.duration) video.currentTime = pct * video.duration;
    }
    if (progress) {
        let dragging = false;
        progress.addEventListener('mousedown', (e) => { dragging = true; seekFromEvent(e); });
        window.addEventListener('mousemove', (e) => { if (dragging) seekFromEvent(e); });
        window.addEventListener('mouseup', () => { dragging = false; });
        progress.addEventListener('touchstart', (e) => { dragging = true; seekFromEvent(e); }, {passive:true});
        progress.addEventListener('touchmove', (e) => { if (dragging) seekFromEvent(e); }, {passive:true});
        window.addEventListener('touchend', () => { dragging = false; });
    }

    if (volBtn) volBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        volBtn.innerHTML = `<i class="fas fa-${video.muted?'volume-mute':'volume-up'}"></i>`;
    });
    if (volSl) {
        function setVolFromEvent(e) {
            const rect = volSl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            video.volume = pct; video.muted = pct === 0;
            if (volFill) volFill.style.width = (pct*100) + '%';
            if (volBtn) volBtn.innerHTML = `<i class="fas fa-${video.muted?'volume-mute':'volume-up'}"></i>`;
        }
        volSl.addEventListener('click', setVolFromEvent);
    }

    if (speedBtn) speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const speeds = [1, 1.25, 1.5, 1.75, 2, 0.75];
        const cur = speeds.indexOf(video.playbackRate);
        const next = speeds[(cur + 1) % speeds.length];
        video.playbackRate = next;
        speedBtn.textContent = next + 'x';
    });

    if (skipBtn) skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skipBtn.style.display='none'; if(st.onSkip)st.onSkip(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextBtn.style.display='none'; if(st.onNext)st.onNext(); });

    attachSettingsMenu(containerId);
    attachFullscreen(containerId, root);

    const eplistBtnTop = document.getElementById(`swsp-eplist-btn-${containerId}`);
    if (eplistBtnTop) eplistBtnTop.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(containerId); });
}

// ── Kodik / YouTube / Drive / прочее — как раньше, через iframe ─
function appendMuteParam(url) {
    if (!url) return url;
    return url + (url.includes('?') ? '&' : '?') + 'mute=1';
}
function buildIframeHTML(containerId, src, st) {
    const base = buildEmbedSrc(src.url);
    const embedSrc = (src.type !== 'drive' && st.muted) ? appendMuteParam(base) : base;
    if (src.type === 'drive') {
        return `<iframe class="swsp-iframe swsp-iframe--drive" id="swsp-iframe-${containerId}" src="${buildEmbedSrc(src.url)}" allow="autoplay;fullscreen;picture-in-picture" frameborder="0" title="${st.title}"></iframe>
        ${!st.isTrailer?`<button class="swsp-skip-btn" id="swsp-skip-${containerId}" style="display:none;"><i class="fas fa-forward"></i> Пропустить заставку</button><button class="swsp-next-btn" id="swsp-next-${containerId}" style="display:none;">Следующая серия <i class="fas fa-step-forward"></i></button><button class="swsp-drive-menu-btn" id="swsp-menu-btn-${containerId}" title="Меню"><i class="fas fa-chevron-up"></i></button>`:''}
        ${buildSettingsMenuHTML(containerId, st)}`;
    }
    return `<iframe class="swsp-iframe" id="swsp-iframe-${containerId}" src="${embedSrc}" allow="autoplay;fullscreen;picture-in-picture" frameborder="0" title="${st.title}"></iframe>
    <div class="swsp-overlay" id="swsp-ov-${containerId}">
        ${st.title?`<div class="swsp-top"><span class="swsp-title">${st.title}</span></div>`:''}
        <div class="swsp-midzone" id="swsp-mid-${containerId}"></div>
        <div class="swsp-ctrl-row" style="padding:0 16px 14px;">
            <button class="swsp-btn" id="swsp-mute-${containerId}" title="Звук"><i class="fas fa-${st.muted?'volume-mute':'volume-up'}"></i></button>
            <div style="flex:1"></div>
            ${!st.isTrailer?`<button class="swsp-btn" id="swsp-menu-btn-${containerId}" title="Настройки"><i class="fas fa-chevron-up"></i></button>`:''}
            <button class="swsp-btn" id="swsp-fs-btn-${containerId}" title="Полный экран"><i class="fas fa-expand" id="swsp-fs-icon-${containerId}"></i></button>
        </div>
        ${!st.isTrailer?`<button class="swsp-skip-btn" id="swsp-skip-${containerId}" style="display:none;"><i class="fas fa-forward"></i> Пропустить заставку</button><button class="swsp-next-btn" id="swsp-next-${containerId}" style="display:none;">Следующая серия <i class="fas fa-step-forward"></i></button>`:''}
    </div>
    ${!st.isTrailer ? buildSettingsMenuHTML(containerId, st) : ''}`;
}

function buildSettingsMenuHTML(containerId, st) {
    return `<div class="swsp-menu" id="swsp-menu-${containerId}">
        <div class="swsp-menu-header"><span class="swsp-menu-title"><i class="fas fa-sliders-h"></i> Настройки</span><button class="swsp-menu-close" id="swsp-menu-close-${containerId}"><i class="fas fa-chevron-down"></i></button></div>
        <div class="swsp-menu-body">
            <div class="swsp-menu-section">
                <div class="swsp-menu-label">Авто-функции</div>
                <label class="swsp-toggle-row"><div class="swsp-toggle-info"><i class="fas fa-forward" style="color:var(--accent)"></i><span>Авто-пропуск заставки</span></div><div class="swsp-toggle ${st.autoSkip?'swsp-toggle--on':''}" id="swsp-tog-skip-${containerId}"><div class="swsp-toggle-knob"></div></div></label>
                <label class="swsp-toggle-row"><div class="swsp-toggle-info"><i class="fas fa-step-forward" style="color:var(--accent)"></i><span>Авто-следующая серия</span></div><div class="swsp-toggle ${st.autoNext?'swsp-toggle--on':''}" id="swsp-tog-next-${containerId}"><div class="swsp-toggle-knob"></div></div></label>
            </div>
            ${buildEpListHTML(containerId, st.episodes, st.currentIdx)}
        </div>
    </div>`;
}
function buildEpListHTML(containerId, episodes, currentIdx) {
    if (!episodes || episodes.length <= 1) return '';
    return `<div class="swsp-menu-section"><div class="swsp-menu-label">Серии</div><div class="swsp-ep-list" id="swsp-ep-list-${containerId}">${episodes.map((ep,i)=>`<button class="swsp-ep-btn ${i===currentIdx?'active':''}" data-idx="${i}"><span class="swsp-ep-num">${i+1}</span><span class="swsp-ep-name">${ep.name||`Серия ${i+1}`}</span>${i===currentIdx?'<i class="fas fa-play" style="color:var(--accent);font-size:10px;margin-left:auto;"></i>':''}</button>`).join('')}</div></div>`;
}

function attachSettingsMenu(containerId) {
    const menuBtn = document.getElementById(`swsp-menu-btn-${containerId}`);
    const closeBtn= document.getElementById(`swsp-menu-close-${containerId}`);
    const skipTog = document.getElementById(`swsp-tog-skip-${containerId}`);
    const nextTog = document.getElementById(`swsp-tog-next-${containerId}`);
    const epList  = document.getElementById(`swsp-ep-list-${containerId}`);
    if (menuBtn)  menuBtn.addEventListener('click',  (e) => { e.stopPropagation(); toggleMenu(containerId); });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(containerId); });
    if (skipTog)  skipTog.addEventListener('click',  () => toggleAutoSkip(containerId));
    if (nextTog)  nextTog.addEventListener('click',  () => toggleAutoNext(containerId));
    if (epList) epList.querySelectorAll('.swsp-ep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleMenu(containerId);
            const idx = parseInt(btn.dataset.idx);
            if (window.playEpByIdxGlobal) window.playEpByIdxGlobal(idx);
        });
    });
}
function toggleMenu(containerId) {
    const menu = document.getElementById(`swsp-menu-${containerId}`);
    const btn  = document.getElementById(`swsp-menu-btn-${containerId}`);
    const ov   = document.getElementById(`swsp-ov-${containerId}`);
    const st   = getPlayerState(containerId);
    if (!menu) return;
    st.menuOpen = !st.menuOpen;
    menu.classList.toggle('swsp-menu--open', st.menuOpen);
    if (btn) { btn.classList.toggle('swsp-menu-btn--active', st.menuOpen); const icon=btn.querySelector('i'); if(icon) icon.className=st.menuOpen?'fas fa-chevron-down':'fas fa-chevron-up'; }
    if (ov) ov.classList.add('swsp-ov--active');
}
function toggleAutoSkip(containerId) {
    const st=getPlayerState(containerId); const tog=document.getElementById(`swsp-tog-skip-${containerId}`);
    st.autoSkip=!st.autoSkip; tog?.classList.toggle('swsp-toggle--on',st.autoSkip);
    if (window._syncPlayerSettings) window._syncPlayerSettings(containerId);
}
function toggleAutoNext(containerId) {
    const st=getPlayerState(containerId); const tog=document.getElementById(`swsp-tog-next-${containerId}`);
    st.autoNext=!st.autoNext; tog?.classList.toggle('swsp-toggle--on',st.autoNext);
    if (window._syncPlayerSettings) window._syncPlayerSettings(containerId);
}

function attachIframeEvents(containerId) {
    const st = getPlayerState(containerId);
    const root = document.getElementById(`swsp-${containerId}`);
    if (st.type === 'drive') {
        const skipBtn = document.getElementById(`swsp-skip-${containerId}`);
        const nextBtn = document.getElementById(`swsp-next-${containerId}`);
        const menuBtn = document.getElementById(`swsp-menu-btn-${containerId}`);
        if (skipBtn) skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skipBtn.style.display='none'; if(st.onSkip)st.onSkip(); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextBtn.style.display='none'; if(st.onNext)st.onNext(); });
        if (menuBtn) menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(containerId); });
        attachSettingsMenu(containerId);
        attachFullscreen(containerId, root);
        return;
    }
    const overlay = document.getElementById(`swsp-ov-${containerId}`);
    const mid     = document.getElementById(`swsp-mid-${containerId}`);
    const muteBtn = document.getElementById(`swsp-mute-${containerId}`);
    const iframe  = document.getElementById(`swsp-iframe-${containerId}`);
    const skipBtn = document.getElementById(`swsp-skip-${containerId}`);
    const nextBtn = document.getElementById(`swsp-next-${containerId}`);
    function showOverlay() {
        if (!overlay) return;
        overlay.classList.add('swsp-ov--active');
        clearTimeout(st.controlsTimer);
        if (!st.menuOpen) st.controlsTimer = setTimeout(() => overlay.classList.remove('swsp-ov--active'), PLAYER_CONFIG.controlsTimeout);
    }
    if (overlay) { overlay.addEventListener('mousemove', showOverlay); overlay.addEventListener('touchstart', showOverlay, {passive:true}); }
    if (mid) mid.addEventListener('click', showOverlay);
    if (muteBtn && iframe) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const icon = muteBtn.querySelector('i');
            const isMuted = icon?.classList.contains('fa-volume-mute');
            ytMsg(iframe, isMuted ? 'unMute' : 'mute');
            if (icon) icon.className = isMuted ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        });
    }
    if (skipBtn) skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skipBtn.style.display='none'; if(st.onSkip)st.onSkip(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextBtn.style.display='none'; if(st.onNext)st.onNext(); });
    const menuBtn = document.getElementById(`swsp-menu-btn-${containerId}`);
    if (menuBtn) menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(containerId); });
    attachSettingsMenu(containerId);
    attachFullscreen(containerId, root);
}
function attachFullscreen(containerId, root) {
    const fsBtn  = document.getElementById(`swsp-fs-btn-${containerId}`);
    const fsIcon = document.getElementById(`swsp-fs-icon-${containerId}`);
    if (fsBtn && root) {
        fsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement) { root.requestFullscreen?.() || root.webkitRequestFullscreen?.(); if(fsIcon) fsIcon.className='fas fa-compress'; }
            else { document.exitFullscreen?.() || document.webkitExitFullscreen?.(); if(fsIcon) fsIcon.className='fas fa-expand'; }
        });
    }
    document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement && fsIcon) fsIcon.className='fas fa-expand'; });
}
function ytMsg(iframe, cmd, args=[]) { try { iframe?.contentWindow?.postMessage(JSON.stringify({event:'command',func:cmd,args}),'*'); } catch(e) {} }

// ── Публичный вход: смена серии на уже проигрывающемся плеере ──
export function playerLoad(containerId, urlOrEp, title='', startSec=0) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const st = getPlayerState(containerId);
    st.title = title;
    st.sources = typeof urlOrEp === 'string' ? normalizeSources({ url: urlOrEp }) : normalizeSources(urlOrEp);
    st.activeSrcIdx = 0;
    renderPlayer(containerId, startSec);
}

export function playerUpdateEpisodes(containerId, episodes, currentIdx) {
    const st = getPlayerState(containerId); st.episodes=episodes; st.currentIdx=currentIdx;
    const eplistBtn = document.getElementById(`swsp-eplist-btn-${containerId}`);
    if (eplistBtn) eplistBtn.style.display = episodes.length>1 ? '' : 'none';
    const listEl = document.getElementById(`swsp-ep-list-${containerId}`);
    if (!listEl) return;
    listEl.innerHTML = episodes.map((ep,i)=>`<button class="swsp-ep-btn ${i===currentIdx?'active':''}" data-idx="${i}"><span class="swsp-ep-num">${i+1}</span><span class="swsp-ep-name">${ep.name||`Серия ${i+1}`}</span>${i===currentIdx?'<i class="fas fa-play" style="color:var(--accent);font-size:10px;margin-left:auto;"></i>':''}</button>`).join('');
    listEl.querySelectorAll('.swsp-ep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleMenu(containerId);
            const idx = parseInt(btn.dataset.idx);
            if (window.playEpByIdxGlobal) window.playEpByIdxGlobal(idx);
        });
    });
}
export function playerShowSkip(containerId, onSkip) { const st=getPlayerState(containerId); const btn=document.getElementById(`swsp-skip-${containerId}`); if(!btn)return; st.onSkip=onSkip; btn.style.display='flex'; btn.onclick=(e)=>{e.stopPropagation();btn.style.display='none';if(onSkip)onSkip();}; }
export function playerHideSkip(containerId) { const btn=document.getElementById(`swsp-skip-${containerId}`); if(btn)btn.style.display='none'; }
export function playerShowNext(containerId, onNext) { const st=getPlayerState(containerId); const btn=document.getElementById(`swsp-next-${containerId}`); if(!btn)return; st.onNext=onNext; btn.style.display='flex'; btn.onclick=(e)=>{e.stopPropagation();btn.style.display='none';if(onNext)onNext();}; }
export function playerHideNext(containerId) { const btn=document.getElementById(`swsp-next-${containerId}`); if(btn)btn.style.display='none'; }
export function playerHideAllOverlays(containerId) { playerHideSkip(containerId); playerHideNext(containerId); }
export function playerSeekTo(containerId, seconds) {
    const st = getPlayerState(containerId);
    if (st.type === 'vat') {
        const video = document.getElementById(`swsp-video-${containerId}`);
        if (video) video.currentTime = seconds;
        return;
    }
    const container = document.getElementById(containerId); if(!container)return;
    const iframe = container.querySelector(`#swsp-iframe-${containerId}`); if(!iframe)return;
    if (st.isYoutube) { const base=iframe.src.replace(/[?&]start=\d+/,''); iframe.src=base+`&start=${Math.floor(seconds)}`; }
}
export function playerSyncSettings(containerId, autoSkip, autoNext) {
    const st=getPlayerState(containerId); st.autoSkip=autoSkip; st.autoNext=autoNext;
    document.getElementById(`swsp-tog-skip-${containerId}`)?.classList.toggle('swsp-toggle--on',autoSkip);
    document.getElementById(`swsp-tog-next-${containerId}`)?.classList.toggle('swsp-toggle--on',autoNext);
}
export function getPlayerStateExternal(containerId) { return getPlayerState(containerId); }
