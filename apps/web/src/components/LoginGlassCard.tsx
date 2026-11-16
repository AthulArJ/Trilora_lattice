import { useRef, type PointerEvent, type ReactNode } from 'react';

export default function LoginGlassCard({ children }: { children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);

  function reset() {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--card-rotate-x', '0deg');
    card.style.setProperty('--card-rotate-y', '0deg');
    card.style.setProperty('--card-shift-x', '0px');
    card.style.setProperty('--card-shift-y', '0px');
    card.style.setProperty('--card-lift', '0px');
    card.style.setProperty('--card-light-opacity', '0');
    delete card.dataset.hover;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    const card = cardRef.current;
    if (!card) return;
    // Measure the stationary wrapper so the tilt cannot feed back into pointer position.
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    card.style.setProperty('--card-light-x', `${x * 100}%`);
    card.style.setProperty('--card-light-y', `${y * 100}%`);
    card.dataset.hover = 'true';
    card.style.setProperty('--card-light-opacity', '1');
    card.style.setProperty('--card-rotate-x', `${(0.5 - y) * 14}deg`);
    card.style.setProperty('--card-rotate-y', `${(x - 0.5) * 14}deg`);
    card.style.setProperty('--card-shift-x', `${(x - 0.5) * 10}px`);
    card.style.setProperty('--card-shift-y', `${(y - 0.5) * 6}px`);
    card.style.setProperty('--card-lift', '-6px');
  }

  return <div className="login-glass-stage" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} onFocusCapture={reset} onKeyDownCapture={reset}>
    <div className="login-glass-card" ref={cardRef}>{children}</div>
  </div>;
}
