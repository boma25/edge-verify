import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sweep } from './analysis';
import type { BenchmarkItem } from './types';

const expected = { fullName: 'John Doe', city: 'Springfield', state: 'IL' };
const good = {
  documentType: 'utility_bill' as const,
  fullName: 'John Doe',
  addressLine: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
  issueDate: '2026-09-20',
  issuer: 'Fictional Power Co',
  legibility: 'clear' as const,
};

const item = (id: string, expectedOutcome: BenchmarkItem['expectedOutcome'], extra: Partial<BenchmarkItem>): BenchmarkItem => ({
  id, variant: 'x', expectedOutcome, expected, truth: good, fieldsVisible: true, passes: [good, good], ...extra,
});

test('sweep counts approvals and fails closed on errors', () => {
  const items = [
    item('a', 'approve', {}),
    item('b', 'human_review', { error: 'boom', passes: [] }),
  ];
  const [row] = sweep(items, 2, '2026-10-04', [0.85]);
  assert.equal(row.n, 2);
  assert.equal(row.approveRate, 0.5);
  assert.equal(row.humanRate, 0.5);
  assert.equal(row.wrongApprovals, 0);
});

test('a wrong approval is counted when a bad doc is approved', () => {
  const items = [item('a', 'human_review', {})];
  const [row] = sweep(items, 2, '2026-10-04', [0.85]);
  assert.equal(row.wrongApprovals, 1);
  assert.equal(row.falseApproveRate, 1);
});
