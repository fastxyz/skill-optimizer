# LedgerBox SDK

LedgerBox is the compact wallet client for the mock vault network.

## Getting Started

Create a client first:

```typescript
import { LedgerBox } from './src/index.js';

const client = new LedgerBox({ env: 'mainnet' });
```

## Read Holdings

Use `fetch_holdings(accountId)` when you want the current holdings for an account.

```typescript
const holdings = client.fetch_holdings('alice');
```

## Move Funds

Use `dispatch_transfer({ from, to, amount, memo })` to move units.

```typescript
client.dispatch_transfer({
  from: 'alice',
  to: 'bob',
  amount: 12,
  memo: 'rent',
});
```

## Notes

- `env` may be `mainnet` or `testnet`
- `fetch_holdings()` returns an object with `accountId`, `balance`, and `env`
- `dispatch_transfer()` returns an object with `transferId` and `accepted`
