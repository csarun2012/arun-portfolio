# Resume update, Git push, and deployment guide

Use PowerShell in `D:\Software\Arun-Portfolio-Website` on this configured
computer. Replace the example branch name and commit message for each update.

## 1. Start from the latest main and create a branch

```powershell
cd D:\Software\Arun-Portfolio-Website
git status
git switch main
git pull --ff-only origin main
git switch -c update-resume-november-2026
```

If `git status` shows unfinished changes, finish or save those before switching
branches. Use a new branch name each time, such as `update-resume-december-2026`.

## 2. Replace the local PDF

Replace this file, keeping the exact filename:

```text
D:\Software\Arun-Portfolio-Website\assets\CV\Arun_CS_Staff_Software_Engineer_Resume.pdf
```

Open the PDF to confirm the content and layout. Close the PDF editor after saving.
The source PDF is ignored by Git, so it will not appear in `git status`.

## 3. Run the project checks

```powershell
pnpm run check
```

Continue when the tests, build, and implementation validation pass. If PowerShell
blocks `pnpm.ps1`, use `pnpm.cmd` in place of `pnpm` in every command below.

## 4. Encrypt and commit the resume

```powershell
pnpm resume:commit "Update resume for November 2026"
git status
git show --stat --oneline HEAD
```

The command encrypts the PDF, stages `private-resume/resume.enc.json`, and creates
a commit. It does not stage the plaintext PDF. An unchanged PDF produces no new
resume change; check that you replaced the expected file if Git says there is
nothing to commit.

Review any other changes already staged before running the command: a Git commit
includes all staged files, not only the encrypted resume.

## 5. Push the branch to GitHub

For the first push of this branch:

```powershell
git push -u origin update-resume-november-2026
```

`-u` links your local branch to the remote branch. For additional commits on the
same branch, use:

```powershell
git push
```

If GitHub asks you to sign in, complete the normal authentication prompt.
Pushing a feature branch does not deploy production.

## 6. Create and merge a pull request

1. Open [the repository](https://github.com/csarun2012/arun-portfolio).
2. Select **Compare & pull request**. If the banner is absent, open
   **Pull requests > New pull request**.
3. Set the base branch to `main` and the compare branch to your update branch.
4. Add a clear title and select **Create pull request**.
5. Review **Files changed**. A resume-only update should show the encrypted
   `private-resume/resume.enc.json`. No plaintext PDF or encryption key should appear.
6. Select **Merge pull request**, then **Confirm merge**.

Merging triggers the production workflow. The workflow decrypts the PDF in memory,
uploads it to the existing private KV namespace, verifies the uploaded bytes,
updates the production resume selector, and deploys Pages. Previous KV versions
are retained for rollback. The PDF and encrypted payload stay out of the public
static website output.

## 7. Check the automatic deployment

1. Open [GitHub Actions](https://github.com/csarun2012/arun-portfolio/actions).
2. Select the **Deploy to Cloudflare Pages** run for your merge commit.
3. Wait for **Success**. The job includes tests, the build, and
   **Deploy production to Cloudflare Pages**.
4. If it fails, open the failed step and inspect its logs. Fix the issue before
   assuming the new resume is live. The upload script attempts to restore the
   previous selector if deployment fails.

## 8. Test the live resume

1. Open [the production portfolio](https://aruncs.pages.dev), rather than the preview URL.
2. Select **Request My Resume** and submit a request using an eligible email address.
3. Open the emailed access link and download the resume.
4. Confirm it is the new PDF.

If the old file appears immediately after deployment, allow time for KV
propagation, refresh, and try again.

## 9. Sync your local project after merging

```powershell
git switch main
git pull --ff-only origin main
git branch -d update-resume-november-2026
```

The final command removes the merged local branch. If Git says it is not fully
merged (for example, after a squash merge), leave it in place until you verify
the changes are on `main`.

## Pushing portfolio text, styles, or script changes

Use the same branch, PR, and merge process. After editing, check and stage only
the files you intend to commit. For example:

```powershell
pnpm run check
git diff
git add index.html style.css script.js
git diff --cached --stat
git commit -m "Update portfolio content"
git push -u origin your-branch-name
```

Replace the filenames with the files you actually changed. If you also replaced
the resume PDF, the installed pre-commit hook refreshes the encrypted copy
alongside staged changes. For a resume-only update, use `pnpm resume:commit` as
described above. Do not force-add ignored PDFs or bypass the hook.

## Another computer or a missing encryption key

The local encryption key is stored in Git metadata and is not included in a clone.
Back it up privately in a password manager. On another computer, restore the same
key to the path returned by:

```powershell
git rev-parse --git-path resume-encryption-key
```

Then restore the local source PDF, install dependencies, and install the hook:

```powershell
pnpm install --frozen-lockfile
pnpm resume:setup
```

Keep the key out of source files, terminal commands, screenshots, and Git history.
Do not generate a replacement key unless you are deliberately rotating it and
updating the matching GitHub secret. See
[`private-resume/README.md`](private-resume/README.md) for configuration details.
