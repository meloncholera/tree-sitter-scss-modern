/**
 * @file SCSS grammar for tree-sitter
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

import CSS from 'tree-sitter-css/grammar.js';

export default grammar(CSS, {
  name: 'scss',

  externals: ($, original) => original.concat([$._concat, $._map_key]),

  rules: {
    _top_level_item: ($, original) =>
      choice(
        original,
        $.postcss_statement,
        $.use_statement,
        $.forward_statement,
        $.mixin_statement,
        $.include_statement,
        $.function_statement,
        $.return_statement,
        $.extend_statement,
        $.error_statement,
        $.warn_statement,
        $.debug_statement,
        $.at_root_statement,
        $.container_statement,
        $.if_statement,
        $.each_statement,
        $.for_statement,
        $.while_statement,
      ),

    _block_item: ($, original) =>
      choice(
        original,
        $.nested_declaration,
        $.mixin_statement,
        $.include_statement,
        $.function_statement,
        $.return_statement,
        $.extend_statement,
        $.error_statement,
        $.warn_statement,
        $.debug_statement,
        $.at_root_statement,
        $.container_statement,
        $.if_statement,
        $.each_statement,
        $.for_statement,
        $.while_statement,
      ),

    // Selectors

    _selector: ($, original) =>
      choice(original, prec(-2, alias($._concatenated_identifier, $.tag_name)), $.placeholder),

    class_selector: ($) =>
      prec(
        1,
        seq(
          optional($._selector),
          choice('.', $.nesting_selector),
          alias(choice($.identifier, $._concatenated_identifier), $.class_name),
        ),
      ),

    pseudo_class_selector: ($) =>
      seq(
        optional($._selector),
        alias($._pseudo_class_selector_colon, ':'),
        alias(choice($.identifier, $._concatenated_identifier), $.class_name),
        optional(alias($.pseudo_class_arguments, $.arguments)),
      ),

    // A combinator may start a nested selector (`> td`, `+ .a`, `~ .b`); the parent selector is
    // implied, so the left operand is optional.
    child_selector: ($) => prec.left(seq(optional($._selector), '>', $._selector)),

    sibling_selector: ($) => prec.left(seq(optional($._selector), '~', $._selector)),

    adjacent_sibling_selector: ($) => prec.left(seq(optional($._selector), '+', $._selector)),

    pseudo_class_arguments: ($) =>
      seq(
        token.immediate('('),
        sep(',', choice($.nth_expression, $._selector, repeat1($._value))),
        ')',
      ),

    // The `an+b` form of `:nth-child()` and friends. A bare `n`, `2n`, or `odd` is not matched
    // here and keeps parsing as an ordinary word or number.
    nth_expression: (_) => token(/[-+]?[0-9]*[nN]\s*[-+]\s*[0-9]+/),

    // Declarations

    declaration: ($) =>
      seq(
        alias(choice($.identifier, $.variable, $._concatenated_identifier), $.property_name),
        ':',
        $._value,
        repeat(seq(optional(','), $._value)),
        optional($.important),
        repeat($.flag),
        ';',
      ),

    last_declaration: ($) =>
      prec(
        1,
        seq(
          alias(choice($.identifier, $.variable, $._concatenated_identifier), $.property_name),
          ':',
          $._value,
          repeat(seq(optional(','), $._value)),
          optional($.important),
          repeat($.flag),
        ),
      ),

    container_statement: ($) =>
      seq('@container', optional(alias($.identifier, $.container_name)), $._query, $.block),

    // Nested properties: `font: { family: x; }` and `font: bold { family: x; }`.
    nested_declaration: ($) =>
      seq(
        alias(choice($.identifier, $._concatenated_identifier), $.property_name),
        ':',
        optional(seq($._value, repeat(seq(optional(','), $._value)))),
        $.block,
      ),

    flag: (_) => choice('!default', '!global', '!optional'),

    keyframe_block: ($) =>
      seq(sep1(',', choice($.from, $.to, $.integer_value, $.float_value)), $.block),

    // The base token lets `#` continue a word, so `--a-#{$b}` would swallow the `#` of an
    // interpolation. Here a `#` continues a word only when it is not followed by `{`.
    plain_value: (_) =>
      token(
        seq(
          repeat(choice(/[-_]/, /\/[^\*\s,;!{}()\[\]]/)),
          /[a-zA-Z]/,
          repeat(choice(/[^/\s,;!{}()\[\]#]/, /\/[^\*\s,;!{}()\[\]]/, /#[^{/\s,;!}()\[\]]/)),
        ),
      ),

    import_statement: ($) =>
      seq('@import', $._value, repeat(seq(',', $.string_value)), sep(',', $._query), ';'),

    // Media queries

    _query: ($, original) => choice(original, prec(-1, $.interpolation), $.range_query),

    // A range media or container feature such as `(width <= 768px)` or `(400px <= width <= 700px)`.
    range_query: ($) =>
      seq(
        '(',
        choice(
          seq($._range_value, $._range_operator, alias($.identifier, $.feature_name)),
          seq(alias($.identifier, $.feature_name), $._range_operator, $._range_value),
          seq(
            $._range_value,
            $._range_operator,
            alias($.identifier, $.feature_name),
            $._range_operator,
            $._range_value,
          ),
        ),
        ')',
      ),

    _range_operator: (_) => choice('<', '<=', '>', '>=', '='),

    // Lower precedence than `_value` so an unknown at-rule followed by a parenthesized comparison
    // keeps parsing as ordinary values.
    _range_value: ($) =>
      prec(-2, choice($.integer_value, $.float_value, $.variable, $.interpolation)),

    // Property Values

    _value: ($, original) =>
      choice(
        original,
        prec(-1, choice($.nesting_selector, $._concatenated_identifier, $.list_value)),
        $.map_value,
        $.unary_expression,
        $.variable,
      ),

    use_statement: ($) =>
      seq('@use', $._value, optional($.as_clause), optional($.with_clause), ';'),

    forward_statement: ($) =>
      seq(
        '@forward',
        $._value,
        optional($.as_clause),
        optional(choice($.show_clause, $.hide_clause)),
        optional($.with_clause),
        ';',
      ),

    as_clause: ($) =>
      seq(
        'as',
        choice('*', seq(alias($.identifier, $.namespace_name), optional(token.immediate('*')))),
      ),

    with_clause: ($) => seq('with', $.map_value),

    show_clause: ($) => seq('show', sep1(',', choice($.identifier, $.variable))),

    hide_clause: ($) => seq('hide', sep1(',', choice($.identifier, $.variable))),

    map_value: ($) => seq('(', sep1(',', $.map_pair), optional(','), ')'),

    map_pair: ($) =>
      seq(
        field('key', choice(alias($._map_key, $.plain_value), $._value)),
        ':',
        repeat1(field('value', $._value)),
        optional($.flag),
      ),

    mixin_statement: ($) =>
      seq('@mixin', field('name', $.identifier), optional($.parameters), $.block),

    include_statement: ($) =>
      seq(
        '@include',
        choice($.identifier, alias($.plain_value, $.identifier)),
        optional(alias($._include_arguments, $.arguments)),
        choice(seq(optional(seq('using', $.parameters)), $.block), ';'),
      ),

    _include_arguments: ($) =>
      seq(
        token.immediate('('),
        sep(',', alias($._include_argument, $.argument)),
        token.immediate(')'),
      ),

    _include_argument: ($) =>
      seq(optional(seq(field('name', $.variable), ':')), field('value', $._value), optional('...')),

    function_statement: ($) =>
      seq('@function', field('name', $.identifier), optional($.parameters), $.block),

    parameters: ($) => seq('(', sep1(',', $.parameter), ')'),

    parameter: ($) =>
      seq($.variable, optional(choice(seq(':', field('default', $._value)), '...'))),

    return_statement: ($) => seq('@return', $._value, ';'),

    extend_statement: ($) =>
      seq(
        '@extend',
        sep1(',', choice($._value, $.class_selector, $.placeholder)),
        optional($.flag),
        ';',
      ),

    error_statement: ($) => seq('@error', $._value, ';'),

    warn_statement: ($) => seq('@warn', $._value, ';'),

    debug_statement: ($) => seq('@debug', $._value, ';'),

    at_root_statement: ($) => seq('@at-root', optional(choice($._value, $.selectors)), $.block),

    if_statement: ($) =>
      seq(
        '@if',
        field('condition', $._value),
        $.block,
        repeat($.else_if_clause),
        optional($.else_clause),
      ),

    else_if_clause: ($) => seq('@else', 'if', field('condition', $._value), $.block),

    else_clause: ($) => seq('@else', $.block),

    each_statement: ($) =>
      seq(
        '@each',
        choice(
          field('value', $.variable),
          seq(field('key', $.variable), repeat1(seq(',', field('value', $.variable)))),
        ),
        'in',
        $._value,
        repeat(seq(optional(','), $._value)),
        $.block,
      ),

    for_statement: ($) =>
      seq(
        '@for',
        $.variable,
        'from',
        field('from', $._value),
        choice(seq('through', field('through', $._value)), seq('to', field('to', $._value))),
        $.block,
      ),

    while_statement: ($) => seq('@while', $._value, $.block),

    arguments: ($) =>
      seq(
        token.immediate('('),
        sep(
          choice(',', ';'),
          seq(optional(seq(field('name', $.variable), ':')), repeat1($._value), optional('...')),
        ),
        ')',
      ),

    call_expression: ($) =>
      seq(alias(choice($.identifier, $.plain_value), $.function_name), $.arguments),

    // Operator precedence follows Sass: unary, then multiplication and division, then addition and
    // subtraction, relational, equality, `and`, and `or`.
    binary_expression: ($) =>
      choice(
        prec.left(7, seq($._value, choice('*', '/'), $._value)),
        prec.left(6, seq($._value, choice('+', '-'), $._value)),
        prec.left(5, seq($._value, choice('<', '>', '<=', '>='), $._value)),
        prec.left(4, seq($._value, choice('==', '!='), $._value)),
        prec.left(3, seq($._value, 'and', $._value)),
        prec.left(2, seq($._value, 'or', $._value)),
      ),

    unary_expression: ($) => prec(8, seq('not', $._value)),

    // `@content ($args...)` passes a spread through the base rule for a parenthesized value.
    parenthesized_value: ($) => seq('(', $._value, optional('...'), ')'),

    list_value: ($) => seq('(', sep2(',', $._value), ')'),

    interpolation: ($) => seq('#{', $._value, '}'),

    placeholder: ($) => seq('%', $.identifier),

    _concatenated_identifier: ($) =>
      choice(
        seq(
          $.identifier,
          repeat1(
            seq(
              $._concat,
              choice($.interpolation, $.identifier, alias(token.immediate('-'), $.identifier)),
            ),
          ),
        ),
        seq(
          $.interpolation,
          repeat(
            seq(
              $._concat,
              choice($.interpolation, $.identifier, alias(token.immediate('-'), $.identifier)),
            ),
          ),
        ),
      ),

    variable: (_) => /([a-zA-Z_]+\.)?\$[a-zA-Z-_][a-zA-Z0-9-_]*/,
  },
});

/**
 * Creates a rule to match one or more of the rules separated by `separator`
 *
 * @param {RuleOrLiteral} separator
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {SeqRule}
 *
 */
function sep1(separator, rule) {
  return seq(rule, repeat(seq(separator, rule)));
}

/**
 * Creates a rule to match two or more of the rules separated by `separator`
 *
 * @param {RuleOrLiteral} separator
 *
 * @param {RuleOrLiteral} rules
 *
 * @return {SeqRule}
 */
function sep2(separator, rules) {
  return seq(rules, repeat1(seq(separator, rules)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by `separator`
 *
 * @param {RuleOrLiteral} separator
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {ChoiceRule}
 */
function sep(separator, rule) {
  return optional(sep1(separator, rule));
}
