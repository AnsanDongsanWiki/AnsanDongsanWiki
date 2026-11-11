export function icon(name, size = 22) {
 const paths = {
  search:'<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  book:'<path d="M12 6c-3-2-7-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-3-1-7-1-10 1zm0 0v14"/>',
  school:'<path d="M3 21V9l9-6 9 6v12H3zm6 0v-6h6v6M7 10h1m8 0h1M7 13h1m8 0h1M12 3V1"/>',
  life:'<path d="M6 21V5h12v16M3 21h18M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5"/>',
  club:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/>',
  council:'<path d="M8 10V4h8v6M5 10h14v11H5zM9 14h6m-5 4h4M3 21h18"/>',
  faq:'<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0zM9 8a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.2"/>',
  meal:'<path d="M4 2v6a3 3 0 0 0 6 0V2M7 2v20M20 22V2c-4 2-5 6-5 10h5"/>',
  other:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  curriculum:'<path d="M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3M3 18a3 3 0 0 1 3-3h14M8 7h8m-8 4h6"/>',
  admissions:'<path d="m2 8 10-5 10 5-10 5L2 8zm4 2v6c4 3 8 3 12 0v-6m4-2v9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf:'<path d="M12 22V9m0 7C2 17 1 10 2 6c6-1 10 3 10 10zm0-5c0-7 4-10 10-10 1 6-3 11-10 10z"/>',
  pen:'<path d="m15 3 6 6M4 15 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-7 2 2-7z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 };
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}
export const categoryDetails = [
 ['학교소개', 'school', '동산을 알아가는 첫 페이지', '01'],
 ['학교생활', 'life', '하루를 채우는 작은 정보들', '02'],
 ['동아리', 'club', '취향이 모여 만드는 이야기', '03'],
 ['학생회', 'council', '우리가 함께 만드는 학교', '04'],
 ['급식', 'meal', '오늘의 식단과 급식 안내', '05'],
 ['기타', 'other', '함께 나누는 다양한 기록', '06'],
];
export const previewPages = [
 ['first-steps', '학교생활, 어디서부터 알아볼까요?', '학교생활', '새로운 학교생활을 시작하는 동산인을 위한 안내서.'],
 ['dormitory', '기숙사 생활 안내', '학교생활', '입사 준비부터 공동생활까지, 확인할 정보를 모읍니다.'],
 ['clubs', '나에게 맞는 동아리 찾기', '동아리', '관심 있는 활동과 동아리를 차근차근 알아보세요.'],
 ['campus', '학교 시설 한눈에 보기', '학교소개', '교실 밖 학교의 공간을 소개하는 페이지입니다.'],
 ['council', '학생회와 함께하는 학교', '학생회', '학생 자치 활동과 행사의 기록을 모읍니다.'],
 ['questions', '신입생이 자주 묻는 질문', '기타', '처음이라 궁금한 것들을 한곳에서 찾아보세요.'],
].map(([id, title, category, description]) => ({id, title, category, description, version: 1,
 content: `${description}\n\n이 페이지는 디자인 미리보기를 위한 예시 문서입니다. 실제 학교 규정이나 확정된 안내를 담고 있지 않습니다.\n\n이곳에 담을 내용\n\n운영진이 학교의 공식 안내와 확인 가능한 자료를 바탕으로 내용을 작성합니다. 필요한 준비, 자주 묻는 질문, 관련 자료를 순서대로 정리할 예정입니다.\n\n기록에 참여하는 방법\n\n새로운 정보나 수정할 내용이 있다면 운영진에게 제안해 주세요. 사실과 출처를 확인한 뒤 문서에 반영합니다.\n\n다음 동산인에게도 도움이 되는 기록을 함께 쌓아갑니다.`,
 source: '디자인 미리보기용 예시 · 실제 학교 정보는 운영진 검토 후 게시', updated_at: '2026-11-09T00:00:00Z'
}));
