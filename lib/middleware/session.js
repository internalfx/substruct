const crypto = require('crypto')
const lruCache = require('lru-cache')
const hash = require('object-hash')

const createToken = function (length) {
  let chars = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let charLength = chars.length
  let bytes = crypto.randomBytes(length)

  let value = bytes.map(function (byte) {
    return chars[byte % charLength]
  })

  return value.join('')
}

module.exports = function (config) {
  let loadSession = config.session.load
  let saveSession = config.session.save
  let cookieName = config.session.sessionCookieName
  let cache = lruCache({
    max: 10000
  })

  return async function (ctx, next) {
    let token
    let session

    if (ctx.header[cookieName]) {
      token = ctx.header[cookieName]
    } else if (ctx.cookies.get(cookieName)) {
      token = ctx.cookies.get(cookieName)
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
      ctx.cookies.set(cookieName, token, {maxAge: config.session.sessionCookieMaxAge})
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
