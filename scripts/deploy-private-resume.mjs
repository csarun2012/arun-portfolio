import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseKey, decryptPdf } from './resume-crypto.mjs';

export async function deployPrivateResume({ pdf, key, account, project, token, fetchFn = fetch, deploy }) {
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-z0-9][a-z0-9-]*$/.test(project || '') || !token) throw new Error('Missing or invalid Cloudflare deployment configuration.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  async function api(endpoint, { method = 'GET', body, binary = false } = {}) {
    const response = await fetchFn(base + endpoint, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !binary ? { 'Content-Type': 'application/json' } : {}) }, body: body ? (binary ? body : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Cloudflare ${method} request failed (HTTP ${response.status}).`);
    if (binary && method === 'GET') return Buffer.from(await response.arrayBuffer());
    const data = await response.json();
    if (!data.success) throw new Error('Cloudflare rejected the deployment operation.');
    return data.result;
  }
  const projectPath = `/pages/projects/${project}`;
  const before = await api(projectPath);
  const production = before.deployment_configs.production;
  const namespace = production.kv_namespaces?.RESUME_FILES?.namespace_id;
  const oldSelector = production.env_vars?.RESUME_KV_KEY;
  if (!/^[a-f0-9]{32}$/i.test(namespace || '') || !oldSelector?.value) throw new Error('Existing private resume binding or selector is missing.');
  const selector = createHmac('sha256', key).update('private-resume-kv-v1\0').update(pdf).digest('hex');
  const valuePath = `/storage/kv/namespaces/${namespace}/values/${selector}`;
  if (selector !== oldSelector.value) await api(valuePath, { method: 'PUT', body: pdf, binary: true });
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const remote = await api(valuePath, { binary: true });
      if (!remote.equals(pdf)) throw new Error('Private resume read-back mismatch.');
      verified = true;
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  if (!verified) throw new Error('Private resume verification failed.');
  const changed = selector !== oldSelector.value;
  const setSelector = value => api(projectPath, { method: 'PATCH', body: { deployment_configs: { production: { env_vars: { RESUME_KV_KEY: value } } } } });
  try {
    if (changed) await setSelector({ type: oldSelector.type, value: selector });
    const configured = (await api(projectPath)).deployment_configs.production;
    if (configured.env_vars.RESUME_KV_KEY.value !== selector) throw new Error('Resume selector was not applied.');
    for (const field of ['kv_namespaces', 'd1_databases']) {
      if (JSON.stringify(configured[field]) !== JSON.stringify(production[field])) throw new Error('Unrelated binding changed.');
    }
    for (const [name, value] of Object.entries(production.env_vars)) {
      if (name !== 'RESUME_KV_KEY' && JSON.stringify(configured.env_vars[name]) !== JSON.stringify(value)) throw new Error('Unrelated environment variable changed.');
    }
    await deploy();
    console.log('Private resume verified and production deployment completed. Previous KV versions are retained.');
  } catch (error) {
    if (changed) {
      try { await setSelector(oldSelector); }
      catch { throw new Error('Deployment failed and resume selector rollback failed. Inspect Cloudflare settings before retrying.'); }
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const key = parseKey(process.env.RESUME_ENCRYPTION_KEY);
    const pdf = decryptPdf(await readFile('private-resume/resume.enc.json', 'utf8'), key);
    if (process.argv.includes('--verify-only')) {
      console.log('Encrypted resume authenticated and PDF validated. No plaintext file created.');
    } else {
      await deployPrivateResume({ pdf, key, account: process.env.CLOUDFLARE_ACCOUNT_ID, project: process.env.CLOUDFLARE_PAGES_PROJECT_NAME, token: process.env.CLOUDFLARE_RESUME_API_TOKEN, deploy: () => new Promise((resolve, reject) => {
        const childEnv = { ...process.env };
        delete childEnv.RESUME_ENCRYPTION_KEY;
        delete childEnv.CLOUDFLARE_RESUME_API_TOKEN;
        const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', 'dist', `--project-name=${process.env.CLOUDFLARE_PAGES_PROJECT_NAME}`, '--branch=main'], { stdio: 'inherit', env: childEnv });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('Wrangler production deployment failed.')));
      }) });
    }
  } catch {
    console.error('Private resume deployment failed. Check the configured secrets, Cloudflare permissions, and encrypted PDF.');
    process.exitCode = 1;
  }
}
