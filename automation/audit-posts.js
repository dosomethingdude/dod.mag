const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('posts.json', 'utf8'));

// 허구 출처 기관명 — URL 없이 특정 보고서/연구로 인용되면 가상
const fakeSrcKeywords = [
  'McKinsey', 'Gartner', 'Statista', 'Forrester', 'Kantar', 'Nielsen',
  'Interbrand', 'Pew Research', 'Bloomberg Intelligence', 'IDC', 'eMarketer',
  'Deloitte', 'PwC', 'KPMG', 'Reuters Institute',
  'Investment Company Institute', 'Euromonitor', 'Ipsos', 'GfK', 'Mintel',
  'Accenture', 'Boston Consulting', 'Morgan Stanley', 'Goldman Sachs', 'JP Morgan',
  '한국경제연구원', '한국개발연구원', '삼성경제연구소', '현대경제연구원',
  'KB경영연구소', '우리금융경영연구소',
];

// 본문 내 가상 수치/연구 인용 패턴
const fakeCitationPatterns = [
  /보고서에\s*따르면/,
  /연구에\s*따르면/,
  /조사에\s*따르면/,
  /분석에\s*따르면/,
  /리포트에\s*따르면/,
  /설문\s*(조사|결과).*[%명]/,
  /응답자의\s*\d+%/,
  /\d+명을\s*(대상으로|조사한)/,
  /보고서.*발표한/,
  /저널.*발표/,
  /학술지.*게재/,
  /보고서.*밝혔/,
];

// sources 배열에 가상 기관 (URL 없이) 존재 여부
function sourcesHaveFakeOrg(sources) {
  return (sources || []).some(s => {
    const hasUrl = /https?:\/\/|www\./.test(s);
    if (hasUrl) return false;
    return fakeSrcKeywords.some(kw => s.includes(kw));
  });
}

// 본문에 가상 기관명이 특정 보고서/조사 맥락으로 사용되는지
// (단순 브랜드 언급이 아닌, "X 보고서에 따르면", "X 조사 결과" 처럼)
function contentHasFakeOrgCitation(content) {
  return fakeSrcKeywords.some(kw => {
    if (!content.includes(kw)) return false;
    // 해당 기관명이 통계/보고서 맥락으로 사용
    const idx = content.indexOf(kw);
    const surrounding = content.substring(Math.max(0, idx - 10), idx + kw.length + 40);
    return /(보고서|리포트|조사|연구|발표|분석|수치|통계|결과)/.test(surrounding);
  });
}

// 본문에 검증 불가한 수치 인용이 있는지
function contentHasFakeCitation(content) {
  return fakeCitationPatterns.some(pat => pat.test(content));
}

const toDelete = [];

posts.forEach(a => {
  const content = a.content || '';
  const sources = a.sources || [];
  const reasons = [];

  if (sourcesHaveFakeOrg(sources)) reasons.push('sources가상기관');
  if (contentHasFakeOrgCitation(content)) reasons.push('본문가상기관인용');
  if (contentHasFakeCitation(content)) reasons.push('수치미출처');

  if (reasons.length > 0) {
    toDelete.push({ id: a.id, title: a.title.substring(0, 42), reasons: [...new Set(reasons)] });
  }
});

toDelete.sort((a, b) => b.id - a.id);

console.log('=== 삭제 대상 (' + toDelete.length + '개) ===');
toDelete.forEach(d => console.log(`ID ${String(d.id).padStart(3)} | [${d.reasons.join('+')}] | ${d.title}`));
console.log(`\n총 ${posts.length}개 → 삭제: ${toDelete.length}개 / 유지: ${posts.length - toDelete.length}개`);

fs.writeFileSync('/tmp/delete_ids.json', JSON.stringify(toDelete.map(d => d.id)));
