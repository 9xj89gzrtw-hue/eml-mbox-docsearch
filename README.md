# EML / MBOX → Invoice, Contract & Tax ID Table (No Third-Party OCR)

**Drop a mail archive in, get a clean table out:** document type, INN / KPP / OGRN, EU & UK VAT IDs, contract numbers, amounts, dates, counterparties, e-mails, phones and attachment names — one row per message, ready for CSV or Excel.

> **Need to search 10,000+ e-mails completely offline?**
> **Archive Studio DocSearch Pro** indexes `.eml` / `.mbox` archives on your own machine: full-text search, contract ↔ invoice ↔ act matching, Excel register per counterparty. Archives never leave the computer.
> Pro key `TW1-DOC` — **690 ₽ / $15 USDC**, lifetime.
> [Plati.Market lot 6354601](https://plati.market/itm/6354601) · [oplata.info checkout](https://oplata.info/asp2/pay_wm.asp?id_d=6354601&ai=1481449&lang=ru-RU) · [product page](https://9xj89gzrtw-hue.github.io/docsearch/)

---

## What it does

| Input | What you get |
|---|---|
| one `.eml` message (paste or URL) | one row with headers, decoded subject, document type and every requisite found |
| `.mbox` archive | one row per message, `From ` separators handled |
| key-value store record | large archives without pasting them into the input form |

For every message the Actor returns:

- `doc_type` — `invoice`, `contract`, `upd`, `act`, `claim` or `other`
- `inn`, `kpp`, `ogrn` — Russian tax and registration IDs
- `vat_ids` — EU / UK VAT IDs (`DE…`, `FR…`, `NL…`, `GB…` and 25 more)
- `contract_numbers` — contract, invoice and agreement numbers
- `amounts`, `total_amount` — every amount with currency, plus the largest one
- `dates` — all dates normalized to ISO
- `counterparties` — `ООО`, `АО`, `ИП`, `ПАО` and other legal entities
- `emails`, `phones`, `attachments` — contacts and attachment filenames
- `confidence` — share of the 7 requisite groups that matched

No login, no OCR API, no third-party processor. MIME parsing, base64 / quoted-printable decoding, charset handling and the extraction rules all run inside the Actor's own container in your Apify account.

## Quick start

1. Choose one input method:
   - paste a message into **emlText** (Gmail → *Show original*, Outlook → *Save as*),
   - paste an **mboxText** archive,
   - add a public **sourceUrls** link to a raw `.eml` / `.mbox` file,
   - or put the archive into the key-value store and list its key in **kvStoreKeys**.
2. Keep `maxMessages` at **500** (free tier) or raise it to 10,000 for a bigger batch.
3. Run. Export the dataset as **CSV** or **XLSX** from the Apify Console.

Example input:

```json
{
  "sourceUrls": ["https://example.com/archive/invoices-2026.mbox"],
  "maxMessages": 500,
  "includeBody": false,
  "includeOffer": true
}
```

Example output row:

```json
{
  "_type": "message",
  "message_index": 1,
  "subject": "Счёт № 128-А/2026 на оплату",
  "from": "\"ООО Ромашка\" <billing@romashka.ru>",
  "date": "2026-11-06T07:00:00.000Z",
  "doc_type": "invoice",
  "inn": ["7701234567"],
  "kpp": ["770101001"],
  "ogrn": ["1027700132195"],
  "vat_ids": [],
  "contract_numbers": ["128-А/2026", "45/2026-У"],
  "total_amount": { "value": 148500, "currency": "RUB" },
  "dates": ["2026-11-06", "2026-10-01"],
  "counterparties": ["ООО \"Ромашка\""],
  "emails": ["billing@romashka.ru"],
  "phones": ["+74951234567"],
  "attachments": [],
  "confidence": 0.86
}
```

## How it works (and where it stops)

- **MIME.** The parser handles single `.eml`, mbox `From ` separators, nested `multipart/*`, base64, quoted-printable, RFC 2047 headers and UTF-8 / windows-1251 / KOI8-R charsets. Attachments are listed by name, type and size — their contents are never decoded into the dataset.
- **Extraction.** Pure regular expressions over plain text, tuned for Russian business correspondence and EU VAT formats. Every match is returned as a list, so a false positive is visible and easy to filter.
- **Scanned PDFs.** If an invoice is only a scanned image attached to the e-mail, there is no text to extract. The row still shows the attachment name and `doc_type` from the subject.
- **Limits.** The free tier caps a run at 10,000 messages (500 by default) and 40 MB per source file. The paid desktop app has no cap and builds a persistent search index.

## Output

The dataset contains three record types, all carrying the same one-line offer:

- `message` — one parsed e-mail
- `error` — honest failure record (HTTP error, empty archive, missing key)
- `offer` — Pro offer, price, checkout and Plati.Market links

Export from the Console or hit the dataset API:

```
GET /v2/datasets/{id}/items?format=csv
GET /v2/datasets/{id}/items?format=xlsx
```

## Free vs Pro

| | This Actor (free tier) | Archive Studio DocSearch Pro (`TW1-DOC`) |
|---|---|---|
| Messages per run | 500 (max 10,000) | unlimited |
| INN / KPP / OGRN / VAT ID | ✅ | ✅ |
| Contracts, amounts, dates, counterparties | ✅ | ✅ |
| Full-text search across the archive | — | ✅ instant index |
| Contract ↔ invoice ↔ act matching | — | ✅ |
| Excel register per counterparty | — | ✅ one click |
| Where it runs | Apify cloud (your account) | your computer, fully offline |
| Price | free tier | **690 ₽ / $15 USDC**, lifetime key |

The Pro key is ECDSA P-256 signed and verified offline. It is delivered automatically on the order page after SBP / RU card payment and never expires.

## Local development

```bash
npm install
npm test                              # 14 offline tests, no network
node src/main.js --eml examples/sample.eml
node src/main.js --mbox ./archive.mbox --max-messages 100 --out result.json
```

The same `src/run.js` powers the Actor and the CLI; `src/main.js` switches on `APIFY_IS_AT_HOME` / `ACTOR_ID`.

## Files

```
.actor/actor.json          Actor spec, categories, dataset + output schema
.actor/INPUT_SCHEMA.json   emlText, mboxText, sourceUrls, kvStoreKeys, limits
src/mime.js                mbox splitter, MIME walker, charset + transfer decoding
src/extract.js             INN/KPP/OGRN/VAT, contracts, amounts, dates, counterparties
src/run.js                 orchestration and dataset records
src/offer.js               single source of truth for the Pro offer
tests/                     offline tests (no network)
```

## License

MIT. The Actor is free to run within the tier above; the offline desktop app is a separate product sold on Plati.Market.
