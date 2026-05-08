/**
 * 파일: backend/src/modules/knowledge-base/services/parsers/xlsxParser.ts
 * 역할: Excel(XLSX/XLS) 파일에서 시트별 markdown 표를 추출한다.
 *       xlsx(SheetJS) 사용. 시트 하나가 하나의 table 블록.
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts : 등록
 */

import XLSX from 'xlsx';
import {
  type DocumentParser,
  type ParseResult,
  type ParseBlock,
  registerParser,
} from './parserRegistry.js';

const XLSX_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const xlsxParser: DocumentParser = {
  mimeTypes: XLSX_MIMES,

  async parse(buffer: Buffer, _filename: string): Promise<ParseResult> {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (err: any) {
      return {
        text: '',
        blocks: [],
        meta: { title: `[XLSX 파싱 오류: ${err.message?.slice(0, 80) ?? 'unknown'}]` },
      };
    }

    const blocks: ParseBlock[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
      }) as string[][];

      if (rows.length === 0) continue;

      // 첫 행을 heading으로
      const header = rows[0].map((c) => String(c ?? '').trim());
      const headerLine = `| ${header.join(' | ')} |`;
      const sepLine = `| ${header.map(() => '---').join(' | ')} |`;

      const dataLines = rows
        .slice(1)
        .map((row) => `| ${row.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
        .filter((l) => l.replace(/[| -]/g, '').trim());

      const tableText = [headerLine, sepLine, ...dataLines].join('\n');
      blocks.push({ kind: 'heading', level: 2, text: sheetName });
      blocks.push({ kind: 'table', text: tableText });
    }

    const text = blocks.map((b) => b.text).join('\n\n');
    return { text, blocks, meta: {} };
  },
};

registerParser(xlsxParser);
export default xlsxParser;
