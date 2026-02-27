const http = require('http');
const net = require('net');

function forwardRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    // Build clean headers for n8n
    const h = { 'host': 'localhost:5678', 'connection': 'close' };
    if (headers['content-type']) h['content-type'] = headers['content-type'];
    if (headers['cookie']) h['cookie'] = headers['cookie'];
    if (headers['authorization']) h['authorization'] = headers['authorization'];
    if (headers['accept']) h['accept'] = headers['accept'];
    if (body.length > 0) h['content-length'] = String(body.length);

    // Build raw HTTP request
    let raw = `${method} ${url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(h)) raw += `${k}: ${v}\r\n`;
    raw += '\r\n';

    // Send headers + body in single TCP write
    const payload = body.length > 0
      ? Buffer.concat([Buffer.from(raw), body])
      : Buffer.from(raw);

    const sock = net.connect({ port: 5678, host: '127.0.0.1' }, () => {
      sock.setNoDelay(true);
      sock.write(payload);
    });

    const bufs = [];
    sock.on('data', d => bufs.push(d));
    sock.on('end', () => resolve(Buffer.concat(bufs)));
    sock.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const raw = await forwardRequest(req.method, req.url, req.headers, body);

    // Parse HTTP response
    const headerEnd = raw.indexOf('\r\n\r\n');
    if (headerEnd === -1) { res.writeHead(502); res.end(); return; }

    const headerStr = raw.slice(0, headerEnd).toString();
    const resBody = raw.slice(headerEnd + 4);
    const lines = headerStr.split('\r\n');
    const statusCode = parseInt(lines[0].split(' ')[1], 10) || 502;

    const resHeaders = {};
    for (let i = 1; i < lines.length; i++) {
      const idx = lines[i].indexOf(': ');
      if (idx > 0) {
        const key = lines[i].substring(0, idx).toLowerCase();
        if (key === 'transfer-encoding' || key === 'content-length') continue;
        resHeaders[key] = lines[i].substring(idx + 2);
      }
    }
    resHeaders['content-length'] = String(resBody.length);
    res.writeHead(statusCode, resHeaders);
    res.end(resBody);
  } catch (err) {
    res.writeHead(502);
    res.end('Bad Gateway');
  }
});

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  const h = {
    'host': 'localhost:5678',
    'upgrade': req.headers['upgrade'],
    'connection': req.headers['connection'],
    'sec-websocket-key': req.headers['sec-websocket-key'],
    'sec-websocket-version': req.headers['sec-websocket-version'],
  };
  if (req.headers['sec-websocket-protocol']) h['sec-websocket-protocol'] = req.headers['sec-websocket-protocol'];
  if (req.headers['cookie']) h['cookie'] = req.headers['cookie'];

  let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(h)) if (v) raw += `${k}: ${v}\r\n`;
  raw += '\r\n';

  const proxySocket = net.connect({ port: 5678, host: '127.0.0.1' }, () => {
    proxySocket.write(raw);
  });
  proxySocket.on('data', d => socket.write(d));
  socket.on('data', d => proxySocket.write(d));
  proxySocket.on('end', () => socket.end());
  socket.on('end', () => proxySocket.end());
  proxySocket.on('error', () => socket.destroy());
  socket.on('error', () => proxySocket.destroy());
});

server.listen(5680, '0.0.0.0', () => console.log('Proxy listening on :5680'));
