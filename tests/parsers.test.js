import test from "node:test";
import assert from "node:assert/strict";

import {
  splitMessages,
  parseMessage,
  decodeHeader,
  decodeTransfer,
  decodeBuffer,
  htmlToText
} from "../src/mime.js";
import {
  extractInn,
  extractKpp,
  extractOgrn,
  extractVatIds,
  extractContracts,
  parseAmount,
  extractAmounts,
  extractDates,
  extractCounterparties,
  detectDocType,
  extractFields
} from "../src/extract.js";
import { run } from "../src/run.js";

const SAMPLE = `From: "ООО Ромашка" <billing@romashka.ru>
To: client@example.com
Subject: Счёт № 128-А/2026 на оплату
Date: Fri, 6 Nov 2026 10:00:00 +0300
MIME-Version: 1.0
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: 8bit

Здравствуйте!

Направляем счёт № 128-А/2026 от 06.11.2026 на сумму 148 500,00 руб.
ИНН 7701234567, КПП 770101001, ОГРН 1027700132195.
Контрагент: ООО "Ромашка".
Договор № 45/2026-У от 01.10.2026.
Тел.: +7 (495) 123-45-67, e-mail: billing@romashka.ru
`;

test("splitMessages: single eml stays one message", () => {
  assert.equal(splitMessages(SAMPLE).length, 1);
});

test("splitMessages: mbox with two messages", () => {
  const mbox = `From a@b.c Fri Nov  6 10:00:00 2026
From: a@b.c
Subject: First

body one
From d@e.f Fri Nov  6 11:00:00 2026
From: d@e.f
Subject: Second

body two
`;
  const messages = splitMessages(mbox);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /Subject: First/);
  assert.match(messages[1], /Subject: Second/);
});

test("parseMessage: headers, text and attachment", () => {
  const raw = `From: a@b.c
To: c@d.e
Subject: Invoice 42
Content-Type: multipart/mixed; boundary="BOUND"

--BOUND
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: 8bit

Hello, ИНН 7701234567
--BOUND
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--BOUND--
`;
  const parsed = parseMessage(raw);
  assert.equal(parsed.headers.subject, "Invoice 42");
  assert.match(parsed.text, /7701234567/);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].filename, "invoice.pdf");
});

test("parseMessage: base64 UTF-8 body", () => {
  const body = Buffer.from("Привет, ИНН 7701234567", "utf8").toString("base64");
  const raw = `From: a@b.c
Subject: Test
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: base64

${body}
`;
  assert.match(parseMessage(raw).text, /Привет, ИНН 7701234567/);
});

test("decodeHeader: RFC 2047 base64", () => {
  assert.equal(decodeHeader("=?UTF-8?B?0J/RgNC40LLQtdGC?="), "Привет");
});

test("quoted-printable decoding and htmlToText", () => {
  const qp = "=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82";
  assert.equal(decodeBuffer(decodeTransfer(qp, "quoted-printable"), "utf-8"), "Привет");
  assert.equal(htmlToText("<p>Hello&nbsp;<b>world</b></p>"), "Hello world");
});

test("extract: Russian tax IDs", () => {
  assert.deepEqual(extractInn("ИНН 7701234567, ИНН: 770123456789"), ["7701234567", "770123456789"]);
  assert.deepEqual(extractKpp("КПП 770101001"), ["770101001"]);
  assert.deepEqual(extractOgrn("ОГРН 1027700132195"), ["1027700132195"]);
});

test("extract: EU VAT IDs", () => {
  assert.ok(extractVatIds("VAT ID: DE123456789").includes("DE123456789"));
});

test("extract: contract numbers", () => {
  const found = extractContracts("Договор № 45/2026-У от 01.10.2026. Счёт № 128-А/2026.");
  assert.ok(found.includes("45/2026-У"));
  assert.ok(found.includes("128-А/2026"));
});

test("extract: amounts and dates", () => {
  assert.equal(parseAmount("148 500,00"), 148500);
  const amounts = extractAmounts("Сумма 148 500,00 руб. и $1,299.50");
  assert.ok(amounts.some((a) => a.value === 148500 && a.currency === "RUB"));
  assert.ok(amounts.some((a) => a.value === 1299.5 && a.currency === "USD"));
  const dates = extractDates("от 06.11.2026 и 1 октября 2026");
  assert.deepEqual(dates, ["2026-11-06", "2026-10-01"]);
});

test("extract: counterparties", () => {
  const found = extractCounterparties('Контрагент: ООО "Ромашка".');
  assert.ok(found.includes('ООО "Ромашка"'));
});

test("detectDocType: invoice wins over contract", () => {
  assert.equal(detectDocType({ subject: "Счёт № 1", text: "Договор № 2" }), "invoice");
  assert.equal(detectDocType({ subject: "Договор", text: "" }), "contract");
});

test("extractFields: full sample", () => {
  const parsed = parseMessage(SAMPLE);
  const fields = extractFields(parsed.text, parsed.headers.subject);
  assert.equal(fields.doc_type, "invoice");
  assert.deepEqual(fields.inn, ["7701234567"]);
  assert.deepEqual(fields.kpp, ["770101001"]);
  assert.deepEqual(fields.ogrn, ["1027700132195"]);
  assert.ok(fields.contract_numbers.includes("128-А/2026"));
  assert.ok(fields.contract_numbers.includes("45/2026-У"));
  assert.equal(fields.total_amount.value, 148500);
  assert.ok(fields.dates.includes("2026-11-06"));
  assert.ok(fields.counterparties.includes('ООО "Ромашка"'));
  assert.ok(fields.confidence > 0.5);
});

test("run: one message plus offer record", async () => {
  const rows = [];
  const summary = await run({ emlText: SAMPLE, includeOffer: true }, async (row) => rows.push(row));
  assert.equal(summary.messages, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]._type, "message");
  assert.equal(rows[0].subject, "Счёт № 128-А/2026 на оплату");
  assert.equal(rows[0].date, "2026-11-06T07:00:00.000Z");
  assert.equal(rows[1]._type, "offer");
  assert.match(rows[1].note, /TW1-DOC/);
});
