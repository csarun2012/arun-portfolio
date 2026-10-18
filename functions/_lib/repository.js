export class D1ResumeRepository {
  constructor(db) {
    if (!db) throw new Error("DB binding is not configured");
    this.db = db;
  }

  async getByIdempotencyKey(idempotencyKey) {
    return this.db
      .prepare(
        `SELECT id, normalized_email, email_status, requested_at
         FROM resume_requests
         WHERE idempotency_key = ?1
         LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first();
  }

  async countRecentEmail(hashedEmail, since) {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM resume_requests
         WHERE hashed_email = ?1 AND requested_at >= ?2`,
      )
      .bind(hashedEmail, since)
      .first();
    return Number(row?.count || 0);
  }

  async countRecentIp(hashedIp, since) {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM resume_requests
         WHERE hashed_requester_ip = ?1 AND requested_at >= ?2`,
      )
      .bind(hashedIp, since)
      .first();
    return Number(row?.count || 0);
  }

  async insertRequest(record) {
    return this.db
      .prepare(
        `INSERT INTO resume_requests (
           id, name, normalized_email, hashed_email, company, linkedin_url, message,
           token_hash, requested_at, expires_at, maximum_downloads, download_count,
           email_status, hashed_requester_ip, idempotency_key
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 'pending', ?12, ?13)
         ON CONFLICT(idempotency_key) DO NOTHING
         RETURNING id`,
      )
      .bind(
        record.id,
        record.name,
        record.normalizedEmail,
        record.hashedEmail,
        record.company,
        record.linkedinUrl || null,
        record.message || null,
        record.tokenHash,
        record.requestedAt,
        record.expiresAt,
        record.maximumDownloads,
        record.hashedRequesterIp,
        record.idempotencyKey,
      )
      .first();
  }

  async markRequesterEmailAccepted(id, result, now) {
    await this.db
      .prepare(
        `UPDATE resume_requests
         SET email_status = 'accepted',
             email_attempted_at = ?2,
             email_sent_at = ?2,
             requester_gmail_message_id = ?3,
             requester_gmail_thread_id = ?4,
             email_failure_category = NULL
         WHERE id = ?1`,
      )
      .bind(id, now, result.id, result.threadId)
      .run();
  }

  async markRequesterEmailFailed(id, category, now) {
    await this.db
      .prepare(
        `UPDATE resume_requests
         SET email_status = 'failed',
             email_attempted_at = ?2,
             email_failure_category = ?3,
             admin_email_status = 'not_sent'
         WHERE id = ?1`,
      )
      .bind(id, now, category)
      .run();
  }

  async markAdminEmail(id, status, result, now) {
    await this.db
      .prepare(
        `UPDATE resume_requests
         SET admin_email_status = ?2,
             admin_email_sent_at = CASE WHEN ?2 = 'accepted' THEN ?3 ELSE admin_email_sent_at END,
             admin_gmail_message_id = ?4,
             admin_gmail_thread_id = ?5
         WHERE id = ?1`,
      )
      .bind(id, status, now, result?.id || null, result?.threadId || null)
      .run();
  }

  async findByTokenHash(tokenHash) {
    return this.db
      .prepare(
        `SELECT id, expires_at, maximum_downloads, download_count
         FROM resume_requests
         WHERE token_hash = ?1
         LIMIT 1`,
      )
      .bind(tokenHash)
      .first();
  }

  async recordAccess(requestId, hashedIp, now, metadata = null) {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE resume_requests
           SET first_accessed_at = COALESCE(first_accessed_at, ?2),
               last_accessed_at = ?2
           WHERE id = ?1`,
        )
        .bind(requestId, now),
      this.db
        .prepare(
          `INSERT INTO resume_access_events (request_id, event_type, occurred_at, hashed_ip, metadata)
           VALUES (?1, 'access_page_opened', ?2, ?3, ?4)`,
        )
        .bind(requestId, now, hashedIp, metadata),
    ]);
  }

  async recordEvent(requestId, eventType, hashedIp, now, metadata = null) {
    await this.db
      .prepare(
        `INSERT INTO resume_access_events (request_id, event_type, occurred_at, hashed_ip, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(requestId, eventType, now, hashedIp, metadata)
      .run();
  }

  async claimDownload(tokenHash, now) {
    return this.db
      .prepare(
        `UPDATE resume_requests
         SET download_count = download_count + 1,
             first_download_at = COALESCE(first_download_at, ?2),
             last_download_at = ?2
         WHERE token_hash = ?1
           AND expires_at > ?2
           AND download_count < maximum_downloads
         RETURNING id, download_count, maximum_downloads`,
      )
      .bind(tokenHash, now)
      .first();
  }

  async recordDownload(requestId, hashedIp, now, deliveredCount) {
    await this.recordEvent(
      requestId,
      "download_delivered",
      hashedIp,
      now,
      JSON.stringify({ deliveredCount }),
    );
  }

  async countRecentAdminLoginAttempts(hashedIp, since) {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM admin_login_attempts
         WHERE hashed_ip = ?1 AND attempted_at >= ?2 AND succeeded = 0`,
      )
      .bind(hashedIp, since)
      .first();
    return Number(row?.count || 0);
  }

  async recordAdminLoginAttempt(hashedIp, now, succeeded) {
    await this.db
      .prepare(
        `INSERT INTO admin_login_attempts (hashed_ip, attempted_at, succeeded)
         VALUES (?1, ?2, ?3)`,
      )
      .bind(hashedIp, now, succeeded ? 1 : 0)
      .run();
  }

  async listAdminRequests({ page, pageSize, search, status, now }) {
    const statusExpression = `
      CASE
        WHEN expires_at <= ?1 THEN 'expired'
        WHEN download_count >= maximum_downloads THEN 'limit-reached'
        WHEN email_status = 'failed' THEN 'email-failed'
        WHEN download_count > 0 THEN 'download-delivered'
        WHEN first_accessed_at IS NOT NULL THEN 'access-opened'
        WHEN email_status = 'accepted' THEN 'email-accepted'
        ELSE 'requested'
      END`;
    const searchPattern = `%${search.replace(/[\\%_]/gu, "\\$&")}%`;
    const statusFilter = status === "all" ? "" : "AND current_status = ?3";
    const offset = (page - 1) * pageSize;
    const baseSelect = `
      SELECT
        id, name, normalized_email, company, linkedin_url,
        CASE WHEN message IS NOT NULL AND message <> '' THEN 1 ELSE 0 END AS has_message,
        requested_at, email_status, email_sent_at, expires_at,
        maximum_downloads, download_count, first_accessed_at, last_accessed_at,
        last_download_at, ${statusExpression} AS current_status
      FROM resume_requests
      WHERE (
        ?2 = '%%'
        OR name LIKE ?2 ESCAPE '\\'
        OR normalized_email LIKE ?2 ESCAPE '\\'
        OR company LIKE ?2 ESCAPE '\\'
      )`;
    const bindValues = status === "all"
      ? [now, searchPattern, pageSize, offset]
      : [now, searchPattern, status, pageSize, offset];
    const limitIndex = status === "all" ? 3 : 4;
    const offsetIndex = status === "all" ? 4 : 5;
    const dataStatement = this.db
      .prepare(
        `SELECT *
         FROM (${baseSelect})
         WHERE 1 = 1 ${statusFilter}
         ORDER BY requested_at DESC
         LIMIT ?${limitIndex} OFFSET ?${offsetIndex}`,
      )
      .bind(...bindValues);
    const countBindValues = status === "all"
      ? [now, searchPattern]
      : [now, searchPattern, status];
    const countStatement = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM (${baseSelect})
         WHERE 1 = 1 ${statusFilter}`,
      )
      .bind(...countBindValues);

    const [dataResult, countResult] = await this.db.batch([dataStatement, countStatement]);
    return {
      rows: dataResult.results || [],
      total: Number(countResult.results?.[0]?.count || 0),
    };
  }
}

export function getRepository(env) {
  return env.__TEST_REPOSITORY || new D1ResumeRepository(env.DB);
}
