
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
let http = require('http')
let argv = require('minimist')(process.argv.slice(2))

substruct.configure = function (manualConfig = {}) {
  if (configured) { return }

  let appDir = manualConfig.appDir || process.cwd()
  let configDir = path.join(appDir, 'config')

  if (fs.existsSync(path.join(configDir, 'config.js'))) {
    Object.assign(config, require(path.join(configDir, 'config.js')))
  }

  config.env = (function () {
    if (argv['prod'] === true) {
      return 'production'
    }

    if (process.env.NODE_ENV != null) {
      return process.env.NODE_ENV
    }

    return 'development'
  }())

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

  return config
}

substruct.start = async function () {
  if (configured !== true) {
    throw new Error('Substruct has not been configured yet! Call substruct.configure() before start()')
  }
  console.log(`**************** SUBSTRUCT SERVER ***************`)
  console.log(`*  env = '${config.env}'`)
  console.log(`*************************************************`)

  // Initialize Services
  let builtInServices = requireAll({
    dirname: path.join(__dirname, 'lib', 'services')
  })

  let customServices = requireAll({
    dirname: path.join(config.sysDir, 'services')
  })

  let services = Object.assign({}, builtInServices, customServices)

  for (let name of config.services) {
    if (services[name] == null) {
      throw new Error(`"${name}" service not found.`)
    }
    let fn = services[name]
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

  substruct.server.listen(config.port)

  return substruct
}

substruct.stop = async function () {
  console.log('Stopping server...')
  substruct.server.close()
}

substruct.config = config
substruct.koa = koa
substruct.server = http.createServer(koa.callback())
substruct.meta = {}
substruct.services = services

module.exports = substruct
