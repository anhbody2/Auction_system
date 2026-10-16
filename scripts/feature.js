// Usage: node scripts/feature.js <id> <status> ["evidence line" ...]
// Updates feature_list.json in place: sets status and appends dated evidence lines.
const fs = require('fs');
const path = require('path');

const [id, status, ...evidence] = process.argv.slice(2);
const allowed = ['not_started', 'in_progress', 'blocked', 'passing'];
if (!id || !allowed.includes(status)) {
  console.error(`usage: node scripts/feature.js <id> <${allowed.join('|')}> [evidence...]`);
  process.exit(1);
}
if (status === 'passing' && evidence.length === 0) {
  console.error('passing requires at least one evidence line');
  process.exit(1);
}
const file = path.join(__dirname, '..', 'feature_list.json');
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const feature = list.features.find((f) => f.id === id);
if (!feature) {
  console.error(`unknown feature ${id}`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
feature.status = status;
feature.evidence.push(...evidence.map((e) => `${today} ${e}`));
list.last_updated = today;
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log(`${id} -> ${status}`);
