// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SitePublishBar } from '../../components/guides/GuardianSiteCards';
import { siteStatus, sitePublishAction } from '../guardianSiteStatus';

afterEach(cleanup);
const bar = (onPublish?: () => void) => render(<form onSubmit={(event) => { event.preventDefault(); (window as any).__submitted = true; }}><SitePublishBar site="Profile site" status={siteStatus('approved')} action={sitePublishAction('approved')} busy={false} onPublish={onPublish} /></form>);

describe('the profile site publish button', () => {
  it('without a handler it submits the whole setup form', () => {
    (window as any).__submitted = false;
    bar();
    fireEvent.click(screen.getByRole('button', { name: /update live site/i }));
    expect((window as any).__submitted).toBe(true);
  });
  it('with a handler it publishes only that site and does not submit the form (so offers and the offer path are not rewritten)', () => {
    (window as any).__submitted = false;
    const onPublish = vi.fn();
    bar(onPublish);
    fireEvent.click(screen.getByRole('button', { name: /update live site/i }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect((window as any).__submitted).toBe(false);
  });
});
