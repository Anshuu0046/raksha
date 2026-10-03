"use client";

import { BellRing, Mail, MessageSquare, MoreHorizontal, Pencil, Phone, Plus, Send, Star, Trash2, UserRound } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CallButton } from "@/components/emergency/call-button";
import { useAppData } from "@/components/providers/app-data-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Notice, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/api/client";
import type { ContactView } from "@/lib/contacts/service";
import { useT } from "@/lib/i18n/client";
import { cn, maskEmail } from "@/lib/utils";
import { ContactForm } from "./contact-form";

type TestResult = { channel: string; status: string; recipientMasked: string; error: string | null };

function ChannelIcons({ c }: { c: ContactView }) {
  const t = useT();
  const items = [
    { on: c.notifySms && Boolean(c.phone), icon: MessageSquare, label: t("contacts.channel.sms") },
    { on: c.notifyEmail && Boolean(c.email), icon: Mail, label: t("contacts.channel.email") },
    { on: c.notifyPush && c.pushEnabled, icon: BellRing, label: t("contacts.channel.push") },
  ];
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i.label}
          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", i.on ? "bg-navy-900 text-white" : "bg-ground text-ink-3 line-through")}
        >
          <i.icon className="size-3.5" aria-hidden />
          {i.label}
        </span>
      ))}
    </span>
  );
}

