// End-to-end test of the CV upload, members' personal websites, the logo and in-house forms, against the
// Firestore and Auth emulators (see DASHBOARD.md, Testing locally). Run: node tests/features.e2e.cjs
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BASE = process.env.BASE || 'http://127.0.0.1:8102';
const EMU = 'http://127.0.0.1:8080|demo-afmn';
const OWNER = 'muhammadshamsularefin01@gmail.com';

// A tiny valid PDF.
const pdfPath = path.join(os.tmpdir(), 'afmn-test-cv.pdf');
fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

(async () => {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((emu) => { localStorage.setItem('afmn-emulator', emu); localStorage.removeItem('afmn-live-v1'); }, EMU);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  const step = (s) => console.log('✔', s);
  const publish = async () => { await p.click('.ed-status [data-publish]'); await p.waitForSelector('.ed-chip-live', { timeout: 20000 }); };

  await p.goto(`${BASE}/admin.html`);
  await p.waitForFunction(() => window.labDashboard?.testSignIn);
  assert(await p.$('img.ed-logo[src*="afmn-logo"]'), 'logo on sign-in card');
  await p.evaluate((e) => labDashboard.testSignIn(e), OWNER);
  await p.waitForSelector('#ed-shell:not([hidden])');
  step('dashboard shows the AFMN logo');

  // ---- CV upload on the PI section
  await p.goto(`${BASE}/admin.html#section/pi`);
  await p.waitForSelector('[data-file="cv"]');
  await p.setInputFiles('[data-file="cv"] input[type=file]', pdfPath);
  await p.waitForSelector('[data-file="cv"] [data-current]:has-text("Uploaded PDF")', { timeout: 20000 });
  await p.fill('[data-path="website"]', 'https://kamruzzaman.example.org');
  await publish();
  step('CV uploaded as PDF and PI website set, published');

  // ---- Member personal website
  await p.goto(`${BASE}/admin.html#section/team`);
  await p.waitForSelector('[data-list="members"]');
  await p.click('[data-item="members.0"] summary');
  await p.fill('[data-path="members.0.website"]', 'https://member.example.org');
  await publish();
  step('member personal website published');

  // ---- In-house form
  await p.goto(`${BASE}/admin.html#forms`);
  await p.click('[data-new="application"]');
  await p.waitForSelector('[data-path="title"]');
  await p.fill('[data-path="title"]', 'M.Sc. application 2027');
  await p.selectOption('[data-path="status"]', 'open');
  await p.click('[data-save]');
  await p.waitForSelector('text=Share this form', { timeout: 20000 });
  const formId = await p.evaluate(() => location.hash.split('/')[1]);
  assert.equal(formId, 'm-sc-application-2027');
  step('application form created from the template: ' + formId);

  // ---- Attach it to an opening and a general Apply button
  await p.goto(`${BASE}/admin.html#section/openings`);
  await p.click('[data-add="positions"]');
  await p.fill('[data-path="positions.0.title"]', 'M.Sc. thesis 2027');
  await p.selectOption('[data-path="positions.0.form"]', formId);
  await p.selectOption('[data-path="applyForm"]', formId);
  await publish();
  step('form attached to the opening and as the general application form');

  // ---- Public site
  const pub = await ctx.newPage();
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.goto(`${BASE}/team.html`);
  await pub.waitForSelector('.person a[href="https://member.example.org"]', { timeout: 15000 });
  assert(await pub.$('.site-header img.logo[src*="afmn-logo.svg"]'), 'header logo');
  assert(await pub.$('.site-footer img.logo[src*="afmn-logo-light.svg"]'), 'footer logo');
  step('Group page: logo in header and footer, member name links to their website');
  await pub.goto(`${BASE}/profile.html`);
  const cv = await pub.waitForSelector('a[href^="#file:"]:has-text("Download curriculum vitae")', { timeout: 15000 });
  assert.match(await cv.getAttribute('href'), /^#file:[a-f0-9-]{36}$/);
  // Headless Chromium downloads PDFs instead of showing them, so catch the address the new tab is sent to.
  await pub.evaluate(() => { window.open = () => (window.fakeTab = { close() {}, set location(u) { window.openedUrl = u; } }); });
  await cv.click();
  await pub.waitForFunction(() => window.openedUrl, null, { timeout: 15000 });
  const head = await pub.evaluate(async () => (await (await fetch(window.openedUrl)).text()).slice(0, 8));
  assert.equal(head, '%PDF-1.4');
  assert(await pub.$('a[href="https://kamruzzaman.example.org"]'));
  step('profile page: CV opens from the uploaded PDF; personal website linked');
  await pub.goto(`${BASE}/opportunities.html`);
  await pub.waitForSelector(`.opening a[href="form/${formId}"]`, { timeout: 15000 });
  await pub.waitForSelector(`#apply ~ p a[href="form/${formId}"]:has-text("Apply online")`);
  step('Join us page: Apply buttons open the in-house form');

  // ---- Answer the form
  await pub.goto(`${BASE}/form.html?id=${formId}`);
  await pub.waitForSelector('form.pf');
  await pub.click('.pf-submit button');
  await pub.waitForSelector('.pf-error:not([hidden])');
  await pub.fill('#pf-name', 'Test Applicant');
  await pub.fill('#pf-email', 'applicant@example.com');
  await pub.fill('#pf-phone', '01712345678');
  await pub.selectOption('#pf-position', 'M.Sc. thesis');
  await pub.fill('#pf-institution', 'GSTU, ACCE');
  await pub.fill('#pf-degree', 'B.Sc. 4th year');
  await pub.check('input[name="interest"][value="Water treatment"]');
  await pub.fill('#pf-statement', 'I would like to work on adsorbents.');
  await pub.fill('#pf-cv', 'https://drive.google.com/file/d/abc/view');
  await pub.click('.pf-submit button');
  await pub.waitForSelector('.pf-done', { timeout: 15000 });
  step('public form validates and accepts an application');
  const peek = await pub.evaluate(async (id) => (await fetch(`http://127.0.0.1:8080/v1/projects/demo-afmn/databases/(default)/documents/forms/${id}/responses`)).status, formId);
  assert.equal(peek, 403);
  step('anonymous visitors cannot read responses (403)');

  // ---- Read responses in the dashboard
  await p.goto(`${BASE}/admin.html#forms/${formId}`);
  await p.click('[data-load]');
  await p.waitForSelector('[data-responses] td:has-text("Test Applicant")', { timeout: 15000 });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-csv]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert(csv.includes('Test Applicant') && csv.includes('Water treatment'));
  step('dashboard shows the response and downloads it as CSV');

  if (errors.length) console.log('page errors:', errors);
  await browser.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
