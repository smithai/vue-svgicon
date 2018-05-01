#!/usr/bin/env node
'use strict';

/**
 * build svg icon
 * @author Allenice
 * @since 2017-02-17
 */

var fs = require('fs-plus');
var path = require('path');
var Svgo = require('svgo');
var glob = require('glob');
var colors = require('colors');
var args = require('yargs').usage('Usage: $0 -s svgSourcePath -t targetPath').demandOption(['s', 't']).describe('s', 'Svg source path').describe('t', 'Generate icon path').describe('ext', 'Generated file\'s extension').default('ext', 'js').describe('tpl', 'the template file which to generate icon files').describe('es6', 'Use ES6 module').help('help').alias('h', 'help').argv;

// svg fle path
var sourcePath = path.join(process.cwd(), args.s, '**/*.svg');

// generated icon path
var targetPath = path.join(process.cwd(), args.t);

// the template file which to generate icon files
var tplPath = args.tpl ? path.join(process.cwd(), args.tpl) : path.join(__dirname, '../icon.tpl' + (args.es6 ? '.es6' : '') + '.txt');

var tpl = fs.readFileSync(tplPath, 'utf8');

var ext = args.ext;

// delete previous icons
fs.removeSync(targetPath);

var svgo = new Svgo({
  plugins: [{
    removeAttrs: {}
  }, {
    removeTitle: true
  }, {
    removeStyleElement: true
  }, {
    removeComments: true
  }, {
    removeDesc: true
  }, {
    removeUselessDefs: true
  }, {
    cleanupIDs: {
      remove: true,
      prefix: 'svgicon-'
    }
  }, {
    convertShapeToPath: true
  }]
});

// simple template compile
function compile(content, data) {
  return content.replace(/\${(\w+)}/gi, function (match, name) {
    return data[name] ? data[name] : '';
  });
}

// get file path by filename
function getFilePath(filename) {
  var subDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  var filePath = filename.replace(path.resolve(args.s), '').replace(path.basename(filename), '');

  if (subDir) {
    filePath = filePath.replace(subDir + path.sep, '');
  }

  if (/^[\/\\]/.test(filePath)) {
    filePath = filePath.substr(1);
  }

  return filePath.replace(/\\/g, '/', 'g');
}

// generate index.js, which import all icons
function generateIndex(files) {
  var subDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  var isES6 = args.es6;
  var content = ext === 'js' ? '/* eslint-disable */\n' : '';
  var dirMap = {};

  files.forEach(function (file) {
    var name = path.basename(file).split('.')[0];
    var filePath = getFilePath(file, subDir);
    var dir = filePath.split('/')[0];

    if (dir) {
      if (!dirMap[dir]) {
        dirMap[dir] = [];
        content += isES6 ? 'import \'./' + dir + '\'\n' : 'require(\'./' + dir + '\')\n';
      }
      dirMap[dir].push(file);
    } else {
      content += isES6 ? 'import \'./' + filePath + name + '\'\n' : 'require(\'./' + filePath + name + '\')\n';
    }
  });

  fs.writeFileSync(path.join(targetPath, subDir, 'index.' + ext), content, 'utf-8');
  console.log(colors.green('Generated ' + (subDir ? subDir + path.sep : '') + 'index.' + ext));

  // generate subDir index.js
  for (var dir in dirMap) {
    generateIndex(dirMap[dir], path.join(subDir, dir));
  }
}

glob(sourcePath, function (err, files) {
  if (err) {
    console.log(err);
    return false;
  }

  files = files.map(function (f) {
    return path.normalize(f);
  });

  files.forEach(function (filename, ix) {
    var name = path.basename(filename).split('.')[0];
    var content = fs.readFileSync(filename, 'utf-8');
    var filePath = getFilePath(filename);

    svgo.optimize(content, function (result) {
      var data = result.data.replace(/<svg[^>]+>/gi, '').replace(/<\/svg>/gi, '');
      var viewBox = result.data.match(/viewBox="([-\d\.]+\s[-\d\.]+\s[-\d\.]+\s[-\d\.]+)"/);

      if (viewBox && viewBox.length > 1) {
        viewBox = viewBox[1];
      } else if (result.info.height && result.info.width) {
        viewBox = '0 0 ' + result.info.width + ' ' + result.info.height;
      } else {
        viewBox = '0 0 200 200';
      }

      // add pid attr, for css
      var shapeReg = /<(path|rect|circle|polygon|line|polyline|ellipse)\s/gi;
      var id = 0;
      data = data.replace(shapeReg, function (match) {
        return match + ('pid="' + id++ + '" ');
      });

      // rename fill and stroke. (It can restroe in vue-svgicon)
      var styleShaeReg = /<(path|rect|circle|polygon|line|polyline|g|ellipse).+>/gi;
      var styleReg = /fill=\"|stroke="/gi;
      data = data.replace(styleShaeReg, function (shape) {
        return shape.replace(styleReg, function (styleName) {
          return '_' + styleName;
        });
      });

      // replace element id, make sure ID is unique. fix #16
      var idReg = /svgicon-(\w)/g;
      data = data.replace(idReg, function (match, elId) {
        return 'svgicon-' + filePath.replace(/[\\\/]/g, '-') + name + '-' + elId;
      });

      // escape single quotes
      data = data.replace(/\'/g, '\\\'');

      var content = compile(tpl, {
        name: '' + filePath + name,
        width: parseFloat(result.info.width) || 16,
        height: parseFloat(result.info.height) || 16,
        viewBox: '\'' + viewBox + '\'',
        data: data
      });

      fs.writeFileSync(path.join(targetPath, filePath, name + ('.' + ext)), content, 'utf-8');
      console.log(colors.yellow('Generated icon: ' + filePath + name));

      if (ix === files.length - 1) {
        generateIndex(files);
      }
    });
  });
});
