
const _ = require('lodash')
const path = require('path')
const ejs = require('ejs')
const pathToRegexp = require('path-to-regexp')
const requireAll = require('require-all')

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
    let partialMatch = key.split('.')
    partialMatch[1] = '*'
    partialMatch = partialMatch.join('.')
    if (policyConfig[key] != null) {
      policyMap[key] = policyConfig[key]
    } else if (policyConfig[partialMatch] != null) {
      policyMap[key] = policyConfig[partialMatch]
    } else {
      policyMap[key] = policyConfig['*']
    }
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

  let policyCheck = async function (ctx, policy) {
    if (policies[policy]) {
      return policies[policy](ctx)
    } else {
      return false
    }
  }

  let ofaf = function () {
    let obj = function (val) {
      if (val === false) {
        obj.val = false
      } else if (typeof val === 'undefined') {
        return obj.val
      }
    }
    obj.val = true
    return obj
  }

  let ejsOpts = {
    _with: false,
    cache: config.production
  }

  return async function (ctx, next) {
    ctx.render = function (templatePath, context) {
      let defaultCtx = {
        production: config.production,
        path: ctx.path
      }

      let locals = Object.assign({}, defaultCtx, ctx.state, context)
      ejs.renderFile(path.join(config.apiDir, 'views', templatePath), locals, ejsOpts, function (err, str) {
        if (err) {
          ctx.throw(500, err)
        } else {
          ctx.body = str
        }
      })
    }

    for (let route of routeMap) {
      if (route.method === ctx.method.toLowerCase() && route.re.test(ctx.path)) {
        ctx.state.hasRoute = true
        let routePolicy
        let allowed = ofaf()
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
          ctx.throw(403)
        } else if (_.isString(routePolicy)) {
          routePolicy = [routePolicy]
        }

        if (routePolicy !== true) {
          for (let policy of routePolicy) {
            allowed(await policyCheck(ctx, policy))
          }
        }

        if (allowed()) {
          await controllers[route.controller](ctx)
        }

        break
      }
    }

    await next()
  }
}
