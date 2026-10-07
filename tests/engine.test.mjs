import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,runChecks} from '../checks.mjs';
import {turn,newConversation,validReply} from '../engine.mjs';

for(const c of cases)test(c.name,()=>{let s=newConversation();for(const text of c.steps)s=turn(s,text,c.semantic).state;assert.ok(c.check(s),JSON.stringify(s));});

test('Все сценарии проходят и ответы короткие',()=>{const r=runChecks();assert.equal(r.passed,r.total);});
test('История предыдущего состояния не изменяется',()=>{const old=newConversation();turn(old,'Хочу 80 м²');assert.equal(old.messages.length,0);assert.deepEqual(old.facts,{});});
test('Беседа помнит отказ от звонков после нового номера',()=>{let s=turn(newConversation(),'Не звоните').state;s=turn(s,'Мой номер 89991234567').state;assert.equal(s.channel,'Чат Авито');assert.equal(s.noCalls,true);});
test('После отказа от телефона бот продолжает отвечать',()=>{let s=turn(newConversation(),'Телефон не дам, пишите здесь').state;s=turn(s,'Сколько стоит А-100ГБ?').state;assert.equal(s.status,'active');assert.equal(s.messages.at(-1).role,'assistant');assert.doesNotMatch(s.messages.at(-1).text,/номер телефона|на какой номер/i);});
test('Новые данные дополняют переданную карточку',()=>{let s=turn(newConversation(),'Мой номер 89991234567').state;const id=s.handoff.id;s=turn(s,'Хочу А-90ГБ в Алексине').state;assert.equal(s.handoff.id,id);assert.match(s.handoff.summary,/А-90ГБ/);assert.equal(s.messages.at(-1).role,'user');});
test('Слова клиента не исполняются как код',()=>{const s=turn(newConversation(),'<script>alert(1)</script>').state;assert.equal(s.messages[0].text,'<script>alert(1)</script>');assert.equal(s.status,'active');});
test('Проверка AI-ответа отклоняет несколько вопросов',()=>assert.equal(validReply('Какой дом? Где участок?',newConversation(),''),false));
test('Проверка AI-ответа отклоняет ссылки',()=>assert.equal(validReply('Оплатите https://evil.example',newConversation(),''),false));
test('Проверка AI-ответа отклоняет канцелярит',()=>{for(const reply of ['В вашем случае лучше начать с проекта.','Подберём оптимальное решение.','Что касается площади, нужно уточнить.','Можно без спешки.'])assert.equal(validReply(reply,newConversation(),''),false,reply);});
test('Проверка AI-ответа отклоняет давление после паузы',()=>assert.equal(validReply('Ну что вы надумали?',newConversation(),''),false));
test('Два независимых диалога не смешиваются',()=>{const a=turn(newConversation('a'),'Меня зовут Анна').state;const b=turn(newConversation('b'),'Меня зовут Иван').state;assert.equal(a.facts.name.value,'Анна');assert.equal(b.facts.name.value,'Иван');});
test('Защитный ответ на отказ остаётся локальным',()=>{const s=turn(newConversation(),'Не звоните',{intent:'unknown',facts:[],reply:'Хорошо.'}).state;assert.equal(s.messages.at(-1).source,'rule');});
test('Человеческая неточность появляется один раз только в выбранном диалоге',()=>{let s=newConversation('even',{humanImperfection:true});s=turn(s,'Здравствуйте',{intent:'greeting',facts:[],reply:'Здравствуйте! Я Иван. Какой дом хотите?'}).state;assert.equal(s.messages.at(-1).text,'здравствуйте! Я Иван. Как могу к вам обращаться?');s=turn(s,'Для себя',{intent:'unknown',facts:[],reply:'Понял. А где хотите строить?'}).state;assert.equal(s.messages.at(-1).text,'Понял. А где хотите строить?');assert.equal(s.style.imperfectionUsed,true);});
test('Обычный диалог остаётся без искусственных ошибок',()=>{const s=turn(newConversation('clean'),'Здравствуйте',{intent:'greeting',facts:[],reply:'Здравствуйте! Я Иван. Какой дом хотите?'}).state;assert.equal(s.messages.at(-1).text,'Здравствуйте! Я Иван. Как могу к вам обращаться?');});
test('В середине диалога Иван повторно не здоровается',()=>{let s=turn(newConversation(),'Здравствуйте').state;s=turn(s,'Вы тут?',{intent:'unknown',facts:[],reply:'Да, я здесь. Что хотели уточнить?'}).state;assert.doesNotMatch(s.messages.at(-1).text,/Добрый день|Здравствуйте/);});
test('После замечания о тоне Иван извиняется и продолжает прежнюю тему',()=>{let s=turn(newConversation(),'Можно построить в ипотеку?').state;s=turn(s,'неприличный вообще',{intent:'tone_feedback',facts:[],reply:'Извините, неудачно написал. Да, с ипотекой работаем. Дом хотите для себя?'}).state;assert.match(s.messages.at(-1).text,/^Извините/);assert.match(s.messages.at(-1).text,/ипотек/);assert.doesNotMatch(s.messages.at(-1).text,/здравствуйте|я Иван/i);});
test('Фраза «цена грубая» никогда не показывается клиенту',()=>assert.equal(validReply('Без проекта цена грубая.',newConversation(),''),false));
test('Свободный ответ с просьбой прислать объявление блокируется',()=>assert.equal(validReply('Пришлите ссылку на объявление.',newConversation(),'Покажу проекты. Какая площадь нужна?'),false));
test('Свободный ответ не может вернуть цену за квадрат',()=>assert.equal(validReply('Цена от 60 тысяч за квадрат.',newConversation(),'Есть пять проектов. Какая площадь нужна?'),false));
