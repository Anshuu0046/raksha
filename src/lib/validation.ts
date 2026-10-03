import { z } from "zod";
import { RELATIONSHIPS, TRIGGER_METHODS } from "@/types";
import { LOCALES } from "@/lib/i18n/config";

/**
 * Normalises a phone number to E.164. Bare 10-digit Indian mobile numbers get +91.
 * Returns null when the input cannot be a valid number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!hasPlus) {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
    return null;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number.")
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 98765 43210 or +91 98765 43210." });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Name is too long.");
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.");

export const localeSchema = z.enum(LOCALES);

export const latSchema = z.number().finite().min(-90).max(90);
export const lngSchema = z.number().finite().min(-180).max(180);

export const locationInputSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracy: z.number().finite().min(0).max(100_000).nullable().optional(),
  speed: z.number().finite().min(0).max(500).nullable().optional(),
  heading: z.number().finite().min(0).max(360).nullable().optional(),
  /** Device time of the fix; clamped server-side. */
  recordedAt: z.string().datetime().optional(),
});

export const batterySchema = z.number().min(0).max(1).nullable().optional();

// ---------- Auth ----------
export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.optional(),
  client: z.enum(["web", "android"]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
  client: z.enum(["web", "android"]).optional(),
});

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  name: nameSchema.optional(),
  client: z.enum(["web", "android"]).optional(),
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

// ---------- Profile ----------
export const preferencesSchema = z
  .object({
    holdDurationMs: z.number().int().min(1500).max(3000),
    tripleTapEnabled: z.boolean(),
    autoRecordAudio: z.boolean(),
    uploadRecordings: z.boolean(),
    checkInGraceMinutes: z.number().int().min(1).max(60),
    shareLocationOnEscalation: z.boolean(),
    region: z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/),
  })
  .partial();

export const profileUpdateSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  locale: localeSchema.optional(),
  preferences: preferencesSchema.optional(),
  /** A small client-resized photo (data URL) or an https URL (e.g. from Google). */
  avatarUrl: z
    .union([z.string().url().startsWith("https://").max(500), z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(60_000)])
    .nullable()
    .optional(),
  onboarded: z.boolean().optional(),
});

// ---------- Contacts ----------
const contactBase = z.object({
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  relationship: z.enum(RELATIONSHIPS),
  customRelationship: z.string().trim().max(40).nullable().optional(),
  locale: localeSchema.optional(),
  notifySms: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
});

export const contactCreateSchema = contactBase.refine((c) => Boolean(c.phone || c.email), {
  message: "Add a phone number or an email so this contact can be reached.",
  path: ["phone"],
});

export const contactUpdateSchema = contactBase.partial();

// ---------- Emergency ----------
export const triggerSchema = z.object({
  /** Client-generated idempotency key so retries never create duplicate emergencies. */
  clientEventId: z.string().uuid(),
  method: z.enum(TRIGGER_METHODS).default("hold"),
  location: locationInputSchema.nullable().optional(),
  batteryLevel: batterySchema,
  /** Device time when SOS was pressed (may be earlier than the request if queued offline). */
  triggeredAt: z.string().datetime().optional(),
});

export const locationUpdateSchema = z.object({
  eventId: z.string().uuid(),
  locations: z.array(locationInputSchema).min(1).max(50),
  batteryLevel: batterySchema,
});

export const cancelSchema = z
  .object({
    eventId: z.string().uuid().optional(),
    /** Lets a client cancel an SOS whose trigger response never arrived (lost on a bad network). */
    clientEventId: z.string().uuid().optional(),
    reason: z.enum(["safe", "mistake", "other"]),
  })
  .refine((v) => Boolean(v.eventId || v.clientEventId), { message: "eventId or clientEventId is required.", path: ["eventId"] });

export const shareCreateSchema = z.object({
  eventId: z.string().uuid(),
  /** Revoke every existing link first (e.g. a link was forwarded to the wrong person). */
  revokeExisting: z.boolean().optional(),
});

// ---------- Notifications ----------
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const notificationSendSchema = z.object({
  kind: z.enum(["test"]),
  contactId: z.string().uuid(),
  channels: z.array(z.enum(["sms", "email", "push"])).min(1).optional(),
});

// ---------- Check-in & journey ----------
export const checkInStartSchema = z.object({
  minutes: z.number().int().min(1).max(24 * 60),
  note: z.string().trim().max(140).nullable().optional(),
  location: locationInputSchema.nullable().optional(),
});

export const checkInCompleteSchema = z.object({
  checkInId: z.string().uuid(),
  action: z.enum(["complete", "cancel", "extend"]).default("complete"),
  extendMinutes: z.number().int().min(5).max(240).optional(),
});

export const journeyStartSchema = z.object({
  destinationLabel: z.string().trim().min(1, "Enter a destination.").max(140),
  destination: z.object({ lat: latSchema, lng: lngSchema }).nullable().optional(),
  expectedArrivalAt: z.string().datetime(),
  graceMinutes: z.number().int().min(5).max(120).default(15),
  contactIds: z.array(z.string().uuid()).min(1, "Choose at least one trusted contact.").max(10),
  location: locationInputSchema.nullable().optional(),
});

export const journeyUpdateSchema = z.object({
  journeyId: z.string().uuid(),
  location: locationInputSchema,
});

export const journeyCompleteSchema = z.object({
  journeyId: z.string().uuid(),
  action: z.enum(["arrived", "cancel"]).default("arrived"),
});

// ---------- Maps ----------
export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  category: z.enum(["police", "hospital", "clinic", "pharmacy", "emergency", "all"]).default("all"),
  radius: z.coerce.number().int().min(500).max(20_000).default(5000),
});

export const reverseGeocodeSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const geocodeSearchSchema = z.object({
  q: z.string().trim().min(2).max(140),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

// ---------- Admin ----------
export const emergencyNumberSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,60}$/),
  country: z.string().regex(/^[A-Z]{2}$/).default("IN"),
  region: z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/),
  name: z.string().trim().min(2).max(80),
  purpose: z.string().trim().min(2).max(240),
  number: z.string().trim().regex(/^[0-9+ -]{3,20}$/, "Digits, spaces, + and - only."),
  category: z.enum(["emergency", "police", "ambulance", "women", "child", "fire", "disaster", "cyber", "other"]),
  availabilityNotes: z.string().trim().max(400).default(""),
  priority: z.number().int().min(0).max(1000).default(100),
  active: z.boolean().default(true),
});
