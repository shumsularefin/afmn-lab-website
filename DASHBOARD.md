# Lab Dashboard

The website has a dashboard at **https://afmn-lab.web.app/admin.html** (also linked as “Lab dashboard” in the footer). It works like the ACS GSTU Chapter Editor: sign in with Google, edit a section, preview, publish. No code, no GitHub.

It runs on the free Firebase Spark plan: Hosting, Google sign-in and Firestore. There are no Cloud Functions and no Cloud Storage; uploaded photos are stored in Firestore.

## What can be edited

| Section | What it controls |
| --- | --- |
| Home page | Hero title, introduction and picture, the texts beside Research and The group, how many publications and news items to show, whether the student chapters and research figures show |
| Announcements | Bars at the top of every page (or the home page only) for seminars, deadlines, awards or closures, each with optional start and end dates, link and style |
| Principal Investigator | Name, portrait, positions, short and full biography, appointments, education, research interests, honours and awards, teaching and service, student chapters with their awards and links |
| Research | Research areas (title, home-page summary, figure, caption, description, selected papers), current projects, funding and grants, collaborators |
| Instruments | Instruments and facilities with category, make and model, use, photo, and status (available, under maintenance, coming soon) |
| Group members | Current members, collaborators and alumni with photo, position, topic, years, email, current position (alumni) and profile links; order with ↑ ↓ |
| Publications | Every publication (add one from its DOI with **Fill in from DOI**), citations, type, and which to feature on the home page. New papers found by the Google Scholar update appear in a **New from Google Scholar** box |
| News | Dated news with tags and an optional “More” link. Scholar-announced papers appear in the same suggestion box |
| Openings & recruiting | The **Join us** page: positions with kind, deadline, description, requirements and where to apply. Open positions also show in a black “We are recruiting” strip on the home page and close by themselves after the deadline |
| Gallery | Photos with caption, album and date. The Gallery page appears in the menu once it has a photo |
| Teaching | Courses with links to materials, thesis supervision, previous teaching |
| Site & contact | Lab name, PI name and title, email, phones, address, map position, CV link, and the profile links used in the menu, footer, profile and contact pages |

Managing pages (super-admin): **Editors & activity**, **Backups**. Everyone: **Image library**, **Your account**.

## Editing

1. **Edit** a section. Changes are saved as a **draft in this browser** as you type (“Draft saved 12:03 · not live yet”). Long lists open one item at a time; use the search box, ↑ ↓ to reorder, ⧉ to duplicate, × to remove.
2. **Preview** opens the website with your drafts applied, only for you (a black bar says it is a preview).
3. **Publish** makes the section live. Visitors see it at once. Each section publishes on its own; the orange **unpublished drafts** button lists every draft with Open, Discard and Publish, and **Publish all** publishes them one by one.

If a required field is missing, publishing stops and the field is shown with the message. If someone else published the same section while you were editing, you are asked whether to keep your version or load theirs.

Text fields accept a little formatting: `**bold**`, `*italic*`, `[link text](https://…)`, subscripts `C_{3}N_{4}` and superscripts `Ca^{2+}`. Leave a blank line between paragraphs. A preview appears under the field when you use formatting.

**Images:** **Upload from device** resizes and compresses the photo automatically (phone photos are fine). **Choose uploaded image** reuses one. The **Image library** shows where each image is used and who uploaded it; unused images can be deleted.

## Roles

| Role | Can do |
| --- | --- |
| Super-admin | Everything, plus editor access, the activity log and backups |
| Lab editor | All website content |
| Contributor | News, publications and the gallery (for lab members who post updates) |

`muhammadshamsularefin01@gmail.com` is the permanent owner and super-admin; it cannot be changed or removed. To change the owner, edit `OWNER_EMAIL` in `public/js/admin/cloud.js` and the two addresses in `firestore.rules`, then deploy the rules.

The super-admin adds people under **Editors & activity**: their Google email, a role, Active. Disable or remove access when someone leaves; the activity log keeps the history. Every change is logged with the person and the server time, and the log cannot be edited. Permissions are enforced by `firestore.rules` on the server, not only by hiding buttons.

