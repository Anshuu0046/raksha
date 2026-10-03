import { newId } from "@/lib/security/tokens";
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
import type { AdminStats, EmergencySummary, Repository } from "./repository";

interface Tables {
  users: Map<string, User>;
  sessions: Map<string, Session>;
  authTokens: Map<string, AuthToken>;
  otps: Map<string, OtpCode>;
  contacts: Map<string, TrustedContact>;
  push: Map<string, PushSubscriptionRecord>;
  emergencies: Map<string, EmergencyEvent>;
  locations: Map<string, EmergencyLocation>;
  shares: Map<string, ShareLink>;
  notifications: Map<string, NotificationRecord>;
  checkIns: Map<string, CheckIn>;
  journeys: Map<string, SafeJourney>;
  numbers: Map<string, EmergencyNumber>;
  recordings: Map<string, Recording>;
  audit: AuditLog[];
  rate: Map<string, { windowStart: number; count: number }>;
}

const TABLE_NAMES = [
  "users",
  "sessions",
  "authTokens",
  "otps",
  "contacts",
  "push",
  "emergencies",
  "locations",
  "shares",
  "notifications",
  "checkIns",
  "journeys",
  "numbers",
  "recordings",
] as const;

function emptyTables(): Tables {
  return {
    users: new Map(),
    sessions: new Map(),
    authTokens: new Map(),
    otps: new Map(),
    contacts: new Map(),
    push: new Map(),
    emergencies: new Map(),
    locations: new Map(),
    shares: new Map(),
    notifications: new Map(),
    checkIns: new Map(),
    journeys: new Map(),
    numbers: new Map(),
    recordings: new Map(),
    audit: [],
    rate: new Map(),
  };
}

const clone = <T>(value: T): T => structuredClone(value);
/** Patches ignore undefined fields, matching the PostgreSQL implementation. */
const def = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
const nowIso = () => new Date().toISOString();
const desc = <T>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));

/**
 * In-memory repository for local development, demo mode and tests. Optionally snapshots to
 * a JSON file (dev only) so a dev-server restart does not log everyone out.
 * Never used in production: see getRepository().
 */
