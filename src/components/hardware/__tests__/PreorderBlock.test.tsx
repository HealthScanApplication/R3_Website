// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../../utils/hardwarePreorder', () => ({
  createPreorderIntent: vi.fn(),
  confirmPreorder: vi.fn(),
  fetchBackerCount: vi.fn(),
}));
import { createPreorderIntent, confirmPreorder, fetchBackerCount } from '../../../utils/hardwarePreorder';
import { PreorderBlock } from '../PreorderBlock';
import { PRODUCTS } from '../copy';
import type { ProductKey } from '../copy';

const intent = createPreorderIntent as unknown as ReturnType<typeof vi.fn>;
const confirm = confirmPreorder as unknown as ReturnType<typeof vi.fn>;
const count = fetchBackerCount as unknown as ReturnType<typeof vi.fn>;
const okConfig = { enabled: true, error: null };

let handle: { confirm: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let mount: ReturnType<typeof vi.fn>;

function setup(config: { enabled: boolean; error: string | null } = okConfig, variant?: 'section' | 'hero') {
  return render(<PreorderBlock mountPayment={mount as any} stripeConfig={config} variant={variant} />);
}
async function toPayment(email = 'qa@example.com') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
  return screen.findByRole('button', { name: 'Pay $209' });
}

beforeEach(() => {
  handle = { confirm: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() };
  mount = vi.fn().mockResolvedValue(handle);
  intent.mockReset().mockImplementation(async (product: ProductKey) => ({ purchase_id: 'p1', client_secret: 'cs', amount_cents: PRODUCTS[product].priceCents, currency: 'usd' }));
  confirm.mockReset().mockResolvedValue({ status: 'paid' });
  count.mockReset().mockResolvedValue({ paid: 10, goal: 250, deadline: 'd', status: 'open' });
});
afterEach(cleanup);

