// End-to-end test of the Lab Dashboard against the Firestore and Auth emulators (see DASHBOARD.md, Testing locally).
// Needs: emulators on 127.0.0.1:8080/9099 (project demo-afmn) and public/ served on BASE. Run: node tests/dashboard.e2e.cjs
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = process.env.BASE || 'http://127.0.0.1:8102';
const EMU = 'http://127.0.0.1:8080|demo-afmn';
const OWNER = 'muhammadshamsularefin01@gmail.com';
(async () => {
  const browser = await chromium.launch({ ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
  async function session(email) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((emu) => localStorage.setItem('afmn-emulator', emu), EMU);
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
    page.on('dialog', (d) => d.accept());
    await page.goto(`${BASE}/admin.html`);
    await page.waitForFunction(() => window.labDashboard?.testSignIn, null, { timeout: 30000 });
    await page.evaluate((e) => labDashboard.testSignIn(e), email);
    return page;
  }
  const step = (s) => console.log('✔', s);

  // ---- Owner signs in, sees overview
  const owner = await session(OWNER);
  await owner.waitForSelector('#ed-shell:not([hidden]) .ed-welcome');
  step('owner signed in; overview shows');
  

  // ---- Team: add a member with a photo, publish
  await owner.click('a[href="#section/team"]');
  await owner.waitForSelector('[data-list="members"]');
  await owner.click('[data-add="members"]');
  const last = await owner.evaluate(() => document.querySelectorAll('[data-list="members"] > .ed-items > li').length - 1);
  await owner.fill(`[data-path="members.${last}.name"]`, 'Test Newmember');
  await owner.fill(`[data-path="members.${last}.position"]`, 'M.Sc. student');
  await owner.fill(`[data-path="members.${last}.topic"]`, 'Ti_{3}C_{2} MXene **films**');
  await owner.setInputFiles(`[data-image="members.${last}.photo"] input[type=file]`, require('path').join(__dirname, '../public/images/portrait-400.jpg'));
  await owner.waitForFunction((l) => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('afmn-dashboard-drafts'))))['content:team']?.value.members[l].photo.startsWith('media:'), last, { timeout: 20000 });
  step('member added, photo uploaded and optimized, draft saved');
  
  await owner.click('.ed-status [data-publish]');
  await owner.waitForSelector('.ed-chip-live', { timeout: 20000 });
  step('team published');

  // ---- Validation: required field blocks publishing
  await owner.click('a[href="#section/news"]');
  await owner.waitForSelector('[data-add="news" i], [data-add="items"]');
  await owner.click('[data-add="items"]');
  await owner.click('.ed-status [data-publish]');
  await owner.waitForSelector('.ed-error-text');
  step('empty news item is refused with a message: ' + (await owner.textContent('.ed-toast-error')).trim().slice(0, 80));
  await owner.fill('[data-path="items.0.date"]', '10 November 2026');
  await owner.fill('[data-path="items.0.tag"]', 'Welcome');
  await owner.fill('[data-path="items.0.text"]', 'Welcome to our new member, Test Newmember.');
  await owner.click('.ed-status [data-publish]');
  await owner.waitForSelector('.ed-chip-live', { timeout: 20000 });
  step('news published');

  // ---- Announcement + opening via Publish all
  await owner.click('a[href="#section/notices"]');
  await owner.click('[data-add="items"]');
  await owner.fill('[data-path="items.0.text"]', 'Seminar on **MXene** films, 20 November');
  await owner.click('a[href="#section/openings"]');
  await owner.click('[data-add="positions"]');
  await owner.fill('[data-path="positions.0.title"]', 'M.Sc. thesis: MXene packaging films');
  await owner.fill('[data-path="positions.0.kind"]', 'M.Sc. thesis');
  await owner.fill('[data-path="positions.0.summary"]', 'Work on biodegradable films.');
  await owner.waitForTimeout(300);
  await owner.click('#ed-publish-all');
  await owner.click('dialog button[value="ok"]');
  await owner.waitForFunction(() => document.querySelector('#ed-drafts-pill').hidden, null, { timeout: 20000 });
  step('Publish all published notices + openings');

  // ---- Editors: add a contributor
  await owner.click('a[href="#editors"]');
  await owner.waitForSelector('[data-editor-form]');
  await owner.fill('[data-editor-form] [name=email]', 'student@example.com');
  await owner.selectOption('[data-editor-form] [name=role]', 'contributor');
  await owner.click('[data-editor-form] button[type=submit]');
  await owner.waitForSelector('text=student@example.com');
  await owner.waitForSelector('[data-log] tr:has-text("content.update"), [data-log] tr:has-text("Published")');
  step('contributor granted; activity log lists publications');
  

  // ---- Public site shows the live content
  const pub = await owner.context().newPage();
  await pub.goto(`${BASE}/team.html`);
  await pub.waitForSelector('text=Test Newmember', { timeout: 15000 });
  await pub.waitForFunction(() => [...document.querySelectorAll('.person img')].some((i) => i.src.startsWith('data:image/jpeg')), null, { timeout: 15000 });
  const topic = await pub.innerHTML('.person:has-text("Test Newmember")');
  assert(topic.includes('<sub>3</sub>') && topic.includes('<b>films</b>'), 'rich text rendered');
  step('public Group page shows the new member, uploaded photo and formatted topic');
  await pub.goto(`${BASE}/index.html`);
  await pub.waitForSelector('.notice-bar:has-text("Seminar")');
  await pub.waitForSelector('.recruit:not([hidden]):has-text("MXene packaging")');
  await pub.waitForSelector('.news li:has-text("Test Newmember")');
  step('home page shows announcement bar, recruiting strip and news');
  
  await pub.goto(`${BASE}/opportunities.html`);
  await pub.waitForSelector('.opening:has-text("M.Sc. thesis")');
  step('Join us page lists the opening');

  // ---- Contributor: limited sections, server refuses others
  const contrib = await session('student@example.com');
  await contrib.waitForSelector('#ed-shell:not([hidden])');
  const navs = await contrib.$$eval('#ed-nav a', (as) => as.map((a) => a.textContent.trim()));
  assert(navs.some((n) => n.includes('News')) && !navs.some((n) => n.includes('Group members')) && !navs.some((n) => n.includes('Editors')), navs.join('|'));
  step('contributor sees only: ' + navs.join(', '));
  const denied = await contrib.evaluate(async () => { try { await labDashboard.cloud.saveSection('team', { members: [] }, labDashboard.data.sections.team.revision); return 'allowed'; } catch (e) { return e.code || e.message; } });
  assert.equal(denied, 'permission-denied');
  const denied2 = await contrib.evaluate(async () => { try { await labDashboard.cloud.setEditor('x@example.com', 'super-admin', true); return 'allowed'; } catch (e) { return e.code || e.message; } });
  assert.equal(denied2, 'permission-denied');
  step('rules refuse contributor writes to Group members and editor access');

  // ---- Stranger: no access
  const stranger = await session('random@example.com');
  await stranger.waitForSelector('#ed-signin-status:has-text("no dashboard access")');
  const strangerWrite = await stranger.evaluate(async () => { try { const r = await (await fetch('http://127.0.0.1:8080/v1/projects/demo-afmn/databases/(default)/documents/content/news')).json(); await labDashboard.cloud.saveSection('news', { items: [] }, Number(r.fields.revision.integerValue)); return 'allowed'; } catch (e) { return e.code || e.message; } });
  assert.equal(strangerWrite, 'permission-denied');
  step('unknown account has no access and cannot write');

  for (const p of [owner, contrib, stranger]) if (p.errors.length) console.log('page errors:', p.errors);
  await browser.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
