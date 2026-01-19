/**
 * dod.mag 자동 글 생성 스크립트 v2.0
 * Google Apps Script + Gemini API + GitHub API
 *
 * 주요 기능:
 * - 미국/한국 트렌드 키워드 기반 글 생성
 * - 참고자료 출처 자동 기재
 * - 카테고리별 맞춤 콘텐츠 생성
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
  GITHUB_TOKEN: 'YOUR_GITHUB_TOKEN', // GitHub Personal Access Token (repo 권한)
  GITHUB_OWNER: 'dosomethingdude', // GitHub 사용자명
  GITHUB_REPO: 'dod.mag', // 저장소 이름
  GITHUB_BRANCH: 'main', // 브랜치 이름

  // 게시글 설정
  POSTS_PER_DAY: 3, // 하루에 생성할 글 수
  POSTS_FILE_PATH: 'posts.json' // posts.json 파일 경로
};

// 카테고리 목록
const CATEGORIES = ['인사이트', '신상품', '라이프', '브랜드'];

// 카테고리별 트렌드 키워드 (미국/한국 트렌드 기반)
const CATEGORY_TRENDS = {
  '인사이트': {
    keywords: [
      'AI 라이프스타일', '디지털 디톡스', '소확행', '욜로 vs 파이어족',
      'MZ세대 소비트렌드', '조용한 퇴사', '워라밸', '플렉스 문화',
      '미니멀리즘', '지속가능한 소비', '경험 경제', '1인 가구 트렌드',
      '리셀 문화', '구독 경제', '메타버스 라이프', '하이브리드 워크'
    ],
    sources: [
      'McKinsey Global Institute',
      'Deloitte Consumer Insights',
      'Nielsen Consumer Report',
      '트렌드코리아',
      '대학내일20대연구소',
      'Pew Research Center'
    ]
  },
  '신상품': {
    keywords: [
      '스마트홈 기기', 'AI 뷰티 디바이스', '무선 이어버드', '미니 프로젝터',
      '클린뷰티', '비건 화장품', '홈트레이닝 기기', '스마트워치',
      '에어프라이어', '무선청소기', '캡슐커피머신', '공기청정기',
      '전동킥보드', '접이식 자전거', '휴대용 마사지기', '스마트 체중계'
    ],
    sources: [
      'TechCrunch',
      'The Verge',
      'CNET Product Reviews',
      '전자신문',
      '디지털데일리',
      'Consumer Reports'
    ]
  },
  '라이프': {
    keywords: [
      '간헐적 단식', '플랭크 챌린지', '요가 루틴', '명상 앱',
      '수면 위생', '장건강', '프로틴 식단', '저탄고지',
      '아침 루틴', '저녁 루틴', '스트레스 해소법', '번아웃 극복',
      '독서 습관', '저널링', '미라클 모닝', '디지털 웰빙'
    ],
    sources: [
      'Harvard Health Publishing',
      'Mayo Clinic',
      'WebMD',
      '대한의학회',
      '서울대병원 건강정보',
      'WHO Guidelines'
    ]
  },
  '브랜드': {
    keywords: [
      '파타고니아', '이솝', '무인양품', '다이슨',
      '올버즈', '탐스', '와비파커', '에버레인',
      '젠틀몬스터', '마르디메크르디', '아크테릭스', '룰루레몬',
      '블루보틀', '스타벅스 리저브', '샤넬', '에르메스'
    ],
    sources: [
      'Forbes Brand Value',
      'Business of Fashion',
      'Fast Company',
      '매경이코노미',
      '한경비즈니스',
      'Brand Finance'
    ]
  }
};

/**
 * 메인 함수: 글 생성 및 발행
 */
function generateAndPublishPosts() {
  try {
    console.log('=== dod.mag 자동 글 생성 시작 ===');
    console.log(`시작 시간: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}`);

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
      Utilities.sleep(3000);
    }

    // 3. posts.json 업데이트
    if (newPosts.length > 0) {
      const updatedPosts = [...newPosts, ...currentPosts];
      updatePostsFile(updatedPosts);
      console.log(`=== ${newPosts.length}개의 새 글이 발행되었습니다 ===`);
    }

    console.log(`완료 시간: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}`);

  } catch (error) {
    console.error('오류 발생:', error);
    // 오류 알림 이메일 발송 (선택)
    // sendErrorEmail(error);
  }
}

/**
 * 트렌드 키워드 선택
 */
