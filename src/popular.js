import {escapeHtml as e} from './core.js';
const RECEIPT_KEY = 'dongsan-wiki:account-view-receipts:v2:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoryReceipts = new Map();
const inFlight = new Map();
export function koreaViewDay(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
function receipts(day, userId) {
  let state = memoryReceipts.get(userId);
  try {
    const saved = JSON.parse(localStorage.getItem(RECEIPT_KEY + userId) || 'null');
    if (saved?.day === day && Array.isArray(saved.seen)) {
      state = { day, seen: saved.seen.filter(id => typeof id === 'string' && UUID.test(id)).slice(-5000) };
    }
  } catch {}
  if (state?.day !== day) state = { day, seen: [] };
  memoryReceipts.set(userId, state);
  return state;
}
export async function recordPageView(client, pageId) {
  if (!client || !UUID.test(pageId || '')) return;
  let userId;
  try {
    const result = await client.auth.getSession();
    if (result.error) return;
    userId = result.data?.session?.user?.id;
  } catch { return; }
  if (!UUID.test(userId || '')) return;
  const day = koreaViewDay();
  if (receipts(day, userId).seen.includes(pageId)) return;
  const flightKey = `${day}:${userId}:${pageId}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);
  const task = (async () => {
    const result = await client.rpc('record_wiki_page_view', { p_page_id: pageId });
    if (result.error) return;
    // The database uses the verified account, even if browser storage is cleared.
    const state = receipts(day, userId);
    if (!state.seen.includes(pageId)) state.seen.push(pageId);
    state.seen = state.seen.slice(-5000);
    try { localStorage.setItem(RECEIPT_KEY + userId, JSON.stringify(state)); } catch {}
  })().catch(() => {}).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, task);
  return task;
}
export async function renderPopularDocuments(client, container, newTab = false) {
  if (!container) return;
  const requestId = String(Number(container.dataset.requestId || 0) + 1);
  container.dataset.requestId = requestId;
  if (!client) { container.innerHTML = '<p class="muted">조회 순위는 실제 서비스에서 표시됩니다.</p>'; return; }
  try {
    const result = await client.rpc('popular_wiki_pages');
    if (result.error) throw result.error;
    if (!container.isConnected || container.dataset.requestId !== requestId) return;
    const rows = result.data || [];
    container.innerHTML = rows.length ? `<ol class="popular-list">${rows.map((row, index) => `<li><a href="#page?id=${encodeURIComponent(row.id)}" ${newTab ? 'target="_blank" rel="noopener noreferrer"' : ''}><span class="popular-number">${index + 1}</span><span class="popular-info"><strong>${e(row.title)}</strong><small>${e(row.category)} · ${Number(row.views).toLocaleString('ko-KR')}회</small></span></a></li>`).join('')}</ol>` : '<p class="popular-empty">아직 조회 기록이 없습니다.<br>문서를 읽으면 순위가 쌓여요.</p>';
  } catch {
    if (container.isConnected && container.dataset.requestId === requestId) container.innerHTML = '<p class="muted">조회 순위를 불러오지 못했습니다.</p>';
  }
}
