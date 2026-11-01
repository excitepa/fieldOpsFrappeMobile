import { CartLine, Product, ProductPromotion, PromotionChoices } from '../types';
import { getProductUnits, getStockQtyByProduct, getStockUnit, StockShortfall } from './cart';
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
  /** Given only with the promotion's promo code, which only the server can check. */
  requiresCode?: boolean;
  /** The agent's on-hand of the reward when it was downloaded, for a reward that isn't on the phone. */
  rewardStockQty?: number;
  /** The reward's stock unit. */
  rewardStockUom?: string;
}

/** What the offers depend on besides the cart. */
export interface PromotionOptions {
  /** YYYY-MM-DD: a promotion that ended before it is left out. */
  today?: string;
  /** The order's promo code: once there's one, promotions that need a code are offers too. */
  promoCode?: string;
}

const sameUom = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/** The server only sends promotions that apply today, but the product list on the phone can be older than that. */
const isCurrent = (promo: ProductPromotion, today: string) => !promo.validTo || promo.validTo >= today;

/**
 * What a promotion gives for `boughtStockQty` of its product, mirroring the
 * server (order_lines): the paid stock units ÷ the conversion factor of the
 * promotion's uom, floor(that ÷ buy_quantity) times free_quantity of the
 * reward in free_uom. Undefined when it doesn't apply.
 */
function offerOf(product: Product, promo: ProductPromotion, boughtStockQty: number, products: Product[], today: string, withCode: boolean): FreeGoodsLine | undefined {
  if (!isCurrent(promo, today) || promo.buyQuantity <= 0 || promo.freeQuantity <= 0) return undefined;
  if (promo.requiresCode && !withCode) return undefined;
  const counted = getProductUnits(product).find((u) => sameUom(u.uom, promo.uom));
  if (!counted) return undefined;
  // Whole multiples of buy_quantity, allowing for floating-point error (as the server does).
  const times = Math.floor(boughtStockQty / counted.conversionFactor / promo.buyQuantity + 1e-9);
  if (times < 1) return undefined;
  const reward = products.find((p) => p.id === promo.rewardItem);
  const freeUnit = reward ? getProductUnits(reward).find((u) => sameUom(u.uom, promo.freeUom)) : undefined;
  // The reward's own unit on the phone, else the factor the server sent with the promotion.
  const conversionFactor = freeUnit?.conversionFactor ?? promo.freeConversionFactor ?? 1;
  const quantity = times * promo.freeQuantity;
  return {
    productId: promo.rewardItem,
    productName: reward?.name || promo.rewardItemName || promo.rewardItem,
    uom: freeUnit?.uom || promo.freeUom,
    quantity,
    conversionFactor,
    stockQty: quantity * conversionFactor,
    promotionId: promo.id,
    promotionName: promo.name,
    qualifyingProductId: product.id,
    requiresCode: promo.requiresCode || undefined,
    rewardStockQty: promo.rewardStockQty,
    rewardStockUom: reward ? getStockUnit(reward).uom : promo.rewardStockUom,
  };
}

/**
 * Every offer each product in the cart qualifies for: each of its current
 * promotions its paid quantity earns at least once, in the order the server
 * lists them (earliest created first). Free lines never count toward a
 * promotion — the cart only holds paid lines. A promotion that needs a promo
 * code is an offer only once a code has been entered: only the server can
 * check it.
 */
export function qualifyingOffers(cart: CartLine[], products: Product[], options: PromotionOptions = {}): Map<string, FreeGoodsLine[]> {
  const today = options.today || localDateStr();
  const withCode = !!options.promoCode?.trim();
  const offers = new Map<string, FreeGoodsLine[]>();
  getStockQtyByProduct(cart).forEach((boughtStockQty, productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product?.promotions?.length) return;
    const found = product.promotions.flatMap((promo) => {
      const offer = offerOf(product, promo, boughtStockQty, products, today, withCode);
      return offer ? [offer] : [];
    });
    if (found.length > 0) offers.set(productId, found);
  });
  return offers;
}

