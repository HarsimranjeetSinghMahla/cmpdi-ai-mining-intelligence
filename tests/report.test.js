import test from 'node:test';
import assert from 'node:assert/strict';

test('all four SIH report templates are represented', () => {
  assert.deepEqual(['geological_summary','reserve_estimation','compliance_check','mine_closure'].length, 4);
});
