const { chromium } = require('./node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage();
 for(const [width,height] of [[1920,1080],[1366,768],[1024,700],[800,650],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4174');await page.waitForTimeout(500);
  console.log(JSON.stringify(await page.evaluate(()=>{const selectors=['.login-brand','.login-story','.login-campus','.login-capabilities','.login-technology-footer','.login-access-brand','.login-access-art','.login-card','.login-access-footer'];return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],bounds:selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]})}})));
  if(width===1366||width===390)await page.screenshot({path:`tmp/layout-qa/login-${width}.png`,fullPage:true});
 }
 await browser.close();
})();

