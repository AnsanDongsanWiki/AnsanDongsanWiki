import { escapeHtml as e } from './core.js';
export const ATTACHMENT_BUCKET = 'dongsan-wiki-files';
export const MAX_ATTACHMENTS = 8;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const attachmentTypes = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip',
};
const objectUrls = new Set();
const must = result => { if (result.error) throw result.error; return result.data; };
const sizeLabel = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function objectUrl(blob) { const url = URL.createObjectURL(blob); objectUrls.add(url); return url; }
export function releaseAttachmentUrls() { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); }
export async function validateAttachmentFile(file) {
  if (!file.name || file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name)) throw new Error('파일 이름을 확인해 주세요. (180자 이내)');
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: 파일당 10MB 이하의 비어 있지 않은 파일만 첨부할 수 있습니다.`);
  const ext = file.name.split('.').pop().toLowerCase();
  const mime = attachmentTypes[ext];
  if (!mime) throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const begins = (...signature) => signature.every((v, i) => bytes[i] === v);
  const text = String.fromCharCode(...bytes);
  const valid = mime === 'image/jpeg' ? begins(255, 216, 255)
    : mime === 'image/png' ? begins(137, 80, 78, 71, 13, 10, 26, 10)
    : mime === 'image/gif' ? /^GIF8[79]a/.test(text)
    : mime === 'image/webp' ? text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP'
    : mime === 'application/pdf' ? text.startsWith('%PDF-')
    : ['docx', 'xlsx', 'pptx', 'zip'].includes(ext) ? begins(80, 75)
    : true;
  if (!valid) throw new Error(`${file.name}: 파일 내용과 확장자가 맞지 않습니다.`);
  return mime;
}
async function loadMetadata(client, ids = []) {
  if (!ids.length) return [];
  const rows = must(await client.from('wiki_attachments').select('id,object_path,file_name,mime_type,size_bytes').in('id', ids));
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.map(id => {
    if (!byId.has(id)) throw new Error('첨부 파일 정보를 읽을 수 없습니다. 권한 또는 파일 상태를 확인해 주세요.');
    return byId.get(id);
  });
}
async function download(client, row) {
  const blob = must(await client.storage.from(ATTACHMENT_BUCKET).download(row.object_path));
  return new Blob([blob], { type: row.mime_type });
}
export async function renderAttachments(client, container, ids = []) {
  if (!container || !client || !ids.length) return;
  container.innerHTML = '<p class="muted">첨부 파일을 불러오는 중…</p>';
  let rows;
  try { rows = await loadMetadata(client, ids); }
  catch (error) { if (container.isConnected) container.textContent = error.message || '첨부 파일을 불러오지 못했습니다.'; return; }
  if (!container.isConnected) return;
  container.innerHTML = `<h2>사진·첨부 파일 <span class="muted">${rows.length}</span></h2><div class="attachment-gallery"></div>`;
  const gallery = container.querySelector('.attachment-gallery');
  const jobs = rows.map(async row => {
    const card = document.createElement('figure'); card.className = 'attachment-card';
    card.innerHTML = `<figcaption><strong>${e(row.file_name)}</strong><span class="muted">${sizeLabel(row.size_bytes)}</span></figcaption><div class="attachment-preview"></div><button type="button">다운로드</button><p class="muted attachment-message" role="status"></p>`;
    gallery.append(card);
    const preview = card.querySelector('.attachment-preview');
    const message = card.querySelector('.attachment-message');
    let cached = null;
    const fetchBlob = async () => { if (!cached) cached = await download(client, row); return cached; };
    const button = card.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true; message.textContent = '파일을 불러오는 중…';
      try {
        const blob = await fetchBlob(); if (!card.isConnected) return;
        const anchor = document.createElement('a'); anchor.href = objectUrl(blob); anchor.download = row.file_name;
        document.body.append(anchor); anchor.click(); anchor.remove(); message.textContent = '';
      } catch { if (card.isConnected) message.textContent = '다운로드하지 못했습니다. 다시 시도해 주세요.'; }
      finally { button.disabled = false; }
    });
    if (row.mime_type.startsWith('image/')) {
      try {
        const blob = await fetchBlob(); if (!card.isConnected) return;
        const img = document.createElement('img'); img.src = objectUrl(blob); img.alt = row.file_name; img.loading = 'lazy';
        preview.append(img);
      } catch { if (card.isConnected) message.textContent = '사진을 불러오지 못했습니다. 다운로드 버튼으로 다시 시도해 주세요.'; }
    }
  });
  await Promise.allSettled(jobs);
}
export async function mountAttachmentEditor(client, container, ids = []) {
  const initial = await loadMetadata(client, ids);
  const items = initial.map(row => ({ ...row, file: null }));
  let locked = false, validation = Promise.resolve();
  container.innerHTML = `<fieldset class="attachment-editor"><legend>사진·파일 첨부</legend><p class="muted">문서당 8개 · 파일당 10MB · 회원당 24시간에 50개<br>JPG, PNG, WEBP, GIF, PDF, TXT, CSV, DOCX, XLSX, PPTX, ZIP<br>파일은 저장·승인 요청 버튼을 누를 때 업로드됩니다. 일반 회원의 첨부는 승인 후 공개됩니다.</p><label>첨부할 파일 선택<input type="file" multiple accept="${Object.keys(attachmentTypes).map(ext => `.${ext}`).join(',')}"></label><div class="attachment-edit-list"></div><p class="attachment-editor-message muted" role="status"></p></fieldset>`;
  const fieldset = container.querySelector('fieldset');
  const input = container.querySelector('input');
  const list = container.querySelector('.attachment-edit-list');
  const message = container.querySelector('.attachment-editor-message');
  function paint() {
    list.replaceChildren();
    items.forEach((item, index) => {
      const entry = document.createElement('div'); entry.className = 'attachment-edit-item';
      entry.innerHTML = `<span>${e(item.file_name)} <small class="muted">${sizeLabel(item.size_bytes)} · ${item.id ? '업로드됨' : '선택됨'}</small></span><button type="button" ${locked ? 'disabled' : ''}>목록에서 빼기</button>`;
      entry.querySelector('button').addEventListener('click', () => { if (locked) return; items.splice(index, 1); paint(); });
      list.append(entry);
    });
  }
  input.addEventListener('change', () => {
    if (locked) return;
    const selected = [...input.files]; input.value = '';
    validation = validation.then(async () => {
      const errors = [];
      for (const file of selected) {
        try {
          if (items.length >= MAX_ATTACHMENTS) throw new Error('첨부 파일은 문서당 최대 8개입니다.');
          const mime = await validateAttachmentFile(file);
          items.push({ file, file_name: file.name, mime_type: mime, size_bytes: file.size });
        } catch (error) { errors.push(error.message); }
      }
      paint(); message.textContent = errors.join(' ');
    });
  });
  paint();
  return {
    async save(saveFn) {
      await validation;
      if (locked) throw new Error('파일을 업로드하고 있습니다. 잠시 기다려 주세요.');
      locked = true; fieldset.disabled = true;
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.file) continue;
          message.textContent = `첨부 파일 업로드 중 (${i + 1}/${items.length})…`;
          const reservation = must(await client.rpc('reserve_wiki_attachment', { p_name: item.file_name, p_size: item.size_bytes }));
          const row = Array.isArray(reservation) ? reservation[0] : reservation;
          if (!row?.id || !row.object_path) throw new Error('업로드 준비에 실패했습니다. 다시 시도해 주세요.');
          must(await client.storage.from(ATTACHMENT_BUCKET).upload(row.object_path, item.file, { contentType: row.mime_type, upsert: false, cacheControl: '0' }));
          Object.assign(item, row, { file: null });
        }
        paint(); message.textContent = '첨부 파일 업로드 완료. 문서를 저장하고 있습니다…';
        const result = await saveFn(items.map(item => item.id));
        message.textContent = ''; return result;
      } catch (error) { message.textContent = '저장하지 못했습니다. 이 화면에서 다시 시도하면 완료된 파일은 재사용됩니다.'; throw error; }
      finally { locked = false; fieldset.disabled = false; paint(); }
    },
  };
}
