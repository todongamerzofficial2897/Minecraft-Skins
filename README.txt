TODON MINECRAFT SKINS — GITHUB PAGES + SUPABASE SETUP GUIDE
==============================================================

HOW THIS WORKS
---------------
- index.html         -> your actual website. GitHub Pages serves this.
- supabase-schema.sql -> creates the database tables (run once).
- supabase/functions/api/index.ts -> the secure backend logic (upload,
  list, delete). Runs on Supabase's servers, not in the browser, so your
  secret code and storage keys are never exposed to visitors.

Everything is free, no credit card needed anywhere. The one real limit:
Supabase's free plan caps individual files at 50MB.

-----------------------------------------------------------------
PART 1 — Create your Supabase project
-----------------------------------------------------------------
1. Go to https://supabase.com and sign up / log in (no card needed).
2. Click "New Project". Pick any name, set a database password (save
   it somewhere), pick the region closest to you, click "Create".
   Wait ~1-2 minutes for it to finish setting up.

3. In the left sidebar, click "SQL Editor" -> "New query".
   Open supabase-schema.sql from this folder, copy ALL of it, paste
   it into the editor, and click "Run". You should see "Success".

4. In the left sidebar, click "Storage" -> "Create a new bucket".
     Name: skins
     Public bucket: ON (toggle it on)
   Click "Create bucket".
   Click into the "skins" bucket -> the gear/settings icon ->
   set "File size limit" to 50 MB. Save.
   (You do NOT need to add any Storage policies — only the backend
   function will write here, using a key that bypasses policies.)

5. In the left sidebar, click "Project Settings" (gear icon) -> "API".
   You'll need two values from this page in Part 3:
     - "Project URL" (looks like https://xxxxxxxx.supabase.co)
     - "anon public" key (a long string under "Project API keys")
   Keep this tab open, you'll copy these in a minute.

-----------------------------------------------------------------
PART 2 — Deploy the backend function
-----------------------------------------------------------------
The function code lives in supabase/functions/api/index.ts. You can
deploy it either through the dashboard (no install needed) or the CLI.

OPTION A — Dashboard (easiest, no installs)
1. In the left sidebar, click "Edge Functions" -> "Create a new function".
2. Name it exactly: api
3. Delete whatever starter code is shown, then open
   supabase/functions/api/index.ts from this folder, copy ALL of it,
   and paste it into the editor.
4. Click "Deploy".
5. Go to "Edge Functions" -> "api" -> "Settings" (or "Secrets", naming
   varies slightly by dashboard version) and add a secret:
     Name: UPLOAD_SECRET
     Value: 2308          (or whatever code you want to require for uploads)
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are usually already
   available to every function automatically — you don't need to set
   those yourself. If the function errors complaining it can't find
   them, add them manually from Project Settings -> API (use the
   "service_role" key, NOT the anon key, for SUPABASE_SERVICE_ROLE_KEY).

OPTION B — Command line (if you'd rather script it)
   npm install -g supabase
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase functions deploy api
   supabase secrets set UPLOAD_SECRET=2308

-----------------------------------------------------------------
PART 3 — Connect index.html to your project
-----------------------------------------------------------------
Open index.html in a text editor and find this block near the top of
the big <script> section:

    const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
    const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
    const UPLOAD_SECRET_CODE = "2308";

Replace the first two with the "Project URL" and "anon public" key you
copied in Part 1, step 5. Set UPLOAD_SECRET_CODE to the SAME value you
set as the UPLOAD_SECRET secret in Part 2 — these must match, or the
upload gate will reject the correct code.

-----------------------------------------------------------------
PART 4 — Push to GitHub Pages
-----------------------------------------------------------------
1. Create a new GitHub repository (or use an existing one).
2. Add index.html to the repo (via git, or drag-and-drop on github.com
   -> "Add file" -> "Upload files"). You do NOT need to upload the
   supabase/ folder or the .sql file to GitHub — those already did
   their job in Supabase and GitHub Pages ignores them anyway.
3. In the repo, go to Settings -> Pages. Under "Source", choose the
   branch (usually "main") and folder ("/" root). Save.
4. GitHub gives you a URL like https://yourusername.github.io/reponame/
   — wait a minute or two after the first save, then visit it.

-----------------------------------------------------------------
TESTING
-----------------------------------------------------------------
1. Visit your GitHub Pages URL. Enter any 4-digit code -> you should
   see "No skin found for that code." (confirms the site can reach
   Supabase for reads).
2. Tap "Upload Here", enter your secret code, upload a small test
   image as both the preview and the download file, pick a 4-digit
   code, click Upload.
3. Go back to the home screen, enter that same code -> you should see
   your test skin and be able to download it.
4. Open the SAME code from a different device or browser (or just a
   private/incognito window) — it should work there too. That's the
   actual fix this whole setup was for.

-----------------------------------------------------------------
IF SOMETHING GOES WRONG
-----------------------------------------------------------------
- "Could not reach the server" on checking a code -> double check
  SUPABASE_URL and SUPABASE_ANON_KEY in index.html are exact, no
  trailing slash on the URL.
- Upload always says "Incorrect secret code" -> make sure
  UPLOAD_SECRET_CODE in index.html matches the UPLOAD_SECRET secret
  set on the Edge Function exactly (case-sensitive).
- Upload fails with a storage error -> confirm the bucket is named
  exactly "skins" and is set to Public.
- A file over 50MB always fails -> that's the free-tier ceiling per
  file, there's no way around it without a paid Supabase plan.
- Upload/list/delete all fail with a 401 Unauthorized (not "Incorrect
  secret code", an actual 401) -> go to Edge Functions -> "api" ->
  Settings and turn OFF "Verify JWT" for this function, then try again.
  This is a Supabase project setting, unrelated to your own secret code.

SECURITY NOTE
-------------
The Edge Function currently allows requests from any website
(Access-Control-Allow-Origin: *). That's fine to get started, but if
you want to lock it down later so only your own GitHub Pages site can
call it, edit the corsHeaders object at the top of
supabase/functions/api/index.ts to your exact Pages URL instead of
"*", then redeploy the function.
