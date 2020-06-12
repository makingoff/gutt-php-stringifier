var consts = ['true', 'false']

function handleParams (params, safeRead, ctx) {
  return params.map(function (attr) {
    return expression(attr, ctx, safeRead)
  })
}

function handleFunction (tree, ctx) {
  var funcName =
    (tree.value.type === 'var' && !tree.value.keys.length ? tree.value.value : expression(tree.value, ctx))
  var params = handleParams(tree.attrs, funcName === 'classes', ctx)

  switch (funcName) {
    case 'str_sub':

      if (params.length < 3) {
        params.push('NULL')
      }

      return 'mb_substr' + '(' + params.join(', ') + ', \'UTF-8\')'

    case 'str_len':
      return 'mb_strlen(' + params.join(', ') + ', \'UTF-8\')'

    case 'str_replace':
      return 'str_replace(' + params[1] + ', ' + params[2] + ', ' + params[0] + ')'
    case 'str_pad_right':
      return 'str_pad(' + params.join(', ') + ', STR_PAD_RIGHT)'
    case 'str_pad_left':
      return 'str_pad(' + params.join(', ') + ', STR_PAD_LEFT)'
    case 'str_pad_both':
      return 'str_pad(' + params.join(', ') + ', STR_PAD_BOTH)'
    case 'str_split':
      if (params[1] === '""') {
        return 'str_split(' + params[0] + ')'
      }

      return 'explode(' + params[1] + ', ' + params[0] + ')'
    case 'str_lower':
      return 'mb_strtolower(' + params.join(', ') + ', \'UTF-8\')'
    case 'str_upper':
      return 'mb_strtoupper(' + params.join(', ') + ', \'UTF-8\')'
    case 'str_trim':
      return 'trim(' + params.join(', ') + ')'
    case 'str_ltrim':
      return 'ltrim(' + params.join(', ') + ')'
    case 'str_rtrim':
      return 'rtrim(' + params.join(', ') + ')'
    case 'str_urlencode':
      return 'rawurlencode(' + params.join(', ') + ')'
    case 'str_urldecode':
      return 'rawurldecode(' + params.join(', ') + ')'
    case 'str_htmlescape':
      return 'htmlspecialchars(' + params.join(', ') + ')'
    case 'str':
      if (!params[1]) {
        params[1] = 0
      }

      if (!params[2]) {
        params[2] = '\'.\''
      }

      return 'toFixed(' + params.join(', ') + ')'

    case 'arr_keys':
      return 'array_keys(' + params.join(', ') + ')'
    case 'arr_contain':
      return '(array_search(' + params[1] + ', ' + params[0] + ') !== false)'
    case 'arr_values':
      return 'array_values(' + params.join(', ') + ')'
    case 'arr_len':
      return 'count(' + params.join(', ') + ')'
    case 'arr_pop':
      return 'array_pop(' + params.join(', ') + ')'
    case 'arr_shift':
      return 'array_shift(' + params.join(', ') + ')'
    case 'arr_slice':
      return 'array_slice(' + params.join(', ') + ')'
    case 'arr_splice':
      return 'array_splice(' + params.join(', ') + ')'
    case 'arr_pad':
      return 'array_pad(' + params.join(', ') + ')'
    case 'arr_reverse':
      return 'array_reverse(' + params.join(', ') + ')'
    case 'arr_unique':
      return 'array_unique(' + params.join(', ') + ')'
    case 'arr_join':
      return 'implode(' + (params[1] ? params[1] : '\'\'') + ', ' + params[0] + ')'

    case 'num_int':
      return 'intval(' + params.join(', ') + ')'
    case 'num_float':
      return 'floatval(' + params.join(', ') + ')'
    case 'num_pow':
      return 'pow(' + params.join(', ') + ')'
    case 'num_abs':
      return 'abs(' + params.join(', ') + ')'
    case 'num_acos':
      return 'acos(' + params.join(', ') + ')'
    case 'num_asin':
      return 'asin(' + params.join(', ') + ')'
    case 'num_atan':
      return 'atan(' + params.join(', ') + ')'
    case 'num_cos':
      return 'cos(' + params.join(', ') + ')'
    case 'num_sin':
      return 'sin(' + params.join(', ') + ')'
    case 'num_tan':
      return 'tan(' + params.join(', ') + ')'
    case 'num_round':
      return '(' + params[0] + ' < 0 ? round(' + params[0] + ', 0, PHP_ROUND_HALF_DOWN) : round(' + params[0] + ', 0, PHP_ROUND_HALF_UP))'
    case 'num_sqrt':
      return 'sqrt(' + params.join(', ') + ')'
    case 'num_rand':
      return '((float)rand()/(float)getrandmax())'
    default:
      return funcName + '(' + params.join(', ') + ')'
  }
}

function handleArray (source, ctx) {
  var key = 0
  var isKeyProper = true
  var result = []
  var str = ''

  source.forEach(function (item) {
    if (item.key !== null) {
      isKeyProper = false;
    }
  })

  if (isKeyProper) {
    source.forEach(function (item) {
      result.push(expression(item.value, ctx))
    })

    return '[' + result.join(',') + ']'
  }

  result = {}

  source.forEach(function (item) {
    if (item.key === null) {
      result[key++] = expression(item.value, ctx)
    } else {
      result[expression(item.key, ctx)] = expression(item.value, ctx)
    }
  })

  str = []

  for (key in result) {
    str.push(key + ' => ' + result[key])
  }

  return '[' + str.join(', ') + ']'
}

