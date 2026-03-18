/* ── Theme Toggle ── */
(function initTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? null : "light";
    if (next) {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("theme");
    }
  });
})();

/* ── Hero Canvas Animation ── */
(function initHeroCanvas() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
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
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
  }

  function buildGrid() {
    dots.length = 0;
    cols = Math.ceil(w / CELL) + 1;
    rows = Math.ceil(h / CELL) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          ox: c * CELL,
          oy: r * CELL,
          x: c * CELL,
          y: r * CELL,
          vx: 0,
          vy: 0
        });
      }
    }
  }

  function getCanvasColors() {
    const s = getComputedStyle(document.documentElement);
    return {
      line: s.getPropertyValue("--hero-canvas-line").trim(),
      dot: s.getPropertyValue("--hero-canvas-dot").trim()
    };
  }

  let canvasColors = getCanvasColors();

  /* re-read colors when theme changes */
  const mo = new MutationObserver(() => { canvasColors = getCanvasColors(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function draw() {
    ctx.clearRect(0, 0, w, h);

    /* update dot positions based on mouse proximity */
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

    /* draw lines */
    ctx.strokeStyle = canvasColors.line;
    ctx.lineWidth = 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const d = dots[i];
        if (c < cols - 1) {
          const right = dots[i + 1];
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();
        }
        if (r < rows - 1) {
          const below = dots[i + cols];
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(below.x, below.y);
          ctx.stroke();
        }
      }
    }

    /* draw dots */
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

  canvas.parentElement.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.parentElement.addEventListener("mouseleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener("resize", resize);
  resize();
  draw();

  /* stat counter animation */
  const nums = document.querySelectorAll(".hero__stat-num");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      let current = 0;
      const step = Math.max(1, Math.floor(target / 30));
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(interval);
        }
        el.textContent = current;
      }, 35);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  nums.forEach((n) => observer.observe(n));
})();

/* ── Data ── */
const algorithms = {
  slau: [
    { name: "Метод Гаусса",                     desc: "Классический прямой метод решения СЛАУ путём последовательного приведения расширенной матрицы к верхнетреугольному виду с последующей обратной подстановкой. Сложность O(n³)." },
    { name: "LU-разложение",                     desc: "Факторизация матрицы A = LU, где L — нижнетреугольная, U — верхнетреугольная. Позволяет эффективно решать системы с одной и той же матрицей для разных правых частей." },
    { name: "QR-разложение",                     desc: "Разложение матрицы A = QR, где Q — ортогональная, R — верхнетреугольная. Обладает лучшей численной устойчивостью по сравнению с LU-разложением." },
    { name: "Метод Холецкого",                   desc: "Факторизация симметричной положительно определённой матрицы в виде A = LLᵀ. Вдвое эффективнее LU-разложения для подходящих матриц." },
    { name: "Метод Якоби",                       desc: "Итерационный метод, где на каждом шаге каждая компонента обновляется независимо по значениям предыдущей итерации. Хорошо параллелизуется." },
    { name: "Метод Зейделя",                     desc: "Модификация метода Якоби: при вычислении очередной компоненты используются уже найденные на текущей итерации значения, что ускоряет сходимость." },
    { name: "Метод сверхрелаксации (SOR)",       desc: "Обобщение метода Зейделя с параметром релаксации ω. При правильном выборе ω существенно ускоряет сходимость итерационного процесса." },
    { name: "Метод минимальных невязок",         desc: "Итерационный метод, минимизирующий норму невязки на каждом шаге. Параметр итерации выбирается оптимально из условия минимума." },
    { name: "Метод би-сопряжённых градиентов",   desc: "Метод крыловского типа для несимметричных СЛАУ. Строит два сопряжённых базиса и обеспечивает быструю сходимость без требования симметрии матрицы." },
    { name: "GMRES",                             desc: "Обобщённый метод минимальных невязок. Строит ортонормированный базис подпространства Крылова и находит приближение, минимизирующее невязку в этом подпространстве." }
  ],
  nonlinear: [
    { name: "Многомерный метод Ньютона",         desc: "Итерационный метод решения F(x) = 0, использующий якобиан системы. На каждом шаге решается линейная система J·Δx = −F для нахождения поправки. Квадратичная сходимость вблизи решения." },
    { name: "Метод Бройдена",                    desc: "Квази-ньютоновский метод, аппроксимирующий якобиан без его явного вычисления. Обновление приближения якобиана выполняется по формуле ранга 1, что снижает вычислительные затраты." },
    { name: "Метод простых итераций",            desc: "Система F(x) = 0 преобразуется к виду x = φ(x). Итерации xₙ₊₁ = φ(xₙ) сходятся при выполнении условия сжимающего отображения." },
    { name: "Гомотопический метод",              desc: "Строится непрерывная деформация (гомотопия) от простой системы к целевой: H(x,t) = (1−t)G(x) + tF(x). Решение отслеживается при изменении t от 0 до 1." },
    { name: "Метод продолжения по параметру",    desc: "Целевая система вкладывается в семейство систем F(x, λ). Решение прослеживается при плавном изменении параметра λ, что позволяет обходить точки бифуркации." }
  ],
  approx: [
    { name: "Многомерная линейная регрессия",                desc: "Построение линейной модели y = Xβ для нескольких предикторов. Коэффициенты находятся из нормальных уравнений XᵀXβ = Xᵀy методом наименьших квадратов." },
    { name: "Полиномиальная регрессия нескольких переменных", desc: "Расширение линейной регрессии с использованием полиномиальных признаков (x₁², x₁x₂, …). Позволяет моделировать нелинейные зависимости в рамках линейной модели." },
    { name: "Радиально-базисная интерполяция (RBF)",         desc: "Интерполяция с использованием радиальных базисных функций φ(‖x − cᵢ‖). Подходит для рассеянных данных произвольной размерности без регулярной сетки." },
    { name: "Метод наименьших квадратов (многомерный)",      desc: "Минимизация суммы квадратов отклонений ‖Ax − b‖² для переопределённых систем. Решение находится через нормальные уравнения или SVD-разложение." },
    { name: "Сплайн-аппроксимация в нескольких измерениях",  desc: "Построение гладких кусочно-полиномиальных поверхностей на многомерных данных. Обеспечивает непрерывность заданного порядка производных на стыках элементов." }
  ]
};

