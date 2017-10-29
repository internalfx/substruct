const minimist = require('minimist')
let argv = minimist(process.argv.slice(2))

module.exports = {
  development: !argv.prod,
  production: !!argv.prod,

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
