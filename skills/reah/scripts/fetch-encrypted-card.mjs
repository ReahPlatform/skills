#!/usr/bin/env node
import { decryptSecret } from "./crypto.mjs";

const DEFAULT_ENDPOINT = "https://agents.reah.com/graphql";

const FETCH_BY_ACCESS_KEY_QUERY = `query FetchByAccessKey($accessKey: String!, $sessionId: String!) {
  individualCardByAccessKey(accessKey: $accessKey, sessionId: $sessionId) {
    cardInfoPartA: encryptedPan { iv data }
    cardInfoPartB: encryptedCvc { iv data }
  }
}`;

function usage() {
  process.stderr.write(`Usage:
  node fetch-encrypted-card.mjs --access-key <key> --session-id <sessionId> [options]

Options:
  --secret-key <hex>      Decrypt card info locally with AES-GCM key
  --timeout-ms <ms>       Request timeout (default: 15000)
  --compact               Print compact JSON
`);
}

function parseArgs(argv) {
  const opts = {
    timeoutMs: 15000,
    compact: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--access-key":
        opts.accessKey = argv[++i];
        break;
      case "--session-id":
        opts.sessionId = argv[++i];
        break;
      case "--secret-key":
        opts.secretKey = argv[++i];
        break;
      case "--timeout-ms":
        opts.timeoutMs = Number.parseInt(argv[++i], 10);
        break;
      case "--compact":
        opts.compact = true;
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
  if (!opts.sessionId) {
    throw new Error("--session-id is required");
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

function parsePayload(json) {
  const result = json?.data?.individualCardByAccessKey;
  if (!result) return null;

  const encryptedCardInfoPartA = result.cardInfoPartA;
  const encryptedCardInfoPartB = result.cardInfoPartB;
  if (!encryptedCardInfoPartA?.iv || !encryptedCardInfoPartA?.data) return null;
  if (!encryptedCardInfoPartB?.iv || !encryptedCardInfoPartB?.data) return null;

  return {
    encryptedCardInfoPartA,
    encryptedCardInfoPartB,
  };
}

async function postGraphQL(endpoint, headers, query, variables, timeoutMs) {
  if (endpoint !== DEFAULT_ENDPOINT) {
    throw new Error("Custom endpoint is not allowed for security reasons");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`non-JSON GraphQL response (status ${resp.status}): ${text}`);
    }

    return {
      status: resp.status,
      ok: resp.ok,
      json,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const headers = buildHeaders();
    const variables = {
      accessKey: opts.accessKey,
      sessionId: opts.sessionId,
    };

    const response = await postGraphQL(
      DEFAULT_ENDPOINT,
      headers,
      FETCH_BY_ACCESS_KEY_QUERY,
      variables,
      opts.timeoutMs,
    );
    const json = response.json;
    const parsed = parsePayload(json);

    if (!response.ok) {
      throw new Error(`GraphQL HTTP ${response.status}: ${JSON.stringify(json)}`);
    }
    if (!parsed) {
      throw new Error(
        `GraphQL query failed: ${JSON.stringify(json?.errors ?? json)}`,
      );
    }

    const output = {
      endpoint: DEFAULT_ENDPOINT,
      operation: "individualCardByAccessKey",
      encryptedCardInfoPartA: parsed.encryptedCardInfoPartA,
      encryptedCardInfoPartB: parsed.encryptedCardInfoPartB,
    };

    if (opts.secretKey) {
      output.decryptedCardInfoPartA = await decryptSecret(
        parsed.encryptedCardInfoPartA.data,
        parsed.encryptedCardInfoPartA.iv,
        opts.secretKey,
      );
      output.decryptedCardInfoPartB = await decryptSecret(
        parsed.encryptedCardInfoPartB.data,
        parsed.encryptedCardInfoPartB.iv,
        opts.secretKey,
      );
    }

    process.stdout.write(
      `${JSON.stringify(output, null, opts.compact ? 0 : 2)}\n`,
    );
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

await main();
