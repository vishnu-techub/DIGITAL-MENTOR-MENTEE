/**
 * Copy the licensed grammar vocabulary data into the compiled output.
 * -------------------------------------------------------------------
 * `tsc` only emits JavaScript, so the two data files that back the
 * dictionary-gated spelling/validation layer would be missing from `dist/`.
 * This runs automatically as npm's `postbuild` step.
 *
 * It is intentionally forgiving: if a source file is absent (e.g. a checkout
 * that has not downloaded the data yet) it logs a warning and exits 0, so a
 * build never fails because of optional data. The lexicon degrades gracefully
 * when the data is missing (see src/modules/grammar/vocabulary/lexicon.ts).
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'modules', 'grammar', 'vocabulary', 'data');
const DEST = path.join(__dirname, '..', 'dist', 'modules', 'grammar', 'vocabulary', 'data');

const FILES = ['words_alpha.txt', 'en_50k.txt', 'SOURCES.md'];

if (!fs.existsSync(SRC)) {
  console.warn(`[copy-grammar-data] source directory not found: ${SRC} (skipping)`);
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const from = path.join(SRC, file);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-grammar-data] missing ${file} (skipping)`);
    continue;
  }
  fs.copyFileSync(from, path.join(DEST, file));
  copied += 1;
}

console.log(`[copy-grammar-data] copied ${copied} file(s) to ${path.relative(process.cwd(), DEST)}`);
