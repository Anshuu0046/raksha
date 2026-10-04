import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using Raksha, and what it can and cannot do.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="4 October 2026">
      <section>
        <p>By creating an account or using Raksha you agree to these terms. If you do not agree, please do not use the app.</p>
      </section>

      <section>
        <h2>Raksha is a helper, not a guarantee</h2>
        <ul>
          <li><strong>In danger, call 112 first</strong> (or 100 for police, 108 for ambulance, 1091 for women&apos;s helpline) whenever you can. Raksha does not contact emergency services for you.</li>
          <li>Alerts depend on things outside our control: your phone being on, charged and connected, your location services, mobile networks and the SMS, email and push providers. An alert can be delayed or fail to arrive, and a contact may not see it in time.</li>
          <li>The web app cannot detect hardware buttons and cannot track your location after it is closed. Features described as needing the Android app require that app.</li>
          <li>Nearby police, hospitals and pharmacies come from public map data and may be incomplete or out of date. Helpline numbers should be checked for your area.</li>
        </ul>
      </section>

      <section>
        <h2>Using Raksha responsibly</h2>
        <p>You agree that you will:</p>
        <ul>
          <li>give accurate information and keep your password private;</li>
          <li>add only people who have agreed to be your trusted contacts;</li>
          <li>not trigger false emergencies on purpose, and mark an accidental alert as a mistake;</li>
          <li>not use Raksha to track, follow or pressure another person without their knowledge and consent, or to harass anyone;</li>
          <li>not attack, overload or try to break into the service, or misuse another person&apos;s account.</li>
        </ul>
        <p>We may suspend accounts that break these rules or put others at risk.</p>
      </section>

      <section>
        <h2>If you are a trusted contact</h2>
        <p>
          Someone has chosen you to receive their alerts. Treat any live-location link as private: do not share it, and use it only to help
          that person. If you receive an alert, try to reach them and call the emergency services if they may be in danger.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>How we handle your information is described in our <a href="/privacy">Privacy Policy</a>.</p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          Raksha is provided &quot;as is&quot;. We work to keep it running but cannot promise it will always be available or error-free. We may
          change or stop features, and we may update these terms; continued use after a change means you accept it.
        </p>
      </section>

      <section>
        <h2>Limits of our responsibility</h2>
        <p>
          To the extent the law allows, Raksha and its operators are not liable for loss, injury or damage arising from a delayed,
          failed or missed alert, from the actions of third parties, or from your use of the app. Nothing in these terms limits any right
          you have under Indian law that cannot be limited.
        </p>
      </section>

      <section>
        <h2>Governing law and contact</h2>
        <p>
          These terms are governed by the laws of India. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
