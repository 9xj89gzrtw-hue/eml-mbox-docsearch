/**
 * Entry point.
 *
 * On Apify it runs as an Actor; locally the same file runs as a CLI:
 *
 *   node src/main.js --eml ./invoice.eml
 *   node src/main.js --mbox ./archive.mbox --max-messages 100
 *   node src/main.js --urls https://example.com/mail.eml --out result.json
 */
import fs from "node:fs";
import { run } from "./run.js";

function parseArgs(argv) {
  const args = { sourceUrls: [], kvStoreKeys: [], includeOffer: true };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--eml" && next) { args.emlText = fs.readFileSync(next, "utf8"); i += 1; }
    else if (key === "--mbox" && next) { args.mboxText = fs.readFileSync(next, "utf8"); i += 1; }
    else if (key === "--urls" && next) { args.sourceUrls.push(...next.split(",").filter(Boolean)); i += 1; }
    else if (key === "--kv" && next) { args.kvStoreKeys.push(next); i += 1; }
    else if (key === "--input" && next) { args.input = next; i += 1; }
    else if (key === "--out" && next) { args.out = next; i += 1; }
    else if (key === "--max-messages" && next) { args.maxMessages = Number(next); i += 1; }
    else if (key === "--body") { args.includeBody = true; }
    else if (key === "--no-offer") { args.includeOffer = false; }
  }
  return args;
}

async function localMain() {
  const args = parseArgs(process.argv);
  const input = args.input
    ? { ...JSON.parse(fs.readFileSync(args.input, "utf8")), ...args }
    : args;
  const out = [];
  const summary = await run(input, async (row) => out.push(row), { log: console.error });
  const payload = JSON.stringify({ summary, items: out }, null, 2);
  if (args.out) fs.writeFileSync(args.out, payload + "\n");
  else process.stdout.write(payload + "\n");
}

async function actorMain() {
  const { Actor } = await import("apify");
  await Actor.init();
  try {
    const input = (await Actor.getInput()) || {};
    const summary = await run(
      input,
      (row) => Actor.pushData(row),
      { log: console.log, readKey: (key) => Actor.getValue(key) }
    );
    console.log("run summary:", JSON.stringify(summary, null, 2));
    await Actor.setValue("SUMMARY", summary);
  } finally {
    await Actor.exit();
  }
}

const isActor = Boolean(process.env.APIFY_IS_AT_HOME || process.env.ACTOR_ID || process.env.APIFY_TOKEN);
(isActor ? actorMain() : localMain()).catch((err) => {
  console.error(err);
  process.exit(1);
});
