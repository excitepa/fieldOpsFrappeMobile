/** A quantity for display: whole numbers as-is, otherwise up to 2 decimals. */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Stock unit names that just mean "a single item" read better as "unit".
const GENERIC_UNITS = new Set(['unit', 'units', 'nos', 'no', 'each', 'ea', 'pcs', 'pc', 'piece', 'pieces']);

/** A unit name for prose, e.g. ("Carton", 2) -> "cartons", ("Nos", 1) -> "unit". */
export function unitWord(uom: string | undefined, n: number): string {
  const base = (uom || '').trim().toLowerCase();
  const word = !base || GENERIC_UNITS.has(base) ? 'unit' : base;
  if (n === 1 || word.endsWith('s')) return word;
  return /(x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}

/** "10 cartons" / "1 unit" — or just the number for a line saved before units, which has no uom. */
export function formatUnitQty(qty: number, uom?: string): string {
  return uom ? `${formatQty(qty)} ${unitWord(uom, qty)}` : formatQty(qty);
}
