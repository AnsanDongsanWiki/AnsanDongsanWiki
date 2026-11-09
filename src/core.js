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
