
const path = require('path')
const minimist = require('minimist')
const Koa = require('koa')
const requireAll = require('require-all')

let defaultConfig = require('./defaults/config')

let argv = minimist(process.argv.slice(2))
let singleton

let Substruct = function () {
  if (singleton) { return singleton }

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
    await config.beforeMiddleware({koa, config})

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

    await config.afterMiddleware({koa, config})

    let server = require('http').createServer(koa.callback())

    server.listen(config.port)
    console.log('Server Started...')
  }

  singleton = Object.freeze({
    config,
    koa,
    init
  })

  return singleton
}

module.exports = Substruct
