export function vault_lookup({ accountId }) {
  return {
    accountId,
    balance: accountId === 'alice' ? 125 : 40,
  };
}

export function vault_dispatch({ from, to, amount, memo = '' }) {
  return {
    accepted: amount > 0,
    from,
    to,
    amount,
    memo,
  };
}
