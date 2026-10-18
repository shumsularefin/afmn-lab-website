# AFMN Lab Website

Static website for the Advanced Functional Materials and Nanotechnology Laboratory at GSTU.

## Deploying with Firebase Hosting

The site is served from `public/`. Firebase Hosting deploys pushes to `main` to the live channel and creates preview deployments for pull requests. Firebase CLI stores the deployment credential in the repository secret `FIREBASE_SERVICE_ACCOUNT_AFMN_LAB`.

Firebase Hosting URL: https://afmn-lab.web.app

## Automatic Google Scholar updates

`.github/workflows/scholar-update.yml` runs on the 1st and 15th of each month (and on demand from the Actions tab, "Update from Google Scholar" → "Run workflow"). It runs `scripts/update_scholar.py`, which reads Prof. Kamruzzaman's Google Scholar profile and:

- updates total citations, citations since 2021, h-index and i10-index (`public/js/scholar.js`, shown on the home page, Principal Investigator page and footer);
- updates each listed paper's citation count in `public/js/data.js`;
- adds papers that are new on Scholar to the top of the publication list, with DOI, full journal name, volume and pages looked up on Crossref, and announces each one in News.

It then commits the changes and redeploys to Firebase. If Scholar cannot be read, or returns something implausible such as a much lower citation total, nothing is changed and the run is marked failed in the Actions tab.

Google Scholar sometimes blocks requests from GitHub's servers. For reliable runs, create a free account at [serpapi.com](https://serpapi.com) (the free plan covers this easily) and save its API key as the repository secret `SERPAPI_KEY`. The script tries Scholar directly first and falls back to SerpApi.

Automatically added entries can be edited by hand in `public/js/data.js` like any other entry (for example to correct the type: `j` article, `r` review, `c` chapter, `a` conference). `scripts/scholar-state.json` records which Scholar items have been seen, so an entry you delete is not added again.

To run it by hand: `pip install -r scripts/requirements.txt && python scripts/update_scholar.py` (add `--dry-run` to preview). If Scholar blocks you, save the profile page from your browser and run `python scripts/update_scholar.py --html saved-page.html`.
