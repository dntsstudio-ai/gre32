#!/usr/bin/env node
// ============================================================
//  scripts/prerender.mjs
//  Генерирует настоящие статические HTML-файлы для каждого
//  релиза (/view/{id}/index.html) и участника команды
//  (/team-page/{id}/index.html), чтобы боты-парсеры, которые
//  НЕ выполняют JavaScript, видели реальный контент.
//
//  Как это работает:
//  - Берём данные напрямую из Firestore через публичный REST API
//    (без ключей — коллекции releases/team читаются анонимно,
//    это разрешено вашими правилами безопасности).
//  - Для каждого документа берём index.html как основу и
//    вставляем в нужный <div> реальный текст + мета-теги + JSON-LD.
//  - Обычным пользователям и Google это не мешает: как только
//    загрузится ваш js/app.js, он проверит адрес и подгрузит
//    актуальные данные поверх (полная интерактивность сохраняется).
//
//  Запуск: node scripts/prerender.mjs
//  (используется в .github/workflows/prerender.yml автоматически)
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const PROJECT_ID = 'voice-acting-team'; // ⚠️ если поменяете Firebase-проект — поправьте здесь
const BASE_URL   = 'https://voiceactingteam-dub.ru';

function unwrap(value) {
    if (value == null) return null;
    if ('stringValue' in value)  return value.stringValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value)  return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value)    return null;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value)   return (value.arrayValue.values || []).map(unwrap);
    if ('mapValue' in value)     return unwrapFields(value.mapValue.fields || {});
    return null;
}
function unwrapFields(fields) {
    const out = {};
    for (const key in fields) out[key] = unwrap(fields[key]);
    return out;
}

async function fetchCollection(name) {
    const docs = [];
    let pageToken = '';
    do {
        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Не удалось получить коллекцию "${name}":`, res.status, await res.text());
            return docs;
        }
        const data = await res.json();
        for (const d of (data.documents || [])) {
            const id = d.name.split('/').pop();
            docs.push({ id, ...unwrapFields(d.fields || {}) });
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);
    return docs;
}

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function buildPage(template, { title, description, image, jsonLd, targetDivId, contentHtml, sectionId }) {
    let html = template;
    const fullTitle = `${title} — Voice Acting Team`;
    const desc = (description || '').slice(0, 200);

    html = html.replace(/<title>.*?<\/title>/s, `<title>${escHtml(fullTitle)}</title>`);

    const metaTags = `
    <meta name="description" content="${escHtml(desc)}">
    <meta property="og:title" content="${escHtml(fullTitle)}">
    <meta property="og:description" content="${escHtml(desc)}">
    ${image ? `<meta property="og:image" content="${escHtml(image)}">` : ''}
    <meta property="og:type" content="website">
    ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
    `;
    html = html.replace('</head>', metaTags + '\n</head>');

    html = html.replace(
        new RegExp(`(<section id="${sectionId}" class="section)(")`),
        `$1 active$2`
    );

    html = html.replace(
        new RegExp(`(<div id="${targetDivId}"[^>]*>)(</div>)`),
        `$1${contentHtml}$2`
    );

    return html;
}

async function main() {
    const template = await fs.readFile(path.join(ROOT, 'index.html'), 'utf-8');

    // Чистим старые сгенерированные страницы — иначе удалённые релизы/участники
    // будут годами висеть заброшенными статическими страницами
    await fs.rm(path.join(ROOT, 'view'), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, 'team-page'), { recursive: true, force: true });

    console.log('Загружаю релизы и команду из Firestore...');
    const [releases, team] = await Promise.all([
        fetchCollection('releases'),
        fetchCollection('team'),
    ]);
    console.log(`Найдено: ${releases.length} релизов, ${team.length} участников.`);

    for (const r of releases) {
        const contentHtml = `
            <article>
                <h1 style="font-family:var(--font-display);font-size:1.8rem;margin-bottom:10px;">${escHtml(r.title || '')}</h1>
                <p style="color:var(--text-dim);margin-bottom:14px;">${escHtml(r.genre || '')} ${r.year ? '· ' + escHtml(r.year) : ''}</p>
                ${r.img ? `<img src="${escHtml(r.img)}" alt="${escHtml(r.title || '')}" style="max-width:280px;border-radius:12px;margin-bottom:16px;">` : ''}
                <p style="line-height:1.6;">${escHtml(r.desc || '')}</p>
                ${r.voiceover ? `<p style="margin-top:14px;"><b>Озвучка:</b> ${escHtml(r.voiceover)}</p>` : ''}
                ${r.authors ? `<p><b>Автор(ы) перевода/озвучки:</b> ${escHtml(r.authors)}</p>` : ''}
            </article>`;

        const html = buildPage(template, {
            title: r.title || 'Релиз',
            description: r.desc,
            image: r.img,
            targetDivId: 'v-info',
            sectionId: 'view',
            contentHtml,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': r.type === 'film' ? 'Movie' : 'TVSeries',
                name: r.title,
                description: r.desc,
                image: r.img || undefined,
                genre: r.genre || undefined,
                datePublished: r.year ? String(r.year) : undefined,
            },
        });

        const dir = path.join(ROOT, 'view', r.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');
    }

    for (const m of team) {
        const contentHtml = `
            <article>
                <h1 style="font-family:var(--font-display);font-size:1.8rem;margin-bottom:6px;">${escHtml(m.name || '')}</h1>
                <p style="color:var(--accent);font-weight:700;margin-bottom:14px;">${escHtml(m.role || '')}</p>
                ${m.img ? `<img src="${escHtml(m.img)}" alt="${escHtml(m.name || '')}" style="width:160px;height:160px;object-fit:cover;border-radius:50%;margin-bottom:16px;">` : ''}
                ${m.bio ? `<p style="line-height:1.6;">${escHtml(m.bio)}</p>` : ''}
            </article>`;

        const html = buildPage(template, {
            title: `${m.name || 'Участник'} — ${m.role || 'Команда'}`,
            description: `${m.name || ''} — ${m.role || ''} в команде Voice Acting Team.`,
            image: m.img,
            targetDivId: 'team-page-view',
            sectionId: 'team-page',
            contentHtml,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'Person',
                name: m.name,
                jobTitle: m.role,
                image: m.img || undefined,
            },
        });

        const dir = path.join(ROOT, 'team-page', m.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');
    }

    const urls = [
        { loc: `${BASE_URL}/`, priority: '1.0' },
        { loc: `${BASE_URL}/home`, priority: '0.9' },
        { loc: `${BASE_URL}/team`, priority: '0.7' },
        { loc: `${BASE_URL}/order`, priority: '0.6' },
        ...releases.map(r => ({ loc: `${BASE_URL}/view/${r.id}`, priority: '0.8' })),
        ...team.map(m => ({ loc: `${BASE_URL}/team-page/${m.id}`, priority: '0.5' })),
    ];
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
        `\n</urlset>\n`;
    await fs.writeFile(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf-8');

    console.log('Готово! Статические страницы и sitemap.xml обновлены.');
}

main().catch((e) => { console.error(e); process.exit(1); });
