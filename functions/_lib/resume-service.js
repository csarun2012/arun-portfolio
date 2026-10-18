import {
  ACCESS_TOKEN_BYTES,
  ACCESS_TOKEN_TTL_SECONDS,
  MAX_DOWNLOADS,
  PUBLIC_MESSAGES,
  REQUEST_LIMITS,
} from "./constants.js";
import { randomId, randomToken, saltedHash, sha256Hex } from "./crypto.js";
import { createGmailClient, adminMessage, requesterMessage } from "./gmail.js";
import { PublicError, getRequesterIp } from "./http.js";
import { getRepository } from "./repository.js";
import { verifyTurnstile } from "./turnstile.js";

const SUCCESS_MESSAGE =
  "Your resume access link has been sent. Please check your inbox. The link will remain active for one hour.";

function isoBefore(now, milliseconds) {
  return new Date(now.getTime() - milliseconds).toISOString();
}

function idempotentResult(existing, normalizedEmail) {
  if (!existing || existing.normalized_email !== normalizedEmail) return null;
  if (existing.email_status === "accepted") {
    return { ok: true, message: SUCCESS_MESSAGE, idempotent: true };
  }
  if (existing.email_status === "failed") {
    throw new PublicError(503, "EMAIL_UNAVAILABLE", PUBLIC_MESSAGES.emailUnavailable);
  }
  throw new PublicError(409, "REQUEST_IN_PROGRESS", PUBLIC_MESSAGES.temporaryFailure);
}

export async function createResumeRequest({
  env,
  request,
  data,
  now = new Date(),
  fetcher = fetch,
}) {
  const repository = getRepository(env);
  await verifyTurnstile({
    env,
    request,
    token: data.turnstileToken,
    action: "resume_request",
    idempotencyKey: data.idempotencyKey,
    fetcher,
  });

  const existing = await repository.getByIdempotencyKey(data.idempotencyKey);
  const existingResult = idempotentResult(existing, data.normalizedEmail);
  if (existingResult) return existingResult;

  const requesterIp = getRequesterIp(request);
  const [hashedEmail, hashedRequesterIp] = await Promise.all([
    saltedHash(data.normalizedEmail, env.RATE_LIMIT_SALT),
    saltedHash(requesterIp, env.RATE_LIMIT_SALT),
  ]);
  const [emailCount, ipCount] = await Promise.all([
    repository.countRecentEmail(hashedEmail, isoBefore(now, 24 * 60 * 60 * 1000)),
    repository.countRecentIp(hashedRequesterIp, isoBefore(now, 60 * 60 * 1000)),
  ]);
  if (emailCount >= REQUEST_LIMITS.emailPerDay || ipCount >= REQUEST_LIMITS.ipPerHour) {
    throw new PublicError(429, "RATE_LIMITED", PUBLIC_MESSAGES.rateLimited);
  }

  const rawToken = randomToken(ACCESS_TOKEN_BYTES);
  const tokenHash = await sha256Hex(rawToken);
  const requestedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const id = randomId();
  const inserted = await repository.insertRequest({
    id,
    name: data.name,
    normalizedEmail: data.normalizedEmail,
    hashedEmail,
    company: data.company,
    linkedinUrl: data.linkedinUrl,
    message: data.message,
    tokenHash,
    requestedAt,
    expiresAt,
    maximumDownloads: MAX_DOWNLOADS,
    hashedRequesterIp,
    idempotencyKey: data.idempotencyKey,
  });

  if (!inserted) {
    const raced = await repository.getByIdempotencyKey(data.idempotencyKey);
    const racedResult = idempotentResult(raced, data.normalizedEmail);
    if (racedResult) return racedResult;
    throw new PublicError(409, "IDEMPOTENCY_CONFLICT", PUBLIC_MESSAGES.invalidRequest);
  }

  const baseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/u, "");
  const accessUrl = `${baseUrl}/resume-access/#token=${rawToken}`;
  let gmail;
  let accessToken;
  let requesterResult;

  try {
    gmail = createGmailClient(env, fetcher);
    accessToken = await gmail.getAccessToken();
    requesterResult = await gmail.send(
      accessToken,
      requesterMessage(env, data, accessUrl),
    );
    await repository.markRequesterEmailAccepted(id, requesterResult, new Date().toISOString());
  } catch {
    await repository.markRequesterEmailFailed(id, "gmail_unavailable", new Date().toISOString());
    throw new PublicError(503, "EMAIL_UNAVAILABLE", PUBLIC_MESSAGES.emailUnavailable);
  }

  try {
    const adminResult = await gmail.send(
      accessToken,
      adminMessage(env, data, requestedAt, expiresAt),
    );
    await repository.markAdminEmail(id, "accepted", adminResult, new Date().toISOString());
  } catch {
    await repository.markAdminEmail(id, "failed", null, new Date().toISOString());
  }

  return { ok: true, message: SUCCESS_MESSAGE, idempotent: false };
}

