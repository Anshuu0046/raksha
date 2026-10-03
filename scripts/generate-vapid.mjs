// Generates a VAPID key pair for Web Push. Run: npm run vapid
// Put the output in your environment (Vercel → Settings → Environment Variables), never in git.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:alerts@your-domain.in");
