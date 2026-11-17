const http = require('node:http');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const youtubedl = require('youtube-dl-exec');

const MAX_BODY_BYTES = 8192;
const SESSION_SECONDS = 12 * 60 * 60;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/login': ['login.html', 'text/html; charset=utf-8'],
  '/login.js': ['login.js', 'text/javascript; charset=utf-8'],
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

function createServer(download = youtubedl, password, cloud = false) {
  if (!cloud && (typeof password !== 'string' || password.length < 12)) {
    throw new Error('CONVERTER_PASSWORD debe tener al menos 12 caracteres.');
  }
  const passwordHash = cloud ? null : createHash('sha256').update(password).digest();
  const sessionKey = randomBytes(32);
  const sign = (value) => createHmac('sha256', sessionKey).update(value).digest('hex');
  const validSession = (cookie) => {
    const token = (cookie || '').split(';').map((part) => part.trim())
      .find((part) => part.startsWith('convertidor_session='));
    const value = token && token.slice('convertidor_session='.length);
    if (!value || !/^\d{13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return false;
    const [expires, nonce, signature] = value.split('.');
    if (Number(expires) <= Date.now()) return false;
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(`${expires}.${nonce}`), 'hex'));
  };
  return http.createServer(async (req, res) => {
    const address = req.socket.localAddress;
    const host = req.headers.host;
    const localHosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    const allowedOrigin = cloud && host === 'container'
      ? 'http://container'
      : localHosts.includes(host) ? `http://${host}` : null;
    if (!allowedOrigin || (!cloud && address !== '127.0.0.1' && address !== '::ffff:127.0.0.1')) {
      return sendError(res, 403, 'Acceso no permitido.');
    }

    if (cloud && req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Cache-Control': 'no-store' });
      return res.end('ok');
    }

    const authenticated = cloud || validSession(req.headers.cookie);

    if (req.method === 'GET' && ASSETS[req.url]) {
      if (req.url === '/' && !authenticated) {
        res.writeHead(303, { Location: '/login', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (req.url === '/app.js' && !authenticated) return sendError(res, 401, 'Inicia sesión.');
      if (req.url === '/login' && authenticated) {
        res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      try {
        const [file, type] = ASSETS[req.url];
        const content = await fs.readFile(path.join(PUBLIC_DIR, file));
        res.writeHead(200, {
          'Content-Type': type,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'",
          'Cache-Control': 'no-store',
        });
        return res.end(content);
      } catch (error) {
        console.error('Error al leer la interfaz:', error);
        return sendError(res, 500, 'No se pudo cargar la interfaz.');
      }
    }

    if (req.method !== 'POST' || !['/api/login', '/api/download'].includes(req.url)) {
      return sendError(res, 404, 'Recurso no encontrado.');
    }
    if (req.headers.origin !== allowedOrigin || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      return sendError(res, 403, 'Solicitud no permitida.');
    }

    if (req.url === '/api/login' && !cloud) {
      let body;
      try {
        body = await readJson(req);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
      if (typeof body?.password !== 'string') return sendError(res, 400, 'Introduce la contraseña.');
      const suppliedHash = createHash('sha256').update(body.password).digest();
      if (!timingSafeEqual(passwordHash, suppliedHash)) return sendError(res, 401, 'Contraseña incorrecta.');
      const value = `${Date.now() + SESSION_SECONDS * 1000}.${randomBytes(32).toString('hex')}`;
      const secure = allowedOrigin.startsWith('https:') ? '; Secure' : '';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `convertidor_session=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`,
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.url === '/api/login') return sendError(res, 404, 'Recurso no encontrado.');

    if (!authenticated) return sendError(res, 401, 'Inicia sesión.');

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
  const cloud = process.env.CONVERTER_MODE === 'cloudflare';
  if (process.env.CONVERTER_MODE && !cloud) {
    console.error('CONVERTER_MODE no es válido.');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT debe ser un puerto entre 1 y 65535.');
    process.exit(1);
  }
  let server;
  try {
    server = createServer(youtubedl, process.env.CONVERTER_PASSWORD, cloud);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  server.on('error', (error) => {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exitCode = 1;
  });
  const host = cloud ? '0.0.0.0' : '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`Convertidor disponible en http://${host}:${port}`);
  });
}

module.exports = { createServer, youtubeUrl };
