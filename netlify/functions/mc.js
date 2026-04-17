exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { mcKey, action, data } = payload;
  if (!mcKey) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'mcKey required' }) };

  const dcMatch = mcKey.match(/-([a-z]+[0-9]+)$/);
  const dc = dcMatch ? dcMatch[1] : 'us1';
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = 'Basic ' + Buffer.from('anystring:' + mcKey).toString('base64');

  const mcHeaders = { 'Authorization': auth, 'Content-Type': 'application/json' };

  let url, method, body;

  switch (action) {
    case 'ping':
      url = `${base}/ping`;
      method = 'GET';
      break;
    case 'getList':
      url = `${base}/lists/${data.listId}`;
      method = 'GET';
      break;
    case 'createCampaign':
      url = `${base}/campaigns`;
      method = 'POST';
      body = JSON.stringify(data.payload);
      break;
    case 'setContent':
      url = `${base}/campaigns/${data.campaignId}/content`;
      method = 'PUT';
      body = JSON.stringify(data.content);
      break;
    case 'sendCampaign':
      url = `${base}/campaigns/${data.campaignId}/actions/send`;
      method = 'POST';
      break;
    default:
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
  }

  try {
    const resp = await fetch(url, { method, headers: mcHeaders, ...(body ? { body } : {}) });
    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: text || '{}'
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy error: ' + err.message })
    };
  }
};
