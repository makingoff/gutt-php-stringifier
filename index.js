var path = require('path')
var logicHandler = require('./logic-handler')
var parser = require('gutt')
var Attr = require('gutt/tokens/attr')
var Tag = require('gutt/tokens/tag')
var reservedTags = [
  'apply-attribute',
  'attribute',
  'apply-if',
  'if',
  'apply-for-each',
  'for-each',
  'switch',
  'case',
  'default',
  'apply-switch',
  'apply-case',
  'apply-default'
]
var pairedTags = [
  'if',
  'for-each',
  'switch',
  'case',
  'default'
]
var singleTags = ['input']
var mapAttrFragments = {}
var mapCurrentFragmentNode = {}
var prefix = require('./wrappers').prefix
var postfix = require('./wrappers').postfix
var importedComponents = []
var ParseError = require('gutt/helpers/parse-error')
var switchMarker = {}
var switchMarkerNone = 0
var switchMarkerCase = 1 << 0
var switchMarkerDefault = 1 << 1

function linkNodeWithSwitchMarker (node) {
  switchMarker[node.id] = switchMarkerNone
}

function isFirstSwitchCase (node) {
  return switchMarker[node.parentNode.id] === switchMarkerNone
}

function setSwitchMarkerHasCase (node) {
  switchMarker[node.parentNode.id] |= switchMarkerCase
}

function isSwitchMarkerHasDefault (node) {
  return switchMarker[node.parentNode.id] & switchMarkerDefault
}

function setSwitchMarkerHasDefault (node) {
  switchMarker[node.parentNode.id] |= switchMarkerDefault
}

function extractValuesFromAttrs (attrs, fields) {
  var result = {}

  attrs.forEach(function (attr) {
    if (attr.name.type === 'string' && ~fields.indexOf(attr.name.value)) {
      result[attr.name.value] = attr.value
    }
  })

  return result
}

function attrValueHandle (attr, id) {
  var name
  var value

  if (attr.name) {
    name = handleNode(attr.name)
    value = attr.value === null ? 'false' : handleNode(attr.value)

    return '<?php $attrs' + id + '[' + name + '] = ' + value + ';?>'
  }

  return '<?php $attrs' + id + '[\'' + handleNode(attr.value) + '\'] = false;?>'
}

function attrsHandler (fragment, attrs) {
  var result = []
  var attrsFragment = fragment.firstChild ? handleTemplate(fragment.firstChild) : finishNode(fragment)

  attrs.forEach(function (attr) {
    result.push(attrValueHandle(attr, fragment.id))
  })

  return '<?php $attrs' + fragment.id + ' = [];?>' + result.join('') + attrsFragment
}

function linkNodeWithAttrFragment (node, fragment) {
  mapAttrFragments[node.id] = fragment
  mapCurrentFragmentNode[fragment.id] = fragment
}

function getAttrFragmentByNode (node) {
  return mapAttrFragments[node.id]
}

function getMapCurrentFragmentNode (fragment) {
  return mapCurrentFragmentNode[fragment.id]
}

function setMapCurrentFragmentNode (attrFragment, node) {
  mapCurrentFragmentNode[attrFragment.id] = node
}

function getParentTagNode (node) {
  while (node.parentNode && node.parentNode.type === 'tag' && ~reservedTags.indexOf(node.parentNode.name)) {
    node = node.parentNode
  }

  return node.parentNode
}

function handleDefaultTag (node, id, filepath) {
  var children = ''
  var attrs
  var fragment = new Tag('fragment')

  linkNodeWithAttrFragment(node, fragment)

  if (!node.isSingle) {
    children = node.firstChild ? handleTemplate(node.firstChild, node.id, filepath) : finishNode(node)
  }

  attrs = attrsHandler(fragment, node.attrs)

  if (node.name === '!DOCTYPE') {
    return attrs + '<?php $children' + id + '[] = ["tag" => "' + node.name + '", "attrs" => $attrs' + fragment.id + '];?>'
  }

  if (node.isSingle || ~singleTags.indexOf(node.name)) {
    return attrs + '<?php $children' + id + '[] = ["tag" => "' + node.name + '", "attrs" => $attrs' + fragment.id + '];?>'
  }

  return (
    attrs + '<?php $children' + node.id + ' = [];?>' + children +
    '<?php $children' + id + '[] = ["tag" => "' + node.name + '", "attrs" => $attrs' + fragment.id +
    ', "children" => $children' + node.id + '];?>'
  )
}

