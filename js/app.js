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
  home:  document.getElementById("view-home"),
  algos: document.getElementById("view-algorithms"),
  gauss: document.getElementById("view-gauss")
};

const viewPaths = {
  "view-home": "/",
  "view-algorithms": "/algorithms",
  "view-gauss": "/gauss"
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
  "Метод Гаусса": "gauss"
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
    if (viewKey === "gauss" && typeof initGauss === "function") {
      initGauss();
    }
  } else {
    closeModal();
  }
});

/* ── Navigation buttons ── */
document.getElementById("btn-try").addEventListener("click",  () => navigate(views.algos));
document.getElementById("btn-back").addEventListener("click", () => navigate(views.home));
document.getElementById("btn-back-gauss").addEventListener("click", () => navigate(views.algos));

/* ── Handle direct URL entry ── */
const initial = viewForPath(location.pathname);
if (initial !== views.home) {
  views.home.classList.remove("view--active");
  initial.classList.add("view--active");
  if (initial === views.gauss && typeof initGauss === "function") {
    initGauss();
  }
}
