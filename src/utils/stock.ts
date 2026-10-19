import { Product } from '../types';
import { getProductUnits, getStockUnit, StockShortfall } from './cart';
import { formatQty, formatUnitQty, unitWord } from './units';

export type StockStatus = 'in' | 'low' | 'out';

export const LOW_STOCK_THRESHOLD = 15;

export function getStockStatus(stock: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock < LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

export function formatCaseUnits(stock: number, unitsPerCase: number): string {
  if (!unitsPerCase || unitsPerCase <= 1) return `${stock} unit${stock === 1 ? '' : 's'}`;
  const cases = Math.floor(stock / unitsPerCase);
  const units = stock % unitsPerCase;
  if (cases === 0) return `${units} unit${units === 1 ? '' : 's'}`;
  if (units === 0) return `${cases} case${cases === 1 ? '' : 's'}`;
  return `${cases} case${cases === 1 ? '' : 's'} + ${units} unit${units === 1 ? '' : 's'}`;
}

/**
 * A stock-unit quantity in the units the product sells in, largest first —
 * e.g. 30 with 12-unit cartons -> "2 cartons and 6 units". Empty when the
 * product only sells in its stock unit (nothing to break down).
 */
export function formatStockBreakdown(stockQty: number, product: Product): string {
  const stockUnit = getStockUnit(product);
  const larger = getProductUnits(product)
    .filter((u) => u.conversionFactor > 1)
    .sort((a, b) => b.conversionFactor - a.conversionFactor);
  if (larger.length === 0 || stockQty <= 0) return '';
  const parts: string[] = [];
  let left = stockQty;
  larger.forEach((u) => {
    const count = Math.floor(left / u.conversionFactor + 1e-9);
    if (count > 0) {
      parts.push(formatUnitQty(count, u.uom));
      left -= count * u.conversionFactor;
    }
  });
  // Less than one of the larger units: the plain stock-unit count says it all.
  if (parts.length === 0) return '';
  if (left > 1e-9) parts.push(formatUnitQty(Math.round(left * 100) / 100, stockUnit.uom));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What a sale's stock shortfall tells the agent, e.g. "Only 30 units in stock (2 cartons and 6 units)". */
export function describeShortfall(shortfall: StockShortfall, product?: Product): string {
  const stockUom = product ? getStockUnit(product).uom : undefined;
  const available = Math.max(0, shortfall.available);
  const breakdown = product ? formatStockBreakdown(available, product) : '';
  const head = available <= 0
    ? 'Out of stock'
    : `Only ${formatQty(available)} ${unitWord(stockUom, available)} in stock${breakdown ? ` (${breakdown})` : ''}`;
  if (shortfall.freeQty > 0) {
    return `${head} — this needs ${formatUnitQty(shortfall.requested, stockUom || 'unit')}, ${formatQty(shortfall.freeQty)} of them free goods. Reduce the quantity to continue.`;
  }
  return `${head} — reduce the quantity to continue.`;
}
