/**
 * 파일: frontend/src/features/knowledge-base/utils/kbUtils.js
 * 역할: 지식베이스 카테고리 트리 탐색 및 라벨 변환 유틸.
 *
 * 연관 파일:
 *   - KnowledgeBasePage.jsx : descendantCategoryIds, byOrder, getVersionMatch
 *   - KbRegisterModal.jsx : docTypeLabel, sourceTypeLabel
 *   - KbDocDetail.jsx : indexStatusLabel, docTypeLabel
 *   - KbCategoryNode.jsx : descendantCategoryIds
 */

export function descendantCategoryIds(categories, parentId) {
  const children = categories.filter(c => c.parentId === parentId);
  return children.flatMap(c => [c.id, ...descendantCategoryIds(categories, c.id)]);
}

export function byOrder(a, b) {
  return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name);
}

// 버전 문자열에서 앞 숫자 부분 추출 ("19c"→19, "19.0.0"→19, "23.26"→23, "23ai"→23)
function extractMajorNum(v: string): number | null {
  const m = String(v).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function getVersionMatch(doc, version) {
  const v = version.trim().toLowerCase();
  if (!v) return null;
  const versions = (doc.productVersions || []).map(x => String(x).toLowerCase());

  // 정확 일치
  if (versions.includes(v)) return 'exact';

  // 범용 문서
  if (versions.includes('all') || doc.versionRange === 'all') return 'general';

  // versionRange 텍스트 포함
  if (doc.versionRange && doc.versionRange.toLowerCase().includes(v)) return 'compatible';

  // 메이저 버전 번호 퍼지 매칭 (예: "19.0.0"→19 → "19c" 매칭)
  const filterMajor = extractMajorNum(v);
  if (filterMajor !== null && versions.some(dv => extractMajorNum(dv) === filterMajor)) {
    return 'compatible';
  }

  return null;
}

export function docTypeLabel(type) {
  return ({ check_item: '점검항목', training: '교육자료', runbook: 'Runbook', incident_case: '장애사례', vendor_manual: '벤더문서', policy: '정책' })[type] || type;
}

export function sourceTypeLabel(type) {
  return ({ file: '업로드 파일', url: 'URL 수집', text: '직접 입력 문서' })[type] || type;
}

export function indexStatusLabel(status: string) {
  return ({ active: '활성', queued: '대기', running: '진행 중', done: '완료', failed: '실패' })[status] || status;
}

export function indexStageLabel(stage: string) {
  return ({ 
    queued: '대기 중', 
    downloading: '다운로드 중',
    validating: '검증 중',
    saving: '저장 중',
    parsing: '텍스트 추출 중',
    extracting: '텍스트 추출 중', 
    chunking: '청킹 진행 중', 
    embedding: '벡터 생성 중', 
    indexing: '색인 중',
    done: '완료',
    failed: '실패' 
  })[stage] || stage;
}
