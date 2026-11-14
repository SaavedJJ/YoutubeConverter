const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
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
