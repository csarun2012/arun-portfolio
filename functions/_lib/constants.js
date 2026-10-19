export const ACCESS_TOKEN_BYTES = 32;
export const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_DOWNLOADS = 3;

export const REQUEST_LIMITS = Object.freeze({
  emailPerDay: 3,
  ipPerHour: 5,
  adminLoginPerFifteenMinutes: 5,
});

export const FIELD_LIMITS = Object.freeze({
  name: 100,
  email: 254,
  company: 160,
  linkedinUrl: 300,
  message: 1000,
  turnstileToken: 2048,
  idempotencyKey: 64,
  accessToken: 128,
  password: 1024,
  search: 100,
});

export const PUBLIC_MESSAGES = Object.freeze({
  invalidRequest: "Please check the form and try again.",
  ibmEmailNotAllowed: "This email domain is not eligible for resume delivery. Please use another email address.",
  verificationFailed: "Verification could not be completed. Please try again.",
  rateLimited: "Too many requests have been made. Please try again later.",
  emailUnavailable: "The email could not be sent right now. Please try again later.",
  temporaryFailure: "The request could not be completed right now. Please try again later.",
  invalidLink: "This resume access link is invalid.",
  expiredLink: "This resume access link has expired.",
  limitReached: "This resume access link has reached its delivery limit.",
  resumeUnavailable: "The resume file is temporarily unavailable. Please try again later.",
  unauthorized: "Authentication is required.",
});

export const TEST_TURNSTILE = Object.freeze({
  alwaysPassSiteKey: "1x00000000000000000000AA",
  alwaysPassSecret: "1x0000000000000000000000000000000AA",
  dummyHostname: "dummy-key-pass.cloudflare.com",
});
