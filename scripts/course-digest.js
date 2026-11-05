// Builds lib/course-digest.json: the plain text of every lesson, slide and quiz question in public/app/js/course.js,
// for the AI Coach. Run after editing the course:  node scripts/course-digest.js
// The COURSE array is evaluated in a sandbox with stub helpers, so illustrations and app state are not needed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public/app/js/course.js'), 'utf8');
const body = src.slice(src.indexOf('export const COURSE = ['), src.indexOf('export const ALL ='))
  .replace(/export const /g, 'var ');
const V = new Proxy({}, { get: () => () => null });
const ctx = { V, C: '¢', T: (big, b) => ({ t: 'text', big, body: b }), q: (ask, opts, why, hint) => ({ t: 'q', ask, opts, why, hint }) };
vm.runInNewContext(body, ctx);

const days = ctx.COURSE.map(d => ({
  day: d.day, title: d.title,
  nodes: d.nodes.map(n => ({
    id: n.id, kind: n.kind, title: n.title,
    text: n.steps.map(s => s.t === 'q' ? `Q: ${s.ask} Answer: ${s.opts[0]}. ${s.why || ''}`.trim() : `${s.big} ${s.body || ''}`.trim()).join('\n')
  }))
}));
const out = { days, upcoming: ctx.UPCOMING };
fs.writeFileSync(path.join(__dirname, '..', 'lib/course-digest.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`lib/course-digest.json: ${days.length} days, ${days.reduce((a, d) => a + d.nodes.length, 0)} lessons and quizzes, ${JSON.stringify(out).length} chars`);
