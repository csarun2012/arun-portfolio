import { PUBLIC_MESSAGES } from "./constants.js";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export class PublicError extends Error {
  constructor(status, code, publicMessage) {
    super(code);
    this.name = "PublicError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function jsonResponse(payload, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...additionalHeaders,
    },
  });
}

export function publicErrorResponse(error) {
  if (error instanceof PublicError) {
    return jsonResponse(
      { ok: false, code: error.code, message: error.publicMessage },
      error.status,
    );
  }

  return jsonResponse(
    { ok: false, code: "TEMPORARY_FAILURE", message: PUBLIC_MESSAGES.temporaryFailure },
    500,
  );
}

export function methodNotAllowed(allowed = "POST") {
  return jsonResponse(
    { ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    405,
    { Allow: allowed },
  );
}

export function assertSameOrigin(request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (!origin || origin !== requestUrl.origin) {
    throw new PublicError(403, "ORIGIN_REJECTED", PUBLIC_MESSAGES.invalidRequest);
  }
  if (fetchSite && fetchSite !== "same-origin") {
    throw new PublicError(403, "ORIGIN_REJECTED", PUBLIC_MESSAGES.invalidRequest);
  }
}

export async function readJsonBody(request, maxBytes = 16_384) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new PublicError(415, "UNSUPPORTED_FORMAT", PUBLIC_MESSAGES.invalidRequest);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) {
    throw new PublicError(413, "REQUEST_TOO_LARGE", PUBLIC_MESSAGES.invalidRequest);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new PublicError(413, "REQUEST_TOO_LARGE", PUBLIC_MESSAGES.invalidRequest);
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
    return parsed;
  } catch {
    throw new PublicError(400, "INVALID_JSON", PUBLIC_MESSAGES.invalidRequest);
  }
}

export function getRequesterIp(request) {
  return request.headers.get("CF-Connecting-IP")?.trim() || "local-or-unknown";
}

export function responseSecurityHeaders(additional = {}) {
  return { ...SECURITY_HEADERS, ...additional };
}

