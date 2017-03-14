/* global Promise */

var path = require('path')
var fs = require('fs')
var tmpFilesDirPath = path.resolve(__dirname, '../../tmp')
var exec = require('child_process').exec
var parser = require('gutt')
var phpStringifier = require('../../index')
var writeFile = require('./write-file')
var generateName = require('./generate-name')

function runTemplate (templatePath, params) {
  if (!params) {
    params = {}
  }

  return new Promise(function (resolve, reject) {
    exec('php ./test/helpers/run-template.php ' + templatePath + ' \'' + JSON.stringify(params) + '\'', function (err, res) {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    })
  })
}

function parseAndWriteFile (test, tmpFileName) {
  var resultFile

  try {
    fs.accessSync(tmpFilesDirPath, fs.F_OK)
  } catch (e) {
    fs.mkdir(tmpFilesDirPath)
  }

  resultFile = parser.parse(test).stringifyWith(phpStringifier)

  return writeFile(path.resolve(tmpFilesDirPath, tmpFileName), resultFile)
}

function parse (test, data) {
  var tmpFileName = generateName() + '.php'

  if (!data) {
    data = {}
  }

  return parseAndWriteFile(test, tmpFileName)
    .then(function () {
      return runTemplate(path.basename(tmpFileName, path.extname(tmpFileName)), data)
    })
}

module.exports = {
  parse: parse,
  parseAndWriteFile: parseAndWriteFile,
  runTemplate: runTemplate
}
