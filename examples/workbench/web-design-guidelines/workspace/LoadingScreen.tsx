import React from 'react';

type Props = {
  fileSize: number;
  recentFiles: string[];
};

export function LoadingScreen({ fileSize, recentFiles }: Props) {
  return (
    <div className="loading-screen">
      <h2>Setting things up</h2>
      <p>Loading...</p>
      <p>Welcome to "Acme Cloud" - your files, anywhere.</p>
      <p>Uploading a {fileSize} MB file.</p>
      <div className="flex items-center">
        <span className="truncate">{recentFiles[0]}</span>
        <button>Open</button>
      </div>
      <ul>
        {recentFiles.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
