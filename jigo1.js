const http = require('http');
const httpProxy = require('http-proxy');

// CONFIGURATION
const TARGET = 'https://qa-back-cms.crocobet.com';
const FAKE_ORIGIN = 'https://crocobet.com';
const PORT = 3015;

const proxy = httpProxy.createProxyServer({
    target: TARGET,
    changeOrigin: true,
    secure: true,
    autoRewrite: true,
    followRedirects: false,
    selfHandleResponse: false
});

// Modify outgoing request headers
proxy.on('proxyReq', (proxyReq, req, res, options) => {
    // Spoof origin/referer
    proxyReq.setHeader('Origin', FAKE_ORIGIN);
    proxyReq.setHeader('Referer', FAKE_ORIGIN + '/');

    // Standard browser User-Agent
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Remove headers that might cause issues
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');

    // Forward cookies from the client
    if (req.headers.cookie) {
        proxyReq.setHeader('Cookie', req.headers.cookie);
    }

    console.log(`[REQ] ${req.method} ${req.url}`);
});

// Modify incoming response headers
proxy.on('proxyRes', (proxyRes, req, res) => {
    // Fix Set-Cookie headers for localhost usage
    const setCookie = proxyRes.headers['set-cookie'];
    if (setCookie) {
        const modifiedCookies = setCookie.map(cookie => {
            return cookie
                .replace(/;\s*Secure/gi, '')           // Remove Secure flag
                .replace(/;\s*SameSite=\w+/gi, '')     // Remove SameSite
                .replace(/;\s*Domain=[^;]+/gi, '');    // Remove Domain restriction
        });
        proxyRes.headers['set-cookie'] = modifiedCookies;
    }

    // Remove restrictive headers
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['x-content-type-options'];
    delete proxyRes.headers['strict-transport-security'];

    console.log(`[RES] ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    console.error('[ERROR]', err.message);
    if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
        res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
    }
});

// Create HTTP server
const server = http.createServer((req, res) => {
    // Echo back the requesting origin (required for credentials)
    const requestOrigin = req.headers.origin || '*';

    // Echo back whatever headers the client wants to send (allow all)
    const requestedHeaders = req.headers['access-control-request-headers'] || 'Content-Type, Authorization';

    // Set CORS headers for browser access
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Authorization, Content-Length');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Proxy the request
    proxy.web(req, res);
});

// WebSocket support
server.on('upgrade', (req, socket, head) => {
    console.log(`[WS] Upgrading connection for ${req.url}`);
    proxy.ws(req, socket, head);
});

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`REST API Proxy Server`);
    console.log('='.repeat(50));
    console.log(`Local:    http://localhost:${PORT}`);
    console.log(`Target:   ${TARGET}`);
    console.log(`Origin:   ${FAKE_ORIGIN}`);
    console.log('='.repeat(50));
    console.log('Ready to proxy requests...\n');
});
