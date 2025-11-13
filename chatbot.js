(function () {
  if (window.__avantChatbotLoaded) return; window.__avantChatbotLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
  .avant-chatbot-toggle{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border-radius:50%;background:#111;color:#fff;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}
  .avant-chatbot-panel{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:min(95vw,360px);height:480px;background:#fff;color:#111;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.25);overflow:hidden;display:none;flex-direction:column;border:1px solid rgba(0,0,0,.08)}
  .avant-chatbot-panel.active{display:flex}
  .avant-chatbot-header{padding:12px 14px;background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between}
  .avant-chatbot-title{font-weight:600;font-size:14px;letter-spacing:.2px}
  .avant-chatbot-body{flex:1;padding:12px;overflow-y:auto;background:#fafafa}
  .avant-chatbot-input{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}
  .avant-chatbot-input input{flex:1;padding:10px 12px;border:1px solid #ddd;border-radius:999px;outline:none}
  .avant-chatbot-input button{padding:10px 14px;background:#111;color:#fff;border:0;border-radius:999px;cursor:pointer}
  .avant-chat-msg{margin:8px 0;max-width:85%;padding:8px 10px;border-radius:12px;line-height:1.35;white-space:pre-wrap}
  .avant-chat-msg.user{margin-left:auto;background:#111;color:#fff;border-bottom-right-radius:4px}
  .avant-chat-msg.bot{margin-right:auto;background:#fff;color:#111;border:1px solid #eee;border-bottom-left-radius:4px}
  .avant-chatbot-footer-note{font-size:11px;color:#666;padding:6px 12px 10px}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'avant-chatbot-panel';
  panel.innerHTML = `
    <div class="avant-chatbot-header">
      <div class="avant-chatbot-title">Avant Atelier — Assistant</div>
      <button aria-label="Close chat" title="Close" style="background:none;border:0;color:#fff;font-size:18px;cursor:pointer">×</button>
    </div>
    <div class="avant-chatbot-body" id="avantChatBody"></div>
    <div class="avant-chatbot-input">
      <input id="avantChatInput" type="text" placeholder="Ask about products, sizes, prices…"/>
      <button id="avantChatSend">Send</button>
    </div>
    <div class="avant-chatbot-footer-note">Answers are based on our on-site JSON catalog.</div>
  `;
  document.body.appendChild(panel);

  const toggle = document.createElement('button');
  toggle.className = 'avant-chatbot-toggle';
  toggle.setAttribute('aria-label', 'Open chat');
  toggle.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v12H7l-3 3V4z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(toggle);

  const bodyEl = panel.querySelector('#avantChatBody');
  const inputEl = panel.querySelector('#avantChatInput');
  const sendBtn = panel.querySelector('#avantChatSend');
  const closeBtn = panel.querySelector('.avant-chatbot-header button');

  function showPanel(show){ panel.classList.toggle('active', !!show); if (show) inputEl?.focus(); }
  function addMsg(text, who){ const div=document.createElement('div'); div.className=`avant-chat-msg ${who}`; div.textContent=text; bodyEl.appendChild(div); bodyEl.scrollTop=bodyEl.scrollHeight; }
  function setLoading(v){ sendBtn.disabled=v; inputEl.disabled=v; sendBtn.textContent=v?'…':'Send'; }
  const CATALOG_FILES = ['./NewArrivals.json', './Tops.json', './Bottoms.json', './Accessories.json'];
  let KB = [];

  function normalize(item, source){
    return {
      id: item.id ?? item.ID ?? item.sku ?? '',
      name: String(item.name || item.title || '').trim(),
      description: String(item.description || item.desc || '').trim(),
      price: typeof item.price === 'number' ? item.price : Number(item.price) || undefined,
      category: String(item.category || source || '').trim(),
      image: item.image || item.img || '',
      source
    };
  }

  async function loadCatalog(){
    const results = await Promise.all(CATALOG_FILES.map(async (f)=>{
      try{
        const res = await fetch(f, { cache: 'no-store' });
        if(!res.ok) {
          console.warn('[chatbot] Failed to load', f, res.status);
          return [];
        }
        const arr = await res.json();
        const tag = f.replace(/^.*\//,'').replace(/\..+$/, '').toLowerCase();
        const items = Array.isArray(arr) ? arr.map(x=>normalize(x, tag)) : [];
        return items;
      }catch(err){
        console.warn('[chatbot] Error loading', f, err);
        return [];
      }
    }));
    KB = results.flat().filter(x=>x && x.name);
    console.info('[chatbot] Catalog loaded items:', KB.length);
  }

  function topMatches(query, max=8){
    const q = String(query||'').toLowerCase();
    const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
    const score = (it)=>{
      const fields = [
        it.name,
        it.description,
        it.category,
        (it.colors||[]).join(' '),
        (it.sizes||[]).join(' '),
        String(it.status||'')
      ].join('\n').toLowerCase();
      let s = 0;
      for(const t of tokens){ if(fields.includes(t)) s += t.length>3?2:1; }
      if(q && it.name && q.includes(it.name.toLowerCase())) s += 3;
      if(/\btop(s)?\b|shirt|tee|sweater|hoodie|jacket/.test(q) && /top|shirt|tee|sweater|hoodie|jacket/.test(it.category)) s += 2;
      if(/\bbottom(s)?\b|trouser|pant|short|jean|denim/.test(q) && /bottom|trouser|pant|short|jean|denim/.test(it.category)) s += 2;
      if(/accessor(y|ies)|bag|glass|sunglass/.test(q) && /accessor|bag|glass/.test(it.category)) s += 2;
      const colorMatch = (it.colors||[]).some(c=>q.includes(String(c).toLowerCase()));
      if(colorMatch) s += 1;
      return s;
    };
    return KB.map(it=>({it,s:score(it)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,max).map(x=>x.it);
  }

  function renderPrice(p){ return typeof p==='number' ? `$${p.toFixed(2)}` : 'N/A'; }

  function localAnswer(query){
    const hits = topMatches(query, 8);
    if (!hits.length) return "I couldn't find a matching item in our catalog JSON.";
    const isPrice = /price|cost|how much|\$|usd|vnd/i.test(query);
    const isTopN = /top\s*\d+|recommend|suggest/i.test(query);
    const lines = hits.map((h,i)=>`${i+1}. ${h.name} — ${renderPrice(h.price)} [${h.category||h.source}]`);
    if (isPrice) return `Here are the closest matches with prices:\n${lines.join('\n')}`;
    if (isTopN) return `You might like these:\n${lines.join('\n')}`;
    return `Here are items related to your query:\n${lines.join('\n')}`;
  }

  async function askGemini(query){
    const env = window.ENV || {};
    const key = env.GEMINI_API_KEY;
    if (!key) return null;
    const preferred = (env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    const candidates = Array.from(new Set([
      preferred,
      'gemini-2.5-flash',
      'gemini-2.5-flash-8b',
      'gemini-2.5-pro',
      'gemini-2.0-pro'
    ]));

    const items = topMatches(query, 12);
    const context = items.length ? items.map((p,i)=>`#${i+1} [${p.category||p.source}] ${p.name} — ${renderPrice(p.price)}\nID: ${p.id || 'n/a'}\n${p.description || ''}`).join('\n\n') : 'No matching items found in the catalog.';
    const system = 'You are the official Virtual Assistant of Avant Atelier, representing the brand in all customer interactions. You must always communicate with warmth, professionalism, and elegance, reflecting Avant Atelier’s identity as a refined and trustworthy luxury fashion brand. Begin every reply with the greeting “Hello! Thank you for reaching out to Avant Atelier.” and end with “Thank you for your interest in our products.Your responsibility is to provide customers with accurate, courteous, and concise information strictly based on verified product and policy data. Never assume, invent, or guess details that are not explicitly available. If the requested information is unavailable, politely explain that it is not currently provided and suggest contacting Customer Support for further assistance.You may provide verified details such as product name, price, color, size, material, and availability. For shipping and return information, respond based on the verified data when available. If no specific data is provided, apply Avant Atelier’s standard boutique policy: shipping within Vietnam typically takes 3 to 5 business days, and international orders, when available, may take 7 to 14 business days, depending on destination and customs clearance. Customers will receive tracking information once the order has been dispatched.Regarding returns, customers are generally allowed to return or exchange items within 14 days from the delivery date, provided the products are unused, unwashed, unaltered, and returned with all original tags and packaging intact. Refunds are processed to the original payment method once the returned item passes quality inspection. Personalized or final-sale items are not eligible for return unless defective. If the dataset contains different or specific terms, always use the official information from the dataset instead.If a customer asks something unrelated to product or policy information — such as styling advice, personal opinions, or unrelated topics — politely explain that you can only assist with verified product and policy inquiries. If multiple similar items exist and clarification is needed, ask one short question to confirm the exact product before replying.Maintain a tone that is kind, respectful, and confident at all times. Keep your language precise, easy to understand, and free of unnecessary technical or system details. Always focus on delivering an elegant and seamless customer experience that reflects the values of Avant Atelier. Never mention internal processes, AI capabilities, or limitations in your responses.';
    const payload = { contents: [{ role:'user', parts:[{ text: `${system}\n\nContext:\n---\n${context}\n---\n\nUser question:\n${query}` }]}] };

    async function tryModel(modelId){
      const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;
      const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const status = resp.status;
      let json = null; try { json = await resp.json(); } catch {}
      if (!resp.ok) {
        const code = json?.error?.status || '';
        console.warn('[chatbot] Gemini HTTP', status, code, modelId);
        return { ok: false, status, code, json };
      }
      const text = (json?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
      return { ok: !!text, text, status: 200 };
    }

    for (const m of candidates) {
      try {
        const r = await tryModel(m);
        if (r.ok) return r.text;
        if (r.status === 404 || r.code === 'NOT_FOUND' || r.status === 400 || r.code === 'INVALID_ARGUMENT') continue;
      } catch (err) {
        console.warn('[chatbot] Gemini error', err);
      }
    }
    return 'May i help you ?';
  }

  async function ask(query){
    const gem = await askGemini(query);
    if (gem) return gem;
    return localAnswer(query);
  }

  function send(){
    const text=(inputEl.value||'').trim(); if(!text) return;
    addMsg(text,'user'); inputEl.value=''; setLoading(true);
    ask(text)
      .then(r=>addMsg(r||'I could not find that in our catalog.','bot'))
      .catch(()=>addMsg('Sorry, something went wrong.','bot'))
      .finally(()=>setLoading(false));
  }

  toggle.addEventListener('click',()=>showPanel(!panel.classList.contains('active')));
  closeBtn.addEventListener('click',()=>showPanel(false));
  sendBtn.addEventListener('click',send);
  inputEl.addEventListener('keydown',(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); }});

  loadCatalog().then(()=>{
    const env = window.ENV || {};
    const hasGemini = !!env.GEMINI_API_KEY;
    const intro = hasGemini
      ? 'Hi! Ask about products, prices, availability, or recommendations. '
      : 'Hi! Ask about products, prices, or availability. ';
    setTimeout(()=>addMsg(intro, 'bot'), 300);
  }).catch(()=>{
    setTimeout(()=>addMsg('Hi! I could not load the catalog JSON. Please refresh or check file paths.', 'bot'), 300);
  });
})();
