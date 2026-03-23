import { useRef, useImperativeHandle, forwardRef, useCallback, useState, useEffect } from 'react';

const Visualization = forwardRef(function Visualization(props, ref) {
  const containerRef = useRef(null);
  const statusRef = useRef(null);
  const opLabelRef = useRef(null);
  const speedRef = useRef(null);
  const backsubContainerRef = useRef(null);
  const backsubStatusRef = useRef(null);
  const backsubOpLabelRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [backsubVisible, setBacksubVisible] = useState(false);
  const [backsubReady, setBacksubReady] = useState(false);
  const backsubRunnerRef = useRef(null);
  const backsubPendingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    show() { setVisible(true); },
    hide() { setVisible(false); },
    getContainer() { return containerRef.current; },
    getSpeed() { return parseInt(speedRef.current?.value) || 1600; },
    setStatus(text) { if (statusRef.current) statusRef.current.textContent = text; },
    setOpLabel(text) { if (opLabelRef.current) opLabelRef.current.textContent = text; },
    setContainerHTML(html) { if (containerRef.current) containerRef.current.innerHTML = html; },
    appendHTML(html) { if (containerRef.current) containerRef.current.innerHTML += html; },
    scrollToEnd() {
      const last = containerRef.current?.lastElementChild;
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    querySelector(sel) { return containerRef.current?.querySelector(sel); },
    querySelectorAll(sel) { return containerRef.current?.querySelectorAll(sel) || []; },
    /* Back substitution visualization */
    enableBacksub(runner) {
      backsubRunnerRef.current = runner;
      setBacksubReady(true);
      setBacksubVisible(false);
    },
    disableBacksub() {
      setBacksubReady(false);
      setBacksubVisible(false);
      backsubRunnerRef.current = null;
      backsubPendingRef.current = false;
    },
    getBacksubContainer() { return backsubContainerRef.current; },
    setBacksubStatus(text) { if (backsubStatusRef.current) backsubStatusRef.current.textContent = text; },
    setBacksubOpLabel(text) { if (backsubOpLabelRef.current) backsubOpLabelRef.current.textContent = text; },
    setBacksubContainerHTML(html) { if (backsubContainerRef.current) backsubContainerRef.current.innerHTML = html; },
    backsubQuerySelector(sel) { return backsubContainerRef.current?.querySelector(sel); },
    backsubQuerySelectorAll(sel) { return backsubContainerRef.current?.querySelectorAll(sel) || []; },
  }), []);

  /* Run the backsub animation after the section mounts */
  useEffect(() => {
    if (backsubVisible && backsubPendingRef.current && backsubContainerRef.current) {
      backsubPendingRef.current = false;
      if (backsubRunnerRef.current) backsubRunnerRef.current();
    }
  }, [backsubVisible]);

  const toggleBacksub = useCallback(() => {
    if (backsubVisible) {
      setBacksubVisible(false);
    } else {
      backsubPendingRef.current = true;
      setBacksubVisible(true);
    }
  }, [backsubVisible]);

  return (
    <section className="interactive-section" style={{ display: visible ? '' : 'none' }}>
      <h2>Визуализация</h2>
      <div className="imat-toolbar">
        <div className="imat-status" ref={statusRef}></div>
        <div className="imat-controls">
          <label className="imat-speed-label">Скорость:
            <select ref={speedRef} defaultValue="1600">
              <option value="3200">0.25x</option>
              <option value="1600">0.5x</option>
              <option value="800">1x</option>
            </select>
          </label>
          <button className="btn btn--ghost imat-skip-btn" onClick={props.onSkip}>Пропустить</button>
        </div>
      </div>
      <div className="imat-op-label" ref={opLabelRef}></div>
      <div className="imat-container" ref={containerRef}></div>

      {backsubReady && (
        <div className="backsub-toggle-wrap">
          <button className="btn btn--ghost backsub-toggle-btn" onClick={toggleBacksub}>
            {backsubVisible ? 'Скрыть обратную подстановку' : 'Показать обратную подстановку'}
          </button>
        </div>
      )}

      {backsubVisible && (
        <div className="backsub-section">
          <div className="imat-toolbar">
            <div className="imat-status" ref={backsubStatusRef}></div>
          </div>
          <div className="imat-op-label" ref={backsubOpLabelRef}></div>
          <div className="imat-container" ref={backsubContainerRef}></div>
        </div>
      )}
    </section>
  );
});

export default Visualization;
