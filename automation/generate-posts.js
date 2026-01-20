/**
 * dod.mag 자동 글 생성 스크립트
 * GitHub Actions에서 실행되어 Claude API로 글을 생성합니다.
 */

const fs = require('fs');
const https = require('https');
const { parseString } = require('xml2js');

// 설정
const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  TRENDS_RSS_URL: 'https://trends.google.co.kr/trending/rss?geo=KR',
  POSTS_FILE: 'posts.json',
  CATEGORIES: ['인사이트', '신상품', '라이프', '브랜드'],
  CATEGORY_EN: {
    '인사이트': 'insights',
    '신상품': 'products',
    '라이프': 'life',
    '브랜드': 'brands'
  }
};

// HTTP GET 요청
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// HTTP POST 요청 (Claude API용)
function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Google Trends RSS에서 트렌드 키워드 가져오기
async function fetchTrendKeywords() {
  console.log('Fetching trend keywords from Google Trends...');

  const xml = await httpGet(CONFIG.TRENDS_RSS_URL);

  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      const items = result?.rss?.channel?.[0]?.item || [];
      const keywords = items.slice(0, 20).map(item => item.title?.[0] || '').filter(Boolean);

      console.log(`Found ${keywords.length} trend keywords`);
      resolve(keywords);
    });
  });
}

// Claude API로 카테고리에 맞는 키워드 선택
async function selectKeywordForCategory(keywords, category) {
  console.log(`Selecting keyword for category: ${category}`);

  const prompt = `당신은 프리미엄 라이프스타일 매거진 "dod.mag"의 편집장입니다.

아래 트렌드 키워드 목록에서 "${category}" 카테고리에 가장 적합한 키워드 1개를 선택하세요.

카테고리별 특성:
- 인사이트: 라이프 트렌드, 사회 현상 분석, 세대 특성
- 신상품: 삶의 질 향상 제품, IT 가젯, 뷰티/패션 아이템
- 라이프: 웰빙, 건강, 자기관리, 일상 습관
- 브랜드: 브랜드 스토리, 기업 철학, 지속가능성

트렌드 키워드 목록:
${keywords.join('\n')}

반드시 아래 형식으로만 응답하세요:
KEYWORD: [선택한 키워드]`;

  const response = await callClaudeAPI(prompt);
  const match = response.match(/KEYWORD:\s*(.+)/);

  if (match) {
    const keyword = match[1].trim();
    console.log(`Selected keyword: ${keyword}`);
    return keyword;
  }

  // 매칭 실패시 첫 번째 키워드 반환
  return keywords[0];
}

// Claude API로 글 생성
async function generateArticle(keyword, category) {
  console.log(`Generating article for keyword: ${keyword}, category: ${category}`);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDate = today.getDate();

  const prompt = `당신은 프리미엄 라이프스타일 매거진 "dod.mag"의 에디터입니다.
Vogue, Elle 같은 세련된 매거진 스타일로 글을 작성합니다.

**[필수] 오늘 날짜: ${currentYear}년 ${currentMonth}월 ${currentDate}일**

주제: "${keyword}"
카테고리: ${category}

글쓰기 규칙:
1. 톤앤매너: 세련되고 깊이 있는 문체, 친근하지만 전문적
2. 독자를 "당신"으로 호칭 (친밀하지만 격식 있게)
3. 명령형보다 제안형 사용 ("~해보세요" vs "~하세요")
4. 과장된 표현 지양, 담백하고 세련된 문체
5. 구체적인 데이터나 사례 인용
6. 반드시 참고자료(출처) 포함

**[필수] 날짜 검증 규칙:**
- 제목과 본문에 연도를 언급할 때 반드시 ${currentYear}년 기준으로 작성
- 과거 연도(2024년, 2025년 등)의 정보를 현재 시점인 것처럼 작성 금지
- "올해", "최근" 등의 표현은 ${currentYear}년을 의미
- 통계나 데이터 인용 시 ${currentYear}년 또는 ${currentYear - 1}년 자료 사용
- 트렌드 키워드가 과거 이벤트라면, ${currentYear}년 관점에서 재해석하여 작성

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "title": "제목 (25-35자, 클릭 유도하되 낚시성 지양, ${currentYear}년 기준)",
  "title_en": "English title",
  "summary": "요약 (100자 내외, 핵심 메시지 함축)",
  "summary_en": "English summary",
  "content": "본문 (2000-2500자, 인트로-현상-분석-실천방안-클로징 구조, 마지막에 참고자료 섹션 포함, 모든 연도는 ${currentYear}년 기준)",
  "content_en": "English content (shortened version)",
  "sources": ["출처1", "출처2"]
}`;

  const response = await callClaudeAPI(prompt);

  // JSON 추출
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse article JSON:', e.message);
      throw new Error('Article generation failed');
    }
  }

  throw new Error('No valid JSON in response');
}

// Claude API 호출
async function callClaudeAPI(prompt) {
  const url = 'https://api.anthropic.com/v1/messages';

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': CONFIG.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  const response = await httpPost(url, body, headers);

  if (response.error) {
    throw new Error(`Claude API error: ${response.error.message}`);
  }

  const text = response.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Claude API');
  }

  return text;
}

// 오늘 날짜 포맷
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

// 다음 ID 계산
function getNextId(posts) {
  if (posts.length === 0) return 1;
  return Math.max(...posts.map(p => p.id)) + 1;
}

// 카테고리 로테이션 (날짜 기반)
function getCategoryForToday() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  return CONFIG.CATEGORIES[dayOfYear % CONFIG.CATEGORIES.length];
}

// 메인 함수
async function main() {
  console.log('=== dod.mag Auto Post Generator ===');
  console.log(`Date: ${getTodayDate()}`);

  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  try {
    // 1. 트렌드 키워드 가져오기
    const keywords = await fetchTrendKeywords();

    if (keywords.length === 0) {
      console.log('No trend keywords found. Exiting.');
      return;
    }

    // 2. 오늘의 카테고리 선택
    const category = getCategoryForToday();
    console.log(`Today's category: ${category}`);

    // 3. 카테고리에 맞는 키워드 선택
    const selectedKeyword = await selectKeywordForCategory(keywords, category);

    // 4. 글 생성
    const article = await generateArticle(selectedKeyword, category);

    // 5. posts.json 읽기
    let posts = [];
    if (fs.existsSync(CONFIG.POSTS_FILE)) {
      posts = JSON.parse(fs.readFileSync(CONFIG.POSTS_FILE, 'utf8'));
    }

    // 6. 새 게시글 추가
    const newPost = {
      id: getNextId(posts),
      category: category,
      title: article.title,
      title_en: article.title_en,
      summary: article.summary,
      summary_en: article.summary_en,
      content: article.content,
      content_en: article.content_en,
      date: getTodayDate(),
      image: getDefaultImage(category),
      sources: article.sources || []
    };

    // 배열 맨 앞에 추가 (최신 글이 위로)
    posts.unshift(newPost);

    // 7. posts.json 저장
    fs.writeFileSync(CONFIG.POSTS_FILE, JSON.stringify(posts, null, 4), 'utf8');

    console.log('=== Post Generated Successfully ===');
    console.log(`Title: ${newPost.title}`);
    console.log(`Category: ${newPost.category}`);
    console.log(`ID: ${newPost.id}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 카테고리별 기본 이미지
function getDefaultImage(category) {
  const images = {
    '인사이트': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80',
    '신상품': 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1200&q=80',
    '라이프': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&q=80',
    '브랜드': 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80'
  };
  return images[category] || images['인사이트'];
}

// 실행
main();
