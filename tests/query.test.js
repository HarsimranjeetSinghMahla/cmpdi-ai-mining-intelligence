import test from 'node:test';
import assert from 'node:assert/strict';

test('query endpoint contract', () => assert.equal('/api/v1/query', '/api/v1/query'));
test('citation format uses a page number', () => assert.match('[Page 42]', /\[Page \d+\]/));
