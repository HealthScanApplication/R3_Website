// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProtocolCard } from '../../components/guides/ProtocolCard';

afterEach(cleanup);

it('shows Yours and visibility for an owned card', () => {
  render(<ProtocolCard title="My recipe" owned visibility="private" inert />);
  expect(screen.getByText('Yours')).toBeTruthy();
  expect(screen.getByText('Private')).toBeTruthy();
});

it('never labels somebody else’s public card as Yours', () => {
  render(<ProtocolCard title="Public recipe" visibility="public" inert />);
  expect(screen.getByText('Public')).toBeTruthy();
  expect(screen.queryByText('Yours')).toBeNull();
});

