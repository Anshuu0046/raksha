import type {
  AuditLog,
  AuthToken,
  Channel,
  CheckIn,
  EmergencyEvent,
  EmergencyLocation,
  EmergencyNumber,
  NotificationRecord,
  NotificationStatus,
  OtpCode,
  PushSubscriptionRecord,
  Recording,
  SafeJourney,
  Session,
  ShareLink,
  TrustedContact,
  User,
} from "@/types";

type New<T> = Omit<T, "id" | "createdAt" | "updatedAt">;
type Patch<T> = Partial<Omit<T, "id" | "createdAt">>;

export interface AdminStats {
  users: number;
  activeEmergencies: number;
  emergenciesLast24h: number;
  emergenciesLast30d: number;
  activeCheckIns: number;
  activeJourneys: number;
  notifications: Array<{ channel: Channel; status: NotificationStatus; count: number }>;
}

/** Admin-safe summary: no coordinates, no addresses, no contact details. */
export interface EmergencySummary {
  id: string;
  status: EmergencyEvent["status"];
  triggerMethod: EmergencyEvent["triggerMethod"];
  startedAt: string;
  endedAt: string | null;
  isDemo: boolean;
  notificationsSent: number;
  notificationsFailed: number;
}

/**
 * Persistence boundary. Every user-scoped read takes the owner's userId so a route
 * cannot accidentally read another user's rows: authorization lives in the query.
 */
export interface Repository {
  readonly kind: "memory" | "postgres";
  ping(): Promise<boolean>;

  // Users
  createUser(input: New<User>): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByPhone(phone: string): Promise<User | null>;
  getUserByGoogleSub(sub: string): Promise<User | null>;
  updateUser(id: string, patch: Patch<User>): Promise<User>;
  /** Hard delete; cascades to every user-owned row. Audit rows are pseudonymised. */
  deleteUser(id: string): Promise<void>;

