const fs=require('fs');const p='apps/web/src/brand.css';let s=fs.readFileSync(p,'utf8');let changed=0;
const hex={'250001':'101619','350508':'182125','41090d':'202C31','590004':'29383E','fcecbb':'EDF2F0','d5c99d':'A3B2B7','ffb607':'73B9A5','a91314':'73B9A5','236092':'88B3D4'};
const rgb={'37, 0, 1':'16, 22, 25','53, 5, 8':'24, 33, 37','65, 9, 13':'32, 44, 49','89, 0, 4':'41, 56, 62','252, 236, 187':'163, 178, 183','255, 182, 7':'115, 185, 165','169, 19, 20':'115, 185, 165','35, 96, 146':'136, 179, 212'};
s=s.replace(/([^{}]+)\{([^{}]*)\}/g,(full,selector,body)=>{
 if(!selector.includes('data-theme="dark"'))return full;
 let next=body.replace(/#(250001|350508|41090d|590004|fcecbb|d5c99d|ffb607|a91314|236092)\b/gi,(_,c)=>'#'+hex[c.toLowerCase()]);
 for(const [old,value] of Object.entries(rgb))next=next.split(old).join(value);
 if(next!==body)changed++;
 return selector+'{'+next+'}';
});
s=s.replace('Root beer, maroon and cream palette for the dark landing page only.','Graphite, muted teal and pearl palette for the dark landing page.');
s += `
/* Shared dark theme semantics: neutral surfaces, teal actions and distinct alerts. */
:is(.app-shell, .operations-hub-standalone)[data-theme="dark"] {
  --readable-text: #EDF2F0; --readable-secondary: #A3B2B7;
  --vv-canvas: #101619; --vv-ink: #EDF2F0;
  --success: #75C69A; --warning: #D6AF68; --danger: #EF8D88; --info: #88B3D4;
}
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub {
  --border: #304047; --ops-border: #304047; --ops-border-strong: #496169;
  --accent: #73B9A5; --accent-rgb: 115, 185, 165; --teal: #73B9A5;
  --success: #75C69A; --warning: #D6AF68; --danger: #EF8D88; --info: #88B3D4;
}
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.briefing-location svg, .card-kicker) { color: #C8B58D !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.briefing-connection-notice, .briefing-source.is-demo) { color: #D6AF68 !important; background: #D6AF6810 !important; border-color: #D6AF6833 !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.briefing-connection-notice, .briefing-source.is-demo) :is(b, strong, small, svg) { color: #D6AF68 !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub .briefing-source.is-demo > i { background: #D6AF68 !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.briefing-live-meta i.is-live, .briefing-source.is-live > i) { background: #75C69A !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.is-sos, .is-critical, .is-danger, .incident-open, .status-danger) { color: #EF8D88 !important; border-color: #EF8D8840 !important; background-color: #EF8D8810 !important; }
.operations-hub-standalone[data-theme="dark"]:has(> .operations-hub) > .operations-hub :is(.is-sos, .is-critical, .is-danger, .incident-open, .status-danger) :is(b, strong, small, svg) { color: #EF8D88 !important; }
`;
fs.writeFileSync(p,s);console.log('Dark palette rule blocks updated:',changed);
