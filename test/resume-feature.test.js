import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ADMIN_COOKIE_NAME,
  adminSessionCookie,
  createAdminSession,
  verifyAdminSession,
  verifyAdminPassword,
} from "../functions/_lib/auth.js";
import { createPasswordHash, saltedHash, sha256Hex } from "../functions/_lib/crypto.js";
import { PublicError } from "../functions/_lib/http.js";
import {
  createResumeRequest,
  deliverResume,
  inspectResumeAccess,
} from "../functions/_lib/resume-service.js";
import { verifyTurnstile } from "../functions/_lib/turnstile.js";
import {
  validateAccessBody,
  validateResumeRequest,
} from "../functions/_lib/validation.js";
import { onRequestGet as getAdminRequests } from "../functions/api/admin/resume-requests.js";
import { onRequestPost as adminLogin } from "../functions/api/admin/login.js";
import { onRequestPost as resumeRequestHandler } from "../functions/api/resume/request.js";

const TEST_TOKEN = "A".repeat(43);
const NOW = new Date("2026-07-24T12:00:00.000Z");

class MockRepository {
  constructor() {
    this.requests = [];
    this.events = [];
    this.loginAttempts = [];
    this.emailCount = null;
    this.ipCount = null;
  }

  async getByIdempotencyKey(key) {
    return this.requests.find((item) => item.idempotency_key === key) || null;
  }

  async countRecentEmail(hashedEmail, since) {
    if (this.emailCount !== null) return this.emailCount;
    return this.requests.filter(
      (item) => item.hashed_email === hashedEmail && item.requested_at >= since,
    ).length;
  }

  async countRecentIp(hashedIp, since) {
    if (this.ipCount !== null) return this.ipCount;
    return this.requests.filter(
      (item) => item.hashed_requester_ip === hashedIp && item.requested_at >= since,
    ).length;
  }

  async insertRequest(record) {
    if (await this.getByIdempotencyKey(record.idempotencyKey)) return null;
    this.requests.push({
      id: record.id,
      name: record.name,
      normalized_email: record.normalizedEmail,
      hashed_email: record.hashedEmail,
      company: record.company,
      linkedin_url: record.linkedinUrl,
      message: record.message,
      token_hash: record.tokenHash,
      requested_at: record.requestedAt,
      expires_at: record.expiresAt,
      maximum_downloads: record.maximumDownloads,
      download_count: 0,
      email_status: "pending",
      hashed_requester_ip: record.hashedRequesterIp,
      idempotency_key: record.idempotencyKey,
      first_accessed_at: null,
      last_accessed_at: null,
      first_download_at: null,
      last_download_at: null,
    });
    return { id: record.id };
  }

  async markRequesterEmailAccepted(id, result, now) {
    const record = this.requests.find((item) => item.id === id);
    Object.assign(record, {
      email_status: "accepted",
      email_sent_at: now,
      requester_gmail_message_id: result.id,
    });
  }

  async markRequesterEmailFailed(id, category, now) {
    const record = this.requests.find((item) => item.id === id);
    Object.assign(record, {
      email_status: "failed",
      email_failure_category: category,
      email_attempted_at: now,
    });
  }

  async markAdminEmail(id, status, result) {
    const record = this.requests.find((item) => item.id === id);
    record.admin_email_status = status;
    record.admin_gmail_message_id = result?.id || null;
  }

  async findByTokenHash(tokenHash) {
    return this.requests.find((item) => item.token_hash === tokenHash) || null;
  }

  async recordAccess(id, hashedIp, now, metadata) {
    const record = this.requests.find((item) => item.id === id);
    record.first_accessed_at ||= now;
    record.last_accessed_at = now;
    this.events.push({ requestId: id, type: "access_page_opened", hashedIp, metadata });
  }

  async recordEvent(id, eventType, hashedIp) {
    this.events.push({ requestId: id, type: eventType, hashedIp });
  }

