// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardianModal } from '../../components/guides/GuardianModal';
import { EventProtocolBuilder } from '../../components/guides/EventProtocolBuilder';

afterEach(cleanup);

it('keeps actions outside the scrolling body and clamps the shared panel to the viewport', () => {
  render(<GuardianModal label="Example" onClose={() => {}} header={<h2>Example</h2>} footer={<button>Save</button>}><p>Long content</p></GuardianModal>);
  const dialog = screen.getByRole('dialog');
  const body = screen.getByText('Long content').parentElement!;
  expect(dialog.style.width).toBe('640px');
  expect(dialog.style.height).toBe('760px');
  expect(dialog.style.maxWidth).toBe('100%');
  expect(dialog.style.maxHeight).toBe('100%');
  expect(body.style.overflowY).toBe('auto');
  expect(body.style.minHeight).toBe('0');
  expect(body.contains(screen.getByRole('button', { name: 'Save' }))).toBe(false);
  expect(body.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false);
});

it('traps keyboard focus and returns focus to the opener on dismissal', () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const close = vi.fn();
  const view = render(<GuardianModal label="Example" onClose={close} footer={<button>Save</button>}><input aria-label="Name" /></GuardianModal>);
  const last = screen.getByRole('button', { name: 'Save' }); last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  view.unmount(); expect(document.activeElement).toBe(opener); opener.remove();
});

it('keeps the protocol builder primary action in the shared fixed footer', () => {
  render(<EventProtocolBuilder accessToken="test" protocolId="test" initialText="Drink water each morning" onClose={() => {}} onApplied={() => {}} />);
  const dialog = screen.getByRole('dialog');
  const footer = screen.getByRole('button', { name: /Build suggestion/ }).closest('footer');
  expect(footer).not.toBeNull();
  expect(dialog.style.width).toBe('640px');
  expect(footer?.parentElement).toBe(dialog);
});

it('a compact confirmation is 520px wide and as tall as its content; the default frame is unchanged', () => {
  const { rerender } = render(<GuardianModal compact label="Confirm" onClose={() => {}}><p>Sure?</p></GuardianModal>);
  expect(screen.getByRole('dialog').style.width).toBe('520px');
  expect(screen.getByRole('dialog').style.height).toBe('auto');
  rerender(<GuardianModal label="Confirm" onClose={() => {}}><p>Sure?</p></GuardianModal>);
  expect(screen.getByRole('dialog').style.width).toBe('640px');
  expect(screen.getByRole('dialog').style.height).toBe('760px');
});