const groupColor = { slau: "teal", nonlinear: "indigo", approx: "amber" };

/* ── Views ── */
const views = {
  home:     document.getElementById("view-home"),
  algos:    document.getElementById("view-algorithms"),
  gauss:    document.getElementById("view-gauss"),
  lu:       document.getElementById("view-lu"),
  qr:       document.getElementById("view-qr"),
  cholesky: document.getElementById("view-cholesky"),
  jacobi:   document.getElementById("view-jacobi"),
  seidel:   document.getElementById("view-seidel"),
  sor:      document.getElementById("view-sor"),
  minres:   document.getElementById("view-minres"),
  bicg:     document.getElementById("view-bicg"),
  gmres:    document.getElementById("view-gmres")
};

const viewPaths = {
  "view-home": "/",
  "view-algorithms": "/algorithms",
  "view-gauss": "/gauss",
  "view-lu": "/lu",
  "view-qr": "/qr",
  "view-cholesky": "/cholesky",
  "view-jacobi": "/jacobi",
  "view-seidel": "/seidel",
  "view-sor": "/sor",
  "view-minres": "/minres",
  "view-bicg": "/bicg",
  "view-gmres": "/gmres"
};

/* ── DOM refs ── */
const $overlay    = document.getElementById("modal-overlay");
const $modalTitle = document.getElementById("modal-title");
const $modalDesc  = document.getElementById("modal-desc");

/* ── Router ── */
function navigate(target) {
  const from = document.querySelector(".view--active");
  if (from === target) return;

  from.classList.add("view--exit");
  from.classList.remove("view--active");

  target.classList.add("view--active");

  from.addEventListener("transitionend", () => from.classList.remove("view--exit"), { once: true });

  const path = viewPaths[target.id] || "/";
  history.pushState({ view: target.id }, "", path);

  window.scrollTo({ top: 0, behavior: "instant" });
}

function viewForPath(pathname) {
  for (const [id, p] of Object.entries(viewPaths)) {
    if (p === pathname) return document.getElementById(id);
  }
  return views.home;
}

/* back/forward browser buttons */
window.addEventListener("popstate", () => {
  const target = viewForPath(location.pathname);
  const from = document.querySelector(".view--active");
  if (from === target) return;
  if (from) { from.classList.remove("view--active"); from.classList.remove("view--exit"); }
  target.classList.add("view--active");
});