  async claimDownload(tokenHash, now) {
    const record = this.requests.find((item) => item.token_hash === tokenHash);
    if (!record || record.expires_at <= now || record.download_count >= record.maximum_downloads) {
      return null;
    }
    record.download_count += 1;
    record.first_download_at ||= now;
    record.last_download_at = now;
    return {
      id: record.id,
      download_count: record.download_count,
      maximum_downloads: record.maximum_downloads,
    };
  }

  async recordDownload(id, hashedIp, now, deliveredCount) {
    this.events.push({ requestId: id, type: "download_delivered", hashedIp, now, deliveredCount });
  }

  async countRecentAdminLoginAttempts() {
    return this.loginAttempts.filter((item) => !item.succeeded).length;
  }

  async recordAdminLoginAttempt(hashedIp, now, succeeded) {
    this.loginAttempts.push({ hashedIp, now, succeeded });
  }

  async listAdminRequests() {
    return { rows: [], total: 0 };
  }
}

function baseEnv(repository = new MockRepository()) {
  return {
    __TEST_REPOSITORY: repository,
    PUBLIC_BASE_URL: "https://aruncs.pages.dev",
    RATE_LIMIT_SALT: "test-rate-limit-salt",
    TURNSTILE_SECRET: "turnstile-secret",
    TURNSTILE_SITE_KEY: "site-key",
    GMAIL_CLIENT_ID: "client-id",
    GMAIL_CLIENT_SECRET: "client-secret",
    GMAIL_REFRESH_TOKEN: "refresh-token",
    GMAIL_FROM_EMAIL: "csarun.careers@gmail.com",
    ADMIN_EMAIL: "csarun.careers@gmail.com",
    ADMIN_SESSION_SECRET: "admin-session-secret-with-enough-entropy-for-tests",
    RESUME_KV_KEY: "private/resume.pdf",
  };
}

function sameOriginRequest(path = "/api/resume/request") {
  return new Request(`https://aruncs.pages.dev${path}`, {
    method: "POST",
    headers: {
      Origin: "https://aruncs.pages.dev",
      "Sec-Fetch-Site": "same-origin",
      "CF-Connecting-IP": "203.0.113.20",
    },
  });
}

function validData(overrides = {}) {
  return {
    name: "Recruiter Name",
    normalizedEmail: "recruiter@example.com",
    company: "Example Company",
    linkedinUrl: "https://www.linkedin.com/in/recruiter/",
    message: "Staff engineering opportunity",
    turnstileToken: "verified-turnstile-token",
    idempotencyKey: "0123456789abcdef0123456789abcdef",
    ...overrides,
  };
}

