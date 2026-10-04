[
  "@at-root"
  "@container"
  "@debug"
  "@error"
  "@extend"
  "@forward"
  "@mixin"
  "@use"
  "@warn"
] @keyword

"@function" @keyword.function

"@return" @keyword.return

"@include" @keyword.import

[
  "as"
  "with"
  "show"
  "hide"
  "using"
] @keyword.import

(flag) @keyword

[
  "and"
  "or"
  "not"
] @keyword.operator

[
  "@while"
  "@each"
  "@for"
  "from"
  "through"
  "to"
  "in"
] @keyword.repeat

(js_comment) @comment @spell

(function_name) @function

[
  ">="
  "<="
] @operator

(mixin_statement
  name: (identifier) @function)

(mixin_statement
  (parameters
    (parameter) @variable.parameter))

(function_statement
  name: (identifier) @function)

(function_statement
  (parameters
    (parameter) @variable.parameter))

(plain_value) @string

(keyword_query) @function

(identifier) @variable

(variable) @variable

(argument) @variable.parameter

(arguments
  (variable) @variable.parameter)

[
  "["
  "]"
] @punctuation.bracket

(include_statement
  (identifier) @function)
