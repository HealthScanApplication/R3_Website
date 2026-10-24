// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ protocolImpact: vi.fn(), deleteProtocol: vi.fn(), archiveProtocol: vi.fn() }));
vi.mock('../protocolAdmin', () => api);
import { ProtocolRemovalDialog, impactLines } from '../../components/guides/ProtocolRemoval';

const draft = { steps: 12, offers: 0, shareLink: false, adds: 0, isPublic: false, shared: false };
const shared = { steps: 40, offers: 2, shareLink: true, adds: 3, isPublic: true, shared: true };
const protocol = { id: 'p1', name: 'R3 Protocol > Sleep reset', is_public: false };
beforeEach(() => { api.protocolImpact.mockReset(); api.deleteProtocol.mockReset().mockResolvedValue(undefined); api.archiveProtocol.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
const open = async (impact: unknown, over: Partial<{ onClose: () => void; onDone: (r: unknown) => void }> = {}) => {
  api.protocolImpact.mockResolvedValue(impact);
  const onClose = over.onClose || vi.fn(); const onDone = over.onDone || vi.fn();
  render(<ProtocolRemovalDialog accessToken="t" protocol={protocol} onClose={onClose} onDone={onDone as never} />);
  await screen.findByRole('button', { name: 'Delete permanently' });
  return { onClose, onDone };
};

it('says what deleting takes with it', () => {
  expect(impactLines(draft)).toEqual(['Its 12 steps will be deleted.']);
  expect(impactLines(shared)).toEqual([
    'Its 40 steps will be deleted.', 'It is published, so it will disappear from the public list.', '2 offers deliver it and will lose the routine.',
    'Its share link will stop working.', '3 people added it from its link: their copies stay theirs, but the record that they came from you is deleted.']);
  expect(impactLines({ ...draft, offers: 1, steps: 1 })).toContain('1 offer delivers it and will lose the routine.');
  expect(impactLines({ ...draft, shareLink: null }).pop()).toMatch(/could not check everything/);
});

it('a private draft nobody uses: one confirmation, no Archive, no typing', async () => {
  const { onDone } = await open(draft);
  expect(screen.getByRole('dialog', { name: 'Delete protocol' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Delete “Sleep reset”?' })).toBeTruthy(); // the "R3 Protocol >" prefix is not shown
  expect(screen.queryByRole('button', { name: 'Archive instead' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  const del = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  expect(del.disabled).toBe(false);
  fireEvent.click(del);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'deleted', id: 'p1', name: 'Sleep reset' }));
  expect(api.deleteProtocol).toHaveBeenCalledWith('t', 'p1');
  expect(api.archiveProtocol).not.toHaveBeenCalled();
});

it('a published or shared protocol: Archive is offered, and Delete needs the name typed', async () => {
  const { onDone } = await open(shared);
  const del = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  fireEvent.click(del);
  expect(api.deleteProtocol).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sleep' } });
  expect(del.disabled).toBe(true); // a part of the name is not enough
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ' SLEEP RESET ' } });
  expect(del.disabled).toBe(false); // case and spaces around it do not matter
  fireEvent.click(del);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'deleted', id: 'p1', name: 'Sleep reset' }));
});

it('Archive instead keeps everything: it archives, never deletes', async () => {
  const { onDone } = await open(shared);
  fireEvent.click(screen.getByRole('button', { name: 'Archive instead' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'archived', id: 'p1', name: 'Sleep reset' }));
  expect(api.archiveProtocol).toHaveBeenCalledWith('t', 'p1');
  expect(api.deleteProtocol).not.toHaveBeenCalled();
});

it('when the impact cannot be read it is treated as shared', async () => {
  api.protocolImpact.mockRejectedValue(new Error('offline'));
  render(<ProtocolRemovalDialog accessToken="t" protocol={protocol} onClose={() => {}} onDone={() => {}} />);
  await screen.findByRole('button', { name: 'Archive instead' });
  expect((screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/could not check everything/)).toBeTruthy();
});

it('a failed delete shows the reason and leaves the buttons usable', async () => {
  const { onDone } = await open(draft);
  api.deleteProtocol.mockRejectedValue(new Error('Nothing was deleted: this protocol is not yours, or it is already gone.'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/not yours/);
  expect(onDone).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(false);
});

it('Cancel and Escape close it without touching anything', async () => {
  const { onClose } = await open(draft);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect((onClose as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  expect(api.deleteProtocol).not.toHaveBeenCalled();
  expect(api.archiveProtocol).not.toHaveBeenCalled();
});
