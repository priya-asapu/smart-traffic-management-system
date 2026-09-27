# Put Smart Traffic Online — no laptop required after deployment

This version serves the React/PWA frontend and Flask API from one HTTPS URL.
That means the installed app can be opened from a phone even when the development laptop is OFF.

## Render deployment
1. Create a GitHub repository and upload this project folder.
2. In Render, choose **New → Web Service** and connect that repository.
3. Render detects the included `Dockerfile`.
4. Choose the **Free** plan for a demo.
5. Add the environment variable:
   - `GOOGLE_MAPS_API_KEY` = your Google Maps key
6. Deploy.
7. Open the generated `https://...onrender.com` URL on the phone.
8. Chrome menu → **Add to Home screen / Install app**.

The frontend automatically uses the same-origin `/api`, so no laptop IP or localhost URL is required in production.

## Important free-hosting note
Render free web services can sleep after inactivity and their local filesystem is ephemeral. This project currently uses SQLite for accounts, so user accounts stored on the free instance can be lost after a restart/redeploy. For a persistent production account database, connect the app to a managed PostgreSQL database before treating it as a permanent service.

## Google key
Keep the key in Render Environment Variables rather than committing it to GitHub. Restrict the browser key to the deployed HTTPS domain and the required Google APIs.