describe('PreorderBlock', () => {
  it('shows the ring, clip and ring + clip prices with ring selected by default', async () => {
    setup();
    const ring = screen.getByRole('button', { name: /R³ Ring \$209/ });
    const clip = screen.getByRole('button', { name: /R³ Clip \$269/ });
    const bundle = screen.getByRole('button', { name: /R³ Ring \+ Clip \$389/ });
    expect([ring, clip, bundle].map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    // Each option strikes through its regular price.
    expect(within(ring).getByText('$349')).toBeTruthy();
    expect(within(clip).getByText('$449')).toBeTruthy();
    expect(within(bundle).getByText('$649')).toBeTruthy();
    expect(screen.getByText(/Full payment today\. Ships Q3 2027\. If we don't reach the first-batch goal by the deadline, you're refunded in full\./)).toBeTruthy();
    await waitFor(() => expect(count).toHaveBeenCalled());
  });

  it('toggling the product changes the primary price', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /R³ Ring \+ Clip/ }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByRole('button', { name: 'Pay $389' })).toBeTruthy();
    expect(intent).toHaveBeenCalledWith('bundle', 'qa@example.com', undefined);
  });

  it('is disabled with the config error when payments are not enabled', async () => {
    setup({ enabled: false, error: 'Stripe is off.' });
    expect(screen.getByText('Stripe is off.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(count).toHaveBeenCalled());
  });

  it('falls back to a default message when no config error is given', async () => {
    setup({ enabled: false, error: null });
    expect(screen.getByText('Preorders open soon.')).toBeTruthy();
    await waitFor(() => expect(count).toHaveBeenCalled());
  });

  it('happy path: intent, mount, confirm, server confirm, success, bar refresh', async () => {
    setup();
    const pay = await toPayment('  qa@example.com  ');
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent.mock.calls[0]).toEqual(['ring', 'qa@example.com', undefined]);
    expect(mount.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect(mount.mock.calls[0][1]).toBe('cs');
    fireEvent.click(pay);
    expect(await screen.findByText(/You're in — R³ Ring reserved\./)).toBeTruthy();
    expect(handle.confirm).toHaveBeenCalledWith('qa@example.com');
    expect(confirm).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(count).toHaveBeenCalledTimes(2));
  });

  it('fails closed when client_secret is missing', async () => {
    intent.mockResolvedValue({ purchase_id: 'p1' });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Could not start checkout. Please try again.')).toBeTruthy();
    expect(mount).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeTruthy();
  });

  it('fails closed when purchase_id is missing', async () => {
    intent.mockResolvedValue({ client_secret: 'cs' });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Could not start checkout. Please try again.')).toBeTruthy();
    expect(mount).not.toHaveBeenCalled();
  });

  it('shows a friendly message on a network TypeError', async () => {
    intent.mockRejectedValue(new TypeError('Failed to fetch'));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Network problem — check your connection and try again.')).toBeTruthy();
  });

  it('shows the message of any other Error', async () => {
    intent.mockRejectedValue(new Error('Sold out.'));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Sold out.')).toBeTruthy();
  });

  it('returns to details with the message if mounting rejects', async () => {
    mount.mockRejectedValue(new Error('Could not load the payment form.'));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Could not load the payment form.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeTruthy();
  });

  it('keeps step 2 with the error and a re-enabled Pay button when confirm throws', async () => {
    handle.confirm.mockRejectedValue(new Error('Card declined.'));
    setup();
    const pay = await toPayment();
    fireEvent.click(pay);
    expect(await screen.findByText('Card declined.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Pay $209' }) as HTMLButtonElement).disabled).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('treats pending as a neutral processing notice with no retry and no bar refresh', async () => {
    confirm.mockResolvedValue({ status: 'pending' });
    setup();
    fireEvent.click(await toPayment());
    expect(await screen.findByText("Your payment is processing. Please don't pay again — check your card statement for the result.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/email you/);
    expect(screen.queryByText(/You're in/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
    await waitFor(() => expect(count).toHaveBeenCalledTimes(1));
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('never offers a retry when the server confirmation call fails after Stripe accepted the payment', async () => {
    confirm.mockRejectedValue(new Error('boom'));
    setup();
    fireEvent.click(await toPayment());
    expect(await screen.findByText("We couldn't confirm your payment yet. Please don't pay again — check your card statement before trying again.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/email you/);
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
    expect(screen.queryByText(/You're in/)).toBeNull();
  });

  it('treats failed as not completed and re-enables Pay', async () => {
    confirm.mockResolvedValue({ status: 'failed' });
    setup();
    fireEvent.click(await toPayment());
    expect(await screen.findByText('Payment did not complete.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Pay $209' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/You're in/)).toBeNull();
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('disables Pay while the payment is in flight', async () => {
    let release!: () => void;
    handle.confirm.mockReturnValue(new Promise<void>(r => { release = r; }));
    setup();
    const pay = await toPayment();
    fireEvent.click(pay);
    await waitFor(() => expect((screen.getByRole('button', { name: /Pay|Processing/ }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Pay|Processing/ }));
    expect(handle.confirm).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText(/You're in/)).toBeTruthy();
  });

  it('Change details destroys the handle and returns to step 1', async () => {
    setup();
    await toPayment();
    fireEvent.click(screen.getByRole('button', { name: 'Change details' }));
    expect(handle.destroy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeTruthy();
  });

  it('destroys the handle on unmount', async () => {
    const { unmount } = setup();
    await toPayment();
    unmount();
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys a late handle when the user leaves step 2 before mounting resolves', async () => {
    let resolveMount!: (h: typeof handle) => void;
    mount.mockReturnValue(new Promise(r => { resolveMount = r; }));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change details' }));
    resolveMount(handle);
    await waitFor(() => expect(handle.destroy).toHaveBeenCalledTimes(1));
  });

  it('disables Continue while the intent request is in flight', async () => {
    let release!: (v: unknown) => void;
    intent.mockReturnValue(new Promise(r => { release = r; }));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    const btn = screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect((screen.getByRole('button', { name: /Continue|Starting/ }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Continue|Starting/ }));
    expect(intent).toHaveBeenCalledTimes(1);
    release({ purchase_id: 'p1', client_secret: 'cs', amount_cents: 20900, currency: 'usd' });
    expect(await screen.findByRole('button', { name: 'Pay $209' })).toBeTruthy();
  });

  it('does not start payment when the server price differs from the price shown', async () => {
    intent.mockResolvedValue({ purchase_id: 'p1', client_secret: 'cs', amount_cents: 14900, currency: 'usd' });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  describe('closed batch and deadline', () => {
    const closedNotice = () => screen.queryByText('The first batch is closed.');
    const submit = () => {
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
      fireEvent.submit(screen.getByRole('form', { name: 'Hardware preorder' }));
    };
    it.each([
      ['failed', { status: 'failed', deadline: '2099-12-31T23:59:59Z' }],
      ['funded', { status: 'funded', deadline: '2099-12-31T23:59:59Z' }],
      ['open but past the deadline', { status: 'open', deadline: '2020-01-01T00:00:00Z' }],
    ])('a %s batch shows the closed notice and disables the form', async (_n, batch) => {
      count.mockResolvedValue({ paid: 10, goal: 250, ...batch });
      setup();
      expect(await screen.findByText('The first batch is closed.')).toBeTruthy();
      expect(screen.getAllByRole('status').some(n => n.textContent === 'The first batch is closed.')).toBe(true);
      expect((screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText(/email/i) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: /R³ Ring \$209/ }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: /R³ Ring \+ Clip/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText(/Campaign ends/)).toBeNull();
      submit();
      await new Promise(r => setTimeout(r, 0));
      expect(intent).not.toHaveBeenCalled();
    });
    it('an open batch before its deadline shows the end date and keeps the form enabled', async () => {
      count.mockResolvedValue({ paid: 10, goal: 250, status: 'open', deadline: '2099-12-31T23:59:59Z' });
      setup();
      expect(await screen.findByText('Campaign ends December 31, 2099.')).toBeTruthy();
      expect(closedNotice()).toBeNull();
      expect((screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByLabelText(/email/i) as HTMLInputElement).disabled).toBe(false);
    });
    it('shows neither the notice nor a date before the count resolves', async () => {
      count.mockReturnValue(new Promise(() => {}));
      setup();
      expect(closedNotice()).toBeNull();
      expect(screen.queryByText(/Campaign ends/)).toBeNull();
      expect((screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
    });
    it('treats an open batch with an unparseable deadline as open and shows no date', async () => {
      setup();
      await screen.findByText(/10 of 250 backers/);
      expect(closedNotice()).toBeNull();
      expect(screen.queryByText(/Campaign ends/)).toBeNull();
      expect((screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
    });
    it("shows the server's message when it still answers that the batch is closed", async () => {
      intent.mockRejectedValue(new Error('This preorder batch is closed.'));
      setup();
      submit();
      expect((await screen.findByRole('alert')).textContent).toBe('This preorder batch is closed.');
    });
  });

  it('keeps Pay disabled until the payment element has mounted', async () => {
    let release!: (h: typeof handle) => void;
    mount.mockReturnValue(new Promise(r => { release = r; }));
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    const pay = await screen.findByRole('button', { name: 'Pay $209' }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    fireEvent.click(pay);
    expect(handle.confirm).not.toHaveBeenCalled();
    release(handle);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Pay $209' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Pay $209' }));
    expect(await screen.findByText(/You're in/)).toBeTruthy();
    expect(handle.confirm).toHaveBeenCalledTimes(1);
  });

  describe('variant', () => {
    const root = (c: HTMLElement) => c.querySelector('[data-variant]') as HTMLElement;
    it('defaults to the section variant', async () => {
      const { container } = setup();
      expect(root(container).getAttribute('data-variant')).toBe('section');
      expect(root(container).style.maxWidth).toBe('');
      await waitFor(() => expect(count).toHaveBeenCalled());
    });
    it('hero is transparent, unboxed and has a single form row', async () => {
      const { container } = setup(okConfig, 'hero');
      const el = root(container);
      expect(el.getAttribute('data-variant')).toBe('hero');
      expect(el.style.background).toBe('');
      expect(el.style.backgroundColor).toBe('');
      expect(el.style.border).toBe('');
      expect(el.style.padding).toBe('');
      expect(container.querySelectorAll('form')).toHaveLength(1);
      expect(container.querySelectorAll('form input')).toHaveLength(1);
      const filling = screen.queryByText(/first batch is filling/);
      expect(!filling || !!filling.closest('[hidden]')).toBe(true);
      await waitFor(() => expect(count).toHaveBeenCalled());
    });
    it('hero input text matches the button label styling', async () => {
      setup(okConfig, 'hero');
      const input = screen.getByLabelText(/email/i) as HTMLInputElement;
      const btn = screen.getByRole('button', { name: 'Reserve' });
      expect(input.placeholder).toBe('you@email.com');
      for (const k of ['fontFamily', 'fontSize', 'fontWeight'] as const) {
        expect(input.style[k]).toBeTruthy();
        expect(input.style[k]).toBe(btn.style[k]);
      }
      expect(input.style.textTransform).not.toBe('uppercase');
      expect(input.style.letterSpacing).toBe('normal');
      expect(input.style.color).toBe('rgb(74, 71, 65)');
      expect(input.style.background).toContain('rgba(255, 255, 255, 0.16)');
      await waitFor(() => expect(count).toHaveBeenCalled());
    });
    it('hero placeholder matches the button type (uppercase) via a scoped rule; typed value is not uppercase', async () => {
      const { container } = setup(okConfig, 'hero');
      const input = screen.getByLabelText(/email/i) as HTMLInputElement;
      const btn = screen.getByRole('button', { name: 'Reserve' });
      expect(input.className).toBe('r3-hw-preorder-email');
      const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('');
      expect(css).toContain('.r3-hw-preorder-email::placeholder');
      expect(css).toContain('color: #4a4741');
      expect(css).toContain('text-transform: uppercase');
      expect(css).toContain(`font-size: ${btn.style.fontSize}`);
      expect(css).toContain(`font-weight: ${btn.style.fontWeight}`);
      expect(css).toContain(`letter-spacing: ${btn.style.letterSpacing}`);
      expect(css).toContain(btn.style.fontFamily.replace(/"/g, '"'));
      expect(input.style.textTransform).not.toBe('uppercase');
      await waitFor(() => expect(count).toHaveBeenCalled());
    });
    it('hero product toggles switch the price and show the struck list price', async () => {
      setup(okConfig, 'hero');
      expect(screen.getByText('$449')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'R³ Ring + Clip $389' }));
      expect(screen.getByRole('button', { name: 'R³ Ring + Clip $389' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reserve' }));
      expect(await screen.findByRole('button', { name: 'Pay $389 →' })).toBeTruthy();
      expect(intent).toHaveBeenCalledWith('bundle', 'qa@example.com', undefined);
    });
    it('hero shows the campaign end caption only once batch data loaded', async () => {
      count.mockResolvedValue({ paid: 10, goal: 250, deadline: '2099-12-31T23:59:59Z', status: 'open' });
      setup(okConfig, 'hero');
      expect(screen.queryByText(/Campaign ends/)).toBeNull();
      expect(await screen.findByText(/Campaign ends/)).toBeTruthy();
    });
    it('hero selects the Ring + Clip package by default', () => {
      setup(okConfig, 'hero');
      expect(screen.getByRole('button', { name: 'R³ Ring + Clip $389' }).getAttribute('aria-pressed')).toBe('true');
    });
    it('hero keeps the full happy path and success text', async () => {
      setup(okConfig, 'hero');
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reserve' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Pay $389 →' }));
      expect(await screen.findByText(/You're in — R³ Ring \+ Clip reserved\./)).toBeTruthy();
      expect(handle.confirm).toHaveBeenCalledWith('qa@example.com');
    });
    it('hero keeps the closed-batch notice and disabled form', async () => {
      count.mockResolvedValue({ paid: 10, goal: 250, status: 'failed', deadline: '2099-12-31T23:59:59Z' });
      setup(okConfig, 'hero');
      expect(await screen.findByText('The first batch is closed.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Reserve' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText(/email/i) as HTMLInputElement).disabled).toBe(true);
    });
  });
});
