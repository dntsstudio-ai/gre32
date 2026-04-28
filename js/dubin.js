// ============================================================
//  js/dubin.js — Voice Acting Team — DUB-in
// ============================================================

import {
    collection, getDocs, getDoc, doc, addDoc,
    updateDoc, deleteDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { esc, showToast, closeModals } from './core.js';
import { EMAILJS_CONFIG } from '../config/config.js';
import { checkAndAwardAch } from './achievements.js';

export function initDubinPanel(isAdmin, isDub) {
    const filesPanel   = document.getElementById('dubin-files-panel');
    const suggestPanel = document.getElementById('dubin-suggest-panel');
    const addProjBtn   = document.getElementById('dubin-adm-add-project');
    const joinCta      = document.getElementById('join-cta-block');
    const sugNameBlock = document.getElementById('sug-name-block');
    if (isDub) {
        filesPanel.style.display   = 'block';
        suggestPanel.style.display = 'none';
    } else {
        filesPanel.style.display   = 'none';
        suggestPanel.style.display = 'block';
        if (joinCta)      joinCta.style.display      = 'block';
        if (sugNameBlock) sugNameBlock.style.display = 'block';
    }
    if (addProjBtn) addProjBtn.style.display = isAdmin ? 'inline-flex' : 'none';
}

function statusColor(s) {
    if (s==='Завершён') return 'var(--teal)';
    if (s==='На паузе') return '#f59e0b';
    return 'var(--violet-light)';
}

function renderSubfolders(p) {
    const folders = [
        { key:'raw',  label:'📹 RAW-ка',  icon:'fa-film',              desc:'Исходная видео-дорожка',      color:'#ef4444' },
        { key:'hard', label:'📝 Hardsubs', icon:'fa-closed-captioning', desc:'Видео с вшитыми субтитрами', color:'#f59e0b' },
        { key:'soft', label:'🗒 Softsubs', icon:'fa-file-alt',          desc:'Файлы субтитров (.ass)',      color:'var(--violet-light)' },
    ];
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${folders.map(f=>{const link=p[f.key]; return `<div class="dubin-subfolder">
            <div class="dubin-subfolder-title" style="color:${f.color};"><i class="fas ${f.icon}"></i> ${f.label}</div>
            <p style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">${f.desc}</p>
            ${link?`<a href="${esc(link)}" target="_blank" class="btn btn-sm" style="background:${f.color};text-decoration:none;display:inline-flex;align-items:center;gap:5px;"><i class="fas fa-external-link-alt"></i> Открыть в Drive</a>`:`<span style="font-size:11px;color:var(--text-dim);">Папка не настроена</span>`}
        </div>`;}).join('')}
    </div>`;
}

function renderVoiceFiles(files, projId, isAdmin) {
    return `<div style="margin-top:14px;">
        <p style="font-size:11px;font-weight:800;color:var(--teal);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"><i class="fas fa-microphone-alt"></i> Загруженная озвучка</p>
        ${files.map((f,i)=>`<div class="dubin-file-row">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <i class="fas fa-${f.format==='flac'?'music':'volume-up'}" style="color:var(--violet-light);font-size:16px;flex-shrink:0;"></i>
                <div style="min-width:0;">
                    <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.name)}</div>
                    <div style="font-size:10px;color:var(--text-dim);">${f.format?.toUpperCase()} • ${esc(f.author)} • ${new Date(f.date).toLocaleDateString()}</div>
                    ${f.comment?`<div style="font-size:10px;color:var(--text-dim);font-style:italic;">${esc(f.comment)}</div>`:''}
                </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <a href="${esc(f.link)}" target="_blank" class="btn btn-sm btn-purple" style="text-decoration:none;"><i class="fas fa-download"></i></a>
                ${isAdmin?`<button class="btn-sm" style="background:#ef4444;" onclick="deleteVoiceFile('${projId}',${i})"><i class="fas fa-trash"></i></button>`:''}
            </div>
        </div>`).join('')}
    </div>`;
}

async function renderProjects(db, isAdmin) {
    const snap = await getDocs(query(collection(db,'dubinProjects'), orderBy('createdAt','desc')));
    const projects = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    document.getElementById('dubin-projects-list').innerHTML = projects.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text-dim);"><i class="fas fa-folder-open" style="font-size:2.5rem;margin-bottom:14px;display:block;opacity:0.25;color:var(--violet);"></i><p style="font-style:italic;">Проектов пока нет</p></div>`
        : projects.map(p=>`
        <div class="dubin-project-item">
            <div class="dubin-folder">
            <div class="dubin-folder-header" onclick="toggleDubinFolder('${p.id}')">
                ${p.img
                    ? `<img src="${esc(p.img)}" class="dubin-folder-cover" onerror="this.style.display='none'" alt="">`
                    : `<div class="dubin-folder-icon"><i class="fas fa-folder"></i></div>`}
                <div class="dubin-folder-inner">
                <div style="flex:1;">
                    <div style="font-weight:800;font-size:15px;">${esc(p.name)}</div>
                    <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">
                        <span class="tag" style="background:${statusColor(p.status)};">${esc(p.status||'В работе')}</span>
                        <span class="year-tag">${esc(p.genre)}</span>
                    </div>
                    ${p.notes?`<p style="font-size:12px;color:var(--text-dim);margin-top:5px;font-style:italic;">${esc(p.notes)}</p>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${isAdmin?`<button class="btn-sm" style="background:var(--violet);" onclick="event.stopPropagation();openDubinProjectModal('${p.id}')">Ред</button>
                    <button class="btn-sm" style="background:#ef4444;" onclick="event.stopPropagation();deleteDubinProject('${p.id}')">Удал</button>`:''}
                    <i class="fas fa-chevron-down" style="color:var(--text-dim);font-size:12px;"></i>
                </div>
            </div>
            <div class="dubin-folder-body" id="folder-${p.id}">
                ${renderSubfolders(p)}
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
                    <button class="btn btn-purple btn-sm" onclick="openUploadVoice('${p.id}')"><i class="fas fa-upload"></i> Загрузить озвучку</button>
                    ${p.voiceFiles&&p.voiceFiles.length>0?renderVoiceFiles(p.voiceFiles,p.id,isAdmin):'<p style="font-size:12px;color:var(--text-dim);margin-top:10px;font-style:italic;">Озвучка ещё не загружена</p>'}
                </div>
            </div>
            </div>
        </div>`).join('');
}

export function bindDubin(db, auth, getState) {
    window.updateDubinImgPreview = (url) => {
        const preview = document.getElementById('dp-img-preview');
        const img     = document.getElementById('dp-img-preview-img');
        if (!preview || !img) return;
        if (url && url.startsWith('http')) {
            img.src = url;
            img.onload  = () => { preview.style.display = 'block'; };
            img.onerror = () => { preview.style.display = 'none'; };
        } else {
            preview.style.display = 'none';
        }
    };

    window.toggleDubinFolder = (id) => {
        const b = document.getElementById('folder-'+id);
        if (b) b.classList.toggle('open');
    };

    window.renderDubinProjects = async () => {
        const { isAdmin } = getState();
        await renderProjects(db, isAdmin);
    };

    window.openDubinProjectModal = async (id='') => {
        document.getElementById('dubin-proj-id').value = id;
        const fields = ['name','genre','status','raw','hard','soft','voice','img','notes'];
        if (id) {
            const snap = await getDoc(doc(db,'dubinProjects',id));
            if (snap.exists()) { const p=snap.data(); fields.forEach(f=>document.getElementById('dp-'+f).value=p[f]||''); }
        } else { fields.forEach(f=>document.getElementById('dp-'+f).value=''); }
        document.getElementById('m-dubin-project').style.display = 'flex';
    };

    window.saveDubinProject = async () => {
        const { isAdmin } = getState();
        const id = document.getElementById('dubin-proj-id').value;
        const data = {
            name:   document.getElementById('dp-name').value,
            genre:  document.getElementById('dp-genre').value,
            status: document.getElementById('dp-status').value,
            raw:    document.getElementById('dp-raw').value,
            hard:   document.getElementById('dp-hard').value,
            soft:   document.getElementById('dp-soft').value,
            voice:  document.getElementById('dp-voice').value,
            img:    document.getElementById('dp-img').value,
            notes:  document.getElementById('dp-notes').value,
        };
        if (!data.name) return showToast('Введите название!','error');
        if (!id) { data.createdAt=Date.now(); await addDoc(collection(db,'dubinProjects'),data); }
        else await updateDoc(doc(db,'dubinProjects',id),data);
        closeModals(); await renderProjects(db, isAdmin); showToast('Проект сохранён!');
    };

    window.deleteDubinProject = async (id) => {
        if (!confirm('Удалить проект?')) return;
        const { isAdmin } = getState();
        await deleteDoc(doc(db,'dubinProjects',id));
        await renderProjects(db, isAdmin); showToast('Проект удалён');
    };

    window.openUploadVoice = (projId) => {
        document.getElementById('uv-proj-id').value = projId;
        ['uv-name','uv-link','uv-comment'].forEach(id=>document.getElementById(id).value='');
        document.getElementById('m-upload-voice').style.display = 'flex';
    };

    window.submitVoiceFile = async () => {
        const { userData, isAdmin } = getState();
        const projId  = document.getElementById('uv-proj-id').value;
        const name    = document.getElementById('uv-name').value.trim();
        const link    = document.getElementById('uv-link').value.trim();
        const format  = document.getElementById('uv-format').value;
        const comment = document.getElementById('uv-comment').value.trim();
        if (!link) return showToast('Введите ссылку!','error');
        const snap = await getDoc(doc(db,'dubinProjects',projId));
        if (!snap.exists()) return showToast('Проект не найден!','error');
        const voiceFiles = snap.data().voiceFiles||[];
        voiceFiles.push({ name: name||link.split('/').pop()||'Без названия', link, format, comment, author: userData?.nickname||'Аноним', authorUid: auth.currentUser?.uid||'', date: Date.now() });
        await updateDoc(doc(db,'dubinProjects',projId),{ voiceFiles });
        closeModals(); await renderProjects(db, isAdmin); showToast('Файл добавлен!','success');
    };

    window.deleteVoiceFile = async (projId, idx) => {
        if (!confirm('Удалить файл?')) return;
        const { isAdmin } = getState();
        const snap = await getDoc(doc(db,'dubinProjects',projId));
        const voiceFiles = snap.data().voiceFiles||[];
        voiceFiles.splice(idx,1);
        await updateDoc(doc(db,'dubinProjects',projId),{ voiceFiles });
        await renderProjects(db, isAdmin); showToast('Файл удалён');
    };

    window.sendSuggestion = async () => {
        const { userData } = getState();
        const title  = document.getElementById('sug-title').value.trim();
        const type   = document.getElementById('sug-type').value;
        const link   = document.getElementById('sug-link').value.trim();
        const reason = document.getElementById('sug-reason').value.trim();
        if (!title||!type||!reason) return showToast('Заполните обязательные поля!','error');
        const senderName  = userData?.nickname || document.getElementById('sug-name')?.value?.trim() || 'Аноним';
        const senderEmail = userData?.email    || document.getElementById('sug-email')?.value?.trim() || '';
        await addDoc(collection(db,'suggestions'),{ title,type,link,reason,senderName,senderEmail, uid:auth.currentUser?.uid||null, date:Date.now(), status:'new' });
        try {
            if (window.emailjs) await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateSuggest,
                { to_email:'voiceactingteam@gmail.com', from_name:senderName, from_email:senderEmail||'нет', title, media_type:type, link:link||'не указана', reason, date:new Date().toLocaleString('ru') }, EMAILJS_CONFIG.publicKey);
        } catch(e) { console.warn('EmailJS:',e); }
        showToast('Предложение отправлено! Спасибо 🎉','success');
        ['sug-title','sug-link','sug-reason'].forEach(id=>document.getElementById(id).value='');
        document.getElementById('sug-type').value='';
        await checkAndAwardAch(db, auth, userData, 'suggest_1');
    };
}
