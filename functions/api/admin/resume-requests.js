import { verifyAdminSession } from "../../_lib/auth.js";
import { PUBLIC_MESSAGES } from "../../_lib/constants.js";
import {
  PublicError,
  jsonResponse,
  methodNotAllowed,
  publicErrorResponse,
} from "../../_lib/http.js";
import { getRepository } from "../../_lib/repository.js";
import { validateAdminQuery } from "../../_lib/validation.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!(await verifyAdminSession(request, env))) {
      throw new PublicError(401, "UNAUTHORIZED", PUBLIC_MESSAGES.unauthorized);
    }
    const query = validateAdminQuery(new URL(request.url));
    const repository = getRepository(env);
    const result = await repository.listAdminRequests({
      ...query,
      now: new Date().toISOString(),
    });
    return jsonResponse({
      ok: true,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      requests: result.rows,
    });
  } catch (error) {
    return publicErrorResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed("GET");
}