export class MemoryRepository implements Repository {
  readonly kind = "memory" as const;
  private t: Tables = emptyTables();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly persistPath: string | null = null) {
    if (persistPath) this.load();
  }

  /** Test helper. */
  reset() {
    this.t = emptyTables();
  }

  private load() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.persistPath, "utf8")) as Record<string, [string, unknown][]> & {
        audit?: AuditLog[];
      };
      for (const name of TABLE_NAMES) {
        if (raw[name]) (this.t[name] as Map<string, unknown>) = new Map(raw[name]);
      }
      this.t.audit = raw.audit ?? [];
    } catch {
      // A corrupt snapshot should never block development; start empty.
    }
  }

  private persist() {
    if (!this.persistPath) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("node:fs") as typeof import("node:fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require("node:path") as typeof import("node:path");
        fs.mkdirSync(path.dirname(this.persistPath!), { recursive: true });
        const out: Record<string, unknown> = { audit: this.t.audit.slice(-2000) };
        for (const name of TABLE_NAMES) out[name] = [...(this.t[name] as Map<string, unknown>).entries()];
        fs.writeFileSync(this.persistPath!, JSON.stringify(out));
      } catch {
        // best effort
      }
    }, 250);
  }

  private write<T>(result: T): T {
    this.persist();
    return result;
  }

  async ping() {
    return true;
  }

  // ---------- Users ----------
  async createUser(input: Omit<User, "id" | "createdAt" | "updatedAt">) {
    const at = nowIso();
    const user: User = { ...input, id: newId(), createdAt: at, updatedAt: at };
    this.t.users.set(user.id, user);
    return this.write(clone(user));
  }
  async getUserById(id: string) {
    const u = this.t.users.get(id);
    return u ? clone(u) : null;
  }
  async getUserByEmail(email: string) {
    const e = email.toLowerCase();
    for (const u of this.t.users.values()) if (u.email?.toLowerCase() === e) return clone(u);
    return null;
  }
  async getUserByPhone(phone: string) {
    for (const u of this.t.users.values()) if (u.phone === phone) return clone(u);
    return null;
  }
  async getUserByGoogleSub(sub: string) {
    for (const u of this.t.users.values()) if (u.googleSub === sub) return clone(u);
    return null;
  }
  async updateUser(id: string, patch: Partial<User>) {
    const u = this.t.users.get(id);
    if (!u) throw new Error("User not found");
    const next = { ...u, ...def(patch), id, updatedAt: nowIso() };
    this.t.users.set(id, next);
    return this.write(clone(next));
  }
  async deleteUser(id: string) {
    this.t.users.delete(id);
    const contactIds = new Set<string>();
    for (const [k, c] of this.t.contacts) {
      if (c.userId !== id) continue;
      contactIds.add(k);
      this.t.contacts.delete(k);
    }
    const eventIds = new Set<string>();
    for (const [k, e] of this.t.emergencies) {
      if (e.userId !== id) continue;
      eventIds.add(k);
      this.t.emergencies.delete(k);
    }
    for (const [k, l] of this.t.locations) if (eventIds.has(l.eventId)) this.t.locations.delete(k);
    for (const [k, s] of this.t.shares) if (eventIds.has(s.eventId)) this.t.shares.delete(k);
    for (const [k, s] of this.t.sessions) if (s.userId === id) this.t.sessions.delete(k);
    for (const [k, s] of this.t.authTokens) if (s.userId === id) this.t.authTokens.delete(k);
    for (const [k, p] of this.t.push) if (p.userId === id || (p.contactId && contactIds.has(p.contactId))) this.t.push.delete(k);
    for (const [k, n] of this.t.notifications) if (n.userId === id) this.t.notifications.delete(k);
    for (const [k, c] of this.t.checkIns) if (c.userId === id) this.t.checkIns.delete(k);
    for (const [k, j] of this.t.journeys) if (j.userId === id) this.t.journeys.delete(k);
    for (const [k, r] of this.t.recordings) if (r.userId === id) this.t.recordings.delete(k);
    for (const a of this.t.audit) if (a.userId === id) a.userId = null;
    this.write(undefined);
  }

  // ---------- Sessions & credentials ----------
  async createSession(input: Omit<Session, "id">) {
    const s: Session = { ...input, id: newId() };
    this.t.sessions.set(s.id, s);
    return this.write(clone(s));
  }
  async getSessionByTokenHash(tokenHash: string) {
    for (const s of this.t.sessions.values()) if (s.tokenHash === tokenHash) return clone(s);
    return null;
  }
  async touchSession(id: string, at: string, expiresAt: string) {
    const s = this.t.sessions.get(id);
    if (s) Object.assign(s, { lastSeenAt: at, expiresAt });
    this.write(undefined);
  }
  async revokeSession(id: string) {
    const s = this.t.sessions.get(id);
    if (s) s.revokedAt = nowIso();
    this.write(undefined);
  }
  async revokeUserSessions(userId: string) {
    for (const s of this.t.sessions.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = nowIso();
    this.write(undefined);
  }
  async createAuthToken(input: Omit<AuthToken, "id" | "createdAt">) {
    const tok: AuthToken = { ...input, id: newId(), createdAt: nowIso() };
    this.t.authTokens.set(tok.id, tok);
    return this.write(clone(tok));
  }
  async getAuthTokenByHash(tokenHash: string) {
    for (const t of this.t.authTokens.values()) if (t.tokenHash === tokenHash) return clone(t);
    return null;
  }
  async consumeAuthToken(id: string, at: string) {
    const t = this.t.authTokens.get(id);
    if (t) t.consumedAt = at;
    this.write(undefined);
  }
  async createOtp(input: Omit<OtpCode, "id" | "createdAt">) {
    const o: OtpCode = { ...input, id: newId(), createdAt: nowIso() };
    this.t.otps.set(o.id, o);
    return clone(o);
  }
  async getLatestOtp(phone: string) {
    const all = [...this.t.otps.values()].filter((o) => o.phone === phone).sort(desc("createdAt"));
    return all[0] ? clone(all[0]) : null;
  }
  async updateOtp(id: string, patch: Partial<Pick<OtpCode, "attempts" | "consumedAt">>) {
    const o = this.t.otps.get(id);
    if (o) Object.assign(o, def(patch));
  }

  // ---------- Contacts ----------
  async listContacts(userId: string) {
    return [...this.t.contacts.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
  async getContact(userId: string, id: string) {
    const c = this.t.contacts.get(id);
    return c && c.userId === userId ? clone(c) : null;
  }
  async getContactByAlertTokenHash(tokenHash: string) {
    for (const c of this.t.contacts.values()) if (c.alertTokenHash === tokenHash) return clone(c);
    return null;
  }
  async createContact(input: Omit<TrustedContact, "id" | "createdAt" | "updatedAt">) {
    const at = nowIso();
    const c: TrustedContact = { ...input, id: newId(), createdAt: at, updatedAt: at };
    this.t.contacts.set(c.id, c);
    return this.write(clone(c));
  }
  async updateContact(userId: string, id: string, patch: Partial<TrustedContact>) {
    const c = this.t.contacts.get(id);
    if (!c || c.userId !== userId) return null;
    const next = { ...c, ...def(patch), id, userId, updatedAt: nowIso() };
    this.t.contacts.set(id, next);
    return this.write(clone(next));
  }
  async deleteContact(userId: string, id: string) {
    const c = this.t.contacts.get(id);
    if (!c || c.userId !== userId) return false;
    this.t.contacts.delete(id);
    for (const [k, p] of this.t.push) if (p.contactId === id) this.t.push.delete(k);
    return this.write(true);
  }
  async setPrimaryContact(userId: string, id: string) {
    const target = this.t.contacts.get(id);
    if (!target || target.userId !== userId) return false;
    for (const c of this.t.contacts.values()) if (c.userId === userId) c.isPrimary = c.id === id;
    return this.write(true);
  }

  // ---------- Push ----------
  async upsertPushSubscription(input: Omit<PushSubscriptionRecord, "id" | "createdAt" | "failureCount">) {
    for (const p of this.t.push.values()) {
      if (p.endpoint === input.endpoint) {
        Object.assign(p, input, { failureCount: 0 });
        return this.write(clone(p));
      }
    }
    const rec: PushSubscriptionRecord = { ...input, id: newId(), createdAt: nowIso(), failureCount: 0 };
    this.t.push.set(rec.id, rec);
    return this.write(clone(rec));
  }
  async listPushSubscriptions(filter: { userId?: string; contactId?: string }) {
    return [...this.t.push.values()]
      .filter((p) => (filter.userId ? p.userId === filter.userId : true))
      .filter((p) => (filter.contactId ? p.contactId === filter.contactId : true))
      .map(clone);
  }
  async deletePushSubscription(endpoint: string) {
    for (const [k, p] of this.t.push) if (p.endpoint === endpoint) this.t.push.delete(k);
    this.write(undefined);
  }
  async recordPushFailure(id: string) {
    const p = this.t.push.get(id);
    if (p) p.failureCount += 1;
  }

  // ---------- Emergencies ----------
  async createEmergency(
    event: Omit<EmergencyEvent, "id" | "createdAt" | "updatedAt">,
    firstLocation: Omit<EmergencyLocation, "id" | "eventId" | "createdAt"> | null,
  ) {
    const at = nowIso();
    const e: EmergencyEvent = { ...event, id: newId(), createdAt: at, updatedAt: at };
    this.t.emergencies.set(e.id, e);
    if (firstLocation) await this.addLocation({ ...firstLocation, eventId: e.id });
    return this.write(clone(e));
  }
  async getEmergency(userId: string, id: string) {
    const e = this.t.emergencies.get(id);
    return e && e.userId === userId ? clone(e) : null;
  }
  async getEmergencyById(id: string) {
    const e = this.t.emergencies.get(id);
    return e ? clone(e) : null;
  }
  async getActiveEmergency(userId: string) {
    const active = [...this.t.emergencies.values()]
      .filter((e) => e.userId === userId && e.status === "active")
      .sort(desc("startedAt"));
    return active[0] ? clone(active[0]) : null;
  }
  async getEmergencyByClientId(userId: string, clientEventId: string) {
    for (const e of this.t.emergencies.values())
      if (e.userId === userId && e.clientEventId === clientEventId) return clone(e);
    return null;
  }
  async updateEmergency(id: string, patch: Partial<EmergencyEvent>) {
    const e = this.t.emergencies.get(id);
    if (!e) throw new Error("Emergency not found");
    const next = { ...e, ...def(patch), id, updatedAt: nowIso() };
    this.t.emergencies.set(id, next);
    return this.write(clone(next));
  }
  async listEmergencies(userId: string, limit: number) {
    return [...this.t.emergencies.values()]
      .filter((e) => e.userId === userId)
      .sort(desc("startedAt"))
      .slice(0, limit)
      .map(clone);
  }
  async addLocation(input: Omit<EmergencyLocation, "id" | "createdAt">) {
    const l: EmergencyLocation = { ...input, id: newId(), createdAt: nowIso() };
    this.t.locations.set(l.id, l);
    return this.write(clone(l));
  }
  async getLatestLocation(eventId: string) {
    const all = [...this.t.locations.values()].filter((l) => l.eventId === eventId).sort(desc("recordedAt"));
    return all[0] ? clone(all[0]) : null;
  }
  async countLocations(eventId: string) {
    let n = 0;
    for (const l of this.t.locations.values()) if (l.eventId === eventId) n++;
    return n;
  }

  // ---------- Shares ----------
  async createShare(input: Omit<ShareLink, "id" | "createdAt" | "lastViewedAt" | "viewCount" | "revokedAt">) {
    const s: ShareLink = { ...input, id: newId(), createdAt: nowIso(), lastViewedAt: null, viewCount: 0, revokedAt: null };
    this.t.shares.set(s.id, s);
    return this.write(clone(s));
  }
  async getShareByTokenHash(tokenHash: string) {
    for (const s of this.t.shares.values()) if (s.tokenHash === tokenHash) return clone(s);
    return null;
  }
  async listShares(eventId: string) {
    return [...this.t.shares.values()].filter((s) => s.eventId === eventId).sort(desc("createdAt")).map(clone);
  }
  async updateShare(id: string, patch: Partial<ShareLink>) {
    const s = this.t.shares.get(id);
    if (s) Object.assign(s, def(patch));
    this.write(undefined);
  }
  async revokeShares(eventId: string, at: string) {
    for (const s of this.t.shares.values()) if (s.eventId === eventId && !s.revokedAt) s.revokedAt = at;
    this.write(undefined);
  }
  async extendActiveShares(eventId: string, until: string) {
    for (const s of this.t.shares.values())
      if (s.eventId === eventId && !s.revokedAt && s.expiresAt < until) s.expiresAt = until;
  }

  // ---------- Notifications ----------
  async createNotifications(input: Array<Omit<NotificationRecord, "id" | "createdAt">>) {
    const at = nowIso();
    const out = input.map((n) => {
      const rec: NotificationRecord = { ...n, id: newId(), createdAt: at };
      this.t.notifications.set(rec.id, rec);
      return clone(rec);
    });
    return this.write(out);
  }
  async updateNotification(id: string, patch: Partial<NotificationRecord>) {
    const n = this.t.notifications.get(id);
    if (n) Object.assign(n, def(patch));
    this.write(undefined);
  }
  async claimNotification(id: string, now: string, leaseUntil: string) {
    const n = this.t.notifications.get(id);
    if (!n) return false;
    const due =
      (n.status === "pending" && (!n.nextAttemptAt || n.nextAttemptAt <= now)) ||
      (n.status === "failed" && n.nextAttemptAt !== null && n.nextAttemptAt <= now);
    if (!due) return false;
    n.status = "pending";
    n.nextAttemptAt = leaseUntil;
    return true;
  }
  async listNotifications(filter: { eventId?: string; checkInId?: string; journeyId?: string }) {
    return [...this.t.notifications.values()]
      .filter((n) => (filter.eventId ? n.eventId === filter.eventId : true))
      .filter((n) => (filter.checkInId ? n.checkInId === filter.checkInId : true))
      .filter((n) => (filter.journeyId ? n.journeyId === filter.journeyId : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
  async listUserNotifications(userId: string, limit: number) {
    return [...this.t.notifications.values()]
      .filter((n) => n.userId === userId)
      .sort(desc("createdAt"))
      .slice(0, limit)
      .map(clone);
  }
  async listDueNotifications(now: string, limit: number) {
    return [...this.t.notifications.values()]
      .filter(
        (n) =>
          (n.status === "pending" && (!n.nextAttemptAt || n.nextAttemptAt <= now)) ||
          (n.status === "failed" && n.nextAttemptAt !== null && n.nextAttemptAt <= now),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  // ---------- Check-ins ----------
  async createCheckIn(input: Omit<CheckIn, "id">) {
    const c: CheckIn = { ...input, id: newId() };
    this.t.checkIns.set(c.id, c);
    return this.write(clone(c));
  }
  async getActiveCheckIn(userId: string) {
    for (const c of this.t.checkIns.values()) if (c.userId === userId && c.status === "active") return clone(c);
    return null;
  }
  async getCheckIn(userId: string, id: string) {
    const c = this.t.checkIns.get(id);
    return c && c.userId === userId ? clone(c) : null;
  }
  async updateCheckIn(id: string, patch: Partial<CheckIn>) {
    const c = this.t.checkIns.get(id);
    if (!c) throw new Error("Check-in not found");
    Object.assign(c, def(patch));
    return this.write(clone(c));
  }
  async transitionCheckIn(id: string, expectedStatus: CheckIn["status"], patch: Partial<CheckIn>) {
    const c = this.t.checkIns.get(id);
    if (!c || c.status !== expectedStatus) return null;
    Object.assign(c, def(patch));
    return this.write(clone(c));
  }
  async listCheckIns(userId: string, limit: number) {
    return [...this.t.checkIns.values()]
      .filter((c) => c.userId === userId)
      .sort(desc("startedAt"))
      .slice(0, limit)
      .map(clone);
  }
  async listDueCheckIns(now: string) {
    return [...this.t.checkIns.values()].filter((c) => c.status === "active" && c.dueAt <= now).map(clone);
  }

  // ---------- Journeys ----------
  async createJourney(input: Omit<SafeJourney, "id">) {
    const j: SafeJourney = { ...input, id: newId() };
    this.t.journeys.set(j.id, j);
    return this.write(clone(j));
  }
  async getActiveJourney(userId: string) {
    for (const j of this.t.journeys.values()) if (j.userId === userId && j.status === "active") return clone(j);
    return null;
  }
  async getJourney(userId: string, id: string) {
    const j = this.t.journeys.get(id);
    return j && j.userId === userId ? clone(j) : null;
  }
  async updateJourney(id: string, patch: Partial<SafeJourney>) {
    const j = this.t.journeys.get(id);
    if (!j) throw new Error("Journey not found");
    Object.assign(j, def(patch));
    return this.write(clone(j));
  }
  async transitionJourney(id: string, expectedStatus: SafeJourney["status"], patch: Partial<SafeJourney>) {
    const j = this.t.journeys.get(id);
    if (!j || j.status !== expectedStatus) return null;
    Object.assign(j, def(patch));
    return this.write(clone(j));
  }
  async listJourneys(userId: string, limit: number) {
    return [...this.t.journeys.values()]
      .filter((j) => j.userId === userId)
      .sort(desc("startedAt"))
      .slice(0, limit)
      .map(clone);
  }
  async listDueJourneys(now: string) {
    return [...this.t.journeys.values()]
      .filter((j) => j.status === "active" && j.expectedArrivalAt <= now)
      .map(clone);
  }

  // ---------- Emergency numbers ----------
  async listEmergencyNumbers() {
    return [...this.t.numbers.values()].map(clone);
  }
  async upsertEmergencyNumber(input: EmergencyNumber) {
    this.t.numbers.set(input.id, clone(input));
    return this.write(clone(input));
  }
  async deleteEmergencyNumber(id: string) {
    this.t.numbers.delete(id);
    this.write(undefined);
  }

  // ---------- Recordings ----------
  async createRecording(input: Omit<Recording, "id" | "createdAt">) {
    const r: Recording = { ...input, id: newId(), createdAt: nowIso() };
    this.t.recordings.set(r.id, r);
    return this.write(clone(r));
  }
  async listRecordings(userId: string) {
    return [...this.t.recordings.values()].filter((r) => r.userId === userId).sort(desc("createdAt")).map(clone);
  }
  async getRecording(userId: string, id: string) {
    const r = this.t.recordings.get(id);
    return r && r.userId === userId ? clone(r) : null;
  }
  async deleteRecording(userId: string, id: string) {
    const r = this.t.recordings.get(id);
    if (!r || r.userId !== userId) return null;
    this.t.recordings.delete(id);
    return this.write(clone(r));
  }

  // ---------- Audit ----------
  async addAudit(input: Omit<AuditLog, "id" | "createdAt">) {
    this.t.audit.push({ ...input, id: newId(), createdAt: nowIso() });
    if (this.t.audit.length > 10_000) this.t.audit.splice(0, this.t.audit.length - 10_000);
    this.write(undefined);
  }
  async listAudit(limit: number) {
    return this.t.audit.slice(-limit).reverse().map(clone);
  }

  // ---------- Rate limiting ----------
  async hitRateLimit(key: string, windowMs: number, now: number) {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const entry = this.t.rate.get(key);
    if (!entry || entry.windowStart !== windowStart) {
      this.t.rate.set(key, { windowStart, count: 1 });
      if (this.t.rate.size > 50_000) this.t.rate.clear();
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  // ---------- Admin ----------
  async adminStats(now: string): Promise<AdminStats> {
    const t = new Date(now).getTime();
    const events = [...this.t.emergencies.values()];
    const counts = new Map<string, AdminStats["notifications"][number]>();
    for (const n of this.t.notifications.values()) {
      const key = `${n.channel}:${n.status}`;
      const c = counts.get(key) ?? { channel: n.channel, status: n.status, count: 0 };
      c.count++;
      counts.set(key, c);
    }
    return {
      users: this.t.users.size,
      activeEmergencies: events.filter((e) => e.status === "active").length,
      emergenciesLast24h: events.filter((e) => t - new Date(e.startedAt).getTime() < 86_400_000).length,
      emergenciesLast30d: events.filter((e) => t - new Date(e.startedAt).getTime() < 30 * 86_400_000).length,
      activeCheckIns: [...this.t.checkIns.values()].filter((c) => c.status === "active").length,
      activeJourneys: [...this.t.journeys.values()].filter((j) => j.status === "active").length,
      notifications: [...counts.values()],
    };
  }
  async listEmergencySummaries(limit: number): Promise<EmergencySummary[]> {
    const notes = [...this.t.notifications.values()];
    return [...this.t.emergencies.values()]
      .sort(desc("startedAt"))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        status: e.status,
        triggerMethod: e.triggerMethod,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        isDemo: e.isDemo,
        notificationsSent: notes.filter((n) => n.eventId === e.id && (n.status === "sent" || n.status === "simulated")).length,
        notificationsFailed: notes.filter((n) => n.eventId === e.id && n.status === "failed").length,
      }));
  }
}
