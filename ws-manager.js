const { WebSocketServer } = require('ws');
const { parse } = require('url');

class WSManager {
  constructor() {
    this.connections = new Map();
    this.wss = null;
  }

  init(server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const { pathname } = parse(request.url || '', true);
      if (pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'auth' && msg.userId) {
            ws.userId = msg.userId;
            if (!this.connections.has(msg.userId)) {
              this.connections.set(msg.userId, new Set());
            }
            this.connections.get(msg.userId).add(ws);
            ws.send(JSON.stringify({ type: 'auth:ok' }));
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        if (ws.userId && this.connections.has(ws.userId)) {
          this.connections.get(ws.userId).delete(ws);
          if (this.connections.get(ws.userId).size === 0) {
            this.connections.delete(ws.userId);
          }
        }
      });

      ws.on('error', () => {
        ws.terminate();
      });
    });

    // Heartbeat every 30s to detect dead connections
    this._heartbeat = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('> WebSocket server ready on /ws');
  }

  sendToUser(userId, event) {
    const conns = this.connections.get(userId);
    if (!conns) return;
    const data = JSON.stringify(event);
    for (const ws of conns) {
      if (ws.readyState === 1) ws.send(data);
    }
  }

  sendToUsers(userIds, event) {
    const data = JSON.stringify(event);
    for (const userId of userIds) {
      const conns = this.connections.get(userId);
      if (!conns) continue;
      for (const ws of conns) {
        if (ws.readyState === 1) ws.send(data);
      }
    }
  }

  broadcast(event) {
    if (!this.wss) return;
    const data = JSON.stringify(event);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }

  getOnlineUserIds() {
    return Array.from(this.connections.keys());
  }
}

module.exports = WSManager;