export function ContactsManager() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { contacts, contactsLoaded, setContacts, reloadContacts, demo } = useAppData();
  const [editing, setEditing] = useState<ContactView | "new" | null>(null);
  const [deleting, setDeleting] = useState<ContactView | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult[]>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get("add") === "1") setEditing("new");
  }, [params]);

  const closeEditor = () => {
    setEditing(null);
    if (params.get("add")) router.replace("/app/contacts", { scroll: false });
  };

  const sendTest = async (c: ContactView) => {
    setTesting(c.id);
    try {
      const { results: r } = await api<{ results: TestResult[] }>(`/api/contacts/${c.id}/test`, { method: "POST" });
      setResults((m) => ({ ...m, [c.id]: r }));
      const ok = r.some((x) => x.status === "sent" || x.status === "simulated");
      if (ok) toast.success(t("contacts.testSent", { name: c.name }));
      else toast.error(t("contacts.testFailed"));
    } catch (err) {
      toast.error((err as ClientApiError).message);
    } finally {
      setTesting(null);
    }
  };

  const makePrimary = async (c: ContactView) => {
    try {
      await api(`/api/contacts/${c.id}/primary`, { method: "POST" });
      setContacts(contacts.map((x) => ({ ...x, isPrimary: x.id === c.id })).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)));
      toast.success(t("contacts.nowPrimary", { name: c.name }));
    } catch (err) {
      toast.error((err as ClientApiError).message);
    }
  };

  const remove = async (c: ContactView) => {
    try {
      await api(`/api/contacts/${c.id}`, { method: "DELETE" });
      await reloadContacts();
      toast.success(t("contacts.removed", { name: c.name }));
    } catch (err) {
      toast.error((err as ClientApiError).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        action={
          <Button size="lg" onClick={() => setEditing("new")} disabled={contacts.length >= 10}>
            <Plus aria-hidden />
            {t("contacts.add")}
          </Button>
        }
      />

      {!contactsLoaded ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-[var(--radius-panel)]" />
          <Skeleton className="h-36 rounded-[var(--radius-panel)]" />
        </div>
      ) : contacts.length === 0 ? (
        <Panel className="flex flex-col items-start gap-4 p-6">
          <span className="grid size-12 place-items-center rounded-full bg-warn-soft text-warn">
            <UserRound className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-extrabold">{t("contacts.emptyTitle")}</h2>
            <p className="mt-1 max-w-[55ch] text-[15px] leading-relaxed text-ink-2">{t("contacts.emptyBody")}</p>
          </div>
          <Button size="lg" variant="sos" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("contacts.addFirst")}
          </Button>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {contacts.map((c) => (
            <li key={c.id}>
              <Panel as="article" className={cn("p-5", c.isPrimary && "ring-2 ring-navy-900")}>
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-navy-900 text-lg font-extrabold text-white" aria-hidden>
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold leading-tight">{c.name}</h2>
                      {c.isPrimary ? (
                        <Badge tone="navy">
                          <Star className="size-3" aria-hidden />
                          {t("contacts.primary")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-ink-3">{c.relationship === "custom" && c.customRelationship ? c.customRelationship : t(`relationship.${c.relationship}`)}</p>
                    <p className="tabular mt-1.5 text-[15px] text-ink-2">
                      {c.phone ?? ""}
                      {c.phone && c.email ? " · " : ""}
                      {c.email ? maskEmail(c.email) : ""}
                    </p>
                    <div className="mt-2.5">
                      <ChannelIcons c={c} />
                    </div>
                  </div>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t("contacts.more", { name: c.name })}>
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-[var(--radius-control)] bg-surface p-1.5 shadow-[var(--shadow-lift)] ring-1 ring-line">
                        <DropdownMenu.Item onSelect={() => setEditing(c)} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[15px] font-medium outline-none data-[highlighted]:bg-ground">
                          <Pencil className="size-4" aria-hidden />
                          {t("common.edit")}
                        </DropdownMenu.Item>
                        {!c.isPrimary ? (
                          <DropdownMenu.Item onSelect={() => void makePrimary(c)} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[15px] font-medium outline-none data-[highlighted]:bg-ground">
                            <Star className="size-4" aria-hidden />
                            {t("contacts.makePrimary")}
                          </DropdownMenu.Item>
                        ) : null}
                        <DropdownMenu.Item onSelect={() => setDeleting(c)} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[15px] font-medium text-sos-ink outline-none data-[highlighted]:bg-sos-soft">
                          <Trash2 className="size-4" aria-hidden />
                          {t("common.delete")}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {c.phone ? (
                    <CallButton number={c.phone} label={t("contacts.call")} emergencyService={false} demo={demo} variant="outline" size="md" />
                  ) : (
                    <Button variant="subtle" disabled>
                      <Phone aria-hidden />
                      {t("contacts.noPhone")}
                    </Button>
                  )}
                  <Button variant="outline" loading={testing === c.id} onClick={() => void sendTest(c)}>
                    <Send aria-hidden />
                    {t("contacts.test")}
                  </Button>
                </div>
                {results[c.id] ? (
                  <ul className="mt-3 flex flex-col gap-1 rounded-[var(--radius-control)] bg-ground p-3 text-sm" aria-live="polite">
                    {results[c.id]!.map((r) => (
                      <li key={r.channel} className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold">{t(`contacts.channel.${r.channel}`)} · {r.recipientMasked}</span>
                        <span className={cn("font-semibold", r.status === "sent" || r.status === "simulated" ? "text-safe-ink" : "text-sos-ink")}>
                          {t(`delivery.${r.status}`)}
                          {r.error && r.status !== "sent" ? ` · ${r.error}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {contacts.length > 0 ? <Notice className="mt-6" tone="info" title={t("contacts.pushTipTitle")}>{t("contacts.pushTip")}</Notice> : null}

      <Dialog open={editing !== null} onOpenChange={(v) => !v && closeEditor()}>
        <DialogContent title={editing === "new" ? t("contacts.addTitle") : t("contacts.editTitle")} description={editing === "new" ? t("contacts.addDescription") : undefined}>
          {editing ? (
            <ContactForm
              contact={editing === "new" ? undefined : editing}
              onCancel={closeEditor}
              onSaved={async (saved) => {
                await reloadContacts();
                toast.success(editing === "new" ? t("contacts.added", { name: saved.name }) : t("contacts.saved"));
                closeEditor();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent title={t("contacts.deleteTitle", { name: deleting?.name ?? "" })} description={t("contacts.deleteBody")} tone="danger">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="lg" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" size="lg" onClick={() => deleting && void remove(deleting)}>
              <Trash2 aria-hidden />
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
