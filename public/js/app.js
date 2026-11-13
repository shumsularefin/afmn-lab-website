// Shared site behaviour. Content comes from js/content.js (defaults), js/published.js (what the Lab
// Dashboard published, baked in at deploy) and, when something newer was published since, Firestore.
// Each page has empty containers ([data-render], [data-field]) that are filled from that content.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const { esc, inline, paras, lines, stripTags: strip } = LAB;

const NAV_ALL = [['index.html', 'Home'], ['research.html', 'Research'], ['publications.html', 'Publications'], ['team.html', 'Group'], ['profile.html', 'Principal Investigator'], ['teaching.html', 'Teaching'], ['news.html', 'News'], ['opportunities.html', 'Join us'], ['gallery.html', 'Gallery'], ['contact.html', 'Contact']];
const route = location.pathname.split('/').filter(Boolean).pop() || 'index';
const page = route.endsWith('.html') ? route : `${route}.html`;
const today = new Date().toISOString().slice(0, 10);

// ---------- Content: defaults → published at deploy → live → (optional) dashboard preview ----------
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview') ? (() => { try { return JSON.parse(localStorage.getItem('afmn-preview') || '{}'); } catch { return {}; } })() : null;
let published = PUBLISHED.content || {};
let C = LAB.resolve({ ...published, ...(PREVIEW || {}) });

// Firestore, read through its public REST API (no SDK, no keys).
const EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? (() => { try { return localStorage.getItem('afmn-emulator') || ''; } catch { return ''; } })() : '';
const [FS_ORIGIN, FS_PROJECT] = EMULATOR ? EMULATOR.split('|') : ['https://firestore.googleapis.com', PUBLISHED.project || 'afmn-lab'];
const FS_BASE = `${FS_ORIGIN}/v1/projects/${FS_PROJECT}/databases/(default)/documents`;
function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue) return decodeFields(v.mapValue.fields);
  return null;
}
const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
async function fsGet(path) {
  const r = await fetch(`${FS_BASE}/${path}`, { cache: 'no-store' });
  if (!r.ok) throw Error(`Firestore ${r.status}`);
  return r.json();
}
const LIVE_KEY = 'afmn-live-v1';
/** Content published after this copy of the site was built, or null. At most one small read per 5 minutes. */
async function liveContent() {
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); } catch { /* private window */ }
  const save = (v) => { try { localStorage.setItem(LIVE_KEY, JSON.stringify(v)); } catch { /* full or blocked */ } };
  const fresh = cache && cache.project === FS_PROJECT && Date.now() - cache.checkedAt < 5 * 60 * 1000;
  if (fresh) return cache.revision > PUBLISHED.revision ? cache.content : null;
  const meta = await fsGet('site/meta').catch(() => null);
  const revision = meta?.fields?.revision ? Number(decodeValue(meta.fields.revision)) : 0;
  if (revision <= PUBLISHED.revision) { save({ project: FS_PROJECT, checkedAt: Date.now(), revision, content: null }); return null; }
  if (cache?.project === FS_PROJECT && cache.revision === revision && cache.content) { save({ ...cache, checkedAt: Date.now() }); return cache.content; }
  const list = await fsGet('content?pageSize=100');
  const content = Object.fromEntries((list.documents || []).map((d) => [d.name.split('/').pop(), decodeFields(d.fields).data]).filter(([, v]) => v));
  save({ project: FS_PROJECT, checkedAt: Date.now(), revision, content });
  return content;
}

// Uploaded images (media:<id>) are baked to media/<id>.jpg at deploy; newer ones are read from Firestore.
const mediaCache = new Map();
function imgSrc(ref) { return ref && ref.startsWith('media:') ? PUBLISHED.media?.[ref] || '' : ref || ''; }
function img(ref, attrs = '') {
  if (!ref) return '';
  const src = imgSrc(ref);
  return src ? `<img src="${esc(src)}" ${attrs}>` : `<img data-media="${esc(ref)}" ${attrs}>`;
}
function loadMedia() {
  for (const el of $$('img[data-media]')) {
    const ref = el.dataset.media;
    el.removeAttribute('data-media');
    if (!/^media:[a-f0-9-]{36}$/.test(ref)) continue;
    if (!mediaCache.has(ref)) mediaCache.set(ref, fsGet(`siteImages/${ref.slice(6)}`).then((d) => decodeValue(d.fields.image)));
    mediaCache.get(ref).then((src) => { if (/^data:image\/(jpeg|png|webp);base64,/.test(src)) el.src = src; }).catch(() => { el.alt += ' (image unavailable)'; });
  }
}

// Uploaded documents (file:<id>, e.g. the CV) are baked to files/<id>.pdf at deploy; newer ones are
// assembled from their Firestore chunks when the link is clicked.
const cvRef = () => C.pi.cv ?? C.site.cvUrl ?? '';
function docHref(ref) {
  if (!ref) return '';
  if (!ref.startsWith('file:')) return ref;
  return PUBLISHED.files?.[ref] || `#${ref}`;
}
async function openLiveDocument(ref) {
  const win = window.open('', '_blank');
  try {
    const info = decodeFields((await fsGet(`siteFiles/${ref.slice(5)}`)).fields);
    const parts = await Promise.all([...Array(info.chunks).keys()].map((i) => fsGet(`siteFiles/${ref.slice(5)}/chunks/${i}`).then((d) => decodeValue(d.fields.data))));
    const bin = atob(parts.join('')), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (win) win.location = url; else location.href = url;
  } catch {
    win?.close();
    alert('The document could not be loaded. Please try again later.');
  }
}

