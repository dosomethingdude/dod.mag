# dod.mag 초보자 가이드

> 이 문서는 프로젝트 진행 중 필요한 작업들을 초보자도 따라할 수 있도록 상세히 안내합니다.

---

## 의사소통 원칙

1. **초보자 관점 유지**: 모든 안내는 처음 하는 사람도 이해할 수 있도록 작성
2. **왜(Why) 설명**: 단순히 "이렇게 해라"가 아닌, 왜 이 작업이 필요한지 설명
3. **정확한 절차**: 사용자가 직접 해야 하는 작업은 단계별로 상세히 안내
4. **에러 대응**: 흔히 발생하는 에러와 해결 방법 포함

---

## 현재 진행 중: GitHub에 코드 업로드하기

### 왜 필요한가?
- 로컬 컴퓨터에만 있는 코드를 인터넷(GitHub)에 올려야 합니다
- 그래야 Cloudflare Pages가 코드를 가져와서 웹사이트로 배포할 수 있습니다
- 또한 코드 백업, 버전 관리, 협업이 가능해집니다

### 현재 상태
- [x] 로컬에 Git 저장소 생성 완료
- [x] 코드 커밋 완료
- [x] GitHub에 빈 저장소(dod.mag) 생성 완료
- [ ] **로컬 → GitHub 업로드 (현재 단계)**

### 문제 상황
GitHub에 코드를 올리려면 "너 누구야?"를 증명해야 합니다.
이를 위해 **Personal Access Token**(개인 접근 토큰)이 필요합니다.

---

## Personal Access Token 발급 방법

### 왜 필요한가?
- GitHub는 보안상 비밀번호 대신 토큰을 사용합니다
- 토큰은 "이 사람이 정말 이 계정 주인이다"를 증명하는 열쇠입니다

### 단계별 안내

**1단계: GitHub 계정 Settings로 이동**
```
GitHub.com 접속 → 우측 상단 프로필 사진 클릭 → "Settings" 클릭
```
⚠️ 주의: 저장소(Repository)의 Settings가 아닙니다!

**2단계: Developer settings 찾기**
```
Settings 페이지 좌측 메뉴 맨 아래쪽 → "Developer settings" 클릭
```

**3단계: Personal Access Token 생성**
```
Developer settings → "Personal access tokens" → "Tokens (classic)" 클릭
→ "Generate new token" → "Generate new token (classic)" 클릭
```

**4단계: 토큰 설정**
```
- Note: dod.mag (토큰 이름, 아무거나 OK)
- Expiration: 90 days (또는 원하는 기간)
- Select scopes: "repo" 체크박스 선택 (맨 위에 있음)
```

**5단계: 토큰 생성 및 복사**
```
맨 아래 "Generate token" 클릭
→ 생성된 토큰(ghp_로 시작하는 긴 문자열) 복사
```
⚠️ 중요: 이 토큰은 다시 볼 수 없습니다! 반드시 복사해두세요.

---

## 토큰 발급 후: GitHub에 코드 업로드

### 터미널에서 실행할 명령어

**1단계: 프로젝트 폴더로 이동**
```bash
cd /Users/myuning/dod.mag
```
왜? Git 명령어는 프로젝트 폴더 안에서 실행해야 합니다.

**2단계: GitHub에 업로드**
```bash
git push -u origin main
```
왜? 로컬의 코드를 원격(GitHub)으로 보내는 명령입니다.

**3단계: 인증 정보 입력**
```
Username: dosomethingdude (GitHub 아이디)
Password: (복사한 토큰 붙여넣기 - 화면에 안 보여도 정상)
```

