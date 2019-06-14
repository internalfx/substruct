
module.exports = {
  koa: {
    proxy: false
  },
  koaBody: {},
  middleware: [
    'performance',
    'body',
    'httpError',
    'router'
  ],
  port: 8000,
  services: []
}
