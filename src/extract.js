/**
 * Requisite extraction from Russian and international business correspondence.
 *
 * Pure functions over plain text: no network, no model, no cloud. Every match
 * is returned with the surrounding quote so a human can verify it in one look.
 */

const MONTHS = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12
};

function normalize(text) {
  return String(text || "")
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/[«»„“”]/g, '"')
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ");
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function findAll(text, re, group = 1) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    const value = (m[group] || "").trim();
    if (value) out.push(value);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return unique(out);
}

export function extractInn(text) {
  return findAll(text, /(?:^|[^\d])ИНН\s*[:№]?\s*(\d{10}|\d{12})(?!\d)/gi);
}

export function extractKpp(text) {
  return findAll(text, /(?:^|[^\d])КПП\s*[:№]?\s*(\d{9})(?!\d)/gi);
}

export function extractOgrn(text) {
  return findAll(text, /(?:^|[^\d])(?:ОГРН|OGRN)\s*[:№]?\s*(\d{13}|\d{15})(?!\d)/gi);
}

const VAT_PATTERNS = [
  /\bATU\d{8}\b/g, /\bBE0?\d{9,10}\b/g, /\bBG\d{9,10}\b/g, /\bCY\d{8}[A-Z]\b/g,
  /\bCZ\d{8,10}\b/g, /\bDE\d{9}\b/g, /\bDK\d{8}\b/g, /\bEE\d{9}\b/g,
  /\bEL\d{9}\b/g, /\bES[A-Z0-9]\d{7}[A-Z0-9]\b/g, /\bFI\d{8}\b/g,
  /\bFR[A-Z0-9]{2}\d{9}\b/g, /\bHR\d{11}\b/g, /\bHU\d{8}\b/g,
  /\bIE\d{7}[A-Z]{1,2}\b/g, /\bIT\d{11}\b/g, /\bLT\d{9}\b/g,
  /\bLU\d{8}\b/g, /\bLV\d{11}\b/g, /\bMT\d{8}\b/g, /\bNL\d{9}B\d{2}\b/g,
  /\bPL\d{10}\b/g, /\bPT\d{9}\b/g, /\bRO\d{2,10}\b/g, /\bSE\d{12}\b/g,
  /\bSI\d{8}\b/g, /\bSK\d{10}\b/g, /\bGB\d{9}\b/g, /\bGB\d{12}\b/g
];

