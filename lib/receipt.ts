export type SplitItem = {
  id: string;
  name: string;
  category: string;
  original: number;
  itemDiscount: number;
  categoryDiscount: number;
  tax: number;
  people: number[];
};

export type ParsedReceipt = {
  date: string;
  total: number;
  subtotal: number | null;
  items: SplitItem[];
  notes: string[];
};

export const paid = (item: SplitItem) => item.original - item.itemDiscount - item.categoryDiscount + item.tax;
export const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
export const cents = (value: string | number) => Math.round(Number(value) * 100);

// Allocate whole cents by weight, with stable ties. Every allocation sums exactly.
export function allocate(amount: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sign = Math.sign(amount);
  const total = Math.abs(amount);
  const positive = weights.map((n) => Math.max(0, n));
  const sum = positive.reduce((a, b) => a + b, 0);
  const shares = positive.map((w) => sum ? total * w / sum : total / weights.length);
  const result = shares.map(Math.floor);
  let remainder = total - result.reduce((a, b) => a + b, 0);
  shares.map((share, i) => ({ i, fraction: share - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
    .forEach(({ i }) => { if (remainder > 0) { result[i]++; remainder--; } });
  return result.map((n) => sign * n);
}

const categoryKey = (name: string) => name.toUpperCase().match(/[A-Z]+/g)?.map((word) => word.slice(0, 4)).join(" ") || "";

export function parseMetroReceipt(input: string): ParsedReceipt {
  const lines = input.replace(/\r/g, "").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const notes: string[] = [];
  const dateMatch = input.match(/DateTime:\s*(\d{2})\/(\d{2})\/(\d{2})/i)
    || input.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  let date = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const [, yy, mm, dd] = dateMatch;
    date = dd.length === 4 ? `${dd}-${yy}-${mm}` : `20${yy}-${mm}-${dd}`;
  }
  const discountsStart = lines.findIndex((s) => /Discount\s+\d+(?:\.\d+)?%$/i.test(s));
  const specialStart = lines.findIndex((s) => /^Special Bonus Offer/i.test(s));
  const printedSubtotal = lines.findIndex((s) => /^SUBTOTAL\s+/.test(s));
  const end = [specialStart, discountsStart, printedSubtotal].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  const receiptHeader = lines.findIndex((s) => /(?:Customer Number|HST#|Store #)/i.test(s));
  const first = Math.max(0, receiptHeader + 1);
  const subtotalLine = lines.find((s) => /^SUBTOTAL\s+-?\$?\d/.test(s));
  const totalLine = lines.find((s) => /^TOTAL\s+\$?\d/.test(s));
  const subtotal = subtotalLine ? cents(subtotalLine.match(/(-?\d+\.\d{2})\s*$/)?.[1] || 0) : null;
  const total = totalLine ? cents(totalLine.match(/(\d+\.\d{2})\s*$/)?.[1] || 0) : 0;
  const raw: Array<{ name: string; category: string; original: number; discount: number; qty: number; taxable: boolean }> = [];
  let category = "Other";
  let awaiting: { name: string; qty: number } | null = null;
  if (end < 0) notes.push("Could not identify the complete Metro item section. Check every line before saving.");
  const itemLines = lines.slice(Math.max(0, first), end > first ? end : undefined);
  for (let lineIndex = 0; lineIndex < itemLines.length; lineIndex++) {
    const line = itemLines[lineIndex];
    const upper = line.toUpperCase();
    if (/\bkg\s*@\s*\$?\d+\.\d{2}\/kg\s+\$?\d+\.\d{2}$/i.test(line) && awaiting) {
      raw.push({ name: awaiting.name, category, qty: 1, original: cents(line.match(/(\d+\.\d{2})$/)![1]), discount: 0, taxable: false });
      awaiting = null; continue;
    }
    if (/\bkg\s*@\s*\$?\d+\.\d{2}\/kg\s+\$?\d+\.\d{2}$/i.test(itemLines[lineIndex + 1] || "")) {
      awaiting = { name: line, qty: 1 }; continue;
    }
    // Printed category headers have no amount; derive them from the receipt instead of a product list.
    if (/^[A-Z][A-Z .&/'-]{2,}$/.test(line) && !/^Saving|^Special|^Moi |^RETAIN /i.test(line)) {
      category = upper; awaiting = null; continue;
    }
    if (/^Saving\s+\d/i.test(line)) continue; // Metro prints these as informational savings.
    const promo = line.match(/^\([^)]*@[^)]*%\)\s+-(\d+\.\d{2})$/) || line.match(/^\s*-(\d+\.\d{2})$/);
    if (promo && raw.length) { raw[raw.length - 1].discount += cents(promo[1]); continue; }
    const qtyStart = line.match(/^\((\d+)\)\s*(.+?)\s*$/);
    if (qtyStart && !/\d+\.\d{2}$/.test(line)) { awaiting = { qty: Math.max(1, Number(qtyStart[1])), name: qtyStart[2] }; continue; }
    const quantityPrice = line.match(/^(\d+)\s*@\s*\$?\d+\.\d{2}\s+\$?(\d+\.\d{2})$/);
    if (quantityPrice && awaiting) {
      raw.push({ name: awaiting.name, category, qty: awaiting.qty, original: cents(quantityPrice[2]), discount: 0, taxable: false });
      awaiting = null; continue;
    }
    const item = line.match(/^(.+?)\s+(?:RF\s+)?\$?(\d+\.\d{2})$/);
    if (item && !/^(?:Customer Number|HST#)/i.test(line)) {
      raw.push({ name: item[1].trim(), category, qty: 1, original: cents(item[2]), discount: 0, taxable: /\bRF\b/.test(line) });
      awaiting = null;
    }
  }
  if (awaiting) notes.push(`Check quantity for ${awaiting.name}.`);
  const discounts = new Map<string, number>();
  for (let i = Math.max(end + 1, 0); i < lines.length; i++) {
    const m = lines[i].match(/^(.+?)\s+Discount\s+\d+(?:\.\d+)?%$/i);
    if (!m) continue;
    const next = lines[i + 1]?.match(/-(\d+\.\d{2})\s*$/);
    if (next) discounts.set(categoryKey(m[1].toUpperCase()), (discounts.get(categoryKey(m[1].toUpperCase())) || 0) + cents(next[1]));
  }
  const subtotalIndex = lines.findIndex((s) => /^SUBTOTAL\s+/.test(s));
  const totalIndex = lines.findIndex((s, i) => i > subtotalIndex && /^TOTAL\s+/.test(s));
  const taxLines = lines.slice(subtotalIndex + 1, totalIndex > subtotalIndex ? totalIndex : undefined);
  const listedTax = taxLines.filter((s) => /%/.test(s) && /-?\d+\.\d{2}$/.test(s))
    .reduce((sum, s) => sum + cents(s.match(/(-?\d+\.\d{2})\s*$/)?.[1] || 0), 0);
  const tax = subtotal !== null && total ? total - subtotal : listedTax;
  if (listedTax && listedTax !== tax) notes.push("Tax lines differ from the paid total. Review their allocation.");
  const categoryParts = raw.map(() => 0);
  for (const [key, discount] of discounts) {
    const indices = raw.map((r, i) => categoryKey(r.category) === key ? i : -1).filter((i) => i >= 0);
    if (!indices.length) { notes.push(`Check ${key} discount: no matching items found.`); continue; }
    const shares = allocate(discount, indices.map((i) => raw[i].original - raw[i].discount));
    indices.forEach((i, j) => { categoryParts[i] += shares[j]; });
  }
  const taxable = raw.map((r, i) => r.taxable ? i : -1).filter((i) => i >= 0);
  const taxIndices = taxable.length ? taxable : raw.map((_, i) => i);
  if (tax && !taxable.length) notes.push("Taxable items were not marked clearly, so tax was allocated across all items. Review the tax amounts.");
  const taxes = allocate(tax, taxIndices.map((i) => raw[i].original - raw[i].discount - categoryParts[i]));
  const taxParts = raw.map(() => 0);
  taxIndices.forEach((i, j) => { taxParts[i] += taxes[j]; });
  const items = raw.flatMap((r, i) => {
    const original = allocate(r.original, Array(r.qty).fill(1));
    const itemDiscount = allocate(r.discount, Array(r.qty).fill(1));
    const categoryDiscount = allocate(categoryParts[i], Array(r.qty).fill(1));
    const tax = allocate(taxParts[i], Array(r.qty).fill(1));
    return original.map((value, j) => ({
      id: `${i}-${j}`, name: r.qty > 1 ? `${r.name} · ${j + 1} of ${r.qty}` : r.name,
      category: r.category, original: value, itemDiscount: itemDiscount[j], categoryDiscount: categoryDiscount[j], tax: tax[j], people: [],
    }));
  });
  const parsedSubtotal = items.reduce((sum, item) => sum + paid(item) - item.tax, 0);
  if (subtotal !== null && subtotal !== parsedSubtotal) notes.push(`Items before tax differ from the printed subtotal by ${money(subtotal - parsedSubtotal)}. Review the receipt.`);
  if (total && items.reduce((sum, item) => sum + paid(item), 0) !== total) notes.push("Parsed items do not match the paid total. Edit the lines until the difference is zero.");
  if (!total) notes.push("Paid total not detected. Enter it from the receipt.");
  return { date, total, subtotal, items, notes };
}

// A conservative fallback for unfamiliar stores. It reads visible line totals,
// and leaves unmatched adjustments for the user to review instead of guessing.
export function parseReceipt(input: string): ParsedReceipt {
  if (/\bMETRO\b/i.test(input.slice(0, 700)) && /(?:DateTime:|Special Bonus Offer|Customer Number)/i.test(input)) {
    return parseMetroReceipt(input);
  }
  const lines = input.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const notes = ["Unfamiliar receipt layout. Check each item, discount, tax, and the printed total before splitting."];
  const dateText = input.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/)
    || input.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/);
  let date = new Date().toISOString().slice(0, 10);
  if (dateText) {
    const [, a, b, c] = dateText;
    date = a.length === 4 ? `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`
      : `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    if (a.length !== 4 && Number(a) <= 12 && Number(b) <= 12) notes.push("Check the receipt date: day and month may be reversed.");
  } else notes.push("Purchase date was not found.");
  const numberAtEnd = /(?:[$€£]\s*)?(-?\d{1,3}(?:[ ,.']\d{3})*[,.]\d{2}|-?\d+[,.]\d{2})\s*$/;
  const amount = (line: string) => {
    const value = line.match(numberAtEnd)?.[1];
    if (!value) return null;
    const decimal = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
    const whole = value.slice(0, decimal).replace(/\D/g, "");
    return (value.startsWith("-") ? -1 : 1) * (Number(whole) * 100 + Number(value.slice(decimal + 1)));
  };
  const totalLines = lines.filter((line) => /^(?:grand\s+)?(?:amount\s+)?total\b/i.test(line) && !/^total\s+(?:tax|saving|discount)/i.test(line));
  const total = amount(totalLines.at(-1) || "") || 0;
  const subtotalIndex = lines.findIndex((line) => /^(?:sub\s*total|subtotal)\b/i.test(line));
  const totalIndex = lines.findIndex((line) => /^(?:grand\s+)?(?:amount\s+)?total\b/i.test(line));
  const end = subtotalIndex >= 0 ? subtotalIndex : totalIndex >= 0 ? totalIndex : lines.length;
  const raw: Array<{ name: string; price: number; discount: number }> = [];
  for (const line of lines.slice(0, end)) {
    const price = amount(line);
    const name = line.replace(numberAtEnd, "").replace(/\s*[$€£]\s*$/, "").trim();
    if (price === null || !/[A-Za-zÀ-ÿ]/.test(name) ||
      /^(?:date|time|receipt|invoice|order|store|phone|tel|hst|gst|tax|subtotal|total|cash|card|visa|mastercard|change|balance|payment|debit|credit|savings?)\b/i.test(name)) continue;
    if (price < 0 && raw.length && /discount|coupon|promo|saving|rabais|remise/i.test(name)) {
      raw[raw.length - 1].discount += -price;
    } else if (price >= 0 && price < 10_000_000) raw.push({ name, price, discount: 0 });
  }
  const items = raw.map((item, i): SplitItem => ({
    id: `generic-${i}`, name: item.name, category: "Other", original: item.price,
    itemDiscount: item.discount, categoryDiscount: 0, tax: 0, people: [],
  }));
  const parsed = items.reduce((sum, item) => sum + paid(item), 0);
  const listedTax = lines.slice(Math.max(0, subtotalIndex + 1), totalIndex >= 0 ? totalIndex : undefined)
    .filter((line) => /\b(?:tax|hst|gst|pst|vat|tva)\b/i.test(line))
    .reduce((sum, line) => sum + (amount(line) || 0), 0);
  if (listedTax && total && parsed + listedTax === total && items.length) {
    const shares = allocate(listedTax, items.map((item) => paid(item)));
    items.forEach((item, i) => { item.tax = shares[i]; });
    notes.push("Tax was distributed across listed items. Check which products were taxable.");
  } else if (total && parsed !== total) notes.push(`Detected items differ from the paid total by ${money(total - parsed)}. Add or correct the missing discounts, tax, or items.`);
  if (!total) notes.push("Paid total not detected. Enter it from the receipt.");
  if (!items.length) notes.push("No item lines recognized. Add them manually.");
  return { date, total, subtotal: subtotalIndex >= 0 ? amount(lines[subtotalIndex]) : null, items, notes };
}

export function splitTotals(items: SplitItem[], peopleCount: number) {
  const totals = Array(peopleCount).fill(0) as number[];
  const roundingCredits = Array(peopleCount).fill(0) as number[];
  const rows = items.map((item) => {
    const value = paid(item);
    const count = item.people.length;
    const shares = Array(count).fill(count ? Math.floor(value / count) : 0) as number[];
    let remaining = value - shares.reduce((a, b) => a + b, 0);
    const sorted = item.people.map((person, index) => ({ person, index }))
      .sort((a, b) => roundingCredits[a.person] - roundingCredits[b.person] || a.person - b.person);
    for (const { person, index } of sorted) {
      if (remaining <= 0) break;
      shares[index]++;
      roundingCredits[person]++;
      remaining--;
    }
    const perPerson = Array(peopleCount).fill(0) as number[];
    item.people.forEach((person, index) => { perPerson[person] += shares[index]; totals[person] += shares[index]; });
    return perPerson;
  });
  return { totals, rows };
}
