import type { ReactNode } from 'react';
import './HeroScene.css';

export default function HeroScene({ children }: { children: ReactNode }) {
  return (
    <section className="vv-hero briefing-hero">
      <div className="vv-hero__bg" aria-hidden="true">
        <img className="vv-hero__scene vv-hero__scene--light" src="/brand/workspace-hero.png" alt="" draggable={false} />
        <img className="vv-hero__scene vv-hero__scene--dark" src="/brand/workspace-hero.png" alt="" draggable={false} />
      </div>
      <div className="vv-hero__content">{children}</div>
    </section>
  );
}
