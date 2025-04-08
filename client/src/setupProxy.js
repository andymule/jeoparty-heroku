const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
    })
  );
  
  // Handle direct /games endpoint for compatibility
  app.use(
    '/games',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
    })
  );
  
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
      ws: true,
    })
  );
}; 