import { useRef, useImperativeHandle, forwardRef, useState } from 'react';

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const STEP_DELAY = 600;

const StepLog = forwardRef(function StepLog({ stepDelay }, ref) {
  const stepsRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    show() { setVisible(true); },
    hide() { setVisible(false); },
    clear() { if (stepsRef.current) stepsRef.current.innerHTML = ''; },
    addStep(title, detail, matHtml, blasCmd) {
      const div = document.createElement('div');
      div.className = 'step step--hidden';
      let inner = `<div class="step__head"><span class="step__title">${title}</span></div>`;
      if (blasCmd) inner += `<div class="step__blas"><code>blas&gt; ${escHtml(blasCmd)}</code></div>`;
      if (detail) inner += `<div class="step__detail">${detail}</div>`;
      if (matHtml) inner += `<div class="step__matrix">${matHtml}</div>`;
      div.innerHTML = inner;
      stepsRef.current?.appendChild(div);
      return div;
    },
    async showStep(div) {
      await sleep(stepDelay || STEP_DELAY);
      div.classList.remove('step--hidden');
      div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  }), [stepDelay]);

  return (
    <section className="output-section" style={{ display: visible ? 'block' : 'none' }}>
      <h2>Пошаговое решение</h2>
      <div className="steps" ref={stepsRef}></div>
    </section>
  );
});

export default StepLog;
