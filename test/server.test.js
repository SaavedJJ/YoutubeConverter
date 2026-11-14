const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createServer, youtubeUrl } = require('../server');

test('normaliza enlaces de vídeo y descarta parámetros de listas', () => {
  const expected = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.equal(youtubeUrl('https://youtu.be/abcdefghijk?t=10'), expected);
  assert.equal(youtubeUrl('https://www.youtube.com/watch?v=abcdefghijk&list=example'), expected);
  assert.equal(youtubeUrl('https://youtube.com/shorts/abcdefghijk'), expected);
  assert.throws(() => youtubeUrl('https://youtube.com.evil.example/watch?v=abcdefghijk'));
  assert.throws(() => youtubeUrl('https://youtube.com/playlist?list=example'));
  assert.throws(() => youtubeUrl('file:///etc/passwd'));
});

test('descarga ambos formatos, valida solicitudes y limpia archivos temporales', async (t) => {
  const calls = [];
  const directories = [];
  const server = createServer(async (url, options) => {
    calls.push({ url, options });
    const directory = path.dirname(options.output);
    directories.push(directory);
    const extension = options.extractAudio ? 'mp3' : 'mp4';
    await fs.writeFile(path.join(directory, `prueba á.${extension}`), `contenido ${extension}`);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${origin}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });

  test('permite solo el origen HTTPS Tailscale configurado sin desactivar el acceso local', async (t) => {
    assert.throws(() => createServer(undefined, 'https://ejemplo.com'));
    assert.throws(() => createServer(undefined, 'http://equipo.red.ts.net'));
    assert.throws(() => createServer(undefined, 'https://equipo.red.ts.net/ruta'));

    const tailnet = 'https://equipo.red.ts.net';
    const server = createServer(async (_url, options) => {
      await fs.writeFile(path.join(path.dirname(options.output), 'prueba.mp3'), 'audio');
    }, tailnet);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const port = server.address().port;
    const request = (host, origin) => new Promise((resolve, reject) => {
      const body = origin && JSON.stringify({ url: 'https://youtu.be/abcdefghijk', format: 'mp3' });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: origin ? '/api/download' : '/',
        method: origin ? 'POST' : 'GET',
        headers: { Host: host, ...(origin ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end(body);
    });
    assert.equal((await request(`127.0.0.1:${port}`)).status, 200);
    assert.equal((await request('equipo.red.ts.net')).status, 200);
    assert.equal((await request('otro.red.ts.net')).status, 403);
    const response = await request('equipo.red.ts.net', tailnet);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'audio');
    assert.equal((await request('equipo.red.ts.net', 'https://otro.red.ts.net')).status, 403);
    assert.equal((await request('equipo.red.ts.net', 'http://equipo.red.ts.net')).status, 403);
  });

  for (const format of ['mp3', 'mp4']) {
    const response = await post({ url: 'https://youtu.be/abcdefghijk', format });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /filename\*=UTF-8''/);
    assert.equal(await response.text(), `contenido ${format}`);
  }
  assert.equal(calls[0].options.audioFormat, 'mp3');
  assert.equal(calls[1].options.recodeVideo, 'mp4');
  assert.equal(calls[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');

  const invalid = await post({ url: 'https://example.com', format: 'mp3' });
  assert.equal(invalid.status, 400);
  const foreign = await post({ url: 'https://youtu.be/abcdefghijk', format: 'mp3' }, { Origin: 'https://example.com' });
  assert.equal(foreign.status, 403);
  assert.equal(calls.length, 2);

  // La respuesta termina justo antes de la limpieza asíncrona.
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (const directory of directories) {
    await assert.rejects(fs.access(directory), { code: 'ENOENT' });
  }
});