// ---------- Small helpers ----------
const mailto = (e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`;
const tel = (n) => `<a href="tel:${esc(n.replace(/[^+\d]/g, ''))}">${esc(n)}</a>`;
const extLink = (l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`;
const hasText = (v) => String(v ?? '').trim() !== '';
const isLive = (item) => (!item.start || item.start <= today) && (!item.until || item.until >= today) && item.active !== false;
const dateLabel = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : esc(iso || ''));
const linksOf = () => (C.site.links || []).filter((l) => l.url);
const openPositions = () => (C.openings.positions || []).filter((p) => p.status !== 'closed' && (!p.deadline || p.deadline >= today));
function nav() { return NAV_ALL.filter(([h]) => h !== 'gallery.html' || (C.gallery.photos || []).length || page === 'gallery.html'); }

// Research figures: the shipped graphical abstracts have small/medium/large files.
function areaFigure(a) {
  if (!a.image) return '';
  const m = /^images\/ga\/(.+)-md\.jpg$/.exec(a.image);
  const alt = esc(a.imageAlt || strip(a.caption || a.title));
  const cap = a.caption ? `<figcaption>${inline(a.caption)}</figcaption>` : '';
  if (m) {
    const b = `images/ga/${m[1]}`;
    return `<figure><a href="${b}-lg.jpg" target="_blank" rel="noopener" title="Open full-resolution image"><img src="${b}-md.jpg" srcset="${b}-sm.jpg 640w, ${b}-md.jpg 1100w, ${b}-lg.jpg 1600w" sizes="(max-width: 1000px) calc(100vw - 32px), 860px" decoding="async" alt="${alt}" loading="lazy"></a>${cap}</figure>`;
  }
  return `<figure>${img(a.image, `${a.natural ? 'class="natural" ' : ''}decoding="async" alt="${alt}" loading="lazy"`)}${cap}</figure>`;
}
const thumb = (a) => {
  const m = /^images\/ga\/(.+)-md\.jpg$/.exec(a.image || '');
  return m ? `<img src="images/ga/${m[1]}-sm.jpg" alt="" loading="lazy" decoding="async">` : img(a.image, 'alt="" loading="lazy" decoding="async"');
};

// ---------- Header & footer ----------

