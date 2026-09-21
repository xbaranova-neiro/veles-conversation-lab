import { fieldLabels } from './public/knowledge.mjs';
export const INTENTS = ['greeting','tone_feedback','price','price_conflict','estimate','packages','windows','warm','finish','utilities','land','region','project','examples','portfolio','foundation','timing','winter','warranty','quality','mortgage','approval','escrow','installment','free_project','office','company_phone','human','expensive','thanks','identity','stop','no_calls','no_phone','unknown'];
const norm = t => t.toLowerCase().replaceAll('ё','е').replace(/кв\.?\s*м\.?/g,'м²').replace(/расч[еи]т|расчет/g,'расчет');
export function newConversation(id='test',{humanImperfection=false}={}) {
  return {id, messages:[], facts:{}, asked:[], status:'active', channel:'Не выбран', noCalls:false, phoneRefused:false, handoff:null, events:[], sourceIds:[], intent:'greeting', revision:0, style:{humanImperfection,imperfectionUsed:false}};
}
function addHumanImperfection(reply,id){
  if(/\d|₽|%|https?:|@/.test(reply))return reply;
  const typos=[['строить','сторить'],['площадь','плоащдь'],['планируете','планриуете'],['участок','учсток'],['обсудим','обсудми'],['Хорошо','Хоршо']];
  const available=typos.filter(([word])=>reply.includes(word));
  const variant=[...String(id)].reduce((sum,char)=>sum+char.charCodeAt(0),0)%2;
  if(variant&&available.length){const [word,typo]=available[0];return reply.replace(word,typo);}
  return reply.replace(/^([А-ЯЁ])/,letter=>letter.toLowerCase());
}
const put=(s,k,value,evidence)=>{ if(value && fieldLabels[k]) s.facts[k]={value:String(value),evidence}; };
export function extract(s, raw) {
  const t=norm(raw);
  const number=raw.match(/(?<!\d)(?:\+7|8|7)[\s(-]*9\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/);
  if(number) put(s,'phone','+7'+number[0].replace(/\D/g,'').slice(1),number[0]);
  const name=raw.match(/(?:меня зовут|мое имя|моё имя|зовут меня)\s+([А-Яа-яЁё-]{2,30})/i);
  if(name) put(s,'name',name[1][0].toUpperCase()+name[1].slice(1),name[0]);
  const target=/(?:нуж|хоч|интерес|планир|рассч|посчит|на\s+\d|дом\s+метров)/.test(t);
  const area=raw.match(/(?<!\d)(\d{2,3}(?:\s*[-–]\s*\d{2,3})?)\s*(?:м[²2]|кв\.?\s*м\.?|квадрат(?:ов|а)?|метр(?:ов|а)?)(?!\w)/i) || raw.match(/метров\s+(\d{2,3})/i);
  if(area && (!/объявлен|сайт/.test(t) || target)) put(s,'area',area[1].replace(/\s/g,'')+' м²',area[0]);
  if(!area && s.asked.at(-1)==='area' && /^\s*\d{2,3}(?:\s*[-–]\s*\d{2,3})?\s*$/.test(raw))put(s,'area',raw.trim()+' м²',raw);
  if(!/объявлен/.test(t) || target) {
    if(/одноэтаж|1 этаж|один этаж/.test(t)) put(s,'floors','1 этаж',raw);
    if(/двухэтаж|2 этаж|два этажа/.test(t)) put(s,'floors','2 этажа',raw);
    if(/мансард/.test(t)) put(s,'floors','Мансарда',raw);
  }
  const regions=[[/калуг/,'Калужская область'],[/алексин/,'Алексин'],[/новомосков/,'Новомосковск'],[/щек[иы]н/,'Щёкино'],[/заокск/,'Заокский район'],[/серпухов/,'Серпухов'],[/моск[ов]/,'Московская область'],[/тул[аеуыь]/,'Тула / Тульская область']];
  for(const [rx,label] of regions) if(rx.test(t) && !/(?:строите|работаете|офис|находитесь|вы из)/.test(t)) {put(s,'region',label,raw);break;}
  if(/участ(?:ка|ок)\s+(?:(?:пока|еще)\s+)?нет|без участка|ищ[уе].*участ|не купил/.test(t)) put(s,'land','Нужен участок',raw);
  else if(/участок\s+(?:у нас\s+|у меня\s+)?(?:уже\s+)?есть|есть\s+участок|свой участок/.test(t)) put(s,'land','Есть',raw);
  if(/как в объявлен|из объявлен|та же комплект|той же комплект|такой же комплект/.test(t)) put(s,'package','Как в объявлении — состав уточнить',raw);
  else if(/теплы[йм] контур/.test(t)) put(s,'package','Тёплый контур — состав уточнить',raw);
  else if(/(?:хочу|нужен|нужна|выбираю).*(стандарт|комфорт|лайтбокс)/.test(t)) put(s,'package',t.match(/стандарт|комфорт|лайтбокс/)[0],raw);
  else if(/^(?:стандарт|комфорт|лайтбокс)[.!\s]*$/.test(t))put(s,'package',t.replace(/[.!]/g,'').trim(),raw);
  else if(/(?:с отделкой|под ключ|готовый к проживанию|сразу заехать)/.test(t)&&!/[?]|что входит|можно ли/.test(t))put(s,'package','С отделкой — состав согласовать',raw);
  if(/как в объявлен|из объявлен|такой же как в объявлен/.test(t))put(s,'wishes','Дом как в объявлении',raw);
  else if(/(?:с отделкой|под ключ|готовый к проживанию|сразу заехать)/.test(t)&&!/[?]|что входит|можно ли/.test(t))put(s,'wishes','Дом с отделкой',raw);
  if(/постоянн|круглогод|для пмж/.test(t)) put(s,'purpose','Постоянное проживание',raw);
  else if(/для дачи|на дачу|сезонн|летний дом/.test(t)) put(s,'purpose','Сезонное проживание',raw);
  const budget=t.match(/(?:бюджет|располагаю|уложиться|уложить|есть)\s*(?:у нас|у меня|в|до|около|примерно)?\s*(\d+(?:[.,]\d+)?)\s*(млн|миллион)/);
  if(budget) put(s,'budget',budget[1]+' млн ₽',budget[0]);
  if(/ипотек/.test(t)) put(s,'payment','Интересуется ипотекой',raw);
  if(/рассроч/.test(t)) put(s,'payment','Интересуется рассрочкой',raw);
  if(/свои средства|наличн/.test(t)) put(s,'payment','Собственные средства',raw);
  const time=raw.match(/(?:после|до|с)\s+\d{1,2}(?::\d{2})?(?:\s*(?:до|[-–])\s*\d{1,2}(?::\d{2})?)?|(?:утром|вечером|завтра|в выходные)/i);
  if(time && (/звон|связ|удобн|номер|телефон/.test(t)||number||s.handoff)) put(s,'contactTime',time[0],time[0]);
  const beds=t.match(/(\d)\s*спальн/);if(beds)put(s,'bedrooms',beds[1],beds[0]);
  const timing=t.match(/(?:строить|начать|начинать|начинаем|начало|строительство)\s+(?:хотим\s+)?(?:в\s+|на\s+)?(весн[а-я]*|лет[а-я]*|осен[а-я]*|зим[а-я]*|20\d\d(?:\s*году)?)/);
  if(timing){const season=/^весн/.test(timing[1])?'весной':/^лет/.test(timing[1])?'летом':/^осен/.test(timing[1])?'осенью':/^зим/.test(timing[1])?'зимой':timing[1];put(s,'timing',season,timing[0]);}
  const wishes=[];
  for(const [rx,label] of [[/террас/,'терраса'],[/гараж/,'гараж'],[/котельн/,'котельная'],[/панорамн.*окн/,'панорамные окна'],[/второй свет/,'второй свет'],[/бан[яю]/,'баня'],[/кабинет/,'кабинет']])if(rx.test(t))wishes.push(label);
  if(wishes.length)put(s,'wishes',wishes.join(', '),raw);
}
export function detect(raw) {
  const t=norm(raw);
  if(/не беспоко|не пишите|не пиши|больше не надо|отстан|удалите.*номер|отмен(?:ить|ите) заяв|отказываюсь/.test(t))return 'stop';
  if(/не звон|без звон|никаких звон/.test(t))return 'no_calls';
  if(/(?:телефон|номер).*(?:не дам|не хочу|не остав|не даю)|не (?:хочу|буду|стану).*(?:телефон|номер)|без телефона|пишите (?:здесь|сюда)|только (?:в )?чат/.test(t))return 'no_phone';
  if(/неприлич|(?:слишком\s+)?(?:грубо|сухо)(?:\s+(?:ответ|напис|общ|сказ))?|по[- ]?человечески|нормально\s+(?:напиши|ответь|общай)|что\s+за\s+(?:ответ|формулиров)|как\s+(?:робот|нейросет)|странно\s+(?:напис|звуч)|так\s+не\s+говорят/.test(t))return 'tone_feedback';
  if(/(?:человек|живой|менеджер|оператор)/.test(t)&&/(?:нуж|позов|дайте|подключ|хочу|поговор|переда|свяж)/.test(t))return 'human';
  if(/почему.*(?:цен|дорож|разниц)|разбег|разниц.*цен|цен.*друг|друг.*цен|обман|развод|в объявлении.*(?:а |но )|вы.*другие цифры|дороже/.test(t))return 'price_conflict';
  if(/ты бот|вы бот|робот|нейросет|ты человек|вы человек/.test(t))return 'identity';
  if(/точно.*одобр|гарант.*одобр|одобрят|откажут/.test(t))return 'approval';
  if(/эскроу/.test(t))return 'escrow';
  if(/рассроч|поэтапн/.test(t))return 'installment';
  if(/ипотек|6\s*%|первоначальн|процент|ежемесячн.*плат/.test(t))return 'mortgage';
  if(/участ/.test(t)&&/входит|вместе|включен|цен/.test(t))return 'land';
  if(/септик|скважин|газиф|электрик|коммуникац|канализац/.test(t))return 'utilities';
  if(/окн|двер/.test(t))return 'windows';
  if(/тепл.*контур/.test(t)&&/(?:это|входит|что|включ|сколько|цен|сто)/.test(t))return 'warm';
  if(/заех|заезж|чистов|отделк|под ключ.*(?:что|знач)/.test(t))return 'finish';
  if(/что.*(?:вход|включ)|комплектац.*(?:каки|есть)|чем.*(?:стандарт|комфорт)|(?:стандарт|комфорт|лайтбокс).*(?:что|вход)/.test(t))return 'packages';
  if(/рассчит|расчит|расчет|посчит|смет|аналогичн|та же комплект/.test(t))return 'estimate';
  if(/сколько|цен|стоит|стоим|за метр|умнож/.test(t))return 'price';
  if(/дорого|не по карману/.test(t))return 'expensive';
  if(/где.*(?:офис|находит)|адрес|режим|во сколько|часы работы/.test(t))return 'office';
  if(/ваш (?:номер|телефон)|как.*позвон/.test(t))return 'company_phone';
  if(/бесплат.*проект|проект.*бесплат/.test(t))return 'free_project';
  if(/фундамент|геолог|грунт|плит[ау]/.test(t))return 'foundation';
  if(/зим.*стро|стро.*зим/.test(t))return 'winter';
  if(/гаранти/.test(t))return 'warranty';
  if(/камер|фотоотчет|технадзор|контрол.*стро|сертификат/.test(t))return 'quality';
  if(/срок|долго|когда.*готов|100 дней/.test(t))return 'timing';
  if(/(?:сво[йиему]+|мо[йему]+|измен|планиров|доработ|индивидуальн).*проект|проект.*(?:сво|измен)|планировк/.test(t))return 'project';
  if(/построенн|работы|экскурс|вживую|готовые дома|фотограф/.test(t))return 'portfolio';
  if(/покаж|пример|вариант|подбер|подбор|каталог/.test(t))return 'examples';
  if(/(?:строите|работаете|стройте).*(?:в |калуг|моск|тул)|(?:калуг|моск|тул).*строите/.test(t))return 'region';
  if(/участ/.test(t))return 'land';
  if(/^(?:спасибо|благодарю|понятно|ок|хорошо)[.!\s]*$/.test(t))return 'thanks';
  if(/^(?:здравствуйте|здравствуй|добрый день|добрый вечер|привет|доброго дня)[.!\s]*$/.test(t))return 'greeting';
  return 'unknown';
}
function event(s,text){s.events.push({text,at:new Date().toISOString()});}
function queue(s,reason){
  if(s.status==='stopped')return;
  if(!s.handoff){s.handoff={id:'VL-'+s.id.slice(0,6).toUpperCase(),reason,at:new Date().toISOString()};event(s,'Создана тестовая передача: '+reason);}
  s.status='handoff';s.channel=s.noCalls||s.phoneRefused?'Чат Авито':s.facts.phone?'Телефон':'Чат Авито';
}
function ask(s,field,text){if(s.asked.includes(field))return '';s.asked.push(field);return text;}
function requestContact(s,kind='details'){
  if(s.facts.phone||s.noCalls||s.phoneRefused)return '';
  const lines={
    calculation:'Могу посчитать точнее. Давайте созвонимся на несколько минут — оставите номер телефона?',
    budget:'Попробуем уложиться в эту сумму. Давайте созвонимся на несколько минут — оставите номер телефона?',
    details:'Тут лучше коротко созвониться и пройтись по деталям. Оставите номер телефона?'
  };
  return ask(s,'phone',lines[kind]||lines.details);
}
function knownPlan(s){
  return [
    s.facts.area||s.facts.floors,
    s.facts.purpose,
    s.facts.region||s.facts.land,
    s.facts.timing,
    s.facts.budget||s.facts.payment,
    s.facts.bedrooms||s.facts.wishes
  ].filter(Boolean).length;
}
function next(s,kind='details'){
  if(knownPlan(s)>=3){
    if(s.noCalls||s.phoneRefused){
      if(!s.facts.budget&&!s.facts.payment){const q=ask(s,'budget_payment','На какой бюджет рассчитываете?');if(q)return q;}
      if(!s.facts.wishes&&!s.facts.bedrooms){const q=ask(s,'wishes','Что точно хотите в доме: сколько спален, нужна ли терраса или кабинет?');if(q)return q;}
      return 'Хорошо. Что ещё хотите уточнить?';
    }
    return requestContact(s,kind);
  }
  if(!s.facts.area){const q=ask(s,'area','По площади примерно сколько хотите и в один этаж или два?');if(q)return q;}
  if(!s.facts.purpose){const q=ask(s,'purpose','Дом для себя жить или как дачу?');if(q)return q;}
  if(!s.facts.timing){const q=ask(s,'timing','Когда хотите начать?');if(q)return q;}
  if(!s.facts.region){const q=ask(s,'region','А строить где хотите?');if(q)return q;}
  return requestContact(s,kind);
}
export function turn(old, raw, semantic=null) {
  const s=structuredClone(old), before=structuredClone(old.facts), t=norm(raw);
  const firstAssistant=!old.messages.some(message=>message.role==='assistant');
  s.style??={humanImperfection:false,imperfectionUsed:false};
  s.revision++;s.messages.push({role:'user',text:raw,at:new Date().toISOString()});
  extract(s,raw);
  if(semantic?.facts)for(const fact of semantic.facts){
    // Model facts need a literal supporting span in this customer message.
    if(fact.field!=='phone' && fact.evidence?.length>=2 && raw.toLowerCase().includes(fact.evidence.toLowerCase()) && fact.value.length<=100 && !s.facts[fact.field])put(s,fact.field,fact.value,fact.evidence);
  }
  let detected=detect(raw);
  let intent=detected==='unknown'&&INTENTS.includes(semantic?.intent)?semantic.intent:detected;
  s.intent=intent;
  let reply='', source=[],locked=false, cards=[];
  const added=Object.keys(s.facts).filter(k=>s.facts[k]?.value!==before[k]?.value);
  if(added.length)event(s,'Сохранено: '+added.map(k=>fieldLabels[k]).join(', '));
  if(intent==='stop'){
    s.status='stopped';s.noCalls=true;s.channel='Контакты запрещены';locked=true;
    if(s.handoff)s.handoff.cancelled=true;
    event(s,'Отказ: тестовая передача и звонки отменены');reply=old.status==='stopped'?'':'Понял, больше беспокоить не будем.';
  }else if(old.status==='stopped'){
    s.status='stopped';locked=true;reply='';event(s,'Ответ отключён после отказа. Для новой проверки начните новый диалог.');
  }else if(firstAssistant&&/^\s*(?:але|алло|ау|вы\s+тут|есть\s+кто)\s*[?!.]*\s*$/.test(t)){
    locked=true;reply='Добрый день! Меня зовут Иван. Какой у вас вопрос?';
  }else if(intent==='no_calls'||intent==='no_phone'){
    s.noCalls=true;s.phoneRefused=intent==='no_phone'||s.phoneRefused;s.channel='Чат Авито';locked=true;
    reply=(intent==='no_calls'?'Хорошо, без звонков — продолжим здесь. ':'Хорошо, продолжим здесь. ')+next(s);
    event(s,'Канал связи: только чат, повторный запрос телефона запрещён');
  }else if(added.includes('phone')){
    queue(s,'Получен контакт');locked=true;reply=s.noCalls||s.phoneRefused?'Спасибо, номер получил. Как договорились, ответим здесь.':`Спасибо! Свяжемся с вами${s.facts.contactTime?' — удобное время учёл':''}${s.facts.area?' и обсудим ваш дом '+s.facts.area.value:''}.`;
  }else if(old.status==='handoff'){
    locked=true;reply='';event(s,'Новое сообщение добавлено в тестовую карточку. Помощник на паузе.');
  }else if(intent==='human'){
    reply='Конечно. '+requestContact(s,'details');
  }else{
    switch(intent){
      case'greeting':reply='Добрый день! Я Иван. Что по дому хотите узнать?';break;
      case'tone_feedback':reply=old.intent==='mortgage'?'Извините, неудачно написал. Да, с ипотекой работаем. Дом хотите для себя?':old.intent==='price'||old.intent==='price_conflict'?'Извините, неудачно написал. Давайте посчитаем именно ваш дом. По площади сколько хотите?':'Извините, неудачно написал. Скажите, что именно хотите узнать?';break;
      case'identity':reply='Я виртуальный помощник компании «Велес», в тестовом чате меня зовут Иван. Помогу разобраться с первыми вопросами.';break;
      case'price_conflict':reply='Цена может отличаться из-за проекта и участка. По цене сейчас так: тёплый контур — 60–80 тыс. ₽/м², предчистовая отделка — от 80 тыс. ₽/м². '+next(s,'calculation');source=['price'];break;
      case'estimate':reply=(s.facts.area?`Да, посчитаем дом ${s.facts.area.value}.`:'Да, можем посчитать.')+' '+next(s,'calculation');source=['price'];break;
      case'price':reply=(/умнож|за метр/.test(t)?'По цене сейчас так: тёплый контур — 60–80 тыс. ₽/м², предчистовая отделка — от 80 тыс. ₽/м².':s.facts.area?`Для дома ${s.facts.area.value} всё зависит от планировки и участка. Тёплый контур — 60–80 тыс. ₽/м², предчистовая отделка — от 80 тыс. ₽/м².`:'По цене сейчас так: тёплый контур — 60–80 тыс. ₽/м², предчистовая отделка — от 80 тыс. ₽/м². Точнее скажу, когда пойму сам дом и участок.')+' '+next(s,'calculation');source=['price'];break;
      case'packages':reply='Тут всё зависит от того, какой дом вам нужен и какой бюджет. '+next(s,'calculation');source=['packages'];break;
      case'windows':reply='Окна и двери обязательно учтём в расчёте под ваш проект. '+next(s,'calculation');source=['packages'];break;
      case'warm':reply='Да, можем рассчитать тёплый контур под ваш проект. '+next(s,'calculation');source=['packages'];break;
      case'finish':reply='Понял, нужен дом с отделкой. '+next(s,'calculation');source=['packages'];break;
      case'utilities':reply='Уточню, что войдёт в расчёт по коммуникациям. Что уже есть на участке?';source=['packages'];break;
      case'land':reply=/входит|вместе|включен|цен/.test(t)?'Участок в стоимость дома не входит, но с подбором поможем.':s.facts.land?.value==='Есть'?'Отлично, участок уже есть.':'Хорошо, поможем подобрать участок.';reply+=' '+next(s);source=['land'];break;
      case'region':reply='Да, строим в Тульской, Московской и Калужской областях. '+(s.facts.region?next(s):ask(s,'region','В каком городе или районе хотите строить?'));source=['company'];break;
      case'project':reply='Да, можем взять ваш проект или поменять планировку. Что хотите изменить?';source=['project'];break;
      case'examples':if(!s.facts.purpose){reply='Дом для себя жить или как дачу?';s.asked.push('purpose');}else{cards=s.facts.purpose.value==='Сезонное проживание'?['237']:s.facts.area&&parseInt(s.facts.area.value)>=120?['93']:[];reply=cards.length?'Вот этот проект можно взять за основу. Планировку потом подгоним под вас.':'Подберём. Сколько спален нужно?';}source=['project'];break;
      case'portfolio':reply='Да, покажу наши построенные дома. Если захотите посмотреть вживую, договоримся о просмотре.';source=['portfolio'];break;
      case'foundation':reply='Фундамент подбирает инженер по проекту и грунтам участка. Есть результаты геологии?';source=['foundation'];break;
      case'timing':reply='Срок зависит от проекта и объёма работ, а даты этапов закрепляем в договоре. '+next(s);source=['timing'];break;
      case'winter':reply='Да, строим круглый год. '+next(s);source=['timing'];break;
      case'warranty':reply='На дом из газобетона даём гарантию 5 лет, условия закрепляем в договоре. '+next(s);source=['timing'];break;
      case'quality':reply='После подписания договора создаём общий чат по стройке и присылаем подробные фото- и видеоотчёты, в том числе по скрытым работам. Камеры сейчас не ставим: на объектах часто нестабильный мобильный интернет.';source=['quality'];break;
      case'mortgage':reply='Да, с ипотекой помогаем. '+next(s);source=['mortgage'];break;
      case'approval':reply='Окончательное решение принимает банк. Мы поможем собрать заявку и разобраться с условиями.';source=['mortgage'];break;
      case'escrow':reply='Да, работаем через эскроу-счёт. Расскажем, как пройдёт оплата по вашему договору.';source=['mortgage'];break;
      case'installment':reply='Да, рассрочка есть. Условия зависят от проекта и способа оплаты. '+next(s,'details');source=['installment'];break;
      case'free_project':reply='Если готовый проект подходит участку, отдельно за разработку платить не нужно. Если надо что-то менять, тогда сначала оценим доработку.';source=['project'];break;
      case'office':reply='Тула, ул. Вяземская, 18Л, офис 205, 2-й этаж. Работаем пн–пт 9:00–18:00 и сб 9:00–14:00.';source=['office'];break;
      case'company_phone':reply='Наш телефон: +7 (967) 555-24-44.';source=['office'];break;
      case'expensive':reply=s.facts.budget?'Давайте посчитаем, что можно сделать в эту сумму. '+next(s,'budget'):ask(s,'budget','Давайте сначала посчитаем ваш вариант. На какой бюджет рассчитываете?');break;
      case'thanks':reply='Пожалуйста!';break;
      default:if(added.length){reply=(added.includes('region')?'Понял.':added.includes('area')?`Хорошо, примерно ${s.facts.area.value}.`:added.includes('purpose')?s.facts.purpose.value==='Постоянное проживание'?'Понял, дом для себя.':'Понял, дом как дача.':added.includes('timing')?'Хорошо, по срокам понял.':added.includes('budget')?'Понял, попробуем уложиться.':'Хорошо.')+' '+next(s,added.includes('budget')?'budget':'details');}else if(/^(?:да|нет|есть|нету)[.!\s]*$/.test(t)){reply='Не понял, это про что?';}else{reply='Что по дому хотите узнать?';}
    }
  }
  // Replace only conversational text, never contact/stop/handoff decisions.
  let replySource='rule';
  if(semantic?.reply&&!locked && validReply(semantic.reply,s,reply)){reply=semantic.reply;replySource='ai';}
  reply=reply.trim().replace(/\s+/g,' ');
  if(reply&&firstAssistant&&!['stop','no_calls','no_phone'].includes(intent)&&!added.includes('phone')){
    if(!/^(?:добрый\s+(?:день|вечер)|здравствуйте|привет)/i.test(reply))reply='Добрый день! Меня зовут Иван. '+reply;
    else if(!/(?:меня зовут\s+иван|я\s+иван)/i.test(reply))reply=reply.replace(/^((?:добрый\s+(?:день|вечер)|здравствуйте|привет)[!.]?)/i,'$1 Меня зовут Иван.');
  }
  if(reply&&s.style.humanImperfection&&!s.style.imperfectionUsed){const imperfect=addHumanImperfection(reply,s.id);if(imperfect!==reply){reply=imperfect;s.style.imperfectionUsed=true;}}
  if(reply)s.messages.push({role:'assistant',text:reply,at:new Date().toISOString(),source:replySource});
  s.sourceIds=source;s.cards=cards;
  if(s.handoff)s.handoff.summary=summary(s);
  return {state:s,reply,locked,sourceIds:source};
}
export function validReply(reply,s,fallback){
  if(typeof reply!=='string'||reply.length>300||!reply.trim()||(reply.match(/\?/g)||[]).length>1)return false;
  if(s.messages.some(message=>message.role==='assistant')&&/(?:здравствуйте|добрый\s+(?:день|вечер)|меня зовут\s+иван|я\s+иван)/i.test(reply))return false;
  if(/без спешки|не торопитесь|спокойно сориент|(?:грубая цена|цена грубая|грубый расч[её]т)|ориентир(?:уетесь|оваться)|^\s*(?:для )?ориентир\s*:|рассматриваете|под ваши параметры|подходящее решение|оптимальн|на данном этапе|в вашем случае|более подробно|учтём все (?:ваши )?пожелан|для начала|исходя из|с учётом|что касается|понимаю ваш вопрос/i.test(reply))return false;
  if(/на сайте|с сайта|по данным сайта|в базе|не подтвержден|расходятся|нет проверенн|тестов|симуляц/i.test(reply))return false;
  if(/менеджер|передам|передадим|передан|тестовая карточка/i.test(reply))return false;
  if(/(?:передал|отправил|записал|заброниров|расчет готов|смета готов|гарантируем|точно одобр|я менеджер)/i.test(reply))return false;
  if(/(?:один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:миллион|тысяч)/i.test(reply)&&!fallback.toLowerCase().includes(reply.toLowerCase().match(/(?:один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:миллион|тысяч)/i)?.[0]||'§'))return false;
  if(/(?:миллион|тысяч|рубл|₽|бесплатно всем|одобрим|без отказа)/i.test(reply)&&!/(?:миллион|тысяч|рубл|₽)/i.test(fallback))return false;
  const contactAsk=/оставьте.*(?:номер|телефон)|дайте.*номер|можно.*номер|подскажите.*номер/i;
  if((s.noCalls||s.phoneRefused||s.asked.includes('phone'))&&contactAsk.test(reply)&&!contactAsk.test(fallback))return false;
  const allowed=new Set((fallback+' '+Object.values(s.facts).map(f=>f.value).join(' ')).match(/\d+/g)||[]);
  if((reply.match(/\d+/g)||[]).some(n=>!allowed.has(n)))return false;
  if(/https?:|\[[^\]]+\]/.test(reply))return false;
  return true;
}
export function summary(s){return Object.entries(s.facts).map(([k,f])=>`${fieldLabels[k]}: ${f.value}`).join(' · ')||'Клиент просит консультацию. Параметры пока не уточнены.';}
