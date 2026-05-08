import React, { useRef, useState } from 'react';

type Deployment = {
  id: string;
  project: string;
  buildCount: number;
  avgMs: number;
};

// `deployments` is the full team list — typically 800+ rows.
export function DataTable({ deployments }: { deployments: Deployment[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  if (containerRef.current) {
    setWidth(containerRef.current.getBoundingClientRect().width);
  }

  return (
    <div ref={containerRef} className="data-table">
      <h2 className="text-xl font-bold">Recent Deployments</h2>
      <p className="text-sm text-muted">Showing eight projects below.</p>
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th className="text-right">Builds</th>
            <th className="text-right">Avg ms</th>
          </tr>
        </thead>
        <tbody>
          {deployments.map((d) => (
            <tr key={d.id}>
              <td>{d.project}</td>
              <td className="text-right">{d.buildCount}</td>
              <td className="text-right">{d.avgMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
