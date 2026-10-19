# How to Update the Private Resume

For the everyday branch, commit, push, PR, and deployment steps, use
[`RESUME_UPDATE_GUIDE.md`](RESUME_UPDATE_GUIDE.md).

For the automated encrypted Git workflow, see
[`private-resume/README.md`](private-resume/README.md). The steps below remain
the manual fallback; do not run both procedures for the same update.

This is the standalone maintenance runbook for replacing the resume served by
`https://aruncs.pages.dev`.

Follow the steps in order. Do not overwrite or delete the currently working KV
value until the replacement has passed Preview and Production testing.

## What this procedure changes

This procedure:

- uploads a new PDF to the existing Workers KV namespace
  `aruncs-resume-files`;
- keeps the PDF private;
- switches Preview first and Production second;
- continues using the existing Pages project `aruncs`;
- preserves the old KV value for rollback.

It does **not** require:

- source-code changes;
- a D1 migration;
- new Gmail credentials;
- a new Turnstile widget;
- a new Pages project;
- R2, billing, or a paid Cloudflare plan.

## Important rules

1. Keep the source PDF outside `D:\Software\Arun-Portfolio-Website`.
2. Never copy the PDF into `dist`, `assets`, or another website folder.
3. Never put the KV key in source code, a text file in the repository, a
   terminal command literal, chat, email, or a screenshot.
4. Store current and previous KV keys in a password manager.
5. Use the existing KV namespace, binding, and Pages project.
6. Test Preview before changing Production.
7. Keep the previous PDF and KV value until Production is verified.
8. Do not click **Upgrade**, **Start trial**, or enable R2.

