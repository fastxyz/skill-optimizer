import React, { useState } from 'react';

type Result = {
  id: string;
  title: string;
  price: number;
  publishedAt: Date;
};

export function SearchPage({ results }: { results: Result[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  function handleDelete(id: string) {
    fetch(`/api/items/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="search-page">
      <h1>Search Acme Cloud</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
      />
      <p>Showing page {page}</p>
      <ul>
        {results.map((r) => (
          <li key={r.id}>
            <h3>{r.title}</h3>
            <span>${r.price.toFixed(2)}</span>
            <time>{r.publishedAt.toDateString()}</time>
            <button onClick={() => handleDelete(r.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
