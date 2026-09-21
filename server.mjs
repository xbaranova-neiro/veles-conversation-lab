import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {newConversation,turn,detect} from './engine.mjs';
import {generate} from './ai.mjs';
import {runChecks} from './checks.mjs';
const root=new URL('./public/',import.meta.url);
const files=new Map([['/','index.html'],['/app.mjs','app.mjs'],['/style.css','style.css'],['/knowledge.mjs','knowledge.mjs']]);
const types={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const conversationTitle=state=>{
 const first=state.messages.find(message=>message.role==='user')?.text?.trim();
 return first?(first.length>38?first.slice(0,38)+'…':first):'Новый диалог';
};
const conversationList=session=>[session.state,...session.conversations].map(state=>({id:state.id,title:conversationTitle(state),status:state.status,messages:state.messages.filter(message=>message.role==='user').length,active:state.id===session.state.id}));
export function createApp(){
 const sessions=new Map();
 const serverKey=process.env.OPENAI_API_KEY?.trim()||'';
 const serverModel=process.env.OPENAI_MODEL?.trim()||'gpt-5.5';
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try{
   const host=req.headers.host;
   if(!host||!/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(host)){send(403,{error:'Некорректный адрес страницы.'});return;}
   const protocol=req.headers['x-forwarded-proto']==='https'?'https':'http';
   const origin=protocol+'://'+host;
   if(req.headers.origin&&req.headers.origin!==origin){send(403,{error:'Запрос разрешён только с локальной страницы.'});return;}
   const path=new URL(req.url,origin).pathname;
   if(req.method==='GET'&&files.has(path)){const name=files.get(path);res.setHeader('Content-Type',types[name.split('.').pop()]);res.end(await readFile(new URL(name,root)));return;}
   if(!path.startsWith('/api/')){send(404,{error:'Страница не найдена'});return;}
   const id=req.headers.cookie?.match(/(?:^|; )veles_session=([a-f0-9-]+)/)?.[1];
   let session=sessions.get(id);
   for(const [key,v] of sessions)if(Date.now()-v.touched>8*60*60*1000)sessions.delete(key);
   if(req.method==='GET'&&path==='/api/bootstrap'){
    if(!session){if(sessions.size>=100){send(503,{error:'Слишком много тестовых сессий.'});return;}
     const sid=randomUUID();session={csrf:randomBytes(24).toString('hex'),state:newConversation(randomUUID()),conversations:[],settings:{mode:serverKey?'ai':'demo',model:serverModel,apiKey:serverKey},touched:Date.now(),busy:false};sessions.set(sid,session);
     res.setHeader('Set-Cookie',`veles_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${protocol==='https'?'; Secure':''}`);
    }
    session.touched=Date.now();send(200,{csrf:session.csrf,state:session.state,conversations:conversationList(session),settings:{mode:session.settings.mode,model:session.settings.model,hasKey:!!session.settings.apiKey,serverManagedKey:!!serverKey}});return;
   }
   if(!session||req.headers['x-csrf-token']!==session.csrf){send(403,{error:'Сессия истекла. Обновите страницу.'});return;}
   if(req.method!=='POST'){send(405,{error:'Метод не поддерживается'});return;}
   if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'Ожидается JSON'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000){send(413,{error:'Запрос слишком большой'});return;}}
   let data;try{data=JSON.parse(body||'{}');}catch{send(400,{error:'Неверный JSON'});return;}
   session.touched=Date.now();
   if(session.busy){send(409,{error:'Дождитесь ответа на предыдущее сообщение.'});return;}
   if(path==='/api/new'){
    if(session.state.messages.length)session.conversations.unshift(session.state);
    session.conversations=session.conversations.slice(0,19);session.state=newConversation(randomUUID());
    send(200,{state:session.state,conversations:conversationList(session)});return;
   }
   if(path==='/api/switch'){
    const index=session.conversations.findIndex(conversation=>conversation.id===data.id);
    if(index<0){send(404,{error:'Диалог не найден или уже завершён.'});return;}
    const current=session.state;session.state=session.conversations.splice(index,1)[0];
    if(current.messages.length)session.conversations.unshift(current);
    send(200,{state:session.state,conversations:conversationList(session)});return;
   }
   if(path==='/api/settings'){
    if(serverKey){session.settings={mode:'ai',model:serverModel,apiKey:serverKey};send(200,{settings:{mode:'ai',model:serverModel,hasKey:true,serverManagedKey:true}});return;}
    if(!['demo','ai'].includes(data.mode)){send(400,{error:'Выберите режим'});return;}
    const key=data.clearKey?'':typeof data.apiKey==='string'&&data.apiKey.trim()?data.apiKey.trim():session.settings.apiKey;
    if(data.mode==='ai'&&!key){send(400,{error:'Для AI-режима нужен API-ключ.'});return;}
    if(typeof data.model!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(data.model)){send(400,{error:'Укажите название модели'});return;}
    if(key.length>500){send(400,{error:'Проверьте API-ключ'});return;}
    session.settings={mode:data.mode,model:data.model,apiKey:key};send(200,{settings:{mode:data.mode,model:data.model,hasKey:!!key,serverManagedKey:false}});return;
   }
   if(path==='/api/checks'){send(200,{report:runChecks()});return;}
   if(path==='/api/message'){
    if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2000){send(400,{error:'Введите сообщение от 1 до 2000 символов.'});return;}
    if(data.revision!==session.state.revision){send(409,{error:'Диалог изменился в другой вкладке. Обновите страницу.'});return;}
    if(session.state.messages.length>=100){send(400,{error:'Тестовый диалог достиг лимита. Скачайте его и начните новый.'});return;}
    session.busy=true;
    try{
     let semantic=null;const localPlan=turn(session.state,data.text);
     if(session.settings.mode==='ai'&&!localPlan.locked)semantic=await generate(session.state,data.text,session.settings);
     const result=turn(session.state,data.text,semantic);session.state=result.state;
     send(200,{...result,conversations:conversationList(session),mode:session.settings.mode,usedModel:!!semantic});
    }finally{session.busy=false;}return;
   }
   send(404,{error:'Метод не найден'});
  }catch(e){if(!res.headersSent)send(500,{error:e.name==='TimeoutError'?'Модель не ответила за 45 секунд. Можно повторить сообщение.':e.message?.includes('fetch')?'Не удалось подключиться к AI. Проверьте соединение и настройки.':e.message||'Не удалось обработать запрос.'});else res.end();}
 });
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||process.env.VELES_PORT||4173);const host=process.env.VELES_HOST||'127.0.0.1';const server=createApp();server.listen(port,host,()=>console.log(`Veles prototype: http://${host}:${port}`));
}
