import { createClient } from '@supabase/supabase-js';
import { categories, escapeHtml as e, canEdit, safeUrl, validatePassword } from './core.js';
import { icon, categoryDetails, previewPages } from './design.js';
import '@fontsource-variable/noto-sans-kr';
import './style.css';

const app = document.querySelector('#app');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const suggestion = safeUrl(import.meta.env.VITE_SUGGESTION_URL);
const recoveryArrival = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
const client = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_')
  ? createClient(url, key) : null;
let session = null, profile = null, generation = 0, busy = false, recovery = recoveryArrival;
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
  app.innerHTML = `<a class="skip" href="#main">본문으로 이동</a>
  <header class="topbar${session ? ' member-topbar' : ''}"><div class="wrap header"><a class="brand" href="#home" aria-label="동산위키 홈"><img class="brand-mark" src="/school-logo.jpg" alt="" width="44" height="44"><span>동산위키<small>DONGSAN WIKI</small></span></a>
  <nav class="main-nav" aria-label="주 메뉴"><a href="#home" class="${current === 'home' ? 'active' : ''}">문서 둘러보기</a><a href="#guide" class="${current === 'guide' ? 'active' : ''}">처음 오셨나요?</a><a href="#about" class="${current === 'about' ? 'active' : ''}">위키 소개</a></nav>
  <nav class="actions account-actions" aria-label="계정 메뉴">${session ? `<span class="muted">${e(profile?.nickname || '동산인')}</span>
  <a class="button" href="#submissions">내 제출 문서</a>${profile?.role === 'admin' ? '<a class="button" href="#review">문서 승인</a><a class="button" href="#admin">권한 관리</a>' : ''}<button id="logout">로그아웃</button>` : '<a class="login-link" href="#login">로그인 <span aria-hidden="true">↗</span></a><a class="button primary signup-link" href="#signup">함께하기</a>'}</nav></div></header>
  <div class="wrap"><div id="status" class="status" role="status" aria-live="polite" hidden></div></div>
  ${!client ? '<div class="preview-strip"><span></span> 디자인 미리보기 <i>·</i> 예시 문서로 구성되어 있습니다. <a href="#about">프로젝트 알아보기 ↗</a></div>' : ''}
  <main id="main" tabindex="-1"><div class="wrap" id="content"><p class="loading">기록을 펼치는 중…</p></div></main>
  <footer><div class="wrap footer-top"><a class="brand" href="#home"><img class="brand-mark" src="/school-logo.jpg" alt="" width="44" height="44"><span>동산위키<small>DONGSAN WIKI</small></span></a><p>오늘의 경험이 내일의 길잡이가 되도록.<br>학생이 기록하고, 함께 이어가는 우리 학교의 위키.</p><div><a href="#about">프로젝트 소개</a><a href="#guide">이용 안내</a></div></div><div class="wrap footer-bottom"><span>© DONGSAN WIKI · 학생 주도 비공식 프로젝트</span><span>사실을 기록하고, 출처를 남기고, 서로를 존중합니다.</span></div></footer>`;
  $('.skip').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView(); });
  $('#logout')?.addEventListener('click', () => action(async () => {
    must(await client.auth.signOut()); session = null; profile = null; recovery = false; go('#home');
  }));
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
  profile = session ? must(await client.from('profiles').select('id,nickname,role').eq('id', session.user.id).single()) : null;
}
function sidebar(active) {
  return `<aside class="sidebar" aria-label="문서 분류"><span class="eyebrow">BROWSE THE ARCHIVE</span><h2>학교의 모든 이야기</h2><button data-category="" class="${!active ? 'active' : ''}">${icon('book', 18)} 전체 문서 <span>↗</span></button>
  ${categoryDetails.map(([category, symbol]) => `<button data-category="${category}" class="${category === active ? 'active' : ''}">${icon(symbol, 18)} ${category}<span>↗</span></button>`).join('')}
  <div class="side-note">${icon('pen', 21)}<p>아직 없는 이야기인가요?<br>여러분의 제안으로<br>위키가 조금씩 자랍니다.</p><a href="#about">기록에 참여하는 방법 →</a></div></aside>`;
}
async function render() {
  const token = ++generation;
  document.title = '동산위키 · 안산동산고 디지털 위키';
  shell();
  window.scrollTo({ top: 0, behavior: 'instant' });
  const content = $('#content');
  const { name, params } = route();
  try {
    if (name === 'login' || name === 'signup' || name === 'forgot' || name === 'reset') authView(name, content);
    else if (name === 'guide' || name === 'about') infoView(name, content);
    else if (name === 'submissions') await submissionsView(content, token);
    else if (name === 'submit') await submissionEditView(content, params.get('id'), token);
    else if (name === 'review') await reviewView(content, params.get('id'), token);
    else if (name === 'admin') await adminView(content, token);
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
  const category = categories.includes(params.get('category')) ? params.get('category') : '';
  const query = (params.get('q') || '').slice(0, 120);
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.get('p'), 10) || 0));
  let pages, count;
  if (client) {
    let request = client.from('pages').select('id,title,category,updated_at', { count: 'exact' }).order('updated_at', { ascending: false }).order('id');
    if (category) request = request.eq('category', category);
    if (query) request = request.ilike('title', `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`);
    const result = await request.range(page * 24, page * 24 + 23);
    pages = must(result); count = result.count || 0;
  } else {
    const matches = previewPages.filter(p => (!category || p.category === category) && p.title.toLocaleLowerCase('ko-KR').includes(query.toLocaleLowerCase('ko-KR')));
    pages = matches.slice(page * 24, page * 24 + 24); count = matches.length;
  }
  if (token !== generation) return;
  const filtering = !!category || !!query;
  content.className = 'wrap home-content';
  content.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="tiny-line"></span> OUR DAYS, OUR ARCHIVE</span><h1>동산의 하루가,<br>우리의 <span class="hero-word">기록</span>이 되다.</h1><p>처음이라 궁금한 것부터, 오래 기억하고 싶은 순간까지.<br>동산인이 함께 쓰는 가장 가까운 학교생활 안내서.</p><a href="#guide" class="text-link">동산위키가 처음이라면 ${icon('arrow', 19)}</a><div class="hero-signature"><span>기록은 남고, 이야기는 이어지니까.</span><span class="signature-line"></span></div></div>
  <figure class="hero-art"><div class="art-label">FIELD NOTES <span>No. 001</span></div><img src="/archive-illustration.svg" alt="펼친 책 위에 학교와 나무가 솟아 있는 상상 일러스트" width="620" height="530"><figcaption>THE LITTLE THINGS THAT MAKE OUR SCHOOL.</figcaption></figure>
  <div class="hero-bottom"><span class="hero-bottom-label">우리 학교가 궁금할 때</span><form class="search" id="search">${icon('search', 23)}<input name="q" aria-label="문서 제목 검색" maxlength="120" placeholder="궁금한 동산의 이야기를 검색해 보세요" value="${e(query)}"><kbd aria-hidden="true">Enter ↵</kbd><button class="primary" aria-label="검색">${icon('arrow', 23)}</button></form><div class="quick-search"><span>빠르게 찾기</span><button data-query="기숙사">기숙사</button><button data-query="동아리">동아리</button><button data-query="신입생">신입생 안내</button></div></div></section>
  <section class="category-section" aria-label="주제별 바로가기"><div class="category-heading"><span class="eyebrow">FIND YOUR CHAPTER</span><h2>어떤 이야기를 찾고 있나요?</h2></div><div class="category-grid">${categoryDetails.map(([cat, symbol, description, number]) => `<button class="category-tile ${cat === category ? 'selected' : ''}" data-category="${cat}"><span class="tile-top">${icon(symbol, 27)}<span>${number}</span></span><strong>${cat}</strong><span class="tile-desc">${description}</span><span class="tile-arrow">↗</span></button>`).join('')}</div></section>
  <div class="archive-layout" id="archive">${sidebar(category)}<section class="document-section"><div class="section-head"><div><span class="eyebrow">THE GROWING COLLECTION</span><h2>${e(query ? `‘${query}’ 검색 결과` : category || '차곡차곡 쌓이는 기록')} <span class="count">${count.toString().padStart(2, '0')}</span></h2></div>${session ? `<a class="button primary" href="${canEdit(profile) ? '#edit' : '#submit'}">${canEdit(profile) ? '문서 작성 +' : '문서 작성·제출 +'}</a>` : filtering ? '<a class="text-link" href="#home">전체 문서 보기 ↗</a>' : '<span class="muted">'+ (client ? '최근 수정 순' : '미리보기용 예시') +'</span>'}</div>
  ${pages.length ? `<div class="document-list">${pages.map((p, index) => `<a class="document-row" href="#page?id=${encodeURIComponent(p.id)}"><span class="doc-index">${String(page * 24 + index + 1).padStart(2, '0')}</span><div class="doc-info"><span class="doc-category">${e(p.category)}</span><h3>${e(p.title)}</h3>${p.description ? `<p>${e(p.description)}</p>` : ''}</div><span class="doc-date">${client ? date(p.updated_at) : '예시 문서'}</span><span class="doc-arrow">↗</span></a>`).join('')}</div>` : `<div class="empty">${icon('book', 34)}<h3>${filtering ? '아직 이 이야기를 찾지 못했어요.' : '첫 번째 기록을 기다리고 있어요.'}</h3><p>${filtering ? '다른 검색어나 분류로 찾아보세요.' : '운영진이 확인한 이야기부터 차근차근 채워갈 예정입니다.'}</p><a class="text-link" href="#home">전체 문서로 돌아가기 →</a></div>`}
  ${count > 24 ? `<div class="pagination"><button id="prev" ${page === 0 ? 'disabled' : ''}>← 이전</button><span>${page + 1}</span><button id="next" ${(page + 1) * 24 >= count ? 'disabled' : ''}>다음 →</button></div>` : ''}</section></div>
  <section class="guide-banner"><div class="guide-book" aria-hidden="true"><span>DONGSAN<br>FIELD<br>GUIDE</span><b>${icon('leaf', 35)}</b><small>FOR YOUR FIRST CHAPTER</small></div><div class="guide-copy"><span class="eyebrow">A LITTLE HELP FOR A NEW BEGINNING</span><h2>처음의 동산이,<br>조금 더 익숙해지도록.</h2><p>새로운 시작에 필요한 이야기들을 차근차근 모았습니다.<br>어디서 시작할지 모르겠다면, 이곳부터 펼쳐 보세요.</p><a class="button light" href="#guide">신입생을 위한 첫 안내서 ${icon('arrow', 18)}</a></div><span class="banner-number" aria-hidden="true">01</span></section>
  <section class="participation"><div>${icon('pen', 25)}<h2>당신이 아는 동산의 이야기를 더해주세요.</h2><p>작은 수정 하나도 다음 동산인에게는 큰 도움이 됩니다.</p></div>${suggestion ? `<a class="text-link" href="${e(suggestion)}" target="_blank" rel="noopener noreferrer">수정 제안하기 ${icon('arrow', 20)}</a>` : '<a class="text-link" href="#about">함께 기록하는 방법 알아보기 →</a>'}</section>`;
  const navigate = (cat, q, p = 0) => go(`#home?${new URLSearchParams({ category: cat, q, p })}`);
  $('#search').addEventListener('submit', event => { event.preventDefault(); navigate(category, new FormData(event.currentTarget).get('q')); });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.category, query)));
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => navigate('', button.dataset.query)));
  $('#prev')?.addEventListener('click', () => navigate(category, query, page - 1));
  $('#next')?.addEventListener('click', () => navigate(category, query, page + 1));
  if (filtering || page) $('#archive').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function infoView(name, content) {
  const guide = name === 'guide';
  content.className = 'wrap reading-content';
  content.innerHTML = `<a class="back-link" href="#home">← 위키로 돌아가기</a><article class="article info-article"><span class="eyebrow">${guide ? 'YOUR FIRST CHAPTER' : 'ABOUT THIS ARCHIVE'}</span><h1>${guide ? '처음의 동산을 위한<br>작은 길잡이.' : '우리의 오늘을,<br>다음 동산인에게.'}</h1><p class="article-intro">${guide ? '모든 것을 한 번에 알 필요는 없어요.<br>궁금한 이야기부터 하나씩 펼쳐 보세요.' : '학생이 기록하고, 공유하며, 이어가는 학교 정보 플랫폼.<br>안산동산고 디지털 위키를 소개합니다.'}</p>
  ${guide ? `<div class="info-steps">${categoryDetails.map(([cat, symbol, description, number]) => `<a href="#home?category=${encodeURIComponent(cat)}"><span>${number}</span>${icon(symbol, 26)}<div><h2>${cat}</h2><p>${description}</p></div><b>↗</b></a>`).join('')}</div><div class="notice">실제 학교생활에 관한 최종 안내는 학교의 공식 공지와 규정을 확인해 주세요. 위키는 학생들이 만드는 보조 안내서입니다.</div>` : `<div class="about-body"><h2>함께 만드는 학교의 기록실</h2><p>학교생활 정보, 동아리 소개, 학생 자치 활동, 신입생 가이드와 자주 묻는 질문을 모읍니다. 공식 홈페이지를 대체하기보다 학생들이 궁금해하는 정보를 찾기 쉽게 정리합니다.</p><h2>누구나 제안하고, 운영진이 확인합니다.</h2><p>일반 회원도 새 문서를 작성해 제출할 수 있습니다. 승인 전에는 작성자 본인과 관리자만 볼 수 있으며, 관리자가 승인하면 공개됩니다. 편집자와 관리자는 문서를 직접 게시·수정할 수 있습니다.</p><h2>우리의 기록이 지키는 세 가지</h2><div class="principles"><div><strong>01 사실</strong><p>확인 가능한 정보를 씁니다.</p></div><div><strong>02 출처</strong><p>정보가 온 곳을 남깁니다.</p></div><div><strong>03 존중</strong><p>타인의 개인정보를 보호합니다.</p></div></div>${suggestion ? `<a class="button primary" href="${e(suggestion)}" target="_blank" rel="noopener noreferrer">수정 제안하기 ↗</a>` : '<p class="muted">제안 접수 경로는 운영진이 연결하면 이곳에 표시됩니다.</p>'}<a class="text-link" href="#signup">동산위키에 함께하기 →</a></div>`}</article>`;
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
  <p class="muted">${signup ? '가입 후 인증 이메일의 링크를 눌러 주세요. 일반 회원의 제출 문서는 관리자 승인 후 공개됩니다.' : ''}</p>
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
        must(await client.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: returnUrl() } }));
        form.reset(); notify('가입 요청을 접수했습니다. 이메일 인증을 완료해 주세요. 메일이 없다면 스팸함이나 기존 가입 여부를 확인해 주세요.');
      } else if (forgot) {
        must(await client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() }));
        notify('해당 이메일로 가입되어 있다면 재설정 메일이 발송됩니다. 스팸함도 확인해 주세요.');
      } else if (reset) {
        must(await client.auth.updateUser({ password })); recovery = false;
        must(await client.auth.signOut()); session = null; profile = null; go('#login');
      } else {
        const data = must(await client.auth.signInWithPassword({ email, password }));
        session = data.session; await refreshProfile(); go('#home');
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
  content.innerHTML = `<div class="section-head"><a href="#home">← 전체 문서</a>${canEdit(profile) ? `<a class="button" href="#edit?id=${page.id}">문서 수정</a>` : ''}</div>
  <article class="article"><span class="tag">${e(page.category)}</span><h1>${e(page.title)}</h1><p class="muted">${client ? date(page.updated_at) + ' · 버전 ' + page.version : '디자인 미리보기용 예시 문서'}</p>
  <div class="body-text">${e(page.content)}</div><div class="source"><strong>출처</strong><br>${e(page.source || '출처가 등록되지 않았습니다.')}</div></article>
  <section><h2>수정 이력 <span class="muted">최근 50개</span></h2>${!client ? '<p class="muted">예시 문서에는 실제 수정 이력이 없습니다.</p>' : ''}${revisions.map(r => `<div class="history-item"><button data-revision="${r.id}">버전 ${r.version} 보기</button> ${e(r.editor_name)} <span class="muted">${date(r.created_at)}</span><div id="revision-${r.id}"></div></div>`).join('')}</section>`;
  document.querySelectorAll('[data-revision]').forEach(button => button.addEventListener('click', () => action(async () => {
    const revision = must(await client.from('revisions').select('title,content,source').eq('id', button.dataset.revision).single());
    if (token !== generation) return;
    const target = document.getElementById(`revision-${button.dataset.revision}`);
    target.innerHTML = `<details open><summary>${e(revision.title)}</summary><pre>${e(revision.content)}</pre><p>출처: ${e(revision.source)}</p></details>`;
  })));
}
async function editView(content, id, token) {
  if (!canEdit(profile)) { content.innerHTML = '<div class="notice">일반 회원은 새 문서를 작성해 승인 요청할 수 있습니다. 공개 문서의 직접 수정은 편집자부터 가능합니다.</div><a class="button primary" href="#submit">새 문서 작성·제출</a>'; return; }
  const page = id ? must(await client.from('pages').select('*').eq('id', id).single()) : { title: '', content: '', source: '', category: categories[0] };
  if (token !== generation) return;
  content.innerHTML = `<div class="section-head"><h2>${id ? '문서 수정' : '새 문서 작성'}</h2><a href="${id ? `#page?id=${id}` : '#home'}">취소</a></div>
  <div class="notice">사실에 기반해 작성하고 출처를 명시해 주세요. 실명·연락처 등 타인의 개인정보는 게시하지 마세요. 본문은 일반 텍스트로 표시됩니다.</div>
  <form id="edit-form" class="form"><label>문서 제목<input name="title" value="${e(page.title)}" required maxlength="120"></label>
  <label>분류<select name="category">${categories.map(c => `<option ${c === page.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label>본문<textarea name="content" required maxlength="50000">${e(page.content)}</textarea></label>
  <label>출처<input name="source" value="${e(page.source)}" required maxlength="2000" placeholder="자료명, 확인 날짜, 참고 URL 등"></label>
  <button class="primary">문서와 수정 이력 저장</button></form>`;
  $('#edit-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      const savedId = must(await client.rpc('save_page', { p_id: id || null, p_title: fields.get('title'), p_category: fields.get('category'), p_content: fields.get('content'), p_source: fields.get('source'), p_version: page.version || null }));
      go(`#page?id=${savedId}`);
    }, form);
  });
}
async function adminView(content, token) {
  if (profile?.role !== 'admin') { content.innerHTML = '<div class="notice">관리자만 접근할 수 있습니다.</div>'; return; }
  const members = must(await client.from('profiles').select('id,nickname,role,created_at').order('created_at', { ascending: false }).limit(500));
  if (token !== generation) return;
  content.innerHTML = `<h2>편집 권한 관리</h2><p class="muted">최근 가입 계정 500개 · 닉네임과 가입 시점을 확인한 뒤 운영진에게만 편집 권한을 부여하세요. 관리자 지정은 Supabase에서 진행합니다.</p>
  ${members.map(member => `<div class="member"><div><strong>${e(member.nickname)}</strong><br><span class="muted">${date(member.created_at)} · ${e(member.id)}</span></div>${member.role === 'admin' ? '<span class="tag">관리자</span>' : `<div class="actions"><select aria-label="${e(member.nickname)} 권한" id="role-${member.id}"><option value="reader" ${member.role === 'reader' ? 'selected' : ''}>일반 회원</option><option value="editor" ${member.role === 'editor' ? 'selected' : ''}>편집자</option></select><button data-member="${member.id}">적용</button></div>`}</div>`).join('')}`;
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
  const rows = must(await client.from('document_submissions').select('id,title,category,status,review_note,published_page_id,updated_at').eq('author_id', session.user.id).order('updated_at', { ascending: false }).limit(200));
  if (token !== generation) return;
  content.innerHTML = `<div class="section-head"><h2>내 제출 문서</h2><a class="button primary" href="#submit">새 문서 작성·제출</a></div><p class="muted">최근 200개 · 승인 전에는 본인과 관리자만 볼 수 있습니다. 편집 내용은 제출 버튼을 눌러야 저장됩니다.</p>${rows.length ? rows.map(row => `<article class="article"><span class="tag">${submissionStatuses[row.status]}</span><h2>${e(row.title)}</h2><p class="muted">${e(row.category)} · ${date(row.updated_at)}</p>${row.review_note ? `<p class="body-text">관리자 의견: ${e(row.review_note)}</p>` : ''}${row.status === 'approved' ? (row.published_page_id ? `<a class="button" href="#page?id=${row.published_page_id}">공개 문서 보기</a>` : '<p>공개 문서를 찾을 수 없습니다.</p>') : `<a class="button" href="#submit?id=${row.id}">${row.status === 'rejected' ? '수정 후 다시 제출' : '제출 내용 확인·수정'}</a>`}</article>`).join('') : '<div class="empty">아직 제출한 문서가 없습니다.</div>'}`;
}
async function submissionEditView(content, id, token) {
  if (!requireMember(content)) return;
  const row = id ? must(await client.from('document_submissions').select('*').eq('id', id).eq('author_id', session.user.id).single()) : { title: '', category: categories[0], content: '', source: '' };
  if (token !== generation) return;
  if (row.status === 'approved') { content.innerHTML = '<div class="notice">이미 승인된 문서입니다.</div><a href="#submissions">내 제출 문서로 돌아가기</a>'; return; }
  content.innerHTML = `<div class="section-head"><h2>${id ? '제출 문서 수정' : '새 문서 작성·제출'}</h2><a href="#submissions">내 제출 문서</a></div><div class="notice">관리자 승인 후 공개됩니다. 출처를 명시하고 타인의 실명·연락처 등 개인정보를 적지 마세요. 제출 전 입력 내용은 자동 저장되지 않습니다.</div>${row.review_note ? `<p class="body-text">관리자 의견: ${e(row.review_note)}</p>` : ''}<form id="submission-form" class="form"><label>문서 제목<input name="title" value="${e(row.title)}" required maxlength="120"></label><label>분류<select name="category">${categories.map(c => `<option ${c === row.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>본문<textarea name="content" required maxlength="50000">${e(row.content)}</textarea></label><label>출처<input name="source" value="${e(row.source)}" required maxlength="2000" placeholder="자료명, 확인 날짜, 참고 URL 등"></label><button class="primary">${id ? '수정 내용으로 다시 승인 요청' : '승인 요청하기'}</button></form>`;
  $('#submission-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      must(await client.rpc('submit_wiki_document', { p_id: id || null, p_title: fields.get('title'), p_category: fields.get('category'), p_content: fields.get('content'), p_source: fields.get('source') }));
      go('#submissions');
    }, form);
  });
}
async function reviewView(content, id, token) {
  if (profile?.role !== 'admin') { content.innerHTML = '<div class="notice">관리자만 심사할 수 있습니다.</div>'; return; }
  if (!id) {
    const rows = must(await client.from('document_submissions').select('id,title,category,author_name,updated_at').eq('status', 'pending').order('created_at').limit(200));
    if (token !== generation) return;
    content.innerHTML = `<h2>문서 승인</h2><p class="muted">승인 대기 중인 문서 · 오래된 요청부터 최대 200개</p>${rows.length ? rows.map(row => `<article class="article"><span class="tag">${e(row.category)}</span><h2>${e(row.title)}</h2><p>${e(row.author_name)} · ${date(row.updated_at)}</p><a class="button primary" href="#review?id=${row.id}">내용 확인·심사</a></article>`).join('') : '<div class="empty">승인 대기 문서가 없습니다.</div>'}`;
    return;
  }
  const row = must(await client.from('document_submissions').select('*').eq('id', id).single());
  if (token !== generation) return;
  content.className = 'wrap reading-content';
  content.innerHTML = `<a href="#review">← 승인 대기 목록</a><article class="article"><span class="tag">${submissionStatuses[row.status]} · ${e(row.category)}</span><h1>${e(row.title)}</h1><p class="muted">제출자: ${e(row.author_name)} · ${date(row.updated_at)}</p><div class="body-text">${e(row.content)}</div><div class="source"><strong>출처</strong><br>${e(row.source)}</div></article>${row.status === 'pending' ? '<div class="notice">승인하면 이 내용이 새 문서로 공개됩니다. 같은 제목의 공개 문서가 있으면 승인이 중단됩니다.</div><form id="review-form" class="form"><label>심사 의견 (선택)<textarea name="note" maxlength="2000" style="min-height:100px" placeholder="반려 시 보완할 점을 안내해 주세요"></textarea></label><div class="actions"><button class="primary" type="submit" value="approve">승인하고 공개</button><button type="submit" value="reject">반려하기</button></div></form>' : `<p class="body-text">관리자 의견: ${e(row.review_note || '없음')}</p>`}`;
  $('#review-form')?.addEventListener('submit', event => {
    event.preventDefault(); const approve = event.submitter?.value === 'approve';
    const form = event.currentTarget, fields = new FormData(form);
    action(async () => {
      must(await client.rpc('review_wiki_document', { p_id: row.id, p_approve: approve, p_note: fields.get('note'), p_expected_updated_at: row.updated_at }));
      go('#review');
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
    await render();
  } catch (error) { shell(); $('#content').innerHTML = '<div class="notice">계정 정보를 불러오지 못했습니다. Supabase SQL 설정을 확인한 뒤 새로고침해 주세요.</div>'; notify(friendly(error), true); }
}
boot();
