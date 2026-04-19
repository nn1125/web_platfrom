import { useEffect, useCallback } from 'react';

export default function Modal({ algo, onTry, onClose }) {
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (algo) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [algo, onClose]);

  return (
    <div
      className={`modal-overlay${algo ? ' active' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className="modal">
        <h2 className="modal__title">{algo?.name || ''}</h2>
        <p className="modal__desc">{algo?.desc || ''}</p>
        <div className="modal__actions">
          {algo?.slug && (
            <button className="btn btn--accent" onClick={onTry}>Попробовать</button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
