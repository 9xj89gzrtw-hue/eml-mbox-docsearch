/**
 * One run = read every requested .eml / .mbox source, parse MIME, extract
 * business requisites and push one clean row per message.
 *
 * No `apify` import here: the same code runs in the Actor, in the CLI and in
 * the offline tests.
 */
import { offerLine, offerRecord } from "./offer.js";
import { splitMessages, parseMessage } from "./mime.js";
import { extractFields } from "./extract.js";

const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isoFromHeader(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : String(value).slice(0, 80);
}

function preview(text, limit) {
  if (!limit) return undefined;
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function decodeAuto(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("windows-1251", { fatal: false }).decode(buf);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
  }
}

async function fetchSource(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { "user-agent": "apify-actor eml-mbox-extractor/1.0", accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SOURCE_BYTES) throw new Error(`source too large: ${buf.length} bytes`);
  return decodeAuto(buf);
}

function sourceLabel(source) {
  if (source.kind === "url") return source.url;
  if (source.kind === "kv") return `kv:${source.key}`;
  return source.name;
}

function buildRow({ message, fields, source, index, includeBody, bodyPreviewChars }) {
  const subject = fields.subject || "";
  const row = {
    _type: "message",
    message_index: index,
    source: sourceLabel(source),
    source_type: source.kind,
    subject,
    from: fields.from || null,
    to: fields.to || null,
    cc: fields.cc || null,
    date: isoFromHeader(fields.date_header),
    doc_type: fields.doc_type,
    inn: fields.inn,
    kpp: fields.kpp,
    ogrn: fields.ogrn,
    vat_ids: fields.vat_ids,
    contract_numbers: fields.contract_numbers,
    total_amount: fields.total_amount,
    amounts: fields.amounts,
    dates: fields.dates,
    counterparties: fields.counterparties,
    emails: fields.emails,
    phones: fields.phones,
    attachments: fields.attachments,
    has_attachments: fields.attachments.length > 0,
    confidence: fields.confidence,
    offer: offerLine()
  };
  if (includeBody) row.body_preview = preview(message.text, bodyPreviewChars);
  return row;
}

export async function run(input = {}, push = async () => {}, { log = () => {}, readKey = null } = {}) {
  const maxMessages = clamp(input.maxMessages, 1, 10000, 500);
  const bodyPreviewChars = clamp(input.bodyPreviewChars, 0, 5000, 500);
  const includeBody = input.includeBody === true;
  const includeOffer = input.includeOffer !== false;
  const timeoutMs = clamp((Number(input.requestTimeoutSecs) || 30) * 1000, 5000, 120000, 30000);

  const sources = [];
  if (input.emlText) sources.push({ kind: "text", name: "emlText", text: String(input.emlText) });
  if (input.mboxText) sources.push({ kind: "text", name: "mboxText", text: String(input.mboxText) });
  for (const url of Array.isArray(input.sourceUrls) ? input.sourceUrls : []) {
    if (url) sources.push({ kind: "url", url: String(url) });
  }
  for (const key of Array.isArray(input.kvStoreKeys) ? input.kvStoreKeys : []) {
    if (key) sources.push({ kind: "kv", key: String(key) });
  }

  let pushed = 0;
  let withInn = 0;
  let withContract = 0;
  let withAmount = 0;
  let skipped = 0;
  let failures = 0;
  const docTypes = {};
  const perSource = [];

  outer: for (const source of sources) {
    let raw;
    try {
      if (source.kind === "text") raw = source.text;
      else if (source.kind === "url") raw = await fetchSource(source.url, timeoutMs);
      else if (source.kind === "kv") {
        if (typeof readKey !== "function") throw new Error("key-value store access is only available inside Apify");
        const value = await readKey(source.key);
        if (value === null || value === undefined) throw new Error(`key not found: ${source.key}`);
        raw = typeof value === "string" ? value : JSON.stringify(value);
      }
    } catch (err) {
      failures += 1;
      perSource.push({ source: sourceLabel(source), ok: false, error: err.message });
      await push({ _type: "error", source: sourceLabel(source), source_type: source.kind, error: err.message, offer: offerLine() });
      continue;
    }

    let messages;
    try {
      messages = splitMessages(raw);
    } catch (err) {
      failures += 1;
      perSource.push({ source: sourceLabel(source), ok: false, error: err.message });
      await push({ _type: "error", source: sourceLabel(source), source_type: source.kind, error: err.message, offer: offerLine() });
      continue;
    }

    if (!messages.length) {
      failures += 1;
      perSource.push({ source: sourceLabel(source), ok: false, error: "no messages found" });
      await push({ _type: "error", source: sourceLabel(source), source_type: source.kind, error: "no messages found", offer: offerLine() });
      continue;
    }

    let sourceCount = 0;
    for (let i = 0; i < messages.length; i += 1) {
      if (pushed >= maxMessages) {
        skipped += messages.length - i;
        break outer;
      }
      const parsed = parseMessage(messages[i]);
      const headers = parsed.headers;
      const subject = headers.subject || "";
      const bodyText = parsed.text || "";
      const fields = extractFields(bodyText, subject);
      const row = buildRow({
        message: parsed,
        fields: {
          ...fields,
          subject,
          from: headers.from || null,
          to: headers.to || null,
          cc: headers.cc || null,
          date_header: headers.date || null,
          attachments: parsed.attachments
        },
        source,
        index: pushed + 1,
        includeBody,
        bodyPreviewChars
      });
      await push(row);
      pushed += 1;
      sourceCount += 1;
      if (fields.inn.length || fields.vat_ids.length) withInn += 1;
      if (fields.contract_numbers.length) withContract += 1;
      if (fields.amounts.length) withAmount += 1;
      docTypes[fields.doc_type] = (docTypes[fields.doc_type] || 0) + 1;
    }

    log(`source ${sourceLabel(source)}: ${sourceCount} message(s)`);
    perSource.push({
      source: sourceLabel(source),
      ok: true,
      messages: sourceCount,
      truncated: sourceCount < messages.length
    });
  }

  if (includeOffer) await push(offerRecord());

  return {
    sources_requested: sources.length,
    messages: pushed,
    with_tax_id: withInn,
    with_contract: withContract,
    with_amount: withAmount,
    skipped,
    failures,
    doc_types: docTypes,
    offer: offerLine(),
    per_source: perSource
  };
}