### 성공하면 이런 메시지가 나옵니다
```
Enumerating objects: 10, done.
Counting objects: 100% (10/10), done.
...
To https://github.com/dosomethingdude/dod.mag.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

## 다음 단계: Cloudflare Pages 배포

GitHub 업로드가 완료되면 다음 가이드를 추가하겠습니다.

---

## 자주 발생하는 에러

### "fatal: not a git repository"
**원인**: Git이 없는 폴더에서 명령어를 실행함
**해결**: `cd /Users/myuning/dod.mag` 로 프로젝트 폴더로 이동 후 재실행

### "Authentication failed"
**원인**: 토큰이 잘못되었거나 만료됨
**해결**: 새 토큰 발급 후 재시도

### "remote origin already exists"
**원인**: 이미 원격 저장소가 연결되어 있음
**해결**: 정상입니다. `git push -u origin main` 만 실행하면 됩니다.

---

## 용어 설명

| 용어 | 설명 |
|------|------|
| Git | 코드 버전 관리 도구. "저장" 버튼을 여러 번 누르면서 히스토리를 남기는 것과 비슷 |
| GitHub | Git으로 관리하는 코드를 인터넷에 저장하는 서비스 |
| Repository (저장소) | 하나의 프로젝트를 담는 폴더 |
| Commit | 코드 변경사항을 저장하는 것 (게임의 세이브 포인트와 비슷) |
| Push | 로컬 컴퓨터의 코드를 GitHub로 업로드하는 것 |
| Pull | GitHub의 코드를 로컬 컴퓨터로 다운로드하는 것 |
| Token | 비밀번호 대신 사용하는 인증 열쇠 |

---

## 배포 전 점검 체크리스트

> GitHub Actions로 자동 생성된 글이 배포되기 전에 아래 항목을 점검하세요.

### 1. 이미지-콘텐츠 키워드 일치 확인

자동 생성된 글의 이미지가 글 주제와 맞는지 반드시 확인해야 합니다.

**점검 방법:**
1. `posts.json`에서 새로 추가된 게시글을 확인합니다
2. 각 게시글의 `title`과 `image` URL을 비교합니다
3. 이미지 URL을 브라우저에서 열어 글 주제와 맞는지 확인합니다

**자주 발생하는 불일치 유형:**
| 문제 유형 | 예시 | 심각도 |
|-----------|------|--------|
| 완전 무관한 이미지 | 축구 기사에 요리 이미지 | 심각 |
| 유사하지만 다른 분야 | 자동차 기사에 자전거 이미지 | 보통 |
| 포괄적 이미지 | 특정 브랜드 기사에 일반 패션 이미지 | 경미 |

**카테고리별 적합한 이미지 키워드:**

| 카테고리 | 적합한 이미지 키워드 |
|----------|---------------------|
| 인사이트 | city, lifestyle, trend, society, culture, data, graph |
| 신상품 | product, technology, gadget, food, car, device |
| 라이프 | wellness, health, yoga, meditation, nature, fitness |
| 브랜드 | fashion, luxury, store, brand, design, architecture |

**이미지 교체 방법:**
1. Unsplash(https://unsplash.com)에서 글 주제에 맞는 키워드로 검색
2. 이미지 URL 형식: `https://images.unsplash.com/photo-{ID}?w=1200&q=80`
3. `posts.json`에서 해당 게시글의 `image` 필드를 새 URL로 교체

### 2. 깨진 글씨 점검

자동 생성 시 Unicode 인코딩 문제로 깨진 글씨(�)가 발생할 수 있습니다.

**점검 방법:**
```bash
# posts.json에서 깨진 문자 검색
grep -P '\xEF\xBF\xBD' posts.json
```

- `generate-posts.js`에 `cleanBrokenCharacters()` 함수가 자동 필터링하지만, 100% 방지는 불가
- 깨진 글씨 발견 시 문맥에 맞게 수동으로 수정 필요

### 3. 팩트체크 및 출처 확인

- 자동 생성된 글의 핵심 사실(날짜, 수치, 인물명 등)이 정확한지 확인
- `sources` 필드에 출처가 포함되어 있는지 확인
- 출처 URL이 실제로 접근 가능한지 확인

### 4. 전체 점검 체크리스트

새 글이 자동 생성된 후 아래 항목을 순서대로 확인하세요:

- [ ] 이미지가 글 주제와 일치하는가?
- [ ] 깨진 글씨(�)가 없는가?
- [ ] 제목/요약/본문이 자연스러운가?
- [ ] 출처가 명시되어 있는가?
- [ ] 한국어/영어 버전이 모두 있는가?
- [ ] 카테고리가 적절한가?
- [ ] 날짜가 오늘 날짜인가?

### 5. Google Search Console 등록 가이드

사이트를 Google 검색에 노출시키려면 Search Console에 등록해야 합니다.

**1단계: Google Search Console 접속**
```
https://search.google.com/search-console 에 접속
→ Google 계정으로 로그인
```

**2단계: 속성 추가**
```
좌측 상단 "속성 추가" 클릭
→ "URL 접두어" 선택
→ https://dod-mag.pages.dev 입력
→ "계속" 클릭
```

**3단계: 소유권 확인**
```
"HTML 태그" 방법 선택 (가장 쉬움)
→ 제공되는 <meta> 태그를 index.html의 <head> 안에 추가
→ GitHub에 커밋 & 푸시
→ Cloudflare에 배포 완료 후 "확인" 버튼 클릭
```

**4단계: sitemap 제출**
```
좌측 메뉴 "Sitemaps" 클릭
→ sitemap URL 입력: sitemap.xml
→ "제출" 클릭
```

**5단계: 색인 요청 (선택)**
```
상단 검색창에 개별 게시글 URL 입력
예: https://dod-mag.pages.dev/#/post/70
→ "색인 생성 요청" 클릭
```

> Google이 사이트를 크롤링하고 검색 결과에 표시하기까지 보통 1~4주 정도 소요됩니다.

---

*마지막 업데이트: 2026.02.08*
