import { useEffect, useCallback } from 'react';

export default function AlertModal({ message, onClose }) {
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (message) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [message, onClose]);

  return (
    <div
      className={`modal-overlay${message ? ' active' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className="modal" style={{ textAlign: 'center' }}>
        <p className="modal__desc" style={{ fontSize: '1.15rem', marginBottom: '1.5rem' }}>{message || ''}</p>
        <div className="modal__actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn--accent" onClick={onClose}>Понятно</button>
        </div>
      </div>
    </div>
  );
}
