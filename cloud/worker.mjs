import { DurableObject } from 'cloudflare:workers';
import { forwardRequest } from './route.mjs';

const PORT = 8080;
const INACTIVITY_MS = 60 * 1000;

export class Converter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    if (ctx.container?.running) {
      ctx.blockConcurrencyWhile(() => ctx.container.setInactivityTimeout(INACTIVITY_MS));
    }
  }

  async fetch(request) {
    this.starting ??= this.ensureReady().finally(() => { this.starting = undefined; });
    await this.starting;
    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    if (forwarded.headers.has('origin')) forwarded.headers.set('origin', 'http://container');
    return this.ctx.container.getTcpPort(PORT).fetch(forwarded);
  }

  async ensureReady() {
    const container = this.ctx.container;
    if (!container) throw new Error('No hay un contenedor configurado.');
    if (!container.running) {
      container.start({ image: container.images.base, instance: 'basic', enableInternet: true });
    }
    await container.setInactivityTimeout(INACTIVITY_MS);
    const port = container.getTcpPort(PORT);
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch('http://container/health', { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Comprobación de inicio: ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(200);
    }
    throw new Error('El contenedor no está disponible.', { cause: lastError });
  }
}

export default {
  fetch: forwardRequest,
};