function renderChrome() {
  const S = C.site;
  const mark = `<a class="mark" href="index.html" aria-label="${esc(S.name)}, Principal Investigator ${esc(S.piName)}, home"><img class="logo" src="images/brand/afmn-logo.svg" alt="" width="196" height="53"><span class="wm"><span class="wm-pi">Principal Investigator<b>${esc(S.piName)}</b></span></span></a>`;
  const NAV = nav(), half = Math.ceil(NAV.length / 2);
  const navLinks = NAV.map(([h, t]) => `<a href="${h}"${h === page ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const parts = {
    notices: `<div id="site-notices">${notices()}</div>`,
    header: `<header class="site-header" id="site-header"><div class="wrap">
  ${mark}
  <div class="hdr-right"><button class="menu-btn" aria-expanded="false" aria-controls="menu"><span class="sr">Menu</span><i></i></button><span class="org">${esc(S.orgShort)}</span></div>
</div></header>`,
    menu: `<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Site menu">
  <div class="wrap menu-top">${mark}<button class="menu-close" aria-label="Close menu"></button></div>
  <div class="wrap" style="flex:1;display:flex;flex-direction:column"><div class="menu-panel">
    <nav class="nav" id="nav" aria-label="Main"><span class="nav-indicator" aria-hidden="true"></span>${navLinks}</nav>
    <div class="menu-aside">
      <span class="label">Profiles</span>
      <ul>${linksOf().map((l) => `<li>${extLink(l)}</li>`).join('')}${S.email ? `<li>${mailto(S.email)}</li>` : ''}</ul>
      <span class="label">Department</span>
      <p><b>${esc(S.piTitle.split(',')[0])}</b>, ${esc(S.department)}, ${esc(S.university)}</p>
    </div>
  </div></div>
</div>`,
    band: `<section class="band" id="site-band"><div class="wrap"><a class="btn" href="contact.html">${esc(S.contactButton || 'Get in touch with the lab')}</a></div></section>`,
    footer: `<footer class="site-footer" id="site-footer"><div class="wrap">
  <div class="top">
    <div><div class="name"><img class="logo" src="images/brand/afmn-logo-light.svg" alt="${esc(S.name)}" width="222" height="60"><small>${esc(S.fullName)}</small></div>
      <p>Principal Investigator: <a href="profile.html"><b>${esc(S.piName)}</b></a><br>${esc(S.piTitle)}<br><br>${lines(S.address).map(esc).join('<br>')}</p></div>
    <div><h4>Site</h4><ul>${NAV.slice(0, half).map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
    <div><h4>&nbsp;</h4><ul>${NAV.slice(half).map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
    <div><h4>Profiles</h4><ul>${linksOf().map((l) => `<li>${extLink(l)}</li>`).join('')}${S.email ? `<li><a href="mailto:${esc(S.email)}">Email</a></li>` : ''}</ul></div>
  </div>
  <div class="base"><span>© ${new Date().getFullYear()} ${esc(S.name)}, ${esc(S.university)}. Principal Investigator: ${esc(S.piName)}.</span><span>Citation data: Google Scholar, ${scholarValue('updated')} · <a href="admin.html">Lab dashboard</a></span></div>
</div></footer>`,
  };
  if (!renderChrome.done) {
    renderChrome.done = true;
    $('#site-header').outerHTML = parts.notices + parts.header + parts.menu;
    $('#site-footer').outerHTML = parts.band + parts.footer + '<div class="toast" role="status"></div><button class="to-top" type="button" aria-label="Back to top"></button>';
    if (PREVIEW) document.body.insertAdjacentHTML('afterbegin', `<div class="preview-bar" role="status">Preview of unpublished dashboard changes. Visitors do not see this yet. <a href="${esc(location.pathname)}">Close preview</a></div>`);
  } else {
    for (const id of ['notices', 'header', 'menu', 'band', 'footer']) $(`#${id === 'notices' ? 'site-notices' : id === 'menu' ? 'menu' : 'site-' + id}`).outerHTML = parts[id];
    onScroll();
  }
}

function notices() {
  let dismissed = [];
  try { dismissed = JSON.parse(sessionStorage.getItem('afmn-notices') || '[]'); } catch { /* ignore */ }
  return (C.notices.items || []).filter((n) => hasText(n.text) && isLive(n) && (!n.homeOnly || page === 'index.html'))
    .filter((n) => !dismissed.includes(strip(n.text).slice(0, 80)))
    .map((n) => `<div class="notice-bar${n.tone === 'important' ? ' important' : ''}"><div class="wrap"><p>${inline(n.text)}${n.link ? ` <a href="${esc(n.link)}">${esc(n.linkLabel || 'Read more')}</a>` : ''}</p><button type="button" class="notice-close" aria-label="Dismiss notice" data-notice="${esc(strip(n.text).slice(0, 80))}">×</button></div></div>`).join('');
}

// ---------- Google Scholar metrics (js/scholar.js, refreshed on the 1st and 15th by .github/workflows/scholar-update.yml) ----------
function scholarValue(key) {
  if (typeof SCHOLAR === 'undefined') return '';
  if (key === 'updated') return new Date(SCHOLAR.updated + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return key === 'sinceYear' ? String(SCHOLAR[key]) : SCHOLAR[key].toLocaleString('en-US');
}

function toast(msg) {
  const t = $('.toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- Citations: BibTeX / APA ----------
function splitVenue(venue) {
  const v = strip(venue), m = v.match(/^(.*?)[ ,]+(\d.*)$/);
  return m ? [m[1], m[2]] : [v, ''];
}
const authorsOf = (s) => s.split(',').map((a) => a.trim()).filter((a) => a && !/^et al/.test(a));
function apaAuthor(a) {
  const parts = a.split(/\s+/), last = parts.pop();
  const initials = parts.join(' ').replace(/([A-Z])[a-z]*\.?/g, '$1.').replace(/\.(?=[A-Z])/g, '. ');
  return initials ? `${last}, ${initials}` : last;
}
function bibtex({ year, type, title, authors, venue, url }) {
  const [name, details] = splitVenue(venue), au = authorsOf(authors);
  const key = (au[0] || 'anon').split(/\s+/).pop().toLowerCase().replace(/\W/g, '') + year + strip(title).split(/\s+/)[0].toLowerCase().replace(/\W/g, '');
  const kind = { c: 'incollection', a: 'inproceedings' }[type] || 'article';
  const f = [['title', `{${strip(title)}}`], ['author', au.join(' and ')], [type === 'c' || type === 'a' ? 'booktitle' : 'journal', name], ['year', year]];
  if (details) f.push(['note', details]);
  if (url && url.includes('doi.org/')) f.push(['doi', url.split('doi.org/')[1]]);
  return `@${kind}{${key},\n${f.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
}
function apa({ year, title, authors, venue, url }) {
  const au = authorsOf(authors).map(apaAuthor), etal = /et al/.test(authors);
  const list = au.length === 1 ? au[0] : au.slice(0, -1).join(', ') + (etal ? ', … ' : ', & ') + au[au.length - 1];
  const [name, details] = splitVenue(venue);
  return `${list} (${year}). ${strip(title)}. ${name}${details ? ', ' + details : ''}.${url ? ' ' + url : ''}`;
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  const old = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('done');
  setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400);
  toast('Citation copied to clipboard');
}

const TYPE = { j: 'Article', r: 'Review', c: 'Chapter', a: 'Abstract' };
const pubs = () => C.publications.items || [];
function pubItem(p, withYear = false) {
  const i = pubs().indexOf(p);
  const { year, type, cites, title, authors, venue, url } = p;
  const scholar = 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + strip(title) + '"');
  return `<li class="p"><div>
    <span class="t"><a href="${esc(url || scholar)}" target="_blank" rel="noopener">${inline(title)}</a></span>
    <span class="au">${esc(authors).replace(/(Md?\. Kamruzzaman)/g, '<b>$1</b>')}</span>
    <span class="v"><em>${inline(venue)}</em>${withYear ? ` · ${esc(year)}` : ''}</span>
    <span class="tools"><span>${TYPE[type] || 'Article'}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${url.includes('doi.org') ? 'DOI' : 'Link'}</a>` : ''}<a href="${scholar}" target="_blank" rel="noopener">Scholar</a><button type="button" data-cite="bib" data-i="${i}">BibTeX</button><button type="button" data-cite="apa" data-i="${i}">APA</button></span>
  </div>${cites ? `<div class="c">${cites}<small>citations</small></div>` : '<div></div>'}</li>`;
}

// ---------- Section renderers ----------
const initials = (n) => n.replace(/^(Md|M|S)\.\s*/g, '').split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
const rows = (list) => `<table class="data">${list.map((r) => `<tr><td>${esc(r.period || r.category || '')}</td><td><b>${inline(r.title || r.name || '')}</b>${hasText(r.detail) ? `<span class="sub">${inline(r.detail)}</span>` : ''}</td></tr>`).join('')}</table>`;
const plainList = (text) => `<ul class="plain-list">${lines(text).map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`;
const positions = (list) => `<ul class="roles" aria-label="Current positions">${list.map((p) => `<li${p.highlight ? ' class="chair"' : ''}><b>${esc(p.title)}</b><span>${inline(p.place)}</span></li>`).join('')}</ul>`;
const awards = (list, style = '') => `<ul class="awards">${list.map((a) => `<li${style ? ` class="${esc(style)}"` : ''}><time>${esc(a.period)}</time><div><b>${inline(a.title)}</b><span>${inline(a.detail)}</span></div></li>`).join('')}</ul>`;
const piPhoto = (attrs) => {
  const p = C.pi.photo;
  if (p === 'images/portrait.jpg') return `<img src="images/portrait.jpg" srcset="images/portrait-400.jpg 400w, images/portrait.jpg 638w" ${attrs}>`;
  return img(p, attrs);
};
const personCard = (m) => {
  const links = (m.links || []).filter((l) => l.url).map(extLink);
  if (m.email) links.unshift(`<a href="mailto:${esc(m.email)}">Email</a>`);
  if (m.website) links.unshift(`<a href="${esc(m.website)}" target="_blank" rel="noopener">Website</a>`);
  return `<div class="person"><div class="ph">${m.photo ? img(m.photo, `alt="${esc(m.name)}" loading="lazy"`) : esc(initials(m.name))}</div>
    <b>${m.website ? `<a href="${esc(m.website)}" target="_blank" rel="noopener">${esc(m.name)}</a>` : esc(m.name)}</b><span>${esc(m.position || '')}</span>${hasText(m.topic) ? `<span>${inline(m.topic)}</span>` : ''}${hasText(m.period) ? `<span>${esc(m.period)}</span>` : ''}${hasText(m.now) ? `<span>Now: ${inline(m.now)}</span>` : ''}${links.length ? `<div class="lk">${links.join(' · ')}</div>` : ''}</div>`;
};
const positionCard = (p) => {
  const apply = p.form ? `form/${encodeURIComponent(p.form)}` : hasText(p.apply) ? (p.apply.includes('@') && !/^https?:/.test(p.apply) ? `mailto:${p.apply}` : p.apply) : `mailto:${C.site.email}`;
  return `<article class="opening"><div class="opening-meta"><span class="tag">${esc(p.kind || 'Position')}</span>${p.deadline ? `<span>Apply by ${dateLabel(p.deadline)}</span>` : '<span>Open until filled</span>'}</div>
    <h3>${inline(p.title)}</h3>${paras(p.summary)}${hasText(p.requirements) ? `<h4>Requirements</h4>${plainList(p.requirements)}` : ''}
    <p><a class="btn" href="${esc(apply)}"${/^https?:/.test(apply) ? ' target="_blank" rel="noopener"' : ''}>Apply</a></p></article>`;
};

const RENDER = {
  'home-hero'(el) {
    const H = C.home, defaultHero = H.heroImage === 'images/Homepagemain.jpg';
    el.innerHTML = `<div>
    <div class="label">${esc(H.heroLabel)}</div>
    <h1>${esc(H.heroTitle)}</h1>
    <div class="stand">${paras(H.heroText) || ''}</div>
    <div class="links"><a href="research.html">Our research</a><a href="publications.html">Publications</a><a href="team.html">Group</a><a href="contact.html">Contact</a></div>
    <a class="pi-badge" href="#principal-investigator">${C.pi.photo === 'images/portrait.jpg' ? '<img src="images/portrait-400.jpg" alt="" width="400" height="399" decoding="async">' : img(C.pi.photo, 'alt="" decoding="async"')}
      <span><small>Principal Investigator</small><b>${esc(C.pi.name)}</b><span>${esc(C.site.piTitle)}, ${esc(C.site.orgShort.split('·').pop().trim())}</span></span></a>
  </div>
  <figure class="portrait hero-figure">${defaultHero ? `<picture><source srcset="images/Homepagemain.avif" type="image/avif"><img src="images/Homepagemain.jpg" alt="${esc(H.heroImageAlt)}" width="557" height="740" fetchpriority="high"></picture>` : img(H.heroImage, `alt="${esc(H.heroImageAlt)}" fetchpriority="high"`)}
    <figcaption><span>${esc(H.heroCaption)}</span><span>${esc(H.heroCaption2)}</span></figcaption></figure>`;
  },
  'home-openings'(el) {
    const open = openPositions();
    el.hidden = !open.length;
    el.innerHTML = open.length ? `<div class="wrap"><span class="label">We are recruiting</span><p>${open.slice(0, 3).map((p) => `<b>${inline(p.title)}</b>${p.deadline ? ` (apply by ${dateLabel(p.deadline)})` : ''}`).join(' · ')}</p><a class="arrow" href="opportunities.html">Open positions</a></div>` : '';
  },
  'home-research'(el) {
    el.innerHTML = (C.research.areas || []).map((a, i) => `<a class="row" href="research.html#${esc(a.id || 'area-' + (i + 1))}"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${inline(a.shortTitle || a.title)}</h3><p>${inline(a.summary)}</p>${thumb(a)}</a>`).join('');
  },
  'home-pi'(el) {
    const P = C.pi;
    el.innerHTML = `<figure class="portrait">${piPhoto(`sizes="(max-width: 900px) 360px, 30vw" alt="Portrait of ${esc(P.name)}" loading="lazy" decoding="async"`)}
    <figcaption><span>${esc(P.photoCaption)}</span><span>${esc(P.photoCaption2)}</span></figcaption></figure>
  <div><div class="label">Principal Investigator</div><h2>${esc(P.name)}</h2>${positions(P.positions || [])}
    <p class="pi-bio">${inline(P.shortBio)}</p>
    <div class="links"><a href="profile.html">Full profile</a>${C.home.showChapters && (P.chapters || []).length ? '<a href="#student-chapters">Student chapters</a>' : ''}${cvRef() ? `<a href="${esc(docHref(cvRef()))}" target="_blank" rel="noopener">Curriculum vitae (PDF)</a>` : ''}${P.website ? `<a href="${esc(P.website)}" target="_blank" rel="noopener">Personal website</a>` : ''}${P.email ? mailto(P.email) : ''}</div></div>`;
  },
  'home-chapters'(el) {
    const P = C.pi;
    el.hidden = !C.home.showChapters || !(P.chapters || []).length;
    el.innerHTML = `<div class="chapters-head"><div class="label">Student chapters at GSTU</div><p>${inline(P.chaptersIntro)}</p></div>` +
      (P.chapters || []).map((c) => `<article class="chapter"><h3>${inline(c.title)}</h3>${paras(c.text)}${awards(c.awards || [], c.style)}${(c.links || []).length ? `<p class="chapter-links">${c.links.map((l) => `<a class="arrow" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' ')}</p>` : ''}</article>`).join('');
  },
  'home-pubs'(el) {
    const featured = pubs().filter((p) => p.featured);
    const list = (featured.length ? featured : pubs().filter((p) => p.type === 'j' && p.year >= new Date().getFullYear() - 1))
      .slice().sort((a, b) => b.year - a.year || b.cites - a.cites).slice(0, +C.home.pubCount || 5);
    el.innerHTML = list.map((p) => pubItem(p, true)).join('');
  },
  'news'(el) {
    const home = 'home' in el.dataset, limit = home ? +C.home.newsCount || 6 : 0, skip = home ? C.home.newsSkipTag : '';
    el.innerHTML = (C.news.items || []).filter((n) => !skip || n.tag !== skip).slice(0, limit || undefined)
      .map((n) => `<li><time>${esc(n.date)}</time>${inline(n.text)}${n.link ? ` <a class="arrow" href="${esc(n.link)}">More</a>` : ''}</li>`).join('') || '<li>No news yet.</li>';
  },
  'roster'(el) {
    el.innerHTML = (C.team.members || []).filter((m) => m.group === 'current').map((m) => `<div><b>${m.website ? `<a href="${esc(m.website)}" target="_blank" rel="noopener">${esc(m.name)}</a>` : esc(m.name)}</b><span>${inline(m.topic || m.position)}</span></div>`).join('');
  },
  'research-page'(el) {
    const R = C.research;
    const areaHTML = (R.areas || []).map((a, i) => `<section class="area"><h2 id="${esc(a.id || 'area-' + (i + 1))}"${i === 0 ? ' style="margin-top:48px"' : ''}>${inline(a.title)}</h2>${areaFigure(a)}${paras(a.body)}${lines(a.papers).length ? `<h3>Selected papers</h3><ul class="refs">${lines(a.papers).map((l) => `<li>${inline(l)}</li>`).join('')}</ul>` : ''}</section>`).join('');
    const I = C.instruments;
    const status = { maintenance: 'Under maintenance', coming: 'Coming soon', available: '' };
    el.innerHTML = `<p class="lede">${inline(R.lede)}</p>${areaHTML}
      ${lines(R.projects).length ? `<h2 id="projects">Current projects</h2>${plainList(R.projects)}` : ''}
      ${(R.funding || []).length ? `<h2 id="funding">Funding</h2>${rows(R.funding.map((f) => ({ period: f.period, title: f.title, detail: [f.agency, f.role].filter(Boolean).join(' · ') })))}` : ''}
      ${(R.collaborators || []).length ? `<h2 id="collaborators">Collaborators</h2><table class="data">${R.collaborators.map((c) => `<tr><td>${esc(c.country || '')}</td><td><b>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}</b><span class="sub">${inline(c.institution || '')}</span></td></tr>`).join('')}</table>` : ''}
      ${(I.items || []).length ? `<h2 id="instruments">Laboratory instruments</h2><p>${inline(I.intro)}</p><table class="data instruments">${I.items.map((it) => `<tr><td>${esc(it.category)}</td><td>${it.image ? img(it.image, `class="inst-img" alt="${esc(it.name)}" loading="lazy"`) : ''}<b>${inline(it.name)}</b>${status[it.status] ? ` <span class="status ${esc(it.status)}">${status[it.status]}</span>` : ''}${hasText(it.model) ? `<span class="sub">${esc(it.model)}</span>` : ''}${hasText(it.detail) ? `<span class="sub">${inline(it.detail)}</span>` : ''}</td></tr>`).join('')}</table>` : ''}`;
  },
  'profile-head'(el) {
    const P = C.pi;
    el.innerHTML = `<div><div class="crumb"><a href="index.html">Home</a> / Principal Investigator</div><h1>${esc(P.fullName)}</h1>${positions(P.positions || [])}<div class="role">${esc(P.fields)}</div></div>
      ${piPhoto(`sizes="(max-width: 860px) 260px, 320px" alt="${esc(P.name)}" fetchpriority="high"`)}`;
  },
  'profile-page'(el) {
    const P = C.pi;
    const out = [`<h2 id="biography" style="margin-top:0;border-top:0;padding-top:0">Biography</h2><p class="lede">${inline(P.lede)}</p>${paras(P.biography)}`];
    if (cvRef() || P.website) out.push(`<p class="btn-row">${cvRef() ? `<a class="btn" href="${esc(docHref(cvRef()))}" target="_blank" rel="noopener">Download curriculum vitae (PDF)</a>` : ''}${P.website ? ` <a class="btn" href="${esc(P.website)}" target="_blank" rel="noopener">Personal website</a>` : ''}</p>`);
    if ((P.appointments || []).length) out.push(`<h2 id="appointments">Appointments</h2>${rows(P.appointments)}`);
    if ((P.education || []).length) out.push(`<h2 id="education">Education</h2>${rows(P.education)}`);
    if (lines(P.interests).length) out.push(`<h2 id="interests">Research interests</h2>${plainList(P.interests)}`);
    if ((P.honours || []).length) out.push(`<h2 id="honours">Honours and awards</h2>${rows(P.honours)}`);
    out.push(`<h2 id="record">Research record</h2><table class="data">
      <tr><td>Citations</td><td><b data-scholar="citations"></b><span class="sub">Google Scholar, <span data-scholar="updated"></span> (<span data-scholar="citationsSince"></span> since <span data-scholar="sinceYear"></span>)</span></td></tr>
      <tr><td>h-index</td><td><b data-scholar="hIndex"></b></td></tr><tr><td>i10-index</td><td><b data-scholar="i10Index"></b></td></tr>
      <tr><td>Output</td><td><b><span data-count="papers"></span> articles, reviews and book chapters</b><span class="sub"><span data-count="abstracts"></span> ${inline(P.outputNote)}</span></td></tr></table>`);
    if (hasText(P.service)) out.push(`<h2 id="service">Teaching and service</h2>${paras(P.service)}${hasText(P.languages) ? `<p class="muted small">Languages: ${inline(P.languages)}</p>` : ''}`);
    if ((P.chapters || []).length) out.push(`<h2 id="acs" data-nav="Student chapters">Student chapters at GSTU</h2><p>${inline(P.chaptersIntro)}</p>` + P.chapters.map((c) => `<h3>${inline(c.title)}</h3>${paras(c.profileText || c.text)}${(c.links || []).length ? `<p>${c.links.map((l) => `<a class="arrow" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' &nbsp; ')}</p>` : ''}${awards(c.awards || [], c.style)}`).join(''));
    out.push('<h2 id="identifiers">Profiles and identifiers</h2><div class="ids" data-links></div>');
    el.innerHTML = out.join('');
  },
  'team-page'(el) {
    const P = C.pi, T = C.team, by = (g) => (T.members || []).filter((m) => m.group === g);
    el.innerHTML = `<h2 id="pi" style="margin-top:0">Principal Investigator</h2>
      <div class="pi-card">${C.pi.photo === 'images/portrait.jpg' ? `<img src="images/portrait-400.jpg" alt="${esc(P.name)}" width="400" height="399" loading="lazy" decoding="async">` : img(P.photo, `alt="${esc(P.name)}" loading="lazy"`)}
        <div><h3>${esc(P.name)}</h3><p class="pi-role"><b>${esc(C.site.piTitle.split(',')[0])}</b> · ${esc(C.site.department)}, ${esc(C.site.orgShort.split('·').pop().trim())}</p>${hasText(P.cardNote) ? `<p class="muted">${inline(P.cardNote)}</p>` : ''}
        <p>${inline(P.cardBio || P.shortBio)}</p><p><a class="arrow" href="profile.html">Full profile</a> &nbsp; ${P.website ? `<a href="${esc(P.website)}" target="_blank" rel="noopener">Personal website</a> &nbsp; ` : ''}${P.email ? mailto(P.email) : ''}</p></div></div>
      ${by('current').length ? `<h2 id="members">Research members</h2><div class="people">${by('current').map(personCard).join('')}</div>` : ''}
      ${by('collab').length ? `<h2 id="collaborators">Collaborators</h2><div class="people">${by('collab').map(personCard).join('')}</div>` : ''}
      ${by('alumni').length ? `<h2 id="alumni">Alumni</h2><div class="people">${by('alumni').map(personCard).join('')}</div>` : ''}
      <h2 id="join">Joining the group</h2>${paras(T.joinText)}${openPositions().length ? `<p><a class="arrow" href="opportunities.html">See open positions</a></p>` : ''}`;
  },
  'teaching-page'(el) {
    const T = C.teaching;
    el.innerHTML = `<p class="lede">${inline(T.lede)}</p><h2 id="courses-h">Courses</h2>${(T.courses || []).length
      ? `<table class="data">${T.courses.map((c, i) => `<tr><td>${esc(c.code || String(i + 1).padStart(2, '0'))}</td><td><b>${inline(c.title)}</b>${hasText(c.level) || hasText(c.term) ? `<span class="sub">${esc([c.level, c.term].filter(Boolean).join(' · '))}</span>` : ''}${(c.materials || []).length ? '<span class="sub">' + c.materials.map((m) => `<a href="${esc(m.url)}">${esc(m.label)}</a>`).join(' · ') + '</span>' : ''}</td></tr>`).join('')}</table>`
      : '<p class="muted">The course list will be added soon.</p>'}
      <h2 id="supervision">Thesis supervision</h2>${paras(T.supervision)}
      ${(T.previous || []).length ? `<h2 id="previous">Previous teaching</h2>${rows(T.previous)}` : ''}`;
  },
  'contact-page'(el) {
    const S = C.site;
    const lat = parseFloat(S.mapLat), lon = parseFloat(S.mapLon);
    el.innerHTML = `<h2 id="address" style="margin-top:0">Address</h2><p class="lede">${esc(S.name)} · ${esc(S.piName)}, Principal Investigator<br>${esc(S.fullName)}<br>${lines(S.address).map(esc).join('<br>')}</p>
      <h2 id="phone">Email and telephone</h2><table class="data">${S.email ? `<tr><td>Email</td><td>${mailto(S.email)}</td></tr>` : ''}${S.phone ? `<tr><td>Mobile</td><td>${tel(S.phone)}</td></tr>` : ''}${S.universityPhone ? `<tr><td>University</td><td>${tel(S.universityPhone)}${S.universityPhoneNote ? `<span class="sub">${esc(S.universityPhoneNote)}</span>` : ''}</td></tr>` : ''}</table>
      ${isFinite(lat) && isFinite(lon) ? `<h2 id="map">Location</h2><iframe class="map" title="Map of ${esc(S.university)}" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.02}%2C${lat - 0.015}%2C${lon + 0.02}%2C${lat + 0.015}&amp;layer=mapnik&amp;marker=${lat}%2C${lon}"></iframe>` : ''}
      <h2 id="profiles">Profiles</h2><div class="ids" data-links></div>`;
  },
  'openings-page'(el) {
    const O = C.openings, open = openPositions();
    el.innerHTML = `<h2 id="overview" style="margin-top:0;border-top:0;padding-top:0" data-nav="Overview">Working with us</h2>${paras(O.intro)}
      <h2 id="positions">Open positions</h2>${open.length ? `<div class="openings">${open.map(positionCard).join('')}</div>` : '<p class="muted">There are no specific openings at the moment. Motivated students are always welcome to get in touch.</p>'}
      <h2 id="apply">How to apply</h2>${paras(O.howToApply)}<p class="btn-row">${O.applyForm || O.applyLink ? `<a class="btn" href="${esc(O.applyForm ? `form/${encodeURIComponent(O.applyForm)}` : O.applyLink)}"${O.applyForm ? '' : ' target="_blank" rel="noopener"'}>${esc(O.applyLabel || 'Apply online')}</a> ` : ''}${C.site.email ? `<a class="btn" href="mailto:${esc(C.site.email)}">Email ${esc(C.site.piName)}</a>` : ''}</p>`;
  },
  'gallery-page'(el) {
    const photos = (C.gallery.photos || []).filter((p) => p.image);
    const albums = [...new Set(photos.map((p) => p.album || 'Lab life'))];
    el.innerHTML = photos.length ? albums.map((a, i) => `<h2 id="album-${i + 1}"${i === 0 ? ' style="margin-top:0;border-top:0;padding-top:0"' : ''}>${esc(a)}</h2><div class="gallery">${photos.filter((p) => (p.album || 'Lab life') === a).map((p) => `<figure><button type="button" class="gallery-open" aria-label="Enlarge: ${esc(strip(p.caption || a))}">${img(p.image, `alt="${esc(strip(p.caption || ''))}" loading="lazy" decoding="async"`)}</button>${p.caption || p.date ? `<figcaption>${inline(p.caption || '')}${p.date ? ` <span>${dateLabel(p.date)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>`).join('')
      : '<p class="muted">Photos will be added soon.</p>';
  },
  'pub-list'() { renderPubList(); },
};

// ---------- Publications page ----------
let pubFilter = 'jr';
function renderPubList() {
  const list = $('#pub-list'); if (!list) return;
  const q = $('#pub-q').value.trim().toLowerCase();
  const rows = pubs().filter((p) => pubFilter.includes(p.type) && (!q || strip(`${p.title} ${p.authors} ${p.venue} ${p.year}`).toLowerCase().includes(q)))
    .sort((a, b) => b.year - a.year || b.cites - a.cites);
  const byYear = {};
  rows.forEach((p) => (byYear[p.year] ||= []).push(p));
  list.innerHTML = Object.keys(byYear).sort((a, b) => b - a).map((y) =>
    `<h2 id="y${y}" data-nav="${y}">${y} <small>${byYear[y].length} item${byYear[y].length > 1 ? 's' : ''}</small></h2><ol class="pubs">${byYear[y].map((p) => pubItem(p)).join('')}</ol>`).join('')
    || '<p class="muted" style="margin-top:32px">No publications match this search.</p>';
  $('#pub-count').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
  buildSecnav();
}

// ---------- Secondary nav (left column) ----------
function buildSecnav() {
  const sec = $('.secnav'); if (!sec) return;
  const heads = $$('.content h2[id]');
  sec.innerHTML = `<span class="label">On this page</span><ul>${heads.map((h) => `<li><a href="#${h.id}">${esc((h.dataset.nav || h.childNodes[0].textContent).trim())}</a></li>`).join('')}</ul>`;
  const links = $$('a', sec);
  const mark = (id) => links.forEach((a) => a.classList.toggle('on', a.hash === '#' + id));
  let clicked = 0;
  const update = () => {
    if (Date.now() - clicked < 800 || !heads.length) return;
    const atBottom = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top <= 150) cur = h;
    mark((atBottom ? heads[heads.length - 1] : cur).id);
  };
  sec.onclick = (e) => { const a = e.target.closest('a'); if (a) { clicked = Date.now(); mark(a.hash.slice(1)); } };
  removeEventListener('scroll', buildSecnav.update); buildSecnav.update = update;
  addEventListener('scroll', update, { passive: true });
  if (location.hash && heads.some((h) => '#' + h.id === location.hash)) mark(location.hash.slice(1)); else update();
}

// ---------- Render everything ----------
function renderAll() {
  renderChrome();
  for (const el of $$('[data-render]')) RENDER[el.dataset.render]?.(el);
  for (const el of $$('[data-field]')) {
    const [s, k] = el.dataset.field.split('.');
    el.innerHTML = inline(C[s]?.[k] ?? '');
  }
  $$('[data-scholar]').forEach((el) => { const v = scholarValue(el.dataset.scholar); if (v) el.textContent = v; });
  const papers = pubs().filter((p) => p.type !== 'a');
  $$('[data-count]').forEach((el) => (el.textContent = { papers: papers.length, abstracts: pubs().length - papers.length }[el.dataset.count]));
  $$('[data-links]').forEach((el) => (el.innerHTML = linksOf().map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><small>${esc(l.label)}</small>${esc(l.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?&].*$/, '').slice(0, 44))}</a>`).join('')));
  $$('.figures').forEach((el) => (el.hidden = C.home.showStats === false));
  if (!$('#pub-list')) buildSecnav();
  loadMedia();
  setupNavIndicator();
  if (location.hash && !renderAll.scrolled) { renderAll.scrolled = true; requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()); }
}

// ---------- Menu overlay & nav indicator (delegated, so re-rendering the header keeps them working) ----------
const setMenu = (open) => {
  const menu = $('#menu'), menuBtn = $('.menu-btn');
  menu.classList.toggle('open', open); document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', open); (open ? $('.menu-close') : menuBtn).focus();
  if (open) requestAnimationFrame(() => setupNavIndicator.refresh?.());
};
document.addEventListener('click', (e) => {
  if (e.target.closest('.menu-btn')) setMenu(true);
  else if (e.target.closest('.menu-close')) setMenu(false);
  const cite = e.target.closest('[data-cite]');
  if (cite) { const p = pubs()[+cite.dataset.i]; if (p) copy(cite.dataset.cite === 'bib' ? bibtex(p) : apa(p), cite); }
  const docLink = e.target.closest('a[href^="#file:"]');
  if (docLink) { e.preventDefault(); openLiveDocument(docLink.getAttribute('href').slice(1)); }
  const notice = e.target.closest('[data-notice]');
  if (notice) {
    let d = []; try { d = JSON.parse(sessionStorage.getItem('afmn-notices') || '[]'); } catch { /* ignore */ }
    d.push(notice.dataset.notice); try { sessionStorage.setItem('afmn-notices', JSON.stringify(d)); } catch { /* ignore */ }
    notice.closest('.notice-bar').remove();
  }
  const open = e.target.closest('.gallery-open');
  if (open) {
    const im = $('img', open), dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.innerHTML = `<form method="dialog"><button aria-label="Close">×</button></form><img src="${esc(im.src)}" alt="${esc(im.alt)}"><p>${open.nextElementSibling?.innerHTML || ''}</p>`;
    document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
    dlg.showModal();
  }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#menu')?.classList.contains('open')) setMenu(false); });

// The lime marker follows the current page, pointer, keyboard focus, or menu-wheel selection.
function setupNavIndicator() {
  const nav = $('#nav'), menu = $('#menu'); if (!nav) return;
  const navItems = $$('a', nav), navIndicator = $('.nav-indicator', nav);
  const currentNavItem = navItems.find((a) => a.getAttribute('aria-current') === 'page') || navItems[0];
  let previewNavItem = null, navWheelLocked = false;
  const moveNavIndicator = (item) => {
    if (!item || !navIndicator) return;
    const navRect = nav.getBoundingClientRect(), itemRect = item.getBoundingClientRect();
    navIndicator.style.transform = `translate3d(${itemRect.right - navRect.left + 18}px, ${itemRect.top - navRect.top + (itemRect.height - 18) / 2}px, 0)`;
    navIndicator.classList.add('ready');
  };
  const showNavTarget = (item) => moveNavIndicator(item || currentNavItem);
  navItems.forEach((item) => {
    item.addEventListener('pointerenter', () => { previewNavItem = item; showNavTarget(item); });
    item.addEventListener('focus', () => { previewNavItem = item; showNavTarget(item); });
  });
  nav.addEventListener('pointerleave', () => { previewNavItem = null; showNavTarget(); });
  nav.addEventListener('focusout', () => requestAnimationFrame(() => { if (!nav.contains(document.activeElement)) { previewNavItem = null; showNavTarget(); } }));
  nav.addEventListener('wheel', (event) => {
    if (!menu.classList.contains('open') || Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    if (navWheelLocked) return;
    navWheelLocked = true;
    setTimeout(() => { navWheelLocked = false; }, 180);
    const currentIndex = navItems.indexOf(previewNavItem || currentNavItem);
    const nextIndex = Math.max(0, Math.min(navItems.length - 1, currentIndex + Math.sign(event.deltaY)));
    previewNavItem = navItems[nextIndex];
    showNavTarget(previewNavItem);
    previewNavItem.focus({ preventScroll: true });
  }, { passive: false });
  setupNavIndicator.refresh = () => showNavTarget(previewNavItem || currentNavItem);
  requestAnimationFrame(setupNavIndicator.refresh);
}
addEventListener('resize', () => setupNavIndicator.refresh?.());

// Header shrink + back-to-top
const onScroll = () => { $('.site-header')?.classList.toggle('scrolled', scrollY > 10); $('.to-top')?.classList.toggle('show', scrollY > 600); };
addEventListener('scroll', onScroll, { passive: true });
document.addEventListener('click', (e) => { if (e.target.closest('.to-top')) scrollTo({ top: 0, behavior: 'smooth' }); });

// Publications filters
if ($('#pub-list')) {
  $$('.seg button').forEach((b) => b.addEventListener('click', () => { $$('.seg button').forEach((x) => x.classList.toggle('on', x === b)); pubFilter = b.dataset.f; renderPubList(); }));
  $('#pub-q').addEventListener('input', renderPubList);
}

renderAll();
onScroll();

// ---------- Scroll reveal ----------
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.sec-head, .pi-block > *, .index a.row, .figures .wrap > div, .honours > *, .split > *, .roster > div, .awards li, .content figure, .person, .pi-card').forEach((el, i) => {
    el.classList.add('reveal'); el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el);
  });
}

// Content published after this copy of the site was built.
liveContent().then((live) => {
  if (!live) return;
  published = live;
  C = LAB.resolve({ ...published, ...(PREVIEW || {}) });
  const y = scrollY;
  renderAll();
  scrollTo(0, y);
}).catch((e) => console.info('Live content not loaded:', e.message));