function mockExternalFetch({
  turnstileSuccess = true,
  turnstileHostname = "aruncs.pages.dev",
  turnstileAction = "resume_request",
  failGmailAt = 0,
} = {}) {
  const calls = { turnstile: 0, oauth: 0, gmail: 0, rawMessages: [] };
  const fetcher = async (url, options = {}) => {
    const value = String(url);
    if (value.includes("turnstile")) {
      calls.turnstile += 1;
      return Response.json({
        success: turnstileSuccess,
        hostname: turnstileHostname,
        action: turnstileAction,
        challenge_ts: NOW.toISOString(),
      });
    }
    if (value.includes("oauth2.googleapis.com")) {
      calls.oauth += 1;
      return Response.json({ access_token: "short-lived-access-token", expires_in: 3600 });
    }
    if (value.includes("gmail.googleapis.com")) {
      calls.gmail += 1;
      calls.rawMessages.push(JSON.parse(options.body).raw);
      if (calls.gmail === failGmailAt) return Response.json({ error: "mock" }, { status: 500 });
      return Response.json({ id: `gmail-${calls.gmail}`, threadId: `thread-${calls.gmail}` });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  return { fetcher, calls };
}

async function seedTokenRequest(repository, overrides = {}) {
  const tokenHash = await sha256Hex(TEST_TOKEN);
  const record = {
    id: "request-seed",
    name: "Recruiter",
    normalized_email: "recruiter@example.com",
    hashed_email: "email-hash",
    company: "Example",
    token_hash: tokenHash,
    requested_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    maximum_downloads: 3,
    download_count: 0,
    email_status: "accepted",
    hashed_requester_ip: "ip-hash",
    idempotency_key: "seed-idempotency-key",
    ...overrides,
  };
  repository.requests.push(record);
  return record;
}

test("form validation normalizes values and rejects unexpected or unsafe fields", () => {
  const value = validateResumeRequest({
    name: "  Recruiter   Name ",
    email: "Recruiter@Example.COM ",
    company: " Example  Company ",
    linkedinUrl: "https://www.linkedin.com/in/recruiter/#details",
    message: " Hello\r\nthere ",
    turnstileToken: "token",
    idempotencyKey: "0123456789abcdef",
  });
  assert.equal(value.name, "Recruiter Name");
  assert.equal(value.normalizedEmail, "recruiter@example.com");
  assert.equal(value.company, "Example Company");
  assert.equal(value.linkedinUrl, "https://www.linkedin.com/in/recruiter/");
  assert.equal(value.message, "Hello\nthere");
  assert.throws(
    () => validateResumeRequest({ ...value, email: "bad", extra: "unsafe" }),
    PublicError,
  );
  assert.throws(() => validateAccessBody({ token: "short" }), PublicError);
});

test("resume requests reject IBM email domains without blocking lookalike domains or IBM companies", () => {
  const request = {
    name: "Recruiter Name",
    email: "recruiter@example.com",
    company: "IBM",
    linkedinUrl: "",
    message: "",
    turnstileToken: "token",
    idempotencyKey: "0123456789abcdef",
  };

  for (const email of [
    "person@ibm.com",
    "person@us.ibm.com",
    "Person@US.IBM.COM",
    "person@team.us.ibm.com",
    "person@ibm.com.",
    "person@us.ibm.com.",
  ]) {
    assert.throws(
      () => validateResumeRequest({ ...request, email }),
      (error) => (
        error instanceof PublicError
        && error.code === "EMAIL_DOMAIN_NOT_ALLOWED"
        && error.publicMessage
          === "This email domain is not eligible for resume delivery. Please use another email address."
      ),
    );
  }

  assert.equal(
    validateResumeRequest({ ...request, email: "person@notibm.com" }).normalizedEmail,
    "person@notibm.com",
  );
  assert.equal(
    validateResumeRequest({ ...request, email: "person@ibm.com.example.org" }).normalizedEmail,
    "person@ibm.com.example.org",
  );
  assert.equal(validateResumeRequest(request).company, "IBM");
});

test("Turnstile accepts the exact production hostname and rejects failure or mismatch", async () => {
  const env = baseEnv();
  const request = sameOriginRequest();
  const passing = mockExternalFetch();
  await verifyTurnstile({
    env,
    request,
    token: "token",
    action: "resume_request",
    fetcher: passing.fetcher,
  });

  await assert.rejects(
    verifyTurnstile({
      env,
      request,
      token: "token",
      action: "resume_request",
      fetcher: mockExternalFetch({ turnstileSuccess: false }).fetcher,
    }),
    (error) => error.code === "VERIFICATION_FAILED",
  );
  await assert.rejects(
    verifyTurnstile({
      env,
      request,
      token: "token",
      action: "resume_request",
      fetcher: mockExternalFetch({ turnstileHostname: "attacker.example" }).fetcher,
    }),
    (error) => error.code === "VERIFICATION_FAILED",
  );
});

test("request creation stores only a token hash, expires in exactly one hour, and sends two separate emails", async () => {
  const repository = new MockRepository();
  const env = baseEnv(repository);
  const external = mockExternalFetch();
  const result = await createResumeRequest({
    env,
    request: sameOriginRequest(),
    data: validData(),
    now: NOW,
    fetcher: external.fetcher,
  });

  assert.equal(result.ok, true);
  assert.equal(repository.requests.length, 1);
  const stored = repository.requests[0];
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/u);
  assert.equal("token" in stored, false);
  assert.equal(
    new Date(stored.expires_at).getTime() - new Date(stored.requested_at).getTime(),
    60 * 60 * 1000,
  );
  assert.equal(stored.maximum_downloads, 3);
  assert.equal(stored.email_status, "accepted");
  assert.equal(stored.admin_email_status, "accepted");
  assert.equal(external.calls.gmail, 2);
});

test("idempotent browser retry creates no duplicate record or email", async () => {
  const repository = new MockRepository();
  const env = baseEnv(repository);
  const external = mockExternalFetch();
  const input = {
    env,
    request: sameOriginRequest(),
    data: validData(),
    now: NOW,
    fetcher: external.fetcher,
  };
  await createResumeRequest(input);
  const second = await createResumeRequest(input);
  assert.equal(second.idempotent, true);
  assert.equal(repository.requests.length, 1);
  assert.equal(external.calls.gmail, 2);
});

test("requester Gmail failure is recorded, admin email is not sent, and no link is returned", async () => {
  const repository = new MockRepository();
  const env = baseEnv(repository);
  const external = mockExternalFetch({ failGmailAt: 1 });
  await assert.rejects(
    createResumeRequest({
      env,
      request: sameOriginRequest(),
      data: validData(),
      now: NOW,
      fetcher: external.fetcher,
    }),
    (error) => error.code === "EMAIL_UNAVAILABLE" && !String(error.publicMessage).includes("#token"),
  );
  assert.equal(repository.requests.length, 1);
  assert.equal(repository.requests[0].email_status, "failed");
  assert.equal(external.calls.gmail, 1);
});

test("email and IP rate limits reject before request creation", async () => {
  const repository = new MockRepository();
  repository.emailCount = 3;
  const env = baseEnv(repository);
  await assert.rejects(
    createResumeRequest({
      env,
      request: sameOriginRequest(),
      data: validData(),
      now: NOW,
      fetcher: mockExternalFetch().fetcher,
    }),
    (error) => error.code === "RATE_LIMITED",
  );
  assert.equal(repository.requests.length, 0);

  repository.emailCount = 0;
  repository.ipCount = 5;
  await assert.rejects(
    createResumeRequest({
      env,
      request: sameOriginRequest(),
      data: validData({ idempotencyKey: "fedcba9876543210fedcba9876543210" }),
      now: NOW,
      fetcher: mockExternalFetch().fetcher,
    }),
    (error) => error.code === "RATE_LIMITED",
  );
});

test("access-page tracking is independent and does not consume a delivery", async () => {
  const repository = new MockRepository();
  const record = await seedTokenRequest(repository);
  const result = await inspectResumeAccess({
    env: baseEnv(repository),
    request: sameOriginRequest("/api/resume/access"),
    token: TEST_TOKEN,
    now: NOW,
  });
  assert.equal(result.remainingDeliveries, 3);
  assert.equal(record.download_count, 0);
  assert.equal(repository.events[0].type, "access_page_opened");
});

test("KV binary resume is retrieved and the three-delivery limit is atomic", async () => {
  const repository = new MockRepository();
  const record = await seedTokenRequest(repository);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
  const env = {
    ...baseEnv(repository),
    RESUME_FILES: {
      async get(key, options) {
        assert.equal(key, "private/resume.pdf");
        assert.equal(options.type, "arrayBuffer");
        return pdfBytes.slice(0);
      },
    },
  };

  const attempts = await Promise.allSettled(
    Array.from({ length: 4 }, () => deliverResume({
      env,
      request: sameOriginRequest("/api/resume/download"),
      token: TEST_TOKEN,
      now: NOW,
    })),
  );
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 3);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.equal(record.download_count, 3);
  assert.equal(repository.events.filter((event) => event.type === "download_delivered").length, 3);
});

