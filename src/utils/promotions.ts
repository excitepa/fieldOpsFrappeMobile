import { CartLine, Product, ProductPromotion } from '../types';
import { getProductUnits, getStockQtyByProduct } from './cart';
import { formatQty } from './units';
import { localDateStr } from './timestamp';

/** Free goods a cart earns, as previewed on the phone — the server adds the real ones on submit. */
export interface FreeGoodsLine {
  /** The reward item. */
  productId: string;
  productName: string;
  uom: string;
  /** Quantity in `uom`. */
  quantity: number;
  conversionFactor: number;
  stockQty: number;
  promotionId: string;
  promotionName: string;
  /** The product whose purchase earned it. */
  qualifyingProductId: string;
}

const sameUom = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/** The server only sends promotions that apply today, but the product list on the phone can be older than that. */
const isCurrent = (promo: ProductPromotion, today: string) => !promo.validTo || promo.validTo >= today;

/**
 * The free goods a cart earns, mirroring the server's rule (order_lines.add_free_lines):
 * a product's qualifying quantity is its paid stock units ÷ the conversion factor
 * of the promotion's uom; the promotion applies floor(that ÷ buy_quantity) times,
 * each giving free_quantity of the reward item in free_uom. Promotions don't
 * stack: per product the one giving the most free stock units applies (the
 * earliest, as the server lists them, on a tie). Free lines never count toward
 * a promotion — the cart only holds paid lines. A promotion that needs a promo
 * code is left out: only the server can check the code.
 */
export function previewFreeGoods(cart: CartLine[], products: Product[], today: string = localDateStr()): FreeGoodsLine[] {
  const free: FreeGoodsLine[] = [];
  getStockQtyByProduct(cart).forEach((boughtStockQty, productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product?.promotions?.length) return;
    let best: FreeGoodsLine | undefined;
    product.promotions.forEach((promo) => {
      if (promo.requiresCode || !isCurrent(promo, today) || promo.buyQuantity <= 0 || promo.freeQuantity <= 0) return;
      const counted = getProductUnits(product).find((u) => sameUom(u.uom, promo.uom));
      if (!counted) return;
      // Whole multiples of buy_quantity, allowing for floating-point error (as the server does).
      const times = Math.floor(boughtStockQty / counted.conversionFactor / promo.buyQuantity + 1e-9);
      if (times < 1) return;
      const reward = products.find((p) => p.id === promo.rewardItem);
      const freeUnit = reward ? getProductUnits(reward).find((u) => sameUom(u.uom, promo.freeUom)) : undefined;
      const conversionFactor = freeUnit?.conversionFactor ?? 1;
      const quantity = times * promo.freeQuantity;
      const line: FreeGoodsLine = {
        productId: promo.rewardItem,
        productName: reward?.name || promo.rewardItemName || promo.rewardItem,
        uom: freeUnit?.uom || promo.freeUom,
        quantity,
        conversionFactor,
        stockQty: quantity * conversionFactor,
        promotionId: promo.id,
        promotionName: promo.name,
        qualifyingProductId: product.id,
      };
      if (!best || line.stockQty > best.stockQty + 1e-9) best = line;
    });
    if (best) free.push(best);
  });
  return free;
}

/** The promotions to show on a product: the ones still current. */
export function currentPromotions(product: Product, today: string = localDateStr()): ProductPromotion[] {
  return (product.promotions || []).filter((p) => isCurrent(p, today));
}

/** A promotion's badge, e.g. "Buy 10 Carton, get 1 free", or "... get 2 Pack of ZZ Cup free with promo code". */
export function describePromotion(promo: ProductPromotion, product: Product): string {
  const sameItem = promo.rewardItem === product.id;
  const reward = sameItem
    ? (sameUom(promo.freeUom, promo.uom) ? '' : ` ${promo.freeUom}`)
    : ` ${promo.freeUom} of ${promo.rewardItemName || promo.rewardItem}`;
  return `Buy ${formatQty(promo.buyQuantity)} ${promo.uom}, get ${formatQty(promo.freeQuantity)}${reward} free${promo.requiresCode ? ' with promo code' : ''}`;
}
