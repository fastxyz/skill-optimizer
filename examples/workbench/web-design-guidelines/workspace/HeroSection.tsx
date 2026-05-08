import React from 'react';

export function HeroSection() {
  return (
    <section className="hero">
      <img src="/hero.jpg" alt="" className="hero-bg" />
      <div
        className="hero-content"
        style={{ transition: 'all 300ms ease' }}
      >
        <h1>Welcome to Acme</h1>
        <p>Build faster. Ship faster.</p>
        <button className="hero-cta">Get Started</button>
      </div>
      <div
        className="floating-badge"
        style={{ animation: 'spin 3s linear infinite' }}
      >
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" />
        </svg>
      </div>
      <img src="/below-fold.jpg" alt="Decorative graphic" />
    </section>
  );
}
