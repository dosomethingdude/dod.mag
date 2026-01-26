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
  // 글로벌 트렌드 RSS (한국 + 미국)
  TRENDS_RSS_URLS: [
    'https://trends.google.co.kr/trending/rss?geo=KR',
    'https://trends.google.com/trending/rss?geo=US'
  ],
  POSTS_FILE: 'posts.json',
  CATEGORIES: ['인사이트', '신상품', '라이프', '브랜드'],
  CATEGORY_EN: {
    '인사이트': 'insights',
    '신상품': 'products',
    '라이프': 'life',
    '브랜드': 'brands'
  },
  POSTS_PER_DAY: 3,  // 하루 3개 글 생성
  AI_DISCLAIMER: '\n\n---\n* 이 포스팅은 AI어시스턴트와 협업하여 제작되었으며, 에디터의 편집을 통해 완성되었습니다.'
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

// Google Trends RSS에서 글로벌 트렌드 키워드 가져오기 (한국 + 미국)
async function fetchTrendKeywords() {
  console.log('Fetching global trend keywords from Google Trends (KR + US)...');

  const allKeywords = [];

  for (const url of CONFIG.TRENDS_RSS_URLS) {
    try {
      const xml = await httpGet(url);
      const keywords = await new Promise((resolve, reject) => {
        parseString(xml, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          const items = result?.rss?.channel?.[0]?.item || [];
          resolve(items.slice(0, 15).map(item => item.title?.[0] || '').filter(Boolean));
        });
      });
      allKeywords.push(...keywords);
      console.log(`Found ${keywords.length} keywords from ${url}`);
    } catch (error) {
      console.log(`Warning: Failed to fetch from ${url}: ${error.message}`);
    }
  }

  // 중복 제거
  const uniqueKeywords = [...new Set(allKeywords)];
  console.log(`Total unique keywords: ${uniqueKeywords.length}`);
  return uniqueKeywords;
}

// Claude API로 카테고리에 맞는 키워드 3개 선택 (하루 3개 글용)
async function selectKeywordsForCategories(keywords, categories) {
  console.log(`Selecting ${categories.length} keywords for categories: ${categories.join(', ')}`);

  const prompt = `당신은 프리미엄 라이프스타일 매거진 "dod.mag"의 편집장입니다.

아래 트렌드 키워드 목록에서 각 카테고리에 가장 적합한 키워드를 1개씩 선택하세요.
단, 같은 키워드를 중복 선택하지 마세요.

카테고리별 특성:
- 인사이트: 라이프 트렌드, 사회 현상 분석, 세대 특성
- 신상품: 삶의 질 향상 제품, IT 가젯, 뷰티/패션 아이템
- 라이프: 웰빙, 건강, 자기관리, 일상 습관
- 브랜드: 브랜드 스토리, 기업 철학, 지속가능성

선택할 카테고리: ${categories.join(', ')}

트렌드 키워드 목록:
${keywords.join('\n')}

반드시 아래 형식으로만 응답하세요 (각 카테고리에 대해):
${categories.map(cat => `${cat}: [선택한 키워드]`).join('\n')}`;

  const response = await callClaudeAPI(prompt);
  const results = [];

  for (const category of categories) {
    const regex = new RegExp(`${category}:\\s*(.+)`);
    const match = response.match(regex);
    if (match) {
      results.push({ category, keyword: match[1].trim() });
    } else {
      // 매칭 실패시 랜덤 키워드 사용
      const randomIdx = Math.floor(Math.random() * keywords.length);
      results.push({ category, keyword: keywords[randomIdx] });
    }
  }

  console.log('Selected keywords:', results);
  return results;
}

// Claude API로 글 생성 (팩트체크 강화 + 허위사실 방지)
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

**[중요] 팩트체크 및 허위사실 방지 규칙:**
- 확인되지 않은 정보, 추측, 루머는 절대 작성하지 마세요
- 구체적인 수치(가격, 매출, 시장규모 등)는 공식 발표된 자료만 인용하세요
- 인용할 수 있는 공신력 있는 출처가 없으면 해당 정보는 생략하세요
- "~로 알려졌다", "~라고 한다" 같은 불확실한 표현 대신 출처를 명시하세요
- 존재하지 않는 브랜드, 제품, 이벤트를 만들어내지 마세요
- 실제 기업/인물에 대한 허위 정보를 작성하지 마세요

