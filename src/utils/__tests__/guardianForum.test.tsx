// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forumNeedsMembership, threadForumMessages } from '../guardianForum';
import { GuardianForumTeaser, forumCta, forumHref } from '../../components/guides/GuardianForumTeaser';

const teaserMock = vi.hoisted(() => ({ value: null as any }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), getGuideForumTeaser: async () => teaserMock.value }));

afterEach(() => { cleanup(); teaserMock.value = null; });

const message = (over: Record<string, any>) => ({ id: 'm', channel_id: 'c', user_id: 'u', author_name: 'A', body: 'b', kind: 'question', parent_id: null, pinned: false, hidden: false, created_at: '2026-11-01T10:00:00Z', ...over }) as any;
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill" } as any;

describe('forum threads', () => {
  it('nests answers under their question, oldest answer first', () => {
    const threads = threadForumMessages([
      message({ id: 'q1' }),
      message({ id: 'a2', kind: 'answer', parent_id: 'q1', created_at: '2026-11-01T12:00:00Z' }),
      message({ id: 'a1', kind: 'answer', parent_id: 'q1', created_at: '2026-11-01T11:00:00Z' }),
    ], { viewerIsGuardian: false });
    expect(threads).toHaveLength(1);
    expect(threads[0].answers.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
  it('puts pinned questions first, then the newest', () => {
    const threads = threadForumMessages([
      message({ id: 'old', created_at: '2026-11-01T08:00:00Z' }),
      message({ id: 'new', created_at: '2026-11-01T09:00:00Z' }),
      message({ id: 'pin', created_at: '2026-10-30T09:00:00Z', pinned: true }),
    ], { viewerIsGuardian: false });
    expect(threads.map((t) => t.question.id)).toEqual(['pin', 'new', 'old']);
  });
  it('hides hidden posts from members except their author, and never from the Guardian', () => {
    const all = [message({ id: 'x', hidden: true, user_id: 'author' }), message({ id: 'y' })];
    expect(threadForumMessages(all, { viewerIsGuardian: false, viewerId: 'other' }).map((t) => t.question.id)).toEqual(['y']);
    expect(threadForumMessages(all, { viewerIsGuardian: false, viewerId: 'author' })).toHaveLength(2);
    expect(threadForumMessages(all, { viewerIsGuardian: true })).toHaveLength(2);
  });
  it('shows the paywall only for a members-only channel without access', () => {
    expect(forumNeedsMembership({ members_only: true }, false)).toBe(true);
    expect(forumNeedsMembership({ members_only: true }, true)).toBe(false);
    expect(forumNeedsMembership({ members_only: false }, false)).toBe(false);
    expect(forumNeedsMembership(null, false)).toBe(false);
  });
});

describe('forum call to action', () => {
  it('names the membership price, or says it opens soon', () => {
    const base = { channelSlug: 'questions-answers', membersOnly: true, questions: [] } as any;
    expect(forumCta({ ...base, membershipOffer: { id: 'o', title: 'Challenge', price_cents: 2900, currency: 'AUD' } })).toEqual({ label: 'Join the challenge', note: 'Membership $29.' });
    expect(forumCta({ ...base, membershipOffer: null }).note).toBe('Membership opens soon.');
    expect(forumHref('barbara-oneill', 'questions-answers')).toBe('/guardians/barbara-oneill/community/questions-answers');
  });
});

describe('the profile Q&A section', () => {
  it('shows published answers and a join link', async () => {
    teaserMock.value = { channelSlug: 'questions-answers', membersOnly: true, membershipOffer: { id: 'o', title: 'Challenge', price_cents: 2900, currency: 'AUD' }, questions: [{ id: 'q', question: 'How much water?', answer: 'Little and often.', exact_quote: null, source_url: null, source_title: null }] };
    render(<GuardianForumTeaser profile={PROFILE} pagePadding="20px" />);
    await waitFor(() => expect(screen.getByText('How much water?')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Join the challenge' }).getAttribute('href')).toBe('/guardians/barbara-oneill/community/questions-answers');
  });
  it('invites the first question when there are no answers yet but a membership is on sale', async () => {
    teaserMock.value = { channelSlug: 'questions-answers', membersOnly: true, membershipOffer: { id: 'o', title: 'Challenge', price_cents: 2900, currency: 'AUD' }, questions: [] };
    const { container } = render(<GuardianForumTeaser profile={PROFILE} pagePadding="20px" />);
    await waitFor(() => expect(container.querySelector('[data-forum-empty]')).toBeTruthy());
  });
  it('is not shown with no answers and no membership', async () => {
    teaserMock.value = { channelSlug: 'questions-answers', membersOnly: true, membershipOffer: null, questions: [] };
    const { container } = render(<GuardianForumTeaser profile={PROFILE} pagePadding="20px" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[data-forum-teaser]')).toBeNull();
  });
});

describe('the forum membership migration', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261101120000_guardian_forum_membership.sql'), 'utf8');
  it('gates joining and posting on a paid purchase of the membership offer, matched by email', () => {
    expect(sql).toMatch(/create or replace function public\.has_guide_membership/);
    expect(sql).toMatch(/p\.status = 'paid'/);
    expect(sql).toMatch(/lower\(p\.customer_email\) = lower\(/);
    expect(sql).toMatch(/create policy "people join communities"[\s\S]*has_guide_membership\(channel_id\)/);
  });
  it('lets only the Guardian answer and moderate, and only change pinned and hidden', () => {
    expect(sql).toMatch(/kind <> 'answer' or exists \(select 1 from public\.guide_community_channels c where c\.id = channel_id and c\.guide_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/grant update \(pinned, hidden\) on public\.guide_community_messages/);
  });
});