function prepareVariableKey (key, ctx) {
  switch (key.type) {
    case 'num':
    case 'var':
      return expression(key, ctx);
    case 'str':
      return '\'' + expression(key.value, ctx) + '\'';
  }
}

function expression (tree, ctx, isSafeRead, isToWrite) {
  var str = ''
  var keys

  if (typeof tree === 'string') return tree

  switch (tree.type) {
    case 'var':
      if (tree.value === 'children') return '$__children'

      if (~consts.indexOf(tree.value)) return tree.value

      keys = [{ type: 'str', value: tree.value }].concat(tree.keys);

      if (isToWrite && keys.length === 1) {
        if (ctx.stack.indexOf(tree.value) === -1) {
          ctx.stack.push(tree.value)
        }
      }

      var variable = (ctx.stack.indexOf(tree.value) > -1 ? '$__stack' : '$__data') + keys.map(function (key) {
        return '[' + prepareVariableKey(key, ctx) + ']'
      }).join('')

      if (isSafeRead) {
        str += 'isset(' + variable + ') ? ' + variable + ' : ""'
      } else {
        str += variable
      }

      return str

    case 'const':
      return tree.value
    case 'str':
      return expression('"' + tree.value.replace(/"/g, '\\"') + '"', ctx)
    case 'num':
      return tree.value
    case 'leftshift':
      return expression(tree.value[0], ctx) + ' << ' + expression(tree.value[1], ctx)
    case 'rightshift':
      return expression(tree.value[0], ctx) + ' >> ' + expression(tree.value[1], ctx)
    case 'plus':
      return expression(tree.value[0], ctx) + ' + ' + expression(tree.value[1], ctx)
    case 'minus':
      return expression(tree.value[0], ctx) + ' - ' + expression(tree.value[1], ctx)
    case 'mult':
      return expression(tree.value[0], ctx) + ' * ' + expression(tree.value[1], ctx)
    case 'divis':
      return expression(tree.value[0], ctx) + ' / ' + expression(tree.value[1], ctx)
    case 'mod':
      return expression(tree.value[0], ctx) + ' % ' + expression(tree.value[1], ctx)
    case 'or':
      return expression(tree.value[0], ctx) + ' || ' + expression(tree.value[1], ctx)
    case 'and':
      return expression(tree.value[0], ctx) + ' && ' + expression(tree.value[1], ctx)
    case 'bitnot':
      return ' ~ ' + expression(tree.value, ctx)
    case 'bitor':
      return expression(tree.value[0], ctx) + ' | ' + expression(tree.value[1], ctx)
    case 'bitand':
      return expression(tree.value[0], ctx) + ' & ' + expression(tree.value[1], ctx)
    case 'bitxor':
      return expression(tree.value[0], ctx) + ' ^ ' + expression(tree.value[1], ctx)
    case 'notequal':
    case 'notequal':
      return expression(tree.value[0], ctx) + ' != ' + expression(tree.value[1], ctx)
    case 'equal':
      return expression(tree.value[0], ctx) + ' == ' + expression(tree.value[1], ctx)
    case 'gtequal':
      return expression(tree.value[0], ctx) + ' >= ' + expression(tree.value[1], ctx)
    case 'gt':
      return expression(tree.value[0], ctx) + ' > ' + expression(tree.value[1], ctx)
    case 'lt':
      return expression(tree.value[0], ctx) + ' < ' + expression(tree.value[1], ctx)
    case 'ltequal':
      return expression(tree.value[0], ctx) + ' <= ' + expression(tree.value[1], ctx)
    case 'isset':
      return 'isset(' + expression(tree.value, ctx) + ')'
    case 'not':
      return '!' + expression(tree.value, ctx)
    case 'brack':
      return '(' + expression(tree.value, ctx) + ')'
    case 'uminus':
      return '-' + expression(tree.value, ctx)
    case 'func':
      return handleFunction(tree, ctx)
    case 'concat':
      return tree.value.map(function (item) {
        return expression(item, ctx)
      }).join(' . ')

    case 'array':
      if (tree.range) {
        switch (tree.range.type) {
          case 'open':
            str = 'mkArr(' + expression(tree.range.value[0], ctx)
            str += ', ' + expression(tree.range.value[1], ctx)
            str += ', MKARR_OPEN)'

            return str

          case 'close':
            str = 'mkArr(' + expression(tree.range.value[0], ctx)
            str += ', ' + expression(tree.range.value[1], ctx)
            str += ', MKARR_CLOSE)'

            return str
        }
      }

      return handleArray(tree.values, ctx)
  }

  return str
}

function logicHandler (node, ctx, isToWrite) {
  var value

  if (node.expr.type === 'isset') {
    return expression(node.expr.value, ctx, true, isToWrite)
  }

  return expression(node.expr, ctx, false, isToWrite)
}

module.exports = logicHandler