export async function inspectResumeAccess({
  env,
  request,
  token,
  now = new Date(),
}) {
  const repository = getRepository(env);
  const tokenHash = await sha256Hex(token);
  const record = await repository.findByTokenHash(tokenHash);
  if (!record) throw new PublicError(404, "INVALID_LINK", PUBLIC_MESSAGES.invalidLink);

  const hashedIp = await saltedHash(getRequesterIp(request), env.RATE_LIMIT_SALT);
  const nowIso = now.toISOString();
  if (record.expires_at <= nowIso) {
    await repository.recordEvent(record.id, "expired", hashedIp, nowIso);
    throw new PublicError(410, "EXPIRED_LINK", PUBLIC_MESSAGES.expiredLink);
  }
  if (record.download_count >= record.maximum_downloads) {
    await repository.recordEvent(record.id, "download_limit_reached", hashedIp, nowIso);
    throw new PublicError(429, "LIMIT_REACHED", PUBLIC_MESSAGES.limitReached);
  }

  await repository.recordAccess(
    record.id,
    hashedIp,
    nowIso,
    JSON.stringify({ note: "Page activity; may include automated scanners." }),
  );
  return {
    ok: true,
    expiresAt: record.expires_at,
    remainingDeliveries: record.maximum_downloads - record.download_count,
  };
}

export async function deliverResume({
  env,
  request,
  token,
  now = new Date(),
}) {
  const repository = getRepository(env);
  const tokenHash = await sha256Hex(token);
  let record = await repository.findByTokenHash(tokenHash);
  if (!record) throw new PublicError(404, "INVALID_LINK", PUBLIC_MESSAGES.invalidLink);

  const hashedIp = await saltedHash(getRequesterIp(request), env.RATE_LIMIT_SALT);
  const nowIso = now.toISOString();
  if (record.expires_at <= nowIso) {
    await repository.recordEvent(record.id, "expired", hashedIp, nowIso);
    throw new PublicError(410, "EXPIRED_LINK", PUBLIC_MESSAGES.expiredLink);
  }
  if (record.download_count >= record.maximum_downloads) {
    await repository.recordEvent(record.id, "download_limit_reached", hashedIp, nowIso);
    throw new PublicError(429, "LIMIT_REACHED", PUBLIC_MESSAGES.limitReached);
  }
  if (!env.RESUME_FILES || !env.RESUME_KV_KEY) {
    throw new PublicError(503, "RESUME_UNAVAILABLE", PUBLIC_MESSAGES.resumeUnavailable);
  }

  const pdf = await env.RESUME_FILES.get(env.RESUME_KV_KEY, { type: "arrayBuffer" });
  if (!(pdf instanceof ArrayBuffer) || pdf.byteLength === 0) {
    throw new PublicError(503, "RESUME_UNAVAILABLE", PUBLIC_MESSAGES.resumeUnavailable);
  }

  const claimed = await repository.claimDownload(tokenHash, nowIso);
  if (!claimed) {
    record = await repository.findByTokenHash(tokenHash);
    if (record?.expires_at <= nowIso) {
      throw new PublicError(410, "EXPIRED_LINK", PUBLIC_MESSAGES.expiredLink);
    }
    throw new PublicError(429, "LIMIT_REACHED", PUBLIC_MESSAGES.limitReached);
  }

  await repository.recordDownload(claimed.id, hashedIp, nowIso, claimed.download_count);
  return { pdf, deliveredCount: claimed.download_count, maximumDownloads: claimed.maximum_downloads };
}
