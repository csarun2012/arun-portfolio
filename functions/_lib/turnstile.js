import { PUBLIC_MESSAGES, TEST_TURNSTILE } from "./constants.js";
import { PublicError, getRequesterIp } from "./http.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function hostnameMatchesRequest(resultHostname, request, env) {
  const requestHostname = new URL(request.url).hostname.toLowerCase();
  const configuredHostname = new URL(env.PUBLIC_BASE_URL).hostname.toLowerCase();
  const result = String(resultHostname || "").toLowerCase();
  const isLocal = requestHostname === "localhost" || requestHostname === "127.0.0.1";
  const usesOfficialTestSecret = env.TURNSTILE_SECRET === TEST_TURNSTILE.alwaysPassSecret;

  if (isLocal && usesOfficialTestSecret && result === TEST_TURNSTILE.dummyHostname) return true;
  if (isLocal) return result === requestHostname;

  if (requestHostname === configuredHostname) return result === configuredHostname;

  const isPagesPreview = requestHostname.endsWith(`.${configuredHostname}`);
  return isPagesPreview && result === requestHostname;
}

export async function verifyTurnstile({
  env,
  request,
  token,
  action,
  idempotencyKey,
  fetcher = fetch,
}) {
  if (!env.TURNSTILE_SECRET || !env.PUBLIC_BASE_URL) {
    throw new Error("Turnstile is not configured");
  }

  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
    remoteip: getRequesterIp(request),
  });
  if (idempotencyKey) form.set("idempotency_key", idempotencyKey);

  let response;
  try {
    response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
  } catch {
    throw new PublicError(503, "VERIFICATION_UNAVAILABLE", PUBLIC_MESSAGES.verificationFailed);
  }

  if (!response.ok) {
    throw new PublicError(503, "VERIFICATION_UNAVAILABLE", PUBLIC_MESSAGES.verificationFailed);
  }

  const result = await response.json();
  if (
    result.success !== true
    || result.action !== action
    || !hostnameMatchesRequest(result.hostname, request, env)
  ) {
    throw new PublicError(400, "VERIFICATION_FAILED", PUBLIC_MESSAGES.verificationFailed);
  }

  return {
    challengeTimestamp: result.challenge_ts || null,
    hostname: result.hostname,
  };
}

