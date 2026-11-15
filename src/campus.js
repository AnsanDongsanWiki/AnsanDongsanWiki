import {escapeHtml as e,linkifyText} from './core.js';
const must=result=>{if(result.error)throw result.error;return result.data;};
const schoolFloors=[5,4,3,2,1,-1,-2];
export const campusBuildings=[
 {id:'somang',name:'소망동',floors:schoolFloors,position:'예배당 가까이에 있는 왼쪽 학교 건물',points:'276,118 334,170 306,202 248,150',label:[292,160],tone:'sage'},
 {id:'sarang',name:'사랑동',floors:schoolFloors,position:'소망동과 믿음동 사이 중앙 학교 건물',points:'341,175 397,224 368,258 311,207',label:[355,215],tone:'sand'},
 {id:'mideum',name:'믿음동',floors:schoolFloors,position:'중앙 학교 건물의 오른쪽',points:'405,232 441,247 412,358 376,345',label:[411,294],tone:'sage'},
 {id:'eunhye',name:'은혜동',floors:[5,4,3,2,1],position:'운동장 오른쪽 짧은 변을 따라 있는 긴 건물',points:'299,430 373,361 399,389 325,458',label:[350,411],tone:'sand'},
 {id:'dormitory',name:'기숙사',floors:[0],position:'은혜동 뒤쪽 · 층수 확인 중',points:'417,410 444,438 374,499 347,472',label:[401,462],tone:'clay'},
 {id:'chapel',name:'예배당',floors:[3,2,1],position:'소망동 가까이에 있는 예배 공간',points:'99,112 190,29 281,120 190,203',label:[190,121],tone:'sage'},
 {id:'field',name:'운동장',floors:[0],position:'학교 건물 앞쪽의 야외 운동장',points:'235,236 347,359 261,438 149,315',label:[248,339],tone:'field'}
];
export const floorLabel=floor=>floor===0?'공간 안내':floor<0?`지하 ${-floor}층`:`${floor}층`;
export function campusSelection(params){
 const building=campusBuildings.find(b=>b.id===params.get('building'))||campusBuildings[0];
 const raw=params.get('floor');const parsed=raw!==null&&/^-?\d+$/.test(raw)?Number(raw):NaN;
 return {building,floor:building.floors.includes(parsed)?parsed:building.floors.includes(1)?1:0};
}
export const campusUrl=(building,floor,manage=false)=>`#${manage?'campus-manage':'campus'}?building=${encodeURIComponent(building)}${floor===undefined?'':`&floor=${floor}`}`;
export function campusMapMarkup({selected='',manage=false,compact=false}={}){
 const ordered=[...campusBuildings].sort((a,b)=>(a.id==='field'?-1:b.id==='field'?1:0));
 return `<div class="campus-map ${compact?'campus-map-compact':''}"><svg viewBox="0 0 580 530" role="group" aria-label="안산동산고 학교 약도: 건물을 선택하면 층별 안내로 이동합니다."><path class="campus-ground" d="M55 190 171 8Q190 0 215 17L459 218Q491 267 475 378L459 487Q413 534 351 519L120 367Q31 294 55 190Z"/><path class="campus-walk" d="M66 230Q140 192 221 209L331 287Q371 317 455 285M117 271 134 345 280 482 338 490"/><path class="campus-courtyard" d="m235 210 126 111-36 25-126-112Z"/>${ordered.map(b=>`<a href="${campusUrl(b.id,undefined,manage)}" aria-label="${b.name} ${b.floors[0]===0?'안내':'층별 안내'}" class="campus-building campus-tone-${b.tone} ${selected===b.id?'is-selected':''}"><polygon class="campus-building-shadow" points="${b.points}" transform="translate(0 6)"/><polygon class="campus-building-roof" points="${b.points}"/>${b.id==='field'?'<path class="campus-field-lines" d="m235 254 94 104-66 61-95-104Z M201 284l95 104"/><ellipse class="campus-field-lines" cx="248" cy="337" rx="23" ry="31" transform="rotate(-43 248 337)"/>':''}${b.id==='chapel'?'<path class="campus-cross" d="M190 65v23m-9-15h18"/>':''}<text x="${b.label[0]}" y="${b.label[1]}" text-anchor="middle" dominant-baseline="middle">${b.name}</text></a>`).join('')}<path class="campus-leaf" d="M77 171q-14-23-30-6 7 21 30 6Zm0 0q22-22 31-2-11 17-31 2Zm0 0v24"/><path class="campus-leaf" d="M484 347q-14-23-30-6 7 21 30 6Zm0 0q22-22 31-2-11 17-31 2Zm0 0v24"/></svg></div>`;
}
export function campusHeroMarkup(){
 return `<figure class="hero-campus"><div class="campus-hero-heading"><span class="eyebrow">OUR SCHOOL, AT A GLANCE</span><a href="#campus">학교 맵 ↗</a></div>${campusMapMarkup({compact:true})}<figcaption>건물을 눌러 층별 안내를 확인하세요.<small>위치 안내용 약도 · 실제 크기와 형태는 다를 수 있습니다.</small></figcaption></figure>`;
}
export async function campusView({name,params,content,client,session,profile,isCurrent,action,notify}){
 const manage=name==='campus-manage';const {building,floor}=campusSelection(params);
 const admin=profile?.role==='admin'&&(!profile.membership_status||profile.membership_status==='approved');
 content.className='wrap campus-content';
 if(manage&&(!session||!admin)){
  content.innerHTML='<h1>학교 맵 시설 관리</h1><p>관리자만 이용할 수 있습니다.</p><a class="button" href="#campus">학교 맵 보기</a>';return;
 }
 content.innerHTML=`<a class="back-link" href="${manage?'#profile':'#home'}">← ${manage?'프로필':'홈'}</a><div class="profile-page-heading"><span class="eyebrow">CAMPUS GUIDE</span><h1>${manage?'학교 맵 시설 관리':'학교 맵'}</h1><p class="muted">건물과 층을 선택해 학교의 공간을 알아보세요.</p>${admin?`<a class="button" href="${campusUrl(building.id,floor,!manage)}">${manage?'이용자 화면 보기':'시설 정보 관리'}</a>`:''}</div><div class="campus-layout"><section class="campus-overview" aria-label="건물 선택">${campusMapMarkup({selected:building.id,manage})}<nav class="campus-building-list" aria-label="학교 건물">${campusBuildings.map(b=>`<a href="${campusUrl(b.id,undefined,manage)}" class="${b.id===building.id?'selected':''}" ${b.id===building.id?'aria-current="location"':''}>${b.name}</a>`).join('')}</nav><p class="campus-map-note">건물 위치를 간단하게 정리한 안내도입니다.<br>실제 크기·형태·이동 경로와 다를 수 있습니다.</p></section><section class="campus-detail"><span class="eyebrow">FIND YOUR PLACE</span><h2>${building.name}</h2><p class="campus-position">${building.position}</p>${building.id==='dormitory'?'<p class="campus-unknown">기숙사 층수는 확인 후 추가할 예정입니다.</p>':''}<nav class="campus-floor-list" aria-label="${building.name} 층 선택">${building.floors.map(f=>`<a href="${campusUrl(building.id,f,manage)}" class="${f===floor?'selected':''}" ${f===floor?'aria-current="page"':''}>${floorLabel(f)}</a>`).join('')}</nav><h3>${floorLabel(floor)}</h3><div id="campus-floor-info" aria-live="polite"><p class="muted">시설 정보를 불러오는 중…</p></div></section></div>`;
 const info=content.querySelector('#campus-floor-info');let row=null;
 try{
  if(client)row=must(await client.from('wiki_campus_floors').select('building_id,floor,content,version').eq('building_id',building.id).eq('floor',floor).maybeSingle());
 }catch(error){
  if(!isCurrent())return;
  info.innerHTML='<p class="muted">시설 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>';
  if(manage)notify(['42P01','PGRST205'].includes(error?.code)?'학교 맵 SQL을 먼저 적용해 주세요.':error.message,true);
  return;
 }
 if(!isCurrent())return;
 if(!manage){info.innerHTML=row?.content?`<div class="campus-floor-description">${linkifyText(row.content)}</div>`:'<div class="campus-empty"><p>시설 정보 준비 중</p><small>확인된 시설부터 차근차근 채워갈게요.</small></div>';return;}
 if(!client||!row){info.innerHTML='<p class="muted">학교 맵 SQL 적용과 서버 연결 후 시설 정보를 입력할 수 있습니다.</p>';return;}
 info.innerHTML=`<form id="campus-floor-form" class="form"><label>시설 안내<textarea name="content" rows="9" maxlength="3000" placeholder="확인된 시설명과 안내를 입력해 주세요.">${e(row.content)}</textarea></label><p class="muted">3000자 이내 · 저장하면 바로 공개됩니다. 비워서 저장하면 ‘시설 정보 준비 중’으로 표시돼요.</p><button class="primary">시설 안내 저장</button></form>`;
 const form=info.querySelector('form');form.addEventListener('submit',event=>{
  event.preventDefault();action(async()=>{
   const text=String(new FormData(form).get('content')||'');
   const version=must(await client.rpc('save_wiki_campus_floor',{p_building:building.id,p_floor:floor,p_content:text,p_version:row.version}));
   if(!isCurrent())return;row={...row,content:text.trim(),version};notify('시설 안내를 저장했습니다.');
  },form);
 });
}
