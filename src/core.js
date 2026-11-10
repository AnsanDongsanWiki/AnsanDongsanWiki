export const categories = ['학교소개', '학교생활', '동아리', '학생회', 'FAQ', '급식', '기타', '교육과정', '입결'];
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function canEdit(profile) { return ['editor', 'admin'].includes(profile?.role); }
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
export function validatePassword(password) {
  if (password.length < 12 || password.length > 128) throw new Error('비밀번호는 12~128자로 입력해 주세요.');
}

// Convert plain HTTP(S) addresses to links while preserving escaped document text.
export function linkifyText(value = '') {
  const text = String(value);
  const pattern = /https?:\/\/[^\s<>"'`\u0000-\u001f\u007f]+/gi;
  let output = '', cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const pairs = { ')': '(', ']': '[', '}': '{' };
    const counts = { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 };
    for (const char of raw) if (Object.hasOwn(counts, char)) counts[char]++;
    let end = raw.length;
    // Leave sentence punctuation outside the link; retain balanced URL parentheses.
    while (end) {
      const last = raw[end - 1], opener = pairs[last];
      if (/[.,!?;:，。！？；：、…]/.test(last)) { end--; continue; }
      if (opener && counts[last] > counts[opener]) { counts[last]--; end--; continue; }
      break;
    }
    const address = raw.slice(0, end);
    output += escapeHtml(text.slice(cursor, match.index));
    const href = safeUrl(address);
    output += href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer ugc">${escapeHtml(address)}</a>` : escapeHtml(address);
    output += escapeHtml(match[0].slice(address.length));
    cursor = match.index + match[0].length;
  }
  return output + escapeHtml(text.slice(cursor));
}
