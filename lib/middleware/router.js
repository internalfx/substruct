
const _ = require('lodash')
const path = require('path')
const { pathToRegexp } = require('path-to-regexp')
const requireAll = require('require-all')

const collapse = function (obj, depth) {
  const output = {}
  depth = depth || []
  Object.keys(obj).forEach(function (key) {
    const val = obj[key]
    if (_.isFunction(val) || _.isString(val) || _.isArray(val) || _.isBoolean(val)) {
      Object.assign(output, { [depth.concat([key]).join('.')]: val })
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

  const controllers = collapse(requireAll({
    dirname: path.join(config.apiDir, 'controllers'),
    filter: /(.+Controller)\.js$/,
    recursive: true
  }))

  const policies = collapse(requireAll({
    dirname: path.join(config.apiDir, 'policies'),
    filter: /(.+)\.js$/,
    recursive: true
  }))

  const policyMap = {}

  if (policyConfig['*'] == null) {
    console.log('policy.js must have default policy "*" defined.')
    process.exit()
  }

  Object.keys(controllers).map(function (key, idx) {
    const parts = key.split('.')
    let policy = policyConfig[parts.join('.')]

    while (policy == null) {
      const lastPart = parts.pop()
      if (lastPart === '*') {
        parts.pop()
      }
      parts.push('*')
      policy = policyConfig[parts.join('.')]
    }

    policyMap[key] = policy
  })

  const routeMap = Object.keys(routeConfig).map(function (address, idx) {
    const target = routeConfig[address]
    const route = {}

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

  const policyCheck = function (ctx, policy) {
    if (policies[policy]) {
      return policies[policy](ctx)
    } else {
      return false
    }
  }

  return async function (ctx, next) {
    const route = routeMap.find(function (route) {
      return route.method.toLowerCase() === ctx.method.toLowerCase() && route.re.test(ctx.path)
    })

    if (route) {
      ctx.state.hasRoute = true
      let routePolicy
      let allowed = true
      const pathData = route.re.exec(ctx.path)
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
        for (const policy of routePolicy) {
          const result = await policyCheck(ctx, policy)
          if (result !== true) {
            allowed = false
          }
        }
      }

      if (allowed) {
        await controllers[route.controller](ctx)
      }
    }

    await next()
  }
}
