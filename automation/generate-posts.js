/**
 * dod.mag 자동 글 생성 스크립트
 * GitHub Actions에서 실행되어 Google Gemini API로 글을 생성합니다.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseString } = require('xml2js');

// 설정
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  // 글로벌 트렌드 RSS (한국 + 미국)
  TRENDS_RSS_URLS: [
    'https://trends.google.co.kr/trending/rss?geo=KR',
    'https://trends.google.com/trending/rss?geo=US'
  ],
  POSTS_FILE: 'posts.json',
  CATEGORIES: ['인사이트', '경제', '라이프', '브랜드'],
  CATEGORY_EN: {
    '인사이트': 'insights',
    '경제': 'economy',
    '라이프': 'life',
    '브랜드': 'brands'
  },
  POSTS_PER_DAY: 3,  // 하루 3개 글 생성 (경제 카테고리 집중 기간에는 별도 설정)
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
- 경제: 경제 정책, 금리/환율, 투자 트렌드, 부동산, 고용/노동시장, 소비 트렌드
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

  // 경제 카테고리 전용 추가 지침
  const economyExtra = category === '경제' ? `
**[경제 카테고리 전용 지침]:**
- 해당 경제 이슈의 **상세한 정책 내용**을 구체적으로 서술
- 일반 시민이 **참여할 수 있는 방법** (신청 절차, 자격 요건, 신청 기간 등) 상세 기술
- 관련 **비용** (수수료, 세금, 투자 금액 등)이 있다면 구체적 금액 명시
- 정부/기관의 공식 웹사이트, 신청 링크 등 **실용적 정보** 포함
- 독자가 바로 행동할 수 있는 **단계별 가이드** 제공
` : '';

  const prompt = `당신은 프리미엄 라이프스타일 매거진 "dod.mag"의 수석 에디터입니다.
Vogue, Elle, GQ 같은 세련된 매거진 스타일로 깊이 있는 정보성 기사를 작성합니다.

**[필수] 오늘 날짜: ${currentYear}년 ${currentMonth}월 ${currentDate}일**

주제: "${keyword}"
카테고리: ${category}
${economyExtra}
**[핵심] 글 분량 및 구조 규칙:**
- 한국어 본문: 반드시 5,000자 이상 (공백 포함)
- 영어 본문: 한국어와 동등한 분량의 완전한 번역본 (요약이 아닌 풀 콘텐츠)
- 잡지 기사 형식: 인트로 → 배경/맥락 → 핵심 분석 (3~4개 소주제) → 실용적 조언 → 전망/클로징
- 각 소주제는 **굵은체 소제목**으로 구분
- 구체적인 데이터, 사례, 전문가 견해를 풍부하게 포함
- 독자가 실생활에 적용할 수 있는 실용적 정보 포함

글쓰기 톤앤매너:
1. 세련되고 깊이 있는 문체, 친근하지만 전문적
2. 독자를 "당신"으로 호칭 (친밀하지만 격식 있게)
3. 명령형보다 제안형 사용 ("~해보세요" vs "~하세요")
4. 과장된 표현 지양, 담백하고 세련된 문체
5. 단락 간 자연스러운 흐름과 논리적 연결

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

**[필수] 키워드 인물/주제 정확성 규칙:**
- 트렌드 키워드가 실존 인물일 경우, 반드시 해당 인물의 실제 직업·이력·국적을 정확히 파악한 후 작성하세요
- 예: "클로이킴"은 패션디자이너가 아닌 미국 스노보드 금메달리스트입니다
- 인물의 직업이나 정체가 불확실하면 해당 키워드로 글을 작성하지 말고, JSON에 "skip": true를 포함하세요
- 키워드가 여러 의미를 가질 수 있는 경우, 현재 트렌드 맥락에서 가장 화제가 되는 의미로 작성하세요
- 글의 제목에 나오는 핵심 주제어(예: 포르쉐, 반도체, 가상자산 등)가 곧 이 글의 대표 키워드입니다

**[필수] 출처 형식:**
- 실제 존재하는 공식 기관, 언론사, 기업의 공식 발표만 출처로 사용
- "~리포트", "~조사" 등 가상의 출처를 만들지 마세요
- 출처 URL을 알고 있다면 포함하세요

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "title": "제목 (25-35자, 클릭 유도하되 낚시성 지양, ${currentYear}년 기준)",
  "title_en": "English title (equivalent translation)",
  "summary": "요약 (100자 내외, 핵심 메시지 함축)",
  "summary_en": "English summary (equivalent translation)",
  "content": "한국어 본문 (5,000자 이상, 잡지 기사 형식, **굵은체 소제목** 사용, 마지막에 참고자료 섹션 포함, 모든 연도는 ${currentYear}년 기준)",
  "content_en": "English full article (complete translation of Korean content, NOT a summary. Must be equivalent length and depth as Korean version, with **bold subheadings**)",
  "sources": ["출처1 (URL 포함 권장)", "출처2", "출처3"],
  "image_keyword": "제목의 핵심 주제를 정확히 반영하는 영어 키워드 1개. 반드시 제목에 등장하는 메인 주제어의 영문 표현이어야 합니다 (예: 포르쉐→porsche, 반도체→semiconductor, 가상자산→cryptocurrency, 금리→interest rate, 부동산→real estate, 환율→currency exchange, 최저임금→minimum wage, 세제개편→tax reform). 브랜드명은 그대로 영문 표기하세요."
}`;

  // 최대 2회 재시도
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await callClaudeAPI(prompt);

      // JSON 추출
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`Attempt ${attempt}: No valid JSON in response`);
        if (attempt < 2) { console.log('Retrying...'); continue; }
        throw new Error('No valid JSON in response after retries');
      }

      let jsonStr = jsonMatch[0];

      // JSON 복구: 잘린 문자열 수정 시도
      try {
        JSON.parse(jsonStr);
      } catch (parseErr) {
        console.warn(`Attempt ${attempt}: JSON parse error: ${parseErr.message}`);
        // 잘린 JSON 복구 시도: 미닫힌 따옴표/중괄호 수정
        jsonStr = jsonStr.replace(/,\s*$/, '');  // 끝 쉼표 제거
        if (!jsonStr.endsWith('}')) {
          // content 필드에서 잘린 경우 - 마지막 완전한 필드까지 자르기
          const lastQuoteComma = jsonStr.lastIndexOf('",');
          if (lastQuoteComma > 0) {
            jsonStr = jsonStr.substring(0, lastQuoteComma + 1) + '}';
          }
        }
        // 미닫힌 문자열 닫기
        const openQuotes = (jsonStr.match(/"/g) || []).length;
        if (openQuotes % 2 !== 0) {
          jsonStr += '"';
        }
        if (!jsonStr.endsWith('}')) jsonStr += '}';
      }

      const article = JSON.parse(jsonStr);

      // AI가 skip 판단한 경우 (인물/주제 정확성 불확실)
      if (article.skip === true) {
        console.log(`⏭️ AI skipped keyword (insufficient facts): ${keyword}`);
        return null;
      }

      // 깨진 글씨(Unicode replacement character) 제거/수정
      article.title = cleanBrokenCharacters(article.title || '');
      article.title_en = cleanBrokenCharacters(article.title_en || '');
      article.summary = cleanBrokenCharacters(article.summary || '');
      article.summary_en = cleanBrokenCharacters(article.summary_en || '');
      article.content = cleanBrokenCharacters(article.content || '');
      article.content_en = cleanBrokenCharacters(article.content_en || '');
      if (article.sources) {
        article.sources = article.sources.map(s => cleanBrokenCharacters(s));
      }

      // AI 협업 안내문구 추가
      article.content += CONFIG.AI_DISCLAIMER;
      article.content_en += '\n\n---\n* This article was created in collaboration with an AI assistant and finalized through editorial review.';
      return article;
    } catch (e) {
      console.error(`Attempt ${attempt} failed:`, e.message);
      if (attempt >= 2) throw new Error('Article generation failed after retries');
      console.log('Retrying article generation...');
    }
  }
}

// 깨진 글씨(Unicode replacement character) 제거 함수
function cleanBrokenCharacters(text) {
  if (!text || typeof text !== 'string') return text;

  // 1. Unicode replacement character (U+FFFD) 제거
  let cleaned = text.replace(/\uFFFD/g, '');

  // 2. 잘못된 서로게이트 페어(surrogate pairs) 제거
  cleaned = cleaned.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');
  cleaned = cleaned.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

  // 3. NULL 문자 및 기타 제어 문자 제거 (줄바꿈, 탭 제외)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4. 연속된 공백을 하나로 정리 (단, 줄바꿈은 유지)
  cleaned = cleaned.replace(/[^\S\n]+/g, ' ');

  return cleaned.trim();
}

// Gemini API 호출
async function callClaudeAPI(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const headers = {
    'Content-Type': 'application/json'
  };

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      maxOutputTokens: 16384,
      temperature: 0.7
    }
  };

  const response = await httpPost(url, body, headers);

  if (response.error) {
    throw new Error(`Gemini API error: ${response.error.message}`);
  }

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini API');
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

// 경제 카테고리 집중 모드 설정
// 기간: 2026-02-12 ~ 2026-02-14 (3일간)
// 이 기간 동안 경제 카테고리 8개 글을 추가로 생성
const ECONOMY_BOOST = {
  enabled: true,
  startDate: '2026-02-12',
  endDate: '2026-02-14',
  postsPerDay: 8,
  category: '경제'
};

// 경제 집중 모드용 키워드 선택
async function selectEconomyKeywords(keywords, count) {
  console.log(`Selecting ${count} economy keywords from trends...`);

  const prompt = `당신은 경제 전문 에디터입니다.

아래 트렌드 키워드 목록에서 경제/금융/정책 관련 키워드를 ${count}개 선택하세요.
경제 관련 키워드가 부족하면, 최근 30일간 한국의 주요 경제 이슈(금리, 환율, 부동산, 고용, 물가, 세금, 투자, 소비, 정부정책 등)를 직접 제안하세요.

트렌드 키워드 목록:
${keywords.join('\n')}

반드시 아래 형식으로만 ${count}개의 키워드를 응답하세요 (한 줄에 하나):
1: [키워드]
2: [키워드]
3: [키워드]
...`;

  const response = await callClaudeAPI(prompt);
  const results = [];

  for (let i = 1; i <= count; i++) {
    const regex = new RegExp(`${i}:\\s*(.+)`);
    const match = response.match(regex);
    if (match) {
      results.push(match[1].trim());
    }
  }

  // 부족한 경우 기본 경제 키워드 추가
  const defaultEconKeywords = ['금리 인하', '부동산 정책', '물가 안정', '고용 시장', '주식 투자', '환율 변동', '세금 정책', '소비 트렌드'];
  while (results.length < count) {
    results.push(defaultEconKeywords[results.length % defaultEconKeywords.length]);
  }

  console.log('Selected economy keywords:', results);
  return results;
}

// 메인 함수 - 하루 3개 글 생성 + 경제 집중 모드
async function main() {
  console.log('=== dod.mag Auto Post Generator ===');
  console.log(`Date: ${getTodayDate()}`);
  console.log(`Posts per day: ${CONFIG.POSTS_PER_DAY}`);

  if (!CONFIG.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not set');
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
      try {
        console.log(`\n--- Generating article ${newPosts.length + 1}/${CONFIG.POSTS_PER_DAY} ---`);

        const article = await generateArticle(keyword, category);
        if (!article) continue;  // AI가 skip한 경우

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
          image: getDefaultImage(category, [...posts, ...newPosts], article.title, keyword, article.image_keyword || ''),
          sources: article.sources || [],
          admin_locked: false
        };

        newPosts.push(newPost);
        console.log(`Generated: ${newPost.title}`);
      } catch (artErr) {
        console.error(`⚠️ Article failed (${keyword}): ${artErr.message}`);
        console.log('Skipping and continuing...');
      }
    }

    // 5-1. 경제 카테고리 집중 모드
    const today = getTodayDate().replace(/\./g, '-');
    if (ECONOMY_BOOST.enabled && today >= ECONOMY_BOOST.startDate && today <= ECONOMY_BOOST.endDate) {
      console.log(`\n=== ECONOMY BOOST MODE (${ECONOMY_BOOST.postsPerDay} articles) ===`);
      const econKeywords = await selectEconomyKeywords(keywords, ECONOMY_BOOST.postsPerDay);

      for (let i = 0; i < econKeywords.length; i++) {
        try {
          console.log(`\n--- Generating economy article ${i + 1}/${ECONOMY_BOOST.postsPerDay} ---`);
          const article = await generateArticle(econKeywords[i], ECONOMY_BOOST.category);
          if (!article) continue;  // AI가 skip한 경우

          const newPost = {
            id: getNextId([...posts, ...newPosts]),
            category: ECONOMY_BOOST.category,
            title: article.title,
            title_en: article.title_en,
            summary: article.summary,
            summary_en: article.summary_en,
            content: article.content,
            content_en: article.content_en,
            date: getTodayDate(),
            image: getDefaultImage(ECONOMY_BOOST.category, [...posts, ...newPosts], article.title, econKeywords[i], article.image_keyword || ''),
            sources: article.sources || [],
            admin_locked: false
          };

          newPosts.push(newPost);
          console.log(`Generated economy: ${newPost.title}`);
        } catch (econErr) {
          console.error(`⚠️ Economy article ${i + 1} failed (${econKeywords[i]}): ${econErr.message}`);
          console.log('Skipping and continuing...');
        }
      }
    }

    // 6. 관리자 잠금된 게시글 보호 (admin_locked: true인 게시글은 덮어쓰지 않음)
    const lockedIds = posts.filter(p => p.admin_locked === true).map(p => p.id);
    if (lockedIds.length > 0) {
      console.log(`\nProtected admin-locked posts: ${lockedIds.join(', ')}`);
    }

    // 7. 새 게시글을 맨 앞에 추가 (최신 글이 위로)
    posts = [...newPosts, ...posts];

    // 8. posts.json 저장 (UTF-8 인코딩 명시)
    const jsonContent = JSON.stringify(posts, null, 4);
    // 저장 전 깨진 글씨 최종 검증
    if (jsonContent.includes('\uFFFD')) {
      console.warn('⚠️ Warning: Broken characters detected before save. Cleaning...');
    }
    fs.writeFileSync(CONFIG.POSTS_FILE, jsonContent, { encoding: 'utf8' });

    // 9. sitemap.xml 자동 업데이트
    generateSitemap(posts);

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

// ============================================================
// 토픽 기반 이미지 매칭 시스템 (Unsplash + Pexels)
// - 각 토픽에 한국어/영어 키워드 + 다수 이미지 URL
// - AI의 image_keyword(영어)와 제목(한국어) 모두 매칭 가능
// ============================================================

const TOPIC_IMAGES = [
  // === 자동차/럭셔리카 ===
  {
    keywords: ['porsche', '포르쉐', 'luxury car', '럭셔리카', 'ferrari', '페라리', 'bmw', 'mercedes', '벤츠', 'supercar', '슈퍼카', 'sports car', 'lamborghini', '람보르기니', 'maserati'],
    images: [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80',
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&q=80',
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200&q=80',
      'https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3136673/pexels-photo-3136673.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 전기차/EV ===
  {
    keywords: ['전기차', 'electric vehicle', 'ev', 'tesla', '테슬라', '충전', 'charging', '기아', '현대', 'hyundai', 'kia', 'EV5', 'EV6', 'EV9'],
    images: [
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1200&q=80',
      'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=1200&q=80',
      'https://images.pexels.com/photos/110844/pexels-photo-110844.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3846205/pexels-photo-3846205.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 주식/투자/트레이딩 ===
  {
    keywords: ['주식', 'stock', 'stock market', 'trading', '투자', 'investment', '증권', 'securities', 'nasdaq', '나스닥', '코스피', 'kospi', 'roku', 'draftkings', 'AMAT'],
    images: [
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80',
      'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&q=80',
      'https://images.pexels.com/photos/159888/pexels-photo-159888.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 금리/은행/통화정책 ===
  {
    keywords: ['금리', 'interest rate', 'banking', '은행', '기준금리', 'monetary policy', '통화정책', '한국은행', 'central bank', 'fed', '연준'],
    images: [
      'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=1200&q=80',
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
      'https://images.pexels.com/photos/4386431/pexels-photo-4386431.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/5926382/pexels-photo-5926382.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 환율/외환 ===
  {
    keywords: ['환율', 'currency', 'exchange rate', 'currency exchange', '달러', 'dollar', '엔화', 'yen', '위안', 'yuan', '외환', 'forex'],
    images: [
      'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&q=80',
      'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&q=80',
      'https://images.pexels.com/photos/3532540/pexels-photo-3532540.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/4386476/pexels-photo-4386476.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 부동산 ===
  {
    keywords: ['부동산', 'real estate', 'property', '아파트', 'apartment', '주택', 'housing', '종부세', '분양', '재건축', '모기지', 'mortgage', 'PF'],
    images: [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80',
      'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=1200&q=80',
      'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1546168/pexels-photo-1546168.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 가상자산/암호화폐 ===
  {
    keywords: ['가상자산', 'cryptocurrency', 'crypto', '비트코인', 'bitcoin', '이더리움', 'ethereum', '블록체인', 'blockchain', '코인', '암호화폐', '빗썸', 'bithumb', '디지털 자산'],
    images: [
      'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=1200&q=80',
      'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=1200&q=80',
      'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/8370752/pexels-photo-8370752.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 세금/세제 ===
  {
    keywords: ['세금', 'tax', 'taxation', 'tax reform', '세제', '연말정산', '종합소득세', '세제개편', '과세', '절세', '세무'],
    images: [
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80',
      'https://images.pexels.com/photos/4386431/pexels-photo-4386431.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6863332/pexels-photo-6863332.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 임금/노동/고용 ===
  {
    keywords: ['최저임금', 'minimum wage', 'wage', 'salary', '임금', '고용', 'employment', '취업', 'job', '노동', 'labor', '일자리', '청년고용', '채용'],
    images: [
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=80',
      'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80',
      'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/5439381/pexels-photo-5439381.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 물가/인플레이션 ===
  {
    keywords: ['물가', 'inflation', 'consumer price', '인플레이션', '소비자물가', 'CPI', '장바구니', 'grocery'],
    images: [
      'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=1200&q=80',
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80',
      'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3962285/pexels-photo-3962285.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 반도체/칩 ===
  {
    keywords: ['반도체', 'semiconductor', 'chip', '칩', '삼성전자', 'samsung', 'SK하이닉스', 'hynix', 'AMAT', '웨이퍼', 'wafer', '파운드리', 'foundry'],
    images: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80',
      'https://images.unsplash.com/photo-1635241161466-541f065683ba?w=1200&q=80',
      'https://images.pexels.com/photos/2582937/pexels-photo-2582937.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/163100/circuit-circuit-board-resistor-computer-163100.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 무역/수출 ===
  {
    keywords: ['무역', 'trade', '수출', 'export', '수입', 'import', '관세', 'tariff', '공급망', 'supply chain', '물류', 'logistics'],
    images: [
      'https://images.unsplash.com/photo-1434626881859-194d67b2b86f?w=1200&q=80',
      'https://images.unsplash.com/photo-1494412574643-ff11b0a5eb19?w=1200&q=80',
      'https://images.pexels.com/photos/1427107/pexels-photo-1427107.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2226458/pexels-photo-2226458.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 창업/스타트업 ===
  {
    keywords: ['창업', 'startup', '스타트업', 'venture', '벤처', '쿠팡', 'coupang', '유니콘'],
    images: [
      'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=1200&q=80',
      'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&q=80',
      'https://images.pexels.com/photos/7413915/pexels-photo-7413915.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === AI/인공지능 ===
  {
    keywords: ['AI', '인공지능', 'artificial intelligence', 'machine learning', '머신러닝', 'deep learning', 'GPT', 'chatbot', '챗봇', 'LLM'],
    images: [
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&q=80',
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80',
      'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6153354/pexels-photo-6153354.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 스마트폰/모바일 ===
  {
    keywords: ['스마트폰', 'smartphone', 'iPhone', '아이폰', '애플', 'apple', '갤럭시', 'galaxy', 'mobile'],
    images: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80',
      'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=1200&q=80',
      'https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1092644/pexels-photo-1092644.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 배터리/에너지 ===
  {
    keywords: ['배터리', 'battery', '에너지', 'energy', '태양광', 'solar', '에코프로', '2차전지', '리튬'],
    images: [
      'https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=1200&q=80',
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1200&q=80',
      'https://images.pexels.com/photos/9875441/pexels-photo-9875441.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/433308/pexels-photo-433308.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 쇼핑/소비/유통 ===
  {
    keywords: ['쇼핑', 'shopping', '소비', 'consumer', '홈쇼핑', '편의점', '유통', 'retail', 'e-commerce', '이커머스'],
    images: [
      'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1200&q=80',
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80',
      'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 패션/뷰티 ===
  {
    keywords: ['패션', 'fashion', '뷰티', 'beauty', '향수', 'perfume', '유니클로', 'uniqlo', '스트리트', 'streetwear', '럭셔리', 'luxury fashion', '오프화이트', '디자이너', 'designer'],
    images: [
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&q=80',
      'https://images.pexels.com/photos/1536619/pexels-photo-1536619.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/291762/pexels-photo-291762.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 음식/식품/요리 ===
  {
    keywords: ['음식', 'food', '식품', '요리', 'cooking', '디저트', 'dessert', '쿠키', '맛집', 'restaurant', '컬리', '식재료', 'grocery'],
    images: [
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1200&q=80',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 운동/피트니스 ===
  {
    keywords: ['운동', 'fitness', 'exercise', '헬스', 'gym', 'workout', '요가', 'yoga', '웨어러블', 'wearable', 'NEAT'],
    images: [
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&q=80',
      'https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2294361/pexels-photo-2294361.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 웰니스/명상/디톡스 ===
  {
    keywords: ['웰빙', 'wellness', '명상', 'meditation', '디톡스', 'detox', '마음챙김', 'mindfulness', '수면', 'sleep', '얼음목욕', 'ice bath'],
    images: [
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&q=80',
      'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&q=80',
      'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3560044/pexels-photo-3560044.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 건강/의료 ===
  {
    keywords: ['의료', 'medical', 'health', '건강', '병원', 'hospital', '의사', 'doctor', '정신건강', 'mental health'],
    images: [
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&q=80',
      'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80',
      'https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3825586/pexels-photo-3825586.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 교육/학습 ===
  {
    keywords: ['교육', 'education', '학습', 'learning', '인강', '학자금', 'student loan', '대학'],
    images: [
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=80',
      'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1200&q=80',
      'https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/256395/pexels-photo-256395.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 스포츠 ===
  {
    keywords: ['스포츠', 'sports', '축구', 'football', 'soccer', '골프', 'golf', '야구', 'baseball', '농구', 'basketball', '올림픽', 'olympics', '챔피언스리그', 'champions league', '분데스리가', 'bundesliga', '슈퍼볼', 'super bowl', '스노보드', 'snowboard', '프로암'],
    images: [
      'https://images.unsplash.com/photo-1461896836934-bd45ba21e0c7?w=1200&q=80',
      'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&q=80',
      'https://images.pexels.com/photos/46798/the-ball-stadion-football-the-pitch-46798.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2570139/pexels-photo-2570139.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === K-팝/음악/엔터 ===
  {
    keywords: ['K-팝', 'kpop', 'k-pop', '아이돌', 'idol', '뉴진스', 'newjeans', '음악', 'music', '그래미', 'grammy', '콘서트', 'concert', '스트리밍', 'streaming', '현역가왕'],
    images: [
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&q=80',
      'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1200&q=80',
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 우주/항공 ===
  {
    keywords: ['우주', 'space', '항공', 'aerospace', '로켓', 'rocket', '블루오리진', 'blue origin', 'SpaceX', '스페이스X', 'NASA'],
    images: [
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
      'https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=1200&q=80',
      'https://images.pexels.com/photos/586063/pexels-photo-586063.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/73910/mars-mars-rover-space-travel-robot-73910.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 사랑/관계/기념일 ===
  {
    keywords: ['발렌타인', 'valentine', '사랑', 'love', 'romance', '커플', 'couple', '결혼', 'wedding', '데이트', 'dating'],
    images: [
      'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1200&q=80',
      'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=1200&q=80',
      'https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/842876/pexels-photo-842876.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 날씨/자연재해 ===
  {
    keywords: ['폭풍', 'storm', '날씨', 'weather', '태풍', 'typhoon', '겨울', 'winter', '기후', 'climate', '홍수', 'flood'],
    images: [
      'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=1200&q=80',
      'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1200&q=80',
      'https://images.pexels.com/photos/1162251/pexels-photo-1162251.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 로봇/휴머노이드 ===
  {
    keywords: ['로봇', 'robot', '휴머노이드', 'humanoid', '자동화', 'automation'],
    images: [
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80',
      'https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1200&q=80',
      'https://images.pexels.com/photos/2599244/pexels-photo-2599244.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/8566473/pexels-photo-8566473.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 여행/관광 ===
  {
    keywords: ['여행', 'travel', '관광', 'tourism', '비자', 'visa', '벚꽃', 'cherry blossom', '항공', 'flight', '호텔', 'hotel'],
    images: [
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
      'https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 1인가구/라이프스타일 ===
  {
    keywords: ['1인가구', 'solo', '솔로', 'single', '라이프스타일', 'lifestyle', '자기계발', 'self-improvement'],
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80',
      'https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=1200&q=80',
      'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3771069/pexels-photo-3771069.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 리콜/소비자보호 ===
  {
    keywords: ['리콜', 'recall', '소비자보호', 'consumer protection', '제품안전', 'product safety', '결함'],
    images: [
      'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&q=80',
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80',
      'https://images.pexels.com/photos/5668882/pexels-photo-5668882.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/4386373/pexels-photo-4386373.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 스포츠베팅/게임 ===
  {
    keywords: ['베팅', 'betting', '스포츠베팅', 'sports betting', '카지노', 'casino', '게임', 'gaming'],
    images: [
      'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=1200&q=80',
      'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200&q=80',
      'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
  // === 미국/정치/대통령 ===
  {
    keywords: ['대통령', 'president', '정치', 'politics', '백악관', 'white house', '프레지던트', 'election', '선거'],
    images: [
      'https://images.unsplash.com/photo-1501466044931-62695aada8e9?w=1200&q=80',
      'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&q=80',
      'https://images.pexels.com/photos/1550337/pexels-photo-1550337.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/129112/pexels-photo-129112.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ]
  },
];

// 카테고리별 폴백 이미지 (토픽 매칭 실패시 사용, Unsplash + Pexels 혼합)
const CATEGORY_FALLBACK = {
  '인사이트': [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
    'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=1200',
  ],
  '경제': [
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80',
    'https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/5926382/pexels-photo-5926382.jpeg?auto=compress&cs=tinysrgb&w=1200',
  ],
  '라이프': [
    'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1200&q=80',
    'https://images.unsplash.com/photo-1507120410856-1f35574c3b45?w=1200&q=80',
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80',
    'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/3560044/pexels-photo-3560044.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1200',
  ],
  '브랜드': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80',
    'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1200&q=80',
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200&q=80',
    'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg?auto=compress&cs=tinysrgb&w=1200',
  ]
};

// 사용된 이미지 추적 (세션 내 중복 방지)
let usedImagesInSession = [];

// 기존 게시글에서 사용 중인 이미지 목록 가져오기
function getUsedImages(posts) {
  return posts.map(p => p.image).filter(Boolean);
}

// 토픽 매칭: 검색 텍스트에서 가장 많은 키워드가 일치하는 토픽 찾기
function findMatchingTopic(searchTexts) {
  let bestTopic = null;
  let bestScore = 0;

  const combined = searchTexts.join(' ').toLowerCase();

  for (const topic of TOPIC_IMAGES) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (combined.includes(kw.toLowerCase())) {
        // 긴 키워드일수록 높은 점수 (더 정확한 매칭)
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestTopic;
}

// 중복 방지 이미지 선택 (토픽 기반)
function getDefaultImage(category, existingPosts = [], title = '', keyword = '', imageKeyword = '') {
  const usedImages = [...getUsedImages(existingPosts), ...usedImagesInSession];

  // 1. 토픽 매칭 시도: image_keyword(영어) + 제목(한국어) + 원본 키워드 모두 사용
  const searchTexts = [imageKeyword, title, keyword].filter(Boolean);
  const topic = findMatchingTopic(searchTexts);

  if (topic) {
    // 토픽 내 미사용 이미지 찾기
    const available = topic.images.filter(img => !usedImages.includes(img));
    const pool = available.length > 0 ? available : topic.images;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    usedImagesInSession.push(selected);
    console.log(`✓ Topic matched image for [${searchTexts.join(', ')}]`);
    return selected;
  }

  // 2. 토픽 매칭 실패 → 카테고리 폴백
  const fallback = CATEGORY_FALLBACK[category] || CATEGORY_FALLBACK['인사이트'];
  const available = fallback.filter(img => !usedImages.includes(img));
  const pool = available.length > 0 ? available : fallback;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  usedImagesInSession.push(selected);
  console.log(`⚠️ No topic match, category fallback for: ${category}`);
  return selected;
}

// sitemap.xml 자동 생성 함수
function generateSitemap(posts) {
  const baseUrl = 'https://dod-mag.pages.dev';
  const categories = ['인사이트', '경제', '라이프', '브랜드'];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // 메인 페이지
  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}/</loc>\n`;
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  // 카테고리 페이지
  categories.forEach(cat => {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/#/category/${encodeURIComponent(cat)}</loc>\n`;
    xml += '    <changefreq>daily</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  });

  // 각 게시글
  posts.forEach(post => {
    const lastmod = post.date.replace(/\./g, '-');
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/#/post/${post.id}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>\n';

  const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
  fs.writeFileSync(sitemapPath, xml, { encoding: 'utf8' });
  console.log(`✓ sitemap.xml updated with ${posts.length} posts`);
}

// 실행
main();
