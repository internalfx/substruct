let substruct
let meta = {}
let services = {}

const Promise = require('bluebird')
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
config.sysDir = path.join(appDir, 'system')

let koa = new Koa()
koa.proxy = config.koa.proxy

let init = async function () {
  // Initialize Services
  let rawServices = requireAll({
    dirname: path.join(config.sysDir, 'services')
  })

  for (let name of config.services) {
    let fn = rawServices[name]
    substruct.services[name] = await Promise.resolve(fn(config))
  }

  // Initialize Middleware
  let builtInMiddleware = requireAll({
    dirname: path.join(__dirname, 'lib', 'middleware')
  })

  let customMiddleware = requireAll({
    dirname: path.join(config.sysDir, 'middleware')
  })

  let middleware = Object.assign({}, builtInMiddleware, customMiddleware)

  for (let name of config.middleware) {
    if (middleware[name] == null) {
      throw new Error(`Middleware "${name}" does not exist`)
    }
    koa.use(middleware[name](config))
  }

  return substruct
}

substruct = Object.freeze({
  config,
  koa,
  meta: {},
  services,
  init
})

module.exports = substruct
