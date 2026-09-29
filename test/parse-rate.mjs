// Parses every .scss file under a directory with the tree-sitter CLI and reports the files whose
// tree contains an ERROR node, a MISSING node, or a zero-width node, plus the most common source
// text at the start of those nodes.
//
// Usage: node test/parse-rate.mjs <directory> [--top N] [--list]
//
// The directory may also come from the SCSS_CORPUS_DIR environment variable. TREE_SITTER_CLI names
// the CLI binary (default `tree-sitter`). The CLI compiles the parser on first use, so a machine
// without MSVC needs CC and CXX set (for example CC=gcc CXX=g++). Run `tree-sitter generate`
// first: the CLI parses with the grammar in this repository's root.
//
// Exits 1 when any file has a problem, so the script can gate a corpus.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = process.env.TREE_SITTER_CLI ?? 'tree-sitter';
const skippedDirs = new Set(['node_modules', '.git', 'dist', 'target']);
const newline = String.fromCharCode(10);

function parseArgs(argv) {
  const options = { dir: process.env.SCSS_CORPUS_DIR, top: 15, list: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--top') options.top = Number(argv[++i]);
    else if (argv[i] === '--list') options.list = true;
    else options.dir = argv[i];
  }
  return options;
}

function findScssFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) files.push(...findScssFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.scss')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files.sort();
}

// Returns the [row, column] start of every ERROR, MISSING, and zero-width node in a parse tree.
function findProblems(treeLines) {
  const problems = [];
  for (const line of treeLines) {
    const node = /^\s*\((\w+|MISSING[^[]*)\s*\[(\d+), (\d+)\] - \[(\d+), (\d+)\]/.exec(line);
    if (!node) continue;
    const [, kind, row, col, endRow, endCol] = node;
    const start = [Number(row), Number(col)];
    if (kind === 'ERROR') problems.push({ type: 'ERROR', start });
    else if (kind.startsWith('MISSING')) problems.push({ type: 'MISSING', start });
    else if (kind !== 'stylesheet' && row === endRow && col === endCol) {
      problems.push({ type: 'zero-width', start });
    }
  }
  return problems;
}

// A short, whitespace-collapsed excerpt of the source at a problem's start position.
function excerpt(sourceLines, [row, col]) {
  const text = (sourceLines[row] ?? '').slice(col).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text.slice(0, 24) : '(end of line)';
}

// Parses all files in one CLI run (the CLI prints each file's tree followed by a timing line that
// contains "Parse:") and returns the problem list for each file, in input order.
function parseFiles(files) {
  const listFile = path.join(mkdtempSync(path.join(tmpdir(), 'scss-parse-rate-')), 'paths.txt');
  writeFileSync(listFile, files.join(newline) + newline);
  try {
    const result = spawnSync(cli, ['parse', '--time', '--paths', listFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const problems = [];
    let tree = [];
    for (const line of result.stdout.split(newline)) {
      if (line.includes('Parse:')) {
        problems.push(findProblems(tree));
        tree = [];
      } else {
        tree.push(line);
      }
    }
    if (problems.length !== files.length) {
      throw new Error(`expected ${files.length} parse results, got ${problems.length}`);
    }
    return problems;
  } finally {
    rmSync(path.dirname(listFile), { recursive: true, force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
if (!options.dir) {
  console.error('usage: node test/parse-rate.mjs <directory> [--top N] [--list]');
  process.exit(2);
}

const files = findScssFiles(path.resolve(options.dir));
if (files.length === 0) {
  console.error(`no .scss files under ${options.dir}`);
  process.exit(2);
}

const failing = [];
const startPoints = new Map();
const allProblems = parseFiles(files);
for (const [index, file] of files.entries()) {
  const problems = allProblems[index];
  if (problems.length === 0) continue;
  const sourceLines = readFileSync(file, 'latin1').split(/\r?\n/);
  failing.push({ file, problems });
  for (const problem of problems) {
    const key = `${problem.type} at ${excerpt(sourceLines, problem.start)}`;
    startPoints.set(key, (startPoints.get(key) ?? 0) + 1);
  }
}

const percent = ((failing.length / files.length) * 100).toFixed(1);
console.log(`files: ${files.length}`);
console.log(`clean: ${files.length - failing.length}`);
console.log(`with ERROR/MISSING/zero-width nodes: ${failing.length} (${percent}%)`);

if (options.list) {
  console.log('\nfiles with problems:');
  for (const { file, problems } of failing) {
    const first = problems[0];
    const where = `${first.start[0] + 1}:${first.start[1] + 1}`;
    console.log(
      `  ${path.relative(options.dir, file)}  ${problems.length} problem(s), first ${first.type} at ${where}`,
    );
  }
}

const ranked = [...startPoints.entries()].sort((a, b) => b[1] - a[1]).slice(0, options.top);
if (ranked.length > 0) {
  console.log('\nmost common problem start points:');
  for (const [key, count] of ranked) console.log(`  ${String(count).padStart(4)}  ${key}`);
}

process.exit(failing.length === 0 ? 0 : 1);
