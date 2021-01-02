
const Promise = require('bluebird')
const path = require('path')
const Koa = require('koa')
const requireAll = require('require-all')
const fs = require('fs')
let configured = false
let loaded = false
const substruct = {}
const config = require('./defaults/config')
const koa = new Koa()
const http = require('http')
const argv = require('minimist')(process.argv.slice(2))
const cors = require('@koa/cors')

substruct.configure = function (manualConfig = {}) {
  if (configured) {
    throw new Error('Substruct has already been configured! You can only call substruct.configure() once before start()')
  }

  const appDir = manualConfig.appDir || process.cwd()
  const configDir = path.join(appDir, 'config')

  if (fs.existsSync(path.join(configDir, 'config.js'))) {
    Object.assign(config, require(path.join(configDir, 'config.js')))
  }

  config.env = (function () {
    if (argv.prod === true) {
      return 'production'
    } else if (argv.prod === false) {
      return 'development'
    }

    if (argv.dev === true) {
      return 'development'
    } else if (argv.dev === false) {
      return 'production'
    }

    if (process.env.NODE_ENV != null) {
      return process.env.NODE_ENV
    }

    return 'development'
  }())

  config.argv = argv
  config.isDevelopment = config.env === 'development'
  config.isProduction = config.env === 'production'

  const envConfig = (function () {
    const prodEnvPath = path.join(configDir, 'env', 'prod.js')
    const devEnvPath = path.join(configDir, 'env', 'dev.js')

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
  koa.use(cors(config.koa.cors))

  configured = true

  return config
}

substruct.load = async function () {
  if (configured !== true) {
    throw new Error('Substruct has not been configured yet! Call substruct.configure() before load()')
  }

  if (loaded) {
    throw new Error('Substruct has already been loaded! You can only call substruct.load() once before start()')
  }

  // Initialize Services
  const builtInServices = requireAll({
    dirname: path.join(__dirname, 'lib', 'services')
  })

  const customServices = requireAll({
    dirname: path.join(config.sysDir, 'services')
  })

  const services = Object.assign({}, builtInServices, customServices)

  for (const name of config.services) {
    if (services[name] == null) {
      throw new Error(`"${name}" service not found.`)
    }
    const fn = services[name]
    substruct.services[name] = await Promise.resolve(fn(config))
  }

  // Initialize Middleware
  const builtInMiddleware = requireAll({
    dirname: path.join(__dirname, 'lib', 'middleware')
  })

  const customMiddleware = requireAll({
    dirname: path.join(config.sysDir, 'middleware')
  })

  const middleware = Object.assign({}, builtInMiddleware, customMiddleware)

  for (const name of config.middleware) {
    if (middleware[name] == null) {
      throw new Error(`"${name}" middleware not found.`)
    }
    koa.use(middleware[name](config))
  }

  loaded = true

  return substruct
}

substruct.start = async function () {
  if (configured !== true) {
    throw new Error('Substruct has not been configured yet! Call substruct.configure() and substruct.load() before start()')
  }

  if (loaded !== true) {
    throw new Error('Substruct has not been loaded yet! Call substruct.load() before start()')
  }

  console.log('****************** SERVER START *****************')
  console.log(`*  env = '${config.env}'`)
  console.log(`*  port = ${config.port}`)
  console.log('*************************************************')

  substruct.server.listen({
    port: config.port,
    host: config.host
  })

  substruct.status = 'running'

  return substruct
}

substruct.stop = async function () {
  console.log('Stopping server...')
  substruct.server.close()
  substruct.status = 'stopped'
}

substruct.status = 'stopped'
substruct.config = config
substruct.koa = koa
substruct.server = http.createServer(koa.callback())
substruct.meta = {}
substruct.services = {}

module.exports = substruct
