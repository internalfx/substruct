let substruct = require('../../index.js')
let cookie = require('cookie')

module.exports = async function (config) {
  let loadSession = config.session.load
  let cookieName = config.session.sessionCookieName

  let io = require('socket.io')(substruct.server, {
    allowRequest: async function (request, cb) {
      let cookies = cookie.parse(request.headers.cookie)
      let token = cookies[cookieName]
      let session = await loadSession(token)
      cb(null, session.userId != null)
    }
  })
  return io
}
