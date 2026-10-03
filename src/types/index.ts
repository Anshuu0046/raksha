/**
 * Domain types shared by the web client, API routes, and (via the documented JSON API)
 * the native Android client. All timestamps are ISO-8601 strings in UTC.
 */

export type Role = "user" | "admin";

export const RELATIONSHIPS = [
  "mother",
  "father",
  "brother",
  "sister",
  "partner",
  "friend",
  "relative",
  "custom",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const CHANNELS = ["sms", "email", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

export type NotificationKind =
  | "sos"
  | "test"
  | "emergency_ended"
  | "checkin_reminder"
  | "checkin_escalation"
  | "journey_reminder"
  | "journey_escalation";

export type NotificationStatus = "pending" | "sent" | "failed" | "simulated" | "skipped";

export type EmergencyStatus = "active" | "cancelled" | "resolved";

export const TRIGGER_METHODS = [
  "hold",
  "triple_tap",
  "keyboard",
  "hardware_volume",
  "hardware_power",
  "widget",
  "lock_screen",
  "checkin_missed",
  "journey_overdue",
  "api",
] as const;
export type TriggerMethod = (typeof TRIGGER_METHODS)[number];

export type ClientKind = "web" | "android";

export interface UserPreferences {
  /** Press-and-hold duration for SOS, ms (1500–3000). */
  holdDurationMs: number;
  tripleTapEnabled: boolean;
  /** Start audio recording automatically when SOS triggers (still needs mic permission). */
  autoRecordAudio: boolean;
  /** Upload recordings to secure storage after the emergency. Off = device only. */
  uploadRecordings: boolean;
  /** Minutes after a missed check-in before trusted contacts are notified. */
  checkInGraceMinutes: number;
  /** Include a live-location link when a missed check-in / overdue journey escalates. */
  shareLocationOnEscalation: boolean;
  /** ISO 3166-2 region used to pick helplines, e.g. "IN" or "IN-OR". */
  region: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  holdDurationMs: 2000,
  tripleTapEnabled: true,
  autoRecordAudio: false,
  uploadRecordings: false,
  checkInGraceMinutes: 10,
  shareLocationOnEscalation: true,
  region: "IN",
};

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: Role;
  locale: string;
  passwordHash: string | null;
  googleSub: string | null;
  preferences: UserPreferences;
  avatarUrl: string | null;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The user as returned to the client. Never includes credentials. */
export type PublicUser = Omit<User, "passwordHash" | "googleSub"> & {
  hasPassword: boolean;
  googleLinked: boolean;
};

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  client: ClientKind;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export type AuthTokenPurpose = "password_reset";

export interface AuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface OtpCode {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: Relationship;
  customRelationship: string | null;
  /** Language used for this contact's SMS/email/push. */
  locale: string;
  notifySms: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  isPrimary: boolean;
  /** Hash of the token in the contact's "enable instant alerts" invite link. */
  alertTokenHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string | null;
  contactId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  failureCount: number;
  createdAt: string;
}

export interface EmergencyEvent {
  id: string;
  userId: string;
  status: EmergencyStatus;
  triggerMethod: TriggerMethod;
  clientEventId: string | null;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  startLat: number | null;
  startLng: number | null;
  startAccuracy: number | null;
  address: string | null;
  batteryLevel: number | null;
  isDemo: boolean;
  /** Check-in or journey id when the event came from an escalation. */
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyLocation {
  id: string;
  eventId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  batteryLevel: number | null;
  recordedAt: string;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  eventId: string;
  /** The contact this link was minted for, or null for a link the user shared manually. */
  contactId: string | null;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  eventId: string | null;
  checkInId: string | null;
  journeyId: string | null;
  contactId: string | null;
  channel: Channel;
  kind: NotificationKind;
  status: NotificationStatus;
  provider: string | null;
  providerMessageId: string | null;
  recipientMasked: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

export type CheckInStatus = "active" | "completed" | "escalated" | "cancelled";

export interface CheckIn {
  id: string;
  userId: string;
  status: CheckInStatus;
  startedAt: string;
  dueAt: string;
  graceMinutes: number;
  reminderSentAt: string | null;
  escalatedAt: string | null;
  completedAt: string | null;
  note: string | null;
  lastLat: number | null;
  lastLng: number | null;
  eventId: string | null;
}

export type JourneyStatus = "active" | "completed" | "escalated" | "cancelled";

export interface SafeJourney {
  id: string;
  userId: string;
  status: JourneyStatus;
  destinationLabel: string;
  destLat: number | null;
  destLng: number | null;
  startLat: number | null;
  startLng: number | null;
  startedAt: string;
  expectedArrivalAt: string;
  graceMinutes: number;
  contactIds: string[];
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  reminderSentAt: string | null;
  completedAt: string | null;
  escalatedAt: string | null;
  eventId: string | null;
}

export type HelplineCategory =
  | "emergency"
  | "police"
  | "ambulance"
  | "women"
  | "child"
  | "fire"
  | "disaster"
  | "cyber"
  | "other";

export interface EmergencyNumber {
  id: string;
  country: string;
  /** "IN" for nationwide, or an ISO 3166-2 code such as "IN-OR". */
  region: string;
  name: string;
  purpose: string;
  number: string;
  category: HelplineCategory;
  availabilityNotes: string;
  priority: number;
  active: boolean;
  updatedAt: string;
}

export interface Recording {
  id: string;
  userId: string;
  eventId: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  createdAt: string;
}

export type AuditActor = "user" | "admin" | "system" | "contact";

export interface AuditLog {
  id: string;
  userId: string | null;
  actor: AuditActor;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Status payload returned to the user's own client during an emergency. */
export interface EmergencyStatusPayload {
  event: EmergencyEvent;
  latestLocation: EmergencyLocation | null;
  locationCount: number;
  notifications: Array<
    Pick<
      NotificationRecord,
      "id" | "channel" | "kind" | "status" | "recipientMasked" | "contactId" | "attempts" | "sentAt"
    > & { contactName: string | null }
  >;
  share: { url: string | null; expiresAt: string | null; active: boolean };
}

/** What a trusted contact sees on /emergency/[token]. Minimal by design. */
export interface PublicEmergencyView {
  name: string;
  phone: string | null;
  status: EmergencyStatus;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  triggerKind: "sos" | "checkin" | "journey";
  location: {
    lat: number;
    lng: number;
    accuracy: number | null;
    recordedAt: string;
    batteryLevel: number | null;
  } | null;
  address: string | null;
  locationSharingActive: boolean;
  region: string;
  isDemo: boolean;
}

export interface NearbyPlace {
  id: string;
  name: string;
  category: "police" | "hospital" | "clinic" | "pharmacy" | "emergency";
  lat: number;
  lng: number;
  distanceMeters: number;
  address: string | null;
  phone: string | null;
  openStatus: "open" | "closed" | "24h" | "unknown";
  hoursText: string | null;
  source: "openstreetmap" | "google" | "demo";
}
