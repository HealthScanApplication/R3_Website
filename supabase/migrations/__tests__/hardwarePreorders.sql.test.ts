import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261031100000_hardware_preorders.sql', 'utf8');
describe('hardware preorder migration', () => {
  it('creates both tables', () => {
    expect(sql).toMatch(/create table[^;]*hardware_batches/i);
    expect(sql).toMatch(/create table[^;]*hardware_preorders/i);
  });
  it('enables RLS and grants service_role', () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/grant[\s\S]*service_role/i);
  });
  it('seeds a batch with goal 250', () => {
    expect(sql).toMatch(/insert into[\s\S]*hardware_batches[\s\S]*250/i);
  });
});
