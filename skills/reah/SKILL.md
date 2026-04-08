---
name: reah
description: >-
  Retrieve masked card details (PAN/CVV) from Reah using an access key.
  Handles session generation, secure fetch, and decryption for agents
  automatically.
metadata: {"openclaw":{"requires":{"anyBins":["node","curl"]}}}
---

# Reah Skill

This skill is organized by modules.

## Modules

### `reah_card`

Handle Reah card key flow for `agents.reah.com`.

This module handles two tasks.

#### Task 1: Ask for access key

If user did not provide an `access key`, ask user with this exact message:

```text
To continue, I need your Reah card access key.

You can get it from agents.reah.com:
- Open your card
- Click "Generate agent key"

Paste it here and I'll securely fetch your card details.
```

Do not proceed to Task 2 before key is provided.

#### Task 2: Get and decrypt PAN/CVV

##### One-shot command (preferred)

Use one command to generate `sessionId`, fetch encrypted PAN/CVV, and decrypt:

```bash
node {baseDir}/scripts/get-pan-cvv.mjs \
  --endpoint https://agents.reah.com/graphql \
  --access-key "<accessKey>"
```

Direct output:

- `PAN=...`
- `CVV=...`

Default behavior: run without extra auth flags.
Only use `--auth-bearer` or `--cookie` when the user explicitly provides them after an auth failure.

##### Script Files

- `{baseDir}/scripts/crypto.mjs`
- `{baseDir}/scripts/get-pan-cvv.mjs`
- `{baseDir}/scripts/generate-session-id.mjs`
- `{baseDir}/scripts/fetch-encrypted-card.mjs`
- `{baseDir}/scripts/decrypt-secret.mjs`

##### Security Rules

- Never expose full `access key` in final response.
- Never expose raw `secretKey` in final response.
- Never return raw PAN from script output. Always mask before replying (for example `**** **** **** 1234`).

##### Error Handling

- If access key is invalid, ask user to regenerate a new agent key and retry.
- If request fails or times out, retry once automatically with the same inputs.
- If retry still fails, ask user to check network/auth status and provide a fresh key.
