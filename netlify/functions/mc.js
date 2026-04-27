const crypto = require('crypto');

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };
  if (event.httpMethod !== 'POST')   return { statusCode:405, headers:cors, body:'Method not allowed' };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode:400, headers:cors, body:JSON.stringify({error:'Invalid JSON'}) }; }

  const { mcKey, action, data } = payload;
  if (!mcKey) return { statusCode:400, headers:cors, body:JSON.stringify({error:'mcKey required'}) };

  const dc   = (mcKey.match(/-([a-z]+[0-9]+)$/) || [,'us1'])[1];
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = 'Basic ' + Buffer.from('anystring:' + mcKey).toString('base64');
  const H    = { 'Authorization':auth, 'Content-Type':'application/json' };

  const go = async (url, method='GET', body) => {
    const r = await fetch(url, { method, headers:H, ...(body ? {body} : {}) });
    const t = await r.text();
    let j = {}; try { j = JSON.parse(t); } catch {}
    return { status:r.status, ok:r.ok, json:j };
  };

  const send = (r) => ({ statusCode:r.status, headers:{...cors,'Content-Type':'application/json'}, body:JSON.stringify(r.json) });

  try {
    switch (action) {

      case 'ping':
        return send(await go(`${base}/ping`));

      case 'getList':
        return send(await go(`${base}/lists/${data.listId}`));

      case 'createCampaign':
        return send(await go(`${base}/campaigns`, 'POST', JSON.stringify(data.payload)));

      case 'setContent':
        return send(await go(`${base}/campaigns/${data.campaignId}/content`, 'PUT', JSON.stringify(data.content)));

      case 'sendCampaign':
        return send(await go(`${base}/campaigns/${data.campaignId}/actions/send`, 'POST'));

      // ── Stats: full campaign report (open rate, clicks, bounces etc) ──────
      case 'getCampaignReport':
        return send(await go(`${base}/reports/${data.campaignId}`));

      // ── Stats: campaign send status (sent / sending / scheduled) ──────────
      case 'getCampaignStatus':
        return send(await go(`${base}/campaigns/${data.campaignId}`));

      default:
        return { statusCode:400, headers:cors, body:JSON.stringify({error:'Unknown action: '+action}) };
    }
  } catch(err) {
    return { statusCode:500, headers:cors, body:JSON.stringify({error:'Proxy error: '+err.message}) };
  }
};
