// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mount, destroy, create, elementsFactory, confirmPayment, config } = vi.hoisted(() => {
  const mount = vi.fn();
  const destroy = vi.fn();
  const create = vi.fn(() => ({ mount, destroy }));
  const elementsFactory = vi.fn(() => ({ create }));
  const confirmPayment = vi.fn();
  const config = { enabled: true, publishableKey: 'pk_test_abc', error: null as string | null };
  return { mount, destroy, create, elementsFactory, confirmPayment, config };
});
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue({ elements: elementsFactory, confirmPayment }) }));
vi.mock('../guardianStripe', () => ({ getGuardianStripeConfiguration: () => config }));
import { loadStripe } from '@stripe/stripe-js';
import { mountPayment } from '../hardwareStripe';

beforeEach(() => { vi.clearAllMocks(); config.enabled = true; config.publishableKey = 'pk_test_abc'; config.error = null; });

describe('mountPayment', () => {
  it('refuses when checkout is not enabled for this environment', async () => {
    config.enabled = false; config.publishableKey = null; config.error = 'Live payments are disabled pending full staging verification.';
    await expect(mountPayment(document.createElement('div'), 'cs')).rejects.toThrow('Live payments are disabled');
    expect(loadStripe).not.toHaveBeenCalled();
  });
  it('creates elements from the client secret and mounts a payment element', async () => {
    const container = document.createElement('div');
    await mountPayment(container, 'cs_123');
    expect(loadStripe).toHaveBeenCalledWith('pk_test_abc');
    expect(elementsFactory.mock.calls[0][0].clientSecret).toBe('cs_123');
    expect(create).toHaveBeenCalledWith('payment');
    expect(mount).toHaveBeenCalledWith(container);
  });
  it('confirms in place with the receipt email and no redirect when possible', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await handle.confirm('qa@example.com');
    const arg = confirmPayment.mock.calls[0][0];
    expect(arg.redirect).toBe('if_required');
    expect(arg.confirmParams.receipt_email).toBe('qa@example.com');
    expect(arg.elements).toBeTruthy();
  });
  it('throws Stripe\'s message when confirmation errors', async () => {
    confirmPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await expect(handle.confirm('qa@example.com')).rejects.toThrow('Your card was declined.');
  });
  it('throws when the intent is neither succeeded nor processing', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'requires_payment_method' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await expect(handle.confirm('qa@example.com')).rejects.toThrow('Payment did not complete.');
  });
  it('destroy tears down the payment element', async () => {
    const handle = await mountPayment(document.createElement('div'), 'cs');
    handle.destroy();
    expect(destroy).toHaveBeenCalled();
  });
});
