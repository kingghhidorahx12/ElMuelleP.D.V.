const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),raw=fs.readFileSync(path.join(repo,'public/app.js')),source=raw.toString().replace(/\r\n/g,'\n');
test('Approved Windows source really opens 9600 8N1, starts reading, and writes P without terminator every 800 ms',async()=>{
 const hash=crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
 const policy=fs.readFileSync(path.join(__dirname,'app/src/main/java/mx/elmuelle/pdv/ScaleSerialPolicy.java'),'utf8');assert.ok(policy.includes(hash),'Windows witness must identify the actual approved source');
 const defaults=source.slice(source.indexOf('const scaleState = {'),source.indexOf('const scaleState = {')+850);assert.match(defaults,/command: readLocalPreference\("scaleCommand"\) \|\| "P"/);assert.match(defaults,/pollMs: Number\(readLocalPreference\("scalePollMs"\) \|\| 800\)/);
 const events=[],intervals=[],writes=[];let open;
 const port={writable:{getWriter:()=>({write:async bytes=>{writes.push([...bytes]);events.push('P');},releaseLock:()=>{}})},open:async options=>{open=options;events.push('open');}};
 const context={scaleState:{supported:true,connected:false,baudRate:9600,command:'P',pollMs:800},navigator:{serial:{requestPort:async()=>port}},applyScaleSettings:()=>{},updateScaleUi:()=>{},showToast:()=>{},readScaleLoop:()=>events.push('read'),console,TextEncoder,Uint8Array,Number,Date,window:{setInterval:(fn,ms)=>{intervals.push({fn,ms});return 1;},clearInterval:()=>{}}};vm.createContext(context);
 const start=source.indexOf('function getScaleCommandBytes() {'),end=source.indexOf('async function disconnectScale() {',start);vm.runInContext(source.slice(start,end),context);
 await vm.runInContext('connectScale()',context);await new Promise(resolve=>setImmediate(resolve));assert.equal(open.baudRate,9600);assert.equal(open.dataBits,8);assert.equal(open.parity,'none');assert.equal(open.stopBits,1);assert.equal(open.flowControl,'none');assert.deepEqual(events,['open','read','P']);assert.deepEqual(writes,[[0x50]]);assert.equal(intervals[0].ms,800);await intervals[0].fn();assert.deepEqual(writes,[[0x50],[0x50]]);
 console.log(JSON.stringify({windowsSourceSHA256:hash,readBeforeRequest:true,requestHex:'50',terminator:'NONE',pollMs:800,baud:9600,dataBits:8,parity:'none',stopBits:1,flowControl:'none'}));
});
