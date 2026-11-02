# Dharma Affiliates

Deploy this repository to **Vercel** using the Vite preset. The React frontend and `/api/workbook` Vercel Function deploy together. No Express server, separate backend host, or always-running process is needed. Supabase hosts the persistent database.

## One-time setup

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project?s SQL Editor. The table is private to the server-side service role.
2. In Vercel ? Project Settings ? Environment Variables, set these for each environment you deploy:
   - `SUPABASE_URL`: your Supabase project URL (or use `SUPABASE_REST_URL` ending in `/rest/v1`). Existing `VITE_SUPABASE_URL` is also accepted.
   - `SUPABASE_SECRET_KEY`: your Supabase secret or legacy service-role key. Never prefix this key with `VITE_`.
   - `WORKSPACE_PASSWORD`: a long, unique password shared with authorized workspace users.
3. Deploy or redeploy. Build command: `npm run build`; output: `dist`. `vercel.json` supplies these settings. Open the deployment and enter the workspace password.

The publishable Supabase key is not required. Database secrets are used only by the Vercel Function. The workspace password is kept in memory and must be re-entered after reloading. Everyone with that password can read and edit the entire affiliate workbook.

## Data behavior

On the first successful connection to an empty database, the current browser?s existing workbook is migrated if available; otherwise the included workbook seeds the database. After that, Supabase is the source of truth on each login. Updates are debounced, serialized, and saved with a revision check. A concurrent edit produces a conflict instead of overwriting another user?s work; export your pending edits before reloading and reconciling them. Reload to see other users? changes; live subscriptions are not enabled.

Browser storage holds a best-effort local backup, but is never reported as a successful database save. Failed saves show an error and a retry button. CSV/JSON export remains available. Navigating away while changes are pending triggers the browser?s unsaved-changes prompt.

## Local development and validation

Copy `.env.example` to `.env.local` and fill in the values. Use `npx vercel dev` to serve both Vite and the Vercel API route. `npm run dev` alone serves only the frontend and cannot connect the workspace API.

```sh
npm install
npm run build
npm run lint
node --test tests/workbook.test.mjs
```

Before production use, verify the deployed URL by changing a cell, waiting for ?Saved to database?, and reopening in a second browser. SQL setup and a live deployment are required for this end-to-end check.
