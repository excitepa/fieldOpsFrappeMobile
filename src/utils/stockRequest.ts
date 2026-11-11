import { Product, ProductUnit } from '../types';
import { StockRequestLine } from '../services/api';
import { getSellingUnits, getStockUnit } from './cart';
import { formatUnitQty } from './units';

/** A Stock Request basket line: how many of each of the product's units, and the total in stock units. */
export interface StockRequestBasketLine {
  productId: string;
  product: Product;
  parts: { unit: ProductUnit; qty: number }[];
  /** In stock units — what the request is approved and stocked in. */
  totalUnits: number;
  /** "33 units" */
  total: string;
  /** "2 cartons + 1 pack + 3 units", or '' when it only says the same as `total`. */
  partsText: string;
}

/** A product's basket line from its quantities per unit (uom -> how many); null when it adds up to nothing. */
export function buildBasketLine(product: Product, quantities: Record<string, number>): StockRequestBasketLine | null {
  // Largest unit first, the way a quantity is read out ("2 cartons + 1 pack + 3 units").
  const parts = getSellingUnits(product)
    .map((unit) => ({ unit, qty: quantities[unit.uom] || 0 }))
    .filter((part) => part.qty > 0)
    .sort((a, b) => b.unit.conversionFactor - a.unit.conversionFactor);
  const totalUnits = parts.reduce((sum, part) => sum + part.qty * part.unit.conversionFactor, 0);
  if (totalUnits <= 0) return null;
  const total = formatUnitQty(totalUnits, getStockUnit(product).uom);
  const partsText = parts.map((part) => formatUnitQty(part.qty, part.unit.uom)).join(' + ');
  return { productId: product.id, product, parts, totalUnits, total, partsText: partsText === total ? '' : partsText };
}

/**
 * The line sent to submit_stock_request: requested and approved in stock
 * units. The count of the product's case unit (Case/Carton, per
 * units_per_case) goes in the line's note on the web ("Cases: x, Units: y"),
 * the rest as loose stock units.
 */
export function toStockRequestLine(line: StockRequestBasketLine): StockRequestLine {
  const casePart = line.parts.find((part) => part.unit.conversionFactor > 1 && part.unit.conversionFactor === line.product.unitsPerCase);
  const cases = casePart?.qty || 0;
  return {
    itemCode: line.productId,
    itemName: line.product.name,
    qty: line.totalUnits,
    cases,
    units: line.totalUnits - cases * (casePart?.unit.conversionFactor || 0),
  };
}
