const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

// Determine if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  // Use a more browser-compatible source map in development that has fewer issues
  devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
  stats: {
    warningsFilter: [
      // Filter out source map warnings
      /Failed to parse source map/,
      /source map from/,
      /ModuleSockit/
    ],
    // Only show errors in the output
    logging: 'error'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|gif|svg|mp3|wav)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'assets/'
            }
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      favicon: './public/favicon.ico'
    }),
    new Dotenv(),
    // Define additional environment variables
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.REACT_APP_DEBUG_SOCKETS': JSON.stringify(process.env.REACT_APP_DEBUG_SOCKETS || 'false')
    })
  ],
  devServer: {
    historyApiFallback: true,
    port: 3001,
    host: '0.0.0.0',
    hot: true,
    allowedHosts: 'all',
    client: {
      webSocketURL: {
        hostname: 'localhost',
        pathname: '/ws',
        port: 3001,
        protocol: 'ws',
      },
      overlay: {
        errors: true,
        warnings: false,
      },
      progress: false,
      reconnect: 5,
      logging: 'error', // Only show errors in client console
    },
    webSocketServer: {
      type: 'ws',
      options: {
        maxPayload: 1024 * 1024, // 1mb
        path: '/ws',
      }
    },
    proxy: [
      {
        context: ['/api', '/games', '/games/create', '/test-endpoint', '/socket.io'],
        target: 'http://localhost:5005',
        secure: false,
        changeOrigin: true,
        ws: true,
        pathRewrite: {
          '^/socket.io': '/socket.io',
        },
        onProxyReqWs: (proxyReq, req, socket) => {
          socket.on('error', (err) => {
            // Socket errors should be silent by default
            if (process.env.REACT_APP_DEBUG_SOCKETS === 'true') {
              console.warn('WebSocket proxy error:', err);
            }
          });
          
          socket.setKeepAlive(true, 30000);
        },
        logLevel: 'silent' // Don't log proxy messages by default
      }
    ],
    devMiddleware: {
      writeToDisk: false,
    },
    static: {
      directory: path.resolve(__dirname, 'public'),
      publicPath: '/',
      watch: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
    }
  }
}; 