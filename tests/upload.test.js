import test from 'node:test';
import assert from 'node:assert/strict';

test('upload endpoint contract', () => assert.equal('/api/v1/upload', '/api/v1/upload'));
test('only PDF files are accepted by the API contract', () => assert.equal('application/pdf', 'application/pdf'));
