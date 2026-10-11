const { chromium } = require('/opt/node-tools/node_modules/playwright');
const W=1280,H=720, BASE='http://localhost:3000';
const font = `font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif`;
const card = (inner, bg='#0b0b10') => `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:${bg};color:#fff;${font};overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center">
<style>
@keyframes up{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes glow{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.a{opacity:0;animation:up .8s cubic-bezier(.2,.8,.2,1) forwards}
.d1{animation-delay:.2s}.d2{animation-delay:.7s}.d3{animation-delay:1.3s}.d4{animation-delay:1.9s}
.orb{position:absolute;width:700px;height:700px;border-radius:50%;filter:blur(120px);opacity:.35;animation:glow 5s infinite}
h1{font-size:104px;margin:0;letter-spacing:-4px;font-weight:800}
p{font-size:34px;color:#c9c9d6;margin:18px 0 0}
.pill{display:inline-block;padding:14px 26px;border-radius:14px;background:#17171f;border:1px solid #2c2c3a;font-size:28px;margin:8px}
.arrow{color:#ff4d6d;font-size:32px;margin:0 6px}
code,pre{font-family:ui-monospace,Menlo,monospace}
</style>
<div class="orb" style="background:#ff2d55;left:-150px;top:-200px"></div><div class="orb" style="background:#5b5bff;right:-200px;bottom:-250px;animation-delay:-2s"></div>
<div style="position:relative">${inner}</div></body></html>`;

const caption = `
(()=>{ if(window.__cap) return; window.__cap=1;
 const init=()=>{
  const c=document.createElement('div'); c.id='cap';
  c.style.cssText='position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:99999;padding:16px 30px;border-radius:999px;background:rgba(10,10,16,.92);color:#fff;font:600 26px Inter,system-ui,sans-serif;transition:all .5s;box-shadow:0 12px 40px rgba(0,0,0,.35);white-space:nowrap';
  document.body.appendChild(c);
  const k=document.createElement('div'); k.id='cur';
  k.style.cssText='position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;background:rgba(255,45,85,.85);border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,45,85,.25);left:640px;top:360px;transition:left .9s cubic-bezier(.4,0,.2,1),top .9s cubic-bezier(.4,0,.2,1);pointer-events:none';
  document.body.appendChild(k);
 };
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
 window.cap=t=>{const c=document.getElementById('cap'); if(!c)return; if(!t){c.style.opacity=0;c.style.transform='translateX(-50%) translateY(20px)';return;} c.textContent=t;c.style.opacity=1;c.style.transform='translateX(-50%)'};
 window.cur=(x,y)=>{const k=document.getElementById('cur'); if(k){k.style.left=x+'px';k.style.top=y+'px'}};
})();`;

