# tree-sitter-scss design

**Status:** In progress. M0 through M4 are done (zero problem nodes across the real corpus and `examples/*.scss`); M5 (publish and adopt) remains.
**Date:** 2026-09-24
**Implementation language:** JavaScript (grammar definition) + C (generated parser and external
scanner) + Rust and TypeScript bindings, following the shape of the other tree-sitter grammar
repositories under this projects root (`tree-sitter-mssql`, `tree-sitter-snowflake`,
`tree-sitter-mulesoft`)

## Decision summary

This repository is a new grammar based on `tree-sitter-grammars/tree-sitter-scss` (MIT), which
adds the SCSS syntax the original does not parse. `cadence` depends on the original crate
(`tree-sitter-scss` 1.0.0, published 2024-04) for its structural SCSS profile, and too much
current SCSS fails to parse for the profile's metrics to be trusted.

The original grammar is itself built on `tree-sitter-css`, and it lags the current Sass language:
the module system (`@use`/`@forward` options), maps, variable flags, boolean operators, and several
at-rules are missing. It is maintained, but slowly — the grammar rules have not changed since the
1.0.0 release.

Fixes should be offered upstream first, one pull request per construct. This repository exists so
consumers are not blocked while those land, and is retired if upstream takes the fixes and
publishes a new release.

## Measured gaps

A probe of 40 common SCSS constructs against 1.0.0 found 20 that produce `ERROR` nodes:

| Area | Fails to parse |
|---|---|
| Module system | `@use "x" as m;`, `@use "x" with ($a: 1);`, `@forward "x" show a;`, `@forward "x" as p-*;` |
| Variables | `!default` and `!global` flags; maps `(a: 1, b: 2)`, including nested maps |
| Control flow | `not`, `and`, and `or` in `@if` conditions; `@for ... to` (only `through` parses); `@each` destructuring more than two variables |
| Mixins | rest arguments `$args...`; `@include m using ($x) { ... }` |
| Selectors | `@extend %placeholder` and `@extend ... !optional` (the placeholder definition itself parses); `@at-root` |
| Other | nested properties `font: { family: x; }`; interpolation inside `calc()`; `@import "a", "b";` |

On a real corpus of 182 tracked `.scss` files from an internal Angular application, 51 files (28%)
parse with errors. The most common error start points are `@use ... as` (36), stray `;` and `}`
after an earlier failure, `@media` query forms (17), `@container` queries (5), and custom property
declarations.

### Parse-rate baseline

`test/parse-rate.mjs <directory>` parses every `.scss` file under a directory and lists the files
with `ERROR`, `MISSING`, or zero-width nodes, plus the most common source text at the start of those
nodes. The real corpus is not stored in this repository; pass its checkout directory (or set
`SCSS_CORPUS_DIR`). Set `TREE_SITTER_CLI` to the CLI binary when it is not on `PATH`.

Baseline with the inherited grammar (`tree-sitter-css` 0.20.0 base, unchanged rules), measured
against the 182-file corpus: 131 clean, 51 with problems (28.0%). Most common problem start points:
`as *;` in `@use ... as *` (72 nodes), zero-width nodes at `;` (36), stray `}` (32), and `@media`
range queries such as `(width <= 768px)` (about 30 nodes).

The 40-construct probe list is recorded as corpus tests in `test/corpus/probes.txt`. Constructs that
already parsed are there from the start; each failing construct is added in the same change that
fixes it.

### Progress against the real corpus

| Step | Files with problems | Change |
|---|---|---|
| Baseline | 51 of 182 (28.0%) | Inherited grammar |
| M1: module system, flags, maps | 33 of 182 (18.1%) | `@use`/`@forward` clauses, `!default`/`!global`, maps (bare-word keys need an external scanner token because the base plain value token swallows a trailing colon), and a `last_declaration` that accepts variable and interpolated names |
| M2: control flow and mixins | 33 of 182 (18.1%) | `not`/`and`/`or` with Sass operator precedence, `@for ... to`, multi-variable `@each`, rest and spread arguments, `@include ... using`, keyword arguments in calls. The real corpus uses none of these constructs, so its rate does not move |
| M3: `@media` range queries (`(width <= 768px)`) | 16 of 182 (8.8%) | New `range_query` in `_query`, so plain CSS gains it too |
| M3: `@container` | 11 of 182 (6.0%) | New `container_statement` with an optional `container_name` |
| M3: keyframe selector lists (`0%, 100%`) | 8 of 182 (4.4%) | `keyframe_block` takes a comma-separated list |
| M3: `@extend %placeholder` and `!optional` | 5 of 182 (2.7%) | `extend_statement` takes placeholders and a trailing `flag` |
| M3: interpolation in values | 3 of 182 (1.6%) | The scanner's pseudo-class lookahead skips `#{...}` (its brace was read as the start of a block), and `plain_value` no longer swallows the `#` of an interpolation |
| M3: `:nth-child(n + 3)` | 1 of 182 (0.5%) | New `nth_expression` token for the `an+b` form |
| M3: leading combinators (`> td`) | 0 of 182 (0.0%) | The three combinator selectors accept a missing left operand, which removes a zero-width node |
| M3: no corpus impact | 0 of 182 (0.0%) | `@at-root` block and selector forms, nested properties (a colon followed by whitespace is never a pseudo-class colon), multi-file `@import`, `@include m()`, range values with interpolation |
| M4: corpus pass | 0 of 182 (0.0%) | No corpus construct is invalid SCSS, so nothing was excluded. Also parses: a `!default` flag inside a `@forward ... with` map, and a spread in `@content ($args...)`. `examples/modern.scss` covers the added syntax so the example parse step in CI gates it |

