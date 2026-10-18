import {
  assertSameOrigin,
  jsonResponse,
  methodNotAllowed,
  publicErrorResponse,
  readJsonBody,
} from "../../_lib/http.js";
import { createResumeRequest } from "../../_lib/resume-service.js";
import { validateResumeRequest } from "../../_lib/validation.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const data = validateResumeRequest(body);
    const result = await createResumeRequest({
      env,
      request,
      data,
      fetcher: env.__TEST_FETCH || fetch,
    });
    return jsonResponse(result, 200);
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("POST");
}

