const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Forward all /api/* requests to the server
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
      pathRewrite: { '^/api': '/api' }, // Don't rewrite the path
    })
  );
  
  // Forward all /socket.io requests to the server
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
      ws: true,
    })
  );
}; 