const fs = require('fs');
const postcss = require('postcss');
const obsolete = /\.(?:vv-hero[\w-]*|briefing-hero[\w-]*|briefing-live-meta|briefing-date[\w-]*|briefing-status-sentence|briefing-overview-link)(?![\w-])/;
function cleanSelector(selector) {
  let result = selector;
  // Remove only obsolete branches from shared :is/:where selectors.
  for (let pos = result.length - 1; pos >= 0; pos--) {
    const match = /^:(is|where)\(/.exec(result.slice(pos));
    if (!match) continue;
    const start = pos + match[0].length;
    let depth = 1, end = start;
    for (; end < result.length && depth; end++) {
      if (result[end] === '(') depth++;
      if (result[end] === ')') depth--;
    }
    const branches = postcss.list.comma(result.slice(start, end - 1)).map(cleanSelector).filter(Boolean);
    if (!branches.length) return null;
    result = result.slice(0, start) + branches.join(', ') + result.slice(end - 1);
  }
  return obsolete.test(result) ? null : result;
}
for (const file of ['apps/web/src/operations-hub.css', 'apps/web/src/brand.css']) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'));
  let removed = 0;
  root.walkRules(rule => {
    if (!obsolete.test(rule.selector)) return;
    const selectors = postcss.list.comma(rule.selector).map(cleanSelector).filter(Boolean);
    if (selectors.length) rule.selector = selectors.join(', ');
    else { rule.remove(); removed++; }
  });
  root.walkAtRules(rule => { if (rule.nodes && rule.nodes.length === 0) rule.remove(); });
  fs.writeFileSync(file, root.toString());
  console.log(file + ': removed ' + removed + ' obsolete hero rules');
}