function handleTagAttribute (node) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (!attrFragment) {
    throw new ParseError('There is no tag which <attribute /> can be applyed to', {
      line: node.line,
      column: node.column
    })
  }

  clonedNode = node.clone()

  clonedNode.name = 'apply-attribute'

  appendNodeToAttrFragment(attrFragment, clonedNode, false)

  return ''
}

function handleTagAttributeApply (node) {
  var fragment = node
  var params = extractValuesFromAttrs(node.attrs, ['name', 'value'])

  if (!params.name) {
    throw new ParseError('<attribute /> must contain `name`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  if (!params.value) {
    throw new ParseError('<attribute /> must contain `value`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  while (fragment.parentNode) {
    fragment = fragment.parentNode
  }

  return attrValueHandle(new Attr(params.name, params.value), fragment.id)
}

function handleParam (node) {
  var params = extractValuesFromAttrs(node.attrs, ['name', 'value'])
  var name
  var value

  if (!params.name) {
    throw new ParseError('<param /> must contain `name`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  if (!params.value) {
    throw new ParseError('<param /> must contain `value`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  name = handleNode(params.name)
  value = handleNode(params.value)

  return '<?php if (!isset(' + name + ')) ' + name + ' = ' + value + ';?>'
}

function handleIfStatement (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['test'])
  var content
  var parentNode = node

  while (parentNode.parentNode) {
    parentNode = parentNode.parentNode
  }

  content = node.firstChild ? handleTemplate(node.firstChild, id, filepath) : finishNode(node)

  if (!node.firstChild) return ''

  if (parentNode.type === 'tag' && parentNode.name === 'fragment') {
    mapCurrentFragmentNode[parentNode.id] = node.parentNode
  }

  return '<?php if (' + handleTemplate(params.test, id, filepath) + ') { ?>\n' + content + '<?php } ?>'
}

function handleIfStatementNode (node, id, filepath) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-if'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleIfStatement(node, id, filepath)
}

function handleForEachStatement (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['key', 'item', 'from'])
  var content
  var parentNode = node
  var eachStatement

  while (parentNode.parentNode) {
    parentNode = parentNode.parentNode
  }

  content = node.firstChild ? handleTemplate(node.firstChild, id, filepath) : finishNode(node)

  if (!node.firstChild) return ''

  if (parentNode.type === 'tag' && parentNode.name === 'fragment') {
    mapCurrentFragmentNode[parentNode.id] = node.parentNode
  }

  eachStatement = (params.key ? handleTemplate(params.key, id, filepath) + ' => ' : '')

  return (
    '<?php foreach (' + handleTemplate(params.from, id, filepath) + ' as ' + eachStatement +
    handleTemplate(params.item, id, filepath) + ') { ?>' + content + '<?php } ?>'
  )
}

function handleForEachStatementNode (node, id, filepath) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-for-each'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleForEachStatement(node, id, filepath)
}

function appendNodeToAttrFragment (attrFragment, node, isSetNodeAsCurrentNodeAtFragment) {
  var currentAttrNode = getMapCurrentFragmentNode(attrFragment)

  if (typeof isSetNodeAsCurrentNodeAtFragment === 'undefined') {
    isSetNodeAsCurrentNodeAtFragment = true
  }

  node.parentNode = currentAttrNode

  if (!currentAttrNode.firstChild) {
    currentAttrNode.firstChild = node
  }

  if (currentAttrNode.lastChild) {
    currentAttrNode.lastChild.nextSibling = node
    node.previousSibling = currentAttrNode.lastChild
  }

  currentAttrNode.lastChild = node

  if (isSetNodeAsCurrentNodeAtFragment) {
    setMapCurrentFragmentNode(attrFragment, node)
  }
}

function handleImportStatement (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['name', 'from'])
  var name = handleTemplate(params.name, id, filepath).match(/^([\'\"])(.*)(\1)$/)[2]

  if (!~name.indexOf('-')) {
    throw new ParseError('Component name must contain dash (`-`) in the name', {
      line: params.name.line,
      column: params.name.column
    })
  }

  importedComponents.push(name)

  return '<?php $state["' + name + '"] = include(__DIR__ . "/" . ' + handleNode(params.from) + ' . ".php");?>'
}

function handleComponent (node, id, filepath) {
  var children = '<?php $children' + node.id + ' = [];?>'
  var attrs
  var fragment = new Tag('fragment')
  var attrsOutput = '$attrs' + fragment.id
  var copyResultChilds =
    '<?php foreach($result' + node.id + ' as $item' + node.id + ') {\n' +
    '$children' + id + '[] = $item' + node.id + ';\n' +
    '} ?>'

  linkNodeWithAttrFragment(node, fragment)

  if (!node.isSingle && node.firstChild) {
    children += handleTemplate(node.firstChild, node.id, filepath)
  }

  attrs = attrsHandler(fragment, node.attrs)

  if (node.isSingle || ~singleTags.indexOf(node.name)) {
    return (
      attrs + '<?php $result' + node.id + ' = $state["' + node.name + '"]' +
      '(' + attrsOutput + ', [], true); ?>' + copyResultChilds
    )
  }

  return (
    attrs + children + '<?php $result' + node.id + ' = $state["' + node.name + '"]' +
    '(' + attrsOutput + ', $children' + node.id + ', true); ?>' + copyResultChilds
  )
}

function handleVariable (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['name', 'value'])

  if (!params.name) {
    throw new ParseError('<variable /> must contain `name`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  if (!params.value) {
    throw new ParseError('<variable /> must contain `value`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  return '<?php ' + handleNode(params.name, id) + ' = ' + handleNode(params.value, id) + '; ?>'
}

function handleSwitchStatement (node, id, filepath) {
  linkNodeWithSwitchMarker(node)

  return handleTemplate(node.firstChild, id, filepath) + (switchMarker[node.id] & switchMarkerCase ? '<?php } ?>' : '')
}

function handleSwitchStatementNode (node, id, filepath) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-switch'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleSwitchStatement(node, id, filepath)
}

function handleCaseStatement (node, id, filepath) {
  var params
  var children

  if (node.parentNode.type !== 'tag' || (node.parentNode.name !== 'switch' && node.parentNode.name !== 'apply-switch')) {
    throw new ParseError('<case /> must be at first level inside <switch />', {line: node.line, column: node.column})
  }

  if (isSwitchMarkerHasDefault(node)) {
    throw new ParseError('<case /> must not be placed after <default />', {line: node.line, column: node.column})
  }

  children = node.firstChild ? handleTemplate(node.firstChild, id, filepath) : finishNode(node)
  params = extractValuesFromAttrs(node.attrs, ['test'])

  if (isFirstSwitchCase(node)) {
    setSwitchMarkerHasCase(node)

    return '<?php if (' + handleNode(params.test, id) + ') {' + ' ?>' + children
  }

  params = extractValuesFromAttrs(node.attrs, ['test'])

  return '<?php } else if (' + handleNode(params.test, id) + ') {' + ' ?>' + children
}

function handleCaseStatementNode (node, id, filepath) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-case'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleCaseStatement(node, id, filepath)
}

function handleDefaultStatement (node, id, filepath) {
  var children

  if (node.parentNode.type !== 'tag' || (node.parentNode.name !== 'switch' && node.parentNode.name !== 'apply-switch')) {
    throw new ParseError('<default /> must be at first level inside <switch />', {line: node.line, column: node.column})
  }

  children = node.firstChild ? handleTemplate(node.firstChild, id, filepath) : finishNode(node)

  if (isFirstSwitchCase(node)) {
    setSwitchMarkerHasDefault(node)
    return children
  }

  setSwitchMarkerHasDefault(node)
  return '<?php } else {' + ' ?>' + children
}

function handleDefaultStatementNode (node, id, filepath) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-default'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleDefaultStatement(node, id, filepath)
}

function escapeQuote (str) {
  return str.replace(/\"/g, '\\"')
}

function handleComment (node, id, filepath) {
  return '<?php $children' + id + '[] = ["comment" => "' + escapeQuote(node.value) + '"];?>';
}

function handleText (node, id, filepath) {
  if (node.parentNode.name === 'switch' && node.text.trim().length) {
    throw new ParseError('Text node must not be placed inside <switch />', {
      line: node.line,
      column: node.column
    })
  }

  return '<?php $children' + id + '[] = ["text" => "' + escapeQuote(node.text) + '"];?>'
}

function handleString (node) {
  return '"' + node.value + '"'
}

function logicNodeHandler (node, id, filepath) {
  return (
    '<?php $result' + id + ' = ' + logicHandler(node) + ';\n' +
    'if (gettype($result' + id + ') === \'array\') {\n' +
    '  if (isset($result' + id + '[\'tag\']) || isset($result' + id + '[\'text\']) || isset($result' + id + '[\'comment\'])) {\n' +
    '    $children' + id + '[] = $result' + id + ';\n' +
    '  } else {\n' +
    '    foreach($result' + id + ' as $item' + id + ') {\n' +
    '      $children' + id + '[] = $item' + id + ';\n' +
    '    }' +
    '  }' +
    '} else {\n' +
    '  $children' + id + '[] = ["text" => $result' + id + '];\n' +
    '} ?>'
  )
}

function handleTemplateStatement (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['name'])

  if (!params.name) {
    throw new ParseError('<template /> must contain `name`-attribute', {
      line: node.line,
      column: node.column
    })
  }

  if (node.isSingle) {
    throw new ParseError('<template /> must not be self-closing tag', {
      line: node.line,
      column: node.column
    })
  }

  var children = '<?php $children' + node.id + ' = [];?>' + handleTemplate(node.firstChild, node.id, filepath)

  return children + '<?php ' + handleNode(params.name, node.id) + ' = $children' + node.id + '; ?>'
}

function handleInlineSvg (node, id, filepath) {
  var params = extractValuesFromAttrs(node.attrs, ['src'])
  var svg = parser.parseFile(path.resolve(path.dirname(filepath), params.src.value))

  return handleTemplate(svg.result, id, filepath)
}

function handleTag (node, id, filepath) {
  switch (node.name) {
    case 'inline-svg':
      return handleInlineSvg(node, id, filepath)

    case 'param':
      return handleParam(node, id, filepath)

    case 'variable':
      return handleVariable(node, id, filepath)

    case 'attribute':
      return handleTagAttribute(node, id, filepath)

    case 'apply-attribute':
      return handleTagAttributeApply(node, id, filepath)

    case 'if':
      return handleIfStatementNode(node, id, filepath)

    case 'apply-if':
      return handleIfStatement(node, id, filepath)

    case 'for-each':
      return handleForEachStatementNode(node, id, filepath)

    case 'apply-for-each':
      return handleForEachStatement(node, id, filepath)

    case 'import':
      return handleImportStatement(node, id, filepath)

    case 'switch':
      return handleSwitchStatementNode(node, id, filepath)

    case 'case':
      return handleCaseStatementNode(node, id, filepath)

    case 'default':
      return handleDefaultStatementNode(node, id, filepath)

    case 'apply-switch':
      return handleSwitchStatement(node, id, filepath)

    case 'apply-case':
      return handleCaseStatement(node, id, filepath)

    case 'apply-default':
      return handleDefaultStatement(node, id, filepath)

    case 'template':
      return handleTemplateStatement(node, id, filepath)

    default:
      if (~importedComponents.indexOf(node.name)) {
        return handleComponent(node, id, filepath)
      }

      return handleDefaultTag(node, id, filepath)
  }
}

function scriptNode(node, id, filepath) {
  var attrs = []

  node.attrs.forEach(function (attr) {
    attrs.push(attrValueHandle(attr, node.id))
  })

  return (
    attrs.join('') +
    '<?php $children' + id + '[] = ["script" => ' +
    '["attrs" => $attrs' + node.id + ', ' +
    '"body" => "' + escapeQuote(node.body.str) + '"' +
    ']];?>'
  )
}

function handleNode (node, id, filepath) {
  switch (node.type) {
    case 'tag':
      return handleTag(node, id, filepath)
    case 'comment':
      return handleComment(node, id, filepath)
    case 'text':
      return handleText(node, id, filepath)
    case 'string':
      return handleString(node, id, filepath)
    case 'logic':
      return logicHandler(node, id, filepath)
    case 'logic-node':
      return logicNodeHandler(node, id, filepath)
    case 'script':
      return scriptNode(node, id, filepath)
  }
}

function finishNode (node) {
  var attrFragment
  var currentAttrNode
  var parentNode

  if (node.type === 'tag' && ~pairedTags.indexOf(node.name)) {
    parentNode = getParentTagNode(node)

    attrFragment = getAttrFragmentByNode(parentNode)

    if (attrFragment) {
      currentAttrNode = getMapCurrentFragmentNode(attrFragment)

      setMapCurrentFragmentNode(attrFragment, currentAttrNode.parentNode)
    }
  }

  return ''
}

function handleTemplate (node, id, filepath) {
  var buffer = []

  while (node) {
    buffer.push(handleNode(node, id, filepath))

    if (!node.nextSibling) break;

    node = node.nextSibling
  }

  if (node.parentNode) {
    finishNode(node.parentNode)
  }

  return buffer.join('')
}

module.exports = function (template, source, filepath) {
  var templateResult = handleTemplate(template, 0, filepath)

  return prefix + templateResult + postfix
}