/* ── Render algorithm lists ── */
Object.entries(algorithms).forEach(([group, items]) => {
  const ul = document.querySelector(`.algo-list[data-group="${group}"]`);
  const color = groupColor[group];

  items.forEach((algo) => {
    const li = document.createElement("li");
    li.className = `algo-item algo-item--${color}`;
    li.textContent = algo.name;
    li.addEventListener("click", () => openModal(algo));
    ul.appendChild(li);
  });
});

/* ── Algorithm view routes ── */
const algoViews = {
  "Метод Гаусса": "gauss",
  "LU-разложение": "lu",
  "QR-разложение": "qr",
  "Метод Холецкого": "cholesky",
  "Метод Якоби": "jacobi",
  "Метод Зейделя": "seidel",
  "Метод сверхрелаксации (SOR)": "sor",
  "Метод минимальных невязок": "minres",
  "Метод би-сопряжённых градиентов": "bicg",
  "GMRES": "gmres"
};

/* ── Modal ── */
let currentAlgo = null;

function openModal(algo) {
  currentAlgo = algo;
  $modalTitle.textContent = algo.name;
  $modalDesc.textContent  = algo.desc;
  $overlay.classList.add("active");
}

function closeModal() {
  $overlay.classList.remove("active");
  currentAlgo = null;
}

document.getElementById("modal-close").addEventListener("click", closeModal);
$overlay.addEventListener("click", (e) => { if (e.target === $overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

document.getElementById("modal-try").addEventListener("click", () => {
  if (currentAlgo && algoViews[currentAlgo.name]) {
    const viewKey = algoViews[currentAlgo.name];
    closeModal();
    navigate(views[viewKey]);
    if (viewKey === "gauss" && typeof initGauss === "function") initGauss();
    if (viewKey === "lu" && typeof initLU === "function") initLU();
    if (viewKey === "qr" && typeof initQR === "function") initQR();
    if (viewKey === "cholesky" && typeof initCholesky === "function") initCholesky();
    if (viewKey === "jacobi" && typeof initJacobi === "function") initJacobi();
    if (viewKey === "seidel" && typeof initSeidel === "function") initSeidel();
    if (viewKey === "sor" && typeof initSOR === "function") initSOR();
    if (viewKey === "minres" && typeof initMinRes === "function") initMinRes();
    if (viewKey === "bicg" && typeof initBiCG === "function") initBiCG();
    if (viewKey === "gmres" && typeof initGMRES === "function") initGMRES();
  } else {
    closeModal();
  }
});

/* ── Category filter ── */
const categoryGroups = ["slau", "nonlinear", "approx"];

function showCategories(filter) {
  document.querySelectorAll("#view-algorithms .category").forEach((sec) => {
    const group = sec.querySelector(".algo-list")?.dataset.group;
    sec.style.display = (!filter || group === filter) ? "" : "none";
  });
}

/* ── Hero card clicks ── */
const cardFilters = ["slau", "nonlinear", "approx"];
document.querySelectorAll(".hero__card").forEach((card, i) => {
  card.addEventListener("click", () => {
    showCategories(cardFilters[i]);
    navigate(views.algos);
  });
});

/* ── Navigation buttons ── */
document.getElementById("btn-try").addEventListener("click",  () => { showCategories(null); navigate(views.algos); });
document.getElementById("btn-back").addEventListener("click", () => navigate(views.home));
document.getElementById("btn-back-gauss").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-lu").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-qr").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-cholesky").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-jacobi").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-seidel").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-sor").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-minres").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-bicg").addEventListener("click", () => navigate(views.algos));
document.getElementById("btn-back-gmres").addEventListener("click", () => navigate(views.algos));

/* ── Handle direct URL entry ── */
const initial = viewForPath(location.pathname);
if (initial !== views.home) {
  views.home.classList.remove("view--active");
  initial.classList.add("view--active");
  if (initial === views.gauss && typeof initGauss === "function") initGauss();
  if (initial === views.lu && typeof initLU === "function") initLU();
  if (initial === views.qr && typeof initQR === "function") initQR();
  if (initial === views.cholesky && typeof initCholesky === "function") initCholesky();
  if (initial === views.jacobi && typeof initJacobi === "function") initJacobi();
  if (initial === views.seidel && typeof initSeidel === "function") initSeidel();
  if (initial === views.sor && typeof initSOR === "function") initSOR();
  if (initial === views.minres && typeof initMinRes === "function") initMinRes();
  if (initial === views.bicg && typeof initBiCG === "function") initBiCG();
  if (initial === views.gmres && typeof initGMRES === "function") initGMRES();
}