/** The free goods a cart will be given, and what's still the agent's to choose. */
export interface FreeGoodsPreview {
  /** A product's only offer, or the one the agent chose among several. */
  lines: FreeGoodsLine[];
  /** Every offer each product in the cart qualifies for (qualifyingOffers). */
  offers: Map<string, FreeGoodsLine[]>;
  /** Products that qualify for more than one offer, none of them chosen yet. */
  needsChoice: string[];
  /** The choices in effect — a product with several offers and one of them chosen — as promotion_choices sends them. */
  chosen: PromotionChoices;
}

/**
 * The free goods a cart earns, one promotion per product as the server gives
 * them. A product with one offer gets it. With several, the agent chooses
 * (`choices`: product -> promotion) and nothing is given until they have; a
 * choice that's no longer one of its offers doesn't count. The server gives
 * exactly the chosen promotion (promotion_choices) and, for a product without
 * a choice, applies its own rule.
 */
export function previewFreeGoods(cart: CartLine[], products: Product[], choices: PromotionChoices = {}, options: PromotionOptions = {}): FreeGoodsPreview {
  const offers = qualifyingOffers(cart, products, options);
  const lines: FreeGoodsLine[] = [];
  const needsChoice: string[] = [];
  const chosen: PromotionChoices = {};
  offers.forEach((found, productId) => {
    if (found.length === 1) {
      lines.push(found[0]);
      return;
    }
    const pick = found.find((o) => o.promotionId === choices[productId]);
    if (pick) {
      lines.push(pick);
      chosen[productId] = pick.promotionId;
    } else {
      needsChoice.push(productId);
    }
  });
  return { lines, offers, needsChoice, chosen };
}

/**
 * The choices that are still one of their product's offers: a quantity that
 * no longer earns one, or a promo code taken away, drops it. `choices` itself
 * when none is dropped.
 */
export function keepValidChoices(choices: PromotionChoices, offers: Map<string, FreeGoodsLine[]>): PromotionChoices {
  const kept = Object.entries(choices).filter(([productId, promotionId]) => (offers.get(productId) || []).some((o) => o.promotionId === promotionId));
  return kept.length === Object.keys(choices).length ? choices : Object.fromEntries(kept);
}

/** An offer as the agent can pick it: how much of its free item is left for it, and whether that covers it. */
export interface OfferOption extends FreeGoodsLine {
  /** Stock units of the free item it can come from; undefined when that isn't known (the server checks). */
  available?: number;
  /** The agent's stock covers it (always, for an order). */
  covered: boolean;
}

/**
 * Each product's offers with the stock they'd come from in a sale: the free
 * item's stock as the stock check has it (`stockProducts`, less what unsent
 * sales take), less what this cart sells of it and the free goods of it
 * coming for the cart's other products. A reward that isn't on the phone uses
 * the stock the server sent with the promotion, less what unsent sales take of
 * it (`unsentTaken`, see unsentSaleStock); with neither (an older backend) the
 * offer can be picked and the server checks. An order (pre-order) doesn't need
 * stock: every offer is covered.
 */
export function offerOptions(
  preview: FreeGoodsPreview,
  cart: CartLine[],
  stockProducts: Product[],
  mode: 'sale' | 'order',
  unsentTaken?: Map<string, number>,
): Map<string, OfferOption[]> {
  const paid = getStockQtyByProduct(cart);
  const options = new Map<string, OfferOption[]>();
  preview.offers.forEach((found, productId) => {
    options.set(productId, found.map((offer): OfferOption => {
      if (mode === 'order') return { ...offer, covered: true };
      const reward = stockProducts.find((p) => p.id === offer.productId);
      const onHand = reward
        ? reward.stock
        : offer.rewardStockQty !== undefined
          ? offer.rewardStockQty - (unsentTaken?.get(offer.productId) || 0)
          : undefined;
      if (onHand === undefined) return { ...offer, covered: true };
      const forOthers = preview.lines
        .filter((l) => l.productId === offer.productId && l.qualifyingProductId !== productId)
        .reduce((sum, l) => sum + l.stockQty, 0);
      const available = Math.max(0, onHand - (paid.get(offer.productId) || 0) - forOthers);
      return { ...offer, available, covered: offer.stockQty <= available + 1e-9 };
    }));
  });
  return options;
}

