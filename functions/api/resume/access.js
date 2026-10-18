import {
  PublicError,
  assertSameOrigin,
  jsonResponse,
  methodNotAllowed,
  publicErrorResponse,
  readJsonBody,
} from "../../_lib/http.js";
import { PUBLIC_MESSAGES } from "../../_lib/constants.js";
import { inspectResumeAccess } from "../../_lib/resume-service.js";
import { validateAccessBody } from "../../_lib/validation.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    let token;
    try {
      ({ token } = validateAccessBody(await readJsonBody(request, 1024)));
    } catch {
      throw new PublicError(404, "INVALID_LINK", PUBLIC_MESSAGES.invalidLink);
    }
    const result = await inspectResumeAccess({ env, request, token });
    return jsonResponse(result);
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("POST");
}
