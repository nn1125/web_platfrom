import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const goHome = useCallback((e) => {
    e.preventDefault();
    if (location.pathname !== '/') navigate('/');
  }, [navigate, location]);

  return (
    <>
      <header className="site-header">
        <a href="/" className="site-header__logo" onClick={goHome}>
          Interactive <span>Algo Platform</span>
        </a>
        <nav className="site-header__nav">
          <button className="site-header__link" onClick={() => setAboutOpen(true)}>
            О нас
          </button>
          <button className="site-header__link" onClick={() => setContactOpen(true)}>
            Контакты
          </button>
          <ThemeToggle />
        </nav>
      </header>

      <div
        className={`about-overlay${aboutOpen ? ' active' : ''}`}
        onClick={(e) => e.target === e.currentTarget && setAboutOpen(false)}
      >
        <div className="about-panel">
          <h2>О платформе</h2>
          <p>
            Interactive Algo Platform — инструмент, ориентированный на образовательную деятельность,
            который делает сложные вычистительные алгоритмы наглядными и доступными для изучения.
          </p>
          <p>Платформа предоставляет:</p>
          <ul>
            <li>Пошаговую визуализацию для каждого алгоритма</li>
            <li>Высокопроизводительные вычисления</li>
            <li>3 категории алгоритмов</li>
          </ul>
          <p>
            Разработано для школьников, студентов и всех, кто хочет понять, как работают численные методы на практике.
          </p>
          <button className="about-close" onClick={() => setAboutOpen(false)}>
            Закрыть
          </button>
        </div>
      </div>

      <div
        className={`about-overlay${contactOpen ? ' active' : ''}`}
        onClick={(e) => e.target === e.currentTarget && setContactOpen(false)}
      >
        <div className="about-panel">
          <h2>Обратная связь</h2>
          <p>
            Мы стремились сделать эту платформу максимально надежной и полезной. Если вы 
            обнаружили ошибку, неточность в расчетах, или у вас есть предложение по улучшению проекта,
            мы будем рады его услышать! 
          </p>
          <p>
            Вы можете связаться с нами по следующему адресу:
          </p>
          <p style={{ textAlign: 'center', margin: '1.25rem 0' }}>
            <a
              href="mailto:maslakova1125@mail.ru"
              style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '1.05rem', textDecoration: 'none' }}
            >
              maslakova1125@mail.ru
            </a>
          </p>
          <p>
            Мы ценим любые отзывы - они помогают нам расти и предоставлять лучший сервис для всех!
          </p>
          <button className="about-close" onClick={() => setContactOpen(false)}>
            Закрыть
          </button>
        </div>
      </div>
    </>
  );
}
