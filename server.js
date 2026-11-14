const http = require('node:http');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const youtubedl = require('youtube-dl-exec');

const PORT = 3000;
const MAX_BODY_BYTES = 8192;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

function youtubeUrl(value) {
  if (typeof value !== 'string') throw new Error('Introduce un enlace de YouTube válido.');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Introduce un enlace de YouTube válido.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Introduce un enlace de YouTube válido.');
  }
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    const parts = url.pathname.split('/');
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live'].includes(parts[1])) id = parts[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error('Introduce un enlace de vídeo de YouTube válido.');
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

function sendError(res, status, message) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('La solicitud es demasiado grande.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('La solicitud no es válida.');
  }
}

function createServer(download = youtubedl) {
  return http.createServer(async (req, res) => {
    const address = req.socket.localAddress;
    const host = req.headers.host;
    const allowedHosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    if (!allowedHosts.includes(host) || (address !== '127.0.0.1' && address !== '::ffff:127.0.0.1')) {
      return sendError(res, 403, 'Acceso no permitido.');
    }

    if (req.method === 'GET' && ASSETS[req.url]) {
      try {
        const [file, type] = ASSETS[req.url];
        const content = await fs.readFile(path.join(PUBLIC_DIR, file));
        res.writeHead(200, {
          'Content-Type': type,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
        return res.end(content);
      } catch (error) {
        console.error('Error al leer la interfaz:', error);
        return sendError(res, 500, 'No se pudo cargar la interfaz.');
      }
    }

    if (req.method !== 'POST' || req.url !== '/api/download') {
      return sendError(res, 404, 'Recurso no encontrado.');
    }
    if (req.headers.origin !== `http://${host}` || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      return sendError(res, 403, 'Solicitud no permitida.');
    }

    let url;
    let format;
    try {
      const body = await readJson(req);
      url = youtubeUrl(body?.url);
      format = body?.format;
      if (format !== 'mp3' && format !== 'mp4') throw new Error('Selecciona MP3 o MP4.');
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    let directory;
    try {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'convertidor-youtube-'));
      const options = {
        noConfig: true,
        noPlaylist: true,
        noProgress: true,
        output: path.join(directory, '%(title).120B [%(id)s].%(ext)s'),
        ...(format === 'mp3'
          ? { extractAudio: true, audioFormat: 'mp3', audioQuality: '0' }
          : { format: 'bestvideo+bestaudio/best', mergeOutputFormat: 'mp4', recodeVideo: 'mp4' }),
      };
      await download(url, options);
      const files = await fs.readdir(directory);
      const file = files.find((name) => name.toLowerCase().endsWith(`.${format}`));
      if (!file) throw new Error('La conversión no generó el archivo esperado.');
      const filePath = path.join(directory, file);
      const stat = await fs.stat(filePath);
      const encodedName = encodeURIComponent(file).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      res.writeHead(200, {
        'Content-Type': format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="download.${format}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      await pipeline(createReadStream(filePath), res);
    } catch (error) {
      console.error('Error al descargar o convertir:', error);
      sendError(res, 500, 'No se pudo descargar o convertir el vídeo. Comprueba el enlace, la disponibilidad del vídeo y que FFmpeg esté instalado.');
    } finally {
      if (directory) {
        try {
          await fs.rm(directory, { recursive: true, force: true });
        } catch (error) {
          console.error('No se pudieron eliminar los archivos temporales:', error);
        }
      }
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.on('error', (error) => {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exitCode = 1;
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Convertidor disponible en http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createServer, youtubeUrl };