/** The products waiting for the agent's choice that they can make: at least one of the offers is covered. */
export function choicesToMake(preview: FreeGoodsPreview, options: Map<string, OfferOption[]>): string[] {
  return preview.needsChoice.filter((productId) => (options.get(productId) || []).some((o) => o.covered));
}

/**
 * A product none of whose offers the agent's stock covers can't be sold with
 * its free goods: a shortfall for each free item, as the stock check words it.
 */
export function uncoveredOfferShortfalls(preview: FreeGoodsPreview, options: Map<string, OfferOption[]>): StockShortfall[] {
  return preview.needsChoice.flatMap((productId) => {
    const found = options.get(productId) || [];
    if (found.length === 0 || found.some((o) => o.covered)) return [];
    return found.map((o): StockShortfall => ({
      productId: o.productId,
      productName: o.productName,
      requested: o.stockQty,
      freeQty: o.stockQty,
      available: o.available ?? 0,
    }));
  });
}

/**
 * The choices left once the server's PROMOTION_CHOICE_INVALID refusal has
 * taken out the ones it couldn't give (all of them when it doesn't say which),
 * so the agent chooses those again.
 */
export function withoutRefusedChoices(choices: PromotionChoices, refusal: any): PromotionChoices {
  const invalid: any[] = Array.isArray(refusal?.data?.invalid) ? refusal.data.invalid : [];
  if (invalid.length === 0) return {};
  const refused = (productId: string, promotionId: string) =>
    invalid.some((i) => String(i?.qualifying_item || '') === productId || String(i?.promotion || '') === promotionId);
  return Object.fromEntries(Object.entries(choices).filter(([productId, promotionId]) => !refused(productId, promotionId)));
}

/** A line as the server saved it, as far as the check below needs (SavedOrderLine). */
interface SavedLine {
  itemCode: string;
  itemName: string;
  qty: number;
  isFree: boolean;
  promotionId?: string;
}

const freeItem = (qty: number, name: string) => `${formatQty(qty)} × ${name}`;

/**
 * What to tell the agent when the server didn't give the free item they chose
 * (an older backend applies its own rule): "The server recorded 2 × IVORY
 * CREAM 12 x 20cl as the free item, not 1 × POLO SHIRT." `chosen`: the free
 * lines the agent chose. Empty when each was given.
 */
export function chosenFreeGoodsNotGiven(chosen: FreeGoodsLine[], saved: SavedLine[], products: Product[]): string {
  const free = saved.filter((l) => l.isFree);
  // A backend that names the promotion on its free lines tells them apart by it; else by the free item.
  const byPromotion = free.some((l) => l.promotionId);
  return chosen
    .flatMap((line) => {
      const given = byPromotion ? free.some((l) => l.promotionId === line.promotionId) : free.some((l) => l.itemCode === line.productId);
      if (given) return [];
      const promotionsOfProduct = new Set((products.find((p) => p.id === line.qualifyingProductId)?.promotions || []).map((p) => p.id));
      const instead = byPromotion
        ? free.filter((l) => l.promotionId && promotionsOfProduct.has(l.promotionId))
        : free.filter((l) => !chosen.some((c) => c.productId === l.itemCode));
      const recorded = instead.length > 0 ? `${instead.map((l) => freeItem(l.qty, l.itemName)).join(' and ')} as the free item` : 'no free item';
      return [`The server recorded ${recorded}, not ${freeItem(line.quantity, line.productName)}.`];
    })
    .join('\n');
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
