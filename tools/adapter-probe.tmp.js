/* 一次性探针：复现 cdp-verify 的歌曲页播放点击序列，逐步抓状态。用后即删。 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const http = require('http');
const BASE = 'http://127.0.0.1:8643/';
const PORT_HTTP = 8643, PORT_CDP = 9339;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.mid':'audio/midi','.css':'text/css'};
const srv = http.createServer((req,res)=>{const fp=path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0]));fs.readFile(fp,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);});}).listen(PORT_HTTP,'127.0.0.1');
class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.handlers=new Map();ws.onmessage=(e)=>this._msg(JSON.parse(e.data));}
  static connect(url){return new Promise((res,rej)=>{const ws=new WebSocket(url);ws.onopen=()=>res(new CDP(ws));ws.onerror=rej;});}
  send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{res,rej});this.ws.send(JSON.stringify({id,method,params}));});}
  on(ev,fn){this.handlers.set(ev,fn);}
  _msg(m){if(m.id&&this.pending.has(m.id)){const{res,rej}=this.pending.get(m.id);this.pending.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);return;}if(m.method&&this.handlers.has(m.method))this.handlers.get(m.method)(m.params);}
}
setTimeout(()=>{console.error('TIMEOUT');process.exit(2);},120000);
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spprobe-'));
  const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+PORT_CDP,'--user-data-dir='+profile,'--no-first-run','--disable-gpu','--autoplay-policy=no-user-gesture-required','--allow-file-access-from-files','about:blank'],{stdio:'ignore'});
  let list=null;
  for(let i=0;i<60;i++){try{list=await(await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json();break;}catch{await new Promise(r=>setTimeout(r,250));}}
  const cdp=await CDP.connect(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const errs=[];
  cdp.on('Runtime.consoleAPICalled',p=>{errs.push(p.type+': '+(p.args||[]).map(a=>a.value||a.description||'').join(' ').slice(0,250));});
  cdp.on('Runtime.exceptionThrown',p=>{errs.push('EXC: '+((p.exceptionDetails.exception&&p.exceptionDetails.exception.description)||p.exceptionDetails.text).slice(0,300));});
  await cdp.send('Page.navigate',{url:BASE+'index.html#/song/MUS-S-0001'});
  /* 等渲染完成 */
  for (let i=0;i<30;i++){await new Promise(r=>setTimeout(r,1000));const v=await cdp.send('Runtime.evaluate',{expression:"(document.querySelector('#secSing [data-kind=\"piano\"]')?1:0)",returnByValue:true});if(v.result.value)break;}
  await new Promise(r=>setTimeout(r,1000));
  const ev = async (expr) => (await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true})).result.value;
  const snap = `(async (label) => {
    const st = document.getElementById('playState');
    const tm = document.getElementById('playTime');
    const btn = document.getElementById('btnToggle');
    return label + ' | state=' + (st?st.textContent:'?') + ' | time=' + (tm?tm.textContent:'?') + ' | btn=' + (btn?btn.textContent:'?');
  })`;
  console.log(await ev(`${snap}('init')`));
  await ev(`window.MOS_MIDI_DEBUG = true; true`);
  console.log('pianoBtn exists:', await ev(`Boolean(document.querySelector('#secSing [data-kind="piano"]'))`));
  await ev(`(async () => { const b = document.querySelector('#secSing [data-kind="piano"]'); b.__tok = 'A1'; window.__tokBtn = b; b.click(); await new Promise(r=>setTimeout(r,4000)); return true; })()`);
  console.log(await ev(`${snap}('after 4s play')`));
  console.log('same node:', await ev(`window.__tokBtn.isConnected && document.querySelector('#secSing [data-kind="piano"]') === window.__tokBtn`));
  console.log(await ev(`${snap}('check2')`));
  console.log('console:', errs.slice(0,14));
  chrome.kill();srv.close();process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
