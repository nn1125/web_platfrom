import { useEffect, useState } from 'react';

const MOBILE_MAX = 600;
const TABLET_MAX = 1024;

function detect() {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w <= MOBILE_MAX) return 'mobile';
  if (w <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useViewport() {
  const [device, setDevice] = useState(detect);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setDevice(detect()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return device;
}

export function maxMatrixSize(device) {
  if (device === 'mobile') return 5;
  if (device === 'tablet') return 8;
  return 11;
}

export function maxNonlinearSize(device) {
  if (device === 'mobile') return 4;
  if (device === 'tablet') return 7;
  return 10;
}

export function maxRegressionFeatures(device) {
  if (device === 'mobile') return 3;
  if (device === 'tablet') return 4;
  return 5;
}
