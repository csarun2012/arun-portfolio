import {
  base64UrlToBytes,
  bytesToBase64Url,
  randomToken,
  signHmac,
  verifyHmac,
  verifyPassword,
} from "./crypto.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ADMIN_COOKIE_NAME = "__Host-resume_admin";
export const ADMIN_SESSION_SECONDS = 60 * 60;

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

export async function verifyAdminPassword(password, env) {
  return verifyPassword(password, env.ADMIN_PASSWORD_HASH);
}

export async function createAdminSession(env, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = {
    iat: issuedAt,
    exp: issuedAt + ADMIN_SESSION_SECONDS,
    nonce: randomToken(16),
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signHmac(encodedPayload, env.ADMIN_SESSION_SECRET);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSession(request, env, now = new Date()) {
  const value = parseCookies(request.headers.get("Cookie")).get(ADMIN_COOKIE_NAME);
  if (!value) return false;
  const [payloadPart, signaturePart, extra] = value.split(".");
  if (!payloadPart || !signaturePart || extra) return false;
  if (!(await verifyHmac(payloadPart, signaturePart, env.ADMIN_SESSION_SECRET))) return false;

  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart)));
    const current = Math.floor(now.getTime() / 1000);
    return (
      Number.isSafeInteger(payload.iat)
      && Number.isSafeInteger(payload.exp)
      && typeof payload.nonce === "string"
      && payload.iat <= current + 30
      && payload.exp > current
      && payload.exp - payload.iat === ADMIN_SESSION_SECONDS
    );
  } catch {
    return false;
  }
}

export function adminSessionCookie(value) {
  return `${ADMIN_COOKIE_NAME}=${value}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedAdminSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

