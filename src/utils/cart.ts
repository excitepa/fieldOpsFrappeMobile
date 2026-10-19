import { CartLine, Product, ProductUnit } from '../types';

const sameUom = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/**
 * Every unit a product sells in, stock unit first. An older backend sends no
 * `units`, so the product then sells only in its stock unit at its price, as
 * before packs and cartons existed.
 */
export function getProductUnits(product: Product): ProductUnit[] {
  if (product.units && product.units.length > 0) return product.units;
  return [{ uom: product.unit || 'Unit', conversionFactor: 1, price: product.price, mustBeWholeNumber: true }];
}

/** The product's stock unit — the one a line without a uom is counted in. */
export function getStockUnit(product: Product): ProductUnit {
  const units = getProductUnits(product);
  return units.find((u) => sameUom(u.uom, product.unit)) || units.find((u) => u.conversionFactor === 1) || units[0];
}

/** The units in the order the Sale/Order steppers show them: default sales unit first. */
export function getSellingUnits(product: Product): ProductUnit[] {
  const units = getProductUnits(product);
  const idx = product.salesUom ? units.findIndex((u) => sameUom(u.uom, product.salesUom)) : -1;
  return idx > 0 ? [units[idx], ...units.slice(0, idx), ...units.slice(idx + 1)] : units;
}

/** Stock units in one of a line's unit — a line saved before units has no factor: it's in stock units. */
export const lineFactor = (line: CartLine): number => line.conversionFactor || 1;

export const lineStockQty = (line: CartLine): number => line.quantity * lineFactor(line);

/** Identifies a line: one per product and unit (a pre-units line has no uom). */
export const lineKey = (line: Pick<CartLine, 'productId' | 'uom'>): string =>
  `${line.productId}::${(line.uom || '').trim().toLowerCase()}`;

/** Whether `line` is the product's line in `unit` — a line without a uom (from a draft saved before units) is its stock unit line. */
export function isLineInUnit(line: CartLine, product: Product, unit: ProductUnit): boolean {
  if (line.productId !== product.id) return false;
  return line.uom ? sameUom(line.uom, unit.uom) : sameUom(unit.uom, getStockUnit(product).uom);
}

export function findLine(cart: CartLine[], product: Product, unit: ProductUnit): CartLine | undefined {
  return cart.find((l) => isLineInUnit(l, product, unit));
}

/**
 * Sets the product's quantity in one unit outright, adding the line if it
 * isn't there and removing it at 0. A line the agent changes takes its unit's
 * current price, factor and name, which also upgrades a pre-units draft line.
 */
export function setLineQty(cart: CartLine[], product: Product, unit: ProductUnit, qty: number): CartLine[] {
  const existing = findLine(cart, product, unit);
  if (qty <= 0) return existing ? cart.filter((l) => l !== existing) : cart;
  const line: CartLine = {
    productId: product.id,
    productName: product.name,
    uom: unit.uom,
    conversionFactor: unit.conversionFactor,
    unitPrice: unit.price,
    quantity: qty,
  };
  return existing ? cart.map((l) => (l === existing ? line : l)) : [...cart, line];
}

export function removeLine(cart: CartLine[], key: string): CartLine[] {
  return cart.filter((l) => lineKey(l) !== key);
}

export function getCartTotal(cart: CartLine[]): number {
  return cart.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
}

/** Stock units of each product across all its lines. */
export function getStockQtyByProduct(cart: CartLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  cart.forEach((l) => totals.set(l.productId, (totals.get(l.productId) || 0) + lineStockQty(l)));
  return totals;
}

export interface StockShortfall {
  productId: string;
  productName: string;
  requested: number;
  available: number;
}

/** Sale-mode-only check: a cart line may not exceed the product's live stock. */
export function getStockShortfalls(cart: CartLine[], products: Product[]): StockShortfall[] {
  const shortfalls: StockShortfall[] = [];
  cart.forEach((line) => {
    const product = products.find((p) => p.id === line.productId);
    const available = product?.stock ?? 0;
    if (lineStockQty(line) > available) {
      shortfalls.push({ productId: line.productId, productName: line.productName, requested: lineStockQty(line), available });
    }
  });
  return shortfalls;
}
