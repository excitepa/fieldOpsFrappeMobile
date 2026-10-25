import { Draft, Product } from '../types';
import { getProductUnits, getStockUnit, getStockQtyByProduct, StockShortfall } from './cart';
import { previewFreeGoods } from './promotions';
import { formatQty, formatUnitQty, unitWord } from './units';

/**
 * Stock units of each product that sales not yet sent will take: every
 * unsent sale draft's lines, paid and free (free goods worked out as the app
 * shows them). `exceptDraftId`: the draft being resumed, which is checked as
 * the cart itself.
 */
export function unsentSaleStock(drafts: Draft[], products: Product[], exceptDraftId?: string): Map<string, number> {
  const taken = new Map<string, number>();
  drafts
    .filter((d) => d.mode === 'sale' && d.id !== exceptDraftId)
    .forEach((d) => {
      getStockQtyByProduct(d.cart).forEach((qty, id) => taken.set(id, (taken.get(id) || 0) + qty));
      previewFreeGoods(d.cart, products).forEach((f) => taken.set(f.productId, (taken.get(f.productId) || 0) + f.stockQty));
    });
  return taken;
}

/**
 * The products with the stock the agent can still sell: the stock last
 * downloaded from the server, less what unsent sales take — so neither an
 * offline sale nor a refresh before it's sent lets the same stock be sold
 * twice. Products no unsent sale touches are returned as they are.
 */
export function withUnsentSales(products: Product[], drafts: Draft[], exceptDraftId?: string): Product[] {
  const taken = unsentSaleStock(drafts, products, exceptDraftId);
  if (taken.size === 0) return products;
  return products.map((p) => {
    const qty = taken.get(p.id);
    return qty ? { ...p, stock: Math.max(0, p.stock - qty) } : p;
  });
}

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

/**
 * A sale's shortfalls, a sentence each, worded as the server words its
 * INSUFFICIENT_STOCK refusal: "Not enough stock for ZZ Juice: 30 units
 * available, 42 needed."
 */
export function describeShortfalls(shortfalls: StockShortfall[]): string {
  return shortfalls
    .map((s) => {
      const uom = s.product ? getStockUnit(s.product).uom : 'unit';
      return `Not enough stock for ${s.productName}: ${formatUnitQty(Math.max(0, s.available), uom)} available, ${formatQty(s.requested)} needed.`;
    })
    .join('\n');
}
