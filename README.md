# 물리학 Ⅱ · 학습 노트

물리학 II 학습지 기반 정적 학습 사이트입니다. 단원별 **개념·공식 정리**, 난이도별 **기본/심화 문제**, 그리고 **3단계 논술형 학습**(핵심 개념 → 풀이 전략 → 모범 답안)을 제공합니다.

- 빌드 도구·서버 없이 동작하는 순수 정적 사이트 (HTML/CSS/JS)
- 수식은 [KaTeX](https://katex.org/)로 렌더링 (CDN)
- 단원 3개 · 주제 15개 · 기본 130문항 · 심화 59문항 · 논술 22문항
- **단답형 자동 채점**: 모든 문제에 정답 입력칸이 있어 입력 후 즉시 채점(✓/✗). 계산형은 풀이의 최종 결괏값 숫자까지 인식
- **인터랙티브 물리 시뮬레이션**: 주제마다 슬라이더로 직접 조작하는 Canvas 시뮬레이션 15종
- **심화문제 전용 시뮬레이션**: 모든 심화문제(59문항)에 "시뮬레이션으로 확인" 버튼 — 문제의 수치를 그대로 넣어 바로 실행. 임의 개수 하중의 지레/평형 시뮬레이터, N개 저항 직렬·병렬 회로 포함
- **단계별 상세 풀이**: 심화문제는 개념 → 식 → 대입 → 답을 단계로 나눠 설명

## 파일 구성

```
index.html    화면 구조 (사이드바 + 탭)
styles.css    디자인 (청사진 그리드 · 공식 카드 · 난이도 색상 · 채점/시뮬레이션 UI)
app.js        렌더링 로직 (탭 전환 · 단답형 채점 · 정답 보기 · 3단계 펼치기)
data.js       학습 콘텐츠 (개념 · 공식 · 문제 · 논술 풀이)
sims.js       주제별 인터랙티브 Canvas 물리 시뮬레이션 (topic.id로 매핑)
```

## 로컬에서 미리 보기

브라우저로 `index.html`을 직접 열어도 되지만, 일부 브라우저의 보안 정책 때문에 간단한 로컬 서버로 여는 것을 권장합니다.

```bash
# Python이 설치된 경우
cd physics-site
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## GitHub Pages로 배포하기

아래 명령을 순서대로 실행하면 사이트가 인터넷에 공개됩니다. `<USERNAME>`은 본인의 GitHub 사용자명, `<REPO>`는 원하는 저장소 이름으로 바꾸세요.

### 1. 저장소 만들고 코드 올리기

GitHub CLI(`gh`)가 설치되어 있다면 한 번에 됩니다.

```bash
cd physics-site
git init
git add .
git commit -m "물리학 II 학습 노트"
git branch -M main

# gh CLI 사용 (가장 간단)
gh repo create <REPO> --public --source=. --remote=origin --push
```

`gh`가 없다면 [github.com](https://github.com/new)에서 빈 저장소를 먼저 만든 뒤:

```bash
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

### 2. GitHub Pages 켜기

1. 저장소 페이지 → **Settings** → 왼쪽 메뉴 **Pages**
2. **Source**를 `Deploy from a branch`로 선택
3. **Branch**를 `main` / `/ (root)`로 지정하고 **Save**
4. 1~2분 뒤 다음 주소로 사이트가 열립니다:

```
https://<USERNAME>.github.io/<REPO>/
```

> 명령줄로 Pages를 켜려면(gh CLI):
> ```bash
> gh api -X POST repos/<USERNAME>/<REPO>/pages -f "source[branch]=main" -f "source[path]=/"
> ```

### 3. 내용 수정 후 다시 배포

`data.js`만 고치면 문제·개념을 자유롭게 바꿀 수 있습니다. 수정 후:

```bash
git add .
git commit -m "내용 수정"
git push
```

푸시하면 GitHub Pages가 자동으로 다시 배포합니다.

## 콘텐츠 수정 방법

`data.js`의 `CURRICULUM` 배열을 편집하세요. 구조는 다음과 같습니다.

```js
{
  id: "mechanics",
  title: "역학",
  topics: [
    {
      id: "torque",
      title: "돌림힘",
      tagline: "한 줄 설명",
      concepts: [
        { name: "개념 제목", body: "설명(HTML 가능)", formulas: [{ latex: "\\tau = rF", desc: "설명" }] }
      ],
      basic:    [{ q: "문제", a: "정답" }],
      advanced: [{ q: "문제", a: "정답" }],
      essays:   [{ q: "논술 문제", steps: ["1단계 힌트", "2단계 전략", "3단계 모범답안"] }]
    }
  ]
}
```

수식은 `$ ... $`(인라인) 또는 `$$ ... $$`(블록)로 감싸면 자동 렌더링됩니다. (`data.js`의 `latex` 필드는 이미 수식 전용이라 기호만 넣으면 됩니다.)

### 단답형 채점

각 문제의 `a`(정답) 필드를 기준으로 자동 채점합니다. 입력값과 정답을 공백·구두점·LaTeX를 제거해 비교하며, 괄호 안 보충 설명 `( ... )`은 별도 인정 답안으로도 처리합니다.

- 짧은 개념·단답형(예: `알짜힘(합력)`, `토크`)은 정확하게 채점됩니다.
- 여러 단계 계산형 정답은 자동 채점이 어려울 수 있으니, 학생이 **정답 보기**로 직접 비교하도록 안내 문구가 표시됩니다.

### 시뮬레이션 추가·교체

`sims.js`의 `REG` 객체에 `topic.id`를 키로 하는 함수를 추가하면 해당 주제의 **개념 탭** 하단에 시뮬레이션이 자동으로 붙습니다.

```js
const REG = {
  torque(host) {
    // host 안에 컨트롤(슬라이더)·캔버스를 만들고
    // run(canvas, drawFn) 의 반환값(정리 함수)을 return 한다.
  }
};
```

키가 없는 주제는 시뮬레이션 영역이 표시되지 않습니다. 현재 15개 주제 전부에 시뮬레이션이 들어 있습니다.