test("expired and invalid tokens are rejected without delivery", async () => {
  const repository = new MockRepository();
  await seedTokenRequest(repository, { expires_at: new Date(NOW.getTime() - 1).toISOString() });
  const env = {
    ...baseEnv(repository),
    RESUME_FILES: { get: async () => new ArrayBuffer(4) },
  };
  await assert.rejects(
    deliverResume({ env, request: sameOriginRequest(), token: TEST_TOKEN, now: NOW }),
    (error) => error.code === "EXPIRED_LINK",
  );
  await assert.rejects(
    deliverResume({ env, request: sameOriginRequest(), token: "B".repeat(43), now: NOW }),
    (error) => error.code === "INVALID_LINK",
  );
});

test("missing KV resume fails without consuming a delivery", async () => {
  const repository = new MockRepository();
  const record = await seedTokenRequest(repository);
  const env = {
    ...baseEnv(repository),
    RESUME_FILES: { get: async () => null },
  };
  await assert.rejects(
    deliverResume({ env, request: sameOriginRequest(), token: TEST_TOKEN, now: NOW }),
    (error) => error.code === "RESUME_UNAVAILABLE",
  );
  assert.equal(record.download_count, 0);
});

test("PBKDF2 admin password and signed one-hour secure session cookie verify correctly", async () => {
  const passwordHash = await createPasswordHash(
    "correct horse battery staple",
    25_000,
    new Uint8Array(16).fill(7),
  );
  const env = { ...baseEnv(), ADMIN_PASSWORD_HASH: passwordHash };
  assert.equal(await verifyAdminPassword("correct horse battery staple", env), true);
  assert.equal(await verifyAdminPassword("incorrect", env), false);

  const session = await createAdminSession(env, NOW);
  const cookie = adminSessionCookie(session);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /Secure/u);
  assert.match(cookie, /SameSite=Strict/u);
  const request = new Request("https://aruncs.pages.dev/api/admin/session", {
    headers: { Cookie: `${ADMIN_COOKIE_NAME}=${session}` },
  });
  assert.equal(await verifyAdminSession(request, env, new Date(NOW.getTime() + 59 * 60 * 1000)), true);
  assert.equal(await verifyAdminSession(request, env, new Date(NOW.getTime() + 61 * 60 * 1000)), false);
});

