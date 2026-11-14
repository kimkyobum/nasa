const CHOSEONG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const CHOSEONG_SET = new Set(CHOSEONG_LIST);

export function extractChoseong(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / 588);
      out += CHOSEONG_LIST[idx];
    } else {
      out += text[i].toLowerCase();
    }
  }
  return out;
}

export function isChoseongQuery(query: string): boolean {
  let hasChoseong = false;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === ' ' || ch === '·' || ch === '-') continue;
    if (CHOSEONG_SET.has(ch)) {
      hasChoseong = true;
    } else {
      return false;
    }
  }
  return hasChoseong;
}

export function matchesHangulOrText(target: string, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (target.toLowerCase().includes(q)) return true;

  if (isChoseongQuery(q)) {
    const compactTarget = extractChoseong(target).replace(/\s+/g, '');
    const compactQuery = q.replace(/\s+/g, '');
    return compactTarget.includes(compactQuery);
  }
  return false;
}
