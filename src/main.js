import { documentSortOptions, listingState, listingUrl, loadDocumentListing, renderListingPagination } from './listing.js';
import { profileView } from './profile.js';
import { qnaView } from './qna.js';
import { createClient } from '@supabase/supabase-js';
import { categories, escapeHtml as e, canEdit, safeUrl, validatePassword, linkifyText } from './core.js';
import { icon, categoryDetails, previewPages } from './design.js';
import '@fontsource-variable/noto-sans-kr';
import './style.css';
import { mountAttachmentEditor, renderAttachments, releaseAttachmentUrls } from './attachments.js';
import { recordPageView, renderPopularDocuments } from './popular.js';
import { verificationView, needsVerification, releaseVerificationUrls } from './verification.js';

const app = document.querySelector('#app');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const suggestion = safeUrl(import.meta.env.VITE_SUGGESTION_URL);
const recoveryArrival = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
const client = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_')
  ? createClient(url, key) : null;
let session = null, profile = null, generation = 0, busy = false, recovery = recoveryArrival;
const schoolHomepage = 'https://ansandongsan-h.goeas.kr/ansandongsan-h/main.do';
const roles = { reader: '일반 회원', editor: '편집자', admin: '관리자' };
const date = value => new Date(value).toLocaleString('ko-KR');
const $ = selector => document.querySelector(selector);
const returnUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href;
const must = result => { if (result.error) throw result.error; return result.data; };
function notify(message, error = false) {
  const el = $('#status');
  el.hidden = !message; el.className = `status${error ? ' error' : ''}`; el.textContent = message;
}
function friendly(error) {
  const text = error?.message || '요청을 처리하지 못했습니다.';
  if (/Invalid login credentials/i.test(text)) return '이메일 또는 비밀번호를 확인해 주세요.';
  if (/Email not confirmed/i.test(text)) return '이메일 인증을 먼저 완료해 주세요.';
  if (/rate limit|too many requests/i.test(text)) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (/Failed to fetch|network/i.test(text)) return '연결하지 못했습니다. 인터넷 연결과 Supabase 설정을 확인해 주세요.';
  if (/unique|duplicate/i.test(text)) return '같은 제목의 문서가 이미 있습니다.';
  return text;
}
function route() {
  const hash = location.hash.slice(1);
  if (!hash || hash.includes('access_token=') || hash.includes('error=')) return { name: 'home', params: new URLSearchParams() };
  const [name, query = ''] = hash.split('?');
  return { name, params: new URLSearchParams(query) };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function shell() {
  const current = route().name;
  const ranked = ['home', 'page', 'edit', 'submit'].includes(current);
  app.innerHTML = `<a class="skip" href="#main">본문으로 이동</a>
  <header class="topbar profile-topbar"><div class="wrap header"><a class="brand" href="#home" aria-label="동산위키 홈"><img class="brand-mark" src="/school-logo.png" alt="" width="44" height="44"><span>동산위키<small>DONGSAN WIKI</small></span></a>
  <nav class="main-nav" aria-label="주 메뉴"><a href="#home" class="${current === 'home' ? 'active' : ''}">문서 둘러보기</a><a href="#qna" class="${current.startsWith('qna') ? 'active' : ''}">Q&amp;A</a><a href="#guide" class="${current === 'guide' ? 'active' : ''}">처음 오셨나요?</a><a href="#about" class="${current === 'about' ? 'active' : ''}">위키 소개</a><a href="#home?list=1" class="archive-nav-link ${current==='home'&&route().params.get('list')==='1'?'active':''}">학교의 모든 이야기</a><a href="#profile" class="${current.startsWith('profile') ? 'active' : ''}">프로필</a></nav>
  ${!session ? '<nav class="actions account-actions" aria-label="계정 메뉴"><a class="login-link" href="#login">로그인 <span aria-hidden="true">↗</span></a><a class="button primary signup-link" href="#signup">함께하기</a></nav>' : ''}</div></header>
  <a class="contact-float" href="#contact" aria-label="관리자에게 문의하기"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11a8 8 0 0 1-8 8H7l-5 3 1.5-6A8 8 0 0 1 3 11a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h6"/></svg><span>문의하기</span></a>
  <div class="wrap"><div id="status" class="status" role="status" aria-live="polite" hidden></div></div>
  ${!client ? '<div class="preview-strip"><span></span> 디자인 미리보기 <i>·</i> 예시 문서로 구성되어 있습니다. <a href="#about">프로젝트 알아보기 ↗</a></div>' : ''}
  <main id="main" tabindex="-1"><div class="${ranked ? 'ranked-layout' : ''}"><div class="wrap" id="content"><p class="loading">기록을 펼치는 중…</p></div>${ranked ? '<aside class="popular-sidebar" aria-label="많이 본 문서"><div class="popular-panel"><span class="eyebrow">POPULAR THIS WEEK</span><h2>많이 본 문서 <span>TOP 5</span></h2><p class="popular-period">최근 7일 · 오늘 포함</p><div id="popular-documents"><p class="muted">순위를 불러오는 중…</p></div><p class="popular-footnote">로그인 계정당 문서별 하루 1회 집계</p></div></aside>' : ''}</div></main>
  <footer><div class="wrap footer-top"><a class="brand" href="#home"><img class="brand-mark" src="/school-logo.png" alt="" width="44" height="44"><span>동산위키<small>DONGSAN WIKI</small></span></a><p>오늘의 경험이 내일의 길잡이가 되도록.<br>학생이 기록하고, 함께 이어가는 우리 학교의 위키.</p><a class="school-homepage" href="${schoolHomepage}" target="_blank" rel="noopener noreferrer" aria-label="동산고 공식 홈페이지 (새 탭)">동산고 공식 홈페이지 <span aria-hidden="true">↗</span></a><div><a href="#about">프로젝트 소개</a><a href="#guide">이용 안내</a><a href="#contact">관리자에게 문의</a></div></div><div class="wrap footer-bottom"><span>© DONGSAN WIKI · 학생 주도 비공식 프로젝트</span><span>사실을 기록하고, 출처를 남기고, 서로를 존중합니다.</span></div></footer>`;
  $('.skip').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView(); });

}
async function action(fn, form) {
  if (busy) return;
  busy = true;
  const controls = form ? [...form.querySelectorAll('button')] : [];
  controls.forEach(button => { button.disabled = true; });
  try { await fn(); } catch (error) { notify(friendly(error), true); }
  finally { busy = false; controls.forEach(button => { button.disabled = false; }); }
}
async function refreshProfile() {
  profile = session ? must(await client.from('profiles').select('id,nickname,role,membership_status').eq('id', session.user.id).single()) : null;
}
function sidebar(active) {
  return `<aside class="sidebar" aria-label="문서 분류"><span class="eyebrow">BROWSE THE ARCHIVE</span><h2>학교의 모든 이야기</h2><button data-category="" class="${!active ? 'active' : ''}">${icon('book', 18)} 전체 문서 <span>↗</span></button>
  ${categoryDetails.map(([category, symbol]) => `<button data-category="${category}" class="${category === active ? 'active' : ''}">${icon(symbol, 18)} ${category}<span>↗</span></button>`).join('')}
  <div class="side-note">${icon('pen', 21)}<p>아직 없는 이야기인가요?<br>여러분의 제안으로<br>위키가 조금씩 자랍니다.</p><a href="#about">기록에 참여하는 방법 →</a></div></aside>`;
}
async function render() {
  releaseAttachmentUrls();
  releaseVerificationUrls();
  const publicRoutes=['verify','home','page','qna','qna-question','guide','about','login','forgot','reset','profile-password','profile-withdraw'];
  if(session&&needsVerification(profile)&&!publicRoutes.includes(route().name)){go('#verify');return;}
  const token = ++generation;
  document.title = '동산위키 · 안산동산고 디지털 위키';
  shell();
  renderPopularDocuments(client, $('#popular-documents'), ['edit', 'submit'].includes(route().name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  const content = $('#content');
  const { name, params } = route();
  try {
    if (name === 'verify' || name === 'verification-review') await verificationView({name,params,content,client,session,profile,isCurrent:()=>token===generation,go,action,notify,refreshProfile,logout:async()=>{must(await client.auth.signOut());session=null;profile=null;go('#login');}});
    else if (name === 'login' || name === 'signup' || name === 'forgot' || name === 'reset') {authView(name, content);if(name==='login'&&params.get('withdrawn')==='1')notify('회원탈퇴가 완료되었습니다.');}
    else if (['profile','profile-settings','profile-password','profile-created','profile-edited','profile-withdraw'].includes(name)) await profileView({name,params,content,client,session,profile,isCurrent:()=>token===generation,go,action,notify,refreshProfile,onWithdrawn:()=>{session=null;profile=null;recovery=false;go('#login?withdrawn=1');},logout:async()=>{must(await client.auth.signOut());session=null;profile=null;recovery=false;go('#home');}});
    else if (name === 'guide' || name === 'about') infoView(name, content);
    else if (['qna','qna-ask','qna-mine','qna-question','qna-review'].includes(name)) await qnaView({name,params,content,client,session,profile,isCurrent:()=>token===generation,go,action,notify});
    else if (name === 'contact') await contactView(content, token, params);
    else if (name === 'inquiries') await inquiriesView(content, token, params);
    else if (name === 'inquiry') await inquiryView(content, token, params);
    else if (name === 'submissions') await submissionsView(content, token);
    else if (name === 'submit') await submissionEditView(content, params.get('id'), token, params.get('target'));
    else if (name === 'trash') await trashView(content, token);
    else if (name === 'review') await reviewView(content, params.get('id'), token, params);
    else if (name === 'admin') await adminView(content, token, params);
    else if (name === 'edit') await editView(content, params.get('id'), token);
    else if (name === 'page') await pageView(content, params.get('id'), token);
    else await homeView(content, params, token);
  } catch (error) {
    if (token !== generation) return;
    content.innerHTML = '<div class="empty"><h2>불러오지 못했습니다</h2><p>잠시 후 다시 시도해 주세요.</p><button id="retry">다시 시도</button></div>';
    $('#retry').addEventListener('click', render);
    notify(friendly(error), true);
  }
}
async function homeView(content, params, token) {
  const state = listingState(params);
  const {category, query, sort, page} = state;
  const {pages, count} = await loadDocumentListing(client, state, previewPages);
  if (token !== generation) return;
  if (page > 0 && !pages.length) { go(listingUrl(state, {page:0})); return; }
  const filtering = !!category || !!query;
  content.className = 'wrap home-content';
  content.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="tiny-line"></span> OUR DAYS, OUR ARCHIVE</span><h1>동산의 하루가,<br>우리의 <span class="hero-word">기록</span>이 되다.</h1><p>처음이라 궁금한 것부터, 오래 기억하고 싶은 순간까지.<br>동산인이 함께 쓰는 가장 가까운 학교생활 안내서.</p><a href="#guide" class="text-link">동산위키가 처음이라면 ${icon('arrow', 19)}</a><div class="hero-signature"><span>기록은 남고, 이야기는 이어지니까.</span><span class="signature-line"></span></div></div>
  <figure class="hero-scripture"><blockquote>&quot;너희는 세상에 빛이라<br>산 위에 있는 동네가<br>숨겨지지 못할 것이요&quot;</blockquote><figcaption>마태복음 5:14</figcaption></figure>
  <div class="hero-bottom"><span class="hero-bottom-label">우리 학교가 궁금할 때</span><form class="search" id="search">${icon('search', 23)}<input name="q" aria-label="문서 제목 검색" maxlength="120" placeholder="궁금한 동산의 이야기를 검색해 보세요" value="${e(query)}"><kbd aria-hidden="true">Enter ↵</kbd><button class="primary" aria-label="검색">${icon('arrow', 23)}</button></form><div class="quick-search"><span>빠르게 찾기</span><button data-query="기숙사">기숙사</button><button data-query="동아리">동아리</button><button data-query="신입생">신입생 안내</button></div></div></section>
  <section class="category-section" aria-label="주제별 바로가기"><div class="category-heading"><span class="eyebrow">FIND YOUR CHAPTER</span><h2>어떤 이야기를 찾고 있나요?</h2></div><div class="category-grid">${categoryDetails.map(([cat, symbol, description, number]) => `<button class="category-tile ${cat === category ? 'selected' : ''}" data-category="${cat}"><span class="tile-top">${icon(symbol, 27)}<span>${number}</span></span><strong>${cat}</strong><span class="tile-desc">${description}</span><span class="tile-arrow">↗</span></button>`).join('')}</div></section>
  <div class="archive-layout" id="archive">${sidebar(category)}<section class="document-section"><div class="section-head"><div><span class="eyebrow">THE GROWING COLLECTION</span><h2>${e(query ? `‘${query}’ 검색 결과` : category || '차곡차곡 쌓이는 기록')} <span class="count">${count.toString().padStart(2, '0')}</span></h2></div>${session ? `<a class="button primary" href="${canEdit(profile) ? '#edit' : '#submit'}">${canEdit(profile) ? '문서 작성 +' : '문서 작성·제출 +'}</a>` : filtering ? `<a class="text-link" href="${e(listingUrl(state, {category:'', query:'', page:0}))}">전체 문서 보기 ↗</a>` : '<span class="muted">'+ (client ? documentSortOptions[sort] : '미리보기용 예시') +'</span>'}</div>
  <div class="document-toolbar"><p class="muted">${sort === 'views' ? '조회순 · 최근 7일(오늘 포함) 조회수 기준' : '최신순·오래된순은 최근 수정일 기준'}</p><label for="document-sort">정렬<select id="document-sort">${Object.entries(documentSortOptions).map(([value,label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
  ${pages.length ? `<div class="document-list">${pages.map((p, index) => `<a class="document-row" href="#page?id=${encodeURIComponent(p.id)}"><span class="doc-index">${String(page * 24 + index + 1).padStart(2, '0')}</span><div class="doc-info"><span class="doc-category">${e(p.category)}</span><h3>${e(p.title)}</h3>${p.description ? `<p>${e(p.description)}</p>` : ''}</div><span class="doc-date">${client ? sort === 'views' ? `${Number(p.views).toLocaleString('ko-KR')}회<br><small>최근 7일</small>` : date(p.updated_at) : '예시 문서'}</span><span class="doc-arrow">↗</span></a>`).join('')}</div>` : `<div class="empty">${icon('book', 34)}<h3>${filtering ? '아직 이 이야기를 찾지 못했어요.' : '첫 번째 기록을 기다리고 있어요.'}</h3><p>${filtering ? '다른 검색어나 분류로 찾아보세요.' : '운영진이 확인한 이야기부터 차근차근 채워갈 예정입니다.'}</p><a class="text-link" href="${e(listingUrl(state, {category:'', query:'', page:0}))}">전체 문서로 돌아가기 →</a></div>`}
  ${renderListingPagination(state, count)}</section></div>
  <section class="guide-banner"><div class="guide-book" aria-hidden="true"><span>DONGSAN<br>FIELD<br>GUIDE</span><b>${icon('leaf', 35)}</b><small>FOR YOUR FIRST CHAPTER</small></div><div class="guide-copy"><span class="eyebrow">A LITTLE HELP FOR A NEW BEGINNING</span><h2>처음의 동산이,<br>조금 더 익숙해지도록.</h2><p>새로운 시작에 필요한 이야기들을 차근차근 모았습니다.<br>어디서 시작할지 모르겠다면, 이곳부터 펼쳐 보세요.</p><a class="button light" href="#guide">신입생을 위한 첫 안내서 ${icon('arrow', 18)}</a></div><span class="banner-number" aria-hidden="true">01</span></section>
  <section class="participation"><div>${icon('pen', 25)}<h2>당신이 아는 동산의 이야기를 더해주세요.</h2><p>작은 수정 하나도 다음 동산인에게는 큰 도움이 됩니다.</p></div>${suggestion ? `<a class="text-link" href="${e(suggestion)}" target="_blank" rel="noopener noreferrer">수정 제안하기 ${icon('arrow', 20)}</a>` : '<a class="text-link" href="#about">함께 기록하는 방법 알아보기 →</a>'}</section>`;
  const navigate = (cat, q, p = 0) => go(listingUrl(state, {category:cat, query:String(q || ''), page:p}));
  $('#document-sort').addEventListener('change', event => go(listingUrl(state, {sort:event.currentTarget.value, page:0})));
  $('#search').addEventListener('submit', event => { event.preventDefault(); navigate(category, new FormData(event.currentTarget).get('q')); });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.category, query)));
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => navigate('', button.dataset.query)));
  if (filtering || page || sort !== 'latest' || params.get('list') === '1') $('#archive').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function infoView(name, content) {
  const guide = name === 'guide';
  content.className = 'wrap reading-content';
  content.innerHTML = `<a class="back-link" href="#home">← 위키로 돌아가기</a><article class="article info-article"><span class="eyebrow">${guide ? 'YOUR FIRST CHAPTER' : 'ABOUT THIS ARCHIVE'}</span><h1>${guide ? '처음의 동산을 위한<br>작은 길잡이.' : '우리의 오늘을,<br>다음 동산인에게.'}</h1><p class="article-intro">${guide ? '모든 것을 한 번에 알 필요는 없어요.<br>궁금한 이야기부터 하나씩 펼쳐 보세요.' : '학생이 기록하고, 공유하며, 이어가는 학교 정보 플랫폼.<br>안산동산고 디지털 위키를 소개합니다.'}</p>
  ${guide ? `<div class="info-steps">${categoryDetails.map(([cat, symbol, description, number]) => `<a href="#home?category=${encodeURIComponent(cat)}"><span>${number}</span>${icon(symbol, 26)}<div><h2>${cat}</h2><p>${description}</p></div><b>↗</b></a>`).join('')}</div><div class="notice">실제 학교생활에 관한 최종 안내는 학교의 공식 공지와 규정을 확인해 주세요. 위키는 학생들이 만드는 보조 안내서입니다.</div>` : `<div class="about-body"><h2>함께 만드는 학교의 기록실</h2><p>학교생활 정보, 동아리 소개, 학생 자치 활동, 신입생 가이드와 자주 묻는 질문을 모읍니다. 공식 홈페이지를 대체하기보다 학생들이 궁금해하는 정보를 찾기 쉽게 정리합니다.</p><h2>누구나 제안하고, 운영진이 확인합니다.</h2><p>일반 회원도 새 문서와 공개 문서의 수정안을 작성해 제출할 수 있습니다. 승인 전에는 작성자 본인과 편집자·관리자만 볼 수 있으며, 심사를 거쳐 승인되면 공개됩니다. 편집자와 관리자는 문서를 직접 게시·수정할 수 있습니다.</p><h2>우리의 기록이 지키는 세 가지</h2><div class="principles"><div><strong>01 사실</strong><p>확인 가능한 정보를 씁니다.</p></div><div><strong>02 출처</strong><p>정보가 온 곳을 남깁니다.</p></div><div><strong>03 존중</strong><p>타인의 개인정보를 보호합니다.</p></div></div>${suggestion ? `<a class="button primary" href="${e(suggestion)}" target="_blank" rel="noopener noreferrer">수정 제안하기 ↗</a>` : '<p class="muted">제안 접수 경로는 운영진이 연결하면 이곳에 표시됩니다.</p>'}<a class="text-link" href="#signup">동산위키에 함께하기 →</a></div>`}</article>`;
}
function authView(mode, content) {
  const reset = mode === 'reset', signup = mode === 'signup', forgot = mode === 'forgot';
  if (reset && (!session || !recovery)) {
    content.innerHTML = '<div class="notice">비밀번호 재설정 이메일의 링크로 접속해 주세요. 링크가 만료됐다면 다시 요청해 주세요.</div><a href="#forgot">재설정 이메일 받기</a>'; return;
  }
  const title = reset ? '새 비밀번호 설정' : signup ? '동산위키 회원가입' : forgot ? '비밀번호 찾기' : '다시 만나 반가워요.';
  content.className = 'wrap auth-content';
  content.innerHTML = `<aside class="auth-story"><span class="eyebrow">A STORY WE WRITE TOGETHER</span><h1>한 사람의 경험이,<br>우리 모두의<br>길잡이가 되도록.</h1><img src="/archive-illustration.svg" alt="책 위에 펼쳐진 작은 학교 일러스트" width="620" height="530"><p>오늘의 기록이 다음 동산인에게 닿습니다.</p></aside><section class="auth-card"><span class="eyebrow">DONGSAN WIKI ACCOUNT</span><h2>${title}</h2>
  ${!reset && !forgot ? `<nav class="tabs"><a class="button ${!signup ? 'active' : ''}" href="#login">로그인</a><a class="button ${signup ? 'active' : ''}" href="#signup">회원가입</a></nav>` : ''}
  <form id="auth-form" class="form">
  ${signup ? '<label>닉네임<input name="nickname" minlength="2" maxlength="30" autocomplete="nickname" required placeholder="문서 이력에 표시할 이름"></label>' : ''}
  ${!reset ? '<label>이메일<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label>' : ''}
  ${!forgot ? `<label>${reset ? '새 ' : ''}비밀번호<input name="password" type="password" ${signup || reset ? 'minlength="12"' : ''} maxlength="128" autocomplete="${signup || reset ? 'new-password' : 'current-password'}" required></label>` : ''}
  ${signup || reset ? '<label>비밀번호 확인<input name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><p class="muted">12자 이상으로 설정해 주세요. 비밀번호는 화면이나 문서 DB에 저장하지 않습니다.</p>' : ''}
  ${signup ? '<label><span><input type="checkbox" name="ack" required> 닉네임이 수정 이력에 공개되며, 개인정보를 문서에 게시할 수 없음을 확인했습니다.</span></label>' : ''}
  <button class="primary">${reset ? '비밀번호 변경' : signup ? '가입하기' : forgot ? '재설정 이메일 받기' : '로그인'}</button></form>
  ${!client ? '<p class="preview-auth">디자인 미리보기입니다. 실제 계정 등록·인증은 연결 후 가능합니다.</p>' : ''}
  <p class="muted">${signup ? '이메일 인증 후 로그인하면 본인인증 화면으로 이동합니다. 리로스쿨 마이페이지 캡처 또는 사진을 제출하고 관리자 가입 승인을 받아 주세요.' : ''}</p>
  ${!reset ? '<div class="actions"><a href="#forgot">비밀번호 찾기</a><a href="#home">위키 둘러보기</a></div>' : ''}</section>`;
  if (!client) $('#auth-form button.primary').disabled = true;
  $('#auth-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!client) { notify('미리보기입니다. Supabase 연결 후 이용할 수 있습니다.'); return; }
    const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      const email = String(fields.get('email') || '').trim();
      const password = String(fields.get('password') || '');
      if (signup || reset) {
        validatePassword(password);
        if (password !== fields.get('confirm')) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      }
      if (signup) {
        const nickname = String(fields.get('nickname')).trim();
        if (nickname.length < 2 || nickname.length > 30) throw new Error('닉네임은 2~30자로 입력해 주세요.');
        const data=must(await client.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: returnUrl() } }));
        if(data.session){session=data.session;await refreshProfile();go('#verify');}
        else{form.reset();notify('이메일 인증을 완료한 뒤 로그인해 주세요. 다음으로 리로스쿨 마이페이지 자료를 제출하면 관리자가 가입을 승인합니다. 메일이 없다면 스팸함이나 기존 가입 여부를 확인해 주세요.');}
      } else if (forgot) {
        must(await client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() }));
        notify('해당 이메일로 가입되어 있다면 재설정 메일이 발송됩니다. 스팸함도 확인해 주세요.');
      } else if (reset) {
        must(await client.auth.updateUser({ password })); recovery = false;
        must(await client.auth.signOut()); session = null; profile = null; go('#login');
      } else {
        const data = must(await client.auth.signInWithPassword({ email, password }));
        session = data.session; await refreshProfile(); go(needsVerification(profile)?'#verify':'#home');
      }
    }, form);
  });
}
async function pageView(content, id, token) {
  if (!id) throw new Error('문서 주소를 확인해 주세요.');
  const page = client ? must(await client.from('pages').select('*').eq('id', id).single()) : previewPages.find(p => p.id === id);
  if (!page) throw new Error('문서를 찾을 수 없습니다.');
  const revisions = client ? must(await client.from('revisions').select('id,version,editor_name,created_at').eq('page_id', id).order('version', { ascending: false }).limit(50)) : [];
  content.className = 'wrap reading-content';
  if (token !== generation) return;
  document.title = `${page.title} · 동산위키`;
  content.innerHTML = `<div class="section-head"><a href="#home">← 전체 문서</a><div class="actions">${!page.deleted_at && session ? `<a class="button" href="${canEdit(profile) ? '#edit?id=' : '#submit?target='}${page.id}">${canEdit(profile) ? '문서 수정' : '수정안 작성·제출'}</a>` : ''}${profile?.role === 'admin' && !page.deleted_at ? '<button id="delete-page">문서 삭제</button>' : ''}</div></div>
  ${page.deleted_at ? '<div class="notice">휴지통에 있는 문서입니다. 다른 회원과 방문자에게는 보이지 않습니다. <a href="#trash">휴지통에서 복구하기 →</a></div>' : ''}<article class="article"><span class="tag">${e(page.category)}</span><h1>${e(page.title)}</h1><p class="muted">${client ? date(page.updated_at) + ' · 버전 ' + page.version : '디자인 미리보기용 예시 문서'}</p>
  <div class="body-text">${linkifyText(page.content)}</div><div class="source"><strong>출처</strong><br>${linkifyText(page.source || '출처가 등록되지 않았습니다.')}</div><section id="page-files" class="attachments"></section></article>
  <section><h2>수정 이력 <span class="muted">최근 50개</span></h2>${!client ? '<p class="muted">예시 문서에는 실제 수정 이력이 없습니다.</p>' : ''}${revisions.map(r => `<div class="history-item"><button data-revision="${r.id}">버전 ${r.version} 보기</button> ${e(r.editor_name)} <span class="muted">${date(r.created_at)}</span><div id="revision-${r.id}"></div></div>`).join('')}</section>`;
  renderAttachments(client, $('#page-files'), page.attachment_ids || []);
  if (client && !page.deleted_at) recordPageView(client, page.id).then(() => {
    if (token === generation) renderPopularDocuments(client, $('#popular-documents'));
  });
  $('#delete-page')?.addEventListener('click', () => {
    if (!window.confirm('이 문서를 휴지통으로 옮길까요? 공개 목록과 수정 이력에서 숨겨지고, 관리자가 복구할 수 있습니다.')) return;
    action(async () => {
      must(await client.rpc('set_wiki_page_deleted', { p_id: page.id, p_version: page.version, p_deleted: true }));
      go('#trash');
    }, content);
  });
  document.querySelectorAll('[data-revision]').forEach(button => button.addEventListener('click', () => action(async () => {
    const revision = must(await client.from('revisions').select('title,content,source,attachment_ids').eq('id', button.dataset.revision).single());
    if (token !== generation) return;
    const target = document.getElementById(`revision-${button.dataset.revision}`);
    target.innerHTML = `<details open><summary>${e(revision.title)}</summary><pre>${linkifyText(revision.content)}</pre><p class="source">출처: ${linkifyText(revision.source)}</p><div class="attachments" id="revision-files-${button.dataset.revision}"></div></details>`;
    await renderAttachments(client, document.getElementById(`revision-files-${button.dataset.revision}`), revision.attachment_ids || []);
  })));
}
async function editView(content, id, token) {
  if (!canEdit(profile)) { content.innerHTML = '<div class="notice">일반 회원은 새 문서를 작성해 승인 요청할 수 있습니다. 공개 문서는 해당 문서의 수정안 작성·제출 버튼으로 수정을 요청할 수 있습니다.</div><a class="button primary" href="#submit">새 문서 작성·제출</a>'; return; }
  const page = id ? must(await client.from('pages').select('*').eq('id', id).single()) : { title: '', content: '', source: '', category: categories[0] };
  if (token !== generation) return;
  if (page.deleted_at) throw new Error('휴지통의 문서는 먼저 복구해 주세요.');
  content.innerHTML = `<div class="section-head"><h2>${id ? '문서 수정' : '새 문서 작성'}</h2><a href="${id ? `#page?id=${id}` : '#home'}">취소</a></div>
  <div class="notice">사실에 기반해 작성하고 출처를 명시해 주세요. 실명·연락처 등 타인의 개인정보는 게시하지 마세요. 본문은 일반 텍스트로 표시되며 http:// 또는 https:// 주소는 클릭 가능한 링크로 표시됩니다.</div>
  <form id="edit-form" class="form"><label>문서 제목<input name="title" value="${e(page.title)}" required maxlength="120"></label>
  <label>분류<select name="category">${categories.map(c => `<option ${c === page.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label>본문<textarea name="content" required maxlength="50000">${e(page.content)}</textarea></label>
  <label>출처<input name="source" value="${e(page.source)}" required maxlength="2000" placeholder="자료명, 확인 날짜, 참고 URL 등"></label>
  <div id="edit-files"></div><button class="primary" disabled>문서와 수정 이력 저장</button></form>`;
  const attachmentEditor = await mountAttachmentEditor(client, $('#edit-files'), page.attachment_ids || []);
  if (token !== generation) return;
  $('#edit-form > button').disabled = false;
  $('#edit-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      await attachmentEditor.save(async attachmentIds => {
        const savedId = must(await client.rpc('save_page_with_attachments', { p_id: id || null, p_title: fields.get('title'), p_category: fields.get('category'), p_content: fields.get('content'), p_source: fields.get('source'), p_version: page.version || null, p_attachment_ids: attachmentIds }));
        go(`#page?id=${savedId}`);
      });
    }, form);
  });
}
function managementUrl(scope, query = '', page = 0, id = '') {
  const params = new URLSearchParams({ q: query, p: String(page) });
  if (id) params.set('id', id);
  return `#${scope}?${params}`;
}
function managementSearchState(params) {
  return { query: (params.get('q') || '').trim().slice(0, 120), page: Math.max(0, Math.min(10000, Number.parseInt(params.get('p'), 10) || 0)) };
}
function managementSearchForm(query, label) {
  return `<form id="management-search" class="search" style="max-width:650px;margin:20px 0">${icon('search', 21)}<input name="q" aria-label="${label}" placeholder="${label}" value="${e(query)}" maxlength="120"><button class="primary" type="submit">검색</button>${query ? '<button id="management-clear" type="button">초기화</button>' : ''}</form>`;
}
function managementPagination(page, count, size) {
  return count > size ? `<div class="pagination"><button id="management-prev" ${page === 0 ? 'disabled' : ''}>← 이전</button><span>${page + 1} / ${Math.ceil(count / size)}</span><button id="management-next" ${(page + 1) * size >= count ? 'disabled' : ''}>다음 →</button></div>` : '';
}
function bindManagementSearch(scope, query, page) {
  $('#management-search').addEventListener('submit', event => {
    event.preventDefault();
    go(managementUrl(scope, String(new FormData(event.currentTarget).get('q') || '').trim().slice(0, 120)));
  });
  $('#management-clear')?.addEventListener('click', () => go(managementUrl(scope)));
  $('#management-prev')?.addEventListener('click', () => go(managementUrl(scope, query, page - 1)));
  $('#management-next')?.addEventListener('click', () => go(managementUrl(scope, query, page + 1)));
}
async function adminView(content, token, params) {
  if (profile?.role !== 'admin') { content.innerHTML = '<div class="notice">관리자만 접근할 수 있습니다.</div>'; return; }
  const { query, page } = managementSearchState(params), size = 50;
  let request = client.from('profiles').select('id,nickname,role,created_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id');
  if (query) request = request.ilike('nickname', `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`);
  const result = await request.range(page * size, page * size + size - 1);
  const members = must(result), count = result.count || 0;
  if (token !== generation) return;
  if (page > 0 && page * size >= count) { go(managementUrl('admin', query, Math.max(0, Math.ceil(count / size) - 1))); return; }
  content.innerHTML = `<h2>편집 권한 관리</h2><p class="muted">닉네임으로 모든 회원을 검색할 수 있습니다. 가입 시점을 함께 확인한 뒤 운영진에게만 편집 권한을 부여하세요. 관리자 지정은 Supabase에서 진행합니다.</p>${managementSearchForm(query, '회원 닉네임 검색')}<p class="muted">${query ? `‘${e(query)}’ 검색 결과` : '전체 회원'} ${count}명</p>
  ${members.length ? members.map(member => `<div class="member"><div><strong>${e(member.nickname)}</strong><br><span class="muted">${date(member.created_at)} · ${e(member.id)}</span></div>${member.role === 'admin' ? '<span class="tag">관리자</span>' : `<div class="actions"><select aria-label="${e(member.nickname)} 권한" id="role-${member.id}"><option value="reader" ${member.role === 'reader' ? 'selected' : ''}>일반 회원</option><option value="editor" ${member.role === 'editor' ? 'selected' : ''}>편집자</option></select><button data-member="${member.id}">적용</button></div>`}</div>`).join('') : '<div class="empty">검색 결과가 없습니다. 다른 닉네임으로 찾아보세요.</div>'}${managementPagination(page, count, size)}`;
  bindManagementSearch('admin', query, page);
  document.querySelectorAll('[data-member]').forEach(button => button.addEventListener('click', () => action(async () => {
    const id = button.dataset.member;
    const rows = must(await client.from('profiles').update({ role: document.getElementById(`role-${id}`).value }).eq('id', id).select('id'));
    if (!rows.length) throw new Error('권한 변경이 거부됐습니다. 관리자 권한을 확인해 주세요.');
    notify('편집 권한을 변경했습니다.');
  })));
}
const submissionStatuses = { pending: '승인 대기', approved: '승인·공개', rejected: '반려' };
function requireMember(content) {
  if (session && profile) return true;
  content.innerHTML = '<div class="notice">로그인 후 문서를 작성·제출할 수 있습니다.</div><a class="button primary" href="#login">로그인하기</a>';
  return false;
}
async function submissionsView(content, token) {
  if (!requireMember(content)) return;
  const rows = must(await client.from('document_submissions').select('id,title,category,status,review_note,published_page_id,updated_at,target_page_id').eq('author_id', session.user.id).order('updated_at', { ascending: false }).limit(200));
  if (token !== generation) return;
  content.innerHTML = `<div class="section-head"><h2>내 제출 문서</h2><a class="button primary" href="#submit">새 문서 작성·제출</a></div><p class="muted">최근 200개 · 승인 전에는 본인과 편집자·관리자만 볼 수 있습니다. 편집 내용은 제출 버튼을 눌러야 저장됩니다.</p>${rows.length ? rows.map(row => `<article class="article"><span class="tag">${row.target_page_id ? '수정안' : '새 문서'} · ${submissionStatuses[row.status]}</span><h2>${e(row.title)}</h2><p class="muted">${e(row.category)} · ${date(row.updated_at)}</p>${row.review_note ? `<p class="body-text">심사 의견: ${e(row.review_note)}</p>` : ''}${row.status === 'approved' ? (row.published_page_id ? `<a class="button" href="#page?id=${row.published_page_id}">공개 문서 보기</a>` : '<p>공개 문서를 찾을 수 없습니다.</p>') : `<a class="button" href="#submit?id=${row.id}">${row.status === 'rejected' ? '수정 후 다시 제출' : '제출 내용 확인·수정'}</a>`}</article>`).join('') : '<div class="empty">아직 제출한 문서가 없습니다.</div>'}`;
}
async function submissionEditView(content, id, token, targetId) {
  if (!requireMember(content)) return;
  let row;
  if (id) row = must(await client.from('document_submissions').select('*').eq('id', id).eq('author_id', session.user.id).single());
  else if (targetId) {
    const page = must(await client.from('pages').select('*').eq('id', targetId).is('deleted_at', null).single());
    row = { ...page, target_page_id: page.id, base_version: page.version };
  } else row = { title: '', category: categories[0], content: '', source: '', target_page_id: null, base_version: null };
  if (token !== generation) return;
  if (row.status === 'approved') { content.innerHTML = '<div class="notice">이미 승인된 요청입니다.</div><a href="#submissions">내 제출 문서로 돌아가기</a>'; return; }
  const isEdit = !!row.target_page_id;
  let stale = false;
  if (id && isEdit) {
    const current = must(await client.from('pages').select('version').eq('id', row.target_page_id).is('deleted_at', null).maybeSingle());
    stale = !current || current.version !== row.base_version;
  }
  if (token !== generation) return;
  content.innerHTML = `<div class="section-head"><h2>${isEdit ? '공개 문서 수정안' : id ? '제출 문서 수정' : '새 문서 작성·제출'}</h2><a href="#submissions">내 제출 문서</a></div><div class="notice">${isEdit ? `기준 버전 ${row.base_version}의 수정안입니다. 승인 전까지 기존 공개 내용은 유지됩니다.` : '편집자·관리자 승인 후 공개됩니다.'} 출처를 명시하고 타인의 개인정보를 적지 마세요. 제출 전 입력 내용은 자동 저장되지 않습니다.</div>${stale ? `<div class="notice">공개 문서가 변경되었거나 삭제되어 이 요청을 다시 제출할 수 없습니다. 내용을 복사해 두고 <a href="#page?id=${row.target_page_id}">현재 공개 문서</a>에서 새 수정안을 작성해 주세요.</div>` : ''}${row.review_note ? `<p class="body-text">심사 의견: ${e(row.review_note)}</p>` : ''}<form id="submission-form" class="form"><label>문서 제목<input name="title" value="${e(row.title)}" required maxlength="120"></label><label>분류<select name="category">${categories.map(c => `<option ${c === row.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>본문<textarea name="content" required maxlength="50000">${e(row.content)}</textarea></label><label>출처<input name="source" value="${e(row.source)}" required maxlength="2000" placeholder="자료명, 확인 날짜, 참고 URL 등"></label><div id="submission-files"></div><button class="primary" disabled>${id ? '수정 내용으로 다시 승인 요청' : '승인 요청하기'}</button></form>`;
  const attachmentEditor = await mountAttachmentEditor(client, $('#submission-files'), row.attachment_ids || []);
  if (token !== generation) return;
  $('#submission-form > button').disabled = stale;
  $('#submission-form').addEventListener('submit', event => {
    event.preventDefault(); if (stale) return;
    const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      await attachmentEditor.save(async attachmentIds => {
        must(await client.rpc('submit_wiki_document_with_attachments', { p_id: id || null, p_title: fields.get('title'), p_category: fields.get('category'), p_content: fields.get('content'), p_source: fields.get('source'), p_target_page_id: row.target_page_id || null, p_base_version: row.base_version || null, p_attachment_ids: attachmentIds }));
        go('#submissions');
      });
    }, form);
  });
}
async function reviewView(content, id, token, params) {
  if (!canEdit(profile)) { content.innerHTML = '<div class="notice">편집자와 관리자만 심사할 수 있습니다.</div>'; return; }
  const { query, page } = managementSearchState(params), size = 24;
  const backUrl = managementUrl('review', query, page);
  if (!id) {
    let request = client.from('document_submissions').select('id,title,category,author_name,updated_at,target_page_id', { count: 'exact' }).eq('status', 'pending').order('created_at').order('id');
    if (query) request = request.ilike('title', `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`);
    const result = await request.range(page * size, page * size + size - 1);
    const rows = must(result), count = result.count || 0;
    if (token !== generation) return;
    if (page > 0 && page * size >= count) { go(managementUrl('review', query, Math.max(0, Math.ceil(count / size) - 1))); return; }
    content.innerHTML = `<h2>문서 승인</h2><p class="muted">승인 대기 중인 새 문서·수정안을 제목으로 검색합니다. 오래된 요청부터 표시됩니다.</p>${managementSearchForm(query, '승인 요청 문서 제목 검색')}<p class="muted">${query ? `‘${e(query)}’ 검색 결과` : '전체 승인 대기'} ${count}건</p>${rows.length ? rows.map(row => `<article class="article"><span class="tag">${row.target_page_id ? '수정안' : '새 문서'} · ${e(row.category)}</span><h2>${e(row.title)}</h2><p>${e(row.author_name)} · ${date(row.updated_at)}</p><a class="button primary" href="${e(managementUrl('review', query, page, row.id))}">내용 확인·심사</a></article>`).join('') : `<div class="empty">${query ? '검색 결과가 없습니다. 다른 제목으로 찾아보세요.' : '승인 대기 문서가 없습니다.'}</div>`}${managementPagination(page, count, size)}`;
    bindManagementSearch('review', query, page);
    return;
  }
  const row = must(await client.from('document_submissions').select('*').eq('id', id).single());
  const current = row.target_page_id ? must(await client.from('pages').select('*').eq('id', row.target_page_id).maybeSingle()) : null;
  if (token !== generation) return;
  const isEdit = !!row.target_page_id;
  const stale = isEdit && (!current || current.deleted_at || current.version !== row.base_version);
  content.className = 'wrap reading-content';
  const comparison = isEdit ? `<details class="article" open><summary>현재 ${current?.deleted_at ? '휴지통의' : '공개'} 내용 · 버전 ${current?.version ?? '없음'} / 요청 기준 버전 ${row.base_version}</summary>${current ? `<h2>${e(current.title)}</h2><span class="tag">${e(current.category)}</span><div class="body-text">${linkifyText(current.content)}</div><div class="source">출처: ${linkifyText(current.source)}</div><div id="current-files" class="attachments"></div>` : '<p>대상 문서를 찾을 수 없습니다.</p>'}</details>` : '';
  content.innerHTML = `<a href="${e(backUrl)}">← 승인 대기 목록</a>${comparison}<article class="article"><span class="tag">${isEdit ? '제안된 수정안' : '새 문서'} · ${submissionStatuses[row.status]} · ${e(row.category)}</span><h1>${e(row.title)}</h1><p class="muted">제출자: ${e(row.author_name)} · ${date(row.updated_at)}</p><div class="body-text">${linkifyText(row.content)}</div><div class="source"><strong>출처</strong><br>${linkifyText(row.source)}</div><div id="proposed-files" class="attachments"></div></article>${row.status === 'pending' ? `<div class="notice">${stale ? '대상 문서가 변경되었거나 삭제되어 승인할 수 없습니다. 반려 후 현재 문서를 기준으로 다시 제출하도록 안내해 주세요.' : isEdit ? '승인하면 기존 문서에 수정안이 반영되고 이전 내용은 수정 이력에 남습니다.' : '승인하면 새 문서로 공개됩니다. 같은 제목의 문서가 있으면 승인이 중단됩니다.'}</div><form id="review-form" class="form"><label>심사 의견 (선택)<textarea name="note" maxlength="2000" style="min-height:100px" placeholder="반려 시 보완할 점을 안내해 주세요"></textarea></label><div class="actions"><button class="primary" type="submit" value="approve" ${stale ? 'disabled' : ''}>${isEdit ? '승인하고 수정 반영' : '승인하고 공개'}</button><button type="submit" value="reject">반려하기</button></div></form>` : `<p class="body-text">심사 의견: ${e(row.review_note || '없음')}</p>`}`;
  renderAttachments(client, $('#current-files'), current?.attachment_ids || []);
  renderAttachments(client, $('#proposed-files'), row.attachment_ids || []);
  $('#review-form')?.addEventListener('submit', event => {
    event.preventDefault(); const approve = event.submitter?.value === 'approve';
    if (approve && stale) return;
    const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      must(await client.rpc('review_wiki_document', { p_id: row.id, p_approve: approve, p_note: fields.get('note'), p_expected_updated_at: row.updated_at }));
      go(backUrl);
    }, form);
  });
}
async function trashView(content, token) {
  if (profile?.role !== 'admin') { content.innerHTML = '<div class="notice">관리자만 휴지통을 볼 수 있습니다.</div>'; return; }
  const rows = must(await client.from('pages').select('id,title,category,version,deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(200));
  if (token !== generation) return;
  content.innerHTML = `<h2>문서 휴지통</h2><p class="muted">최근 200개 · 삭제한 문서는 방문자와 다른 회원에게 보이지 않습니다. 복구하면 다시 공개됩니다.</p>${rows.length ? rows.map(row => `<article class="article"><span class="tag">${e(row.category)}</span><h2>${e(row.title)}</h2><p class="muted">삭제: ${date(row.deleted_at)}</p><div class="actions"><a class="button" href="#page?id=${row.id}">내용 확인</a><button class="primary" data-restore="${row.id}">복구하고 공개</button></div></article>`).join('') : '<div class="empty">휴지통이 비어 있습니다.</div>'}`;
  document.querySelectorAll('[data-restore]').forEach(button => button.addEventListener('click', () => {
    const row = rows.find(p => p.id === button.dataset.restore);
    if (!window.confirm(`‘${row.title}’ 문서를 복구하고 다시 공개할까요?`)) return;
    action(async () => {
      must(await client.rpc('set_wiki_page_deleted', { p_id: row.id, p_version: row.version, p_deleted: false }));
      go(`#page?id=${row.id}`);
    }, content);
  }));
}

