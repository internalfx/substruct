let crypto = require('crypto')
let headerKey = 'x-fusion-token'

const cache = require('lru-cache')({
  max: 10000
})
const hash = require('object-hash')

const createToken = function (length) {
  let chars = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let charLength = chars.length
  let bytes = crypto.randomBytes(length)
  let value = []

  for (let i = 0; i < length; i += 1) {
    value.push(chars[bytes[i] % charLength])
  }

  return value.join('')
}

module.exports = function (config) {
  let loadSession = config.session.load
  let saveSession = config.session.save

  return async function (ctx, next) {
    let token
    let session

    if (ctx.header[headerKey]) {
      token = ctx.header[headerKey]
    } else if (ctx.cookies.get(headerKey)) {
      token = ctx.cookies.get(headerKey)
    }

    if (token) {
      session = cache.get(token)

      if (session == null) {
        let storedSession = await loadSession(token)

        if (storedSession != null) {
          session = storedSession.data
          cache.set(token, session)
        }
      }
    }

    if (session == null) {
      token = createToken(40)

      session = {}
      ctx.cookies.set(headerKey, token, {maxAge: 365 * 24 * 60 * 60 * 1000})
      cache.set(token, session)
    }

    ctx.state.session = session
    let prevSession = hash(session)

    await next()

    let nextSession = hash(session)

    if (nextSession !== prevSession) {
      cache.set(token, session)
      await saveSession(token, session)
    }
  }
}
