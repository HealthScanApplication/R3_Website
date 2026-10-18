// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Let the initial folder/item load settle so it does not replace freshly saved rows.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const db = vi.hoisted(() => ({
  items: [] as any[],
  createGuideLibraryItem: vi.fn(async (_guideId: string, item: any) => ({ id: `id-${item.kind}`, guide_id: 'g', created_at: '', updated_at: '', ...item })),
  uploadGuideLibraryAudio: vi.fn(async () => 'g/library-1.m4a'),
}));

vi.mock('../guidePortal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guidePortal')>()),
  listGuideLibraryFolders: vi.fn(async () => []),
  listGuideLibraryItems: vi.fn(async () => db.items),
  createGuideLibraryItem: db.createGuideLibraryItem,
  uploadGuideLibraryAudio: db.uploadGuideLibraryAudio,
}));

import { GuideLibrary } from '../../components/guides/GuidePortal';

afterEach(() => { cleanup(); db.createGuideLibraryItem.mockClear(); db.items = []; });

it('saves a paper with its metadata, files it under its type and hands it to the Protocol builder', async () => {
  const onUse = vi.fn();
  function Demo() { const [ids, setIds] = React.useState<string[]>([]); return <GuideLibrary guideId="g" selectedIds={ids} onSelectedIds={setIds} onUse={onUse} />; }
  render(<Demo />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: /Add paper/ }));
  fireEvent.change(screen.getByPlaceholderText('Full paper title'), { target: { value: 'Magnesium and sleep' } });
  fireEvent.change(screen.getByPlaceholderText('10.1000/xyz123'), { target: { value: 'https://doi.org/10.1000/xyz123' } });
  fireEvent.change(screen.getByPlaceholderText('2024'), { target: { value: '2021' } });
  fireEvent.click(screen.getByRole('button', { name: /Save paper/ }));
  await screen.findByText('Magnesium and sleep saved to the library.');
  expect(db.createGuideLibraryItem).toHaveBeenCalledWith('g', expect.objectContaining({ kind: 'paper', source_url: 'https://doi.org/10.1000/xyz123', metadata: { doi: '10.1000/xyz123', year: 2021 } }));

  fireEvent.click(screen.getByRole('button', { name: /Books/ }));
  expect(screen.getByText('No books here yet')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Papers/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Magnesium and sleep' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use in Protocol' }));
  expect(onUse).toHaveBeenCalledWith('protocol', [expect.objectContaining({ kind: 'paper', title: 'Magnesium and sleep' })]);
});

it('blocks an audio source with neither file nor URL, then uploads a chosen file', async () => {
  render(<GuideLibrary guideId="g" selectedIds={[]} onSelectedIds={() => {}} onUse={() => {}} />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: /Add audio/ }));
  fireEvent.click(screen.getByRole('button', { name: /Save audio/ }));
  expect(await screen.findByText('Choose an audio file or add an audio URL.')).toBeTruthy();
  expect(db.createGuideLibraryItem).not.toHaveBeenCalled();
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File(['x'], 'Morning talk.m4a', { type: 'audio/x-m4a' })] } });
  fireEvent.click(screen.getByRole('button', { name: /Save audio/ }));
  await waitFor(() => expect(db.createGuideLibraryItem).toHaveBeenCalledWith('g', expect.objectContaining({ kind: 'audio', title: 'Morning talk', file_path: 'g/library-1.m4a' })));
  expect(screen.getByText('Private audio · Morning talk.m4a')).toBeTruthy();
});

it('shows existing book rows with their icon label and metadata line', async () => {
  db.items = [{ id: 'b', guide_id: 'g', folder_id: null, kind: 'book', title: 'Food Is Medicine', source_url: null, file_path: null, transcript: null, metadata: { author: 'A. Author' }, created_at: '', updated_at: '' }];
  render(<GuideLibrary guideId="g" selectedIds={[]} onSelectedIds={() => {}} onUse={() => {}} />);
  expect(await screen.findByText('Food Is Medicine')).toBeTruthy();
  expect(screen.getByText('A. Author')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Books/ }).textContent || '')).toContain('1');
  expect((screen.getByTitle('Open source') as HTMLButtonElement).disabled).toBe(true);
});
