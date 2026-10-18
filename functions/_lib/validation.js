import { FIELD_LIMITS, PUBLIC_MESSAGES } from "./constants.js";
import { PublicError } from "./http.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;

function requireExpectedKeys(value, expectedKeys) {
  const unknown = Object.keys(value).filter((key) => !expectedKeys.includes(key));
  if (unknown.length) throw validationError();
}

function normalizeSingleLine(value, maxLength, required = false) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw validationError();
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if ((required && !normalized) || normalized.length > maxLength || CONTROL_PATTERN.test(normalized)) {
    throw validationError();
  }
  return normalized;
}

function normalizeMessage(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw validationError();
  const normalized = value.normalize("NFKC").replace(/\r\n?/gu, "\n").trim();
  if (normalized.length > FIELD_LIMITS.message || /\u0000/u.test(normalized)) throw validationError();
  return normalized;
}

function normalizeEmail(value) {
  const normalized = normalizeSingleLine(value, FIELD_LIMITS.email, true).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.includes("..")) throw validationError();
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1).replace(/\.+$/u, "");
  if (domain === "ibm.com" || domain.endsWith(".ibm.com")) {
    throw new PublicError(400, "EMAIL_DOMAIN_NOT_ALLOWED", PUBLIC_MESSAGES.ibmEmailNotAllowed);
  }
  return normalized;
}

function normalizeLinkedInUrl(value) {
  const normalized = normalizeSingleLine(value, FIELD_LIMITS.linkedinUrl, false);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    const isLinkedIn = hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
    if (url.protocol !== "https:" || !isLinkedIn || !/^\/(?:in|pub)\//u.test(url.pathname)) {
      throw new Error("invalid");
    }
    url.hash = "";
    return url.toString();
  } catch {
    throw validationError();
  }
}

function validationError() {
  return new PublicError(400, "VALIDATION_ERROR", PUBLIC_MESSAGES.invalidRequest);
}

export function validateResumeRequest(value) {
  const expected = [
    "name",
    "email",
    "company",
    "linkedinUrl",
    "message",
    "turnstileToken",
    "idempotencyKey",
  ];
  requireExpectedKeys(value, expected);

  const idempotencyKey = normalizeSingleLine(
    value.idempotencyKey,
    FIELD_LIMITS.idempotencyKey,
    true,
  );
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw validationError();

  return {
    name: normalizeSingleLine(value.name, FIELD_LIMITS.name, true),
    normalizedEmail: normalizeEmail(value.email),
    company: normalizeSingleLine(value.company, FIELD_LIMITS.company, true),
    linkedinUrl: normalizeLinkedInUrl(value.linkedinUrl),
    message: normalizeMessage(value.message),
    turnstileToken: normalizeSingleLine(
      value.turnstileToken,
      FIELD_LIMITS.turnstileToken,
      true,
    ),
    idempotencyKey,
  };
}

export function validateAccessBody(value) {
  requireExpectedKeys(value, ["token"]);
  if (typeof value.token !== "string" || value.token.length > FIELD_LIMITS.accessToken) {
    throw validationError();
  }
  const token = value.token.trim();
  if (!ACCESS_TOKEN_PATTERN.test(token)) throw validationError();
  return { token };
}

export function validateAdminLogin(value) {
  requireExpectedKeys(value, ["password", "turnstileToken"]);
  if (typeof value.password !== "string" || !value.password || value.password.length > FIELD_LIMITS.password) {
    throw validationError();
  }
  return {
    password: value.password,
    turnstileToken: normalizeSingleLine(
      value.turnstileToken,
      FIELD_LIMITS.turnstileToken,
      true,
    ),
  };
}

export function validateAdminQuery(url) {
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 10);
  const search = normalizeSingleLine(url.searchParams.get("search") || "", FIELD_LIMITS.search);
  const status = url.searchParams.get("status") || "all";
  const allowedStatuses = new Set([
    "all",
    "requested",
    "email-accepted",
    "access-opened",
    "download-delivered",
    "expired",
    "limit-reached",
    "email-failed",
  ]);

  if (
    !Number.isSafeInteger(page)
    || page < 1
    || !Number.isSafeInteger(pageSize)
    || pageSize < 1
    || pageSize > 50
    || !allowedStatuses.has(status)
  ) {
    throw validationError();
  }

  return { page, pageSize, search, status };
}
