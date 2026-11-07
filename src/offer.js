/**
 * Single source of truth for the paid offer.
 *
 * Every dataset record carries the same purchase line, so the Actor, the
 * README, the Plati.Market card and the desktop app can never drift apart.
 */
export const OFFER = {
  product: "Archive Studio DocSearch Pro — offline contract, invoice and VAT ID search for .eml/.mbox archives",
  code: "TW1-DOC",
  priceRub: 690,
  priceUsdc: 15,
  storeUrl: "https://9xj89gzrtw-hue.github.io/docsearch/",
  checkoutUrl: "https://oplata.info/asp2/pay_wm.asp?id_d=6354601&ai=1481449&lang=ru-RU",
  platiUrl: "https://plati.market/itm/6354601",
  platiLotId: 6354601,
  seller: "danilaonly (Plati.Market ID 1481449)",
  delivery: "Instant TW1-DOC-… key on the order page right after SBP / RU card payment.",
  freeFeatures: [
    "parse pasted .eml / .mbox text, a public URL or a key-value store record",
    "extract INN, KPP, OGRN, EU/UK VAT IDs, contract numbers, amounts, dates, counterparties, e-mails and phones",
    "up to 500 messages per run, up to 10,000 by request in one paid desktop run",
    "CSV/XLSX export straight from the Apify dataset"
  ],
  paidFeatures: [
    "100% offline desktop app: archives never leave the machine, no cloud, no API key",
    "full-text index over 10,000+ messages with instant search and filters",
    "contract ↔ invoice ↔ act matching by number, amount and counterparty",
    "one-click Excel register with a sheet per counterparty and a reconciliation summary",
    "lifetime key, no subscription"
  ]
};

export function offerLine() {
  return (
    `Free here: up to 500 messages per run with INN/KPP/VAT/contract/amount extraction. ` +
    `Offline desktop archive search for 10,000+ e-mails (${OFFER.code}, ${OFFER.priceRub} RUB / $${OFFER.priceUsdc} USDC): ${OFFER.storeUrl} ` +
    `| Plati.Market: ${OFFER.platiUrl}`
  );
}

export function offerRecord() {
  return {
    _type: "offer",
    product: OFFER.product,
    code: OFFER.code,
    price_rub: OFFER.priceRub,
    price_usdc: OFFER.priceUsdc,
    store_url: OFFER.storeUrl,
    checkout_url: OFFER.checkoutUrl,
    plati_url: OFFER.platiUrl,
    delivery: OFFER.delivery,
    free: OFFER.freeFeatures,
    paid: OFFER.paidFeatures,
    note: offerLine()
  };
}
