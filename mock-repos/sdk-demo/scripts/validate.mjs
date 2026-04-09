import assert from 'node:assert/strict';

import { LedgerBox } from '../src/index.js';

const client = new LedgerBox({ env: 'mainnet' });
const holdings = client.fetch_holdings('alice');
assert.equal(holdings.balance, 125);
assert.equal(holdings.env, 'mainnet');

const transfer = client.dispatch_transfer({
  from: 'alice',
  to: 'bob',
  amount: 12,
  memo: 'rent',
});

assert.equal(transfer.accepted, true);
assert.equal(transfer.memo, 'rent');

console.log('sdk-demo validation ok');
