
module.exports = {
  koa: {
    proxy: false
  },
  koaBody: {},
  middleware: [
    'performance',
    'body',
    'httpError',
    'session',
    'router'
  ],
  port: 8000,
  services: [],
  session: {
    sessionCookieName: 'x-substruct-token',
    sessionCookieMaxAge: 1000 * 60 * 60 * 24 * 365,
    load: function (token) {
      return null
    },
    save: function (token, data) {
      return null
    }
  },
  templateEngine: 'ejs'
}