Constructs that already parse and must keep parsing: `@mixin`/`@function` with default and keyword
arguments, `@content` with arguments, `@include` with a content block, `@if`/`@else if`/`@else`,
`@each` over a map with key and value, `@for ... through`, `@while`, `@return`, placeholders in
selector lists, `&` suffixes, interpolation in selectors and property names, module function calls
(`math.div`), `@debug`, and `//` comments.

## Approach

1. **Start from the original.** Import `tree-sitter-grammars/tree-sitter-scss` at its latest commit
   with history, so upstream changes can still be merged, and credit it in `NOTICE`.
2. **Add the missing syntax as new rules**, keeping every existing node kind and field name
   unchanged, so `cadence`'s profile (`mixin_statement`, `function_statement`, `if_statement`,
   `else_if_clause`, `each_statement`, `for_statement`, `while_statement`, `parameters`, `block`,
   `comment`, `js_comment`) works without changes.
3. **Check the base CSS rules too.** Some failures (`@container`, several `@media` forms, custom
   properties) come from the inherited `tree-sitter-css` rules rather than SCSS additions. Fix them
   in the base rules so plain CSS gains them as well. Keep `//` comments: they are valid SCSS, unlike
   plain CSS (see the `tree-sitter-css` fork design).
4. **Measure against a corpus** after each construct: the probe list above as corpus tests, plus a
   parse-rate script over the real corpus, recorded as a baseline the way `tree-sitter-snowflake`
   does.

## Milestones

1. **M0 — repository scaffold.** Import the original, add `NOTICE`, `AGENTS.md`, a verify workflow
   matching the other grammar repositories, and a parse-rate script with the 28% error baseline.
2. **M1 — module system and variables.** `@use` `as`/`with`, `@forward` `show`/`hide`/`as`,
   `!default`/`!global`, and maps. This is most of the real-corpus failures.
3. **M2 — control flow and mixins.** Boolean operators, `@for ... to`, multi-variable `@each`, rest
   arguments, `@include ... using`.
4. **M3 — selectors and remaining at-rules.** `@extend %placeholder`, `!optional`, `@at-root`,
   nested properties, `@container`, the failing `@media` forms, custom properties, `calc()`
   interpolation, multi-file `@import`.
5. **M4 — corpus pass.** Zero `ERROR`/`MISSING` nodes across the real corpus.
6. **M5 — publish and adopt.** A crates.io release under a distinct name, or a Git-revision pin while
   publishing is pending, as `tree-sitter-mulesoft` did. Switch `cadence`'s SCSS profile to it.

## First upstream pull request

The first pull request to `tree-sitter-grammars/tree-sitter-scss` (not opened yet) would contain
only `@for ... to`: a `to` alternative next to `through` in `for_statement` (the new value is a
`to` field, so the existing `through` field is untouched), the regenerated `src/parser.c`,
`src/grammar.json`, and `src/node-types.json`, and a corpus case in `test/corpus/statements.txt`
covering `@for $i from 1 to 3`. It needs no scanner change and no other rule.

## Open questions

1. Will upstream review pull requests at a pace that makes a separate repository unnecessary? Try
   one small fix (`@for ... to`) first and decide from the response.
2. What name does the published crate use? `tree-sitter-scss` is taken by the original on crates.io
   and npm.
3. Should the base CSS fixes be shared with the `tree-sitter-css` fork rather than made twice, for
   example by having this grammar extend that fork instead of upstream `tree-sitter-css`?

   Evaluated during M3. `tree-sitter-css-strict` is an ESM `export default grammar({...})` whose
   `grammar.js` ships in the package, so it can be extended the same way as upstream
   `tree-sitter-css`; its three external tokens match the base grammar's, so the scanner is
   unchanged. It drops `//` comments (its `extras` list holds only `comment`); an extension has to
   add back an `extras` entry and a `js_comment` rule (a few lines). In a scratch copy with that
   change, the whole real corpus parses with zero problems, and `@scope` parses (it does not with
   the current base). Unquoted relative `url(../x)` still fails in both, because this grammar's
   argument and plain value overrides shadow the base handling. The generated parser is about 12
   percent larger. **Recommendation: stay on upstream `tree-sitter-css` 0.20.0 for now.** The
   strict fork is at 0.1.0, so this grammar's node kinds would depend on a second in-flux
   repository, and the corpus already parses cleanly without it. The base rules changed here
   (`@container`, range queries, keyframe lists, `plain_value`) are overrides in this repository,
   so nothing is made twice. Revisit when the fork stabilizes: switching is a one-line import plus
   the `js_comment` extra, and the corpus and probe tests would show any regression.
4. Which GitHub owner hosts the repository — the personal account like the other grammar
   repositories, or `CF-Martin-co`?
