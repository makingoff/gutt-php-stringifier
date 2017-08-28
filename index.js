var logicHandler = require('./logic-handler')
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

function handleDefaultTag (node, id) {
  var children = ''
  var attrs
  var fragment = new Tag('fragment')

  linkNodeWithAttrFragment(node, fragment)

  if (!node.isSingle) {
    children = node.firstChild ? handleTemplate(node.firstChild, node.id) : finishNode(node)
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

function handleIfStatement (node, id) {
  var params = extractValuesFromAttrs(node.attrs, ['test'])
  var content
  var parentNode = node

  while (parentNode.parentNode) {
    parentNode = parentNode.parentNode
  }

  content = node.firstChild ? handleTemplate(node.firstChild, id) : finishNode(node)

  if (!node.firstChild) return ''

  if (parentNode.type === 'tag' && parentNode.name === 'fragment') {
    mapCurrentFragmentNode[parentNode.id] = node.parentNode
  }

  return '<?php if (' + handleTemplate(params.test, id) + ') { ?>\n' + content + '<?php } ?>'
}

function handleIfStatementNode (node, id) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-if'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleIfStatement(node, id)
}

function handleForEachStatement (node, id) {
  var params = extractValuesFromAttrs(node.attrs, ['key', 'item', 'from'])
  var content
  var parentNode = node
  var eachStatement

  while (parentNode.parentNode) {
    parentNode = parentNode.parentNode
  }

  content = node.firstChild ? handleTemplate(node.firstChild, id) : finishNode(node)

  if (!node.firstChild) return ''

  if (parentNode.type === 'tag' && parentNode.name === 'fragment') {
    mapCurrentFragmentNode[parentNode.id] = node.parentNode
  }

  eachStatement = (params.key ? handleTemplate(params.key, id) + ' => ' : '')

  return (
    '<?php foreach (' + handleTemplate(params.from, id) + ' as ' + eachStatement +
    handleTemplate(params.item, id) + ') { ?>' + content + '<?php } ?>'
  )
}

function handleForEachStatementNode (node, id) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-for-each'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleForEachStatement(node, id)
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

function handleImportStatement (node, id) {
  var params = extractValuesFromAttrs(node.attrs, ['name', 'from'])
  var name = handleTemplate(params.name, id).match(/^([\'\"])(.*)(\1)$/)[2]

  if (!~name.indexOf('-')) {
    throw new ParseError('Component name must contain dash (`-`) in the name', {
      line: params.name.line,
      column: params.name.column
    })
  }

  importedComponents.push(name)

  return '<?php $state["' + name + '"] = include(__DIR__ . "/" . ' + handleNode(params.from) + ' . ".php");?>'
}

function handleComponent (node, id) {
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
    children += handleTemplate(node.firstChild, node.id)
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

function handleVariable (node, id) {
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

function handleSwitchStatement (node, id) {
  linkNodeWithSwitchMarker(node)

  return handleTemplate(node.firstChild, id) + (switchMarker[node.id] & switchMarkerCase ? '<?php } ?>' : '')
}

function handleSwitchStatementNode (node, id) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-switch'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleSwitchStatement(node, id)
}

function handleCaseStatement (node, id) {
  var params
  var children

  if (node.parentNode.type !== 'tag' || (node.parentNode.name !== 'switch' && node.parentNode.name !== 'apply-switch')) {
    throw new ParseError('<case /> must be at first level inside <switch />', {line: node.line, column: node.column})
  }

  if (isSwitchMarkerHasDefault(node)) {
    throw new ParseError('<case /> must not be placed after <default />', {line: node.line, column: node.column})
  }

  children = node.firstChild ? handleTemplate(node.firstChild, id) : finishNode(node)
  params = extractValuesFromAttrs(node.attrs, ['test'])

  if (isFirstSwitchCase(node)) {
    setSwitchMarkerHasCase(node)

    return '<?php if (' + handleNode(params.test, id) + ') {' + ' ?>' + children
  }

  params = extractValuesFromAttrs(node.attrs, ['test'])

  return '<?php } else if (' + handleNode(params.test, id) + ') {' + ' ?>' + children
}

function handleCaseStatementNode (node, id) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-case'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleCaseStatement(node, id)
}

function handleDefaultStatement (node, id) {
  var children

  if (node.parentNode.type !== 'tag' || (node.parentNode.name !== 'switch' && node.parentNode.name !== 'apply-switch')) {
    throw new ParseError('<default /> must be at first level inside <switch />', {line: node.line, column: node.column})
  }

  children = node.firstChild ? handleTemplate(node.firstChild, id) : finishNode(node)

  if (isFirstSwitchCase(node)) {
    setSwitchMarkerHasDefault(node)
    return children
  }

  setSwitchMarkerHasDefault(node)
  return '<?php } else {' + ' ?>' + children
}

function handleDefaultStatementNode (node, id) {
  var parentNode = getParentTagNode(node)
  var attrFragment = getAttrFragmentByNode(parentNode)
  var clonedNode

  if (attrFragment) {
    clonedNode = node.clone()

    clonedNode.name = 'apply-default'

    appendNodeToAttrFragment(attrFragment, clonedNode)
  }

  return handleDefaultStatement(node, id)
}

function escapeQuote (str) {
  return str.replace(/\"/g, '\\"')
}

function handleComment (node, id) {
  return '<?php $children' + id + '[] = ["comment" => "' + escapeQuote(node.value) + '"];?>';
}

function handleText (node, id) {
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

function logicNodeHandler (node, id) {
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

function handleTemplateStatement (node, id) {
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

  var children = '<?php $children' + node.id + ' = [];?>' + handleTemplate(node.firstChild, node.id)

  return children + '<?php ' + handleNode(params.name, node.id) + ' = $children' + node.id + '; ?>'
}

function handleTag (node, id) {
  switch (node.name) {
    case 'param':
      return handleParam(node, id)

    case 'variable':
      return handleVariable(node, id)

    case 'attribute':
      return handleTagAttribute(node, id)

    case 'apply-attribute':
      return handleTagAttributeApply(node, id)

    case 'if':
      return handleIfStatementNode(node, id)

    case 'apply-if':
      return handleIfStatement(node, id)

    case 'for-each':
      return handleForEachStatementNode(node, id)

    case 'apply-for-each':
      return handleForEachStatement(node, id)

    case 'import':
      return handleImportStatement(node, id)

    case 'switch':
      return handleSwitchStatementNode(node, id)

    case 'case':
      return handleCaseStatementNode(node, id)

    case 'default':
      return handleDefaultStatementNode(node, id)

    case 'apply-switch':
      return handleSwitchStatement(node, id)

    case 'apply-case':
      return handleCaseStatement(node, id)

    case 'apply-default':
      return handleDefaultStatement(node, id)

    case 'template':
      return handleTemplateStatement(node, id)

    default:
      if (~importedComponents.indexOf(node.name)) {
        return handleComponent(node, id)
      }

      return handleDefaultTag(node, id)
  }
}

function scriptNode(node, id) {
  return (
    '<?php $children' + id + '[] = ["script" => ' +
    '["attrs" => "' + (node.attrs.length ? ' ' : '') + escapeQuote(node.attrs) + '", ' +
    '"text" => "' + escapeQuote(node.text) + '"]' +
    '];?>'
  )
}

function handleNode (node, id) {
  switch (node.type) {
    case 'tag':
      return handleTag(node, id)
    case 'comment':
      return handleComment(node, id)
    case 'text':
      return handleText(node, id)
    case 'string':
      return handleString(node, id)
    case 'logic':
      return logicHandler(node, id)
    case 'logic-node':
      return logicNodeHandler(node, id)
    case 'script':
      return scriptNode(node, id)
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

function handleTemplate (node, id) {
  var buffer = []

  while (node) {
    buffer.push(handleNode(node, id))

    if (!node.nextSibling) break;

    node = node.nextSibling
  }

  if (node.parentNode) {
    finishNode(node.parentNode)
  }

  return buffer.join('')
}

module.exports = function (template) {
  var templateResult = handleTemplate(template, 0)

  return prefix + templateResult + postfix
}