Workers KV is available on the Free plan. The current limits include a 25 MiB
maximum value size, 1,000 writes per day, and 1 GB of included KV storage.
Cloudflare can take approximately 60 seconds or longer to propagate a KV change
to every location. See the official
[KV limits](https://developers.cloudflare.com/kv/platform/limits/),
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), and
[KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

## Values used by this website

| Item | Existing value |
| --- | --- |
| Pages project | `aruncs` |
| Production URL | `https://aruncs.pages.dev` |
| Preview branch | `resume-request-preview` |
| Preview URL | `https://resume-request-preview.aruncs.pages.dev` |
| KV namespace | `aruncs-resume-files` |
| Pages KV binding | `RESUME_FILES` |
| Key-selection variable | `RESUME_KV_KEY` |
| Build output | `dist` |

The namespace ID and `RESUME_KV_KEY` value are intentionally not written in
this document.

## One-time safety cleanup

A file named `aruncs RESUME_KV_KEY.txt` currently exists in the website folder.
Do not open, print, commit, or share it.

Before the next update:

1. Confirm the current key is saved in your password manager.
2. Move that text file to a private encrypted location outside the website
   folder, or delete it after confirming the password-manager copy.
3. Confirm no file containing `RESUME_KV_KEY` remains under
   `D:\Software\Arun-Portfolio-Website`.

This cleanup does not affect the live website because Pages deploys `dist`, and
the live value is configured directly in Cloudflare.

## Step 1 — Prepare the replacement PDF

1. Export the final resume as a PDF.
2. Save it in a private location outside the website repository, for example:

   ```text
   D:\Private\Resume\Arun-CS-Staff-Software-Engineer-Resume-2026-08.pdf
   ```

3. Open the PDF locally and inspect every page.
4. Confirm links, dates, spelling, page breaks, fonts, and selectable text.
5. Keep a second private backup.
6. Close any application that may still be writing to the PDF.

Do not remove the previous private PDF.

## Step 2 — Open PowerShell in the website folder

Open PowerShell and run:

```powershell
Set-Location "D:\Software\Arun-Portfolio-Website"
node --version
pnpm.cmd exec wrangler --version
pnpm.cmd exec wrangler whoami
```

Expected:

- Node is version 22 or newer;
- Wrangler is available (this project currently pins `4.114.0`);
- `whoami` shows the Cloudflare account that owns the existing `aruncs`
  project.

If dependencies are missing, run:

```powershell
pnpm.cmd install --frozen-lockfile
```

Do not initialize or create a new Worker or Pages project.

## Step 3 — Validate the local PDF

Enter the PDF path only when PowerShell prompts for it:

```powershell
$pdfPath = Read-Host "Full path to the replacement PDF"

if (-not (Test-Path -LiteralPath $pdfPath -PathType Leaf)) {
  throw "PDF file not found."
}

$pdf = Get-Item -LiteralPath $pdfPath
if ($pdf.Extension -ne ".pdf") {
  throw "The selected file is not a PDF."
}

if ($pdf.Length -le 0 -or $pdf.Length -ge 25MB) {
  throw "The PDF must be non-empty and smaller than 25 MiB."
}

$pdfHeader = [Text.Encoding]::ASCII.GetString(
  (Get-Content -LiteralPath $pdfPath -Encoding Byte -TotalCount 5)
)
if ($pdfHeader -ne "%PDF-") {
  throw "The file does not have a valid PDF header."
}

$pdf | Select-Object FullName, Length, LastWriteTime
Get-FileHash -LiteralPath $pdfPath -Algorithm SHA256
```

Record the byte size and SHA-256 hash in a private maintenance note. Do not put
the PDF, key, or private note in the repository.

## Step 4 — Find the existing KV namespace ID

Use the Cloudflare dashboard:

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Open **KV**.
4. Select **aruncs-resume-files**.
5. Open **Settings**.
6. Copy the namespace ID.

Return to PowerShell:

```powershell
$namespaceId = Read-Host "KV namespace ID"
if ($namespaceId -notmatch '^[a-fA-F0-9]{32}$') {
  throw "The KV namespace ID format is invalid."
}
```

Do not create another namespace and do not activate R2.

## Step 5 — Save the current key for rollback

In Cloudflare:

1. Open **Workers & Pages → aruncs → Settings → Pages configuration**.
2. Choose the **Production** environment.
3. Under **Variables and secrets**, locate `RESUME_KV_KEY`.
4. Edit the variable and copy its current value directly into your password
   manager under a label such as:

   ```text
   aruncs previous resume KV key — YYYY-MM-DD
   ```

5. Cancel the edit without changing the value.
6. Repeat for **Preview** and confirm it currently uses the same expected key.

Do not paste the key into PowerShell yet, and do not save it in the website
folder.

## Step 6 — Generate a new private KV key

Generate a new 32-byte cryptographically random key in PowerShell:

```powershell
$keyBytes = New-Object byte[] 32
$keyGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$keyGenerator.GetBytes($keyBytes)
$keyGenerator.Dispose()
$newResumeKvKey = ($keyBytes | ForEach-Object { $_.ToString("x2") }) -join ""

$newResumeKvKey | Set-Clipboard
Write-Host "The new KV key is on the clipboard. Save it in your password manager now."
```

Immediately paste it into a new password-manager entry:

```text
aruncs active resume KV key — YYYY-MM-DD
```

Do not print the variable and do not close PowerShell until the upload is
complete.

## Step 7 — Upload the replacement as a private binary KV value

Run:

```powershell
pnpm.cmd exec wrangler kv key put $newResumeKvKey `
  --path="$pdfPath" `
  --namespace-id="$namespaceId" `
  --remote
```

This writes the PDF as binary data. It does not create a public URL.

Expected: Wrangler reports a successful remote write. If it reports an
authentication, file-size, or rate-limit error, stop and fix that error before
continuing. Do not repeatedly upload the same key more than once per second.

In Cloudflare:

1. Open **KV → aruncs-resume-files → KV Pairs**.
2. Search for the new key by pasting it from the password manager.
3. Confirm the key exists.
4. Confirm Cloudflare describes the value as binary/unprintable.
5. If the dashboard shows a size, confirm it matches the local byte size.

Never use **View** to copy the binary value into source code.

Wait at least one minute before testing because Workers KV is eventually
consistent.

## Step 8 — Point Preview to the new key

In Cloudflare:

1. Open **Workers & Pages → aruncs → Settings → Pages configuration**.
2. Choose **Preview**.
3. Under **Variables and secrets**, edit `RESUME_KV_KEY`.
4. Paste the new key directly from the password manager.
5. Save.
6. Confirm:
   - `RESUME_FILES` is still bound to `aruncs-resume-files`;
   - `DB` is still present;
   - no other variable, secret, or binding changed.

Cloudflare applies this variable change to the next Preview deployment.

## Step 9 — Build and deploy Preview

Run the complete local check:

```powershell
pnpm.cmd run check
```

Expected:

- all tests pass;
- `dist` is rebuilt;
- validation confirms there is no public PDF or secret-bearing frontend output.

Confirm again that `dist` contains no PDF:

```powershell
$publicPdfs = Get-ChildItem -LiteralPath ".\dist" -Recurse -File -Filter "*.pdf"
if ($publicPdfs) {
  $publicPdfs
  throw "Stop: a PDF exists in the public deployment output."
}
Write-Host "No PDF exists in dist."
```

Deploy only to the existing Preview branch:

```powershell
pnpm.cmd exec wrangler pages deploy dist `
  --project-name="aruncs" `
  --branch="resume-request-preview"
```

Expected:

- Wrangler says the deployment completed;
- the alias remains
  `https://resume-request-preview.aruncs.pages.dev`;
- no new Pages project is created.

## Step 10 — Test Preview end to end

Use a non-IBM email address that you control.

1. Open `https://resume-request-preview.aruncs.pages.dev`.
2. Hard refresh the page.
3. Open **Get My Resume**.
4. Complete Turnstile and submit one request.
5. Confirm the requester email arrives.
6. Confirm the separate admin email arrives.
7. Open the temporary access link.
8. Confirm opening the page does not download automatically.
9. Select **Download Resume** once.
10. Open the downloaded PDF and confirm it is the replacement version.
11. Confirm the PDF is complete and readable.
12. Open the admin dashboard and confirm the request and delivery record.
13. Confirm the download count is `1 / 3`.

If the previous PDF appears, wait another minute, hard refresh, and perform a
new controlled request. KV propagation may not be immediate. Do not change
Production until Preview delivers the correct PDF.

## Step 11 — Point Production to the new key

Only continue after Preview succeeds.

In Cloudflare:

1. Open **Workers & Pages → aruncs → Settings → Pages configuration**.
2. Choose **Production**.
3. Edit `RESUME_KV_KEY`.
4. Paste the same new key used by Preview.
5. Save.
6. Confirm:
   - `RESUME_FILES` still points to `aruncs-resume-files`;
   - `DB` is still present;
   - the five non-secret variables and seven secrets are still present;
   - no other setting changed.

Cloudflare applies the new variable to the next Production deployment.

## Step 12 — Deploy Production

Run the checks again:

```powershell
pnpm.cmd run check
```

Deploy to the existing production branch:

```powershell
pnpm.cmd exec wrangler pages deploy dist `
  --project-name="aruncs" `
  --branch="main"
```

Do not run `wrangler pages project create`.

Save the immutable deployment URL printed by Wrangler in your private
maintenance note. It provides a record of which deployment activated the new
key.

## Step 13 — Verify Production

1. Open `https://aruncs.pages.dev` in a private/incognito window.
2. Hard refresh.
3. Confirm the portfolio and all unrelated sections load normally.
4. Open the resume dialog from each of its three buttons.
5. Submit one controlled request using a non-IBM email address.
6. Confirm requester and admin emails arrive.
7. Open the seven-day access link.
8. Select **Download Resume**.
9. Open the PDF and confirm it is the new version.
10. Confirm the admin dashboard records the request and delivery.
11. Confirm an IBM address is rejected with:

    ```text
    This email domain is not eligible for resume delivery. Please use another email address.
    ```

12. Confirm each old public URL redirects to the request dialog instead of
    returning a PDF:

    ```text
    https://aruncs.pages.dev/assets/CV/Arun-CS-Staff-Software-Engineer-Resume.pdf
    https://aruncs.pages.dev/assets/CV/Arun-CS-Staff-Software-Engineer-Resume_Faang.pdf
    https://aruncs.pages.dev/assets/CV/Arun-CS-Staff-Software-Engineer-Resume_old.pdf
    ```

Note: changing `RESUME_KV_KEY` changes the file delivered by all still-valid
access tokens because the file key is read at download time.

## Roll back if the replacement is wrong

Do not delete the previous KV value.

1. Retrieve the previous key from your password manager.
2. In Cloudflare Preview, restore the previous `RESUME_KV_KEY`.
3. Deploy the Preview branch again:

   ```powershell
   pnpm.cmd exec wrangler pages deploy dist `
     --project-name="aruncs" `
     --branch="resume-request-preview"
   ```

4. Confirm Preview delivers the previous PDF.
5. In Cloudflare Production, restore the previous `RESUME_KV_KEY`.
6. Deploy Production again:

   ```powershell
   pnpm.cmd exec wrangler pages deploy dist `
     --project-name="aruncs" `
     --branch="main"
   ```

7. Confirm `https://aruncs.pages.dev` delivers the previous PDF through a new
   controlled request.

The rollback does not require re-uploading the old PDF while its KV value still
exists.

## Optional cleanup after successful production verification

Recommended: retain the previous KV value for at least seven days. It consumes
only its PDF size from the Free plan's included KV storage.

After the retention period:

1. Confirm the replacement is still correct in Production.
2. Confirm the old PDF remains backed up privately outside the website folder.
3. Retrieve the **previous** key from your password manager.
4. Carefully compare it with the active key and confirm they are different.
5. Enter the previous key only when prompted:

   ```powershell
   $oldResumeKvKey = Read-Host "Previous KV key to delete"
   if ($oldResumeKvKey -eq $newResumeKvKey) {
     throw "Stop: this is the active key."
   }

   pnpm.cmd exec wrangler kv key delete $oldResumeKvKey `
     --namespace-id="$namespaceId" `
     --remote
   ```

Deleting a KV value is irreversible. Never delete a key unless Production has
been verified and the exact target is known.

After cleanup, keep both the current PDF backup and current key in secure
private storage.

## Troubleshooting

### Wrangler cannot find the command

Run commands from:

```text
D:\Software\Arun-Portfolio-Website
```

Use `pnpm.cmd`, not `pnpm`, if PowerShell blocks `pnpm.ps1`.

### Wrangler is not authenticated

Run:

```powershell
pnpm.cmd exec wrangler login
pnpm.cmd exec wrangler whoami
```

Confirm the account owns `aruncs` before continuing.

### `Namespace ID set: false`

The PowerShell variable is empty or was set in another terminal window. Set it
again:

```powershell
$namespaceId = Read-Host "KV namespace ID"
[string]::IsNullOrWhiteSpace($namespaceId)
```

The last command must return `False`.

### Upload succeeds but the old PDF downloads

Check:

1. the new key exists in `aruncs-resume-files`;
2. Preview or Production `RESUME_KV_KEY` exactly matches that key;
3. the environment selector was set correctly;
4. a deployment occurred after changing the variable;
5. at least one minute has passed for KV propagation;
6. the test used a newly generated access link.

### The resume is temporarily unavailable

Confirm:

- `RESUME_FILES` is still bound to `aruncs-resume-files`;
- `RESUME_KV_KEY` contains no spaces or line breaks;
- the corresponding KV pair exists and is non-empty;
- the uploaded file is a binary PDF below 25 MiB.

If necessary, roll back to the previous key.

### The deployment command offers to create a project

Cancel immediately. Confirm:

- the project name is exactly `aruncs`;
- Wrangler is logged into the correct Cloudflare account;
- the command includes `--project-name="aruncs"`.

Never create a replacement Pages project.

### Gmail or Turnstile fails during testing

Replacing the PDF does not require changing Gmail or Turnstile credentials.
Check the existing Pages variables/secrets and `CLOUDFLARE_RESUME_SETUP.md`.
Do not rotate credentials merely because the PDF changed.

## Completion checklist

- [ ] New PDF is privately backed up outside the repository.
- [ ] PDF is valid and smaller than 25 MiB.
- [ ] Current KV key is saved for rollback.
- [ ] New random KV key is saved in a password manager.
- [ ] New PDF is uploaded as binary to `aruncs-resume-files`.
- [ ] Preview variable is changed and Preview is redeployed.
- [ ] Preview email and download deliver the new PDF.
- [ ] Production variable is changed and Production is redeployed.
- [ ] Production email and download deliver the new PDF.
- [ ] Admin dashboard records the controlled test.
- [ ] Old public PDF URLs redirect and never return a PDF.
- [ ] No PDF or KV key exists in the website repository or `dist`.
- [ ] Previous KV value and private PDF are retained for rollback.

The update is complete only after every applicable item above is checked.
