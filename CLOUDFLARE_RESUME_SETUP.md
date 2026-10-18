# Secure Resume Request Setup

This guide configures the existing `aruncs.pages.dev` Cloudflare Pages project. It does not create a replacement site, use R2, require a custom domain, or enable a paid Cloudflare plan.

Complete the stages in order. Stop after each stage and verify it before continuing. Never paste a password, OAuth token, client secret, Turnstile secret, or Cloudflare secret into chat or source control.

## Architecture

- Static public portfolio assets are built into `dist/`.
- Pages Functions live in `functions/` and are bundled by Wrangler.
- `POST /api/resume/request` validates the form and Turnstile, rate-limits salted email/IP hashes, writes D1 first, then sends separate requester/admin Gmail messages.
- Requests using `@ibm.com` or any `.ibm.com` subdomain are rejected in both the browser and the Pages Function before Turnstile, D1, or Gmail processing. IBM may still be entered as the company when a non-IBM email address is used.
- The email link is `/resume-access/#token=<random-token>`. The fragment is removed from the address bar immediately.
- `POST /api/resume/access` records page activity without consuming a delivery.
- `POST /api/resume/download` atomically claims one of three deliveries and returns the private KV PDF.
- `/admin/resume-requests/` uses Turnstile, PBKDF2-SHA-256, a signed one-hour `HttpOnly; Secure; SameSite=Strict` cookie, and server-authorized admin APIs.
- The build excludes the whole `assets/CV/` directory. `_redirects` sends each former PDF URL to `/#request-resume`.

The access-page event means only “Access page opened.” It can include automated scanners and does not prove a human viewed the page. “Download delivered” means the server returned the PDF response; it does not prove the browser saved the file. A forwarded link remains associated with the original requester.

## Verified free-plan guardrails (24 July 2026)

Recheck these official pages before configuration if significant time has passed.

| Service | Relevant free allowance | Behaviour at the limit |
| --- | --- | --- |
| Pages Functions / Workers Free | 100,000 dynamic requests/day, shared with Workers; 10 ms CPU/request with limited burst tolerance. Static asset requests are free and unlimited. | Requests or CPU-bound invocations fail; no automatic paid overage on Workers Free. |
| Workers KV | 100,000 reads/day; 1,000 writes/day; 1,000 deletes/day; 1,000 list operations/day; 1 GB stored; 25 MiB per value. | Further operations of the exhausted type fail until the daily reset. |
| D1 | 5 million rows read/day; 100,000 rows written/day; 5 GB total account storage; 500 MB/database; 10 databases on Free. | Queries/writes fail when daily or storage limits are reached. |
| Turnstile Free | Up to 20 widgets; unlimited challenges; 10 hostnames/widget. | No metered challenge charge. |
| Gmail API | `messages.send` costs 100 quota units. This implementation uses 200 units per successful request (requester + admin). Standard use is currently no additional cost below Google’s threshold. | Quota errors stop sends. Do not attach a billing account; if Google asks for billing, stop. Google has announced that above-threshold charges may begin later in 2026 with notice. |

Official references:

- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers KV limits and pricing](https://developers.cloudflare.com/kv/platform/limits/)
- [D1 limits and pricing](https://developers.cloudflare.com/d1/platform/limits/)
- [Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/)
- [Gmail API quota and pricing](https://developers.google.com/workspace/gmail/api/reference/quota)

Do not activate Workers Paid, R2, paid Queues, paid Zero Trust, or a billing-enabled Cloudflare subscription. If any dashboard step presents an upgrade, payment method, or billing confirmation, cancel and stop.

## Configuration names

### Bindings

- D1: `DB`
- Workers KV: `RESUME_FILES`

### Non-secret variables

- `PUBLIC_BASE_URL=https://aruncs.pages.dev`
- `RESUME_KV_KEY=<private random KV key>`
- `GMAIL_FROM_EMAIL=csarun.careers@gmail.com`
- `ADMIN_EMAIL=csarun.careers@gmail.com`
- `TURNSTILE_SITE_KEY=<public production sitekey>`

Treat `RESUME_KV_KEY` as a private identifier even though it is configured as a variable. It must never appear in frontend code.

### Secrets

- `TURNSTILE_SECRET`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `RATE_LIMIT_SALT`

Enter secrets directly into Cloudflare or a local secure prompt. Do not add real values to `.dev.vars.example`, `wrangler.toml.example`, source files, screenshots, tickets, or chat.

## Stage 1 — Existing project and backup

1. Open **Cloudflare dashboard → Workers & Pages**.
2. Select the project whose production URL is `https://aruncs.pages.dev/`.
3. Record the exact project name shown in the dashboard. The subdomain strongly suggests `aruncs`, but confirm rather than assume.
4. Open **Deployments** and identify the current production deployment. Do not change or redeploy it.
5. Confirm the current deployment method:
   - dashboard Direct Upload / drag-and-drop;
   - Wrangler Direct Upload; or
   - Git integration.
6. Optionally confirm from the installed Wrangler 4.114.0 CLI:

   ```powershell
   pnpm exec wrangler pages project list --json
   ```

7. Make a private backup of the active file outside the Pages source/deployment directory:

   `assets/CV/Arun-CS-Staff-Software-Engineer-Resume.pdf`

8. Also decide whether the `_Faang` and `_old` PDFs should be retained in that private backup.
9. Confirm the backup opens as a PDF and is not under `D:\Software\Arun-Portfolio-Website`, `dist/`, or any folder uploaded to Pages.

The active PDF is 39,496 bytes (0.038 MiB), safely below KV’s 25 MiB value limit. The largest archived PDF is 324,335 bytes (0.309 MiB).

Pages dashboard Direct Upload does not support Pages Functions. If the current deployment uses dashboard drag-and-drop, the future deployment method must change to Wrangler Direct Upload while retaining the same Pages project and all existing deployment history.

Expected result: the exact existing project name and deployment method are known; production is unchanged; a verified private resume backup exists outside the deployable tree.

## Stage 2 — Workers KV

Free-plan check: KV is included in Workers Free with the limits listed above. Do not open or activate R2.

1. Open **Cloudflare dashboard → Storage & databases → Workers KV** (the dashboard link may appear simply as **KV**).
2. Select **Create namespace**.
3. Suggested name: `aruncs-resume-files`.
4. Confirm the page shows KV/Workers Free and no billing or upgrade step, then create it.
5. Generate the private key locally without placing it in shell history:

   ```powershell
   $resumeKvKey = Read-Host "Private KV key (use a random UUID or longer random value)"
   ```

   A password manager can generate the value. Do not share it in chat.

6. Upload the active PDF as raw binary. Replace only the namespace ID placeholder; `$resumeKvKey` remains in memory:

   ```powershell
   pnpm exec wrangler kv key put $resumeKvKey `
     --path="assets/CV/Arun-CS-Staff-Software-Engineer-Resume.pdf" `
     --namespace-id="<KV_NAMESPACE_ID>" `
     --remote
   ```

   Wrangler 4.114.0 was checked locally: `kv key put` supports `--path`, `--namespace-id`, and `--remote`.

7. Open the namespace’s **KV Pairs** tab. Confirm the key exists and the value size is 39,496 bytes (or the current PDF’s exact byte size).
8. In **Workers & Pages → existing Pages project → Settings → Bindings → Add → KV namespace**:
   - Variable name: `RESUME_FILES`
   - KV namespace: `aruncs-resume-files`
9. Configure the binding for both Production and Preview environments.
10. Set `RESUME_KV_KEY` as a Pages variable using the same private key, directly in the dashboard.
11. Do not delete the local PDFs yet. First verify that the KV upload is present under the intended key.

Expected result: one private binary KV value exists with no public URL, and the existing Pages project has a `RESUME_FILES` binding.

### Replace the resume later

Follow the standalone [HOW_TO_UPDATE_RESUME.md](HOW_TO_UPDATE_RESUME.md)
runbook. It uploads the replacement under a new private KV key, validates it in
Preview, switches Production only after verification, and preserves the
previous KV value for rollback.

## Stage 3 — D1

Free-plan check: D1 is available on Workers Free. This application’s indexed, paginated queries are designed to remain far below the daily limits for a portfolio site.

1. Open **Cloudflare dashboard → Storage & databases → D1 SQL database**.
2. Select **Create database**.
3. Suggested name: `aruncs-resume-requests`.
4. Optional location hint: Asia Pacific (`apac`).
5. Confirm there is no billing/upgrade prompt, then create it.
6. Copy `wrangler.migrations.toml.example` to the ignored
   `wrangler.migrations.toml`.
7. Replace only `replace-with-d1-database-id` with the database ID shown in
   D1. This migration-only file contains no secret and is never used to deploy
   Pages.
8. List and apply the supplied migration:

   ```powershell
   pnpm exec wrangler d1 migrations list DB --remote `
     --config .\wrangler.migrations.toml
   pnpm exec wrangler d1 migrations apply DB --remote `
     --config .\wrangler.migrations.toml
   ```

9. Verify tables:

   ```powershell
   pnpm exec wrangler d1 execute DB --remote --json `
     --config .\wrangler.migrations.toml `
     --command="SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name;"
   ```

10. Confirm these tables:
    - `resume_requests`
    - `resume_access_events`
    - `admin_login_attempts`
11. Confirm indexes include token hash, normalized email, request date, expiry, idempotency key, hashed email/IP rate-limit paths, events, and admin login attempts.
12. In **Workers & Pages → existing project → Settings → Bindings → Add → D1 database**:
    - Variable name: `DB`
    - Database: `aruncs-resume-requests`
13. Configure the binding for Production and Preview environments.

Expected result: migration `0001_resume_requests.sql` is applied and `DB` is bound to the existing Pages project.

## Stage 4 — Turnstile

Free-plan check: Turnstile Free supports Managed mode, 20 widgets, unlimited challenges, and 10 hostnames/widget.

1. Open **Cloudflare dashboard → Turnstile**.
2. Select **Add widget**.
3. Widget name: `aruncs-resume-request`.
4. Widget mode: **Managed**.
5. Add hostnames without schemes, ports, paths, or wildcards:
   - `aruncs.pages.dev`
   - `localhost`
   - `127.0.0.1`
6. Adding `aruncs.pages.dev` also authorizes its preview subdomains.
7. Do not enable an Enterprise-only “Any Hostname” option.
8. Create the widget.
9. Store the public sitekey as `TURNSTILE_SITE_KEY`.
10. Store the secret directly as the Pages secret `TURNSTILE_SECRET`. Never share it in chat or put it in source.

The backend validates success, the expected action (`resume_request` or `admin_login`), token reuse/expiry through Siteverify, and the exact production/request hostname.

Official local testing keys:

| Scenario | Sitekey | Secret |
| --- | --- | --- |
| Always pass | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always fail | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Replayed/spent token | pass sitekey | `3x0000000000000000000000000000000AA` |

Never use test keys in production. See [Cloudflare’s official testing keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

Expected result: one free Managed widget exists and its public/secret values are stored in the correct Pages variable/secret locations.

## Stage 5 — Google Cloud and Gmail API

Do not attach a billing account. If Google asks for billing to enable the Gmail API, stop before accepting.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project dedicated to this personal resume-mail workflow, for example `aruncs-resume-mail`.
3. Confirm **Billing** shows no billing account attached.
4. Go to **APIs & Services → Library**.
5. Search for **Gmail API**, open it, and select **Enable**.
6. Open **Google Auth Platform → Branding**:
   - App name: `Arun C S Portfolio Resume Request`
   - User support email: `csarun.careers@gmail.com`
   - Developer contact: `csarun.careers@gmail.com`
7. Open **Google Auth Platform → Audience**:
   - User type: External (a personal Gmail account cannot create an Internal Workspace app).
   - Add `csarun.careers@gmail.com` as the test user while initially testing.
8. Open **Google Auth Platform → Data Access → Add or remove scopes**.
9. Add only:

   `https://www.googleapis.com/auth/gmail.send`

   `gmail.send` is a sensitive, send-only scope. Do not add Gmail read, compose, modify, or full-mail scopes.

10. Open **Google Auth Platform → Clients → Create client**.
11. Choose **Web application**.
12. Suggested name: `aruncs-resume-pages-function`.
13. Add this authorized redirect URI:

    `https://developers.google.com/oauthplayground`

14. Create the client. Store the client ID and client secret securely; enter them later directly into Cloudflare secrets.
15. Open the official [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
16. Open its configuration (gear):
    - Enable **Use your own OAuth credentials**.
    - Enter the client ID and client secret directly there.
    - Access type: Offline.
    - Force prompt: Consent Screen.
17. In Step 1, enter only `https://www.googleapis.com/auth/gmail.send`.
18. Select **Authorize APIs** and sign in as `csarun.careers@gmail.com`.
19. If the personal-use app is unverified, Google may show an unverified warning. Confirm the project/client name and exact send-only scope before proceeding.
20. Exchange the authorization code for tokens.
21. Copy the refresh token directly into the Cloudflare `GMAIL_REFRESH_TOKEN` secret. Do not paste it into chat, source, notes, or screenshots.

OAuth Playground normally revokes its own default refresh tokens after 24 hours. Using your own OAuth client avoids that Playground-specific revocation.

### Avoiding seven-day refresh-token expiry

Google states that External apps left in **Testing** issue refresh tokens that expire after seven days when Gmail scopes are used. After the send flow has been verified:

1. In **Google Auth Platform → Audience**, change publishing status to **In production** for this personal-use app.
2. Personal-use apps with fewer than 100 users are not required to complete verification, but the account may see an unverified-app warning during the one-time grant.
3. Keep the audience limited to your own use. The 100-new-user cap is irrelevant to this single-account workflow.
4. Re-authorize with `prompt=consent` after the publishing change to obtain the long-lived refresh token.

Google can still invalidate a refresh token if access is revoked, it is unused for six months, the Gmail password changes in a relevant way, or token limits are exceeded. See [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) and [personal-use verification exemption](https://support.google.com/cloud/answer/13464323).

Expected result: Gmail API is enabled without billing, only `gmail.send` is granted, and Cloudflare holds the client ID, client secret, and refresh token as secrets.

## Stage 6 — Admin security

1. Open a trusted local PowerShell terminal in this project.
2. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-admin-secrets.ps1
   ```

3. Enter a password-manager-generated password of at least 24 characters when prompted. It is not echoed.
4. The script creates:
   - a PBKDF2-SHA-256 password hash with a random salt;
   - a 256-bit HMAC session secret;
   - a 256-bit rate-limit salt.
5. Enter each output directly into the matching Cloudflare Pages secret:
   - `ADMIN_PASSWORD_HASH`
   - `ADMIN_SESSION_SECRET`
   - `RATE_LIMIT_SALT`
6. Clear the terminal after securely storing the admin password in a password manager.

The hash uses 25,000 PBKDF2-SHA-256 iterations to fit the Workers Free 10 ms CPU budget. Security is reinforced by a random 24+ character password, a secret-only hash, Turnstile, a maximum of five failed login attempts per hashed IP per 15 minutes, and one-hour signed sessions. During Stage 8, verify that admin login does not produce Worker CPU limit error 1102.

Expected result: no raw admin password exists in Cloudflare or source; three generated secret values are stored directly in Cloudflare.

## Stage 7 — Pages variables, secrets, and bindings

Open **Workers & Pages → existing `aruncs.pages.dev` project → Settings**.

For both Production and Preview environments, verify the bindings, secrets, and
variables below. Use environment-specific values for `PUBLIC_BASE_URL`:

- Production: `PUBLIC_BASE_URL=https://aruncs.pages.dev`
- Preview branch validation:
  `PUBLIC_BASE_URL=https://resume-request-preview.aruncs.pages.dev`

Cloudflare applies variable changes to the next deployment. Redeploy the
`resume-request-preview` branch after changing its Preview value. Restore or
replace this value if a different preview branch alias is used later.

### Bindings

- `DB` → the D1 database
- `RESUME_FILES` → the KV namespace

### Variables

- `PUBLIC_BASE_URL=<environment-specific URL listed above>`
- `RESUME_KV_KEY=<the private key used for the KV upload>`
- `GMAIL_FROM_EMAIL=csarun.careers@gmail.com`
- `ADMIN_EMAIL=csarun.careers@gmail.com`
- `TURNSTILE_SITE_KEY=<production sitekey>`

### Secrets

- `TURNSTILE_SECRET`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `RATE_LIMIT_SALT`

Cloudflare may mask secrets after saving. That is expected. Do not reveal them to verify them.

Expected result: all names match exactly, Production and Preview are configured, and no secret appears as a plaintext variable.

## Stage 8 — Local or preview validation

Normal tests use mocks and never contact Gmail, Turnstile, D1, or KV:

```powershell
pnpm run check
pnpm exec wrangler pages functions build functions `
  --outdir .wrangler/functions-build `
  --compatibility-date 2026-07-24
```

Expected:

- all automated tests pass;
- the static build is created in `dist/`;
- the validator reports no PDF and no secret-bearing frontend output;
- Pages Functions compile successfully.

For a real integration test, prefer a temporary Pages preview after asking for explicit deployment approval:

```powershell
pnpm run build
pnpm exec wrangler pages deploy dist `
  --project-name="<EXISTING_PROJECT_NAME>" `
  --branch="resume-request-preview"
```

This creates a preview deployment in the existing project; it does not replace production. Test one controlled request with your own email/company details.

Validate:

1. Dialog opens from all three resume controls.
2. Managed Turnstile completes.
3. An `@ibm.com` or subdomain address such as `@us.ibm.com` is rejected, while a non-IBM address remains eligible.
4. D1 gets exactly one request.
5. Gmail accepts the requester message.
6. Only then, Gmail accepts the admin notification.
7. The emailed URL contains `#token=` and the address bar removes it after opening.
8. Opening records access activity but leaves delivery count at zero.
9. Clicking **Download Resume** returns the KV PDF.
10. The fourth delivery attempt is rejected.
11. Expired/invalid links show safe themed errors.
12. Admin login works, requests are searchable/filterable/paginated, and logout clears the session.
13. Unauthorized admin API requests return 401.
14. No credential, raw token, token hash, IP hash, KV key, D1 detail, or internal error appears in frontend source, responses, or logs.
15. Pages Functions metrics show no CPU-limit errors.

Do not place real Gmail credentials in a tracked file. Store preview secrets in the Pages Preview environment or use a secure local secret mechanism outside the repository.

## Stage 9 — Production deployment

Do not run this stage until Stages 1–8 pass and explicit deployment approval is given.

1. Run final checks:

   ```powershell
   pnpm run check
   ```

2. Confirm `dist/` contains no `.pdf` file:

   ```powershell
   Get-ChildItem -Path .\dist -Recurse -File -Filter *.pdf
   ```

   Expected: no output.

3. Record the current production deployment ID/time in the Cloudflare dashboard for rollback.
4. Deploy to the exact existing project:

   ```powershell
   pnpm exec wrangler pages deploy dist `
     --project-name="<CONFIRMED_EXISTING_PROJECT_NAME>" `
     --branch="main"
   ```

Wrangler 4.114.0 was checked locally: `pages deploy [directory]` supports `--project-name`, `--branch`, `--commit-hash`, and `--commit-message`.

If the project’s production branch is not `main`, use the branch shown under the existing Pages project settings. Do not create a new project.

Rollback remains available from the existing project’s deployment history. If verification fails, select the previous known-good production deployment and use the dashboard rollback control.

## Stage 10 — Production verification

1. Open `https://aruncs.pages.dev/` on desktop.
2. Open and close the request dialog using:
   - each of the three resume controls;
   - Escape;
   - backdrop click;
   - the visible close button.
3. Confirm focus returns to the opener and keyboard focus remains inside the open dialog.
4. Repeat at a mobile viewport/device.
5. Submit one real request.
6. Confirm requester email:
   - sender is `Arun C S <csarun.careers@gmail.com>`;
   - subject is `Arun C S — Staff Software Engineer Resume`;
   - no PDF is attached;
   - expiry and three-delivery wording is present.
7. Confirm the separate admin notification contains no raw access token.
8. Open the requester link. Confirm D1/admin shows **Access page opened** and `0 / 3`.
9. Click **Download Resume** once. Confirm the PDF downloads and D1/admin shows **Download delivered** and `1 / 3`.
10. Confirm times display in the browser’s local timezone.
11. Confirm the old public URLs no longer serve PDF bytes:
    - `/assets/CV/Arun-CS-Staff-Software-Engineer-Resume.pdf`
    - `/assets/CV/Arun-CS-Staff-Software-Engineer-Resume_Faang.pdf`
    - `/assets/CV/Arun-CS-Staff-Software-Engineer-Resume_old.pdf`
12. Confirm they redirect to the request flow.
13. Inspect `dist/` and the Pages deployment asset list for any PDF.
14. Verify unrelated navigation, content, contact links, animations, responsive behaviour, and career snapshot still work.
15. Verify `/api/admin/resume-requests` returns 401 when signed out.

Only after the KV value and production flow are verified should the source copies under `assets/CV/` be removed. Retain the private backup outside the deployment directory.

## Reviewing D1 records

Use the private admin dashboard for normal review. If a direct database inspection is needed:

```powershell
pnpm exec wrangler d1 execute DB --remote --json `
  --command="SELECT id, requested_at, expires_at, email_status, download_count, maximum_downloads FROM resume_requests ORDER BY requested_at DESC LIMIT 20;"
```

Do not select or copy `token_hash`, `hashed_requester_ip`, `hashed_email`, Gmail IDs, or internal failure fields unless debugging locally and necessary.

## Credential rotation and revocation

### Gmail

1. Revoke the app in the Google Account security page or delete/disable the OAuth client in **Google Auth Platform → Clients**.
2. Create a new client secret or re-authorize with `prompt=consent`.
3. Replace the matching Cloudflare secrets directly.
4. Delete/disable the old client secret only after a successful test.

### Turnstile

Use **Turnstile → widget → Settings → Rotate Secret Key**. Cloudflare permits an overlap window during rotation. Update `TURNSTILE_SECRET` directly.

### Admin

Re-run `generate-admin-secrets.ps1`. Replacing `ADMIN_SESSION_SECRET` immediately invalidates all existing admin sessions. Replacing `RATE_LIMIT_SALT` changes future rate-limit hashes; existing request records remain intact.

## Troubleshooting

### Turnstile always fails

- Confirm production does not use official test keys.
- Confirm the widget is Managed.
- Confirm hostname entries have no scheme/port/path.
- Confirm `aruncs.pages.dev`, `localhost`, and `127.0.0.1` are present.
- Confirm the frontend action and backend expected action match.
- A `timeout-or-duplicate` response means the token was expired or replayed; reset the widget and retry.

### Gmail `invalid_grant`

- Testing-status refresh tokens with Gmail scopes expire after seven days.
- Access may have been revoked, the token may have been unused for six months, or a password/security change may have invalidated it.
- Confirm the OAuth client ID/secret pair matches the refresh token.
- Re-authorize using offline access and `prompt=consent`, then replace only the Cloudflare refresh-token secret.

### Gmail 403 / insufficient permission

- Confirm Gmail API is enabled in the same Google Cloud project.
- Confirm the granted scope is exactly `https://www.googleapis.com/auth/gmail.send`.
- Do not broaden the scope.
- Confirm the authenticated account is `csarun.careers@gmail.com`.

### D1 errors

- Confirm `DB` is the binding name in both environments.
- Apply migrations to the remote database.
- Check D1 metrics before assuming a code failure; Free limits reset daily at 00:00 UTC.
- Do not upgrade to Paid to bypass a limit. Investigate abusive traffic or indexes first.

### Resume unavailable

- Confirm `RESUME_FILES` is bound.
- Confirm `RESUME_KV_KEY` exactly matches the uploaded key.
- Confirm the value is a non-empty binary PDF below 25 MiB.
- Confirm Production and Preview point to the intended namespace.

### Admin login fails with Worker error 1102

- Check **Workers & Pages → project → Metrics → Errors → Invocation Statuses**.
- Confirm the generated hash uses 25,000 iterations.
- Use a password-manager-generated 24+ character password.
- Do not enable Workers Paid. If CPU remains consistently above the Free limit, stop and review a free-compatible authentication adjustment before changing the architecture.

### Wrangler local server fails

- Confirm Node.js is supported by Wrangler and reinstall dependencies from `pnpm-lock.yaml`.
- Run `pnpm exec wrangler --version`; expected pinned version is `4.114.0`.
- Run the Function compiler separately to distinguish bundling from local-runtime issues.
- Use a preview deployment in the existing Pages project only after explicit approval.

### Old PDF still loads

- Confirm deployment used `dist/`, not repository root.
- Confirm `_redirects` was included.
- Confirm no `.pdf` exists under `dist/`.
- Purge only the old URL from Cloudflare cache if needed; do not expose the KV key or upload the PDF elsewhere.
