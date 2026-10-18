# Private resume automation

Only `resume.enc.json`, encrypted with AES-256-GCM, belongs in this directory.
Never add the source PDF or the encryption key to Git. The build copies neither
this directory nor `assets/CV` into the public `dist` output.

## Updating on this computer

1. Replace `assets/CV/Arun_CS_Staff_Software_Engineer_Resume.pdf`.
2. Create a branch and run `pnpm resume:commit "Update resume"`. This encrypts,
   stages, and commits the replacement in one command.
3. Push, create a PR, and merge it into `main`.

The production workflow authenticates and decrypts the PDF in memory, uploads
it to a private versioned KV key, verifies the downloaded bytes, updates only
the production resume selector, and deploys Pages. Previous KV values remain
available for rollback. Feature branches and PRs never upload to production.
If deployment fails, the previous selector is restored. Production jobs run
serially without cancelling a deployment halfway through.

The PDF is ignored, so Git does not show it as changed. The commit command
prepares the encrypted file before Git checks for staged changes, including
when the PDF is the only local change. The pre-commit hook also refreshes the
encrypted copy alongside ordinary staged edits and rejects plaintext PDFs.
Do not skip the hook with `--no-verify`. `pnpm resume:prepare` followed by normal
Git staging and commit is the explicit alternative for graphical editors.

## One-time setup and another computer

Run `pnpm resume:setup`. This installs `.githooks/pre-commit` through the local
Git configuration. On the initial setup only, it generates a random key inside
Git metadata at the path returned by `git rev-parse --git-path resume-encryption-key`.
Keep a private backup of this key in a password manager. GitHub stores the same
value as the encrypted Actions secret `RESUME_ENCRYPTION_KEY`.

On another computer, restore the exact existing key into that Git metadata
path before running setup. The tool refuses to create a replacement key when
an encrypted resume already exists. GitHub's web editor cannot encrypt a PDF;
prepare resume commits on a configured computer.

Required repository secrets:

- `RESUME_ENCRYPTION_KEY`: the 32-byte key encoded as 64 hexadecimal characters.
- `CLOUDFLARE_RESUME_API_TOKEN`: Cloudflare Pages Edit and Workers KV Storage Edit,
  limited to the account containing this portfolio. The upload script discovers
  the existing namespace through the production `RESUME_FILES` binding.
- Existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` remain in use.

The existing variable `CLOUDFLARE_PAGES_PROJECT_NAME` selects the project.
Do not paste secrets into commands, commit messages, issues, or source files.

The encrypted payload and its file size are visible in this public repository;
the PDF contents are protected by the key. Anyone with the key can decrypt
encrypted versions in Git history. Keep the key private and do not publish
workflow artifacts containing decrypted bytes. Rotate with deliberate
re-encryption and a matching GitHub secret update if the key is exposed.
