import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKey, encryptPdf, decryptPdf } from './resume-crypto.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const keyPath = path.resolve(git('rev-parse', '--git-path', 'resume-encryption-key'));
const target = 'private-resume/resume.enc.json';
const setup = process.argv.includes('--setup');
if (setup) {
  let currentHook = '';
  try { currentHook = git('config', '--get', 'core.hooksPath'); } catch (error) { if (error.status !== 1) throw error; }
  if (currentHook && currentHook !== '.githooks') throw new Error('Existing hooksPath requires manual integration.');
}
let existing;
try { existing = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let keyText = process.env.RESUME_ENCRYPTION_KEY;
if (!keyText) {
  try { keyText = (await readFile(keyPath, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!setup || existing) throw new Error('Restore the existing resume encryption key into Git metadata before preparing this resume.');
    keyText = randomBytes(32).toString('hex');
    await writeFile(keyPath, keyText, { flag: 'wx', mode: 0o600 });
  }
}
const key = parseKey(keyText);
if (process.argv.includes('--staged')) {
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0');
  if (staged.some(file => /\.pdf$/i.test(file) || /(^|\/)(resume-encryption-key|\.dev\.vars)$/.test(file))) {
    throw new Error('Commit blocked: private PDFs and encryption keys must never be staged.');
  }
}
const pdf = await readFile('assets/CV/Arun_CS_Staff_Software_Engineer_Resume.pdf');
if (!existing || !decryptPdf(existing, key).equals(pdf)) {
  await mkdir('private-resume', { recursive: true });
  await writeFile(target, encryptPdf(pdf, key));
  console.log('Encrypted resume refreshed. The source PDF remains private.');
}
if (setup) {
  git('config', 'core.hooksPath', '.githooks');
  console.log('Resume commit hook installed. Back up the key in Git metadata privately and configure the matching GitHub secret.');
}
if (process.argv.includes('--staged')) git('add', '--', target);
