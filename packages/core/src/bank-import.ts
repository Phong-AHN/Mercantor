/**
 * Turns the raw OCR text of a VietinBank "transaction history" screenshot
 * (see the app's own "Yêu cầu của tôi" > "Đã duyệt" > "Chuyển tiền" list)
 * into structured rows. Pure text in, structured data out - no Node
 * built-ins, no image handling - so it is unit-testable without a real
 * image and reusable from wherever the OCR step itself runs
 * (`apps/web/src/features/bank-import/ocr.ts` today).
 *
 * The screenshot is a list of repeating cards, each shaped like:
 *
 *   <transfer method>          <amount> VND
 *   Chuyển tới
 *   <recipient name, sometimes wrapped over two lines>
 *   <bank name> – <account number>
 *   Nội dung
 *   <free-text note>
 *   Thời gian tạo
 *   DD/MM/YYYY HH:mm:ss
 *   Trạng thái
 *   <status>
 *   Số giao dịch <reference>          (not always present)
 *
 * Tesseract's line segmentation on a two-column card is not reliable - a
 * label and its value sometimes land on the same OCR line, sometimes on
 * two. Every field extractor here accepts both, and the parser is anchored
 * on the one line that is genuinely unambiguous regardless of layout noise:
 * the amount ("6,500,000 VND"). Everything else is found relative to that.
 */

export type BankTransactionStatusCode = 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN';

export interface ParsedBankTransaction {
  /** The bank app's own label for the transfer method - "Nhanh 24/7", etc. */
  direction: string | null;
  /** Whole VND - the currency has no subunit in practice. */
  amount: number | null;
  currency: 'VND';
  recipientName: string | null;
  recipientBank: string | null;
  recipientAccountNumber: string | null;
  content: string | null;
  transactionRef: string | null;
  status: BankTransactionStatusCode;
  /** The status text as OCR'd, kept even when it didn't map to a known code. */
  statusRaw: string | null;
  /** Converted from the screenshot's Vietnam local time (UTC+7) to UTC. */
  occurredAt: Date | null;
  /** The exact OCR lines this row was built from - shown next to the row so
   * a bad parse can be corrected by eye instead of re-uploading. */
  rawSegment: string;
  /** Anything this row could not confidently extract - surfaced in the
   * review UI rather than silently guessed at. */
  warnings: string[];
}

const AMOUNT_RE = /(\d{1,3}(?:[.,]\d{3})+)\s*(?:VND|VNĐ|₫|đ)\b/i;
const BANK_ACCOUNT_RE = /^(.{2,60}?)\s*[–—-]\s*(\d{6,20})\s*$/;
const TIME_RE = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

const LABELS = {
  recipient: [/^Chuy[eêể]n\s*t[oờớ]i\b\s*:?\s*(.*)$/i, /^Chuyen\s*toi\b\s*:?\s*(.*)$/i],
  content: [/^N[oôộ]i\s*dung\b\s*:?\s*(.*)$/i, /^Noi\s*dung\b\s*:?\s*(.*)$/i],
  time: [/^Th[oờ]i\s*gian\s*t[aạ]o\b\s*:?\s*(.*)$/i, /^Thoi\s*gian\s*tao\b\s*:?\s*(.*)$/i],
  status: [/^Tr[aạ]ng\s*th[aá]i\b\s*:?\s*(.*)$/i, /^Trang\s*thai\b\s*:?\s*(.*)$/i],
  ref: [/^S[oố]\s*giao\s*d[iị]ch\b\s*:?\s*(.*)$/i, /^So\s*giao\s*dich\b\s*:?\s*(.*)$/i],
} as const;

/** Any line that starts a known label - used to know where a wrapped or
 * missing value must stop, rather than swallowing the next field's line. */
function isLabelLine(line: string): boolean {
  return Object.values(LABELS)
    .flat()
    .some((re) => re.test(line));
}

/** Matches a label against `line`, on the same line if the value is right
 * there, otherwise on the next non-label line. Returns the consumed line
 * indices so the caller never double-reads a value as a later field. */
function extractField(
  lines: string[],
  patterns: readonly RegExp[],
): { value: string | null; labelIndex: number; valueIndex: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    for (const pattern of patterns) {
      const match = pattern.exec(lines[i]!);
      if (!match) continue;
      const sameLine = match[1]?.trim();
      if (sameLine) return { value: sameLine, labelIndex: i, valueIndex: i };
      const next = lines[i + 1];
      if (next && !isLabelLine(next) && !AMOUNT_RE.test(next)) {
        return { value: next.trim(), labelIndex: i, valueIndex: i + 1 };
      }
      return { value: null, labelIndex: i, valueIndex: i };
    }
  }
  return null;
}

