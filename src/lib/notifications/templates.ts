import { INTL_LOCALE, isLocale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { mapLink } from "@/lib/location/geo";
import type { NotificationKind } from "@/types";
import type { EmailMessage, PushMessage, SmsMessage } from "./types";

export interface TemplateContext {
  kind: NotificationKind;
  locale: string;
  userName: string;
  userPhone: string | null;
  /** Secure, expiring live-location link (null when location sharing is off for this kind). */
  link: string | null;
  /** Contact's "enable instant alerts" invite link (test notifications only). */
  inviteLink?: string | null;
  at: string;
  location?: { lat: number; lng: number; accuracy: number | null } | null;
  address?: string | null;
  battery?: number | null;
  destination?: string | null;
  dueAt?: string | null;
  endReason?: string | null;
  graceMinutes?: number;
}

export interface RenderedMessage {
  sms: Omit<SmsMessage, "to">;
  email: Omit<EmailMessage, "to">;
  push: PushMessage;
}

const TIMEZONE = () => process.env.APP_TIMEZONE || "Asia/Kolkata";

function formatWhen(iso: string, locale: string): string {
  const tag = isLocale(locale) ? INTL_LOCALE[locale] : "en-IN";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: TIMEZONE() }).format(new Date(iso));
}

function formatTime(iso: string, locale: string): string {
  const tag = isLocale(locale) ? INTL_LOCALE[locale] : "en-IN";
  return new Intl.DateTimeFormat(tag, { timeStyle: "short", timeZone: TIMEZONE() }).format(new Date(iso));
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailHtml(opts: { heading: string; tone: "danger" | "safe" | "neutral"; lead: string; rows: Array<[string, string]>; cta?: { label: string; href: string }; secondary?: { label: string; href: string }; footer: string }): string {
  const band = opts.tone === "danger" ? "#B3121F" : opts.tone === "safe" ? "#0F6B3E" : "#0D1B2A";
  const rows = opts.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#4A5563;font-size:14px;width:38%;vertical-align:top">${escapeHtml(k)}</td><td style="padding:8px 0;color:#0D1B2A;font-size:15px;font-weight:600">${v}</td></tr>`,
    )
    .join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(opts.cta.href)}" style="display:inline-block;background:${band};color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:14px 22px;border-radius:12px">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  const secondary = opts.secondary
    ? `<p style="margin:8px 0 0"><a href="${escapeHtml(opts.secondary.href)}" style="color:#0D1B2A;font-weight:600">${escapeHtml(opts.secondary.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F1F3F5;font-family:-apple-system,Segoe UI,Roboto,Noto Sans,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:${band};padding:22px 24px;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.01em">${escapeHtml(opts.heading)}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px;font-size:17px;line-height:1.5;color:#0D1B2A">${escapeHtml(opts.lead)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #DDE2E8">${rows}</table>
${cta}${secondary}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#5B6574">${escapeHtml(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Renders SMS, email and push copies of one notification in the recipient's language. */
export async function renderMessage(ctx: TemplateContext): Promise<RenderedMessage> {
  const t = await getTranslator(ctx.locale);
  const name = ctx.userName;
  const when = formatWhen(ctx.at, ctx.locale);
  const link = ctx.link ?? "";
  const tag = `raksha-${ctx.kind}`;
  const footer = t("notify.footer");
  const vars = { name, link, time: formatTime(ctx.at, ctx.locale) };

  const locationRows: Array<[string, string]> = [];
  if (ctx.location) {
    const coords = `${ctx.location.lat.toFixed(5)}, ${ctx.location.lng.toFixed(5)}`;
    locationRows.push([t("notify.email.location"), `<a href="${escapeHtml(mapLink(ctx.location))}" style="color:#0D1B2A">${escapeHtml(coords)}</a>${ctx.location.accuracy ? ` <span style="color:#4A5563;font-weight:400">(±${Math.round(ctx.location.accuracy)} m)</span>` : ""}`]);
  } else if (ctx.link) {
    locationRows.push([t("notify.email.location"), escapeHtml(t("notify.email.locationPending"))]);
  }
  if (ctx.address) locationRows.push([t("notify.email.address"), escapeHtml(ctx.address)]);
  const batteryRow: Array<[string, string]> =
    ctx.battery != null ? [[t("notify.email.battery"), `${Math.round(ctx.battery * 100)}%`]] : [];
  const phoneRow: Array<[string, string]> = ctx.userPhone
    ? [[t("notify.email.phone"), `<a href="tel:${escapeHtml(ctx.userPhone)}" style="color:#0D1B2A">${escapeHtml(ctx.userPhone)}</a>`]]
    : [];

  switch (ctx.kind) {
    case "sos": {
      const lead = t("notify.sos.lead", vars);
      return {
        sms: { body: t("notify.sos.sms", vars), template: "sos", vars: { name, link } },
        push: { title: t("notify.sos.pushTitle", vars), body: t("notify.sos.pushBody", vars), url: link, tag, urgent: true },
        email: {
          subject: t("notify.sos.subject", vars),
          text: [lead, `${t("notify.email.time")}: ${when}`, `${t("notify.email.liveLink")}: ${link}`, ctx.userPhone ? `${t("notify.email.phone")}: ${ctx.userPhone}` : "", footer].filter(Boolean).join("\n\n"),
          html: emailHtml({
            heading: t("notify.sos.heading"),
            tone: "danger",
            lead,
            rows: [[t("notify.email.status"), `<span style="color:#B3121F">${escapeHtml(t("notify.email.statusActive"))}</span>`], [t("notify.email.time"), escapeHtml(when)], ...locationRows, ...batteryRow, ...phoneRow],
            cta: { label: t("notify.email.openLive"), href: link },
            secondary: ctx.location ? { label: t("notify.email.openMaps"), href: mapLink(ctx.location) } : undefined,
            footer,
          }),
        },
      };
    }
    case "emergency_ended": {
      const key = ctx.endReason === "mistake" ? "notify.ended.mistake" : "notify.ended.safe";
      const body = t(key, vars);
      return {
        sms: { body: t("notify.ended.sms", { ...vars, message: body }), template: "generic", vars: { name, message: body } },
        push: { title: t("notify.ended.pushTitle", vars), body, url: link || "/", tag: "raksha-sos", urgent: false },
        email: {
          subject: t("notify.ended.subject", vars),
          text: [body, footer].join("\n\n"),
          html: emailHtml({ heading: t("notify.ended.heading", vars), tone: "safe", lead: body, rows: [[t("notify.email.time"), escapeHtml(when)]], footer }),
        },
      };
    }
    case "checkin_escalation": {
      const due = ctx.dueAt ? formatTime(ctx.dueAt, ctx.locale) : vars.time;
      const lead = t("notify.checkin.lead", { ...vars, due });
      const sms = link ? t("notify.checkin.smsWithLink", { ...vars, due }) : t("notify.checkin.sms", { ...vars, due });
      return {
        sms: { body: sms, template: "generic", vars: { name, message: sms } },
        push: { title: t("notify.checkin.pushTitle", vars), body: lead, url: link || "/", tag, urgent: true },
        email: {
          subject: t("notify.checkin.subject", vars),
          text: [lead, link ? `${t("notify.email.liveLink")}: ${link}` : "", ctx.userPhone ? `${t("notify.email.phone")}: ${ctx.userPhone}` : "", footer].filter(Boolean).join("\n\n"),
          html: emailHtml({
            heading: t("notify.checkin.heading"),
            tone: "danger",
            lead,
            rows: [[t("notify.email.time"), escapeHtml(when)], ...locationRows, ...phoneRow],
            cta: link ? { label: t("notify.email.openLive"), href: link } : undefined,
            footer,
          }),
        },
      };
    }
    case "journey_escalation": {
      const due = ctx.dueAt ? formatTime(ctx.dueAt, ctx.locale) : vars.time;
      const jv = { ...vars, due, destination: ctx.destination ?? "" };
      const lead = t("notify.journey.lead", jv);
      const sms = link ? t("notify.journey.smsWithLink", jv) : t("notify.journey.sms", jv);
      return {
        sms: { body: sms, template: "generic", vars: { name, message: sms } },
        push: { title: t("notify.journey.pushTitle", vars), body: lead, url: link || "/", tag, urgent: true },
        email: {
          subject: t("notify.journey.subject", vars),
          text: [lead, link ? `${t("notify.email.liveLink")}: ${link}` : "", ctx.userPhone ? `${t("notify.email.phone")}: ${ctx.userPhone}` : "", footer].filter(Boolean).join("\n\n"),
          html: emailHtml({
            heading: t("notify.journey.heading"),
            tone: "danger",
            lead,
            rows: [[t("notify.journey.destination"), escapeHtml(ctx.destination ?? "")], [t("notify.journey.expected"), escapeHtml(due)], ...locationRows, ...phoneRow],
            cta: link ? { label: t("notify.email.openLive"), href: link } : undefined,
            footer,
          }),
        },
      };
    }
    case "checkin_reminder":
    case "journey_reminder": {
      const key = ctx.kind === "checkin_reminder" ? "notify.reminder.checkin" : "notify.reminder.journey";
      const body = t(`${key}Body`, { minutes: ctx.graceMinutes ?? 10 });
      return {
        sms: { body, template: "generic", vars: { message: body } },
        push: { title: t(`${key}Title`), body, url: ctx.kind === "checkin_reminder" ? "/app" : "/app/journey", tag, urgent: true },
        email: { subject: t(`${key}Title`), text: body, html: emailHtml({ heading: t(`${key}Title`), tone: "neutral", lead: body, rows: [], footer }) },
      };
    }
    case "test":
    default: {
      const lead = t("notify.test.lead", vars);
      const invite = ctx.inviteLink ?? "";
      return {
        sms: { body: invite ? t("notify.test.smsWithInvite", { ...vars, link: invite }) : t("notify.test.sms", vars), template: "generic", vars: { name, message: t("notify.test.sms", vars) } },
        push: { title: t("notify.test.pushTitle"), body: lead, url: "/", tag, urgent: false },
        email: {
          subject: t("notify.test.subject", vars),
          text: [lead, t("notify.test.whatHappens", vars), invite ? `${t("notify.test.enableAlerts")}: ${invite}` : "", footer].filter(Boolean).join("\n\n"),
          html: emailHtml({
            heading: t("notify.test.heading"),
            tone: "neutral",
            lead,
            rows: [[t("notify.test.whatHappensLabel"), escapeHtml(t("notify.test.whatHappens", vars))]],
            cta: invite ? { label: t("notify.test.enableAlerts"), href: invite } : undefined,
            footer,
          }),
        },
      };
    }
  }
}
