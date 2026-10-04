import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Raksha collects, why, who sees it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 October 2026">
      <section>
        <p>
          Raksha is an emergency safety app. It handles sensitive information, including where you are, so this page says plainly what
          we collect, who can see it, and how you can delete it. We do not sell your data and we show no advertising.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your name, email and/or phone number, language, and a password (stored only as a salted scrypt hash, never in readable form). A profile photo if you add one.</li>
          <li><strong>Trusted contacts:</strong> the name, phone number, email and language of the people you add so we can alert them.</li>
          <li><strong>Location:</strong> only when you use a feature that needs it: during an SOS, a Safe Journey, a check-in, or when you ask for nearby help. Your last position is also kept on your own device so the app can show it if GPS fails.</li>
          <li><strong>Emergency records:</strong> when an SOS starts and ends, the locations sent during it, battery level, which contacts were alerted and whether delivery succeeded.</li>
          <li><strong>Audio recordings:</strong> stay on your device unless you turn on upload in Settings. If you do, they are stored privately and linked to that emergency.</li>
          <li><strong>Technical data:</strong> sign-in sessions (including the browser or device type), and a keyed, irreversible hash of your IP address for abuse prevention and audit logs. We do not store your raw IP address in those logs.</li>
        </ul>
      </section>

      <section>
        <h2>Who can see your information</h2>
        <ul>
          <li><strong>Your trusted contacts</strong> see your name, phone number and live location <em>only while an emergency or journey alert is active</em>, through a private link made just for them. The link expires within 24 hours (it is extended while you are still sharing) and stops working once you mark yourself safe. You can create a new link at any time.</li>
          <li><strong>Raksha administrators</strong> see totals and delivery statistics, not your name, contacts or location.</li>
          <li><strong>Nobody else.</strong> We do not sell or rent your data, and we do not share it with advertisers.</li>
        </ul>
      </section>

      <section>
        <h2>Services that process data for us</h2>
        <p>To run Raksha we rely on these providers. They receive only what they need to do their job:</p>
        <ul>
          <li>Hosting and database: Vercel and Supabase (account, contact and emergency records).</li>
          <li>Sending alerts: an SMS gateway and an email service (the contact&apos;s phone number or email, and the alert text, which includes your name and a link to your live location).</li>
          <li>Maps and nearby help: OpenStreetMap services. We reduce coordinates to roughly 110 metres before searching, so exact positions are not sent.</li>
          <li>Google, only if you choose to sign in with Google.</li>
        </ul>
      </section>

      <section>
        <h2>What Raksha does not do</h2>
        <ul>
          <li>It never calls the police or any emergency service on its own. Calls are placed only when you tap a Call button.</li>
          <li>It does not track you in the background. Location is used during an active emergency, journey or check-in, or when you ask for it.</li>
          <li>It does not read your messages, contacts list or call history.</li>
        </ul>
      </section>

      <section>
        <h2>Keeping and deleting your data</h2>
        <p>
          We keep your information while your account exists. You can delete your account in <strong>Settings</strong>. This removes your
          profile, trusted contacts, emergency history, journeys, check-ins and uploaded recordings. Records we must keep for security
          auditing are stripped of anything that identifies you. If you cannot sign in, email us and we will delete it for you.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Connections are encrypted. Passwords are hashed. Live-location links are long random codes stored only as hashes, and each
          contact has their own link. No system is perfectly secure, so please use a strong password and keep your phone locked.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can view and correct your details in Settings, add or remove contacts at any time, turn recording upload on or off,
          withdraw location or notification permission in your device settings, and delete your account. You may also ask us for a copy of your data or
          to correct or erase it by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          If you are under 18, you must use Raksha with the knowledge and consent of a parent or guardian. We do not knowingly collect
          data from children under 13.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          If we change this policy in a way that matters, we will update the date above and tell you in the app. Questions or requests:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