export function extractVatIds(text) {
  const out = [];
  for (const re of VAT_PATTERNS) out.push(...findAll(text, re, 0));
  // Generic "VAT ID: XX123456789" fallback.
  out.push(...findAll(text, /\bVAT\s*(?:ID|No\.?|number)?\s*[:#]?\s*([A-Z]{2}[A-Z0-9]{8,14})\b/gi));
  return unique(out.map((v) => v.toUpperCase()));
}

export function extractContracts(text) {
  const patterns = [
    /(?:договор|контракт|соглашение)[^.\n]{0,40}?(?:№|N|No\.?|#)\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9/\-–—_.]{2,40})/gi,
    /(?:счёт|счет|invoice)[^.\n]{0,30}?(?:№|N|No\.?|#)\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9/\-–—_.]{2,40})/gi,
    /(?:contract|agreement)\s*(?:no\.?|number|#)\s*([A-Z0-9][A-Z0-9/\-–—_.]{2,40})/gi
  ];
  const raw = [];
  for (const re of patterns) raw.push(...findAll(text, re));
  return unique(
    raw
      .map((v) => v.replace(/[.,;:]+$/, "").trim())
      .filter((v) => /\d/.test(v)) // contract numbers always contain a digit
      .filter((v) => v.length >= 3 && v.length <= 42)
  );
}

export function parseAmount(raw) {
  let s = String(raw || "").replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    s = s.replace(",", ".");
  }
  const value = Number(s);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

const CURRENCY = {
  "руб": "RUB", "руб.": "RUB", "рублей": "RUB", "рубля": "RUB", "₽": "RUB", rub: "RUB",
  usd: "USD", "$": "USD", eur: "EUR", "€": "EUR"
};

export function extractAmounts(text) {
  const out = [];
  const push = (raw, cur) => {
    const value = parseAmount(raw);
    if (value === null || value <= 0) return;
    const currency = CURRENCY[String(cur || "").toLowerCase()] || String(cur || "").toUpperCase() || null;
    out.push({ value, currency, raw: `${raw} ${cur}`.trim() });
  };
  let m;
  const before = /(\d[\d\s.,]*)\s*(руб(?:\.|лей|ля)?|₽|RUB|USD|EUR|\$|€)/gi;
  while ((m = before.exec(text))) push(m[1], m[2]);
  const after = /(руб(?:\.|лей|ля)?|₽|\$|€)\s*(\d[\d\s.,]*)/gi;
  while ((m = after.exec(text))) push(m[2], m[1]);
  // Deduplicate by value+currency.
  const seen = new Set();
  return out.filter((a) => {
    const key = `${a.value}|${a.currency}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractDates(text) {
  const out = [];
  const pushIso = (y, mo, d) => {
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    out.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  };
  let m;
  const dmy = /\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g;
  while ((m = dmy.exec(text))) pushIso(m[3], m[2], m[1]);
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(text))) pushIso(m[1], m[2], m[3]);
  const ru = /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\b/gi;
  while ((m = ru.exec(text))) pushIso(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  return unique(out);
}

export function extractCounterparties(text) {
  const re = /(?:^|[^А-ЯЁA-Z])(ООО|ОАО|ЗАО|ПАО|АО|ИП|ФГУП|ГУП|МУП|НКО|АНО|Фонд)\s+"?([А-ЯЁA-Z][^,;\n"]{2,80})/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const name = m[2]
      .replace(/\s+(ИНН|КПП|ОГРН|адрес|р\/с|к\/с|БИК|тел\.?|e-?mail).*$/i, "")
      .replace(/[.,;:]+$/, "")
      .trim();
    if (name.length >= 2) out.push(`${m[1]} "${name}"`);
  }
  return unique(out);
}

export function extractEmails(text) {
  return unique(findAll(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 0).map((e) => e.toLowerCase()));
}

export function extractPhones(text) {
  return unique(
    findAll(text, /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, 0)
      .map((p) => p.replace(/[^\d+]/g, ""))
  );
}

export function detectDocType({ subject = "", text = "" } = {}) {
  const hay = `${subject}\n${String(text).slice(0, 2000)}`.toLowerCase();
  if (/(счёт|счет|invoice|счет-фактура|счёт-фактура)/.test(hay)) return "invoice";
  if (/(договор|контракт|contract|agreement)/.test(hay)) return "contract";
  if (/(упд|универсальный передаточный)/.test(hay)) return "upd";
  if (/(акт|act of|acceptance)/.test(hay)) return "act";
  if (/(претензи|claim|complaint)/.test(hay)) return "claim";
  return "other";
}

export function extractFields(text, subject = "") {
  const t = normalize(text);
  const inn = extractInn(t);
  const kpp = extractKpp(t);
  const ogrn = extractOgrn(t);
  const vat_ids = extractVatIds(t);
  const contract_numbers = extractContracts(t);
  const amounts = extractAmounts(t);
  const dates = extractDates(t);
  const counterparties = extractCounterparties(t);
  const emails = extractEmails(t);
  const phones = extractPhones(t);
  const doc_type = detectDocType({ subject, text: t });

  const found = [
    inn.length, kpp.length, vat_ids.length, contract_numbers.length,
    amounts.length, dates.length, counterparties.length
  ].filter(Boolean).length;

  return {
    doc_type,
    inn,
    kpp,
    ogrn,
    vat_ids,
    contract_numbers,
    amounts,
    total_amount: pickTotal(amounts),
    dates,
    counterparties,
    emails,
    phones,
    confidence: Math.round((found / 7) * 100) / 100
  };
}

function pickTotal(amounts) {
  if (!amounts.length) return null;
  return [...amounts].sort((a, b) => b.value - a.value)[0];
}
