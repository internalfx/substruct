
const _ = require('lodash')
const path = require('path')
const pathToRegexp = require('path-to-regexp')
const requireAll = require('require-all')
const consolidate = require('consolidate')

const collapse = function (obj, depth) {
  let output = {}
  depth = depth || []
  Object.keys(obj).forEach(function (key) {
    let val = obj[key]
    if (_.isFunction(val) || _.isString(val) || _.isArray(val) || _.isBoolean(val)) {
      Object.assign(output, {[depth.concat([key]).join('.')]: val})
    } else if (_.isObject(val)) {
      Object.assign(output, collapse(val, depth.concat([key])))
    }
  })
  return output
}

module.exports = function (config) {
  const routeConfig = require(path.join(config.confDir, 'routes.js'))
  const policyConfig = collapse(require(path.join(config.confDir, 'policies.js')))
  const arrayQueryTest = /^\w+\[]$/

  let controllers = collapse(requireAll({
    dirname: path.join(config.apiDir, 'controllers'),
    filter: /(.+Controller)\.js$/,
    recursive: true
  }))

  let policies = collapse(requireAll({
    dirname: path.join(config.apiDir, 'policies'),
    filter: /(.+)\.js$/,
    recursive: true
  }))

  let policyMap = {}

  if (policyConfig['*'] == null) {
    console.log('policy.js must have default policy "*" defined.')
    process.exit()
  }

  Object.keys(controllers).map(function (key, idx) {
    let parts = key.split('.')
    let policy = policyConfig[parts.join('.')]

    while (policy == null) {
      let lastPart = parts.pop()
      if (lastPart === '*') {
        parts.pop()
      }
      parts.push('*')
      policy = policyConfig[parts.join('.')]
    }

    policyMap[key] = policy
  })

  let routeMap = Object.keys(routeConfig).map(function (address, idx) {
    let target = routeConfig[address]
    let route = {}

    // Parse address
    address = address.split(' ')
    if (address.length < 2) {
      route.method = 'get'
      route.path = address[0]
    } else {
      route.method = address[0]
      route.path = address[1]
    }

    // Parse Target
    if (_.isString(target)) {
      Object.assign(route, { controller: target })
    } else {
      Object.assign(route, target)
    }

    route.keys = []
    route.re = pathToRegexp(route.path, route.keys)

    return route
  })

  let policyCheck = function (ctx, policy) {
    if (policies[policy]) {
      return policies[policy](ctx)
    } else {
      return false
    }
  }

  if (config.templateEngine === 'nunjucks') {
    let nunjucks = require('nunjucks')
    var env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(config.apiDir, 'views'), {noCache: config.env === 'development'}))
    consolidate.requires.nunjucks = env
  }

  return async function (ctx, next) {
    ctx.render = async function (templatePath, context) {
      let defaultCtx = {
        production: config.env === 'production',
        development: config.env === 'development',
        path: ctx.path,
        method: ctx.method
      }

      let locals = Object.assign({cache: config.production}, defaultCtx, ctx.state, context)
      let output = await consolidate[config.templateEngine](path.join(config.apiDir, 'views', templatePath), locals)
      return output
    }

    for (let route of routeMap) {
      if (route.method.toLowerCase() === ctx.method.toLowerCase() && route.re.test(ctx.path)) {
        ctx.state.hasRoute = true
        let routePolicy
        let allowed = true
        let pathData = route.re.exec(ctx.path)
        pathData.shift()
        ctx.state.params = Object.assign({}, ctx.query)
        Object.keys(ctx.query).forEach((key) => {
          if (arrayQueryTest.test(key)) {
            let val = ctx.query[key]
            delete ctx.state.params[key]
            if (!_.isArray(val)) {
              val = [val]
            }
            ctx.state.params[key.slice(0, -2)] = val
          }
        })

        route.keys.forEach((key, idx) => {
          ctx.state.params[key.name] = pathData[idx]
        })

        if (!controllers[route.controller]) {
          ctx.throw(500, `controller or method "${route.controller}" missing.`)
        }

        if (_.has(policyMap, route.controller)) {
          routePolicy = policyMap[route.controller]
        } else {
          ctx.throw(500, `No policy can be found for controller.action "${route.controller}"`)
        }

        if (routePolicy === false) {
          allowed = false
        } else if (_.isString(routePolicy)) {
          routePolicy = [routePolicy]
        }

        if (routePolicy !== true) {
          for (let policy of routePolicy) {
            let result = await policyCheck(ctx, policy)
            if (result !== true) {
              allowed = false
            }
          }
        }

        if (allowed) {
          await controllers[route.controller](ctx)
        }

        break
      }
    }

    await next()
  }
}
