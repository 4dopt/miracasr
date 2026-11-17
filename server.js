const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');

const HTTP_PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * Discover all non-internal IPv4 network interfaces on this machine,
 * sorting physical Wi-Fi / Ethernet LAN addresses ahead of virtual adapters.
 */
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const isVirtual =
          /vethernet|wsl|hyper-v|virtualbox|vmware|docker|vbox|loopback|tailscale|zerotier/i.test(
            name
          ) || addr.address.startsWith('169.254.');
        const isPreferredWireless = /wi-fi|wlan|wireless|ethernet|en0|eth0/i.test(name);

        let priority = 2;
        if (isVirtual) priority = 3;
        else if (isPreferredWireless) priority = 1;

        results.push({
          name,
          address: addr.address,
          isVirtual,
          priority,
        });
      }
    }
  }

  results.sort((a, b) => a.priority - b.priority);
  return results;
}

/**
 * In-memory Room & Peer Registry
 * rooms: Map<roomPin, {
 *   pin: string,
 *   createdAt: number,
 *   broadcasterId: string | null,
 *   broadcasterName: string | null,
 *   streamMode: string | null, // 'webrtc' | 'canvas'
 *   peers: Map<peerId, {
 *     id: string,
 *     ws: WebSocket,
 *     name: string,
 *     deviceType: string,
 *     role: 'viewer' | 'broadcaster',
 *     joinedAt: number
 *   }>
 * }>
 */
const rooms = new Map();

function generatePin() {
  for (let i = 0; i < 100; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(pin)) return pin;
  }
  return String(Date.now()).slice(-4);
}

function getPublicRoomList() {
  const list = [];
  for (const [pin, room] of rooms.entries()) {
    if (room.peers.size === 0) continue;
    const peers = Array.from(room.peers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      deviceType: p.deviceType,
      role: p.role,
    }));
    list.push({
      pin,
      createdAt: room.createdAt,
      broadcasterId: room.broadcasterId,
      broadcasterName: room.broadcasterName,
      streamMode: room.streamMode,
      peerCount: room.peers.size,
      peers,
    });
  }
  return list;
}

function sendJson(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room) {
  const peers = Array.from(room.peers.values()).map((p) => ({
    id: p.id,
    name: p.name,
    deviceType: p.deviceType,
    role: p.role,
  }));

  const stateMsg = {
    type: 'room-state',
    pin: room.pin,
    broadcasterId: room.broadcasterId,
    broadcasterName: room.broadcasterName,
    streamMode: room.streamMode,
    peers,
  };

  for (const peer of room.peers.values()) {
    sendJson(peer.ws, stateMsg);
  }
  broadcastLobbyUpdate();
}

const allSockets = new Set();

function broadcastLobbyUpdate() {
  const payload = {
    type: 'lobby-rooms',
    rooms: getPublicRoomList(),
  };
  for (const ws of allSockets) {
    sendJson(ws, payload);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function handleHttpRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API: Server & LAN discovery info
    if (pathname === '/api/info' && req.method === 'GET') {
      const addresses = getLanAddresses();
      const primaryIp = addresses.length > 0 ? addresses[0].address : '127.0.0.1';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          hostname: os.hostname(),
          platform: os.platform(),
          httpPort: HTTP_PORT,
          httpsPort: HTTPS_PORT,
          primaryIp,
          addresses,
          rooms: getPublicRoomList(),
        })
      );
      return;
    }

    // API: Generate QR Code SVG for any URL
    if (pathname === '/api/qr' && req.method === 'GET') {
      const targetUrl = parsedUrl.searchParams.get('url') || `http://localhost:${HTTP_PORT}`;
      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        margin: 1,
        width: 240,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      });
      res.end(svg);
      return;
    }

    // API: Trigger native Windows Miracast / Project settings on host PC
    if (pathname === '/api/win-miracast' && req.method === 'POST') {
      const remoteAddr = req.socket.remoteAddress || '';
      const isLocal =
        remoteAddr === '127.0.0.1' ||
        remoteAddr === '::1' ||
        remoteAddr === '::ffff:127.0.0.1';

      if (!isLocal) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Native OS shortcuts can only be triggered from the host PC itself.',
          })
        );
        return;
      }

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        let action = 'cast';
        try {
          const parsed = JSON.parse(body || '{}');
          if (parsed.action) action = parsed.action;
        } catch (_) {}

        let cmd = 'start ms-settings:connecteddevices';
        if (action === 'project-settings') {
          cmd = 'start ms-settings:project';
        } else if (action === 'display-displays') {
          cmd = 'DisplaySwitch.exe';
        }

        exec(cmd, (err) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: !err, action }));
        });
      });
      return;
    }

    // Serve static files from public/
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // SPA fallback to index.html
          fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexContent);
          });
        } else {
          res.writeHead(500);
          res.end('Internal server error');
        }
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error');
  }
}

