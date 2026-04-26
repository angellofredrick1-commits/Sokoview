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

      // Ensure all 8 custom merge fields exist — creates missing ones
      case 'ensureMergeFields': {
        const fields = [
          {tag:'PORTVAL', name:'Portfolio Value', type:'text'},
          {tag:'INVESTED',name:'Amount Invested', type:'text'},
          {tag:'GAINPCT', name:'Return %',        type:'text'},
          {tag:'ABSGAIN', name:'TZS Gain/Loss',   type:'text'},
          {tag:'HOLDINGS',name:'Holdings',         type:'text'},
          {tag:'INSIGHT', name:'AI Insight',       type:'text'},
          {tag:'SEGLBL',  name:'Segment Label',    type:'text'},
          {tag:'SEGEMO',  name:'Segment Emoji',    type:'text'},
        ];
        const ex = await go(`${base}/lists/${data.listId}/merge-fields?count=100`);
        const existing = (ex.json.merge_fields||[]).map(f=>f.tag);
        const results = [];
        for (const f of fields) {
          if (existing.includes(f.tag)) { results.push({tag:f.tag,status:'exists'}); continue; }
          const r = await go(`${base}/lists/${data.listId}/merge-fields`,'POST',JSON.stringify({tag:f.tag,name:f.name,type:f.type,required:false}));
          results.push({tag:f.tag,status:r.status});
        }
        return { statusCode:200, headers:{...cors,'Content-Type':'application/json'}, body:JSON.stringify({fields:results}) };
      }

      // Update one subscriber's merge fields by email
      case 'updateMember': {
        const hash = crypto.createHash('md5').update((data.email||'').toLowerCase().trim()).digest('hex');
        return send(await go(`${base}/lists/${data.listId}/members/${hash}`,'PATCH',JSON.stringify({merge_fields:data.mergeFields})));
      }

      case 'createCampaign':
        return send(await go(`${base}/campaigns`,'POST',JSON.stringify(data.payload)));

      case 'setContent':
        return send(await go(`${base}/campaigns/${data.campaignId}/content`,'PUT',JSON.stringify(data.content)));

      case 'sendCampaign':
        return send(await go(`${base}/campaigns/${data.campaignId}/actions/send`,'POST'));

      case 'testCampaign':
        return send(await go(`${base}/campaigns/${data.campaignId}/actions/test`,'POST',JSON.stringify({test_emails:data.testEmails,send_type:'html'})));

      default:
        return { statusCode:400, headers:cors, body:JSON.stringify({error:'Unknown action: '+action}) };
    }
  } catch(err) {
    return { statusCode:500, headers:cors, body:JSON.stringify({error:'Proxy error: '+err.message}) };
  }
};
