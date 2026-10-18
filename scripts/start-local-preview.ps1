$ErrorActionPreference = "Stop"
$env:XDG_CONFIG_HOME = Join-Path $PSScriptRoot "..\.wrangler\xdg"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path $bundledNode) { $bundledNode } else {
  throw "Node.js 22 or newer is required."
}
$wrangler = Join-Path $PSScriptRoot "..\node_modules\wrangler\bin\wrangler.js"

& $node $wrangler pages dev dist `
  --ip 127.0.0.1 `
  --port 8788 `
  --d1 DB `
  --kv RESUME_FILES `
  --binding "PUBLIC_BASE_URL=http://127.0.0.1:8788" `
  --binding "TURNSTILE_SITE_KEY=1x00000000000000000000AA" `
  --binding "TURNSTILE_SECRET=1x0000000000000000000000000000000AA" `
  --binding "RESUME_KV_KEY=local-test-resume" `
  --binding "RATE_LIMIT_SALT=local-test-rate-salt" `
  --binding "ADMIN_SESSION_SECRET=local-test-session-secret" `
  --log-level error `
  --show-interactive-dev-session=false
