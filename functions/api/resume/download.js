import {
  PublicError,
  assertSameOrigin,
  methodNotAllowed,
  publicErrorResponse,
  readJsonBody,
  responseSecurityHeaders,
} from "../../_lib/http.js";
import { PUBLIC_MESSAGES } from "../../_lib/constants.js";
import { deliverResume } from "../../_lib/resume-service.js";
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
    const result = await deliverResume({ env, request, token });
    return new Response(result.pdf, {
      status: 200,
      headers: responseSecurityHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Arun-CS-Staff-Software-Engineer-Resume.pdf"',
        "Content-Length": String(result.pdf.byteLength),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Resume-Delivery": `${result.deliveredCount}/${result.maximumDownloads}`,
      }),
    });
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("POST");
}
