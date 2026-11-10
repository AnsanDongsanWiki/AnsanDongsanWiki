import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkifyText} from '../src/core.js';
test('본문의 HTTP(S) 주소만 링크로 변환하고 줄바꿈·한글을 유지',()=>{
 const html=linkifyText('학교 안내\nhttps://example.com/info\n참고 http://school.example/path');
 assert.equal((html.match(/<a /g)||[]).length,2);
 assert(html.startsWith('학교 안내\n'));assert(html.includes('</a>\n참고 '));
 assert(html.includes('target="_blank" rel="noopener noreferrer ugc"'));
 assert.equal(linkifyText('javascript:alert(1) data:text/html,test mailto:a@example.com'),'javascript:alert(1) data:text/html,test mailto:a@example.com');
});
test('HTML·속성 삽입을 실행하지 않고 주소의 따옴표·쿼리를 이스케이프',()=>{
 const html=linkifyText('<img src=x onerror=alert(1)> https://example.com/?a=1&b=2" onclick="alert(1)');
 assert(!html.includes('<img'));assert(html.startsWith('&lt;img'));
 assert(html.includes('href="https://example.com/?a=1&amp;b=2"'));
 assert(!/<a[^>]*\sonclick=/.test(html));
 assert(html.includes('&quot; onclick=&quot;alert(1)'));
});
test('문장 끝 구두점과 바깥 괄호는 링크에서 제외하며 URL 내부 괄호는 유지',()=>{
 const html=linkifyText('(https://example.com/wiki/Topic_(test)). https://example.com/path, 다음');
 assert(html.includes('href="https://example.com/wiki/Topic_(test)"'));
 assert(html.includes('</a>). '));assert(html.includes('href="https://example.com/path"'));assert(html.endsWith('</a>, 다음'));
});
test('잘못된 주소·평문·긴 괄호 입력도 원문을 안전하게 보존',()=>{
 assert.equal(linkifyText('안내 <b>예시</b>'),'안내 &lt;b&gt;예시&lt;/b&gt;');
 assert.equal(linkifyText('https://'),'https://');
 const suffix=')'.repeat(20000);
 const html=linkifyText('https://example.com/'+suffix);
 assert(html.endsWith('</a>'+suffix));
 assert.equal((html.match(/<a /g)||[]).length,1);
});
