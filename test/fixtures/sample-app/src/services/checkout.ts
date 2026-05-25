import { isAuthenticated } from './auth';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

const cart: CartItem[] = [];

export function addToCart(item: CartItem): void {
  const existing = cart.find(i => i.id === item.id);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }
}

export function getCartTotal(): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export async function submitOrder(): Promise<CheckoutResult> {
  if (!isAuthenticated()) {
    return { success: false, error: 'User not authenticated' };
  }

  if (cart.length === 0) {
    return { success: false, error: 'Cart is empty' };
  }

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ items: cart }),
    });

    if (!response.ok) {
      return { success: false, error: 'Payment failed' };
    }

    const data = await response.json();
    cart.length = 0; // clear cart
    return { success: true, orderId: data.orderId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}
