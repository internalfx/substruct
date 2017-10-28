let substruct
let meta = {}

const path = require('path')
const minimist = require('minimist')
const Koa = require('koa')
const requireAll = require('require-all')

let defaultConfig = require('./defaults/config')

let argv = minimist(process.argv.slice(2))

let appDir = process.cwd()
let config = require(path.join(appDir, 'config', 'config.js'))
let env = require(path.join(appDir, 'config', 'env', argv.prod ? 'prod.js' : 'dev.js'))

config = Object.assign({}, defaultConfig, config, env)

config.appDir = appDir
config.apiDir = path.join(appDir, 'api')
config.confDir = path.join(appDir, 'config')

let koa = new Koa()
koa.proxy = config.koa.proxy

let init = async function () {
  var builtInMiddleware = requireAll({
    dirname: path.join(__dirname, 'lib', 'middleware')
  })

  var customMiddleware = requireAll({
    dirname: path.join(config.appDir, 'middleware')
  })

  let middleware = Object.assign({}, builtInMiddleware, customMiddleware)

  console.log(`============ Loading MiddleWare ===========`)
  for (let name of config.middleware) {
    console.log(name)
    if (middleware[name] == null) {
      throw new Error(`Middleware "${name}" does not exist`)
    }
    koa.use(middleware[name](config))
  }
  console.log(`*******************************************`)

  return substruct
}

substruct = Object.freeze({
  config,
  koa,
  meta,
  init
})

module.exports = substruct
