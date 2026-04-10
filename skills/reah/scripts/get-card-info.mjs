#!/usr/bin/env node
import { decryptSecret, generateSessionId, REAH_CARD_RSA_PUBLIC_KEY } from "./crypto.mjs";

const DEFAULT_ENDPOINT = "https://agents.reah.com/graphql";

const FETCH_CARD_INFO_BY_ACCESS_KEY_QUERY = `query FetchByAccessKey($accessKey: String!, $sessionId: String!) {
  individualCardByAccessKey(accessKey: $accessKey, sessionId: $sessionId) {
    cardInfoPartA: encryptedPan { iv data }
    cardInfoPartB: encryptedCvc { iv data }
  }
}`;

function usage() {
  process.stderr.write(`Usage:
  node get-card-info.mjs --access-key <key> [options]

Options:
  --secret <hex>          Optional fixed secret (hex) for session generation
  --timeout-ms <ms>       Request timeout (default: 15000)
`);
}

function parseArgs(argv) {
  const opts = {
    timeoutMs: 15000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--access-key":
        opts.accessKey = argv[++i];
        break;
      case "--secret":
        opts.secret = argv[++i];
        break;
      case "--timeout-ms":
        opts.timeoutMs = Number.parseInt(argv[++i], 10);
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!opts.accessKey) {
    throw new Error("--access-key is required");
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  return opts;
}

function buildHeaders() {
  return {
    "content-type": "application/json",
  };
}

function parseEncryptedPayload(json) {
  const result = json?.data?.individualCardByAccessKey;
  if (!result?.cardInfoPartA?.iv || !result?.cardInfoPartA?.data) {
    return null;
  }
  if (!result?.cardInfoPartB?.iv || !result?.cardInfoPartB?.data) {
    return null;
  }
  return {
    encryptedCardInfoPartA: result.cardInfoPartA,
    encryptedCardInfoPartB: result.cardInfoPartB,
  };
}

async function postGraphQL(endpoint, headers, variables, timeoutMs) {
  if (endpoint !== DEFAULT_ENDPOINT) {
    throw new Error("Custom endpoint is not allowed for security reasons");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: FETCH_CARD_INFO_BY_ACCESS_KEY_QUERY, variables }),
      signal: controller.signal,
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`non-JSON GraphQL response (status ${resp.status}): ${text}`);
    }

    if (!resp.ok) {
      throw new Error(`GraphQL HTTP ${resp.status}: ${JSON.stringify(json)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const headers = buildHeaders();

    const { secretKey, sessionId } = await generateSessionId(
      REAH_CARD_RSA_PUBLIC_KEY,
      opts.secret,
    );

    const json = await postGraphQL(
      DEFAULT_ENDPOINT,
      headers,
      {
        accessKey: opts.accessKey,
        sessionId,
      },
      opts.timeoutMs,
    );

    const encrypted = parseEncryptedPayload(json);
    if (!encrypted) {
      throw new Error(`GraphQL query failed: ${JSON.stringify(json?.errors ?? json)}`);
    }

    const cardInfoPartA = await decryptSecret(
      encrypted.encryptedCardInfoPartA.data,
      encrypted.encryptedCardInfoPartA.iv,
      secretKey,
    );
    const cardInfoPartB = await decryptSecret(
      encrypted.encryptedCardInfoPartB.data,
      encrypted.encryptedCardInfoPartB.iv,
      secretKey,
    );

    process.stdout.write(`${cardInfoPartA}: ${cardInfoPartB}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

await main();
