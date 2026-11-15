import type { ReactNode } from 'react';
import './HeroScene.css';

export default function HeroScene({ children }: { children: ReactNode }) {
  return (
    <section className="industrial-hero" aria-label="Workspace briefing">
      <img className="industrial-hero__art industrial-hero__art--night" src="/brand/lattice-industrial-hero-clean.png" width={2172} height={558} alt="" aria-hidden="true" draggable={false} fetchPriority="high" />
      <img className="industrial-hero__art industrial-hero__art--day" src="/brand/lattice-industrial-hero-daylight.png" width={2172} height={558} alt="" aria-hidden="true" draggable={false} />
      <div className="industrial-hero__copy-finish" aria-hidden="true" />
      {children}
    </section>
  );
}
