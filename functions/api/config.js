import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

export function onRequestGet({ env }) {
  if (!env.TURNSTILE_SITE_KEY) {
    return jsonResponse(
      { ok: false, code: "CONFIG_UNAVAILABLE", message: "Verification is temporarily unavailable." },
      503,
    );
  }
  return jsonResponse({
    ok: true,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
  });
}

export function onRequest() {
  return methodNotAllowed("GET");
}

