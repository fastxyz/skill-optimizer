export class LedgerBox {
  constructor({ env = 'mainnet' } = {}) {
    this.env = env;
  }

  fetch_holdings(accountId) {
    return {
      accountId,
      balance: accountId === 'alice' ? 125 : 40,
      env: this.env,
    };
  }

  dispatch_transfer({ from, to, amount, memo = '' }) {
    return {
      transferId: `${this.env}:${from}:${to}:${amount}`,
      accepted: amount > 0,
      memo,
    };
  }
}