function extractRecipient(lines: string[]): {
  name: string | null;
  bank: string | null;
  account: string | null;
} {
  const field = extractField(lines, LABELS.recipient);
  if (!field) return { name: null, bank: null, account: null };

  const nameParts = field.value ? [field.value] : [];
  let bank: string | null = null;
  let account: string | null = null;

  // The recipient's name can wrap onto the next line or two before the
  // "<bank> – <account>" line shows up; stop as soon as either that line or
  // another known label is reached, so a wrapped name never eats a field.
  for (let i = field.valueIndex + 1; i < lines.length && i < field.valueIndex + 4; i += 1) {
    const line = lines[i]!;
    const bankMatch = BANK_ACCOUNT_RE.exec(line);
    if (bankMatch) {
      bank = bankMatch[1]!.trim();
      account = bankMatch[2]!;
      break;
    }
    if (isLabelLine(line) || AMOUNT_RE.test(line)) break;
    nameParts.push(line);
  }

  return { name: nameParts.length ? nameParts.join(' ').trim() : null, bank, account };
}

function parseStatus(raw: string | null): BankTransactionStatusCode {
  if (!raw) return 'UNKNOWN';
  const text = raw.toLowerCase();
  if (text.includes('thành công') || text.includes('thanh cong') || text === 'success') {
    return 'SUCCESS';
  }
  if (
    text.includes('thất bại') ||
    text.includes('that bai') ||
    text.includes('không thành công') ||
    text.includes('khong thanh cong') ||
    text.includes('huỷ') ||
    text.includes('huy') ||
    text.includes('lỗi') ||
    text.includes('loi')
  ) {
    return 'FAILED';
  }
  if (
    text.includes('đang xử lý') ||
    text.includes('dang xu ly') ||
    text.includes('chờ') ||
    text.includes('cho xu ly') ||
    text.includes('pending')
  ) {
    return 'PENDING';
  }
  return 'UNKNOWN';
}

/** Vietnam has no DST and a fixed UTC+7 offset, so this is exact - never
 * `new Date(text)`, which would be read as the server's own local time. */
function parseVietnamDateTime(text: string): Date | null {
  const match = TIME_RE.exec(text);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, ss] = match.map(Number) as unknown as number[];
  return new Date(Date.UTC(yyyy!, mm! - 1, dd!, hh! - 7, min!, ss!));
}

function parseAmount(line: string): number | null {
  const match = AMOUNT_RE.exec(line);
  if (!match) return null;
  const digits = match[1]!.replace(/[.,]/g, '');
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * `text` is the full OCR output of one screenshot (or several concatenated -
 * the parser only cares about amount lines as anchors, so multiple
 * screenshots' worth of text works the same as one). Returns one row per
 * amount found; a screenshot with no readable amount produces no rows at
 * all rather than a row full of nulls.
 */
export function parseVietinbankOcrText(text: string): ParsedBankTransaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const anchors: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (AMOUNT_RE.test(lines[i]!)) anchors.push(i);
  }

  return anchors.map((anchorIndex, position) => {
    const segmentEnd = anchors[position + 1] ?? lines.length;
    const segment = lines.slice(anchorIndex, segmentEnd);
    const warnings: string[] = [];

    const amountLine = lines[anchorIndex]!;
    const amount = parseAmount(amountLine);
    if (amount === null) warnings.push('Could not parse the amount.');

    // The transfer-method label sits either before the amount on the same
    // line ("Nhanh 24/7   6,500,000 VND") or on the line right above it.
    const amountMatchIndex = AMOUNT_RE.exec(amountLine)?.index ?? 0;
    const sameLinePrefix = amountLine.slice(0, amountMatchIndex).trim();
    const previousLine = anchorIndex > 0 ? lines[anchorIndex - 1] : null;
    const direction =
      sameLinePrefix ||
      (previousLine && !isLabelLine(previousLine) && !AMOUNT_RE.test(previousLine)
        ? previousLine
        : null);

    const recipient = extractRecipient(segment);
    if (!recipient.name) warnings.push('Could not find the recipient.');
    if (!recipient.bank || !recipient.account) {
      warnings.push('Could not find the recipient bank/account.');
    }

    const content = extractField(segment, LABELS.content)?.value ?? null;

    const timeField = extractField(segment, LABELS.time);
    const occurredAt = timeField?.value ? parseVietnamDateTime(timeField.value) : null;
    if (timeField?.value && !occurredAt) warnings.push('Could not parse the timestamp.');
    if (!timeField?.value) warnings.push('Could not find a timestamp.');

    const statusField = extractField(segment, LABELS.status);
    const statusRaw = statusField?.value ?? null;
    const status = parseStatus(statusRaw);

    const refField = extractField(segment, LABELS.ref);
    // The reference is an alphanumeric token, not necessarily the whole
    // rest of the line (a stray OCR artefact from the copy icon sometimes
    // rides along after it).
    const transactionRef = refField?.value
      ? (/[A-Za-z0-9]{6,}/.exec(refField.value)?.[0] ?? null)
      : null;

    return {
      direction,
      amount,
      currency: 'VND',
      recipientName: recipient.name,
      recipientBank: recipient.bank,
      recipientAccountNumber: recipient.account,
      content,
      transactionRef,
      status,
      statusRaw,
      occurredAt,
      rawSegment: segment.join('\n'),
      warnings,
    };
  });
}
