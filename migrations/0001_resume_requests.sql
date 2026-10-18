CREATE TABLE IF NOT EXISTS resume_requests (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  hashed_email TEXT NOT NULL,
  company TEXT NOT NULL,
  linkedin_url TEXT,
  message TEXT,
  token_hash TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  maximum_downloads INTEGER NOT NULL DEFAULT 3 CHECK (maximum_downloads = 3),
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  first_accessed_at TEXT,
  last_accessed_at TEXT,
  first_download_at TEXT,
  last_download_at TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'accepted', 'failed')),
  email_attempted_at TEXT,
  email_sent_at TEXT,
  email_failure_category TEXT,
  requester_gmail_message_id TEXT,
  requester_gmail_thread_id TEXT,
  admin_email_status TEXT NOT NULL DEFAULT 'pending' CHECK (admin_email_status IN ('pending', 'accepted', 'failed', 'not_sent')),
  admin_email_sent_at TEXT,
  admin_gmail_message_id TEXT,
  admin_gmail_thread_id TEXT,
  hashed_requester_ip TEXT NOT NULL,
  idempotency_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'access_page_opened',
    'download_delivered',
    'expired',
    'download_limit_reached'
  )),
  occurred_at TEXT NOT NULL,
  hashed_ip TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (request_id) REFERENCES resume_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hashed_ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK (succeeded IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_requests_token_hash
  ON resume_requests(token_hash);
CREATE INDEX IF NOT EXISTS idx_resume_requests_normalized_email
  ON resume_requests(normalized_email);
CREATE INDEX IF NOT EXISTS idx_resume_requests_hashed_email_requested
  ON resume_requests(hashed_email, requested_at);
CREATE INDEX IF NOT EXISTS idx_resume_requests_hashed_ip_requested
  ON resume_requests(hashed_requester_ip, requested_at);
CREATE INDEX IF NOT EXISTS idx_resume_requests_requested_at
  ON resume_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_resume_requests_expires_at
  ON resume_requests(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_requests_idempotency_key
  ON resume_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_resume_access_events_request_time
  ON resume_access_events(request_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time
  ON admin_login_attempts(hashed_ip, attempted_at);

