/**
 * Test-only accounts for local development and end-to-end tests (in-memory / demo database).
 * Never use these values against a real deployment.
 */
export const TEST_USER = {
  name: "Ananya Test",
  email: "ananya@raksha.test",
  password: "raksha-test-password-01",
};

export const TEST_CONTACT = {
  name: "Meera Test",
  phone: "9876543210",
  email: "meera@raksha.test",
};

/** Promoted to admin via ADMIN_EMAILS=admin@raksha.test in .env.local. */
export const TEST_ADMIN = {
  name: "Admin Test",
  email: "admin@raksha.test",
  password: "raksha-admin-password-01",
};
