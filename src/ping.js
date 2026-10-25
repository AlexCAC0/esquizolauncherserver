const net = require('net');

/**
 * Pings a Minecraft server using the Server List Ping protocol (SLP).
 * Works for modern Minecraft servers (1.7 - 1.21+).
 * 
 * @param {string} host - Hostname or IP
 * @param {number} port - Port (default 25565)
 * @param {number} timeout - Timeout in milliseconds (default 3500)
 * @returns {Promise<Object>} - { online, ping, players: { online, max }, version, motd }
 */
function pingMinecraftServer(host, port = 25565, timeout = 3500) {
  return new Promise((resolve) => {
    if (!host || typeof host !== 'string') {
      return resolve({ online: false, ping: -1, error: 'Host no especificado' });
    }

    const cleanHost = host.trim();
    const cleanPort = parseInt(port, 10) || 25565;

    const socket = new net.Socket();
    const startTime = Date.now();
    let isFinished = false;

    socket.setTimeout(timeout);

    const finish = (result) => {
      if (!isFinished) {
        isFinished = true;
        try { socket.destroy(); } catch (e) {}
        resolve(result);
      }
    };

    socket.connect(cleanPort, cleanHost, () => {
      try {
        const hostBuffer = Buffer.from(cleanHost, 'utf8');
        // Handshake packet (Packet ID 0x00)
        const handshakeBody = Buffer.concat([
          Buffer.from([0x00]), // packet id
          Buffer.from([0x04]), // protocol version placeholder
          Buffer.from([hostBuffer.length]),
          hostBuffer,
          Buffer.from([(cleanPort >> 8) & 0xff, cleanPort & 0xff]),
          Buffer.from([0x01]) // Next state: 1 (status)
        ]);

        const handshakePacket = Buffer.concat([
          Buffer.from([handshakeBody.length]),
          handshakeBody
        ]);

        socket.write(handshakePacket);

        // Status request packet (Packet ID 0x00, empty body)
        socket.write(Buffer.from([0x01, 0x00]));
      } catch (err) {
        finish({ online: false, ping: -1, error: err.message });
      }
    });

    let incomingBuffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
      try {
        const text = incomingBuffer.toString('utf8');
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const jsonStr = text.substring(startIdx, endIdx + 1);
          const data = JSON.parse(jsonStr);

          const ping = Date.now() - startTime;
          let motd = '';
          if (typeof data.description === 'string') {
            motd = data.description;
          } else if (data.description && typeof data.description === 'object') {
            motd = data.description.text || '';
            if (Array.isArray(data.description.extra)) {
              motd += data.description.extra.map(e => (typeof e === 'string' ? e : e.text || '')).join('');
            }
          }

          // Strip standard Minecraft color codes § for clean display
          const cleanMotd = motd.replace(/§[0-9a-fk-or]/gi, '').trim();

          finish({
            online: true,
            ping,
            players: {
              online: data.players?.online || 0,
              max: data.players?.max || 0
            },
            version: data.version?.name || '',
            motd: cleanMotd
          });
        }
      } catch (e) {
        // Continue accumulating chunks if JSON is not complete
      }
    });

    socket.on('timeout', () => {
      finish({ online: false, ping: -1, error: 'Tiempo de espera agotado' });
    });

    socket.on('error', (err) => {
      finish({ online: false, ping: -1, error: err.message });
    });
  });
}

module.exports = {
  pingMinecraftServer
};
