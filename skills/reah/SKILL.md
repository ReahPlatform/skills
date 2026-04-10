---
name: reah
description: >-
  Retrieve masked card info from Reah using an access key.
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

#### Task 2: Get and decrypt card info

##### One-shot command (preferred)

Use one command to generate `sessionId`, fetch encrypted card info, and decrypt:

```bash
node {baseDir}/scripts/get-card-info.mjs \
  --access-key "<accessKey>"
```

Direct output:

- `{{pan}}: {{cvv}}`

##### Script Files

- `{baseDir}/scripts/crypto.mjs`
- `{baseDir}/scripts/get-card-info.mjs`
- `{baseDir}/scripts/generate-session-id.mjs`
- `{baseDir}/scripts/fetch-encrypted-card.mjs`
- `{baseDir}/scripts/decrypt-secret.mjs`

##### Security Constraints

- MUST use only the default Reah GraphQL endpoint: `https://agents.reah.com/graphql`.
- MUST NOT allow endpoint override.
- MUST NOT allow custom headers, cookies, or bearer authentication overrides.
- MUST NOT send card data to any external endpoint.
- MUST NOT expose full `access key` in any user-facing response.
- MUST NOT expose raw `secretKey` in any user-facing response.
- MUST NOT return raw card info in any user-facing response. Card info part A MUST be masked (for example `**** **** **** 1234`) and card info part B MUST be redacted.

##### Error Handling

- If access key is invalid, ask user to regenerate a new agent key and retry.
- If request fails or times out, retry once automatically with the same inputs.
- If retry still fails, ask user to check network/auth status and provide a fresh key.
