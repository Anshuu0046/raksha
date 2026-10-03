import postgres from "postgres";
import type {
  AuditLog,
  AuthToken,
  CheckIn,
  EmergencyEvent,
  EmergencyLocation,
  EmergencyNumber,
  NotificationRecord,
  OtpCode,
  PushSubscriptionRecord,
  Recording,
  SafeJourney,
  Session,
  ShareLink,
  TrustedContact,
  User,
} from "@/types";
import { DEFAULT_PREFERENCES } from "@/types";
import type { AdminStats, EmergencySummary, Repository } from "./repository";

type Sql = postgres.Sql<Record<string, unknown>>;
type Row = Record<string, unknown>;

/** Strips undefined so partial patches only touch provided columns. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * PostgreSQL repository (Supabase recommended). Connects with the server-only DATABASE_URL.
 * On Vercel use Supabase's transaction pooler (port 6543), which requires prepare: false.
 */
export class PostgresRepository implements Repository {
  readonly kind = "postgres" as const;
  private sql: Sql;

  constructor(url: string) {
    this.sql = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { ...postgres.camel, undefined: null },
      types: {
        // Timestamps travel as ISO strings everywhere in the domain layer.
        isoTimestamp: {
          to: 1184,
          from: [1114, 1184],
          serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x),
          parse: (x: string) => new Date(x.includes("T") || x.endsWith("Z") || /[+-]\d\d$/.test(x) ? x : `${x}Z`).toISOString(),
        },
      },
    }) as unknown as Sql;
  }

  private user(row: Row | undefined): User | null {
    if (!row) return null;
    const u = row as unknown as User;
    return { ...u, preferences: { ...DEFAULT_PREFERENCES, ...((row.preferences as object) ?? {}) } };
  }

  private journey(row: Row | undefined): SafeJourney | null {
    if (!row) return null;
    const j = row as unknown as SafeJourney;
    return { ...j, contactIds: Array.isArray(row.contactIds) ? (row.contactIds as string[]) : [] };
  }

  async ping() {
    try {
      await this.sql`select 1`;
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Users ----------
  async createUser(input: Omit<User, "id" | "createdAt" | "updatedAt">) {
    const { preferences, ...rest } = input;
    const [row] = await this.sql`
      insert into users ${this.sql({ ...rest, preferences: this.sql.json(preferences as never) } as never)}
      returning *`;
    return this.user(row)!;
  }
  async getUserById(id: string) {
    const [row] = await this.sql`select * from users where id = ${id}`;
    return this.user(row);
  }
  async getUserByEmail(email: string) {
    const [row] = await this.sql`select * from users where email = ${email}`;
    return this.user(row);
  }
  async getUserByPhone(phone: string) {
    const [row] = await this.sql`select * from users where phone = ${phone}`;
    return this.user(row);
  }
  async getUserByGoogleSub(sub: string) {
    const [row] = await this.sql`select * from users where google_sub = ${sub}`;
    return this.user(row);
  }
  async updateUser(id: string, patch: Partial<User>) {
    const { preferences, id: _id, createdAt: _c, updatedAt: _u, ...rest } = patch;
    const values: Record<string, unknown> = { ...defined(rest), updatedAt: new Date().toISOString() };
    if (preferences) values.preferences = this.sql.json(preferences as never);
    const [row] = await this.sql`update users set ${this.sql(values as never)} where id = ${id} returning *`;
    if (!row) throw new Error("User not found");
    return this.user(row)!;
  }
  async deleteUser(id: string) {
    await this.sql.begin(async (tx) => {
      await tx`update audit_logs set user_id = null, ip_hash = null where user_id = ${id}`;
      await tx`delete from users where id = ${id}`;
    });
  }

  // ---------- Sessions & credentials ----------
  async createSession(input: Omit<Session, "id">) {
    const [row] = await this.sql`insert into sessions ${this.sql(input as never)} returning *`;
    return row as unknown as Session;
  }
  async getSessionByTokenHash(tokenHash: string) {
    const [row] = await this.sql`select * from sessions where token_hash = ${tokenHash}`;
    return (row as unknown as Session) ?? null;
  }
  async touchSession(id: string, at: string, expiresAt: string) {
    await this.sql`update sessions set last_seen_at = ${at}, expires_at = ${expiresAt} where id = ${id}`;
  }
  async revokeSession(id: string) {
    await this.sql`update sessions set revoked_at = now() where id = ${id}`;
  }
  async revokeUserSessions(userId: string) {
    await this.sql`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
  }
  async createAuthToken(input: Omit<AuthToken, "id" | "createdAt">) {
    const [row] = await this.sql`insert into auth_tokens ${this.sql(input as never)} returning *`;
    return row as unknown as AuthToken;
  }
  async getAuthTokenByHash(tokenHash: string) {
    const [row] = await this.sql`select * from auth_tokens where token_hash = ${tokenHash}`;
    return (row as unknown as AuthToken) ?? null;
  }
  async consumeAuthToken(id: string, at: string) {
    await this.sql`update auth_tokens set consumed_at = ${at} where id = ${id}`;
  }
  async createOtp(input: Omit<OtpCode, "id" | "createdAt">) {
    const [row] = await this.sql`insert into otp_codes ${this.sql(input as never)} returning *`;
    return row as unknown as OtpCode;
  }
  async getLatestOtp(phone: string) {
    const [row] = await this.sql`select * from otp_codes where phone = ${phone} order by created_at desc limit 1`;
    return (row as unknown as OtpCode) ?? null;
  }
  async updateOtp(id: string, patch: Partial<Pick<OtpCode, "attempts" | "consumedAt">>) {
    await this.sql`update otp_codes set ${this.sql(defined(patch) as never)} where id = ${id}`;
  }

  // ---------- Contacts ----------
  async listContacts(userId: string) {
    const rows = await this.sql`
      select * from trusted_contacts where user_id = ${userId} order by is_primary desc, created_at asc`;
    return rows as unknown as TrustedContact[];
  }
  async getContact(userId: string, id: string) {
    const [row] = await this.sql`select * from trusted_contacts where id = ${id} and user_id = ${userId}`;
    return (row as unknown as TrustedContact) ?? null;
  }
  async getContactByAlertTokenHash(tokenHash: string) {
    const [row] = await this.sql`select * from trusted_contacts where alert_token_hash = ${tokenHash}`;
    return (row as unknown as TrustedContact) ?? null;
  }
  async createContact(input: Omit<TrustedContact, "id" | "createdAt" | "updatedAt">) {
    const [row] = await this.sql`insert into trusted_contacts ${this.sql(input as never)} returning *`;
    return row as unknown as TrustedContact;
  }
  async updateContact(userId: string, id: string, patch: Partial<TrustedContact>) {
    const { id: _i, userId: _u, createdAt: _c, ...rest } = patch;
    const values = { ...defined(rest), updatedAt: new Date().toISOString() };
    const [row] = await this.sql`
      update trusted_contacts set ${this.sql(values as never)} where id = ${id} and user_id = ${userId} returning *`;
    return (row as unknown as TrustedContact) ?? null;
  }
  async deleteContact(userId: string, id: string) {
    const rows = await this.sql`delete from trusted_contacts where id = ${id} and user_id = ${userId} returning id`;
    return rows.length > 0;
  }
  async setPrimaryContact(userId: string, id: string) {
    return this.sql.begin(async (tx) => {
      const [exists] = await tx`select id from trusted_contacts where id = ${id} and user_id = ${userId}`;
      if (!exists) return false;
      await tx`update trusted_contacts set is_primary = false where user_id = ${userId} and is_primary`;
      await tx`update trusted_contacts set is_primary = true where id = ${id}`;
      return true;
    }) as Promise<boolean>;
  }

  // ---------- Push ----------
  async upsertPushSubscription(input: Omit<PushSubscriptionRecord, "id" | "createdAt" | "failureCount">) {
    const [row] = await this.sql`
      insert into push_subscriptions ${this.sql(input as never)}
      on conflict (endpoint) do update set
        user_id = excluded.user_id, contact_id = excluded.contact_id,
        p256dh = excluded.p256dh, auth = excluded.auth, failure_count = 0
      returning *`;
    return row as unknown as PushSubscriptionRecord;
  }
  async listPushSubscriptions(filter: { userId?: string; contactId?: string }) {
    if (filter.userId) {
      return (await this.sql`select * from push_subscriptions where user_id = ${filter.userId}`) as unknown as PushSubscriptionRecord[];
    }
    if (filter.contactId) {
      return (await this.sql`select * from push_subscriptions where contact_id = ${filter.contactId}`) as unknown as PushSubscriptionRecord[];
    }
    return [];
  }
  async deletePushSubscription(endpoint: string) {
    await this.sql`delete from push_subscriptions where endpoint = ${endpoint}`;
  }
  async recordPushFailure(id: string) {
    await this.sql`update push_subscriptions set failure_count = failure_count + 1 where id = ${id}`;
  }

  // ---------- Emergencies ----------
  async createEmergency(
    event: Omit<EmergencyEvent, "id" | "createdAt" | "updatedAt">,
    firstLocation: Omit<EmergencyLocation, "id" | "eventId" | "createdAt"> | null,
  ) {
    return this.sql.begin(async (tx) => {
      const [row] = await tx`insert into emergency_events ${tx(event as never)} returning *`;
      const created = row as unknown as EmergencyEvent;
      if (firstLocation) {
        await tx`insert into emergency_locations ${tx({ ...firstLocation, eventId: created.id } as never)}`;
      }
      return created;
    }) as Promise<EmergencyEvent>;
  }
  async getEmergency(userId: string, id: string) {
    const [row] = await this.sql`select * from emergency_events where id = ${id} and user_id = ${userId}`;
    return (row as unknown as EmergencyEvent) ?? null;
  }
  async getEmergencyById(id: string) {
    const [row] = await this.sql`select * from emergency_events where id = ${id}`;
    return (row as unknown as EmergencyEvent) ?? null;
  }
  async getActiveEmergency(userId: string) {
    const [row] = await this.sql`
      select * from emergency_events where user_id = ${userId} and status = 'active'
      order by started_at desc limit 1`;
    return (row as unknown as EmergencyEvent) ?? null;
  }
  async getEmergencyByClientId(userId: string, clientEventId: string) {
    const [row] = await this.sql`
      select * from emergency_events where user_id = ${userId} and client_event_id = ${clientEventId}`;
    return (row as unknown as EmergencyEvent) ?? null;
  }
  async updateEmergency(id: string, patch: Partial<EmergencyEvent>) {
    const { id: _i, userId: _u, createdAt: _c, ...rest } = patch;
    const values = { ...defined(rest), updatedAt: new Date().toISOString() };
    const [row] = await this.sql`update emergency_events set ${this.sql(values as never)} where id = ${id} returning *`;
    if (!row) throw new Error("Emergency not found");
    return row as unknown as EmergencyEvent;
  }
  async listEmergencies(userId: string, limit: number) {
    return (await this.sql`
      select * from emergency_events where user_id = ${userId} order by started_at desc limit ${limit}`) as unknown as EmergencyEvent[];
  }
  async addLocation(input: Omit<EmergencyLocation, "id" | "createdAt">) {
    const [row] = await this.sql`insert into emergency_locations ${this.sql(input as never)} returning *`;
    return row as unknown as EmergencyLocation;
  }
  async getLatestLocation(eventId: string) {
    const [row] = await this.sql`
      select * from emergency_locations where event_id = ${eventId} order by recorded_at desc limit 1`;
    return (row as unknown as EmergencyLocation) ?? null;
  }
  async countLocations(eventId: string) {
    const [row] = await this.sql`select count(*)::int as n from emergency_locations where event_id = ${eventId}`;
    return Number(row?.n ?? 0);
  }

  // ---------- Shares ----------
  async createShare(input: Omit<ShareLink, "id" | "createdAt" | "lastViewedAt" | "viewCount" | "revokedAt">) {
    const [row] = await this.sql`insert into emergency_shares ${this.sql(input as never)} returning *`;
    return row as unknown as ShareLink;
  }
  async getShareByTokenHash(tokenHash: string) {
    const [row] = await this.sql`select * from emergency_shares where token_hash = ${tokenHash}`;
    return (row as unknown as ShareLink) ?? null;
  }
  async listShares(eventId: string) {
    return (await this.sql`
      select * from emergency_shares where event_id = ${eventId} order by created_at desc`) as unknown as ShareLink[];
  }
  async updateShare(id: string, patch: Partial<ShareLink>) {
    await this.sql`update emergency_shares set ${this.sql(defined(patch) as never)} where id = ${id}`;
  }
  async revokeShares(eventId: string, at: string) {
    await this.sql`update emergency_shares set revoked_at = ${at} where event_id = ${eventId} and revoked_at is null`;
  }
  async extendActiveShares(eventId: string, until: string) {
    await this.sql`
      update emergency_shares set expires_at = ${until}
      where event_id = ${eventId} and revoked_at is null and expires_at < ${until}`;
  }

  // ---------- Notifications ----------
  async createNotifications(input: Array<Omit<NotificationRecord, "id" | "createdAt">>) {
    if (input.length === 0) return [];
    return (await this.sql`insert into notifications ${this.sql(input as never)} returning *`) as unknown as NotificationRecord[];
  }
  async updateNotification(id: string, patch: Partial<NotificationRecord>) {
    const { id: _i, createdAt: _c, ...rest } = patch;
    await this.sql`update notifications set ${this.sql(defined(rest) as never)} where id = ${id}`;
  }
  async claimNotification(id: string, now: string, leaseUntil: string) {
    const rows = await this.sql`
      update notifications set status = 'pending', next_attempt_at = ${leaseUntil}
      where id = ${id} and (
        (status = 'pending' and (next_attempt_at is null or next_attempt_at <= ${now}))
        or (status = 'failed' and next_attempt_at is not null and next_attempt_at <= ${now})
      ) returning id`;
    return rows.length > 0;
  }
  async listNotifications(filter: { eventId?: string; checkInId?: string; journeyId?: string }) {
    if (filter.eventId)
      return (await this.sql`select * from notifications where event_id = ${filter.eventId} order by created_at`) as unknown as NotificationRecord[];
    if (filter.checkInId)
      return (await this.sql`select * from notifications where check_in_id = ${filter.checkInId} order by created_at`) as unknown as NotificationRecord[];
    if (filter.journeyId)
      return (await this.sql`select * from notifications where journey_id = ${filter.journeyId} order by created_at`) as unknown as NotificationRecord[];
    return [];
  }
  async listUserNotifications(userId: string, limit: number) {
    return (await this.sql`
      select * from notifications where user_id = ${userId} order by created_at desc limit ${limit}`) as unknown as NotificationRecord[];
  }
  async listDueNotifications(now: string, limit: number) {
    return (await this.sql`
      select * from notifications
      where (status = 'pending' and (next_attempt_at is null or next_attempt_at <= ${now}))
         or (status = 'failed' and next_attempt_at is not null and next_attempt_at <= ${now})
      order by created_at asc limit ${limit}`) as unknown as NotificationRecord[];
  }

  // ---------- Check-ins ----------
  async createCheckIn(input: Omit<CheckIn, "id">) {
    const [row] = await this.sql`insert into check_ins ${this.sql(input as never)} returning *`;
    return row as unknown as CheckIn;
  }
  async getActiveCheckIn(userId: string) {
    const [row] = await this.sql`select * from check_ins where user_id = ${userId} and status = 'active' limit 1`;
    return (row as unknown as CheckIn) ?? null;
  }
  async getCheckIn(userId: string, id: string) {
    const [row] = await this.sql`select * from check_ins where id = ${id} and user_id = ${userId}`;
    return (row as unknown as CheckIn) ?? null;
  }
  async updateCheckIn(id: string, patch: Partial<CheckIn>) {
    const { id: _i, ...rest } = patch;
    const [row] = await this.sql`update check_ins set ${this.sql(defined(rest) as never)} where id = ${id} returning *`;
    if (!row) throw new Error("Check-in not found");
    return row as unknown as CheckIn;
  }
  async transitionCheckIn(id: string, expectedStatus: CheckIn["status"], patch: Partial<CheckIn>) {
    const { id: _i, ...rest } = patch;
    const [row] = await this.sql`update check_ins set ${this.sql(defined(rest) as never)} where id = ${id} and status = ${expectedStatus} returning *`;
    return (row as unknown as CheckIn) ?? null;
  }
  async listCheckIns(userId: string, limit: number) {
    return (await this.sql`
      select * from check_ins where user_id = ${userId} order by started_at desc limit ${limit}`) as unknown as CheckIn[];
  }
  async listDueCheckIns(now: string) {
    return (await this.sql`select * from check_ins where status = 'active' and due_at <= ${now}`) as unknown as CheckIn[];
  }

  // ---------- Journeys ----------
  async createJourney(input: Omit<SafeJourney, "id">) {
    const { contactIds, ...rest } = input;
    const [row] = await this.sql`
      insert into safe_journeys ${this.sql({ ...rest, contactIds: this.sql.json(contactIds as never) } as never)} returning *`;
    return this.journey(row)!;
  }
  async getActiveJourney(userId: string) {
    const [row] = await this.sql`select * from safe_journeys where user_id = ${userId} and status = 'active' limit 1`;
    return this.journey(row);
  }
  async getJourney(userId: string, id: string) {
    const [row] = await this.sql`select * from safe_journeys where id = ${id} and user_id = ${userId}`;
    return this.journey(row);
  }
  async updateJourney(id: string, patch: Partial<SafeJourney>) {
    const { id: _i, contactIds, ...rest } = patch;
    const values: Record<string, unknown> = defined(rest);
    if (contactIds) values.contactIds = this.sql.json(contactIds as never);
    const [row] = await this.sql`update safe_journeys set ${this.sql(values as never)} where id = ${id} returning *`;
    if (!row) throw new Error("Journey not found");
    return this.journey(row)!;
  }
  async transitionJourney(id: string, expectedStatus: SafeJourney["status"], patch: Partial<SafeJourney>) {
    const { id: _i, contactIds, ...rest } = patch;
    const values: Record<string, unknown> = defined(rest);
    if (contactIds) values.contactIds = this.sql.json(contactIds as never);
    const [row] = await this.sql`update safe_journeys set ${this.sql(values as never)} where id = ${id} and status = ${expectedStatus} returning *`;
    return this.journey(row);
  }
  async listJourneys(userId: string, limit: number) {
    const rows = await this.sql`
      select * from safe_journeys where user_id = ${userId} order by started_at desc limit ${limit}`;
    return rows.map((r) => this.journey(r)!);
  }
  async listDueJourneys(now: string) {
    const rows = await this.sql`select * from safe_journeys where status = 'active' and expected_arrival_at <= ${now}`;
    return rows.map((r) => this.journey(r)!);
  }

  // ---------- Emergency numbers ----------
  async listEmergencyNumbers() {
    return (await this.sql`select * from emergency_numbers order by priority, name`) as unknown as EmergencyNumber[];
  }
  async upsertEmergencyNumber(input: EmergencyNumber) {
    const [row] = await this.sql`
      insert into emergency_numbers ${this.sql(input as never)}
      on conflict (id) do update set
        country = excluded.country, region = excluded.region, name = excluded.name,
        purpose = excluded.purpose, number = excluded.number, category = excluded.category,
        availability_notes = excluded.availability_notes, priority = excluded.priority,
        active = excluded.active, updated_at = now()
      returning *`;
    return row as unknown as EmergencyNumber;
  }
  async deleteEmergencyNumber(id: string) {
    await this.sql`delete from emergency_numbers where id = ${id}`;
  }

  // ---------- Recordings ----------
  async createRecording(input: Omit<Recording, "id" | "createdAt">) {
    const [row] = await this.sql`insert into recordings ${this.sql(input as never)} returning *`;
    return row as unknown as Recording;
  }
  async listRecordings(userId: string) {
    return (await this.sql`
      select * from recordings where user_id = ${userId} order by created_at desc`) as unknown as Recording[];
  }
  async getRecording(userId: string, id: string) {
    const [row] = await this.sql`select * from recordings where id = ${id} and user_id = ${userId}`;
    return (row as unknown as Recording) ?? null;
  }
  async deleteRecording(userId: string, id: string) {
    const [row] = await this.sql`delete from recordings where id = ${id} and user_id = ${userId} returning *`;
    return (row as unknown as Recording) ?? null;
  }

  // ---------- Audit ----------
  async addAudit(input: Omit<AuditLog, "id" | "createdAt">) {
    const { metadata, ...rest } = input;
    await this.sql`insert into audit_logs ${this.sql({ ...rest, metadata: this.sql.json(metadata as never) } as never)}`;
  }
  async listAudit(limit: number) {
    return (await this.sql`select * from audit_logs order by created_at desc limit ${limit}`) as unknown as AuditLog[];
  }

  // ---------- Rate limiting ----------
  async hitRateLimit(key: string, windowMs: number, now: number) {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const [row] = await this.sql`
      insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count`;
    // Opportunistic cleanup of old windows (cheap, indexed by primary key prefix).
    if (Math.random() < 0.01) {
      await this.sql`delete from rate_limits where window_start < ${now - 86_400_000}`;
    }
    return Number(row?.count ?? 1);
  }

  // ---------- Admin ----------
  async adminStats(now: string): Promise<AdminStats> {
    const [counts] = await this.sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from emergency_events where status = 'active') as active_emergencies,
        (select count(*)::int from emergency_events where started_at > ${now}::timestamptz - interval '24 hours') as emergencies_last24h,
        (select count(*)::int from emergency_events where started_at > ${now}::timestamptz - interval '30 days') as emergencies_last30d,
        (select count(*)::int from check_ins where status = 'active') as active_check_ins,
        (select count(*)::int from safe_journeys where status = 'active') as active_journeys`;
    const notifications = await this.sql`
      select channel, status, count(*)::int as count from notifications
      where created_at > ${now}::timestamptz - interval '30 days'
      group by channel, status`;
    return {
      users: Number(counts.users),
      activeEmergencies: Number(counts.activeEmergencies),
      emergenciesLast24h: Number(counts.emergenciesLast24h),
      emergenciesLast30d: Number(counts.emergenciesLast30d),
      activeCheckIns: Number(counts.activeCheckIns),
      activeJourneys: Number(counts.activeJourneys),
      notifications: notifications as unknown as AdminStats["notifications"],
    };
  }
  async listEmergencySummaries(limit: number): Promise<EmergencySummary[]> {
    return (await this.sql`
      select e.id, e.status, e.trigger_method, e.started_at, e.ended_at, e.is_demo,
        count(n.id) filter (where n.status in ('sent','simulated'))::int as notifications_sent,
        count(n.id) filter (where n.status = 'failed')::int as notifications_failed
      from emergency_events e
      left join notifications n on n.event_id = e.id
      group by e.id
      order by e.started_at desc
      limit ${limit}`) as unknown as EmergencySummary[];
  }
}
