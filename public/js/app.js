// Shared site behaviour. Content lives in data.js; each page fills only the containers it has.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const esc = s => s.replace(/[<>"]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const NAV = [['index.html', 'Home'], ['research.html', 'Research'], ['publications.html', 'Publications'], ['team.html', 'Group'], ['profile.html', 'Principal Investigator'], ['teaching.html', 'Teaching'], ['news.html', 'News'], ['contact.html', 'Contact']];
const page = location.pathname.split('/').pop() || 'index.html';
const LINK_NAMES = { scholar: 'Google Scholar', researchgate: 'ResearchGate', orcid: 'ORCID', gstu: 'GSTU Faculty Page' };
const extLinks = () => Object.entries(LINKS).filter(([, u]) => u);

// ---------- Header & footer ----------
// Lab mark: a hexagonal lattice with bonded nodes (nanosheet / molecule motif).
const LOGO = (light = false) => `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg${light ? 'l' : 'd'}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light ? '#80dcf3' : '#009ede'}"/><stop offset="1" stop-color="${light ? '#b8eaef' : '#0764a2'}"/></linearGradient></defs>
  <g fill="none" stroke="url(#lg${light ? 'l' : 'd'})" stroke-width="2.6" stroke-linejoin="round"><path d="M32 4 56 18v28L32 60 8 46V18z"/><path d="M32 4v56M8 18l48 28M56 18 8 46"/></g>
  <g fill="url(#lg${light ? 'l' : 'd'})"><circle cx="32" cy="4" r="4"/><circle cx="56" cy="18" r="4"/><circle cx="56" cy="46" r="4"/><circle cx="32" cy="60" r="4"/><circle cx="8" cy="46" r="4"/><circle cx="8" cy="18" r="4"/><circle cx="32" cy="32" r="7"/></g>
  <circle cx="32" cy="32" r="3" fill="#e6e400"/></svg>`;
const navLinks = NAV.map(([h, t]) => `<a href="${h}"${h === page ? ' aria-current="page"' : ''}>${t}</a>`).join('');
$('#site-header').outerHTML = `
<header class="site-header"><div class="wrap">
  <a class="mark" href="index.html" aria-label="AFMN Lab, Principal Investigator Prof. Md. Kamruzzaman, home">${LOGO()}<span class="wm"><span class="wm-name">AFMN Lab</span><span class="wm-lead">Principal Investigator: Prof. Md. Kamruzzaman</span></span></a>
  <div class="hdr-right"><button class="menu-btn" aria-expanded="false" aria-controls="menu"><span class="sr">Menu</span><i></i></button><span class="org">ACCE · GSTU</span></div>
</div></header>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Site menu">
  <div class="wrap menu-top">
    <a class="mark" href="index.html" aria-label="AFMN Lab, Principal Investigator Prof. Md. Kamruzzaman, home">${LOGO()}<span class="wm"><span class="wm-name">AFMN Lab</span><span class="wm-lead">Principal Investigator: Prof. Md. Kamruzzaman</span></span></a>
    <button class="menu-close" aria-label="Close menu"></button>
  </div>
  <div class="wrap" style="flex:1;display:flex;flex-direction:column"><div class="menu-panel">
    <nav class="nav" id="nav" aria-label="Main">${navLinks}</nav>
    <div class="menu-aside">
      <span class="label">Profiles</span>
      <ul>${extLinks().map(([k, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${LINK_NAMES[k]}</a></li>`).join('')}<li><a href="mailto:mkamruzzamandu81@gmail.com">mkamruzzamandu81@gmail.com</a></li></ul>
      <span class="label">Department</span>
      <p><b>Professor &amp; Chairman</b>, Department of Applied Chemistry and Chemical Engineering, Gopalganj Science and Technology University</p>
    </div>
  </div></div>