test("admin request API rejects an unsigned session", async () => {
  const response = await getAdminRequests({
    request: new Request("https://aruncs.pages.dev/api/admin/resume-requests"),
    env: baseEnv(),
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.code, "UNAUTHORIZED");
});

test("admin login attempts are Turnstile-protected and rate limited by hashed IP", async () => {
  const repository = new MockRepository();
  repository.loginAttempts = Array.from({ length: 5 }, () => ({ succeeded: false }));
  const env = {
    ...baseEnv(repository),
    ADMIN_PASSWORD_HASH: await createPasswordHash(
      "correct horse battery staple",
      25_000,
      new Uint8Array(16).fill(4),
    ),
    __TEST_FETCH: mockExternalFetch({ turnstileAction: "admin_login" }).fetcher,
  };
  const request = new Request("https://aruncs.pages.dev/api/admin/login", {
    method: "POST",
    headers: {
      Origin: "https://aruncs.pages.dev",
      "Sec-Fetch-Site": "same-origin",
      "CF-Connecting-IP": "203.0.113.20",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: "correct horse battery staple", turnstileToken: "token" }),
  });
  const response = await adminLogin({ request, env });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "RATE_LIMITED");
});

test("request endpoint rejects cross-origin JSON with a privacy-safe response", async () => {
  const request = new Request("https://aruncs.pages.dev/api/resume/request", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const response = await resumeRequestHandler({ request, env: baseEnv() });
  assert.equal(response.status, 403);
  const result = await response.json();
  assert.equal(result.code, "ORIGIN_REJECTED");
  assert.equal("stack" in result, false);
});

test("request endpoint rejects IBM email domains before storage, Turnstile, or Gmail", async () => {
  const repository = new MockRepository();
  const external = mockExternalFetch();
  const env = { ...baseEnv(repository), __TEST_FETCH: external.fetcher };
  const request = new Request("https://aruncs.pages.dev/api/resume/request", {
    method: "POST",
    headers: {
      Origin: "https://aruncs.pages.dev",
      "Sec-Fetch-Site": "same-origin",
      "CF-Connecting-IP": "203.0.113.20",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "IBM Recruiter",
      email: "recruiter@us.ibm.com",
      company: "IBM",
      linkedinUrl: "",
      message: "",
      turnstileToken: "token",
      idempotencyKey: "0123456789abcdef",
    }),
  });

  const response = await resumeRequestHandler({ request, env });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "EMAIL_DOMAIN_NOT_ALLOWED",
    message: "This email domain is not eligible for resume delivery. Please use another email address.",
  });
  assert.equal(repository.requests.length, 0);
  assert.deepEqual(external.calls, { turnstile: 0, oauth: 0, gmail: 0, rawMessages: [] });
});

