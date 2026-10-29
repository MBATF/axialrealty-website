export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Canonical host: redirect www to apex
    if (url.hostname === 'www.axialrealty.com') {
      url.hostname = 'axialrealty.com';
      return Response.redirect(url.toString(), 301);
    }
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
  }
};
