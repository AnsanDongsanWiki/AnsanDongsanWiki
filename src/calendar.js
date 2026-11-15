import {escapeHtml as e} from './core.js';
const must=result=>{if(result.error)throw result.error;return result.data;};
const pad=value=>String(value).padStart(2,'0');
export function koreaToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(p=>p.type===type).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function monthBounds(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'1900-01'||month>'2100-12')throw new Error('달력의 연월을 확인해 주세요.');
 const [y,m]=month.split('-').map(Number);
 return {first:`${month}-01`,last:`${month}-${pad(new Date(Date.UTC(y,m,0)).getUTCDate())}`};
}
export function shiftMonth(month,offset){
 monthBounds(month);const [y,m]=month.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+offset,1));
 return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}`;
}
export function calendarCells(month){
 const {first,last}=monthBounds(month);const blanks=new Date(first+'T00:00:00Z').getUTCDay();
 const cells=[...Array(blanks).fill(null),...Array.from({length:Number(last.slice(-2))},(_,i)=>`${month}-${pad(i+1)}`)];
 while(cells.length%7)cells.push(null);return cells;
}
export const eventsOnDate=(events,date)=>events.filter(item=>item.start_date<=date&&item.end_date>=date);
export async function loadCalendarMonth(client,month){
 const {first,last}=monthBounds(month);
 return must(await client.from('wiki_calendar_events').select('id,title,start_date,end_date,description,location,version')
  .lte('start_date',last).gte('end_date',first).order('start_date').order('title').order('id'))||[];
}
const range=item=>item.start_date===item.end_date?item.start_date:`${item.start_date} ~ ${item.end_date}`;
const dateLabel=date=>`${Number(date.slice(5,7))}월 ${Number(date.slice(8,10))}일`;
const formMarkup=date=>`<section class="calendar-editor profile-settings-card"><h2 id="calendar-form-heading">새 일정 등록</h2><p class="muted">저장하면 캘린더에 바로 공개됩니다. 모든 일정은 종일 일정입니다.</p><form class="form" id="calendar-event-form"><label>일정 제목<input name="title" maxlength="100" required></label><div class="calendar-date-fields"><label>시작일<input type="date" name="start_date" min="1900-01-01" max="2100-12-31" value="${date}" required></label><label>종료일<input type="date" name="end_date" min="1900-01-01" max="2100-12-31" value="${date}" required></label></div><label>장소 (선택)<input name="location" maxlength="100"></label><label>설명 (선택)<textarea name="description" maxlength="2000" rows="4"></textarea></label><div class="actions"><button class="primary" type="submit">일정 저장</button><button type="button" id="calendar-new">새 일정 작성</button></div></form></section>`;
export async function mountCalendar({client,container,profile,isCurrent=()=>true,compact=false,manage=false,action,notify}){
 if(!container)return;
 const today=koreaToday();let month=today.slice(0,7),selected=today,events=[],request=0,editing=null;
 container.innerHTML=`<div class="calendar-layout"><section class="calendar-board"><div class="calendar-toolbar"><button type="button" data-month="-1" aria-label="이전 달">‹</button><h3 class="calendar-month" aria-live="polite"></h3><button type="button" data-month="1" aria-label="다음 달">›</button><button type="button" class="calendar-today">오늘</button></div><div class="calendar-grid" role="group" aria-label="날짜 선택"></div><div class="calendar-day-events" aria-live="polite"></div></section>${manage?formMarkup(today):''}</div>`;
 const grid=container.querySelector('.calendar-grid'),list=container.querySelector('.calendar-day-events');
 const form=container.querySelector('form');
 const changeForm=item=>{
  if(!form)return;editing=item||null;
  container.querySelector('#calendar-form-heading').textContent=item?'일정 수정':'새 일정 등록';
  for(const name of ['title','location','description','start_date','end_date'])form.elements[name].value=item?.[name]??(name.endsWith('_date')?selected:'');
 };
 function paint(){
  container.querySelector('.calendar-month').textContent=`${month.slice(0,4)}년 ${Number(month.slice(5))}월`;
  for(const button of container.querySelectorAll('[data-month]'))button.disabled=shiftMonth(month,Number(button.dataset.month))<'1900-01'||shiftMonth(month,Number(button.dataset.month))>'2100-12';
  grid.innerHTML=['일','월','화','수','목','금','토'].map((day,i)=>`<span class="calendar-weekday ${i===0?'sunday':''}">${day}</span>`).join('')+calendarCells(month).map((date,i)=>{
   if(!date)return '<span class="calendar-blank" aria-hidden="true"></span>';
   const count=eventsOnDate(events,date).length;
   return `<button type="button" data-day="${date}" class="calendar-day ${date===selected?'selected':''} ${date===today?'is-today':''} ${i%7===0?'sunday':''}" aria-label="${dateLabel(date)}${count?`, 일정 ${count}건`:''}" aria-pressed="${date===selected}" ${date===today?'aria-current="date"':''}><span>${Number(date.slice(-2))}</span><span class="calendar-dot ${count?'has-events':''}" aria-hidden="true"></span></button>`;
  }).join('');
  const items=eventsOnDate(events,selected);
  list.innerHTML=`<h4>${dateLabel(selected)} 일정 <span>${items.length}건</span></h4>`+(items.length?items.map(item=>`<article class="calendar-event"><strong>${e(item.title)}</strong><small>${range(item)}</small>${item.location?`<p class="calendar-place">${e(item.location)}</p>`:''}${!compact&&item.description?`<p class="calendar-description">${e(item.description)}</p>`:''}${manage?`<div class="actions"><button type="button" data-edit="${item.id}">수정</button><button type="button" data-delete="${item.id}">삭제</button></div>`:''}</article>`).join(''):'<p class="calendar-empty">등록된 일정이 없습니다.</p>');
 }
 async function load(){
  const current=++request;grid.setAttribute('aria-busy','true');grid.inert=true;list.innerHTML='<p class="muted">일정을 불러오는 중…</p>';
  try{
   const rows=client?await loadCalendarMonth(client,month):[];
   if(current!==request||!isCurrent())return;events=rows;paint();
   if(!client)list.innerHTML='<p class="calendar-empty">연결 후 등록한 일정이 표시됩니다.</p>';
  }catch(error){
   if(current!==request||!isCurrent())return;events=[];paint();
   const missing=['42P01','PGRST205'].includes(error?.code);
   list.innerHTML=`<p class="calendar-empty">${missing?'학사 일정 준비 중입니다.': '일정을 불러오지 못했습니다.'}</p><button type="button" class="calendar-retry">다시 불러오기</button>`;
   if(manage)notify(missing?'학사 일정 SQL을 먼저 실행해 주세요.':error.message,true);
  }finally{if(current===request){grid.removeAttribute('aria-busy');grid.inert=false;}}
 }
 container.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.matches('[data-month],.calendar-today')){
   month=button.matches('.calendar-today')?koreaToday().slice(0,7):shiftMonth(month,Number(button.dataset.month));
   selected=month===today.slice(0,7)?today:`${month}-01`;load();
  }else if(button.dataset.day&&button.dataset.day.startsWith(month)){selected=button.dataset.day;paint();}
  else if(button.classList.contains('calendar-retry'))load();
  else if(button.id==='calendar-new')changeForm(null);
  else if(button.dataset.edit){changeForm(events.find(item=>item.id===button.dataset.edit));form.elements.title.focus();}
  else if(button.dataset.delete){
   const item=events.find(item=>item.id===button.dataset.delete);if(!item)return;
   action(async()=>{
    if(!window.confirm(`‘${item.title}’ 일정을 삭제할까요?`))return;
    must(await client.rpc('delete_wiki_calendar_event',{p_id:item.id,p_version:item.version}));
    if(!isCurrent())return;if(editing?.id===item.id)changeForm(null);notify('일정을 삭제했습니다.');await load();
   },form);
  }
 });
 if(form)form.addEventListener('submit',event=>{
  event.preventDefault();action(async()=>{
   const values=new FormData(form),start=String(values.get('start_date')),end=String(values.get('end_date'));
   if(end<start)throw new Error('종료일은 시작일 이후로 선택해 주세요.');
   must(await client.rpc('save_wiki_calendar_event',{p_id:editing?.id||null,p_title:String(values.get('title')).trim(),p_start_date:start,p_end_date:end,p_description:String(values.get('description')),p_location:String(values.get('location')),p_version:editing?.version||null}));
   if(!isCurrent())return;month=start.slice(0,7);selected=start;changeForm(null);notify('학사 일정을 저장했습니다.');await load();
  },form);
 });
 await load();
}
export async function calendarView(options){
 const {content,profile,session,client,name}=options;const manage=name==='calendar-manage';
 content.className='wrap calendar-content';
 if(manage&&(!session||profile?.role!=='admin'||(profile.membership_status&&profile.membership_status!=='approved'))){
  content.innerHTML='<h1>학사 일정 관리</h1><p>관리자만 이용할 수 있습니다.</p><a class="button" href="#calendar">학사 일정 보기</a>';return;
 }
 content.innerHTML=`<a class="back-link" href="${manage?'#profile':'#home'}">← ${manage?'프로필':'홈'}</a><div class="profile-page-heading"><span class="eyebrow">SCHOOL CALENDAR</span><h1>${manage?'학사 일정 관리':'학사 일정'}</h1><p class="muted">날짜를 선택하면 등록된 일정을 확인할 수 있어요.</p>${!manage&&profile?.role==='admin'?'<a class="button" href="#calendar-manage">일정 관리</a>':''}</div><div id="calendar-main" class="${manage?'calendar-manage':''}"></div>`;
 await mountCalendar({...options,container:content.querySelector('#calendar-main'),manage,client});
}
