import { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, cols, rows;
    const CELL = 50;
    const dots = [];
    let mouse = { x: -1000, y: -1000 };
    let raf;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    }

    function buildGrid() {
      dots.length = 0;
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({ ox: c * CELL, oy: r * CELL, x: c * CELL, y: r * CELL, vx: 0, vy: 0 });
        }
      }
    }

    function getCanvasColors() {
      const s = getComputedStyle(document.documentElement);
      return {
        line: s.getPropertyValue('--hero-canvas-line').trim(),
        dot: s.getPropertyValue('--hero-canvas-dot').trim()
      };
    }

    let canvasColors = getCanvasColors();
    const mo = new MutationObserver(() => { canvasColors = getCanvasColors(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const RADIUS = 160;
      for (const d of dots) {
        const dx = d.ox - mouse.x;
        const dy = d.oy - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < RADIUS) {
          const force = (1 - dist / RADIUS) * 12;
          d.vx += (dx / dist) * force * 0.08;
          d.vy += (dy / dist) * force * 0.08;
        }
        d.vx += (d.ox - d.x) * 0.04;
        d.vy += (d.oy - d.y) * 0.04;
        d.vx *= 0.88;
        d.vy *= 0.88;
        d.x += d.vx;
        d.y += d.vy;
      }

      const rgb = canvasColors.dot;
      ctx.strokeStyle = canvasColors.line;
      ctx.lineWidth = 0.5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const d = dots[i];
          if (c < cols - 1) {
            const right = dots[i + 1];
            ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(right.x, right.y); ctx.stroke();
          }
          if (r < rows - 1) {
            const below = dots[i + cols];
            ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(below.x, below.y); ctx.stroke();
          }
        }
      }

      for (const d of dots) {
        const dx = d.x - mouse.x;
        const dy = d.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const alpha = dist < RADIUS ? 0.15 + (1 - dist / RADIUS) * 0.5 : 0.08;
        const size = dist < RADIUS ? 1.5 + (1 - dist / RADIUS) * 1.5 : 1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    const parent = canvas.parentElement;
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -1000; mouse.y = -1000; };

    parent.addEventListener('mousemove', onMove);
    parent.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize);
    resize();
    draw();

    /* stat counter animation */
    const nums = document.querySelectorAll('.hero__stat-num');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        let current = 0;
        const step = Math.max(1, Math.floor(target / 30));
        const interval = setInterval(() => {
          current += step;
          if (current >= target) { current = target; clearInterval(interval); }
          el.textContent = current;
        }, 35);
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });
    nums.forEach((n) => observer.observe(n));

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      parent.removeEventListener('mousemove', onMove);
      parent.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  const goAlgorithms = useCallback((filter) => {
    navigate('/algorithms', { state: { filter } });
  }, [navigate]);

  return (
    <div className="view view--active" style={{ position: 'relative' }} id="view-home">
      <canvas ref={canvasRef} id="hero-canvas"></canvas>
      <div className="hero">
        <div className="hero__badge">open-source platform</div>
        <h1 className="hero__title">
          <span className="hero__title-line">Interactive</span>
          <span className="hero__title-line hero__title-line--accent">Algo Platform</span>
        </h1>
        <p className="hero__sub">
          Веб-платформа нового поколения для глубокого изучения и визуализации
          численных алгоритмов линейной алгебры в реальном времени.
        </p>
        <div className="hero__actions">
          <button className="btn btn--glow" onClick={() => goAlgorithms(null)}>
            <span>Начать работу</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <div className="hero__stats">
            <div className="hero__stat">
              <span className="hero__stat-num" data-target="10">0</span>
              <span className="hero__stat-label">алгоритмов СЛАУ</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-num" data-target="3">0</span>
              <span className="hero__stat-label">категории</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-num" data-target="20">0</span>
              <span className="hero__stat-label">алгоритмов всего</span>
            </div>
          </div>
        </div>

        <div className="hero__cards">
          <div className="hero__card hero__card--teal" onClick={() => goAlgorithms('slau')}>
            <div className="hero__card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <h3>Многомерные СЛАУ</h3>
            <p>Гаусс, LU, QR, Холецкий, итерационные методы и GMRES</p>
            <span className="hero__card-count">10 методов</span>
          </div>
          <div className="hero__card hero__card--indigo" onClick={() => goAlgorithms('nonlinear')}>
            <div className="hero__card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.3-6.7-2.8 2.8m-5.8 5.8-2.8 2.8m0-11.4 2.8 2.8m5.8 5.8 2.8 2.8"/></svg>
            </div>
            <h3>Нелинейные системы</h3>
            <p>Ньютон, Бройден, итерации, гомотопия</p>
            <span className="hero__card-count">5 методов</span>
          </div>
          <div className="hero__card hero__card--amber" onClick={() => goAlgorithms('approx')}>
            <div className="hero__card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 20 7 8l4 6 3-10 4 8 3-4"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
            </div>
            <h3>Аппроксимация</h3>
            <p>Регрессия, RBF, МНК, сплайны</p>
            <span className="hero__card-count">5 методов</span>
          </div>
        </div>
      </div>
    </div>
  );
}
