// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProtocolImpact } from '../protocolAdmin';

const api = vi.hoisted(() => ({ protocolImpact: vi.fn(), deleteProtocol: vi.fn(), archiveProtocol: vi.fn() }));
vi.mock('../protocolAdmin', () => api);
import { ProtocolRemovalDialog, impactLines } from '../../components/guides/ProtocolRemoval';

const quiet: ProtocolImpact = { name: 'Sleep reset', isPublic: false, isSuggested: false, steps: 12, offers: 0, shareLink: false, adds: 0, copiedIntoParents: 0, attachedTo: 0, childPlans: 0, own: { active: 0, enabled: 0, pinned: 0, logs: 0 }, unreadable: false };
const protocol = { id: 'p1', name: 'R3 Protocol > Old name from the list' };
beforeEach(() => { api.protocolImpact.mockReset(); api.deleteProtocol.mockReset().mockResolvedValue(undefined); api.archiveProtocol.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
const open = async (impact: Partial<ProtocolImpact> | Error, over: Partial<{ onClose: () => void; onDone: (r: unknown) => void }> = {}) => {
  if (impact instanceof Error) api.protocolImpact.mockRejectedValue(impact); else api.protocolImpact.mockResolvedValue({ ...quiet, ...impact });
  const onClose = over.onClose || vi.fn(); const onDone = over.onDone || vi.fn();
  render(<ProtocolRemovalDialog accessToken="t" protocol={protocol} onClose={onClose} onDone={onDone as never} />);
  if (!(impact instanceof Error)) await screen.findByRole('button', { name: 'Archive' }); else await screen.findByRole('alert');
  return { onClose, onDone };
};

it('says what deleting takes with it, only what is true', () => {
  expect(impactLines(quiet)).toEqual(['Its 12 steps will be deleted.']);
  expect(impactLines({ ...quiet, steps: 0 })).toEqual([]); // no "Its 0 steps"
  expect(impactLines({ ...quiet, steps: 1, offers: 1 })).toEqual(['Its 1 step will be deleted.', '1 offer delivers it and will lose the routine.']);
  expect(impactLines({ ...quiet, isPublic: true, isSuggested: true, offers: 2, shareLink: true, adds: 3 })).toEqual([
    'Its 12 steps will be deleted.', 'It is published, so it will disappear from the public list.', 'It is a suggested protocol, shown to everyone.', '2 offers deliver it and will lose the routine.',
    'Its share link will stop working.', '3 people added it from its link: their copies stay theirs, but the record that they came from you is deleted.']);
  expect(impactLines({ ...quiet, unreadable: true }).pop()).toMatch(/could not check everything/);
});

it('a child plan: its steps copied into the parent are deleted there too, and the links are named', () => {
  expect(impactLines({ ...quiet, steps: 5, copiedIntoParents: 5, attachedTo: 1 })).toEqual(['Its 5 steps will be deleted.', '5 steps copied from it into a parent protocol will be deleted there too.', 'It is attached to 1 parent protocol and will be detached.']);
  expect(impactLines({ ...quiet, childPlans: 2 })).toContain('2 attached plans will be detached and stay as protocols of their own.');
});

it('your own use of it is said: active, in your app, and your logs', () => {
  expect(impactLines({ ...quiet, own: { active: 1, enabled: 1, pinned: 0, logs: 40 } })).toEqual(['Its 12 steps will be deleted.', 'It is active in your own app.', 'Your 40 logs for it will be deleted.']);
  expect(impactLines({ ...quiet, own: { active: 0, enabled: 1, pinned: 0, logs: 0 } })).toContain('You have it in your own app.');
});

it('no protocol is deleted in one click: Archive is one click, Delete permanently needs the name typed, even for a quiet draft', async () => {
  await open(quiet);
  const del = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  fireEvent.click(del);
  expect(api.deleteProtocol).not.toHaveBeenCalled();
  expect(screen.getByText(/we cannot see who/)).toBeTruthy(); // others who added it to their own app
});

it('the name to type, and the heading, come from the database now, not from the list the page loaded', async () => {
  const { onDone } = await open({ name: 'R3 Protocol > Sleep reset' });
  expect(screen.getByRole('heading', { name: 'Delete “Sleep reset”?' })).toBeTruthy(); // not "Old name from the list"
  const del = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old name from the list' } });
  expect(del.disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sleep' } });
  expect(del.disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ' SLEEP RESET ' } });
  expect(del.disabled).toBe(false);
  fireEvent.click(del);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'deleted', id: 'p1', name: 'Sleep reset' }));
  expect(api.deleteProtocol).toHaveBeenCalledWith('t', 'p1');
});

it('a protocol with no name asks for the word DELETE, not an empty box that is already right', async () => {
  await open({ name: '' });
  const del = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'delete' } });
  expect(del.disabled).toBe(false);
});

it('Archive keeps everything: it archives, never deletes, with no typing', async () => {
  const { onDone } = await open({ isPublic: true, offers: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'archived', id: 'p1', name: 'Sleep reset' }));
  expect(api.archiveProtocol).toHaveBeenCalledWith('t', 'p1');
  expect(api.deleteProtocol).not.toHaveBeenCalled();
});

it('a routine that is active in your own app can only be archived', async () => {
  await open({ own: { active: 1, enabled: 0, pinned: 0, logs: 3 } });
  expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText(/can only be archived/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
});

it('when it cannot be read there is nothing to confirm: the reason shows, and neither Archive nor Delete is offered', async () => {
  await open(new Error('This protocol no longer exists, or it is not yours.'));
  expect(screen.getByRole('alert').textContent).toMatch(/no longer exists/);
  expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
});

it('while a request is running it cannot be closed, so its result is never lost', async () => {
  let finish!: () => void;
  api.archiveProtocol.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const { onClose, onDone } = await open(quiet);
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await screen.findByRole('button', { name: 'Archiving…' });
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

it('a failed delete shows the reason and leaves the buttons usable', async () => {
  const { onDone } = await open(quiet);
  api.deleteProtocol.mockRejectedValue(new Error('Nothing was deleted: this protocol is not yours, or it is already gone.'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sleep reset' } });
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/not yours/);
  expect(onDone).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(false);
});

it('Cancel and Escape close it without touching anything', async () => {
  const { onClose } = await open(quiet);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect((onClose as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  expect(api.deleteProtocol).not.toHaveBeenCalled();
  expect(api.archiveProtocol).not.toHaveBeenCalled();
});
