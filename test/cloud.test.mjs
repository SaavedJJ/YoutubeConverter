import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardRequest } from '../cloud/route.mjs';

test('el Worker rechaza peticiones de otros orígenes antes de iniciar el contenedor', async () => {
  let calls = 0;
  const env = {
    CONVERTER: {
      getByName(name) {
        assert.equal(name, 'principal');
        return { fetch() { calls++; return new Response('ok'); } };
      },
    },
  };
  const url = 'https://convertidor.example.workers.dev/api/download';
  const request = (origin) => new Request(url, { method: 'POST', headers: origin ? { Origin: origin } : {} });
  assert.equal((await forwardRequest(request('https://otro.example'), env)).status, 403);
  assert.equal((await forwardRequest(request(), env)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await forwardRequest(request('https://convertidor.example.workers.dev'), env)).status, 200);
  assert.equal(calls, 1);
});
