// Runs automatically before every build (npm "prebuild").
// Copies fit-rules.txt into a JS constant so the rulebook is always bundled,
// even if the file itself were missing from the serverless bundle.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'fit-rules.txt');
const out = path.join(root, 'lib', 'fitRulesText.generated.js');

if (!fs.existsSync(src)) {
  console.error('fit-rules.txt is missing from the project root. The build cannot continue.');
  process.exit(1);
}
const text = fs.readFileSync(src, 'utf8');
fs.writeFileSync(
  out,
  '// AUTO-GENERATED from fit-rules.txt by scripts/embed-rules.mjs. Do not edit by hand.\n' +
    `export const FIT_RULES_EMBEDDED = ${JSON.stringify(text)};\n`
);
console.log(`Embedded fit-rules.txt (${text.length} characters) into lib/fitRulesText.generated.js`);
