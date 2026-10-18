import { verifyAdminSession } from "../../_lib/auth.js";
import { jsonResponse, methodNotAllowed } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  return jsonResponse({ ok: true, authenticated: await verifyAdminSession(request, env) });
}

export function onRequest() {
  return methodNotAllowed("GET");
}

