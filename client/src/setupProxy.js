const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = process.env.REACT_APP_SERVER_URL || 'http://localhost:5005';
  const debug = true;

  console.log(`[PROXY] Setting up proxy to server at: ${target}`);

  // Create a proxy middleware with logging
  const createProxy = (pathPattern, options = {}) => {
    const defaultOptions = {
      target,
      changeOrigin: true,
      secure: false,
      logLevel: debug ? 'debug' : 'silent',
      pathRewrite: { [`^${pathPattern}`]: pathPattern },
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
        console.error(`[PROXY] Error connecting to ${target}. Is the server running?`);
        
        // Handle the error more gracefully
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            message: `Proxy error: Could not connect to backend server at ${target}`,
            error: err.message 
          }));
        }
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
  app.use('/socket.io', createProxy('/socket.io', { 
    ws: true,
    changeOrigin: true 
  }));
}; 