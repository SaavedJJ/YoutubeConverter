export function forwardRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin) {
    return new Response('Solicitud no permitida.', { status: 403 });
  }
  return env.CONVERTER.getByName('principal').fetch(request);
}
