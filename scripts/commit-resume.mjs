import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const message = process.argv.slice(2).filter(value => value !== '--').join(' ') || 'Update private resume';
execFileSync(process.execPath, ['scripts/prepare-resume.mjs'], { cwd, stdio: 'inherit' });
execFileSync('git', ['add', '--', 'private-resume/resume.enc.json'], { cwd, stdio: 'inherit' });
execFileSync('git', ['commit', '-m', message], { cwd, stdio: 'inherit' });
