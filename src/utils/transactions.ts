import { OutletSale, OutletOrder } from '../types';

export interface TransactionLine {
  productId: string;
  productName: string;
  /** Quantity in `uom` (stock units when there's no uom). */
  quantity: number;
  uom?: string;
  stockQty?: number;
  unitPrice: number;
  total: number;
  /** Free goods a promotion added — shown as "Free", not priced. */
  isFree?: boolean;
  promotionName?: string;
}

export interface GroupedTransaction {
  kind: 'sale' | 'order';
  ref: string;
  outletId: string;
  customerId: string;
  customerName: string;
  timestamp: string;
  lines: TransactionLine[];
  subtotal: number;
  total: number;
  status?: OutletOrder['status'];
}

function toLine(item: OutletSale | OutletOrder): TransactionLine {
  return {
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    uom: item.uom,
    stockQty: item.stockQty,
    unitPrice: item.unitPrice,
    total: item.total,
    isFree: item.isFree,
    promotionName: item.promotionName,
  };
}

/** Groups flat one-line-per-record sales back into multi-line transactions by invoiceRef. */
export function groupSalesByInvoice(sales: OutletSale[]): GroupedTransaction[] {
  const order: string[] = [];
  const byRef = new Map<string, OutletSale[]>();

  sales.forEach((s) => {
    if (!byRef.has(s.invoiceRef)) {
      byRef.set(s.invoiceRef, []);
      order.push(s.invoiceRef);
    }
    byRef.get(s.invoiceRef)!.push(s);
  });

  return order.map((ref) => {
    const items = byRef.get(ref)!;
    const first = items[0];
    const lines = items.map(toLine);
    return {
      kind: 'sale' as const,
      ref,
      outletId: first.outletId,
      customerId: first.customerId,
      customerName: first.customerName,
      timestamp: first.timestamp,
      lines,
      subtotal: lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0),
      total: lines.reduce((acc, l) => acc + l.total, 0),
    };
  });
}

/** Groups flat one-line-per-record orders back into multi-line transactions by orderRef. */
export function groupOrdersByRef(orders: OutletOrder[]): GroupedTransaction[] {
  const order: string[] = [];
  const byRef = new Map<string, OutletOrder[]>();

  orders.forEach((o) => {
    if (!byRef.has(o.orderRef)) {
      byRef.set(o.orderRef, []);
      order.push(o.orderRef);
    }
    byRef.get(o.orderRef)!.push(o);
  });

  return order.map((ref) => {
    const items = byRef.get(ref)!;
    const first = items[0];
    const lines = items.map(toLine);
    return {
      kind: 'order' as const,
      ref,
      outletId: first.outletId,
      customerId: first.customerId,
      customerName: first.customerName,
      timestamp: first.timestamp,
      lines,
      subtotal: lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0),
      total: lines.reduce((acc, l) => acc + l.total, 0),
      status: first.status,
    };
  });
}
