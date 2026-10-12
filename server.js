/**
 * Local Development & Amazon Connect Authentication Server (Node.js)
 * 
 * Capabilities:
 * 1. Serves the static website files (index.html, styles.css, app.js, screenshot).
 * 2. Implements /api/chat-auth: Issues signed JWT tokens for Amazon Connect Authenticated Chat.
 * 3. Implements /api/start-chat: Demonstrates AWS Connect StartChatContact API proxy.
 * 
 * Zero external dependencies required - uses Node.js standard library!
 * Run with: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = __dirname;

// In a production environment, this secret matches the AWS Connect Customer Verification Key
const JWT_SECRET = process.env.CONNECT_JWT_SECRET || 'prototype-amazon-connect-secret-key-2026';

// Optional AWS Connect instance configuration
const CONNECT_CONFIG = {
  instanceId: process.env.CONNECT_INSTANCE_ID || '11111111-2222-3333-4444-555555555555',
  contactFlowId: process.env.CONNECT_CONTACT_FLOW_ID || '66666666-7777-8888-9999-000000000000',
  region: process.env.AWS_REGION || 'us-east-1'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Base64URL encoding helper for JWT
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Creates a signed JWT token (HS256) for Amazon Connect
 */
function createConnectJwt(claims) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: claims.customerId || 'BOI-CUST-984210',
    iat: now,
    exp: now + 3600, // Valid for 1 hour
    attributes: {
      customerName: claims.customerName || 'Rahul Sharma',
      customerId: claims.customerId || 'BOI-CUST-984210',
      accountType: claims.accountType || 'Premium Savings',
      authenticated: 'true',
      source: 'Local-Prototype-Dev'
    }
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    token: `${encodedHeader}.${encodedPayload}.${signature}`,
    payload
  };
}

/**
 * Read request body as JSON
 */
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  // Add CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --------------------------------------------------------------------------
  // API Endpoint: /api/chat-auth
  // Issues signed JWT for Amazon Connect authenticated widget
  // --------------------------------------------------------------------------
  if (pathname === '/api/chat-auth' && (req.method === 'GET' || req.method === 'POST')) {
    const body = req.method === 'POST' ? await parseRequestBody(req) : {};
    const { token, payload } = createConnectJwt(body);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Authentication token generated successfully for local Amazon Connect session.',
      jwtToken: token,
      claims: payload,
      expiresInSeconds: 3600
    }, null, 2));
    return;
  }

  // --------------------------------------------------------------------------
  // API Endpoint: /api/start-chat
  // Backend proxy for StartChatContact API call
  // --------------------------------------------------------------------------
  if (pathname === '/api/start-chat' && req.method === 'POST') {
    const body = await parseRequestBody(req);
    const participantName = body.participantName || 'Authenticated Customer';
    const customerId = body.customerId || 'BOI-CUST-984210';

    // Mock response demonstrating Amazon Connect StartChatContact response structure
    const contactId = crypto.randomUUID();
    const participantId = crypto.randomUUID();
    const participantToken = base64UrlEncode(crypto.randomBytes(32).toString('hex'));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      mode: 'Local Prototype Response',
      ContactId: contactId,
      ParticipantId: participantId,
      ParticipantToken: participantToken,
      instanceId: CONNECT_CONFIG.instanceId,
      contactFlowId: CONNECT_CONFIG.contactFlowId,
      participantDetails: {
        DisplayName: participantName,
        CustomerId: customerId
      },
      note: 'In live production with AWS SDK, this endpoint executes: new StartChatContactCommand(...) using your AWS IAM credentials.'
    }, null, 2));
    return;
  }

  // --------------------------------------------------------------------------
  // Static File Serving
  // --------------------------------------------------------------------------
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Security check to avoid directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Amazon Connect Chat Widget Local Server Running!`);
  console.log(`=============================================================`);
  console.log(`🌐 Website URL:          http://localhost:${PORT}`);
  console.log(`🔑 Auth Endpoint:        http://localhost:${PORT}/api/chat-auth`);
  console.log(`📡 StartChat Endpoint:   http://localhost:${PORT}/api/start-chat`);
  console.log(`-------------------------------------------------------------`);
  console.log(`⚠️  Amazon Connect Whitelist Note:`);
  console.log(`   Make sure http://localhost:${PORT} is added to Approved Origins`);
  console.log(`   in AWS Console -> Amazon Connect -> Approved Origins!`);
  console.log(`=============================================================\n`);
});