test("static UI includes native dialog, keyboard semantics, mobile rules, and reduced motion", async () => {
  const [index, script, styles, accessBootstrap, adminScript] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../script.js", import.meta.url), "utf8"),
    readFile(new URL("../style.css", import.meta.url), "utf8"),
    readFile(new URL("../resume-access/token-bootstrap.js", import.meta.url), "utf8"),
    readFile(new URL("../admin/resume-requests/script.js", import.meta.url), "utf8"),
  ]);
  assert.match(index, /<dialog[\s\S]*id="resume-request-dialog"/u);
  assert.equal((index.match(/data-resume-request/gu) || []).length, 3);
  assert.match(script, /showModal\(\)/u);
  assert.match(script, /addEventListener\('cancel'/u);
  assert.match(script, /resumeReturnFocus\?\.focus\(\)/u);
  assert.match(script, /domain === 'ibm\.com' \|\| domain\.endsWith\('\.ibm\.com'\)/u);
  assert.match(
    script,
    /This email domain is not eligible for resume delivery\. Please use another email address\./u,
  );
  assert.doesNotMatch(script, /innerHTML/u);
  assert.doesNotMatch(adminScript, /innerHTML/u);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*resume-request-dialog/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*resume-request-dialog/u);
  assert.match(styles, /\.resume-dialog-content::-webkit-scrollbar-thumb/u);
  assert.match(styles, /scrollbar-width: thin/u);
  assert.match(accessBootstrap, /history\.replaceState/u);
});

test("D1 repository uses a conditional atomic increment and migrations define required indexes", async () => {
  const [repositorySource, migration] = await Promise.all([
    readFile(new URL("../functions/_lib/repository.js", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0001_resume_requests.sql", import.meta.url), "utf8"),
  ]);
  assert.match(
    repositorySource,
    /UPDATE resume_requests[\s\S]*download_count = download_count \+ 1[\s\S]*download_count < maximum_downloads[\s\S]*RETURNING/u,
  );
  for (const index of [
    "idx_resume_requests_token_hash",
    "idx_resume_requests_normalized_email",
    "idx_resume_requests_requested_at",
    "idx_resume_requests_expires_at",
    "idx_resume_requests_idempotency_key",
  ]) {
    assert.ok(migration.includes(index), `missing ${index}`);
  }
});

test("salted request hashes are stable but never equal the raw email or IP", async () => {
  const email = "recruiter@example.com";
  const ip = "203.0.113.20";
  const [emailHash, emailHashAgain, ipHash] = await Promise.all([
    saltedHash(email, "salt"),
    saltedHash(email, "salt"),
    saltedHash(ip, "salt"),
  ]);
  assert.equal(emailHash, emailHashAgain);
  assert.notEqual(emailHash, email);
  assert.notEqual(ipHash, ip);
  assert.notEqual(emailHash, ipHash);
});