const inquiryStatus = { open: '답변 대기', answered: '답변 완료' };
function inquiryUrl(scope, query = '', status = 'open', page = 0, id = '') {
  const params = new URLSearchParams({ q: query, status, p: String(page) });
  if (id) { params.set('id', id); params.set('from', 'admin'); }
  return `#${scope}?${params}`;
}
async function contactView(content, token, params) {
  if (!session || !profile) {
    content.innerHTML = '<h2>관리자에게 문의</h2><div class="notice">로그인 후 문의를 보내고 답변을 확인할 수 있습니다. 문의는 작성자 본인과 관리자만 볼 수 있습니다.</div><a class="button primary" href="#login">로그인하기</a>';
    return;
  }
  const { page } = managementSearchState(params), size = 20;
  const result = await client.from('wiki_inquiries').select('id,title,status,created_at', { count: 'exact' }).eq('author_id', session.user.id).order('created_at', { ascending: false }).order('id').range(page * size, page * size + size - 1);
  const rows = must(result), count = result.count || 0;
  if (token !== generation) return;
  if (page > 0 && page * size >= count) { go(`#contact?p=${Math.max(0, Math.ceil(count / size) - 1)}`); return; }
  content.innerHTML = `<h2>관리자에게 문의</h2><div class="notice">문서 수정 요청, 이용 중 문제, 운영 관련 질문을 보내 주세요. 문의와 답변은 본인과 관리자만 볼 수 있습니다. 비밀번호나 다른 사람의 개인정보는 적지 마세요.</div><form id="inquiry-form" class="form"><label>제목<input name="title" required maxlength="120" placeholder="어떤 도움이 필요한가요?"></label><label>문의 내용<textarea name="body" required maxlength="4000" style="min-height:180px" placeholder="문제가 발생한 문서 주소와 상황 등을 적어 주세요."></textarea></label><p class="muted">최대 4000자 · 24시간에 10건까지 · 답변은 아래 ‘내 문의’에서 확인할 수 있습니다.</p><button class="primary">문의 보내기</button></form><section style="margin-top:40px"><h2>내 문의 <span class="muted">${count}건</span></h2>${rows.length ? rows.map(row => `<div class="member"><div><span class="tag">${inquiryStatus[row.status]}</span><h3>${e(row.title)}</h3><p class="muted">${date(row.created_at)}</p></div><a class="button" href="#inquiry?id=${row.id}">내용·답변 보기</a></div>`).join('') : '<div class="empty">아직 보낸 문의가 없습니다.</div>'}${managementPagination(page, count, size)}</section>`;
  $('#inquiry-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      const id = must(await client.rpc('create_wiki_inquiry', { p_title: fields.get('title'), p_body: fields.get('body') }));
      go(`#inquiry?id=${id}`);
    }, form);
  });
  $('#management-prev')?.addEventListener('click', () => go(`#contact?p=${page - 1}`));
  $('#management-next')?.addEventListener('click', () => go(`#contact?p=${page + 1}`));
}
async function inquiriesView(content, token, params) {
  if (profile?.role !== 'admin') { content.innerHTML = '<div class="notice">관리자만 문의 목록을 볼 수 있습니다.</div>'; return; }
  const { query, page } = managementSearchState(params), size = 24;
  const status = ['open', 'answered', 'all'].includes(params.get('status')) ? params.get('status') : 'open';
  let request = client.from('wiki_inquiries').select('id,title,author_name,status,created_at', { count: 'exact' }).order('created_at').order('id');
  if (status !== 'all') request = request.eq('status', status);
  if (query) request = request.ilike('title', `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`);
  const result = await request.range(page * size, page * size + size - 1);
  const rows = must(result), count = result.count || 0;
  if (token !== generation) return;
  if (page > 0 && page * size >= count) { go(inquiryUrl('inquiries', query, status, Math.max(0, Math.ceil(count / size) - 1))); return; }
  content.innerHTML = `<h2>문의 관리</h2><p class="muted">작성자에게만 답변이 보입니다. 제목을 검색하거나 답변 상태별로 확인할 수 있습니다.</p>${managementSearchForm(query, '문의 제목 검색')}<label>답변 상태 <select id="inquiry-filter" style="padding:8px;margin-left:8px"><option value="open" ${status === 'open' ? 'selected' : ''}>답변 대기</option><option value="answered" ${status === 'answered' ? 'selected' : ''}>답변 완료</option><option value="all" ${status === 'all' ? 'selected' : ''}>전체</option></select></label><p class="muted">${count}건 · 오래된 문의부터 표시됩니다.</p>${rows.length ? rows.map(row => `<div class="member"><div><span class="tag">${inquiryStatus[row.status]}</span><h3>${e(row.title)}</h3><p class="muted">${e(row.author_name)} · ${date(row.created_at)}</p></div><a class="button" href="${e(inquiryUrl('inquiry', query, status, page, row.id))}">확인·답변</a></div>`).join('') : '<div class="empty">조건에 맞는 문의가 없습니다.</div>'}${managementPagination(page, count, size)}`;
  $('#management-search').addEventListener('submit', event => {
    event.preventDefault(); go(inquiryUrl('inquiries', String(new FormData(event.currentTarget).get('q') || '').trim().slice(0, 120), status));
  });
  $('#management-clear')?.addEventListener('click', () => go(inquiryUrl('inquiries', '', status)));
  $('#inquiry-filter').addEventListener('change', event => go(inquiryUrl('inquiries', query, event.currentTarget.value)));
  $('#management-prev')?.addEventListener('click', () => go(inquiryUrl('inquiries', query, status, page - 1)));
  $('#management-next')?.addEventListener('click', () => go(inquiryUrl('inquiries', query, status, page + 1)));
}
async function inquiryView(content, token, params) {
  if (!session || !profile) { content.innerHTML = '<div class="notice">로그인 후 문의를 확인해 주세요.</div><a class="button" href="#login">로그인하기</a>'; return; }
  const inquiry = must(await client.from('wiki_inquiries').select('*').eq('id', params.get('id')).maybeSingle());
  if (token !== generation) return;
  if (!inquiry) { content.innerHTML = '<div class="notice">문의를 찾을 수 없거나 조회 권한이 없습니다.</div><a href="#contact">내 문의 보기</a>'; return; }
  const admin = profile.role === 'admin';
  const { query, page } = managementSearchState(params);
  const status = ['open', 'answered', 'all'].includes(params.get('status')) ? params.get('status') : 'open';
  const back = admin && params.get('from') === 'admin' ? inquiryUrl('inquiries', query, status, page) : '#contact';
  content.className = 'wrap reading-content';
  content.innerHTML = `<a href="${e(back)}">← ${admin && params.get('from') === 'admin' ? '문의 관리' : '내 문의'}</a><article class="article"><span class="tag">${inquiryStatus[inquiry.status]}</span><h1>${e(inquiry.title)}</h1><p class="muted">${e(inquiry.author_name)} · ${date(inquiry.created_at)}</p><div class="body-text">${linkifyText(inquiry.body)}</div><section class="source"><h2>관리자 답변</h2>${inquiry.status === 'answered' ? `<p class="muted">${date(inquiry.replied_at)}</p><div class="body-text">${linkifyText(inquiry.reply)}</div>` : '<p>문의가 접수되었습니다. 관리자가 확인한 후 이곳에 답변이 표시됩니다.</p>'}</section></article>${admin ? `<h2 style="margin-top:28px">${inquiry.status === 'answered' ? '답변 수정' : '답변 작성'}</h2><form id="inquiry-reply" class="form"><label>작성자에게 보낼 답변<textarea name="reply" required maxlength="4000" style="min-height:180px">${e(inquiry.reply)}</textarea></label><button class="primary">${inquiry.status === 'answered' ? '답변 수정 저장' : '답변 등록'}</button></form>` : ''}`;
  $('#inquiry-reply')?.addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      must(await client.rpc('reply_wiki_inquiry', { p_id: inquiry.id, p_reply: fields.get('reply'), p_version: inquiry.version }));
      await render();
    }, form);
  });
}

window.addEventListener('hashchange', render);
async function boot() {
  if (!client) return render();
  // Auth 콜백 안에서 다른 Supabase 요청을 await하지 않습니다.
  client.auth.onAuthStateChange((event, nextSession) => {
    const previousId = session?.user?.id;
    session = nextSession;
    if (event === 'PASSWORD_RECOVERY') { recovery = true; setTimeout(() => go('#reset'), 0); }
    else if (event !== 'INITIAL_SESSION' && previousId !== nextSession?.user?.id) {
      setTimeout(async () => {
        try { await refreshProfile(); if (!busy) await render(); }
        catch (error) { notify(friendly(error), true); }
      }, 0);
    }
  });
  try {
    const data = must(await client.auth.getSession()); session = data.session;
    await refreshProfile();
    if (recovery && session) location.hash = '#reset';
    else if(session&&needsVerification(profile))location.hash='#verify';
    await render();
  } catch (error) { shell(); $('#content').innerHTML = '<div class="notice">계정 정보를 불러오지 못했습니다. Supabase SQL 설정을 확인한 뒤 새로고침해 주세요.</div>'; notify(friendly(error), true); }
}
boot();
