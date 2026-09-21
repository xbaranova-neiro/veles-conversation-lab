import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {generate,aiRequest} from '../ai.mjs';
import {newConversation} from '../engine.mjs';
test('HTTP: сессии, CSRF, очередь, восстановление, сброс и ошибки',async t=>{
 const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const boot=await fetch(base+'/api/bootstrap');const cookie=boot.headers.get('set-cookie').split(';')[0];const {csrf}=await boot.json();
 const headers={'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,Origin:base};
 const post=(path,data,extra={})=>fetch(base+'/api/'+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 await t.test('Нет запросов со стороннего сайта',async()=>{assert.equal((await post('new',{}, {Origin:'https://evil.example'})).status,403);});
 await t.test('Нужен CSRF-токен',async()=>{assert.equal((await post('new',{}, {'X-CSRF-Token':'wrong'})).status,403);});
 await t.test('Валидация ввода',async()=>{assert.equal((await post('message',{text:'',revision:0})).status,400);assert.equal((await post('message',{text:'x'.repeat(2001),revision:0})).status,400);});
 await t.test('Сообщение и восстановление',async()=>{const r=await post('message',{text:'Хочу 80 м² в Туле',revision:0});const j=await r.json();assert.equal(j.state.facts.area.value,'80 м²');const restore=await(await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).json();assert.equal(restore.state.revision,1);assert.equal(restore.state.messages.length,2);});
 await t.test('Устаревшая вкладка не дублирует реплику',async()=>{assert.equal((await post('message',{text:'Дубль',revision:0})).status,409);});
 await t.test('Ключ не выдаётся при восстановлении',async()=>{const r=await post('settings',{mode:'ai',model:'test-model',apiKey:'TEST-ONLY-NOT-A-REAL-KEY'});assert.equal(r.status,200);const body=await(await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).text();assert.ok(!body.includes('TEST-ONLY'));assert.equal(JSON.parse(body).settings.hasKey,true);});
 await t.test('Все диалоги выгружаются без API-ключа',async()=>{const r=await fetch(base+'/api/export',{headers:{Cookie:cookie,'X-CSRF-Token':csrf}});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/veles-all-dialogs\.json/);const body=await r.text();assert.ok(!body.includes('TEST-ONLY'));assert.equal(JSON.parse(body).conversations.length,1);});
 await t.test('Удаление ключа и возврат в демо',async()=>{assert.equal((await post('settings',{mode:'demo',model:'gpt-6-astra',clearKey:true})).status,200);assert.equal((await post('settings',{mode:'ai',model:'gpt-6-astra'})).status,400);});
 await t.test('Автотесты выполняются без AI',async()=>{const j=await(await post('checks',{})).json();assert.equal(j.report.total,j.report.passed);});
 await t.test('Новая сессия чистая',async()=>{const j=await(await fetch(base+'/api/bootstrap')).json();assert.equal(j.state.revision,0);assert.equal(j.settings.hasKey,false);});
 await t.test('Исходники сервера не раздаются',async()=>{assert.equal((await fetch(base+'/server.mjs')).status,404);assert.equal((await fetch(base+'/../package.json')).status,404);});
 await t.test('Сброс очищает диалог',async()=>{const j=await(await post('new',{})).json();assert.equal(j.state.messages.length,0);assert.equal(j.state.handoff,null);});
});
test('AI adapter: проверенный формат Responses API и разбор JSON',async()=>{
 let request;const output={intent:'greeting',facts:[],reply:'Здравствуйте! Какой дом рассматриваете?'};
 const result=await generate(newConversation(),'привет',{apiKey:'fake-test-key',model:'test-model'},async(url,opts)=>{request={url,...opts};return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]})};});
 assert.deepEqual(result,output);assert.equal(request.url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input.at(-1).content,'привет');
});
test('AI adapter: ключ не попадает в ошибки 401',async()=>{await assert.rejects(()=>generate(newConversation(),'x',{apiKey:'secret',model:'test'},async()=>({ok:false,status:401})),/Ключ не принят/);});
test('AI adapter: повреждённый JSON отклоняется',async()=>{await assert.rejects(()=>generate(newConversation(),'x',{apiKey:'secret',model:'test'},async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'<html>'}]}]})})),/неверном формате/);});
test('AI adapter: незавершённый ответ отклоняется',async()=>{await assert.rejects(()=>generate(newConversation(),'x',{apiKey:'secret',model:'test'},async()=>({ok:true,json:async()=>({status:'incomplete'})})),/не закончила/);});
test('HTTP: новый чат сохраняет предыдущий и позволяет вернуться',async t=>{
 const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const boot=await fetch(base+'/api/bootstrap');const cookie=boot.headers.get('set-cookie').split(';')[0];const first=await boot.json();const headers={'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':first.csrf,Origin:base};
 const post=(path,data)=>fetch(base+'/api/'+path,{method:'POST',headers,body:JSON.stringify(data)});
 const answered=await(await post('message',{text:'Первый тестовый клиент',revision:0})).json();const oldId=answered.state.id;
 const created=await(await post('new',{})).json();assert.equal(created.state.messages.length,0);assert.equal(created.conversations.length,2);assert.ok(created.conversations.some(item=>item.id===oldId&&!item.active));
 const restored=await(await post('switch',{id:oldId})).json();assert.equal(restored.state.id,oldId);assert.equal(restored.state.messages[0].text,'Первый тестовый клиент');assert.ok(restored.conversations.find(item=>item.id===oldId).active);
});
