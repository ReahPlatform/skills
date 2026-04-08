import { webcrypto } from "node:crypto";

const cryptoApi = globalThis.crypto ?? webcrypto;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isHex(input) {
  return /^[0-9A-Fa-f]+$/.test(input);
}

function hexToBytes(hex) {
  if (!isHex(hex) || hex.length % 2 !== 0) {
    throw new Error("hex must be an even-length hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(input) {
  return new Uint8Array(Buffer.from(input, "base64"));
}

function parsePemToDer(pem) {
  const header = "-----BEGIN PUBLIC KEY-----";
  const footer = "-----END PUBLIC KEY-----";
  if (!pem.includes(header) || !pem.includes(footer)) {
    throw new Error("invalid PEM public key");
  }
  const body = pem
    .replace(header, "")
    .replace(footer, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

export async function generateSessionId(pem, secret) {
  if (!pem) throw new Error("pem is required");
  if (secret && !isHex(secret)) {
    throw new Error("secret must be a hex string");
  }

  const secretKey = secret ?? cryptoApi.randomUUID().replace(/-/g, "");
  const secretBytes = hexToBytes(secretKey);
  const secretKeyBase64 = bytesToBase64(secretBytes);

  const rsaPublicKey = await cryptoApi.subtle.importKey(
    "spki",
    parsePemToDer(pem),
    { name: "RSA-OAEP", hash: "SHA-1" },
    true,
    ["encrypt"],
  );

  const encrypted = await cryptoApi.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    textEncoder.encode(secretKeyBase64),
  );

  return {
    secretKey,
    sessionId: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSecret(base64Secret, base64Iv, secretKey) {
  if (!base64Secret) throw new Error("base64Secret is required");
  if (!base64Iv) throw new Error("base64Iv is required");
  if (!secretKey || !isHex(secretKey)) {
    throw new Error("secretKey must be a hex string");
  }

  const cryptoKey = await cryptoApi.subtle.importKey(
    "raw",
    hexToBytes(secretKey),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const decrypted = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(base64Iv) },
    cryptoKey,
    base64ToBytes(base64Secret),
  );

  return textDecoder.decode(decrypted);
}

export const REAH_CARD_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;
