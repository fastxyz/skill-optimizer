import React, { useState } from 'react';

type Props = {
  onSubmit: (data: FormData) => Promise<void>;
};

export function CheckoutForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>Email</label>
      <input
        type="text"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        onPaste={(e) => e.preventDefault()}
      />

      <label htmlFor="card">Card Number</label>
      <input id="card" type="text" name="card" autoComplete="cc-number" />

      <button type="submit" disabled={email.length === 0}>
        Place Order
      </button>
    </form>
  );
}
