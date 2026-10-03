import { expect, test, type Page } from "@playwright/test";
import { TEST_ADMIN, TEST_CONTACT, TEST_USER } from "./fixtures";

/** Unique email per run: the dev server's in-memory store lives as long as the server. */
const unique = (email: string) => email.replace("@", `+${Date.now().toString(36)}@`);

async function signUpAndOnboard(page: Page, user = TEST_USER) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(user.name);
  await page.getByLabel("Email").fill(unique(user.email));
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Who should we alert?" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(TEST_CONTACT.name);
  await page.getByLabel("Phone number").fill(TEST_CONTACT.phone);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText(`${TEST_CONTACT.name}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Permissions" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("You are protected")).toBeVisible();
}

async function holdSos(page: Page) {
  const sos = page.getByRole("button", { name: /^SOS\./ });
  const box = (await sos.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
}

test("SOS end-to-end: hold → contacts alerted → contact opens live link → she ends it safely", async ({ page, browser }) => {
  await signUpAndOnboard(page);

  // A short press must NOT trigger an emergency.
  const sos = page.getByRole("button", { name: /^SOS\./ });
  await sos.hover();
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Emergency active" })).toHaveCount(0);

  await holdSos(page);
  await expect(page.getByRole("heading", { name: "Emergency active" })).toBeVisible();
  await expect(page.getByText("Your trusted contacts have been notified.")).toBeVisible();
  await expect(page.getByText("Contacts notified · 1 of 1")).toBeVisible();
  await expect(page.getByText("Live tracking active")).toBeVisible();
  for (const action of ["Call police", "Call ambulance", "Call contact", "Share location", "Record audio", "Cancel"]) {
    await expect(page.getByText(action, { exact: true })).toBeVisible();
  }

  // Demo mode never dials emergency services.
  await page.getByText("Call police", { exact: true }).click();
  await expect(page.getByText(/Demo mode: this would call/)).toBeVisible();

  // The trusted contact opens the link with no account.
  const shareUrl = await page.evaluate(() => JSON.parse(localStorage.getItem("raksha.emergency.v1")!).shareUrl as string);
  expect(shareUrl).toMatch(/\/emergency\/[A-Za-z0-9_-]{43}$/);
  const contactContext = await browser.newContext();
  const contact = await contactContext.newPage();
  await contact.goto(shareUrl);
  await expect(contact.getByRole("heading", { name: `${TEST_USER.name.split(" ")[0]} has triggered an SOS.` })).toBeVisible();
  await expect(contact.getByText("Active", { exact: true })).toBeVisible();
  await expect(contact.getByRole("link", { name: /Directions/ })).toBeVisible();
  await expect(contact.getByText("Current location")).toBeVisible();

  // She ends it: two deliberate steps.
  await page.getByText("Cancel", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Choose a reason first" })).toBeDisabled();
  await page.getByText("I'm safe now").click();
  await page.getByRole("button", { name: "End emergency" }).click();
  await expect(page.getByRole("heading", { name: "You're marked safe" })).toBeVisible();

  // The contact sees the update on their next refresh.
  await expect(async () => {
    await contact.reload();
    await expect(contact.getByRole("heading", { name: `${TEST_USER.name.split(" ")[0]} is safe.` })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(contact.getByText("Location sharing has stopped.")).toBeVisible();
  await contactContext.close();

  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByText("You are protected")).toBeVisible();
});

test("offline SOS is queued, survives the outage and sends when the network returns", async ({ page, context }) => {
  await signUpAndOnboard(page);
  await context.setOffline(true);
  await holdSos(page);
  await expect(page.getByRole("heading", { name: "Emergency active" })).toBeVisible();
  await expect(page.getByText("Internet connection unavailable").first()).toBeVisible();
  await expect(page.getByText(/Text Meera your location/)).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Your trusted contacts have been notified.")).toBeVisible({ timeout: 20_000 });
});

test("keyboard users can trigger SOS by holding Space", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.getByRole("button", { name: /^SOS\./ }).focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(2300);
  await page.keyboard.up("Space");
  await expect(page.getByRole("heading", { name: "Emergency active" })).toBeVisible();
});

test("admin dashboard is role-gated and shows no personal data", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(TEST_ADMIN.name);
  await page.getByLabel("Email").fill(TEST_ADMIN.email);
  await page.getByLabel("Password").fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: "Create account" }).click();
  // Admin email may already exist from a previous run against a reused server: fall back to login.
  const outcome = await Promise.race([
    page.waitForURL(/\/onboarding/).then(() => "created"),
    page.getByText(/already exists/).waitFor().then(() => "exists"),
  ]);
  if (outcome === "exists") {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_ADMIN.email);
    await page.getByLabel("Password").fill(TEST_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(app|onboarding)/);
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "System overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notification delivery (30 days)" })).toBeVisible();
  await expect(page.getByText(/Locations, names and contacts are never shown/)).toBeVisible();
});

test("public pages work signed out: landing, helplines link, invalid emergency link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your safety. One tap away." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeVisible();
  await page.goto("/emergency/not-a-real-token-not-a-real-token-xx");
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
  await expect(page.getByRole("link", { name: /112/ }).first()).toBeVisible();
});
