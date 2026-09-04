Deployment for streamers — zero terminal required
===============================================

Goal: allow a streamer to deploy this project to Vercel and run the scraper via GitHub Actions without running any terminal commands on their machine.

Overview
- Frontend/API runs on Vercel (no Playwright needed on Vercel).
- Scraper runs in GitHub Actions (Action runner installs Playwright and browsers).
- Actions uploads `rankings_all_regions.json` to Supabase Storage (public bucket).
- Vercel API reads the JSON from Supabase Storage (public URL) if local file is missing.

What you (streamer) must do (no terminal):
1. Fork or import this repository into your GitHub account.
2. In GitHub, go to the fork → Settings → Secrets & variables → Actions → New repository secret. Add these secrets:
   - `SUPABASE_URL` — e.g. `https://xyz.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service_role key (keep secret)
   - `SUPABASE_BUCKET` — optional, default `public`
   - `SUPABASE_PUBLIC_BUCKET` — optional, default `public`

3. In Supabase (project settings) create a storage bucket named `public` (or the name you chose). Make the bucket public (or create a public policy for that file path). Upload permissions are handled by the Action using the service role key.

4. Connect your GitHub repo to Vercel (import project). In Vercel project settings → Environment Variables add:
   - `SUPABASE_URL` = same value as GitHub secret (this is safe to expose server-side in Vercel)
   - `SUPABASE_PUBLIC_BUCKET` = `public` (or your bucket name)

5. Deploy on Vercel. The frontend and API will be available at the Vercel URL.

6. Run the GitHub Action manually: GitHub → Actions → "Scrape Fortnite Rankings" → Run workflow. The Action will run the scraper and upload the JSON to Supabase.

7. Open your Vercel site `/power-rankings` and press Refresh. The page will poll the API and update page-by-page as the Action writes `rankings_all_regions.json`.

Notes & tips
- Do NOT commit your `.env.local` or service keys to the repo. `.env.local` is already ignored by `.gitignore`.
- If you prefer storing the JSON in S3 instead of Supabase Storage, I can adapt the workflow and uploader to S3.
- GitHub Actions runners already install Playwright browsers in the workflow; streamers don't need to run any terminal commands locally.

Need help?
- I can redact local secrets (`.env.local`) for you or create a sanitized copy ready to commit. Tell me which step you want help with.
