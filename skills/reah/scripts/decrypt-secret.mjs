#!/usr/bin/env node
import { decryptSecret } from "./crypto.mjs";

const [, , base64Secret, base64Iv, secretKey] = process.argv;

if (!base64Secret || !base64Iv || !secretKey) {
  process.stderr.write(
    "Usage: node decrypt-secret.mjs <base64Secret> <base64Iv> <secretKeyHex>\n",
  );
  process.exit(1);
}

const plaintext = await decryptSecret(base64Secret, base64Iv, secretKey);
process.stdout.write(`${plaintext}\n`);
