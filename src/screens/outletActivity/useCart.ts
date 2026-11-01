import { useState } from 'react';
import { CartLine, Product, ProductUnit, PromotionChoices } from '../../types';
import { setLineQty, removeLine, getCartTotal } from '../../utils/cart';
import { FreeGoodsLine, keepValidChoices } from '../../utils/promotions';

export function useCart(initial: CartLine[] = [], initialChoices: PromotionChoices = {}) {
  const [cart, setCart] = useState<CartLine[]>(initial);
  // The free item chosen for each product that qualifies for more than one
  // promotion (see previewFreeGoods): kept with the cart, cleared with it.
  const [choices, setChoices] = useState<PromotionChoices>(initialChoices);

  // Sets the product's quantity in one unit outright (adding the line if it
  // doesn't exist yet) — used by the per-unit steppers, which know the
  // absolute quantity they want rather than a delta to add.
  const setQty = (product: Product, unit: ProductUnit, qty: number) =>
    setCart((prev) => setLineQty(prev, product, unit, qty));

  const remove = (key: string) =>
    setCart((prev) => removeLine(prev, key));

  const clear = () => {
    setCart([]);
    setChoices({});
  };

  const choose = (productId: string, promotionId: string) =>
    setChoices((prev) => ({ ...prev, [productId]: promotionId }));

  // Drops the choices that are no longer one of their product's offers (a
  // quantity change, a promo code taken away); unchanged, nothing re-renders.
  const keepChoices = (offers: Map<string, FreeGoodsLine[]>) =>
    setChoices((prev) => keepValidChoices(prev, offers));

  return {
    cart,
    setCart,
    setQty,
    remove,
    clear,
    total: getCartTotal(cart),
    choices,
    setChoices,
    choose,
    keepChoices,
  };
}
