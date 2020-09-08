/* globals describe, it, Promise */

var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var generateName = require('./helpers/generate-name')
var parse = require('./helpers/parse').parse
var parseAndWriteFile = require('./helpers/parse').parseAndWriteFile
var runTemplate = require('./helpers/parse').runTemplate

chai.use(chaiAsPromised)
chai.should()

describe ('PHP stringifier', function () {
  this.timeout(3000)

  it ('html empty comment', function () {
    return parse('<component><!----></component>').should.eventually.equal('<!---->')
  })

  it ('html text comment', function () {
    return parse('<component><!-- some text 12345 _ # $ % ! - -\\- = [ ] \{ \} + ; : ( ) " \' \ / ~ _#$%!-\\-=+;:()"\'\/~ qwe123:-_ --></component>')
      .should.eventually.equal('<!-- some text 12345 _ # $ % ! - -- = [ ] \{ \} + ; : ( ) " \' \ / ~ _#$%!--=+;:()"\'\/~ qwe123:-_ -->')
  })

  it ('echo expression', function () {
    var params = {
      b: 1,
      c: {
        variable: {
          str: 3
        }
      },
      d: 'variable'
    }

    return parse('<component>{ $b + $c[$d][\'str\'] * 2 }</component>', params).should.eventually.equal('7')
  })

  it ('foreach expression without index', function () {
    var template =
      '<component>' +
      '<for-each item={$item} from={$news}>' +
      '<h1>{ $item.title }</h1>' +
      '</for-each>' +
      '</component>'
    var params = {
      news: [
        {
          title: 'News'
        },
        {
          title: 'Olds'
        }
      ]
    }

    return parse(template, params)
      .should.eventually.equal('<h1>News</h1><h1>Olds</h1>')
  })

  it ('foreach expression with index', function () {
    var params = {
      news: [
        {
          title: 'News'
        },
        {
          title: 'Olds'
        }
      ]
    }
    var template =
      '<component>' +
      '<for-each key={$index} item={$item} from={$news}>' +
      '<h1 data-index={$index}>{$item[\'title\']}</h1>' +
      '</for-each>' +
      '</component>'

    return parse(template, params)
      .should.eventually.equal('<h1 data-index="0">News</h1><h1 data-index="1">Olds</h1>')
  })

  it ('foreach statement at attributes at single tag', function () {
    var template =
      '<component>' +
      '<input title="Hello">' +
      '<for-each item={$item} from={[0..3]}>' +
      '<attribute name={"data-index" ++ $item} value={$item} />' +
      '</for-each>' +
      '</input>' +
      '</component>'
    var result =
      '<input title="Hello" data-index0="0" data-index1="1" data-index2="2" data-index3="3" />'

    return parse(template).should.eventually.equal(result)
  })

  it ('foreach statement at attributes at couple tag', function () {
    var template =
      '<component>' +
      '<div title="Hello">' +
      '<for-each item={$item} from={[0..3]}>' +
      '<attribute name={"data-index" ++ $item} value={$item} />' +
      '</for-each>' +
      '</div>' +
      '</component>'

    return parse(template, {item: 2}).should.eventually.equal('<div title="Hello" data-index0="0" data-index1="1" data-index2="2" data-index3="3"></div>')
  })

  it ('switch statement for tags with default', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<default>default value</default>' +
      '</switch>' +
      '</component>'

    return parse(template, {}).should.eventually.equal('default value')
  })

  it ('switch statement for tags with positive case 1', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a > $b}>case 1</case>' +
      '</switch>' +
      '</component>'

    return parse(template, {a: 2, b: 1}).should.eventually.equal('case 1')
  })

  it ('switch statement for tags with negative case 1', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a > $b}>case 1</case>' +
      '</switch>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('')
  })

  it ('switch statement for tags with positive case 2', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a > $b}>case 1</case>' +
      '<case test={$b > $a}>case 2</case>' +
      '</switch>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('case 2')
  })

  it ('switch statement for tags with positive default statement', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a > $b}>case 1</case>' +
      '<default>default statement</default>' +
      '</switch>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('default statement')
  })

  it ('switch statement for attributes with default', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<default>' +
      '<attribute name="data-id" value="qwerty" />' +
      '</default>' +
      '</switch>' +
      '</div>' +
      '</component>'

    return parse(template, {}).should.eventually.equal('<div data-id="qwerty"></div>')
  })

  it ('switch statement for attributes with positive case 1', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<case test={$a > $b}>' +
      '<attribute name="case" value="1" />' +
      '</case>' +
      '</switch>' +
      '</div>' +
      '</component>'

    return parse(template, {a: 2, b: 1}).should.eventually.equal('<div case="1"></div>')
  })

  it ('switch statement for attributes with negative case 1', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<case test={$a > $b}>' +
      '<attribute name="case" value="1" />' +
      '</case>' +
      '</switch>' +
      '</div>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('<div></div>')
  })

  it ('switch statement for attributes with positive case 2', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<case test={$a > $b}>' +
      '<attribute name="case" value="1" />' +
      '</case>' +
      '<case test={$b > $a}>' +
      '<attribute name="case" value="2" />' +
      '</case>' +
      '</switch>' +
      '</div>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('<div case="2"></div>')
  })

  it ('switch statement for attributes with positive default statement', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<case test={$a > $b}>' +
      '<attribute name="case" value="1" />' +
      '</case>' +
      '<default>' +
      '<attribute name="case" value="default statement" />' +
      '</default>' +
      '</switch>' +
      '</div>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('<div case="default statement"></div>')
  })

  it ('if expression', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a == $b}>' +
      '<variable name={$a} value={$a + $b} />' +
      '</case>' +
      '<case test={$a > $b && $b < $a}>' +
      '<variable name={$a} value={$a - $b} />' +
      '</case>' +
      '<default>' +
      '<variable name={$a} value={$b} />' +
      '</default>' +
      '</switch>' +
      '{$a}' +
      '</component>'
    var params = {a: 5, b: 10}

    return parse(template, params).should.eventually.equal('10')
  })

  it ('if expression 2', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={$a == $b}>' +
      '<variable name={$a} value={$a + $b} />' +
      '</case>' +
      '<case test={$a > $b && $b < $a}>' +
      '<variable name={$a} value={$a - $b} />' +
      '</case>' +
      '<default>' +
      '<variable name={$a} value={$b} />' +
      '</default>' +
      '</switch>' +
      '{$a}' +
      '</component>'
    var params = {a: 10, b: 5}

    return parse(template, params).should.eventually.equal('5')
  })

  it ('empty statements', function () {
    var template =
      '<component>' +
      '<div>' +
      '<switch>' +
      '<case test={$a > $b}>' +
      '</case>' +
      '<default>' +
      '</default>' +
      '</switch>' +
      '<variable name={$emptyarr} value={[]} />' +
      '<if test={1}></if>' +
      '<for-each item={$item} from={[]}></for-each>' +
      '</div>' +
      '</component>'

    return parse(template, {a: 1, b: 2}).should.eventually.equal('<div></div>')
  })

  it ('array expressions open range grow up', function () {
    var template =
      '<component>' +
      '<for-each item={$item} from={[5...$end]}>' +
      '{ $item }' +
      '</for-each>' +
      '</component>'

    return parse(template, {end: 9}).should.eventually.equal('5678')
  })

  it ('array expressions open range grow down', function () {
    var template =
      '<component>' +
      '<for-each item={$item} from={[5...$end]}>' +
      '{ $item }' +
      '</for-each>' +
      '</component>'

    return parse(template, {end: 0}).should.eventually.equal('54321')
  })

  it ('array expressions closed range grow up', function () {
    var template =
      '<component>' +
      '<for-each item={$item} from={[5..$end]}>' +
      '{ $item }' +
      '</for-each>' +
      '</component>'

    return parse(template, {end: 9}).should.eventually.equal('56789')
  })

  it ('array expressions closed range grow down', function () {
    var template =
      '<component>' +
      '<for-each item={$item} from={[5..$end]}>' +
      '{ $item }' +
      '</for-each>' +
      '</component>'

    return parse(template, {end: 0}).should.eventually.equal('543210')
  })

  it ('doctype', function () {
    var template =
      '<component>' +
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd" >' +
      '<html lang="en"><head><meta charset="UTF-8" />' +
      '<title>Document</title>' +
      '</head>' +
      '<body></body>' +
      '</html>' +
      '</component>'
    var result =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="UTF-8" />' +
      '<title>Document</title>' +
      '</head>' +
      '<body>' +
      '</body>' +
      '</html>'

    return parse(template).should.eventually.equal(result)
  })

  it ('isset', function () {
    var template =
      '<component>' +
      '<switch>' +
      '<case test={!$field[\'hide\']? || ($field[\'hide\']? && !$field[\'hide\'])}>hidden</case>' +
      '<default>show</default>' +
      '</switch>' +
      '</component>'

    return parse(template, {field: {}}).should.eventually.equal('hidden')
  })

  it ('param with default value', function () {
    var template =
      '<component>' +
      '<param name={$a} value={1} />' +
      '<switch>' +
      '<case test={$a > $b}>first</case>' +
      '<default>default</default>' +
      '</switch>' +
      '</component>'

    return parse(template, {b: 2}).should.eventually.equal('default')
  })

  it ('param with rewritten value', function () {
    var template =
      '<component>' +
      '<param name={$a} value={3} />' +
      '<switch>' +
      '<case test={$a > $b}>first</case>' +
      '<default>default</default>' +
      '</switch>' +
      '</component>'

    return parse(template, {b: 2}).should.eventually.equal('first')
  })

  it ('bits operations', function () {
    var template =
      '<component>' +
      '<variable name={$flag1} value={1 << 0} />' +
      '<variable name={$flag2} value={1 << 1} />' +
      '<variable name={$flag3} value={1 << 2} />' +
      '<variable name={$mix} value={$flag1 | $flag2} />' +
      '<if test={$mix & $flag1}>1</if>' +
      '<if test={$mix & $flag2}>2</if>' +
      '<if test={$mix & $flag3}>3</if>' +
      '<if test={$mix | $flag1}>4</if>' +
      '<if test={$mix | $flag2}>5</if>' +
      '<if test={$mix | $flag3}>6</if>' +
      '<variable name={$mix} value={$mix & ~$flag1} />' +
      '<if test={$mix & $flag1}>7</if>' +
      '<variable name={$mix} value={1 | 1 << 1 | 1 << 2 | 1 << 3} />' +
      '<if test={$mix & $flag3}>8</if>' +
      '<variable name={$mix} value={$mix & ~(1 << 2)} />' +
      '<if test={$mix & $flag3}>9</if>' +
      '{15 ^ 7}' +
      '</component>'

    return parse(template).should.eventually.equal('1245688')
  })

  it ('import and inlude', function () {
    var tempAsideName = generateName()

    return parseAndWriteFile('<component><aside>{$children}</aside></component>', tempAsideName + '.php')
      .then(function () {
        var template =
          '<component>' +
          '<import name="aside-component" from="./' + tempAsideName + '" />' +
          '<div>' +
          '<aside-component>' +
          '<h1>Hello</h1>' +
          '</aside-component>' +
          '</div>' +
          '</component>'

        return parse(template)
      })
      .should.eventually.equal('<div><aside><h1>Hello</h1></aside></div>')
  })

  it ('include with recursive parameters for single tag', function () {
    var tempCommentsName = generateName()
    var template =
      '<component>' +
      '<import name="user-comments" from="./' + tempCommentsName + '" />' +
      '<for-each item={$comment} from={$comments}>' +
      '<div>' +
      '{$comment.name}' +
      '<div>' +
      '<user-comments comments={$comment.children} />' +
      '</div>' +
      '</div>' +
      '</for-each>' +
      '</component>'
    var data = {
      comments: [
        {
          name: 'Aleksei',
          children: [
            {
              name: 'Natasha',
              children: []
            }
          ]
        }
      ]
    }

    return parseAndWriteFile(template, tempCommentsName + '.php')
      .then(function () {
        return runTemplate(tempCommentsName, data)
      })
      .should.eventually.equal('<div>Aleksei<div><div>Natasha<div></div></div></div></div>')
  })

  it ('include with recursive parameters for couple tag', function () {
    var tempCommentsName = generateName()
    var template =
      '<component>' +
      '<import name="user-comments" from="./' + tempCommentsName + '" />' +
      '<for-each item={$comment} from={$comments}>' +
      '<div>' +
      '{$comment[\'name\']}' +
      '<div>' +
      '<user-comments comments={$comment[\'children\']}></user-comments>' +
      '</div>' +
      '</div>' +
      '</for-each>' +
      '</component>'
    var data = {
      comments: [
        {
          name: 'Aleksei',
          children: [
            {
              name: 'Natasha',
              children: []
            }
          ]
        }
      ]
    }

    return parseAndWriteFile(template, tempCommentsName + '.php')
      .then(function () {
        return runTemplate(tempCommentsName, data)
      })
      .should.eventually.equal('<div>Aleksei<div><div>Natasha<div></div></div></div></div>')
  })

  it ('include with common scope of template and children', function () {
    var tempWrapName = generateName()
    var tempAsideName = generateName()
    var tempName = generateName()
    var wrapTemplate =
      '<component>' +
      '<wrap title={$title}>{$children}</wrap>' +
      '</component>'
    var asideTemplate =
      '<component>' +
      '<aside>{$children}<hr />' +
      '</aside>' +
      '</component>'
    var template =
      '<component>' +
      '<import name={"wrap-component"} from="./' + tempWrapName + '" />' +
      '<import name="aside-component" from="./' + tempAsideName + '" />' +
      '<variable name={$variable} value={1} />' +
      '<wrap-component title="Title of Wrap!">' +
      '<aside-component>' +
      'Text' +
      '<variable name={$variable} value={$variable + 1} />' +
      '</aside-component>' +
      '</wrap-component>' +
      '{$variable}' +
      '</component>'

    return Promise.all([
      parseAndWriteFile(wrapTemplate, tempWrapName + '.php'),
      parseAndWriteFile(asideTemplate, tempAsideName + '.php'),
      parseAndWriteFile(template, tempName + '.php')
    ])
      .then(function () {
        return runTemplate(tempName)
      })
      .should.eventually.equal('<wrap title="Title of Wrap!"><aside>Text<hr /></aside></wrap>2')
  })

  it ('output modified children element', function () {
    var tempWrapName = generateName()
    var wrapTemplate =
      '<component>' +
      '<for-each item={$item} from={$children}>' +
      '<if test={$item.tag? && $item.tag == \'item\'}>' +
      '<variable name={$item.tag} value="option" />' +
      '</if>' +
      '{$item}' +
      '</for-each>' +
      '</component>'

    var template =
      '<component>' +
      '<import name={"wrap-component"} from="./' + tempWrapName + '" />' +
      '<wrap-component>' +
      '<item>line1</item>' +
      '<item>line2</item>' +
      '<item>line3</item>' +
      '<item>line4</item>' +
      '</wrap-component>' +
      '</component>'

    return parseAndWriteFile(wrapTemplate, tempWrapName + '.php')
      .then(function () {
        return parse(template)
      })
      .should.eventually.equal('<option>line1</option><option>line2</option><option>line3</option><option>line4</option>')
  })

  it ('using template node', function () {
    var template =
      '<component>' +
      '<template name={$sub-template}>' +
      '<item>line1</item>' +
      '<item>line2</item>' +
      '<item>line3</item>' +
      '<item>line4</item>' +
      '</template>' +
      '{$sub-template}' +
      '</component>'

    return parse(template).should.eventually.equal('<item>line1</item><item>line2</item><item>line3</item><item>line4</item>')
  })

  it ('using template node', function () {
    var tempWrapName = generateName()
    var wrapTemplate =
      '<component>' +
      '<param name={$sub-template} value={[]} />' +
      '<for-each item={$child} key={$index} from={$sub-template}>' +
      '<div data-index={$index}>{$child}</div>' +
      '</for-each>' +
      '{$children}' +
      '</component>'

    var template =
      '<component>' +
      '<variable name={$amount} value={22} />' +
      '<import name={"wrap-component"} from="./' + tempWrapName + '" />' +
      '<template name={$sub-template}>' +
      '<item>line1</item>' +
      '<item>line{$amount}</item>' +
      '<item>line3</item>' +
      '<item>line4</item>' +
      '</template>' +
      '<wrap-component sub-template={$sub-template}>' +
      'text as children' +
      '</wrap-component>' +
      '</component>'

    return parseAndWriteFile(wrapTemplate, tempWrapName + '.php')
      .then(function () {
        return parse(template)
      })
      .should.eventually.equal(
        '<div data-index="0"><item>line1</item></div><div data-index="1"><item>line22</item></div>' +
        '<div data-index="2"><item>line3</item></div><div data-index="3"><item>line4</item></div>' +
        'text as children'
      )
  })

  it ('variables with dash', function () {
    var template =
      '<component>' +
      '<variable name={$variable-with-dash} value={1} />' +
      '{$variable-with-dash + 1}' +
      '{$variable-with-dash - 1}' +
      '</component>'

    return parse(template).should.eventually.equal('20')
  })

  it ('script tag', function () {
    var template = 'text<script deffer src={$src}>console.log("src")</script>after'

    return parse(template, { src: 'path.js' }).should.eventually.equal('text<script deffer src="path.js">console.log("src")</script>after')
  })

  it ('classes helper, normal', function () {
    var template = '<div class={classes("block", "element")}></div>'

    return parse(template).should.eventually.equal('<div class="block element"></div>')
  })

  it ('classes helper, undefined', function () {
    var template = '<div class={classes("block", $param)}></div>'

    return parse(template).should.eventually.equal('<div class="block"></div>')
  })

  it ('classes helper, param', function () {
    var template =
      '<variable name={$class} value="element" />' +
      '<div class={classes("block", $class)}></div>'

    return parse(template).should.eventually.equal('<div class="block element"></div>')
  })

  it ('use-state', function () {
    var subComponentName = generateName()
    var template =
      '<import name="sub-component" from="' + subComponentName + '" />'+
      '<sub-component />'
    var subComponnent =
      '<use-state name={$passed-data} value={["not", "passed", "data"]} />' +
      '<use-state name={$not-passed-data} value={["not", "passed", "data"]} />' +
      '<use-state name={$required} />' +
      '<for-each item={$word} from={$passed-data}>' +
      '<span>{$word}</span>' +
      '</for-each>' +
      '<for-each item={$word} from={$not-passed-data}>' +
      '<span>{$word}</span>' +
      '</for-each>' +
      '<span>{$required}</span>'

    return parseAndWriteFile(subComponnent, subComponentName + '.php')
      .then(function () {
        return parse(template, { 'passed-data': ['passed', 'data'], required: 'required' })
      })
      .should.eventually.equal('<span>passed</span><span>data</span><span>not</span><span>passed</span><span>data</span><span>required</span>')
  })

  it ('ternary operator operator1', function () {
    var template = '<div>{$a > $b ?? "bigger" !! "smaller"}</div>'

    return parse(template, { a: 1, b: 0 }).should.eventually.equal('<div>bigger</div>')
  })

  it ('ternary operator operator2', function () {
    var template = '<div>{$a > $b ?? "bigger" !! "smaller"}</div>'

    return parse(template, { a: 1, b: 2 }).should.eventually.equal('<div>smaller</div>')
  })
})
