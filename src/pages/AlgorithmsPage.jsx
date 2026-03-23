import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { algorithms, groupColor, categoryTitles } from '../data/algorithms';
import Modal from '../components/Modal';

export default function AlgorithmsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState(null);
  const [modalAlgo, setModalAlgo] = useState(null);

  useEffect(() => {
    if (location.state?.filter !== undefined) {
      setFilter(location.state.filter);
    }
  }, [location.state]);

  const openModal = useCallback((algo) => setModalAlgo(algo), []);
  const closeModal = useCallback(() => setModalAlgo(null), []);

  const tryAlgo = useCallback(() => {
    if (modalAlgo?.slug) {
      closeModal();
      navigate('/' + modalAlgo.slug);
    } else {
      closeModal();
    }
  }, [modalAlgo, closeModal, navigate]);

  return (
    <div className="view view--active" id="view-algorithms" style={{ alignItems: 'flex-start' }}>
      <div className="page">
        <header className="page__header">
          <button className="back-btn" onClick={() => navigate('/')}>&larr; Главная</button>
          <h1>Алгоритмы</h1>
        </header>

        {Object.entries(algorithms).map(([group, items]) => (
          <section
            key={group}
            className={`category category--${groupColor[group]}`}
            style={{ display: (!filter || group === filter) ? '' : 'none' }}
          >
            <h2 className="category__title">{categoryTitles[group]}</h2>
            <ul className="algo-list">
              {items.map((algo) => (
                <li
                  key={algo.name}
                  className={`algo-item algo-item--${groupColor[group]}`}
                  onClick={() => openModal(algo)}
                >
                  {algo.name}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal
        algo={modalAlgo}
        onTry={tryAlgo}
        onClose={closeModal}
      />
    </div>
  );
}
