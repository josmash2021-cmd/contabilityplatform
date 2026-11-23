export const Session = {
  cookieName: "kimi_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

/** The version of the Terms of Use and Privacy Policy a new account accepts (saved in userConsents). Change it with the text. */
export const TERMS_VERSION = "2026-11-23";

/** The public contact address shown in the Terms of Use, the tax service terms and the Privacy Policy. */
export const CONTACT_EMAIL = "team@personalandbusinesssolution.com";
