import { useState } from 'react';
import { CartLine, Product, ProductUnit } from '../../types';
import { setLineQty, removeLine, getCartTotal } from '../../utils/cart';

export function useCart(initial: CartLine[] = []) {
  const [cart, setCart] = useState<CartLine[]>(initial);

  // Sets the product's quantity in one unit outright (adding the line if it
  // doesn't exist yet) — used by the per-unit steppers, which know the
  // absolute quantity they want rather than a delta to add.
  const setQty = (product: Product, unit: ProductUnit, qty: number) =>
    setCart((prev) => setLineQty(prev, product, unit, qty));

  const remove = (key: string) =>
    setCart((prev) => removeLine(prev, key));

  const clear = () => setCart([]);

  return {
    cart,
    setCart,
    setQty,
    remove,
    clear,
    total: getCartTotal(cart),
  };
}
