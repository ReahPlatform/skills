#!/usr/bin/env node
import { generateSessionId, REAH_CARD_RSA_PUBLIC_KEY } from "./crypto.mjs";

const argSecret = process.argv[2];

const result = await generateSessionId(REAH_CARD_RSA_PUBLIC_KEY, argSecret);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
