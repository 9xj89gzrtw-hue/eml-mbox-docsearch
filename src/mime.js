/**
 * Minimal MIME / mbox reader.
 *
 * Handles the formats that actually appear in invoice archives:
 *  - single .eml with headers + body
 *  - mbox with `From ` separators
 *  - multipart/alternative, multipart/mixed, nested multipart
 *  - base64 and quoted-printable transfer encodings
 *  - UTF-8, windows-1251, KOI8-R and other charsets via TextDecoder
 *  - RFC 2047 encoded headers (=?UTF-8?B?...?=)
 *
 * No network, no external dependency. Attachments are listed by filename and
 * size but never decoded into the dataset.
 */

export function splitMessages(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  // mbox: a line starting with "From " (no colon) separates messages.
  const mboxParts = [];
  const mboxRe = /^From [^\n]*\n/gm;
  const starts = [];
  let m;
  while ((m = mboxRe.exec(text))) starts.push(m.index);
  if (starts.length >= 1 && /^From [^\n]*\n[\s\S]*?^Subject:/m.test(text)) {
    for (let i = 0; i < starts.length; i += 1) {
      const chunk = text.slice(starts[i], starts[i + 1] ?? text.length);
      const body = chunk.replace(/^From [^\n]*\n/, "");
      if (body.trim()) mboxParts.push(body);
    }
    if (mboxParts.length) return mboxParts;
  }

  // Several concatenated .eml files: split before a new "From:" header.
  const emlParts = text.split(/\n(?=From:\s)/i).map((s) => s.trim()).filter(Boolean);
  if (emlParts.length > 1 && emlParts.every((p) => /^From:/im.test(p) || /^Subject:/im.test(p))) {
    return emlParts;
  }

  return [text];
}

export function parseHeaders(block) {
  const text = String(block || "").replace(/\r\n/g, "\n");
  const split = text.indexOf("\n\n");
  const head = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? "" : text.slice(split + 2);
  const unfolded = head.replace(/\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (headers[key] === undefined) headers[key] = value;
    else headers[key] += `, ${value}`;
  }
  return { headers, body };
}

export function decodeHeader(value = "") {
  return String(value).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, data) => {
    try {
      let buf;
      if (enc.toUpperCase() === "B") {
        buf = Buffer.from(data, "base64");
      } else {
        const bytes = [];
        const q = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (___, hex) => String.fromCharCode(parseInt(hex, 16)));
        for (let i = 0; i < q.length; i += 1) bytes.push(q.charCodeAt(i) & 0xff);
        buf = Buffer.from(bytes);
      }
      return decodeBuffer(buf, charset);
    } catch {
      return data;
    }
  });
}

export function decodeBuffer(buf, charset = "utf-8") {
  const label = normalizeCharset(charset);
  try {
    return new TextDecoder(label, { fatal: false }).decode(buf);
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch {
      return buf.toString("latin1");
    }
  }
}

function normalizeCharset(charset = "") {
  const c = String(charset).trim().toLowerCase().replace(/^["']|["']$/g, "");
  const map = {
    "windows-1251": "windows-1251",
    "cp1251": "windows-1251",
    "win-1251": "windows-1251",
    "koi8-r": "koi8-r",
    "koi8r": "koi8-r",
    "iso-8859-1": "iso-8859-1",
    "latin1": "iso-8859-1",
    "utf8": "utf-8",
    "utf-8": "utf-8",
    "us-ascii": "utf-8"
  };
  return map[c] || c || "utf-8";
}

export function decodeQuotedPrintable(input) {
  return String(input)
    .replace(/=\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function decodeTransfer(body, encoding = "") {
  const enc = String(encoding).toLowerCase().trim();
  if (enc === "base64") {
    const clean = String(body).replace(/[^A-Za-z0-9+/=]/g, "");
    return Buffer.from(clean, "base64");
  }
  if (enc === "quoted-printable") {
    return Buffer.from(decodeQuotedPrintable(body), "latin1");
  }
  return Buffer.from(String(body), "utf8");
}

function contentType(headers) {
  const raw = headers["content-type"] || "text/plain";
  const [type, ...rest] = raw.split(";");
  const params = {};
  for (const part of rest) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    params[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
  return { type: type.trim().toLowerCase(), params };
}

function decodePart(headers, body) {
  const { type, params } = contentType(headers);
  const charset = params.charset || "utf-8";
  const buf = decodeTransfer(body, headers["content-transfer-encoding"]);
  return { type, charset, text: decodeBuffer(buf, charset) };
}

/**
 * Parse one message into { headers, text, html, attachments }.
 */
export function parseMessage(raw) {
  const { headers, body } = parseHeaders(raw);
  const attachments = [];
  const texts = [];
  const htmls = [];

  const walk = (hdrs, bodyText, depth = 0) => {
    if (depth > 4) return;
    const { type, params } = contentType(hdrs);
    if (type.startsWith("multipart/")) {
      const boundary = params.boundary;
      if (!boundary) return;
      const parts = splitMultipart(bodyText, boundary);
      for (const part of parts) {
        const parsed = parseHeaders(part);
        walk(parsed.headers, parsed.body, depth + 1);
      }
      return;
    }
    const disposition = hdrs["content-disposition"] || "";
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (filenameMatch) {
      attachments.push({
        filename: decodeHeader(filenameMatch[1].replace(/"$/, "").trim()),
        content_type: type,
        bytes: Buffer.byteLength(bodyText, "utf8")
      });
    }
    if (type === "text/plain") texts.push(decodePart(hdrs, bodyText).text);
    else if (type === "text/html") htmls.push(decodePart(hdrs, bodyText).text);
  };

  walk(headers, body);

  const text = texts.join("\n").trim();
  const html = htmls.join("\n").trim();
  return {
    headers,
    text: text || (html ? htmlToText(html) : ""),
    html,
    attachments
  };
}

function splitMultipart(body, boundary) {
  const marker = `--${boundary}`;
  const chunks = String(body).split(marker);
  const parts = [];
  for (let i = 1; i < chunks.length; i += 1) {
    let chunk = chunks[i];
    if (chunk.startsWith("--")) break; // closing boundary
    chunk = chunk.replace(/^\n/, "");
    const end = chunk.lastIndexOf("\n");
    parts.push(end === -1 ? chunk : chunk.slice(0, end));
  }
  return parts;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
