
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

  let parseToken = function (header) {
    let token = /Bearer\s([a-zA-Z0-9]+)/.exec(decodeURI(header))
    if (token) {
      return token[1]
    }
  }

  return async function (ctx, next) {
    let token

    if (ctx.header['authorization']) {
      token = parseToken(ctx.header['authorization'])
    } else if (ctx.header[cookieName]) {
      token = ctx.header[cookieName]
    } else if (ctx.cookies.get(cookieName)) {
      token = parseToken(ctx.cookies.get(cookieName))
    }

    if (token == null || token.length < 40) {
      token = createToken(40)
    }

    ctx.state.session = await loadSession(token)
    ctx.state.token = token

    let prevSession = hash(ctx.state.session)

    await next()

    let nextSession = hash(ctx.state.session)

    if (nextSession !== prevSession) {
      await saveSession(token, ctx.state.session)
    }
  }
}
