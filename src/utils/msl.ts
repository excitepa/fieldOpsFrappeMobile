import { CartLine, Product } from '../types';

/** MSL (must-stock-list) products first, otherwise in the order given. */
export function mslFirst(products: Product[]): Product[] {
  return [...products.filter((p) => p.isMsl), ...products.filter((p) => !p.isMsl)];
}

/** The MSL products in `products` the cart doesn't include yet — for the reminder before submitting. */
export function missingMslProducts(cart: CartLine[], products: Product[]): Product[] {
  return products.filter((p) => p.isMsl && !cart.some((l) => l.productId === p.id && l.quantity > 0));
}
