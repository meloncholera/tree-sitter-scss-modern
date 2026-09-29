# tree-sitter-scss-modern

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for current SCSS syntax.

This project is a maintained fork of
[`tree-sitter-grammars/tree-sitter-scss`](https://github.com/tree-sitter-grammars/tree-sitter-scss), licensed
under MIT. It adds the Sass module system (`@use` and `@forward` options), maps, variable flags, boolean
operators, and other current syntax the original does not parse, keeping the original's node kinds.

## Using it

```sh
cargo add tree-sitter tree-sitter-scss-modern
```

```rust
let mut parser = tree_sitter::Parser::new();
let language = tree_sitter_scss_modern::LANGUAGE;
parser
    .set_language(&language.into())
    .expect("Error loading current SCSS syntax parser");
```

```sh
npm install tree-sitter-scss-modern
```

```js
import Parser from 'tree-sitter';
import Language from 'tree-sitter-scss-modern';

const parser = new Parser();
parser.setLanguage(Language);
```

A GitHub Packages copy is also published as `@meloncholera/tree-sitter-scss-modern`.

## Building

```sh
npm install --ignore-scripts
npx --yes --package=tree-sitter-cli@0.27.0 -- tree-sitter generate
cargo build
```

The generated parser (`src/parser.c`, `src/grammar.json`, and `src/node-types.json`) is committed.
Regenerate and commit the diff after every `grammar.js` change.

## Testing

```sh
CC=gcc CXX=g++ npx --yes --package=tree-sitter-cli@0.27.0 -- tree-sitter test
cargo test
```

On Windows without MSVC, set `CC` and `CXX` to an installed GCC-compatible toolchain.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
