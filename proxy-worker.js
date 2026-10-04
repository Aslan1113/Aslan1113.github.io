/**
 * 行测刷题通 · Supabase CORS 代理（Cloudflare Worker）
 *
 * 作用：本站发布在 GitHub Pages 上，但后端 Supabase 挂在 Meoo 域名下，
 *      Meoo 网关做了来源白名单（只认 https://zy5w0w3lmnir.meoo.zone），
 *      于是来自 github.io 的请求会被 403。
 *      本 Worker 把请求转发过去，并把 Origin 伪装成 Meoo 自己的域名。
 *
 * 部署后把下面 TARGET 对应的地址，替换站点里写死的 Supabase 地址即可。
 */
const TARGET = 'https://x9fivzdtgp9nyvc7.database.meoo.xyz';
const FAKE_ORIGIN = 'https://zy5w0w3lmnir.meoo.zone';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const isWS = (request.headers.get('upgrade') || '').toLowerCase() === 'websocket';

    const target = new URL(url.pathname + url.search, TARGET);
    if (isWS) target.protocol = 'wss:';

    const origin = request.headers.get('origin') || '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': '*',
      'access-control-max-age': '86400',
      'vary': 'origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const headers = new Headers(request.headers);
    headers.set('origin', FAKE_ORIGIN);
    headers.set('referer', FAKE_ORIGIN + '/');
    headers.delete('host');

    const resp = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    // 实时通道（WebSocket）透传
    if (isWS && resp.webSocket) {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      resp.webSocket.accept();
      resp.webSocket.addEventListener('message', (e) => server.send(e.data));
      resp.webSocket.addEventListener('close', (e) => server.close(e.code, e.reason));
      server.addEventListener('message', (e) => resp.webSocket.send(e.data));
      return new Response(null, { status: 101, webSocket: client });
    }

    const out = new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