function attachSignalingServer(wss) {
  wss.on('connection', (ws) => {
    allSockets.add(ws);
    let currentPeerId = `peer_${Math.random().toString(36).slice(2, 10)}`;
    let currentRoomPin = null;

    // Immediately send welcome + lobby room list
    sendJson(ws, {
      type: 'welcome',
      peerId: currentPeerId,
      rooms: getPublicRoomList(),
    });

    ws.on('message', (raw, isBinary) => {
      // Binary frames or JSON signaling
      if (isBinary) return;

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }

      switch (msg.type) {
        case 'create-or-join': {
          leaveCurrentRoom();

          const requestedPin = (msg.pin || '').trim();
          const pin =
            requestedPin && /^\d{4,6}$/.test(requestedPin) ? requestedPin : generatePin();

          let room = rooms.get(pin);
          if (!room) {
            room = {
              pin,
              createdAt: Date.now(),
              broadcasterId: null,
              broadcasterName: null,
              streamMode: null,
              peers: new Map(),
            };
            rooms.set(pin, room);
          }

          const peerInfo = {
            id: currentPeerId,
            ws,
            name: (msg.name || 'Wireless Device').slice(0, 40),
            deviceType: msg.deviceType || 'desktop',
            role: 'viewer',
            joinedAt: Date.now(),
          };

          room.peers.set(currentPeerId, peerInfo);
          currentRoomPin = pin;

          sendJson(ws, {
            type: 'joined-room',
            pin,
            peerId: currentPeerId,
            broadcasterId: room.broadcasterId,
            broadcasterName: room.broadcasterName,
            streamMode: room.streamMode,
          });

          // If there is already an active broadcaster in this room, notify the broadcaster
          // so it can initiate a WebRTC offer (or canvas stream) to this newly joined viewer!
          if (room.broadcasterId && room.broadcasterId !== currentPeerId) {
            const broadcaster = room.peers.get(room.broadcasterId);
            if (broadcaster) {
              sendJson(broadcaster.ws, {
                type: 'viewer-ready',
                viewerId: currentPeerId,
                viewerName: peerInfo.name,
                viewerDeviceType: peerInfo.deviceType,
              });
            }
          }

          broadcastRoomState(room);
          break;
        }

        case 'start-broadcast': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          const peer = room.peers.get(currentPeerId);
          if (!peer) break;

          // If another peer was broadcasting, notify them they were superseded
          if (room.broadcasterId && room.broadcasterId !== currentPeerId) {
            const prevBroadcaster = room.peers.get(room.broadcasterId);
            if (prevBroadcaster) {
              prevBroadcaster.role = 'viewer';
              sendJson(prevBroadcaster.ws, {
                type: 'broadcast-superseded',
                byName: peer.name,
              });
            }
          }

          peer.role = 'broadcaster';
          room.broadcasterId = currentPeerId;
          room.broadcasterName = peer.name;
          room.streamMode = msg.streamMode || 'webrtc';

          broadcastRoomState(room);

          // Ask all other peers in the room to prepare to receive and notify broadcaster
          for (const [otherId, otherPeer] of room.peers.entries()) {
            if (otherId !== currentPeerId) {
              otherPeer.role = 'viewer';
              sendJson(otherPeer.ws, {
                type: 'broadcaster-started',
                broadcasterId: currentPeerId,
                broadcasterName: peer.name,
                streamMode: room.streamMode,
              });
              sendJson(ws, {
                type: 'viewer-ready',
                viewerId: otherId,
                viewerName: otherPeer.name,
                viewerDeviceType: otherPeer.deviceType,
              });
            }
          }
          break;
        }

        case 'stop-broadcast': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          if (room.broadcasterId === currentPeerId) {
            const peer = room.peers.get(currentPeerId);
            if (peer) peer.role = 'viewer';
            room.broadcasterId = null;
            room.broadcasterName = null;
            room.streamMode = null;

            for (const [otherId, otherPeer] of room.peers.entries()) {
              if (otherId !== currentPeerId) {
                sendJson(otherPeer.ws, {
                  type: 'broadcaster-stopped',
                  broadcasterId: currentPeerId,
                });
              }
            }
            broadcastRoomState(room);
          }
          break;
        }

        // WebRTC direct signaling (offer, answer, ice-candidate)
        case 'webrtc-signal': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          const targetPeer = room.peers.get(msg.targetId);
          if (!targetPeer) break;

          sendJson(targetPeer.ws, {
            type: 'webrtc-signal',
            fromId: currentPeerId,
            fromName: room.peers.get(currentPeerId)?.name || 'Peer',
            signal: msg.signal,
          });
          break;
        }

        // Request re-offer from current broadcaster
        case 'request-stream': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          const viewer = room.peers.get(currentPeerId);
          if (room.broadcasterId && viewer) {
            const broadcaster = room.peers.get(room.broadcasterId);
            if (broadcaster) {
              sendJson(broadcaster.ws, {
                type: 'viewer-ready',
                viewerId: currentPeerId,
                viewerName: viewer.name,
                viewerDeviceType: viewer.deviceType,
              });
            }
          }
          break;
        }

        // Fallback Live Frame Relay (for HTTP mobile file/canvas/whiteboard casting)
        case 'canvas-frame': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          if (room.broadcasterId !== currentPeerId) break;

          for (const [otherId, otherPeer] of room.peers.entries()) {
            if (otherId !== currentPeerId) {
              sendJson(otherPeer.ws, {
                type: 'canvas-frame',
                fromId: currentPeerId,
                dataUrl: msg.dataUrl,
                width: msg.width,
                height: msg.height,
                timestamp: msg.timestamp,
              });
            }
          }
          break;
        }

        // Remote laser pointer / touch annotation overlay
        case 'pointer-event': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          const sender = room.peers.get(currentPeerId);
          for (const [otherId, otherPeer] of room.peers.entries()) {
            if (otherId !== currentPeerId) {
              sendJson(otherPeer.ws, {
                type: 'pointer-event',
                fromId: currentPeerId,
                fromName: sender ? sender.name : 'Viewer',
                x: msg.x,
                y: msg.y,
                active: Boolean(msg.active),
                click: Boolean(msg.click),
              });
            }
          }
          break;
        }

        // Quick chat / clipboard text share across PC <-> Phone
        case 'clipboard-share': {
          if (!currentRoomPin || !rooms.has(currentRoomPin)) break;
          const room = rooms.get(currentRoomPin);
          const sender = room.peers.get(currentPeerId);
          for (const [otherId, otherPeer] of room.peers.entries()) {
            if (otherId !== currentPeerId) {
              sendJson(otherPeer.ws, {
                type: 'clipboard-share',
                fromId: currentPeerId,
                fromName: sender ? sender.name : 'Device',
                text: String(msg.text || '').slice(0, 10000),
                timestamp: Date.now(),
              });
            }
          }
          break;
        }
      }
    });

    function leaveCurrentRoom() {
      if (!currentRoomPin || !rooms.has(currentRoomPin)) return;
      const room = rooms.get(currentRoomPin);
      room.peers.delete(currentPeerId);

      if (room.broadcasterId === currentPeerId) {
        room.broadcasterId = null;
        room.broadcasterName = null;
        room.streamMode = null;
        for (const otherPeer of room.peers.values()) {
          sendJson(otherPeer.ws, {
            type: 'broadcaster-stopped',
            broadcasterId: currentPeerId,
          });
        }
      }

      if (room.peers.size === 0) {
        rooms.delete(currentRoomPin);
        broadcastLobbyUpdate();
      } else {
        broadcastRoomState(room);
      }
      currentRoomPin = null;
    }

    ws.on('close', () => {
      allSockets.delete(ws);
      leaveCurrentRoom();
    });
  });
}

