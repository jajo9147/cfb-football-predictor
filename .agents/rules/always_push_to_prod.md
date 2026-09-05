# Production Deployment Rule

Whenever changes, bug fixes, or enhancements are made to the codebase:
1. Immediately test and verify locally.
2. Synchronize across platforms (`ios/`, `android/`).
3. Commit the changes cleanly to git.
4. **MANDATORY**: Always push immediately to `origin main` (`git push origin main`) so that GitHub Pages (`https://jajo9147.github.io/cfb-football-predictor/`) automatically deploys and updates the live production site.
5. Never wait for the user to ask to push to prod. Pushing to production is an essential completion criterion for every fix.
