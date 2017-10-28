const minimist = require('minimist')
let argv = minimist(process.argv.slice(2))

module.exports = {
  production: !!argv.prod,
  development: !argv.prod,
  port: 8000,
  mailer: {},
  session: {
    load: function (token) {
      return null
    },
    save: function (token, data) {
      return null
    }
  },
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

  beforeMiddleware: async function () {},
  afterMiddleware: async function () {}
}