</div>`;

$('#site-footer').outerHTML = `
<section class="band"><div class="wrap"><a class="btn" href="contact.html">Get in touch with the lab</a></div></section>
<footer class="site-footer"><div class="wrap">
  <div class="top">
    <div><div class="name">${LOGO(true)}<span>AFMN Lab<small>Advanced Functional Materials and Nanotechnology Laboratory</small></span></div>
      <p>Principal Investigator: <a href="profile.html"><b>Prof. Md. Kamruzzaman</b></a><br>Professor &amp; Chairman, Dept. of ACCE<br><br>Department of Applied Chemistry and Chemical Engineering<br>Room 204, Academic Building (Old)<br>Gopalganj Science and Technology University<br>Gopalganj 8105, Bangladesh</p></div>
    <div><h4>Site</h4><ul>${NAV.slice(0, 4).map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
    <div><h4>&nbsp;</h4><ul>${NAV.slice(4).map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
    <div><h4>Profiles</h4><ul>${extLinks().map(([k, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${LINK_NAMES[k]}</a></li>`).join('')}<li><a href="mailto:mkamruzzamandu81@gmail.com">Email</a></li></ul></div>
  </div>
  <div class="base"><span>© ${new Date().getFullYear()} AFMN Lab, Gopalganj Science and Technology University. Principal Investigator: Prof. Md. Kamruzzaman.</span><span>Citation data: Google Scholar, September 2026</span></div>
</div></footer><div class="toast" role="status"></div><button class="to-top" type="button" aria-label="Back to top"></button>`;

// Menu overlay
const menu = $('#menu'), menuBtn = $('.menu-btn');
const setMenu = open => {
  menu.classList.toggle('open', open); document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', open); (open ? $('.menu-close') : menuBtn).focus();
};
menuBtn.addEventListener('click', () => setMenu(true));
$('.menu-close').addEventListener('click', () => setMenu(false));
addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false); });

// Header shrink + back-to-top
const header = $('.site-header'), toTop = $('.to-top');
const onScroll = () => { header.classList.toggle('scrolled', scrollY > 10); toTop.classList.toggle('show', scrollY > 600); };
addEventListener('scroll', onScroll, { passive: true }); onScroll();
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));


$$('[data-links]').forEach(el => el.innerHTML = extLinks().map(([k, u]) =>
  `<a href="${u}" target="_blank" rel="noopener"><small>${LINK_NAMES[k]}</small>${u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?&].*$/, '').slice(0, 44)}</a>`).join(''));

const papers = PUBS.filter(p => p[1] !== 'a');
$$('[data-count]').forEach(el => el.textContent = { papers: papers.length, abstracts: PUBS.length - papers.length }[el.dataset.count]);

function toast(msg) {
  const t = $('.toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- Citations: BibTeX / APA ----------
function splitVenue(venue) {
  const v = strip(venue), m = v.match(/^(.*?)[ ,]+(\d.*)$/);
  return m ? [m[1], m[2]] : [v, ''];
}
const authorsOf = s => s.split(',').map(a => a.trim()).filter(a => a && !/^et al/.test(a));
function apaAuthor(a) {
  const parts = a.split(/\s+/), last = parts.pop();
  const initials = parts.join(' ').replace(/([A-Z])[a-z]*\.?/g, '$1.').replace(/\.(?=[A-Z])/g, '. ');
  return initials ? `${last}, ${initials}` : last;
}
function bibtex([year, type, , title, authors, venue, url]) {
  const [name, details] = splitVenue(venue), au = authorsOf(authors);
  const key = au[0].split(/\s+/).pop().toLowerCase().replace(/\W/g, '') + year + strip(title).split(/\s+/)[0].toLowerCase().replace(/\W/g, '');
  const kind = { c: 'incollection', a: 'inproceedings' }[type] || 'article';
  const f = [['title', `{${strip(title)}}`], ['author', au.join(' and ')], [type === 'c' || type === 'a' ? 'booktitle' : 'journal', name], ['year', year]];
  if (details) f.push(['note', details]);
  if (url && url.includes('doi.org/')) f.push(['doi', url.split('doi.org/')[1]]);
  return `@${kind}{${key},\n${f.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
}
function apa([year, , , title, authors, venue, url]) {
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
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cite]'); if (!b) return;
  const p = PUBS[+b.dataset.i];
  copy(b.dataset.cite === 'bib' ? bibtex(p) : apa(p), b);
});

const TYPE = { j: 'Article', r: 'Review', c: 'Chapter', a: 'Abstract' };
function pubItem(p, i, withYear = false) {
  const [year, type, cites, title, authors, venue, url] = p;
  const scholar = 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + strip(title) + '"');
  return `<li class="p"><div>
    <span class="t"><a href="${url || scholar}" target="_blank" rel="noopener">${esc(title)}</a></span>
    <span class="au">${authors.replace(/(Md?\. Kamruzzaman)/g, '<b>$1</b>')}</span>
    <span class="v"><em>${venue}</em>${withYear ? ` · ${year}` : ''}</span>
    <span class="tools"><span>${TYPE[type]}</span>${url ? `<a href="${url}" target="_blank" rel="noopener">${url.includes('doi.org') ? 'DOI' : 'Link'}</a>` : ''}<a href="${scholar}" target="_blank" rel="noopener">Scholar</a><button type="button" data-cite="bib" data-i="${i}">BibTeX</button><button type="button" data-cite="apa" data-i="${i}">APA</button></span>
  </div>${cites ? `<div class="c">${cites}<small>citations</small></div>` : '<div></div>'}</li>`;
}

// ---------- Secondary nav (left column) ----------
function buildSecnav() {
  const sec = $('.secnav'); if (!sec) return;
  const heads = $$('.content h2[id]');
  sec.innerHTML = `<span class="label">On this page</span><ul>${heads.map(h => `<li><a href="#${h.id}">${(h.dataset.nav || h.childNodes[0].textContent).trim()}</a></li>`).join('')}</ul>`;
  const links = $$('a', sec);
  const mark = id => links.forEach(a => a.classList.toggle('on', a.hash === '#' + id));
  let clicked = 0;
  const update = () => {
    if (Date.now() - clicked < 800 || !heads.length) return;
    const atBottom = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top <= 150) cur = h;
    mark((atBottom ? heads[heads.length - 1] : cur).id);
  };
  sec.onclick = e => { const a = e.target.closest('a'); if (a) { clicked = Date.now(); mark(a.hash.slice(1)); } };
  removeEventListener('scroll', buildSecnav.update); buildSecnav.update = update;
  addEventListener('scroll', update, { passive: true });
  if (location.hash && heads.some(h => '#' + h.id === location.hash)) mark(location.hash.slice(1)); else update();
}

// ---------- Publications page ----------
const list = $('#pub-list');
if (list) {
  let filter = 'jr';
  const render = () => {
    const q = $('#pub-q').value.trim().toLowerCase();
    const rows = PUBS.map((p, i) => [p, i]).filter(([p]) => filter.includes(p[1]) &&
      (!q || strip(p[3] + ' ' + p[4] + ' ' + p[5] + ' ' + p[0]).toLowerCase().includes(q)))
      .sort(([a], [b]) => b[0] - a[0] || b[2] - a[2]);
    const byYear = {};
    rows.forEach(r => (byYear[r[0][0]] ||= []).push(r));
    list.innerHTML = Object.keys(byYear).sort((a, b) => b - a).map(y =>
      `<h2 id="y${y}" data-nav="${y}">${y} <small>${byYear[y].length} item${byYear[y].length > 1 ? 's' : ''}</small></h2><ol class="pubs">${byYear[y].map(([p, i]) => pubItem(p, i)).join('')}</ol>`).join('')
      || '<p class="muted" style="margin-top:32px">No publications match this search.</p>';
    $('#pub-count').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
    buildSecnav();
  };
  $$('.seg button').forEach(b => b.addEventListener('click', () => {
    $$('.seg button').forEach(x => x.classList.toggle('on', x === b)); filter = b.dataset.f; render();
  }));
  $('#pub-q').addEventListener('input', render);
  render();
}

// ---------- Home: selected publications ----------
const sel = $('#selected-pubs');
if (sel) sel.innerHTML = PUBS.map((p, i) => [p, i]).filter(([p]) => p[1] === 'j' && p[0] >= 2025)
  .sort(([a], [b]) => b[0] - a[0] || b[2] - a[2]).slice(0, +sel.dataset.limit || 5).map(([p, i]) => pubItem(p, i, true)).join('');

// ---------- News ----------
$$('[data-news]').forEach(el => el.innerHTML = NEWS.slice(0, +el.dataset.news || NEWS.length)
  .map(([d, , html]) => `<li><time>${d}</time>${html}</li>`).join(''));

// ---------- Group ----------
const initials = n => n.replace(/^(Md|M|S)\.\s*/g, '').split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).slice(0, 2).join('');
const tg = $('#team');
if (tg) tg.innerHTML = `<div class="people">${TEAM.map(m => {
  const links = Object.entries(m.links || {}).map(([k, u]) => `<a href="${u}" target="_blank" rel="noopener">${LINK_NAMES[k] || k}</a>`).join(' · ');
  return `<div class="person"><div class="ph">${m.photo ? `<img src="${m.photo}" alt="${m.name}" loading="lazy">` : initials(m.name)}</div>
    <b>${m.name}</b><span>${m.title}</span>${m.topic ? `<span>${m.topic}</span>` : ''}${links ? `<div class="lk">${links}</div>` : ''}</div>`;
}).join('')}</div>`;
const roster = $('#roster');
if (roster) roster.innerHTML = TEAM.map(m => `<div><b>${m.name}</b><span>${m.topic || m.title}</span></div>`).join('');

// ---------- Teaching ----------
const cl = $('#courses');
if (cl) cl.innerHTML = `<table class="data">${COURSES.map(([code, title, , , mats = []], i) => `<tr><td>${code || String(i + 1).padStart(2, '0')}</td><td><b>${title}</b>${mats.length ? '<span class="sub">' + mats.map(([l, u]) => `<a href="${u}">${l}</a>`).join(' · ') + '</span>' : ''}</td></tr>`).join('')}</table>`;

if (!list) buildSecnav();

// ---------- Scroll reveal ----------
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.sec-head, .lead > *, .index a.row, .figures .wrap > div, .honours > *, .split > *, .roster > div, .awards li, .content figure, .person, .pi-card').forEach((el, i) => {
    el.classList.add('reveal'); el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el);
  });
}
