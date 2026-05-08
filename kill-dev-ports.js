/**
 * 파일: kill-dev-ports.js
 * 역할: 개발 서버 시작 전 7000/7001 포트 및 잔여 tsx watch 프로세스 정리.
 *       wmic 없이 PowerShell Get-CimInstance 로 동작 (Windows 11 호환).
 */
const { execFileSync } = require('child_process');

const PORTS = [7000, 7001];

function ps(script) {
  try {
    return execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8' },
    );
  } catch {
    return '';
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function killPid(pid) {
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    console.log(`[kill-ports] PID ${pid} 종료`);
  } catch {
    // 이미 종료됨
  }
}

// 포트별 LISTENING 프로세스 종료 후 해제 확인
for (const port of PORTS) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const out = ps(
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`
    );
    const pids = [...new Set(
      out.split('\n')
        .map(l => parseInt(l.trim(), 10))
        .filter(n => n > 0)
    )];

    if (pids.length === 0) {
      console.log(`[kill-ports] port ${port} 사용 중 없음`);
      break;
    }

    for (const pid of pids) {
      console.log(`[kill-ports] port ${port} → PID ${pid} 종료`);
      killPid(pid);
    }
    sleep(600);
  }
}
