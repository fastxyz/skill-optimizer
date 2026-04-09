import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const balanceRaw = execFileSync('node', ['./bin/pulse.js', 'stash', 'inspect', '--account', 'alice'], {
  encoding: 'utf-8',
});
const balance = JSON.parse(balanceRaw);
assert.equal(balance.balance, 125);

const transferRaw = execFileSync('node', ['./bin/pulse.js', 'move', 'create', '--from', 'alice', '--to', 'bob', '--units', '12', '--memo', 'rent'], {
  encoding: 'utf-8',
});
const transfer = JSON.parse(transferRaw);
assert.equal(transfer.accepted, true);
assert.equal(transfer.memo, 'rent');

console.log('cli-demo validation ok');
