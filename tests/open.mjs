// Shared by the View from here and sky tests: open the site in Chromium, wait for the lens, return the page.
// With a second argument (a dist/ folder from scripts/build_site.mjs) the page and its assets/ come from that folder while
// tiles and records still come from the live site, so a build can be tested before it is deployed.
import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';
export async function openSite(BASE,dist,viewport){
  const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
  const ctx=await b.newContext({viewport:viewport||{width:1300,height:900}});
  if(dist){dist=path.resolve(dist)+'/';await ctx.route(u=>u.href.startsWith(BASE),async r=>{const u=new URL(r.request().url());let f=null;
    if(u.pathname==='/'||u.pathname==='/index.html')f=dist+'index.html';else if(u.pathname.startsWith('/assets/')&&fs.existsSync(dist+u.pathname.slice(1)))f=dist+u.pathname.slice(1);
    if(!f)return r.continue();const live=await r.fetch().catch(()=>null),h=live?live.headers():{};delete h['content-length'];delete h['content-encoding'];
    r.fulfill({status:200,headers:{...h,'content-type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':'text/javascript; charset=utf-8'},body:fs.readFileSync(f)})})}
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));
  const open=async hash=>{await p.goto(BASE+hash,{waitUntil:'load'});await p.waitForTimeout(2500);
    if(await p.evaluate(()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller))){await p.goto('about:blank');await p.goto(BASE+hash,{waitUntil:'load'})}
    await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(1500)};
  return {b,ctx,p,errs,open}}
