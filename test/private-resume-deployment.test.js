import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptPdf, decryptPdf, validatePdf } from '../scripts/resume-crypto.mjs';
import { deployPrivateResume } from '../scripts/deploy-private-resume.mjs';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const pdf = Buffer.from('%PDF-1.7\nprivate resume test\n%%EOF\n');
test('encrypted resume authenticates the PDF and rejects tampering or a wrong key', () => {
  const key = randomBytes(32);
  const encoded = encryptPdf(pdf, key);
  assert.deepEqual(decryptPdf(encoded, key), pdf);
  assert.equal(encoded.includes('private resume test'), false);
  assert.throws(() => decryptPdf(encoded, randomBytes(32)));
  const tampered = JSON.parse(encoded);
  const data = Buffer.from(tampered.ciphertext, 'base64');
  data[0] ^= 1;
  tampered.ciphertext = data.toString('base64');
  assert.throws(() => decryptPdf(JSON.stringify(tampered), key));
  assert.throws(() => validatePdf(Buffer.from('%PDF-incomplete')));
});

function cloudflareMock() {
  let config = { env_vars: { RESUME_KV_KEY: { type: 'plain_text', value: 'previous-private-key' }, UNRELATED: { type: 'secret_text' } }, kv_namespaces: { RESUME_FILES: { namespace_id: 'b'.repeat(32) } }, d1_databases: { DB: { id: 'existing-db' } } };
  const writes = [];
  let remote;
  return { writes, getConfig: () => structuredClone(config), fetchFn: async (url, options) => {
    if (url.includes('/values/')) {
      if (options.method === 'PUT') { remote = Buffer.from(options.body); return Response.json({ success: true, result: null }); }
      return new Response(remote);
    }
    if (options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      assert.deepEqual(Object.keys(patch.deployment_configs), ['production']);
      assert.deepEqual(Object.keys(patch.deployment_configs.production.env_vars), ['RESUME_KV_KEY']);
      config.env_vars.RESUME_KV_KEY = patch.deployment_configs.production.env_vars.RESUME_KV_KEY;
      writes.push(config.env_vars.RESUME_KV_KEY.value);
    }
    return Response.json({ success: true, result: { deployment_configs: { production: config } } });
  } };
}
test('deployment verifies private bytes before selecting the new version and preserves bindings', async () => {
  const mock = cloudflareMock();
  const before = mock.getConfig();
  let deployed = false;
  await deployPrivateResume({ pdf, key: randomBytes(32), account: 'a'.repeat(32), project: 'aruncs', token: 'mock-token', fetchFn: mock.fetchFn, deploy: async () => { deployed = true; assert.equal(mock.writes.length, 1); } });
  assert.equal(deployed, true);
  assert.deepEqual(mock.getConfig().kv_namespaces, before.kv_namespaces);
  assert.deepEqual(mock.getConfig().env_vars.UNRELATED, before.env_vars.UNRELATED);
});
test('failed production deploy restores the previous selector and keeps the previous KV file', async () => {
  const mock = cloudflareMock();
  await assert.rejects(deployPrivateResume({ pdf, key: randomBytes(32), account: 'a'.repeat(32), project: 'aruncs', token: 'mock-token', fetchFn: mock.fetchFn, deploy: async () => { throw new Error('simulated deployment failure'); } }));
  assert.equal(mock.getConfig().env_vars.RESUME_KV_KEY.value, 'previous-private-key');
  assert.equal(mock.writes.length, 2);
});

test('the resume commit command handles PDF-only edits and the hook rejects plaintext', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'portfolio-resume-hook-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Hook Test');
    git('config', 'user.email', 'hook@example.invalid');
    await mkdir(path.join(dir, 'scripts'));
    await mkdir(path.join(dir, '.githooks'));
    await mkdir(path.join(dir, 'assets/CV'), { recursive: true });
    for (const file of ['resume-crypto.mjs', 'prepare-resume.mjs', 'commit-resume.mjs']) await cp(new URL(`../scripts/${file}`, import.meta.url), path.join(dir, 'scripts', file));
    await cp(new URL('../.githooks/pre-commit', import.meta.url), path.join(dir, '.githooks/pre-commit'));
    await chmod(path.join(dir, '.githooks/pre-commit'), 0o755);
    await writeFile(path.join(dir, '.gitignore'), 'assets/CV/\n');
    await writeFile(path.join(dir, 'assets/CV/resume.pdf'), pdf);
    await writeFile(path.join(dir, 'assets/CV/Arun_CS_Staff_Software_Engineer_Resume.pdf'), pdf);
    execFileSync(process.execPath, ['scripts/prepare-resume.mjs', '--setup'], { cwd: dir, stdio: 'pipe' });
    git('add', '.');
    git('commit', '-m', 'Initial encrypted resume');
    const updated = Buffer.from('%PDF-1.7\nupdated private resume\n%%EOF\n');
    await writeFile(path.join(dir, 'assets/CV/Arun_CS_Staff_Software_Engineer_Resume.pdf'), updated);
    execFileSync(process.execPath, ['scripts/commit-resume.mjs', 'PDF-only change'], { cwd: dir, stdio: 'pipe' });
    assert.equal(git('diff', 'HEAD~1', '--name-only'), 'private-resume/resume.enc.json');
    assert.equal(git('ls-files', '*.pdf'), '');
    const localKey = (await readFile(path.join(dir, '.git/resume-encryption-key'), 'utf8')).trim();
    const encrypted = git('show', 'HEAD:private-resume/resume.enc.json');
    assert.deepEqual(decryptPdf(encrypted, Buffer.from(localKey, 'hex')), updated);
    await writeFile(path.join(dir, 'leak.pdf'), pdf);
    git('add', 'leak.pdf');
    assert.throws(() => git('commit', '-m', 'Must reject private PDF'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
