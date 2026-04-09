import { LedgerBox } from '../src/index.js';

const client = new LedgerBox({ env: 'mainnet' });
console.log(client.fetch_holdings('alice'));
