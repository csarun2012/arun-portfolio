import { REQUEST_LIMITS, PUBLIC_MESSAGES } from "../../_lib/constants.js";
import { createAdminSession, adminSessionCookie, verifyAdminPassword } from "../../_lib/auth.js";
import { saltedHash } from "../../_lib/crypto.js";
import {
  PublicError,
  assertSameOrigin,
  getRequesterIp,
  jsonResponse,
  methodNotAllowed,
  publicErrorResponse,
  readJsonBody,
} from "../../_lib/http.js";
import { getRepository } from "../../_lib/repository.js";
import { verifyTurnstile } from "../../_lib/turnstile.js";
import { validateAdminLogin } from "../../_lib/validation.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const data = validateAdminLogin(await readJsonBody(request, 4096));
    await verifyTurnstile({
      env,
      request,
      token: data.turnstileToken,
      action: "admin_login",
      fetcher: env.__TEST_FETCH || fetch,
    });

    const repository = getRepository(env);
    const now = new Date();
    const hashedIp = await saltedHash(getRequesterIp(request), env.RATE_LIMIT_SALT);
    const since = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const attempts = await repository.countRecentAdminLoginAttempts(hashedIp, since);
    if (attempts >= REQUEST_LIMITS.adminLoginPerFifteenMinutes) {
      throw new PublicError(429, "RATE_LIMITED", PUBLIC_MESSAGES.rateLimited);
    }

    const accepted = await verifyAdminPassword(data.password, env);
    await repository.recordAdminLoginAttempt(hashedIp, now.toISOString(), accepted);
    if (!accepted) {
      throw new PublicError(401, "LOGIN_REJECTED", "Sign-in was not accepted.");
    }

    const session = await createAdminSession(env, now);
    return jsonResponse(
      { ok: true },
      200,
      { "Set-Cookie": adminSessionCookie(session) },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("POST");
}