(async()=>{
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx = await b.newContext({viewport:{width:W,height:H},recordVideo:{dir:'rec',size:{width:W,height:H}}});
 await ctx.addInitScript(caption);
 const p = await ctx.newPage();
 const sleep=ms=>p.waitForTimeout(ms);
 const say=async t=>p.evaluate(t=>window.cap&&window.cap(t),t);
 const moveTo=async(sel)=>{const e=p.locator(sel).first(); const bb=await e.boundingBox(); if(!bb)return; const x=bb.x+bb.width/2,y=bb.y+bb.height/2; await p.evaluate(([x,y])=>window.cur(x,y),[x,y]); await p.mouse.move(x,y,{steps:20}); await sleep(900);};
 const go=async(u)=>{await p.goto(BASE+u); await p.waitForSelector('#cap',{state:'attached'}); await sleep(900);};
 const smooth=async(y)=>p.evaluate(y=>{const el=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+50&&['auto','scroll'].includes(getComputedStyle(e).overflowY))||document.scrollingElement; el.scrollTo({top:y,behavior:'smooth'})},y);

 // 1 intro
 await p.setContent(card(`<div class="a d1" style="font-size:30px;color:#ff4d6d;letter-spacing:6px;font-weight:700">OPEN SOURCE · LOCAL FIRST</div>
  <h1 class="a d2" style="margin-top:20px">Tube<span style="color:#ff2d55">Log</span></h1>
  <p class="a d3">Turn YouTube into your local<br>Markdown learning library.</p>`)); await sleep(4800);
 // 2 problem/pipeline
 await p.setContent(card(`<div class="a d1" style="font-size:54px;font-weight:800;letter-spacing:-2px">The video is the source.<br><span style="color:#8c8cff">The filesystem is the database.</span></div>
  <div class="a d3" style="margin-top:48px"><span class="pill">📺 Channel</span><span class="arrow">→</span><span class="pill">📝 Transcript</span><span class="arrow">→</span><span class="pill">📄 .md file</span><span class="arrow">→</span><span class="pill">✨ AI blog</span></div>`)); await sleep(5200);

 // 3 dashboard
 await go('/'); await say('Your private library — 100% on your machine'); await sleep(2200);
 await moveTo('text=Add Content'); await say('Paste a channel, @handle or single video'); await sleep(1500);
 await smooth(380); await sleep(1800); await smooth(0); await say(null); await sleep(600);

 // 4 discover
 await moveTo('a[href="/discover"]'); await p.click('a[href="/discover"]'); await sleep(1200);
 await say('Discover: 100 built-in channels — Tech, AI, SaaS, News'); await sleep(2000);
 const s = p.locator('input').first(); await moveTo('input'); await s.click(); await p.keyboard.type('AI',{delay:220}); await sleep(1800);
 await smooth(300); await sleep(1500); await say(null);

 // 5 channel
 await moveTo('a[href="/channels"]'); await p.click('a[href="/channels"]'); await sleep(1000);
 await moveTo('a[href="/channels/ycombinator"]'); await p.click('a[href="/channels/ycombinator"]'); await sleep(1200);
 await say('One folder of Markdown per channel. Sync again — no duplicates'); await sleep(2800); await smooth(300); await sleep(1500); await say(null);

 // 6 videos + panel
 await moveTo('a[href="/videos"]'); await p.click('a[href="/videos"]'); await sleep(1500);
 await say('Every transcript, searchable in one place'); await sleep(1800);
 const row = p.locator('tbody tr').nth(1); const rb = await row.boundingBox();
 if(rb){await p.evaluate(([x,y])=>window.cur(x,y),[rb.x+300,rb.y+30]); await p.mouse.move(rb.x+300,rb.y+30,{steps:20}); await sleep(900); await row.click(); await sleep(1500);
  await say('Open a video: overview · transcript · AI blog'); await sleep(2200);
  const tabs=p.locator('[role=tab]'); const n=await tabs.count(); for(let i=1;i<Math.min(n,3);i++){ const bb=await tabs.nth(i).boundingBox(); if(bb){await p.evaluate(([x,y])=>window.cur(x,y),[bb.x+bb.width/2,bb.y+10]); await sleep(900); await tabs.nth(i).click().catch(()=>{}); await sleep(1700);} }
  await p.keyboard.press('Escape'); await sleep(500);}
 await say(null);

 // 7 blogs
 await moveTo('a[href="/blogs"]'); await p.click('a[href="/blogs"]'); await sleep(1200);
 await say('AI blogs written from transcripts with OpenRouter'); await sleep(1800);
 await moveTo('text=Read'); await p.click('text=Read').catch(()=>{}); await sleep(2500); await smooth(500); await sleep(2000); await say(null);

 // 8 CLI
 await p.setContent(card(`<div class="a d1" style="font-size:48px;font-weight:800;letter-spacing:-1.5px;margin-bottom:34px">CLI · HTTP API · Dashboard — one core</div>
  <pre class="a d2" style="text-align:left;background:#12121a;border:1px solid #2c2c3a;border-radius:18px;padding:34px 44px;font-size:30px;line-height:1.7;margin:0;color:#e6e6f0"><span style="color:#6b6b80">$</span> tubelog sync youtube.com/@fireship
<span style="color:#4ade80">✓ 20 transcripts archived → videos/fireship/*.md</span>
<span style="color:#6b6b80">$</span> tubelog sync @fireship <span style="color:#ff4d6d">--ai</span>
<span style="color:#4ade80">✓ blogs written for new videos</span>
<span style="color:#6b6b80">$</span> tubelog search "react server components"</pre>
  <p class="a d4" style="font-size:26px">Plus Instagram carousels from any transcript ✨</p>`)); await sleep(6500);
 // 9 outro
 await p.setContent(card(`<h1 class="a d1" style="font-size:84px">Get it in 30 seconds</h1>
  <pre class="a d2" style="display:inline-block;text-align:left;background:#12121a;border:1px solid #2c2c3a;border-radius:18px;padding:28px 44px;font-size:32px;line-height:1.7;margin:34px 0 0"><span style="color:#6b6b80">$</span> git clone github.com/shreyvijayvargiya/tubelog
<span style="color:#6b6b80">$</span> npm install &amp;&amp; npm run dev</pre>
  <p class="a d3" style="font-size:36px;color:#fff">⭐ Star it on GitHub · MIT licensed</p>
  <p class="a d4" style="font-size:28px">github.com/shreyvijayvargiya/tubelog</p>`)); await sleep(6500);
 await ctx.close(); await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
