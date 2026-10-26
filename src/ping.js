const net = require('net');

/**
 * Encodes a VarInt according to Minecraft protocol specs.
 */
function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & ~0x7f) === 0) {
      bytes.push(value);
      break;
    }
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return Buffer.from(bytes);
}

/**
 * Pings a Minecraft server using standard Server List Ping (SLP) protocol.
 * @param {string} host - Hostname or IP
 * @param {number} port - Port (default 25565)
 * @param {number} timeout - Timeout in milliseconds (default 4000)
 * @returns {Promise<Object>}
 */
function pingMinecraftServer(host, port = 25565, timeout = 4000) {
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
        const portBuffer = Buffer.alloc(2);
        portBuffer.writeUInt16BE(cleanPort, 0);

        // Handshake packet: packetId(0x00) + protocolVersion(-1 or 47) + hostLength + host + port + nextState(1)
        const handshakePayload = Buffer.concat([
          writeVarInt(0x00),
          writeVarInt(765), // Modern protocol version (1.20.4+ / works back to 1.7)
          writeVarInt(hostBuffer.length),
          hostBuffer,
          portBuffer,
          writeVarInt(1) // Next state: 1 (status)
        ]);

        const handshakePacket = Buffer.concat([
          writeVarInt(handshakePayload.length),
          handshakePayload
        ]);

        socket.write(handshakePacket);

        // Status request packet: length(1), packetId(0x00)
        const statusPacket = Buffer.concat([
          writeVarInt(1),
          writeVarInt(0x00)
        ]);
        socket.write(statusPacket);
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

          const ping = Math.max(1, Date.now() - startTime);
          let motd = '';
          if (typeof data.description === 'string') {
            motd = data.description;
          } else if (data.description && typeof data.description === 'object') {
            motd = data.description.text || '';
            if (Array.isArray(data.description.extra)) {
              motd += data.description.extra.map(e => (typeof e === 'string' ? e : e.text || '')).join('');
            }
          }

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
        // Wait for more chunks if JSON is fragmented
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
