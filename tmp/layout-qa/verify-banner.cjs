const fs=require('fs');
const path=require('path');
const {chromium}=require('./node_modules/playwright');
(async()=>{
 const repo='C:/Users/athul/Documents/Codex/CIAL PROJECT/Trilora_lattice';
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const p=await b.newPage();
 const styles=['styles.css','operations-hub.css','brand.css','components/HeroScene.css'].map(x=>fs.readFileSync(path.join(repo,'apps/web/src',x),'utf8')).join('\n');
 const bg=path.join(repo,'apps/web/public/brand/workspace-hero-campus-backdrop.png').replace(/\\/g,'/');
 const art=path.join(repo,'apps/web/public/brand/workspace-integrated-campus-v11.png').replace(/\\/g,'/');
 const css=styles.replaceAll("url('/brand/workspace-hero-campus-backdrop.png')",`url('file:///${bg}')`);
 const html=`<style>${css}</style><div class="operations-hub-standalone" data-theme="light"><main class="operations-hub"><header class="briefing-header"><div class="briefing-brand">LATTICE</div><div class="briefing-location">Operations Workspace</div><div class="briefing-header-actions"><div class="briefing-header-controls"><button>Light mode</button><span class="briefing-source">Sample workspace</span></div><span class="briefing-user">S</span><button>Sign out</button></div></header><section class="vv-hero briefing-hero vv-hero--isometric vv-hero--panorama"><div class="vv-hero__field" aria-hidden="true">
        <div class="vv-hero__atmosphere"></div>
        <svg class="vv-hero__routes" viewBox="0 0 1600 300" preserveAspectRatio="none" focusable="false">
          <g class="vv-hero__route-lines">
            <path d="M320 270 500 198 620 198 820 118 1410 118 1550 62" />
            <path d="M510 300 700 224 920 224 1125 142 1550 142" />
            <path d="M400 70 540 30 740 30 900 90" />
            <path d="M830 300 1040 216 1290 216 1530 120" />
          </g>
          <g class="vv-hero__route-pulses">
            <path pathLength="100" d="M320 270 500 198 620 198 820 118 1410 118 1550 62" />
            <path pathLength="100" d="M510 300 700 224 920 224 1125 142 1550 142" />
            <path pathLength="100" d="M400 70 540 30 740 30 900 90" />
          </g>
        </svg>
      </div><img class="vv-hero__architecture" src="file:///${art}"><div class="vv-hero__content"><div class="briefing-hero-content"><div class="briefing-date"><span class="briefing-date-label">Workspace operations</span><time>Saturday, 14 November 2026</time></div><h1>Good afternoon, Support</h1><p class="briefing-status-sentence">No active SOS alerts · RTLS awaiting commissioning</p><button class="briefing-overview-link">Enter operations console ↗</button><div class="briefing-live-meta"><span><small>Workspace</small><b>Sample feed</b></span><span><small>Positioning</small><b>Awaiting telemetry</b></span><span><small>Last refresh</small><b>Not refreshed yet</b></span></div></div></div></section></main></div>`;
 const f=path.join(repo,'tmp/layout-qa/render.html');fs.writeFileSync(f,html);
 for(const [w,h,theme] of [[1440,600,'light'],[1920,650,'light'],[390,844,'light']]){await p.setViewportSize({width:w,height:h});await p.goto('file:///'+f.replace(/\\/g,'/'));await p.evaluate(t=>document.querySelector('.operations-hub-standalone').dataset.theme=t,theme);await p.screenshot({path:`tmp/layout-qa/placement-${w}-${theme}.png`,fullPage:true});console.log(w,theme,await p.evaluate(()=>{const hero=document.querySelector('section').getBoundingClientRect(),meta=document.querySelector('.briefing-live-meta').getBoundingClientRect(),title=document.querySelector('h1').getBoundingClientRect(),field=document.querySelector('.vv-hero__field').getBoundingClientRect();return {hero:{top:hero.top,bottom:hero.bottom,height:hero.height},field:{top:field.top,bottom:field.bottom},chips:{top:meta.top,bottom:meta.bottom},title:{top:title.top,bottom:title.bottom},chipsClearOfTitle:meta.top>=title.bottom+8,overflow:document.documentElement.scrollWidth>innerWidth}}));}
 await b.close();
})();

















