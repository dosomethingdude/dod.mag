/**
 * dod.mag 자동 글 생성 스크립트
 * Google Apps Script + Gemini API + GitHub API
 *
 * 설정 방법:
 * 1. Google Apps Script (script.google.com) 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. 아래 CONFIG의 값들을 본인 것으로 변경
 * 4. 트리거 설정: 편집 > 현재 프로젝트의 트리거 > 트리거 추가
 *    - 실행할 함수: generateAndPublishPosts
 *    - 이벤트 소스: 시간 기반
 *    - 시간 기반 트리거 유형: 일 단위 타이머
 *    - 시간대 선택: 오전 6시~7시 (원하는 시간)
 */

// ========== 설정 ==========
const CONFIG = {
  // Gemini API 설정
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY', // Google AI Studio에서 발급

  // GitHub 설정
  GITHUB_TOKEN: 'YOUR_GITHUB_TOKEN', // GitHub Personal Access Token
  GITHUB_OWNER: 'YOUR_GITHUB_USERNAME', // GitHub 사용자명
  GITHUB_REPO: 'dod.mag', // 저장소 이름
  GITHUB_BRANCH: 'main', // 브랜치 이름

  // 게시글 설정
  POSTS_PER_DAY: 3, // 하루에 생성할 글 수
  POSTS_FILE_PATH: 'posts.json' // posts.json 파일 경로
};

// 카테고리 목록
const CATEGORIES = ['인사이트', '신상품', '라이프', '브랜드'];

// 카테고리별 주제 힌트
const CATEGORY_TOPICS = {
  '인사이트': [
    '라이프스타일 트렌드', '소비 트렌드', '사회 현상', '가치관 변화',
    'MZ세대 문화', '워라밸', '디지털 트렌드', '미니멀리즘'
  ],
  '신상품': [
    'IT 가젯', '뷰티 제품', '홈 인테리어', '웰니스 제품',
    '패션 아이템', '주방용품', '오피스 용품', '여행 용품'
  ],
  '라이프': [
    '건강 관리', '운동 루틴', '식단 관리', '수면 개선',
    '스트레스 관리', '취미 생활', '자기계발', '시간 관리'
  ],
  '브랜드': [
    '지속가능한 브랜드', '로컬 브랜드', '스타트업 스토리', '브랜드 철학',
    '장인 정신', '혁신적인 기업', '사회적 기업', '브랜드 리뉴얼'
  ]
};

/**
 * 메인 함수: 글 생성 및 발행
 */
function generateAndPublishPosts() {
  try {
    console.log('=== dod.mag 자동 글 생성 시작 ===');

    // 1. 현재 posts.json 불러오기
    const currentPosts = getCurrentPosts();
    console.log(`현재 게시글 수: ${currentPosts.length}`);

    // 2. 새 글 생성
    const newPosts = [];
    const usedCategories = [];

    for (let i = 0; i < CONFIG.POSTS_PER_DAY; i++) {
      // 카테고리 순환 선택 (중복 최소화)
      let category;
      const availableCategories = CATEGORIES.filter(c => !usedCategories.includes(c));
      if (availableCategories.length > 0) {
        category = availableCategories[Math.floor(Math.random() * availableCategories.length)];
      } else {
        category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      }
      usedCategories.push(category);

      console.log(`[${i + 1}/${CONFIG.POSTS_PER_DAY}] ${category} 카테고리 글 생성 중...`);

      const post = generatePost(category, currentPosts.length + newPosts.length + 1);
      if (post) {
        newPosts.push(post);
        console.log(`  - 제목: ${post.title}`);
      }

      // API 호출 간격 (rate limit 방지)
      Utilities.sleep(2000);
    }

    // 3. posts.json 업데이트
    if (newPosts.length > 0) {
      const updatedPosts = [...newPosts, ...currentPosts];
      updatePostsFile(updatedPosts);
      console.log(`=== ${newPosts.length}개의 새 글이 발행되었습니다 ===`);
    }

  } catch (error) {
    console.error('오류 발생:', error);
    // 오류 알림 이메일 발송 (선택)
    // sendErrorEmail(error);
  }
}

/**
 * Gemini API로 글 생성
 */
