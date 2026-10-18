import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const requireText = async (relative, patterns) => {
  const content = await readFile(path.join(root, relative), "utf8");
  for (const [label, pattern] of patterns) {
    if (!pattern.test(content)) failures.push(`${relative}: missing ${label}`);
  }
  return content;
};

const index = await requireText("dist/index.html", [
  ["three resume request controls", /data-resume-request/gu],
  ["native dialog", /<dialog[\s\S]*id="resume-request-dialog"/u],
  ["privacy note", /Your details will only be used to send the requested resume and record access/u],
]);
if ((index.match(/data-resume-request/gu) || []).length !== 3) {
  failures.push("dist/index.html: expected exactly three resume request controls");
}
if (/assets\/CV\/|\.pdf\b/iu.test(index)) failures.push("dist/index.html: public PDF reference remains");

await requireText("dist/script.js", [
  ["safe text rendering", /\.textContent\s*=/u],
  ["dialog modal opening", /\.showModal\(\)/u],
  ["same-origin request endpoint", /\/api\/resume\/request/u],
]);
await requireText("functions/api/resume/download.js", [
  ["PDF content type", /application\/pdf/u],
  ["no-store cache", /responseSecurityHeaders/u],
  ["attachment disposition", /Content-Disposition/u],
]);
await requireText("functions/_lib/resume-service.js", [
  ["one-hour expiry", /ACCESS_TOKEN_TTL_SECONDS/u],
  ["maximum downloads", /MAX_DOWNLOADS/u],
  ["token hashing", /sha256Hex\(rawToken\)/u],
]);
await requireText("migrations/0001_resume_requests.sql", [
  ["request table", /CREATE TABLE IF NOT EXISTS resume_requests/u],
  ["access event table", /CREATE TABLE IF NOT EXISTS resume_access_events/u],
  ["token index", /idx_resume_requests_token_hash/u],
  ["idempotency index", /idx_resume_requests_idempotency_key/u],
]);

async function findFiles(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await findFiles(absolute));
    else results.push(absolute);
  }
  return results;
}

const publicFiles = await findFiles(path.join(root, "dist"));
if (publicFiles.some((filename) => filename.toLowerCase().endsWith(".pdf"))) {
  failures.push("dist: a resume PDF remains in the deployment output");
}
const publicTextFiles = publicFiles.filter((filename) => /\.(?:html|js|css|txt|xml)$/iu.test(filename));
const forbiddenSecretNames = [
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_SESSION_SECRET",
  "RATE_LIMIT_SALT",
  "TURNSTILE_SECRET",
];
for (const filename of publicTextFiles) {
  const content = await readFile(filename, "utf8");
  for (const secretName of forbiddenSecretNames) {
    if (content.includes(secretName)) {
      failures.push(`${path.relative(root, filename)}: secret identifier exposed in public output`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Implementation validation passed: no public PDF or secret-bearing frontend output.");
}
