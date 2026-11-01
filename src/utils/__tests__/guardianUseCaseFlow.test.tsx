// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));

beforeEach(() => {
  window.history.replaceState({}, '', '/guardians/workspace?step=4');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = () => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} />);
/** Step 4 opens on the business goal, then the lead magnets, then the use case panel. */
async function openUseCase() {
  setup();
  for (let i = 0; i < 4 && !screen.queryByText('Create these offers for'); i++) {
    const next = (await screen.findAllByRole('button')).find((button) => /^(continue|next|choose lead magnets|continue to)/i.test((button.textContent || '').trim()) && !(button as HTMLButtonElement).disabled);
    if (!next) break;
    fireEvent.click(next);
  }
  return screen.findByText('Create these offers for');
}
const selectNamed = (name: string) => screen.queryByRole('combobox', { name }) as HTMLSelectElement | null;
const choose = (name: string, value: string) => fireEvent.change(selectNamed(name)!, { target: { value } });

describe('the use case is built step by step', () => {
  it('starts blank with only Audience, and no menopause default or offers', async () => {
    await openUseCase();
    const audience = selectNamed('Audience')!;
    expect(audience.value).toBe('');
    expect(selectNamed('Sex / population')).toBeNull();
    expect(selectNamed('Age range')).toBeNull();
    expect(selectNamed('Health / life stage')).toBeNull();
    expect(selectNamed('Problem')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Menopause/);
    expect(screen.queryByText(/value rises at every step/)).toBeNull();
    expect(screen.queryByLabelText('Offers to build')).toBeNull();
    expect(screen.queryByLabelText('Solution for this use case')).toBeNull();
    expect(document.getElementById('value-ramp-name')).toBeNull(); // the lead magnet is only suggested after the use case is added
  });

  it('reveals each part after the one before, then a solution, then adds it and suggests the lead magnet and offers', async () => {
    await openUseCase();
    choose('Audience', (selectNamed('Audience')!.options[1] as HTMLOptionElement).value);
    expect(selectNamed('Sex / population')).toBeTruthy();
    expect(selectNamed('Age range')).toBeNull();
    choose('Sex / population', 'Women');
    expect(selectNamed('Age range')).toBeTruthy();
    choose('Age range', 'Women 45–64');
    expect(selectNamed('Health / life stage')).toBeTruthy();
    choose('Health / life stage', 'Menopause');
    expect(selectNamed('Problem')).toBeTruthy();
    expect(screen.queryByLabelText('Solution for this use case')).toBeNull(); // not until the problem is chosen
    choose('Problem', (selectNamed('Problem')!.options[1] as HTMLOptionElement).value);
    const solution = await screen.findByLabelText('Solution for this use case');
    expect(solution.textContent).toMatch(/7-day menopause .* challenge for women/);
    expect(document.getElementById('value-ramp-name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add this use case' }));
    await waitFor(() => expect(screen.getByText(/value rises at every step/)).toBeTruthy());
    expect(screen.queryByLabelText('Solution for this use case')).toBeNull();
    // Hidden on purpose: the lead magnet name box, the entry offer picker and the build queue.
    expect(document.getElementById('value-ramp-name')).toBeNull();
    expect(screen.queryByText('Choose the entry offer')).toBeNull();
    expect(screen.queryByText('Offer build queue')).toBeNull();
    expect(screen.queryByLabelText('Offers to build')).toBeNull();
    // The recommended entry offer was chosen for them, so the builder opens on naming it.
    expect(await screen.findByText('Entry offer')).toBeTruthy(); // the entry offer summary only shows once an entry offer is chosen
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('hides the lead magnet and offers again when an earlier choice changes', async () => {
    await openUseCase();
    choose('Audience', (selectNamed('Audience')!.options[1] as HTMLOptionElement).value);
    choose('Sex / population', 'Men');
    choose('Age range', 'Men 25–44');
    choose('Health / life stage', 'Midlife');
    choose('Problem', (selectNamed('Problem')!.options[1] as HTMLOptionElement).value);
    fireEvent.click(await screen.findByRole('button', { name: 'Add this use case' }));
    await waitFor(() => expect(screen.getByText(/value rises at every step/)).toBeTruthy());
    choose('Sex / population', 'Women');
    expect(screen.queryByText(/value rises at every step/)).toBeNull();
    expect(selectNamed('Age range')!.value).toBe(''); // later parts are cleared
    expect(selectNamed('Problem')).toBeNull();
  });

  it('puts a dashed Add another beside the first lead magnet, and a second one joins into the upsell', async () => {
    await openUseCase();
    choose('Audience', (selectNamed('Audience')!.options[1] as HTMLOptionElement).value);
    choose('Sex / population', 'Women');
    choose('Age range', 'Women 45–64');
    choose('Health / life stage', 'Menopause');
    choose('Problem', (selectNamed('Problem')!.options[1] as HTMLOptionElement).value);
    fireEvent.click(await screen.findByRole('button', { name: 'Add this use case' }));
    const group = await screen.findByRole('group', { name: 'Lead magnets' });
    const add = within(group).getByRole('button', { name: 'Add another lead magnet' });
    expect(within(group).getByText('Add another')).toBeTruthy();
    expect(within(group).queryByRole('img', { name: /join into your upsell/ })).toBeNull(); // one lead magnet: nothing to join yet
    fireEvent.click(add);
    const options = within(group).getAllByRole('button').filter((button) => !/Add another lead magnet/.test(button.getAttribute('aria-label') || ''));
    const pick = options.find((button) => !(button as HTMLButtonElement).disabled && /call|guide|recipe|challenge|workshop|checklist|video|webinar|book|class|template|community|session/i.test(button.textContent || '')) || options[options.length - 1];
    fireEvent.click(pick);
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Lead magnets' })).getByRole('img', { name: 'Both lead magnets join into your upsell' })).toBeTruthy());
    expect(within(screen.getByRole('group', { name: 'Lead magnets' })).queryByRole('button', { name: 'Add another lead magnet' })).toBeNull(); // two is the pair that joins
    fireEvent.click(within(screen.getByRole('group', { name: 'Lead magnets' })).getByRole('button', { name: /^Remove / }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Lead magnets' })).getByRole('button', { name: 'Add another lead magnet' })).toBeTruthy());
  });
});