function selectTrendKeyword(category) {
  const trends = CATEGORY_TRENDS[category];
  if (!trends) return { keyword: '라이프스타일', sources: [] };

  const keyword = trends.keywords[Math.floor(Math.random() * trends.keywords.length)];
  // 랜덤으로 2-3개 출처 선택
  const shuffledSources = trends.sources.sort(() => 0.5 - Math.random());
  const selectedSources = shuffledSources.slice(0, Math.floor(Math.random() * 2) + 2);

  return { keyword, sources: selectedSources };
}

/**
 * Gemini API로 글 생성 (트렌드 키워드 + 출처 포함)
 */
function generatePost(category, newId) {
  const { keyword, sources } = selectTrendKeyword(category);
  const sourceList = sources.join(', ');

  const prompt = `당신은 20-30대 여성을 위한 라이프스타일 매거진 "dod.mag"의 전문 에디터입니다.
다음 조건에 맞는 매거진 기사를 작성해주세요:

■ 기본 정보
- 카테고리: ${category}
- 트렌드 키워드: ${keyword}
- 타겟 독자: 20-30대 여성, 자기계발과 트렌드에 관심 많음
- 참고할 출처: ${sourceList}

■ 작성 요청사항
1. 제목: 클릭을 유도하는 매력적인 제목 (25-35자)
   - 숫자, 질문형, 또는 트렌드 키워드 포함 권장

2. 요약: 본문 내용을 함축한 2-3문장 (100자 내외)

3. 본문: 2000-2500자의 깊이 있는 콘텐츠
   - 소제목(■)을 사용해 3-4개 섹션으로 구조화
   - 최신 트렌드와 데이터 인용
   - 구체적인 예시 포함
   - 독자가 실천할 수 있는 액션 아이템 2-3개 포함

4. 본문 맨 마지막에 반드시 다음 형식으로 출처 기재:
   ---
   📚 참고자료
   - [출처1 이름] (연도 또는 "최근 보고서")
   - [출처2 이름] (연도 또는 "최근 보고서")
   - [출처3 이름] (연도 또는 "공식 발표")

■ 응답 형식 (JSON만 반환)
{
  "title": "한글 제목",
  "title_en": "English Title",
  "summary": "한글 요약",
  "summary_en": "English Summary",
  "content": "한글 본문 (출처 포함)",
  "content_en": "English Content (with sources)"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 8192
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

        // Unsplash 랜덤 이미지 (카테고리별 키워드)
        const imageKeywords = {
          '인사이트': 'lifestyle,trend,modern,minimal',
          '신상품': 'product,gadget,technology,design',
          '라이프': 'wellness,health,fitness,yoga',
          '브랜드': 'brand,store,business,fashion'
        };

        // 더 나은 이미지 URL 생성
        const imageId = Math.floor(Math.random() * 1000000);

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
          image: `https://source.unsplash.com/1200x800/?${encodeURIComponent(imageKeywords[category])}&sig=${imageId}`,
          keyword: keyword, // 사용된 키워드 저장
          sources: sources  // 참고 출처 저장
        };
      }
    } else {
      console.error('Gemini 응답 오류:', JSON.stringify(result));
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
 * 테스트 함수 - 단일 글 생성 테스트
 */
function testGeneration() {
  console.log('테스트 시작...');
  console.log('선택된 카테고리: 인사이트');

  const { keyword, sources } = selectTrendKeyword('인사이트');
  console.log(`선택된 키워드: ${keyword}`);
  console.log(`선택된 출처: ${sources.join(', ')}`);

  const post = generatePost('인사이트', 999);
  if (post) {
    console.log('=== 생성된 글 ===');
    console.log(`제목: ${post.title}`);
    console.log(`요약: ${post.summary}`);
    console.log(`본문 길이: ${post.content.length}자`);
    console.log('본문 미리보기:');
    console.log(post.content.substring(0, 500) + '...');
  } else {
    console.log('글 생성 실패');
  }
}

/**
 * 전체 테스트 - 실제 발행 없이 테스트
 */
function testFullGeneration() {
  console.log('=== 전체 테스트 시작 ===');

  CATEGORIES.forEach((category, index) => {
    console.log(`\n[${index + 1}] ${category} 카테고리 테스트`);
    const { keyword, sources } = selectTrendKeyword(category);
    console.log(`  키워드: ${keyword}`);
    console.log(`  출처: ${sources.join(', ')}`);
  });

  console.log('\n=== 테스트 완료 ===');
  console.log('실제 발행하려면 generateAndPublishPosts() 함수를 실행하세요.');
}
