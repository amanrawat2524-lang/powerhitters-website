const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHmac}=require('node:crypto');
const source=fs.readFileSync(require.resolve('../api/verify-payment.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const secret='offline-test-secret';
const signature=createHmac('sha256',secret).update('order_test|pay_test').digest('hex');
const valid={registrationId:'test-registration',razorpay_payment_id:'pay_test',razorpay_order_id:'order_test',razorpay_signature:signature};
const row={id:1,razorpay_order_id:'order_test',razorpay_payment_id:'pay_test',amount_paise:99900,currency:'INR',status:'captured',verified:true};
async function verify(input,options={}){
 const envNames=['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY'];
 const previous=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));const originalFetch=global.fetch;const calls=[];
 Object.assign(process.env,{RAZORPAY_KEY_ID:'offline-key',RAZORPAY_KEY_SECRET:secret,SUPABASE_URL:'https://database.invalid',SUPABASE_SECRET_KEY:'offline-only'});
 global.fetch=async(url,init={})=>{
  calls.push({url,method:init.method||'GET',body:init.body});
  if(url.includes('/rest/v1/payments?')&&!init.method)return Response.json([options.row||row]);
  if(url==='https://api.razorpay.com/v1/payments/pay_test')return Response.json(options.payment||{order_id:'order_test',amount:99900,currency:'INR',status:'captured',method:'upi'});
  if(url.endsWith('/capture'))return Response.json({order_id:'order_test',amount:99900,currency:'INR',status:'captured',method:'upi'});
  if(init.method==='PATCH')return new Response(null,{status:204});
  throw Error('Unexpected mocked request');
 };
 try{
 const {POST}=await modulePromise;
 const response=await POST(new Request('https://offline.invalid',{method:'POST',body:options.raw===undefined?JSON.stringify(input):options.raw}));
 return {status:response.status,body:await response.json(),calls};
 }finally{global.fetch=originalFetch;for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
}
test('already-verified payment rejects a wrong order before any success response',async()=>{
 const r=await verify({...valid,razorpay_order_id:'order_wrong'});assert.equal(r.status,400);assert.equal(r.body.success,false);assert.equal(r.calls.length,1);
});
test('already-verified payment rejects a forged signature',async()=>{
 const r=await verify({...valid,razorpay_signature:'0'.repeat(64)});assert.equal(r.status,400);assert.equal(r.body.success,false);assert.equal(r.calls.length,1);
});
test('authenticated replay preserves already-verified success without mutations',async()=>{
 const r=await verify(valid);assert.equal(r.status,200);assert.equal(r.body.already_verified,true);assert.equal(r.calls.length,1);
});
test('malformed JSON/types/signatures fail before any database request',async()=>{
 for(const input of [null,[],{}, {...valid,registrationId:{}},{...valid,razorpay_payment_id:['pay_test']},{...valid,razorpay_signature:'invalid'},{...valid,razorpay_order_id:'x'.repeat(129)}]){
  const r=await verify(input);assert.equal(r.status,400);assert.equal(r.calls.length,0);
 }
 const r=await verify(null,{raw:'{'});assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
test('legacy numeric registration IDs remain supported',async()=>{
 const r=await verify({...valid,registrationId:123});assert.equal(r.status,200);assert.ok(r.calls[0].url.includes('registration_id=eq.123'));
});
test('valid new captured payment follows signature, provider and record checks',async()=>{
 const r=await verify(valid,{row:{...row,verified:false,status:'created',razorpay_payment_id:null}});
 assert.equal(r.status,200);assert.equal(r.body.verified,true);assert.equal(r.calls.filter(c=>c.method==='PATCH').length,2);
 assert.equal(r.calls[1].url,'https://api.razorpay.com/v1/payments/pay_test');
});
test('provider amount/currency/order mismatch cannot update payment records',async()=>{
 for(const change of [{amount:1},{currency:'USD'},{order_id:'order_other'}]){
 const r=await verify(valid,{row:{...row,verified:false},payment:{order_id:'order_test',amount:99900,currency:'INR',status:'captured',...change}});
 assert.equal(r.status,400);assert.equal(r.calls.some(c=>c.method==='PATCH'),false);
 }
});
test('valid authorized payment capture flow remains supported with mocked provider',async()=>{
 const r=await verify(valid,{row:{...row,verified:false},payment:{order_id:'order_test',amount:99900,currency:'INR',status:'authorized'}});
 assert.equal(r.status,200);assert.equal(r.calls.filter(c=>c.method==='POST').length,1);assert.equal(r.calls.filter(c=>c.method==='PATCH').length,2);
});
