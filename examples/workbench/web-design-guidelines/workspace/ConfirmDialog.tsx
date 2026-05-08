import React from 'react';

type Props = {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-overlay" style={{ position: 'fixed', inset: 0 }}>
      <div
        className="dialog-panel"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: 24,
        }}
      >
        <h3>{title}</h3>
        <input
          type="text"
          autoFocus
          placeholder="Type project name to confirm…"
          className="confirm-input"
        />
        <div className="dialog-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="btn-cancel">Cancel</button>
          <button onClick={onConfirm} className="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}
