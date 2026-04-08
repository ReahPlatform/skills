#!/usr/bin/env node
import { decryptSecret } from "./crypto.mjs";

const DEFAULT_ENDPOINT = "https://agents.reah.com/graphql";

const FETCH_BY_ACCESS_KEY_QUERY = `query FetchByAccessKey($accessKey: String!, $sessionId: String!) {
  individualCardByAccessKey(accessKey: $accessKey, sessionId: $sessionId) {
    encryptedPan { iv data }
    encryptedCvc { iv data }
  }
}`;

function usage() {
  process.stderr.write(`Usage:
  node fetch-encrypted-card.mjs --access-key <key> --session-id <sessionId> [options]

Options:
  --endpoint <url>        GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --auth-bearer <token>   Add Authorization: Bearer <token>
  --cookie <cookie>       Add Cookie header
  --header <k:v>          Extra header, can repeat
  --secret-key <hex>      Decrypt PAN/CVV locally with AES-GCM key
  --timeout-ms <ms>       Request timeout (default: 15000)
  --compact               Print compact JSON
`);
}

function parseArgs(argv) {
  const opts = {
    endpoint: DEFAULT_ENDPOINT,
    timeoutMs: 15000,
    compact: false,
    headers: [],
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
      case "--endpoint":
        opts.endpoint = argv[++i];
        break;
      case "--auth-bearer":
        opts.authBearer = argv[++i];
        break;
      case "--cookie":
        opts.cookie = argv[++i];
        break;
      case "--header":
        opts.headers.push(argv[++i]);
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

function buildHeaders(opts) {
  const headers = {
    "content-type": "application/json",
  };
  if (opts.authBearer) {
    headers.authorization = `Bearer ${opts.authBearer}`;
  }
  if (opts.cookie) {
    headers.cookie = opts.cookie;
  }
  for (const header of opts.headers) {
    const idx = header.indexOf(":");
    if (idx <= 0) {
      throw new Error(`invalid --header value: ${header}`);
    }
    const key = header.slice(0, idx).trim();
    const value = header.slice(idx + 1).trim();
    if (!key) {
      throw new Error(`invalid header key in --header: ${header}`);
    }
    headers[key] = value;
  }
  return headers;
}

function parsePayload(json) {
  const result = json?.data?.individualCardByAccessKey;
  if (!result) return null;

  const encryptedPan = result.encryptedPan;
  const encryptedCvc = result.encryptedCvc;
  if (!encryptedPan?.iv || !encryptedPan?.data) return null;
  if (!encryptedCvc?.iv || !encryptedCvc?.data) return null;

  return {
    encryptedPan,
    encryptedCvc,
  };
}

async function postGraphQL(endpoint, headers, query, variables, timeoutMs) {
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
    const headers = buildHeaders(opts);
    const variables = {
      accessKey: opts.accessKey,
      sessionId: opts.sessionId,
    };

    const response = await postGraphQL(
      opts.endpoint,
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
      endpoint: opts.endpoint,
      operation: "individualCardByAccessKey",
      encryptedPan: parsed.encryptedPan,
      encryptedCvc: parsed.encryptedCvc,
    };

    if (opts.secretKey) {
      output.decryptedPan = await decryptSecret(
        parsed.encryptedPan.data,
        parsed.encryptedPan.iv,
        opts.secretKey,
      );
      output.decryptedCvc = await decryptSecret(
        parsed.encryptedCvc.data,
        parsed.encryptedCvc.iv,
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
