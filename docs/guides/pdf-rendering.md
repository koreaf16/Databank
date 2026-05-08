# PDF 렌더링 가이드

주간업무보고와 보고서 마스터 템플릿이 PDF 출력을 사용한다. 구현은 `chrome --headless --print-to-pdf`이다.

## 동작 흐름

```
프론트
  └─ POST /api/reports/render-pdf  (HTML 본문 + 옵션)
        ↓
백엔드 modules/weekly-report/services/reportRenderer.js
  ├─ HTML 빌드 (마스터 템플릿 + 데이터 머지)
  ├─ 임시 디렉토리에 .html 저장
  └─ infra/pdf/chromeRenderer.js
        ├─ findChromeExecutable() — OS별 Chrome 경로 탐색
        ├─ child_process.spawn('chrome', ['--headless', '--disable-gpu',
        │     '--print-to-pdf=<out>', '<file:///tmp/...>.html'])
        └─ 결과 PDF 바이너리 회수
        ↓
응답: Content-Type: application/pdf, Content-Disposition: attachment
```

## OS별 Chrome 경로

`findChromeExecutable`는 다음 순서로 찾는다.

### Windows
- `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`

### Linux (운영 검토 필요)
- `/usr/bin/google-chrome`
- `/usr/bin/google-chrome-stable`
- `/usr/bin/chromium-browser`
- `/usr/bin/chromium`

### macOS (개발 PC)
- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

자동 탐색 실패 시 ENV `CHROME_PATH=...`로 명시.

## 옵션 (Chrome 인자)

기본값:
```
--headless
--disable-gpu
--no-sandbox                  (Linux 컨테이너에서만 권장)
--print-to-pdf=<output>
--print-to-pdf-no-header
--no-margins                  (필요 시)
--virtual-time-budget=15000   (JS 실행 대기 시간 ms)
```

## HTML 본문 작성 권장

- `<style>` 인라인. 외부 CSS는 file:// 프로토콜 차단으로 보안 이슈
- 한글 폰트: `font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;`
- 차트는 SVG 인라인(현 `generateSvgCharts`가 SVG 직접 생성)
- 이미지는 base64 data URL 또는 file:// 절대경로

## 마스터 템플릿

`REPORT_MASTER_TEMPLATES` 테이블에 HTML/CSS/LLM 프롬프트가 보관됨. 주간보고서 생성 시 이 템플릿에 데이터를 머지.

머지 방식: 단순 문자열 치환(`{{teamName}}` 등) 또는 `services/reportRenderer.js`의 `buildReportHtml` 사용.

## 흔한 실패

| 증상 | 원인 / 대응 |
|---|---|
| Chrome 미설치 | `CHROME_PATH` 명시 또는 Chrome 설치 |
| timeout | `--virtual-time-budget` 늘리기 또는 차트 단순화 |
| 한글 깨짐 | 폰트 패밀리 명시, OS에 한글 폰트 설치 |
| 빈 페이지 | HTML이 inline JS로 렌더되는데 `--virtual-time-budget` 짧음 |
| Linux: 권한 오류 | `--no-sandbox` 추가, 컨테이너에서는 root 회피 |
| 큰 파일 | Express body limit 확인(`5mb` 기본) |

장애 대응: [../runbooks/pdf-render-failure.md](../runbooks/pdf-render-failure.md)

## 보안

- HTML payload에 사용자 입력이 포함되면 XSS 위험은 PDF 자체엔 적지만, 메타데이터 유출 가능. `escapeHtml` 적용
- Chrome 인자에 외부 입력 직접 삽입 금지 — `child_process.spawn` 사용(쉘 우회)

## 관련
- 코드: `backend/src/infra/pdf/{chromeRenderer.js,htmlUtils.js}`, `backend/src/modules/weekly-report/services/reportRenderer.js`
- 문서: [../modules/weekly-report/README.md](../modules/weekly-report/README.md)
