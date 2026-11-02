# Dharma Affiliates

Deploy this repository to **Vercel** using the Vite preset. The React frontend and `/api/workbook` Vercel Function deploy together. No Express server, separate backend host, or always-running process is needed. Supabase hosts the persistent database.

## One-time setup

1. Run [`supabase/setup-and-import.sql`](supabase/setup-and-import.sql) in your Supabase project?s SQL Editor. This includes the table schema and every record from the supplied Excel workbook. It does not replace an existing workbook. The table is private to the server-side service role.
2. In Vercel ? Project Settings ? Environment Variables, set these for each environment you deploy:
   - `VITE_SUPABASE_URL`: your Supabase project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the public publishable key from that project.
   - `SUPABASE_SECRET_KEY`: your server-only secret or legacy service-role key. Never prefix it with `VITE_`.
   - Optional `AFFILIATE_ALLOWED_EMAILS`: comma-separated emails permitted to access this workspace. Without an allowlist, all verified, non-anonymous Supabase users in this project have workspace access.
3. In Supabase Authentication ? Users, create or invite workspace accounts. Existing email/password accounts can sign in immediately. For an invite-only workspace, disable new user signups under Authentication ? Sign In / Providers. The application provides sign-in only.
4. Deploy or redeploy. Build command: `npm run build`; output: `dist`. `vercel.json` supplies these settings. The sign-in page uses Supabase email/password authentication. `WORKSPACE_PASSWORD` is no longer used and can be removed.

Supabase manages persistent sessions and automatic access-token refresh. Each Vercel API request verifies its bearer token against Supabase Auth before using the privileged database key. Anonymous users and accounts without a confirmed email are rejected. The optional email allowlist is enforced on the server. The database table remains inaccessible to direct browser requests; no SQL migration is needed for this authentication change.

The header shows the signed-in email and a Sign out button. Sign-out asks before discarding pending edits and clears the dashboard from memory. Affiliate records are no longer cached in browser storage; the legacy backup is removed on startup. Supabase stores its authentication session in browser storage.

## Data behavior

Supabase is the source of truth on each login; bundled sample data and browser backups are never uploaded automatically. All nine Excel sheets are imported (585 records). Current Affiliates, GOOD, and BAD REVIEW appear in the main navigation. Additional imported sheets are retained in the database and hidden from navigation for now. GOOD and FUTUREPOSSIBLE Affiliates are empty in the source. Samples has no header row, so its columns use Excel letters and its first row remains a data record.

Original typed cell values, formats, source row numbers, formulas, and cached formula results are retained as source metadata inside each sheet/record. The table displays editable text values. Source metadata records the original Excel import and is not recalculated when dashboard cells change. Blank formatting-only rows are excluded. `supabase/import-report.json` lists the source checksum and per-sheet counts.

Updates are debounced, serialized, and saved with a revision check. A concurrent edit produces a conflict instead of overwriting another user?s work; export your pending edits before reloading and reconciling them. Reload to see other users? changes; live subscriptions are not enabled.

Failed saves show an error and a retry button. CSV/JSON export remains available. Navigating away while changes are pending triggers the browser?s unsaved-changes prompt.

## Local development and validation

Copy `.env.example` to `.env.local` and fill in the values. Use `npx vercel dev` to serve both Vite and the Vercel API route. `npm run dev` alone serves only the frontend and cannot connect the workspace API.

```sh
npm install
npm run build
npm run lint
node --test tests/*.test.mjs
```

Before production use, verify the deployed URL by changing a cell, waiting for ?Saved to database?, and reopening in a second browser. SQL setup and a live deployment are required for this end-to-end check.

## Repeatable Excel import

The empty GOOD sheet was subsequently reconstructed from the user-provided screenshot: 41 visible affiliates in screenshot order, matched against Current Affiliates for their name, phone, GMV, and status values. These values reflect the original Excel snapshot, so their formatting or content may differ from the screenshot. The original Excel import files remain unchanged. The reconstruction is saved separately in `supabase/good-reconstruction.json` and is already applied to the configured database.

For a new project, run `supabase/setup-and-import.sql`, then `supabase/restore-good.sql`. The latter populates only an empty GOOD sheet and increments the workbook revision. It preserves all other sheets and skips a nonempty GOOD tab. The database now has 626 records in total, including these 41 reconstructed GOOD records. Refresh an existing dashboard session after running the migration.

`node --env-file=.env.local scripts/restore-good.mjs` can reproduce and verify the reconstruction against matching Current Affiliates records. It refuses to replace a nonempty GOOD tab with different contents.

The existing `affiliate_workbooks` table stores the complete workbook as JSONB with a revision for conflict detection. `supabase/schema.sql` contains only the schema; `supabase/setup-and-import.sql` includes both schema and all data. Both use the same structure consumed by `/api/workbook`.

To regenerate the SQL and import payload from the source Excel file (requires Python with openpyxl):

```powershell
python scripts/extract_affiliates.py "C:/Users/jeuzv/Downloads/Affiliate - Uptadate tiktok (1).xlsx"
node --env-file=.env.local scripts/import-affiliates.mjs
```

The importer inserts only if the workbook is absent, then retrieves it and verifies every extracted value and source metadata field. It refuses to overwrite a differing workbook. Run the complete SQL in the Supabase SQL Editor to initialize a different project without running the importer.
