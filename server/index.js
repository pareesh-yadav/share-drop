import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 8080;
const PROTOCOL_VERSION = 1;
const ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * In-memory room and peer registry
 * rooms: roomId -> { id, createdAt, expiresAt, peers: [ { id, displayName, deviceType, connectedAt } ] }
 * sockets: peerId -> WebSocket
 * peerToRoom: peerId -> roomId
 */
const rooms = new Map();
const sockets = new Map();
const peerToRoom = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Unambiguous chars (no 0/O, 1/I)
  let result = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function generatePeerId() {
  return `peer_${crypto.randomUUID().replace(/-/g, '')}`;
}

function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[Signaling] Send error:', err.message);
    }
  }
}

// ─── HTTP Server & Health Check ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      service: 'ShareDrop Signaling Server',
      activeRooms: rooms.size,
      connectedPeers: sockets.size,
      uptimeSeconds: Math.floor(process.uptime()),
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let boundPeerId = null;
  let isAlive = true;

  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { action, payload } = msg;

    // ─── 1. Create Room ──────────────────────────────────────────────────────
    if (action === 'create-room') {
      const roomId = generateRoomId();
      const peerId = generatePeerId();
      boundPeerId = peerId;

      const now = Date.now();
      const peer = {
        id: peerId,
        displayName: (payload?.displayName || 'Host').slice(0, 64),
        deviceType: payload?.deviceType || 'desktop',
        connectedAt: now,
      };

      const room = {
        id: roomId,
        createdAt: now,
        expiresAt: now + ROOM_TTL_MS,
        peers: [peer],
      };

      rooms.set(roomId, room);
      sockets.set(peerId, ws);
      peerToRoom.set(peerId, roomId);

      console.log(`[Room Created] ${roomId} by ${peerId} (${peer.displayName})`);

      safeSend(ws, {
        type: 'room:created',
        roomId,
        myPeerId: peerId,
        room,
        timestamp: now,
        protocolVersion: PROTOCOL_VERSION,
      });
      return;
    }

    // ─── 2. Join Room ────────────────────────────────────────────────────────
    if (action === 'join-room') {
      const targetRoomId = (payload?.roomId || '').trim().toUpperCase();
      const room = rooms.get(targetRoomId);

      if (!room || room.expiresAt <= Date.now()) {
        safeSend(ws, {
          type: 'error',
          code: 'ROOM_NOT_FOUND',
          message: `Room ${targetRoomId} was not found or has expired.`,
          roomId: targetRoomId,
          fromPeerId: 'server',
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
        });
        return;
      }

      const peerId = generatePeerId();
      boundPeerId = peerId;
      const now = Date.now();

      const newPeer = {
        id: peerId,
        displayName: (payload?.displayName || 'Peer').slice(0, 64),
        deviceType: payload?.deviceType || 'mobile',
        connectedAt: now,
      };

      room.peers.push(newPeer);
      sockets.set(peerId, ws);
      peerToRoom.set(peerId, targetRoomId);

      console.log(`[Peer Joined] ${peerId} (${newPeer.displayName}) -> Room ${targetRoomId}`);

      // Respond to joining peer with room snapshot
      safeSend(ws, {
        type: 'room:joined',
        roomId: targetRoomId,
        myPeerId: peerId,
        room,
        timestamp: now,
        protocolVersion: PROTOCOL_VERSION,
      });

      // Broadcast new peer to other peers in room
      for (const p of room.peers) {
        if (p.id !== peerId) {
          const peerWs = sockets.get(p.id);
          safeSend(peerWs, {
            type: 'peer:joined',
            roomId: targetRoomId,
            peer: newPeer,
            fromPeerId: peerId,
            timestamp: now,
            protocolVersion: PROTOCOL_VERSION,
          });
        }
      }
      return;
    }

    // ─── 3. WebRTC Signal (Offer / Answer / ICE) ──────────────────────────────
    if (action === 'signal' && payload?.toPeerId) {
      const targetWs = sockets.get(payload.toPeerId);
      if (targetWs) {
        safeSend(targetWs, payload);
      }
    }
  });

  // ─── Disconnect Cleanup ────────────────────────────────────────────────────
  ws.on('close', () => {
    if (!boundPeerId) return;

    sockets.delete(boundPeerId);
    const roomId = peerToRoom.get(boundPeerId);
    peerToRoom.delete(boundPeerId);

    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.peers = room.peers.filter((p) => p.id !== boundPeerId);
        console.log(`[Peer Left] ${boundPeerId} left Room ${roomId}`);

        // Notify remaining peers
        for (const p of room.peers) {
          const peerWs = sockets.get(p.id);
          safeSend(peerWs, {
            type: 'peer:left',
            roomId,
            peerId: boundPeerId,
            fromPeerId: boundPeerId,
            timestamp: Date.now(),
            protocolVersion: PROTOCOL_VERSION,
          });
        }

        // Auto-cleanup empty room after 5 minutes of inactivity
        if (room.peers.length === 0) {
          setTimeout(() => {
            const current = rooms.get(roomId);
            if (current && current.peers.length === 0) {
              rooms.delete(roomId);
              console.log(`[Room Expired] ${roomId} cleaned up`);
            }
          }, 5 * 60 * 1000);
        }
      }
    }
  });
});

// ─── Heartbeat Interval (Detect Dead Sockets) ──────────────────────────────────
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(pingInterval));

// ─── Periodic Room TTL Garbage Collection ────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (room.expiresAt <= now) {
      rooms.delete(id);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`🚀 ShareDrop Signaling Server listening on port ${PORT}`);
});
