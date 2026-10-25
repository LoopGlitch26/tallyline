import { login, logout, requireLogin, whoami } from './http/auth';
import * as P from './http/properties';
import { empty, json, Router } from './http/router';
import { collect } from './ingest/collect';
import { conversionApi, dodoWebhook, paymentApi } from './revenue/gateways';
import type { Bindings } from './types';

const r = new Router();
const owner = [requireLogin, P.loadProperty] as const;

// Public: tracker beacons, payment webhooks, server-side API (API key auth).
r.post('/api/collect', collect);
r.post('/api/hooks/dodo/:pid', dodoWebhook);
r.post('/api/v1/payment', paymentApi);
r.post('/api/v1/conversion', conversionApi);

// Dashboard login.
r.get('/api/session', whoami);
r.post('/api/session', login);
r.delete('/api/session', logout);

// Dashboard data (signed in only).
r.get('/api/properties', requireLogin, P.listProperties);
r.post('/api/properties', requireLogin, P.createProperty);
r.get('/api/properties/:pid', ...owner, P.getProperty);
r.patch('/api/properties/:pid', ...owner, P.updateProperty);
r.delete('/api/properties/:pid', ...owner, P.deleteProperty);
r.post('/api/properties/:pid/rotate-key', ...owner, P.rotateKey);
r.get('/api/properties/:pid/summary', ...owner, P.summaryRoute);
r.get('/api/properties/:pid/breakdown', ...owner, P.breakdownRoute);
r.get('/api/properties/:pid/buyers', ...owner, P.buyersRoute);
r.post('/api/properties/:pid/relink', ...owner, P.relinkRoute);
r.get('/api/properties/:pid/people', ...owner, P.peopleRoute);
r.get('/api/properties/:pid/people/:uid', ...owner, P.personRoute);
r.get('/api/properties/:pid/funnels', ...owner, P.listFunnels);
r.post('/api/properties/:pid/funnels', ...owner, P.createFunnel);
r.delete('/api/properties/:pid/funnels/:fid', ...owner, P.deleteFunnel);
r.get('/api/properties/:pid/funnels/:fid/report', ...owner, P.funnelRoute);

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Beacons are sent with text/plain so browsers skip the preflight, but answer one anyway.
      if (request.method === 'OPTIONS') {
        return empty(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        });
      }
      try {
        return (await r.handle(request, env, ctx)) ?? json({ error: 'not found' }, 404);
      } catch (e) {
        console.error(e);
        return json({ error: 'internal error' }, 500);
      }
    }
    // Everything else is the dashboard / tracker (static assets, SPA fallback).
    return env.STATIC.fetch(request);
  },
} satisfies ExportedHandler<Bindings>;
