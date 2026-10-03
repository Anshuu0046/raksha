/**
 * Central, lazily-read environment access. Values are read on each call so tests can
 * override process.env. Server-only secrets must never be read from client components;
 * only NEXT_PUBLIC_* values are inlined into the browser bundle by Next.js.
 */

function bool(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export function isDemoMode(): boolean {
  return bool(process.env.NEXT_PUBLIC_DEMO_MODE);
}

export function isTest(): boolean {
  return process.env.RAKSHA_TEST === "1" || process.env.NODE_ENV === "test";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction() && !isDemoMode()) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters in production.");
  }
  return "raksha-insecure-development-secret-change-me";
}

export const serverEnv = {
  databaseUrl: () => process.env.DATABASE_URL || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  // SMS
  smsProvider: () => (process.env.SMS_PROVIDER || "").toLowerCase(), // "twilio" | "msg91" | ""
  twilioSid: () => process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: () => process.env.TWILIO_AUTH_TOKEN || "",
  twilioApiKeySid: () => process.env.TWILIO_API_KEY_SID || "",
  twilioApiKeySecret: () => process.env.TWILIO_API_KEY_SECRET || "",
  twilioFrom: () => process.env.TWILIO_FROM_NUMBER || "",
  twilioMessagingServiceSid: () => process.env.TWILIO_MESSAGING_SERVICE_SID || "",
  msg91AuthKey: () => process.env.MSG91_AUTH_KEY || "",
  msg91SosTemplateId: () => process.env.MSG91_SOS_TEMPLATE_ID || "",
  msg91OtpTemplateId: () => process.env.MSG91_OTP_TEMPLATE_ID || "",
  msg91GenericTemplateId: () => process.env.MSG91_GENERIC_TEMPLATE_ID || "",
  // Email
  resendApiKey: () => process.env.RESEND_API_KEY || "",
  smtpUser: () => process.env.SMTP_USER || process.env.GMAIL_USER || "",
  smtpPass: () => (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
  emailFrom: () => process.env.EMAIL_FROM || "Raksha Alerts <alerts@example.com>",
  // Web push
  vapidPublicKey: () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: () => process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: () => process.env.VAPID_SUBJECT || "mailto:alerts@example.com",
  // Maps / places
  googlePlacesKey: () => process.env.GOOGLE_PLACES_API_KEY || "",
  overpassUrl: () => process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
  nominatimUrl: () => process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  geoContactEmail: () => process.env.GEOCODER_CONTACT_EMAIL || "",
  // Google OAuth
  googleClientId: () => process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: () => process.env.GOOGLE_CLIENT_SECRET || "",
  // Storage (Supabase Storage for recordings)
  supabaseUrl: () => (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  recordingsBucket: () => process.env.SUPABASE_RECORDINGS_BUCKET || "recordings",
  // Admin bootstrap: comma separated emails that are promoted to admin at signup/login.
  adminEmails: () =>
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
};

export function providerStatus() {
  return {
    database: serverEnv.databaseUrl() ? "postgres" : "memory",
    sms: serverEnv.smsProvider() || "none",
    email: serverEnv.resendApiKey() ? "resend" : "none",
    push: serverEnv.vapidPublicKey() && serverEnv.vapidPrivateKey() ? "web-push" : "none",
    places: serverEnv.googlePlacesKey() ? "google-places" : "openstreetmap",
    googleLogin: serverEnv.googleClientId() && serverEnv.googleClientSecret() ? "enabled" : "disabled",
    recordingStorage: serverEnv.supabaseUrl() && serverEnv.supabaseServiceKey() ? "supabase" : "memory",
    demoMode: isDemoMode(),
  } as const;
}
