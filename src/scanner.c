#include "tree_sitter/parser.h"

#include <wctype.h>

enum TokenType {
    DESCENDANT_OP,
    PSEUDO_CLASS_SELECTOR_COLON,
    ERROR_RECOVERY,
    CONCAT,
    MAP_KEY,
};

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

void *tree_sitter_scss_external_scanner_create() { return NULL; }

void tree_sitter_scss_external_scanner_destroy(void *payload) {}

void tree_sitter_scss_external_scanner_reset(void *payload) {}

unsigned tree_sitter_scss_external_scanner_serialize(void *payload, char *buffer) { return 0; }

void tree_sitter_scss_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

// Advances past an interpolation body: the lookahead is the opening brace, and on return it is the
// character after the matching closing brace.
static void skip_interpolation(TSLexer *lexer) {
    int depth = 0;
    do {
        if (lexer->lookahead == '{') {
            depth++;
        } else if (lexer->lookahead == '}') {
            depth--;
        }
        advance(lexer);
    } while (depth > 0 && !lexer->eof(lexer));
}

// Scans a bare-word map key: identifier characters followed, after optional whitespace, by a single
// colon. The token ends before the colon. The base grammar's plain value token would otherwise
// swallow the colon (`key:` is a valid plain value), so the key has to be recognized here.
static bool scan_map_key(TSLexer *lexer) {
    while (iswspace(lexer->lookahead)) {
        skip(lexer);
    }
    if (!(iswalpha(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '-')) {
        return false;
    }
    while (iswalnum(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '-') {
        advance(lexer);
    }
    lexer->mark_end(lexer);
    while (iswspace(lexer->lookahead)) {
        advance(lexer);
    }
    if (lexer->lookahead != ':') {
        return false;
    }
    advance(lexer);
    if (lexer->lookahead == ':') {
        return false;
    }
    lexer->result_symbol = MAP_KEY;
    return true;
}

bool tree_sitter_scss_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[ERROR_RECOVERY]) {
        return false;
    }

    if (valid_symbols[CONCAT]) {
        if (iswalnum(lexer->lookahead) || lexer->lookahead == '#' || lexer->lookahead == '-') {
            lexer->result_symbol = CONCAT;
            if (lexer->lookahead == '#') {
                lexer->mark_end(lexer);
                advance(lexer);
                return lexer->lookahead == '{';
            }
            return true;
        }
    }

    if (iswspace(lexer->lookahead) && valid_symbols[DESCENDANT_OP]) {
        lexer->result_symbol = DESCENDANT_OP;

        skip(lexer);
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }
        lexer->mark_end(lexer);

        if (lexer->lookahead == '#' || lexer->lookahead == '.' || lexer->lookahead == '[' || lexer->lookahead == '-' ||
            lexer->lookahead == '*' || lexer->lookahead == '&' || iswalnum(lexer->lookahead)) {
            return true;
        }

        if (lexer->lookahead == ':') {
            advance(lexer);
            if (iswspace(lexer->lookahead)) {
                return false;
            }
            for (;;) {
                if (lexer->lookahead == ';' || lexer->lookahead == '}' || lexer->eof(lexer)) {
                    return false;
                }
                if (lexer->lookahead == '{') {
                    return true;
                }
                advance(lexer);
            }
        }
    }

    if (valid_symbols[PSEUDO_CLASS_SELECTOR_COLON]) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }
        if (lexer->lookahead == ':') {
            advance(lexer);
            if (lexer->lookahead == ':') {
                return false;
            }
            // Whitespace after the colon means a declaration: `font: { family: x; }` is a nested
            // property block, not a pseudo class selector.
            if (iswspace(lexer->lookahead)) {
                return false;
            }
            lexer->mark_end(lexer);
            // We need a { to be a pseudo class selector, a ; indicates a property. A { that opens
            // an interpolation (#{...}) is part of a value and is skipped.
            int32_t previous = ':';
            while (lexer->lookahead != ';' && lexer->lookahead != '}' && !lexer->eof(lexer)) {
                previous = lexer->lookahead;
                advance(lexer);
                if (lexer->lookahead == '{') {
                    if (previous != '#') {
                        lexer->result_symbol = PSEUDO_CLASS_SELECTOR_COLON;
                        return true;
                    }
                    skip_interpolation(lexer);
                }
            }
            return false;
        }
    }

    if (valid_symbols[MAP_KEY]) {
        return scan_map_key(lexer);
    }

    return false;
}
