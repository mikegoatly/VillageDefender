const STYLE = `
.vd-rotate { position: fixed; inset: 0; z-index: 1000; display: none; flex-direction: column; align-items: center;
  justify-content: center; gap: 28px; background: #d9bfa6; color: #3b2418; font-family: sans-serif;
  font-size: 20px; text-align: center; padding: 24px; }
.vd-rotate.vd-rotate-on { display: flex; }
.vd-rotate-phone { width: 44px; height: 76px; border: 5px solid #3b2418; border-radius: 9px; position: relative;
  animation: vd-rotate-spin 2.4s ease-in-out infinite; }
.vd-rotate-phone::after { content: ''; position: absolute; left: 50%; bottom: 5px; width: 8px; height: 8px;
  margin-left: -4px; border-radius: 50%; background: #3b2418; }
@keyframes vd-rotate-spin { 0%, 15% { transform: rotate(0deg); } 60%, 100% { transform: rotate(-90deg); } }
`;

export const ROTATE_ACTIVE_CLASS = 'vd-rotate-active';

/**
 * Shows a "rotate to landscape" overlay on touch-primary devices held in portrait.
 * Desktop (fine pointer) never sees it. Returns an uninstall function.
 */
export function installRotateOverlay(root: HTMLElement): () => void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'vd-rotate';
  el.innerHTML = '<div class="vd-rotate-phone"></div><div>Rotate your device to landscape</div>';
  root.appendChild(el);

  const update = (): void => {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const show = coarse && window.innerHeight > window.innerWidth;
    el.classList.toggle('vd-rotate-on', show);
    document.documentElement.classList.toggle(ROTATE_ACTIVE_CLASS, show);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);

  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
    document.documentElement.classList.remove(ROTATE_ACTIVE_CLASS);
    el.remove();
    style.remove();
  };
}
