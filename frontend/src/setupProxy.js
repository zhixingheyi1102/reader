const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // 代理API请求到后端
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
    })
  );
  
  // 代理分析请求到后端
  app.use(
    '/analyze',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
    })
  );
};