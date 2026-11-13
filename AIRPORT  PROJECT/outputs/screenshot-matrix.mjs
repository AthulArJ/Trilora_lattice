import { createRequire } from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('C:/Users/athul/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-sandbox']});
for (const width of [1440,1920]) {
 const p=await b.newPage({viewport:{width,height:1100},deviceScaleFactor:1});
 await p.route('**/*',async r=>{const u=r.request().url();if(new URL(u).pathname.endsWith('/src/main.tsx'))return r.continue({url:u.replace('/src/main.tsx','/src/screenshot.tsx')});if(u.includes('localhost:4000')||u.includes('supabase.co'))return r.abort();return r.continue()});
 await p.goto('http://127.0.0.1:4176/',{waitUntil:'networkidle',timeout:20000});
 await p.mouse.move(4,4);await p.screenshot({path:`outputs/arctic-landing-empty-${width}.png`,fullPage:true});
 await p.getByRole('button',{name:/Preview sample data/i}).click();await p.waitForTimeout(650);await p.mouse.move(4,4);await p.screenshot({path:`outputs/arctic-landing-sample-${width}.png`,fullPage:true});
 await p.getByRole('button',{name:/View workforce/i}).click();await p.waitForTimeout(600);await p.mouse.move(4,4);await p.screenshot({path:`outputs/arctic-workforce-donut-${width}.png`,fullPage:true});
 for(const [name,re] of [['treemap',/Treemap/i],['bars',/Bars/i],['donut2',/Donut/i]]){await p.getByRole('button',{name:re}).click();await p.waitForTimeout(550);await p.mouse.move(4,4);await p.screenshot({path:`outputs/arctic-workforce-${name}-${width}.png`,fullPage:true});}
 const d=await p.evaluate(()=>{const w=document.querySelector('.wi-donut'),svg=w?.querySelector(':scope > svg'),g=svg?.querySelector('g'),center=w?.querySelector('.wi-donut-center'),r=x=>{if(!x)return null;const q=x.getBoundingClientRect();return{x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height)}},txt=center?.innerText;return{width:innerWidth,donut:r(w),svg:r(svg),track:r(svg?.querySelector('.wi-donut-track')),segmentCount:svg?.querySelectorAll('.wi-donut-segment').length,groupTransform:getComputedStyle(g).transform,center:r(center),centerText:txt,ghost:getComputedStyle(w,'::before').content,colors:['--bg','--surface','--surface-raised','--accent'].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue(k).trim()])}});console.log(JSON.stringify(d));await p.close();
}
await b.close();
