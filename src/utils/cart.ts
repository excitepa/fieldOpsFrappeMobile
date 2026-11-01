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

/** Stock a cart needs beyond its own lines — the free goods it earns (see previewFreeGoods). */
export interface ExtraStockNeed {
  productId: string;
  productName: string;
  stockQty: number;
  /** The product's stock, in stock units, when it isn't on the phone (see freeGoodsStockNeeds). */
  knownStock?: number;
}

export interface StockShortfall {
  productId: string;
  productName: string;
  /** Stock units the cart needs of this product, its free goods included. */
  requested: number;
  /** Of `requested`, the stock units that are free goods. */
  freeQty: number;
  /** The product's stock, in stock units. */
  available: number;
  product?: Product;
}

/**
 * Sale-mode-only check, per product: the stock units of all its lines (cartons,
 * packs and loose units alike) plus the free goods of it the cart earns may not
 * exceed its live stock. A free item that isn't on the phone is checked
 * against the stock the server sent with its promotion (`knownStock`); without
 * one, the server checks it.
 */
export function getStockShortfalls(cart: CartLine[], products: Product[], extra: ExtraStockNeed[] = []): StockShortfall[] {
  const needs = new Map<string, { productName: string; paid: number; free: number; knownStock?: number }>();
  cart.forEach((l) => {
    const need = needs.get(l.productId) || { productName: l.productName, paid: 0, free: 0 };
    need.paid += lineStockQty(l);
    needs.set(l.productId, need);
  });
  extra.forEach((e) => {
    const need = needs.get(e.productId) || { productName: e.productName, paid: 0, free: 0 };
    need.free += e.stockQty;
    if (e.knownStock !== undefined) need.knownStock = e.knownStock;
    needs.set(e.productId, need);
  });
  const shortfalls: StockShortfall[] = [];
  needs.forEach((need, productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product && need.paid === 0 && need.knownStock === undefined) return;
    const available = product ? product.stock : need.knownStock ?? 0;
    const requested = need.paid + need.free;
    if (requested > available + 1e-9) {
      shortfalls.push({ productId, productName: product?.name || need.productName, requested, freeQty: need.free, available, product });
    }
  });
  return shortfalls;
}