  // Sessions & credentials
  createSession(input: Omit<Session, "id">): Promise<Session>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  touchSession(id: string, at: string, expiresAt: string): Promise<void>;
  revokeSession(id: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;
  createAuthToken(input: Omit<AuthToken, "id" | "createdAt">): Promise<AuthToken>;
  getAuthTokenByHash(tokenHash: string): Promise<AuthToken | null>;
  consumeAuthToken(id: string, at: string): Promise<void>;
  createOtp(input: Omit<OtpCode, "id" | "createdAt">): Promise<OtpCode>;
  getLatestOtp(phone: string): Promise<OtpCode | null>;
  updateOtp(id: string, patch: Partial<Pick<OtpCode, "attempts" | "consumedAt">>): Promise<void>;

  // Trusted contacts
  listContacts(userId: string): Promise<TrustedContact[]>;
  getContact(userId: string, id: string): Promise<TrustedContact | null>;
  getContactByAlertTokenHash(tokenHash: string): Promise<TrustedContact | null>;
  createContact(input: New<TrustedContact>): Promise<TrustedContact>;
  updateContact(userId: string, id: string, patch: Patch<TrustedContact>): Promise<TrustedContact | null>;
  deleteContact(userId: string, id: string): Promise<boolean>;
  /** Atomically makes one contact primary and clears the flag on the rest. */
  setPrimaryContact(userId: string, id: string): Promise<boolean>;

  // Push subscriptions
  upsertPushSubscription(input: Omit<PushSubscriptionRecord, "id" | "createdAt" | "failureCount">): Promise<PushSubscriptionRecord>;
  listPushSubscriptions(filter: { userId?: string; contactId?: string }): Promise<PushSubscriptionRecord[]>;
  deletePushSubscription(endpoint: string): Promise<void>;
  recordPushFailure(id: string): Promise<void>;

  // Emergencies
  createEmergency(
    event: New<EmergencyEvent>,
    firstLocation: Omit<EmergencyLocation, "id" | "eventId" | "createdAt"> | null,
  ): Promise<EmergencyEvent>;
  getEmergency(userId: string, id: string): Promise<EmergencyEvent | null>;
  /** Internal use only (dispatcher, public share resolution). */
  getEmergencyById(id: string): Promise<EmergencyEvent | null>;
  getActiveEmergency(userId: string): Promise<EmergencyEvent | null>;
  getEmergencyByClientId(userId: string, clientEventId: string): Promise<EmergencyEvent | null>;
  updateEmergency(id: string, patch: Patch<EmergencyEvent>): Promise<EmergencyEvent>;
  listEmergencies(userId: string, limit: number): Promise<EmergencyEvent[]>;
  addLocation(input: Omit<EmergencyLocation, "id" | "createdAt">): Promise<EmergencyLocation>;
  getLatestLocation(eventId: string): Promise<EmergencyLocation | null>;
  countLocations(eventId: string): Promise<number>;

  // Share links
  createShare(input: Omit<ShareLink, "id" | "createdAt" | "lastViewedAt" | "viewCount" | "revokedAt">): Promise<ShareLink>;
  getShareByTokenHash(tokenHash: string): Promise<ShareLink | null>;
  listShares(eventId: string): Promise<ShareLink[]>;
  updateShare(id: string, patch: Partial<Pick<ShareLink, "expiresAt" | "revokedAt" | "lastViewedAt" | "viewCount">>): Promise<void>;
  revokeShares(eventId: string, at: string): Promise<void>;
  extendActiveShares(eventId: string, until: string): Promise<void>;

  // Notifications
  createNotifications(input: Array<Omit<NotificationRecord, "id" | "createdAt">>): Promise<NotificationRecord[]>;
  updateNotification(id: string, patch: Patch<NotificationRecord>): Promise<void>;
  /**
   * Atomically leases a due notification for sending (sets next_attempt_at = leaseUntil).
   * Returns false if another worker already claimed it, so cron and post-response dispatch
   * can never double-send.
   */
  claimNotification(id: string, now: string, leaseUntil: string): Promise<boolean>;
  listNotifications(filter: { eventId?: string; checkInId?: string; journeyId?: string }): Promise<NotificationRecord[]>;
  listUserNotifications(userId: string, limit: number): Promise<NotificationRecord[]>;
  /** Pending, or failed with a due retry, ordered oldest first. */
  listDueNotifications(now: string, limit: number): Promise<NotificationRecord[]>;

  // Check-ins
  createCheckIn(input: Omit<CheckIn, "id">): Promise<CheckIn>;
  getActiveCheckIn(userId: string): Promise<CheckIn | null>;
  getCheckIn(userId: string, id: string): Promise<CheckIn | null>;
  updateCheckIn(id: string, patch: Partial<Omit<CheckIn, "id">>): Promise<CheckIn>;
  /** Conditional update: applies only if the row is still in expectedStatus (atomic claim). */
  transitionCheckIn(id: string, expectedStatus: CheckIn["status"], patch: Partial<Omit<CheckIn, "id">>): Promise<CheckIn | null>;
  listCheckIns(userId: string, limit: number): Promise<CheckIn[]>;
  /** Active check-ins whose due time (reminder) or due+grace (escalation) has passed. */
  listDueCheckIns(now: string): Promise<CheckIn[]>;

  // Safe journeys
  createJourney(input: Omit<SafeJourney, "id">): Promise<SafeJourney>;
  getActiveJourney(userId: string): Promise<SafeJourney | null>;
  getJourney(userId: string, id: string): Promise<SafeJourney | null>;
  updateJourney(id: string, patch: Partial<Omit<SafeJourney, "id">>): Promise<SafeJourney>;
  transitionJourney(id: string, expectedStatus: SafeJourney["status"], patch: Partial<Omit<SafeJourney, "id">>): Promise<SafeJourney | null>;
  listJourneys(userId: string, limit: number): Promise<SafeJourney[]>;
  listDueJourneys(now: string): Promise<SafeJourney[]>;

  // Emergency numbers (admin overrides on top of config/emergencyNumbers.ts)
  listEmergencyNumbers(): Promise<EmergencyNumber[]>;
  upsertEmergencyNumber(input: EmergencyNumber): Promise<EmergencyNumber>;
  deleteEmergencyNumber(id: string): Promise<void>;

  // Recordings
  createRecording(input: Omit<Recording, "id" | "createdAt">): Promise<Recording>;
  listRecordings(userId: string): Promise<Recording[]>;
  getRecording(userId: string, id: string): Promise<Recording | null>;
  deleteRecording(userId: string, id: string): Promise<Recording | null>;

  // Audit
  addAudit(input: Omit<AuditLog, "id" | "createdAt">): Promise<void>;
  listAudit(limit: number): Promise<AuditLog[]>;

  // Rate limiting (fixed window). Returns the hit count in the current window.
  hitRateLimit(key: string, windowMs: number, now: number): Promise<number>;

  // Admin aggregates
  adminStats(now: string): Promise<AdminStats>;
  listEmergencySummaries(limit: number): Promise<EmergencySummary[]>;
}
