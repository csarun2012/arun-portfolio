# GitHub to Cloudflare Pages deployment

The workflow in `.github/workflows/cloudflare-pages.yml` deploys the existing
Cloudflare Pages project whenever a commit reaches `main`. It runs the complete
test, build, and validation suite before deployment.

## Required GitHub configuration

In the GitHub repository, open **Settings > Secrets and variables > Actions**.

Add these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`: the ID of the Cloudflare account that owns the Pages project.
- `CLOUDFLARE_API_TOKEN`: a scoped Cloudflare API token with **Account > Cloudflare Pages > Edit** permission for that account.
- `CLOUDFLARE_RESUME_API_TOKEN`: a separate token with **Cloudflare Pages > Edit**
  and **Workers KV Storage > Edit**, restricted to the portfolio account.
- `RESUME_ENCRYPTION_KEY`: the existing local 64-character hexadecimal key from
  Git metadata, used to decrypt the encrypted resume in memory.

Add this repository variable:

- `CLOUDFLARE_PAGES_PROJECT_NAME`: the exact name of the existing Direct Upload Pages project.

Do not place any of these values in source files or commit them to Git.

## Deployment behavior

- Pull requests and feature branches do not deploy.
- A push or merged pull request to `main` runs `pnpm run check`.
- Deployment only starts if the tests, static build, and validation all pass.
- A manual production run is available from the workflow's **Run workflow** button.

The deployment uses Wrangler, so it publishes both the `dist` assets and the
Pages Functions under `functions/` to the existing project. Existing bindings,
environment variables, secrets, and custom domains remain attached to that
Cloudflare Pages project.

Before Wrangler deploys, `scripts/deploy-private-resume.mjs` authenticates the
encrypted PDF, uploads and verifies a private version in the existing KV
namespace, and updates only the production resume selector. It restores the
previous selector if deployment fails and retains previous KV values. See
[`private-resume/README.md`](private-resume/README.md) for the update command and
private key backup instructions. Configure all secrets before merging the
automation workflow.