**[필수] 출처 형식:**
- 실제 존재하는 공식 기관, 언론사, 기업의 공식 발표만 출처로 사용
- "~리포트", "~조사" 등 가상의 출처를 만들지 마세요
- 출처 URL을 알고 있다면 포함하세요

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "title": "제목 (25-35자, 클릭 유도하되 낚시성 지양, ${currentYear}년 기준)",
  "title_en": "English title",
  "summary": "요약 (100자 내외, 핵심 메시지 함축)",
  "summary_en": "English summary",
  "content": "본문 (2000-2500자, 인트로-현상-분석-실천방안-클로징 구조, 마지막에 참고자료 섹션 포함, 모든 연도는 ${currentYear}년 기준)",
  "content_en": "English content (shortened version)",
  "sources": ["출처1 (URL 포함 권장)", "출처2"]
}`;

  const response = await callClaudeAPI(prompt);

  // JSON 추출
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const article = JSON.parse(jsonMatch[0]);
      // AI 협업 안내문구 추가
      article.content += CONFIG.AI_DISCLAIMER;
      article.content_en += '\n\n---\n* This article was created in collaboration with an AI assistant and finalized through editorial review.';
      return article;
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

// 오늘의 카테고리 3개 선택 (로테이션 기반)
function getCategoriesForToday() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const categories = [];
  for (let i = 0; i < CONFIG.POSTS_PER_DAY; i++) {
    const idx = (dayOfYear + i) % CONFIG.CATEGORIES.length;
    categories.push(CONFIG.CATEGORIES[idx]);
  }
  return categories;
}

// 메인 함수 - 하루 3개 글 생성
async function main() {
  console.log('=== dod.mag Auto Post Generator ===');
  console.log(`Date: ${getTodayDate()}`);
  console.log(`Posts per day: ${CONFIG.POSTS_PER_DAY}`);

  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  try {
    // 1. 글로벌 트렌드 키워드 가져오기 (한국 + 미국)
    const keywords = await fetchTrendKeywords();

    if (keywords.length === 0) {
      console.log('No trend keywords found. Exiting.');
      return;
    }

    // 2. posts.json 읽기
    let posts = [];
    if (fs.existsSync(CONFIG.POSTS_FILE)) {
      posts = JSON.parse(fs.readFileSync(CONFIG.POSTS_FILE, 'utf8'));
    }

    // 3. 오늘의 카테고리 3개 선택
    const categories = getCategoriesForToday();
    console.log(`Today's categories: ${categories.join(', ')}`);

    // 4. 카테고리에 맞는 키워드 3개 선택 (1번의 API 호출로 효율화)
    const keywordSelections = await selectKeywordsForCategories(keywords, categories);

    // 5. 각 키워드에 대해 글 생성
    const newPosts = [];
    for (const { category, keyword } of keywordSelections) {
      console.log(`\n--- Generating article ${newPosts.length + 1}/${CONFIG.POSTS_PER_DAY} ---`);

      const article = await generateArticle(keyword, category);

      const newPost = {
        id: getNextId([...posts, ...newPosts]),
        category: category,
        title: article.title,
        title_en: article.title_en,
        summary: article.summary,
        summary_en: article.summary_en,
        content: article.content,
        content_en: article.content_en,
        date: getTodayDate(),
        image: getDefaultImage(category, [...posts, ...newPosts]),
        sources: article.sources || [],
        admin_locked: false  // 관리자 수정 우선권 플래그 (false = 자동 업데이트 가능)
      };

      newPosts.push(newPost);
      console.log(`Generated: ${newPost.title}`);
    }

    // 6. 관리자 잠금된 게시글 보호 (admin_locked: true인 게시글은 덮어쓰지 않음)
    const lockedIds = posts.filter(p => p.admin_locked === true).map(p => p.id);
    if (lockedIds.length > 0) {
      console.log(`\nProtected admin-locked posts: ${lockedIds.join(', ')}`);
    }

    // 7. 새 게시글을 맨 앞에 추가 (최신 글이 위로)
    posts = [...newPosts, ...posts];

    // 8. posts.json 저장
    fs.writeFileSync(CONFIG.POSTS_FILE, JSON.stringify(posts, null, 4), 'utf8');

    console.log('\n=== All Posts Generated Successfully ===');
    console.log(`Total new posts: ${newPosts.length}`);
    newPosts.forEach((post, idx) => {
      console.log(`${idx + 1}. [${post.category}] ${post.title} (ID: ${post.id})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 카테고리별 기본 이미지 (Unsplash - 저작권 무료)
// 이미지 풀 확장 + 기존 게시글과 중복 방지 로직 포함
const IMAGE_POOL = {
  '인사이트': [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    'https://images.unsplash.com/photo-1553484771-371a605b060b?w=1200&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&q=80',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80'
  ],
  '신상품': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1200&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80',
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1200&q=80',
    'https://images.unsplash.com/photo-1491553895911-0055uj881c60?w=1200&q=80',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1200&q=80',
    'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1200&q=80',
    'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=1200&q=80',
    'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=1200&q=80',
    'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=1200&q=80'
  ],
  '라이프': [
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&q=80',
    'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1200&q=80',
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&q=80',
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&q=80',
    'https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=1200&q=80',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80',
    'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1200&q=80',
    'https://images.unsplash.com/photo-1507120410856-1f35574c3b45?w=1200&q=80',
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80',
    'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&q=80'
  ],
  '브랜드': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1200&q=80',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80',
    'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1200&q=80',
    'https://images.unsplash.com/photo-1541746972996-4e0b0f43e02a?w=1200&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80'
  ]
};

// 사용된 이미지 추적 (세션 내 중복 방지)
let usedImagesInSession = [];

// 기존 게시글에서 사용 중인 이미지 목록 가져오기
function getUsedImages(posts) {
  return posts.map(p => p.image).filter(Boolean);
}

// 중복 방지 이미지 선택
function getDefaultImage(category, existingPosts = []) {
  const pool = IMAGE_POOL[category] || IMAGE_POOL['인사이트'];
  const usedImages = [...getUsedImages(existingPosts), ...usedImagesInSession];

  // 사용되지 않은 이미지 필터링
  const availableImages = pool.filter(img => !usedImages.includes(img));

  // 모든 이미지가 사용된 경우 전체 풀에서 랜덤 선택 (순환)
  const selectedPool = availableImages.length > 0 ? availableImages : pool;

  const randomIdx = Math.floor(Math.random() * selectedPool.length);
  const selectedImage = selectedPool[randomIdx];

  // 세션 내 사용 기록
  usedImagesInSession.push(selectedImage);

  console.log(`Selected image for ${category}: ${selectedImage.split('/').pop().split('?')[0]}`);
  return selectedImage;
}

// 실행
main();
