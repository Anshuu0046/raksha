"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import type { ContactView } from "@/lib/contacts/service";
import { browserStorage, readJson, writeJson } from "@/lib/offline/storage";
import type { EmergencyNumber, PublicUser } from "@/types";

interface AppData {
  user: PublicUser;
  contacts: ContactView[];
  contactsLoaded: boolean;
  helplines: EmergencyNumber[];
  primary: { emergency: string; police: string; ambulance: string };
  demo: boolean;
  setUser: (u: PublicUser) => void;
  reloadContacts: () => Promise<void>;
  setContacts: (c: ContactView[]) => void;
}

const AppDataContext = createContext<AppData | null>(null);
// Contacts and helplines are cached on the device so calling and SMS fallback work offline.
const CONTACTS_KEY = "raksha.contacts.v1";
const HELPLINES_KEY = "raksha.helplines.v1";

export function AppDataProvider({
  initialUser,
  helplines: initialHelplines,
  primary,
  demo,
  children,
}: {
  initialUser: PublicUser;
  helplines: EmergencyNumber[];
  primary: AppData["primary"];
  demo: boolean;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [contacts, setContactsState] = useState<ContactView[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [helplines] = useState(initialHelplines);

  const setContacts = useCallback((c: ContactView[]) => {
    setContactsState(c);
    // Store only what offline calling needs.
    writeJson(
      browserStorage(),
      CONTACTS_KEY,
      c.map(({ id, name, phone, relationship, isPrimary }) => ({ id, name, phone, relationship, isPrimary })),
    );
  }, []);

  const reloadContacts = useCallback(async () => {
    try {
      const { contacts: list } = await api<{ contacts: ContactView[] }>("/api/contacts");
      setContacts(list);
    } catch {
      const cached = readJson<ContactView[]>(browserStorage(), CONTACTS_KEY, []);
      if (cached.length) setContactsState(cached);
    } finally {
      setContactsLoaded(true);
    }
  }, [setContacts]);

  useEffect(() => {
    const cached = readJson<ContactView[]>(browserStorage(), CONTACTS_KEY, []);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached.length) setContactsState(cached);
    writeJson(browserStorage(), HELPLINES_KEY, initialHelplines.map(({ id, name, number, category }) => ({ id, name, number, category })));
    void reloadContacts();
  }, [initialHelplines, reloadContacts]);

  const value = useMemo<AppData>(
    () => ({ user, contacts, contactsLoaded, helplines, primary, demo, setUser, reloadContacts, setContacts }),
    [user, contacts, contactsLoaded, helplines, primary, demo, reloadContacts, setContacts],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside <AppDataProvider>");
  return ctx;
}
