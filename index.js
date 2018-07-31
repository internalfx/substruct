
let Promise = require('bluebird')
let path = require('path')
let Koa = require('koa')
let requireAll = require('require-all')
let fs = require('fs')
let configured = false
let substruct = {}
let services = {}
let config = require('./defaults/config')
let koa = new Koa()

substruct.configure = function (spec = {}) {
  if (configured) { return }
  let manualConfig = spec.config || {}

  let appDir = spec.appDir || process.cwd()
  let configDir = path.join(appDir, 'config')

  if (fs.existsSync(path.join(configDir, 'config.js'))) {
    Object.assign(config, require(path.join(configDir, 'config.js')))
  }

  config.env = process.env.NODE_ENV || 'development'

  let envConfig = (function () {
    let prodEnvPath = path.join(configDir, 'env', 'prod.js')
    let devEnvPath = path.join(configDir, 'env', 'dev.js')

    if (config.env === 'production' && fs.existsSync(prodEnvPath)) {
      return require(prodEnvPath)
    } else if (config.env === 'development' && fs.existsSync(devEnvPath)) {
      return require(devEnvPath)
    } else {
      return {}
    }
  }())

  Object.assign(config, envConfig, manualConfig)

  config.appDir = appDir
  config.apiDir = path.join(appDir, 'api')
  config.confDir = path.join(appDir, 'config')
  config.sysDir = path.join(appDir, 'system')

  koa.proxy = config.koa.proxy

  configured = true
}

substruct.start = async function () {
  if (configured !== true) {
    throw new Error('Substruct has not been configured yet! Call substruct.configure() before start()')
  }
  console.log(`**************** SUBSTRUCT SERVER ***************`)
  console.log(`*  env = '${config.env}'`)
  console.log(`*************************************************`)
  // Initialize Services
  let rawServices = requireAll({
    dirname: path.join(config.sysDir, 'services')
  })

  for (let name of config.services) {
    if (rawServices[name] == null) {
      throw new Error(`"${name}" service not found.`)
    }
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
      throw new Error(`"${name}" middleware not found.`)
    }
    koa.use(middleware[name](config))
  }

  return substruct
}

substruct.config = config
substruct.koa = koa
substruct.meta = {}
substruct.services = services

module.exports = substruct