## LabBoard shares this project

The instrument board at `/update` ([labboard/README.md](labboard/README.md)) uses the same Firebase project, Google sign-in and `firestore.rules` file, in its own collections (`users`, `allowlist`, `instruments`, `sessions`, `bookings`, `templates`, `issues`, `maintenance`). Those rules sit in a clearly marked "LabBoard" section at the end of `firestore.rules`; always deploy the whole file, never only a part. Website editors and LabBoard users are separate lists: being a website editor gives no LabBoard access, and vice versa.

## How it fits together

```
Lab Dashboard (admin.html) ──writes──▶ Firestore: content/{section}, siteImages/{id}, site/meta (revision)
                                              │
     deploy, and every 30 minutes when something new was published (.github/workflows/content-sync.yml)
                                              │  scripts/bake-content.mjs reads it (public API, no keys)
                                              ▼
                public/js/published.js + public/media/*.jpg ──▶ Firebase Hosting
Visitors: pages render the baked content at once, then check site/meta (at most every 5 minutes)
          and load anything published since the last deploy.
```

- `public/js/content.js` holds the **original content** of every section. A section that was never published shows that; once published, Firestore's version replaces it.
- `public/js/app.js` renders every page from the content. Pages only contain empty containers (`data-render`, `data-field`).
- The **Google Scholar workflow** keeps working as before: it updates `public/js/data.js`. Fresh citation counts are applied to the dashboard's publication list (matched by DOI or title), and papers the dashboard has not seen yet show on the website and in the dashboard's suggestion box until someone adds or dismisses them.
- `public/js/admin/schema.js` describes every editable field. To make something new editable: add the field there, give it a default in `content.js`, and use it in `app.js`. Add a new section to the list in `firestore.rules` too.

## One-time setup (Firebase console, project `afmn-lab`)

1. **Firestore:** Build → Firestore Database → Create database (production mode, a nearby region such as `asia-south1`).
2. **Google sign-in:** Build → Authentication → Get started → Sign-in method → Google → Enable. Under Settings → Authorized domains, `afmn-lab.web.app` and `afmn-lab.firebaseapp.com` are listed by default; add any custom domain.
3. **Web app:** Project settings → General → Your apps. If there is no web app, add one (no need to set up Hosting again). Firebase Hosting then serves its settings at `/__/firebase/init.json`, which the dashboard reads. (For another host, paste the config object into `public/data/firebase-config.json`.)
4. **Security rules:** deploy them once, and again whenever `firestore.rules` changes:
   ```bash
   npx firebase-tools deploy --only firestore:rules --project afmn-lab
   ```
   (Or paste `firestore.rules` into Firestore → Rules → Publish.)
5. Merge to `main`. Then open `/admin.html` and sign in with the owner account. Add the PI and lab members under **Editors & activity**.

Until steps 1–4 are done the website keeps working exactly as before; the dashboard explains what is missing.

## Free-tier limits (Spark)

Firestore allows 50,000 reads and 20,000 writes a day for free. A visitor costs at most one read per five minutes (the freshness check), plus the content once after each publish until the next deploy bakes it in. Each uploaded image is stored at up to about 280 KB and costs nothing once baked into the site.

## Backups and rollback

- **Backups → Download backup** saves all content as JSON. **Restore** loads a backup as drafts to review and publish.
- Hosting rollback: Firebase console → Hosting → Release history → Roll back (files only, not Firestore content).

## Testing locally

```bash
npx firebase-tools emulators:start --only firestore,auth --project demo-afmn
```

Serve `public/` (for example `python3 -m http.server 8102 -d public`), open `http://127.0.0.1:8102/admin.html`, and in the browser console run `localStorage.setItem('afmn-emulator', 'http://127.0.0.1:8080|demo-afmn')`, reload, then `labDashboard.testSignIn('muhammadshamsularefin01@gmail.com')`. The emulator accepts test accounts; real Firebase does not. `tests/dashboard.e2e.cjs` runs the whole flow (sign-in, upload, publish, validation, roles, rules, public pages) with Playwright.
