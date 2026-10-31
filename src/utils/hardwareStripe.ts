import { loadStripe } from '@stripe/stripe-js';
import { getGuardianStripeConfiguration } from './guardianStripe';

export type PaymentHandle = { confirm(email: string): Promise<void>; destroy(): void };
export type MountPayment = (container: HTMLElement, clientSecret: string) => Promise<PaymentHandle>;

// Mirrors the Guardian checkout (GuidePortal.tsx): Elements from the client secret, one Payment Element, confirm in place.
export const mountPayment: MountPayment = async (container, clientSecret) => {
  const config = getGuardianStripeConfiguration();
  if (!config.enabled || !config.publishableKey) throw new Error(config.error || 'Checkout is unavailable.');
  const stripe = await loadStripe(config.publishableKey);
  if (!stripe) throw new Error('Could not load the payment form.');
  const elements = stripe.elements({ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#C7D99F', borderRadius: '0px' } } });
  const payment = elements.create('payment');
  payment.mount(container);
  return {
    async confirm(email: string) {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href, receipt_email: email } });
      if (error) throw new Error(error.message || 'Payment failed.');
      if (!paymentIntent || (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing')) throw new Error('Payment did not complete.');
    },
    destroy() { payment.destroy(); },
  };
};