async function startServer() {
  const addresses = getLanAddresses();
  const primaryIp = addresses.length > 0 ? addresses[0].address : '127.0.0.1';

  // 1. Start HTTP Server
  const httpServer = http.createServer(handleHttpRequest);
  const wssHttp = new WebSocketServer({ server: httpServer });
  attachSignalingServer(wssHttp);

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n============================================================`);
    console.log(`  MiraCastR — Free Wireless Screen Mirroring & Display Hub`);
    console.log(`============================================================`);
    console.log(`  Local PC Dashboard : http://localhost:${HTTP_PORT}`);
    console.log(`  LAN Quick Connect  : http://${primaryIp}:${HTTP_PORT}`);
  });

  // 2. Start HTTPS Server (with auto-generated self-signed certificate for remote mobile getDisplayMedia/getUserMedia)
  try {
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...addresses.map((a) => ({ type: 7, ip: a.address })),
    ];

    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: primaryIp }],
      {
        days: 365,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
          {
            name: 'subjectAltName',
            altNames,
          },
        ],
      }
    );

    const httpsServer = https.createServer(
      {
        key: pems.private,
        cert: pems.cert,
      },
      handleHttpRequest
    );
    const wssHttps = new WebSocketServer({ server: httpsServer });
    attachSignalingServer(wssHttps);

    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`  LAN Secure Cast    : https://${primaryIp}:${HTTPS_PORT}`);
      console.log(`============================================================\n`);
    });
  } catch (err) {
    console.warn('Could not start HTTPS server, continuing with HTTP:', err.message);
  }
}

startServer();
