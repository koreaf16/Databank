# 런북 — PDF 렌더 실패 대응

`/api/reports/render-pdf` 호출이 실패했을 때의 절차.

## 1. 증상 분류

| 응답 | 의미 |
|---|---|
| 500 + `{ ok: false, error: { code: "INTERNAL", ... } }` | Chrome 실행 실패 또는 HTML 빌드 오류 |
| 500 + `code: "ORACLE_UNAVAILABLE"` | 마스터 템플릿 조회 실패 |
| 빈 PDF | virtual-time-budget 짧음 또는 HTML 렌더 안 됨 |
| 한글 깨짐 | 폰트 누락 |

## 2. Chrome 실행 가능 여부

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --version

# Linux
google-chrome --version
chromium --version
```

ENV 강제:
```
CHROME_PATH=/usr/bin/google-chrome
```

`backend/src/infra/pdf/chromeRenderer.js`의 `findChromeExecutable`이 `CHROME_PATH`를 우선 사용해야 한다.

## 3. 직접 실행 테스트

```bash
echo '<html><body>한글 테스트</body></html>' > /tmp/test.html

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --headless --disable-gpu \
  --print-to-pdf=/tmp/test.pdf \
  file:///tmp/test.html

# Linux
google-chrome --headless --disable-gpu --no-sandbox \
  --print-to-pdf=/tmp/test.pdf \
  file:///tmp/test.html
```

PDF 결과를 열어 한글이 보이는지 확인.

## 4. 한글 폰트 누락 (Linux)

```bash
# Debian/Ubuntu
apt-get install -y fonts-noto-cjk fonts-nanum

# RHEL/Rocky
yum install -y google-noto-sans-cjk-ttc-fonts
```

설치 후 Chrome 재기동 불필요(매 호출마다 새 프로세스).

## 5. virtual-time-budget 부족

증상: 빈 페이지 또는 차트 미렌더.

대응: `chromeRenderer.js`의 인자에서 `--virtual-time-budget=15000` → `30000` 등으로 늘림.

## 6. Express body 크기 한계

증상: `PayloadTooLargeError`.

대응: `app.js`의 `express.json({ limit: '5mb' })`를 `'10mb'` 등으로.

## 7. 임시 파일 디스크 풀

증상: `ENOSPC`.

대응:
```bash
df -h /tmp
# 임시 파일 정리
find /tmp -name "report-*.html" -mtime +1 -delete
find /tmp -name "report-*.pdf" -mtime +1 -delete
```

코드 측: 렌더 후 임시 파일 즉시 삭제 확인.

## 8. 컨테이너에서 실행 시 권한

```
[1234:1234:0421/120000.123:ERROR:zygote_host_impl_linux.cc(91)] Running as root without --no-sandbox is not supported
```

대응: `--no-sandbox` 인자 추가. 컨테이너 외부에서는 권장 안 함.

## 9. Logo/이미지 안 나옴

- `<img src="...">`의 절대경로 file:// 사용 시 OS별 형식 다름:
  - Windows: `file:///C:/path/to/img.png`
  - Linux/Mac: `file:///path/to/img.png`
- base64 data URL 권장: `<img src="data:image/png;base64,..."/>`

## 10. 디버깅: HTML 그대로 저장

`chromeRenderer.js`에 임시 디버그 옵션:

```javascript
if (process.env.DEBUG_PDF) {
  fs.copyFileSync(htmlFile, path.join(os.tmpdir(), `databank-pdf-debug-${Date.now()}.html`));
}
```

`DEBUG_PDF=1`로 기동 → 실패 시 HTML 직접 열어보기.

## 관련
- [../guides/pdf-rendering.md](../guides/pdf-rendering.md)
- [../modules/weekly-report/README.md](../modules/weekly-report/README.md)
