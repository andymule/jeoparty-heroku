const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = 'http://localhost:5005';
  const debug = true;

  // Create a proxy middleware with logging
  const createProxy = (pathPattern, options = {}) => {
    const defaultOptions = {
      target,
      changeOrigin: true,
      logLevel: debug ? 'debug' : 'silent',
      onProxyReq: (proxyReq, req, res) => {
        if (debug) {
          console.log(`[PROXY] ${req.method} ${req.url} -> ${target}${req.url}`);
          
          if (req.body) {
            console.log(`[PROXY] Request body:`, req.body);
          }
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        if (debug) {
          console.log(`[PROXY] Response status: ${proxyRes.statusCode}`);
        }
      },
      onError: (err, req, res) => {
        console.error(`[PROXY] Error:`, err);
      },
    };

    return createProxyMiddleware(pathPattern, { ...defaultOptions, ...options });
  };

  // API requests
  app.use('/api', createProxy('/api'));
  
  // Handle direct routes without /api prefix
  app.use('/games', createProxy('/games'));
  app.use('/games/create', createProxy('/games/create'));
  app.use('/test-endpoint', createProxy('/test-endpoint'));
  
  // Socket.io proxy (websocket support)
  app.use('/socket.io', createProxy('/socket.io', { ws: true }));
}; 