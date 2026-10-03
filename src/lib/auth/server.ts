import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSessionToken, SESSION_COOKIE } from "./session";

/** For Server Components / layouts: the signed-in user or null. */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const resolved = await resolveSessionToken(token);
  return resolved?.user ?? null;
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
