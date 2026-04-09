import assert from 'node:assert/strict';

import { vault_dispatch, vault_lookup } from '../src/server.js';

const balance = vault_lookup({ accountId: 'alice' });
assert.equal(balance.balance, 125);

const transfer = vault_dispatch({ from: 'alice', to: 'bob', amount: 12, memo: 'rent' });
assert.equal(transfer.accepted, true);
assert.equal(transfer.memo, 'rent');

console.log('mcp-demo validation ok');
