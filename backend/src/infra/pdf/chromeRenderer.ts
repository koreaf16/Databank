/**
 * 파일: backend/src/infra/pdf/chromeRenderer.ts
 * 역할: Chrome(또는 Edge) headless를 spawn해 HTML → PDF 변환.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PDF_TIMEOUT_MS = Number(process.env.CHROME_PDF_TIMEOUT_MS || 30000);

/**
 * HTML 파일을 PDF로 렌더링한다.
 */
export function renderPdfWithChrome(htmlPath: string, pdfPath: string): Promise<void> {
  const chrome = findChromeExecutable();
  if (!chrome) {
    return Promise.reject(new Error('Chrome 또는 Edge 실행 파일을 찾을 수 없습니다. CHROME_PATH를 설정하거나 Chrome을 설치하세요.'));
  }

  const fileUrl = pathToFileURL(htmlPath).href;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--print-to-pdf=${pdfPath}`,
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    fileUrl,
  ];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(chrome, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Chrome PDF 렌더 타임아웃'));
    }, PDF_TIMEOUT_MS);

    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr || `Chrome가 종료 코드 ${code}로 종료됨`));
    });
  });
}

/**
 * OS별 Chrome/Edge 실행 파일 경로를 탐색한다.
 */
export function findChromeExecutable(): string | null {
  const candidates: (string | undefined | null)[] = [
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}
