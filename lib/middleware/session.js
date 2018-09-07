
const hash = require('object-hash')
const crypto = require('crypto')

const createToken = function (length) {
  let chars = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let charLength = chars.length
  let bytes = Array.from(crypto.randomBytes(length))

  let value = bytes.map(function (byte) {
    return chars[byte % charLength]
  })

  return value.join('')
}

module.exports = function (config) {
  let loadSession = config.session.load
  let saveSession = config.session.save
  let cookieName = config.session.sessionCookieName

  return async function (ctx, next) {
    let token

    if (ctx.header[cookieName]) {
      token = ctx.header[cookieName]
    } else if (ctx.cookies.get(cookieName)) {
      token = ctx.cookies.get(cookieName)
    }

    if (token == null) {
      token = createToken(40)
      ctx.cookies.set(cookieName, token, { maxAge: config.session.sessionCookieMaxAge })
    }

    ctx.state.session = await loadSession(token)

    let prevSession = hash(ctx.state.session)

    await next()

    let nextSession = hash(ctx.state.session)

    if (nextSession !== prevSession) {
      await saveSession(token, ctx.state.session)
    }
  }
}
