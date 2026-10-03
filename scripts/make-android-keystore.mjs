// Creates the Android release signing key (PKCS12) OUTSIDE the repository.
// Run: node scripts/make-android-keystore.mjs <output-folder>
// Needs node-forge (install with: npm i --no-save node-forge). Never commit the output.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import forge from "node-forge";

const out = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("Usage: node scripts/make-android-keystore.mjs <output-folder outside the repo>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
if (existsSync(join(out, "raksha-release.p12"))) {
  console.error("A key already exists there. Refusing to overwrite it.");
  process.exit(1);
}

const password = randomBytes(18).toString("base64url");
const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 30);
const attrs = [{ name: "commonName", value: "Raksha" }, { name: "organizationName", value: "Raksha" }, { name: "countryName", value: "IN" }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des", friendlyName: "raksha" });
const der = Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");

writeFileSync(join(out, "raksha-release.p12"), der);
writeFileSync(join(out, "ANDROID_KEYSTORE_BASE64.txt"), der.toString("base64"));
writeFileSync(join(out, "ANDROID_KEYSTORE_PASSWORD.txt"), password);
console.log("Key created in", out, "(contents not printed). Back this folder up: losing it means you can never update the app.");
