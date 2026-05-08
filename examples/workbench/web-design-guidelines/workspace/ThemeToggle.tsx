import React, { useState } from 'react';

const themes = ['light', 'dark', 'system'] as const;
type Theme = (typeof themes)[number];

export function ThemeToggle() {
  const initial = (localStorage.getItem('theme') as Theme) || 'light';
  const [theme, setTheme] = useState<Theme>(initial);
  const [accentColor] = useState('blue');

  return (
    <div className="theme-toggle">
      <label htmlFor="theme">Theme</label>
      <select
        id="theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        {themes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <label htmlFor="accent">Accent</label>
      <input id="accent" type="text" value={accentColor} />

      <button onClick={() => setTheme('dark')}>Apply Dark Mode</button>
    </div>
  );
}
