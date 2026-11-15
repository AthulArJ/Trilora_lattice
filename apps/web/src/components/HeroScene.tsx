import type { ReactNode } from 'react';
import './HeroScene.css';

export default function HeroScene({ children }: { children: ReactNode }) {
  return (
    <section className="vv-hero briefing-hero vv-hero--isometric vv-hero--panorama">
      <div className="vv-hero__bg" aria-hidden="true">
        <div className="vv-hero__atmosphere" />
        <svg className="vv-hero__routes" viewBox="0 0 1600 300" preserveAspectRatio="none" focusable="false">
          <g className="vv-hero__route-lines">
            <path d="M320 270 500 198 620 198 820 118 1410 118 1550 62" />
            <path d="M510 300 700 224 920 224 1125 142 1550 142" />
            <path d="M400 70 540 30 740 30 900 90" />
            <path d="M830 300 1040 216 1290 216 1530 120" />
          </g>
          <g className="vv-hero__route-pulses">
            <path pathLength="100" d="M320 270 500 198 620 198 820 118 1410 118 1550 62" />
            <path pathLength="100" d="M510 300 700 224 920 224 1125 142 1550 142" />
            <path pathLength="100" d="M400 70 540 30 740 30 900 90" />
          </g>
        </svg>
      </div>
      <img className="vv-hero__architecture" src="/brand/workspace-integrated-campus-v9.png" alt="" aria-hidden="true" draggable={false}/>
      <div className="vv-hero__content">{children}</div>
    </section>
  );
}














