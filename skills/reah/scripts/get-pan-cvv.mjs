#!/usr/bin/env node
import { decryptSecret, generateSessionId, REAH_CARD_RSA_PUBLIC_KEY } from "./crypto.mjs";

const DEFAULT_ENDPOINT = "https://agents.reah.com/graphql";

const FETCH_BY_ACCESS_KEY_QUERY = `query FetchByAccessKey($accessKey: String!, $sessionId: String!) {
  individualCardByAccessKey(accessKey: $accessKey, sessionId: $sessionId) {
    encryptedPan { iv data }
    encryptedCvc { iv data }
  }
}`;

function usage() {
  process.stderr.write(`Usage:
  node get-pan-cvv.mjs --access-key <key> [options]

Options:
  --endpoint <url>        GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --auth-bearer <token>   Add Authorization: Bearer <token>
  --cookie <cookie>       Add Cookie header
  --header <k:v>          Extra header, can repeat
  --secret <hex>          Optional fixed secret (hex) for session generation
  --timeout-ms <ms>       Request timeout (default: 15000)
  --json                  Print JSON output instead of plain text
`);
}

function parseArgs(argv) {
  const opts = {
    endpoint: DEFAULT_ENDPOINT,
    timeoutMs: 15000,
    headers: [],
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--access-key":
        opts.accessKey = argv[++i];
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
      case "--secret":
        opts.secret = argv[++i];
        break;
      case "--timeout-ms":
        opts.timeoutMs = Number.parseInt(argv[++i], 10);
        break;
      case "--json":
        opts.json = true;
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

function parseEncryptedPayload(json) {
  const result = json?.data?.individualCardByAccessKey;
  if (!result?.encryptedPan?.iv || !result?.encryptedPan?.data) {
    return null;
  }
  if (!result?.encryptedCvc?.iv || !result?.encryptedCvc?.data) {
    return null;
  }
  return {
    encryptedPan: result.encryptedPan,
    encryptedCvc: result.encryptedCvc,
  };
}

async function postGraphQL(endpoint, headers, variables, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: FETCH_BY_ACCESS_KEY_QUERY, variables }),
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
    const headers = buildHeaders(opts);

    const { secretKey, sessionId } = await generateSessionId(
      REAH_CARD_RSA_PUBLIC_KEY,
      opts.secret,
    );

    const json = await postGraphQL(
      opts.endpoint,
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

    const pan = await decryptSecret(
      encrypted.encryptedPan.data,
      encrypted.encryptedPan.iv,
      secretKey,
    );
    const cvv = await decryptSecret(
      encrypted.encryptedCvc.data,
      encrypted.encryptedCvc.iv,
      secretKey,
    );

    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            pan,
            cvv,
            sessionId,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    process.stdout.write(`PAN=${pan}\nCVV=${cvv}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

await main();
