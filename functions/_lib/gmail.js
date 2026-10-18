const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const encoder = new TextEncoder();

function utf8Base64(value) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(value) {
  return utf8Base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function wrapBase64(value) {
  return utf8Base64(value).match(/.{1,76}/gu)?.join("\r\n") || "";
}

function encodeHeader(value) {
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

function safeHeaderAddress(value) {
  if (/[\r\n]/u.test(value)) throw new Error("Invalid email header");
  return value;
}

function buildMime({ from, to, subject, plainText, html }) {
  const boundary = `resume_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines = [
    `From: ${safeHeaderAddress(from)}`,
    `To: ${safeHeaderAddress(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(plainText),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

function requiredGmailConfig(env) {
  const keys = [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "GMAIL_FROM_EMAIL",
    "ADMIN_EMAIL",
  ];
  for (const key of keys) {
    if (!env[key]) throw new Error(`${key} is not configured`);
  }
}

export function createGmailClient(env, fetcher = fetch) {
  requiredGmailConfig(env);

  async function getAccessToken() {
    const response = await fetcher(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error("Gmail OAuth token exchange failed");
    const body = await response.json();
    if (!body.access_token) throw new Error("Gmail OAuth response omitted access token");
    return body.access_token;
  }

  async function send(accessToken, message) {
    const raw = base64Url(buildMime(message));
    const response = await fetcher(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) throw new Error("Gmail message send failed");
    const result = await response.json();
    if (!result.id) throw new Error("Gmail response omitted message id");
    return { id: result.id, threadId: result.threadId || null };
  }

  return { getAccessToken, send };
}

export function requesterMessage(env, requestData, accessUrl) {
  const safeName = escapeHtml(requestData.name);
  const safeAccessUrl = escapeHtml(accessUrl);
  const from = `Arun C S <${env.GMAIL_FROM_EMAIL}>`;
  const subject = "Arun C S — Staff Software Engineer Resume";
  const plainText = [
    `Hello ${requestData.name},`,
    "",
    "Thank you for your interest in my work.",
    "",
    `Access Resume: ${accessUrl}`,
    "",
    "This private link expires in one hour and allows up to three resume delivery attempts.",
    "The request originated from aruncs.pages.dev.",
    "",
    "Regards,",
    "Arun C S",
    "Staff Software Engineer",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#050608;color:#f5f7fb;font-family:Arial,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:40px 24px">
<p style="margin:0 0 18px;color:#7d9cff;font-size:13px;text-transform:uppercase;letter-spacing:.1em">Arun C S · Staff Software Engineer</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2">Hello ${safeName},</h1>
<p style="color:#c7cbd2;line-height:1.7">Thank you for your interest in my work. Your private resume access link is ready.</p>
<p style="margin:28px 0"><a href="${safeAccessUrl}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#2589ff;color:#fff;text-decoration:none;font-weight:700">Access Resume</a></p>
<p style="color:#aeb6c2;line-height:1.7">The link expires in one hour and permits up to three delivery attempts. It originated from <strong>aruncs.pages.dev</strong>.</p>
<p style="color:#7d8694;font-size:13px;line-height:1.6;word-break:break-all">If the button does not work, copy this link:<br><a href="${safeAccessUrl}" style="color:#7d9cff">${safeAccessUrl}</a></p>
<p style="margin-top:34px;color:#c7cbd2;line-height:1.6">Regards,<br><strong>Arun C S</strong><br>Staff Software Engineer</p>
</div></body></html>`;
  return { from, to: requestData.normalizedEmail, subject, plainText, html };
}

export function adminMessage(env, requestData, requestedAt, expiresAt) {
  const dashboardUrl = `${env.PUBLIC_BASE_URL.replace(/\/+$/u, "")}/admin/resume-requests/`;
  const optional = [
    requestData.linkedinUrl ? `LinkedIn: ${requestData.linkedinUrl}` : null,
    requestData.message ? `Message: ${requestData.message}` : null,
  ].filter(Boolean);
  const plainText = [
    "A new resume request was accepted by Gmail.",
    "",
    `Name: ${requestData.name}`,
    `Email: ${requestData.normalizedEmail}`,
    `Company: ${requestData.company}`,
    ...optional,
    `Requested (UTC): ${requestedAt}`,
    `Expires (UTC): ${expiresAt}`,
    "",
    `Private dashboard: ${dashboardUrl}`,
  ].join("\n");
  const details = [
    ["Name", requestData.name],
    ["Email", requestData.normalizedEmail],
    ["Company", requestData.company],
    ...(requestData.linkedinUrl ? [["LinkedIn", requestData.linkedinUrl]] : []),
    ...(requestData.message ? [["Message", requestData.message]] : []),
    ["Requested (UTC)", requestedAt],
    ["Expires (UTC)", expiresAt],
  ]
    .map(([label, value]) => `<p style="margin:8px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join("");
  const html = `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;color:#151922">
<h1 style="font-size:24px">New resume request</h1>
<p>The requester email was accepted by Gmail.</p>
${details}
<p style="margin-top:24px"><a href="${escapeHtml(dashboardUrl)}">Open private dashboard</a></p>
</body></html>`;
  return {
    from: `Arun C S <${env.GMAIL_FROM_EMAIL}>`,
    to: env.ADMIN_EMAIL,
    subject: `Resume request — ${requestData.name} at ${requestData.company}`,
    plainText,
    html,
  };
}
