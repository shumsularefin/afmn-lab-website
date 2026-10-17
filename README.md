# AFMN Lab Website

Static website for the Advanced Functional Materials and Nanotechnology Laboratory at GSTU.

## Deploying with Firebase Hosting

The site is served from `public/`. The GitHub Actions workflow deploys pushes to `main` to the live Firebase Hosting channel and creates preview deployments for pull requests.

Configure these repository secrets before the workflow can deploy:

- `FIREBASE_PROJECT_ID`: `afmn-lab`
- `FIREBASE_SERVICE_ACCOUNT`: JSON for a Firebase service account with Firebase Hosting deployment access.

Firebase Hosting URL: https://afmn-lab.web.app
