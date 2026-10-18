import { clearedAdminSessionCookie } from "../../_lib/auth.js";
import {
  assertSameOrigin,
  jsonResponse,
  methodNotAllowed,
  publicErrorResponse,
} from "../../_lib/http.js";

export function onRequestPost({ request }) {
  try {
    assertSameOrigin(request);
    return jsonResponse(
      { ok: true },
      200,
      { "Set-Cookie": clearedAdminSessionCookie() },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("POST");
}