function generatePost(category, newId) {
  const topics = CATEGORY_TOPICS[category];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  const prompt = `당신은 20-30대 여성을 위한 라이프스타일 매거진 "dod.mag"의 에디터입니다.
다음 조건에 맞는 매거진 기사를 작성해주세요:

카테고리: ${category}
주제 힌트: ${randomTopic}
타겟 독자: 20-30대 여성, 자기계발과 트렌드에 관심 많음

요청사항:
1. 제목: 클릭을 유도하는 매력적인 제목 (30자 내외)
2. 요약: 본문 내용을 함축한 2-3문장
3. 본문: 2000자 내외의 깊이 있는 콘텐츠
   - 소제목(■)을 사용해 구조화
   - 구체적인 예시와 데이터 포함
   - 독자가 실천할 수 있는 액션 아이템 포함

다음 JSON 형식으로만 응답해주세요:
{
  "title": "제목",
  "title_en": "English Title",
  "summary": "요약",
  "summary_en": "English Summary",
  "content": "본문 내용",
  "content_en": "English Content"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.candidates && result.candidates[0].content) {
      const text = result.candidates[0].content.parts[0].text;

      // JSON 추출
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const postData = JSON.parse(jsonMatch[0]);

        // 오늘 날짜
        const today = new Date();
        const dateStr = Utilities.formatDate(today, 'Asia/Seoul', 'yyyy.MM.dd');

        // Unsplash 랜덤 이미지
        const imageKeywords = {
          '인사이트': 'lifestyle,trend,modern',
          '신상품': 'product,gadget,technology',
          '라이프': 'wellness,health,fitness',
          '브랜드': 'brand,store,business'
        };

        return {
          id: newId,
          category: category,
          title: postData.title,
          title_en: postData.title_en || '',
          summary: postData.summary,
          summary_en: postData.summary_en || '',
          content: postData.content,
          content_en: postData.content_en || '',
          date: dateStr,
          image: `https://images.unsplash.com/photo-${Date.now()}?w=1200&q=80&${imageKeywords[category]}`
        };
      }
    }
  } catch (error) {
    console.error(`글 생성 실패 (${category}):`, error);
  }

  return null;
}

/**
 * GitHub에서 현재 posts.json 불러오기
 */
function getCurrentPosts() {
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.POSTS_FILE_PATH}?ref=${CONFIG.GITHUB_BRANCH}`;

  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.content) {
      const content = Utilities.newBlob(Utilities.base64Decode(result.content)).getDataAsString();
      return JSON.parse(content);
    }
  } catch (error) {
    console.log('posts.json 불러오기 실패, 빈 배열 반환');
  }

  return [];
}

/**
 * GitHub에 posts.json 업데이트
 */
function updatePostsFile(posts) {
  // 먼저 현재 파일의 SHA 가져오기
  const getUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.POSTS_FILE_PATH}?ref=${CONFIG.GITHUB_BRANCH}`;

  const getOptions = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };

  let sha = '';
  try {
    const getResponse = UrlFetchApp.fetch(getUrl, getOptions);
    const getResult = JSON.parse(getResponse.getContentText());
    sha = getResult.sha || '';
  } catch (error) {
    console.log('기존 파일 없음, 새로 생성');
  }

  // 파일 업데이트/생성
  const updateUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.POSTS_FILE_PATH}`;

  const content = JSON.stringify(posts, null, 2);
  const encodedContent = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

  const today = new Date();
  const dateStr = Utilities.formatDate(today, 'Asia/Seoul', 'yyyy-MM-dd');

  const payload = {
    message: `[Auto] ${dateStr} 새 글 ${CONFIG.POSTS_PER_DAY}개 발행`,
    content: encodedContent,
    branch: CONFIG.GITHUB_BRANCH
  };

  if (sha) {
    payload.sha = sha;
  }

  const updateOptions = {
    method: 'put',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(updateUrl, updateOptions);
  const result = JSON.parse(response.getContentText());

  if (result.content) {
    console.log('posts.json 업데이트 완료');
  } else {
    throw new Error('posts.json 업데이트 실패: ' + response.getContentText());
  }
}

/**
 * 테스트 함수
 */
function testGeneration() {
  console.log('테스트 시작...');
  const post = generatePost('인사이트', 999);
  console.log('생성된 글:', post);
}
