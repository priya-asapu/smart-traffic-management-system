# Smart Traffic Management System — V31

V31 keeps the existing Smart Route, Nearby, Maps, Google suggestions, route and navigation workflows intact and applies only the requested account/dashboard UI updates.

## V31 updates
- Dashboard blue hero panel removed and replaced with a simple `Welcome back, <username>` heading.
- Dashboard feature cards now use distinct colors instead of plain white cards.
- Login with an account that does not exist or with the wrong password returns `Invalid username or password.`
- Profile now shows username, address and phone number.
- Address and phone can be saved from Profile.
- Registration accepts optional address and phone number.
- Profile has a Change Login Password section requiring username, current password, new password and retyped new password.
- Profile has a Delete Account section requiring password + retyped password before confirmation.
- Existing logout behavior remains in the header.
- Existing Smart Route, Nearby search, Google suggestions, Maps, route paths and navigation were not intentionally changed.

## Run
1. Backend: run `run_backend.bat` after setting `backend/.env` with `GOOGLE_MAPS_API_KEY`.
2. Frontend: run `run_frontend.bat`.
3. Open the Vite URL shown by the frontend.

## V34 — Mobile / PWA
- Added installable Progressive Web App support for Android/iPhone browsers that support PWA installation.
- Added mobile-safe viewport, app manifest, icons and service worker.
- Existing desktop UI and project features are preserved.
- Local development still uses `http://localhost:5000/api` automatically.
- For a deployed frontend with a separate Flask backend, set `VITE_API_URL` to the deployed backend `/api` URL before building.
- A phone cannot reach the development machine's `localhost:5000`; the Flask backend must be deployed/reachable over HTTPS for a remotely installed app.

## V35 — Online / phone-only deployment
- Added a production Dockerfile that builds the React/PWA frontend and serves it from Flask on the same HTTPS origin.
- Added `render.yaml` for a one-service Render deployment.
- Added `/api/health` as the deployment health check.
- Production frontend automatically uses same-origin `/api`; no laptop localhost URL is needed after deployment.
- See `DEPLOY_TO_PHONE.md` for the short deployment steps.
- Existing Smart Route, Nearby, Google suggestions, Maps, navigation and account UI are preserved.
