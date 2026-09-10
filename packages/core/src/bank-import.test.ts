import { describe, expect, it } from 'vitest';
import { parseVietinbankOcrText } from './bank-import';

// Text laid out the way Tesseract reads a two-column card when the label and
// its value land on separate OCR lines - the common case. Modelled on a real
// "Yêu cầu của tôi" > "Đã duyệt" > "Chuyển tiền" screenshot with two cards.
const TWO_CARD_TEXT = `
Yêu cầu của tôi
Đã duyệt
Chuyển tiền
Tất cả
Trong VietinBank
Nhanh 24/7
10 Giao dịch
Nhanh 24/7
6,500,000 VND
Chuyển tới
CONG TY TNHH DAU TU VAN TAI HAI MINH
Ngân hàng Quân đội – 8551100116001
Nội dung
august storage
Thời gian tạo
30/08/2026 16:29:12
Trạng thái
Thành công
Số giao dịch 1031926H25810864
Nhanh 24/7
9,396,000 VND
Chuyển tới
CT TNHH DAI LY THUE Q.P.T
Ngân hàng Ngoại thương Việt Nam (VCB) – 0181003502766
Nội dung
AHNG thanh toan cong no QPT
Thời gian tạo
25/08/2026 11:30:21
Trạng thái
Thành công
`;

describe('parseVietinbankOcrText', () => {
  it('parses two cards laid out one field per line', () => {
    const rows = parseVietinbankOcrText(TWO_CARD_TEXT);
    expect(rows).toHaveLength(2);

    const [first, second] = rows;
    expect(first).toMatchObject({
      direction: 'Nhanh 24/7',
      amount: 6_500_000,
      currency: 'VND',
      recipientName: 'CONG TY TNHH DAU TU VAN TAI HAI MINH',
      recipientBank: 'Ngân hàng Quân đội',
      recipientAccountNumber: '8551100116001',
      content: 'august storage',
      transactionRef: '1031926H25810864',
      status: 'SUCCESS',
      statusRaw: 'Thành công',
    });
    expect(first!.occurredAt?.toISOString()).toBe('2026-08-30T09:29:12.000Z');
    expect(first!.warnings).toEqual([]);

    expect(second).toMatchObject({
      direction: 'Nhanh 24/7',
      amount: 9_396_000,
      recipientName: 'CT TNHH DAI LY THUE Q.P.T',
      recipientBank: 'Ngân hàng Ngoại thương Việt Nam (VCB)',
      recipientAccountNumber: '0181003502766',
      content: 'AHNG thanh toan cong no QPT',
      // Not every card shows a reference - the screenshot this is modelled
      // on cuts off before this second card's own reference line.
      transactionRef: null,
      status: 'SUCCESS',
    });
    expect(second!.occurredAt?.toISOString()).toBe('2026-08-25T04:30:21.000Z');
  });

  it('parses a card where every label and value share one OCR line', () => {
    const text = `
Nhanh 24/7 6,500,000 VND
Chuyển tới CONG TY ABC
Ngân hàng ABC – 123456789
Nội dung mua hàng
Thời gian tạo 01/01/2026 10:00:00
Trạng thái Thành công
Số giao dịch ABC123456
`;
    const rows = parseVietinbankOcrText(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      direction: 'Nhanh 24/7',
      amount: 6_500_000,
      recipientName: 'CONG TY ABC',
      recipientBank: 'Ngân hàng ABC',
      recipientAccountNumber: '123456789',
      content: 'mua hàng',
      status: 'SUCCESS',
      transactionRef: 'ABC123456',
    });
    expect(rows[0]!.occurredAt?.toISOString()).toBe('2026-01-01T03:00:00.000Z');
  });

  it('maps a failed and a pending status', () => {
    const text = `
Nhanh 24/7
1,000,000 VND
Trạng thái
Thất bại

Nhanh 24/7
2,000,000 VND
Trạng thái
Đang xử lý
`;
    const [failed, pending] = parseVietinbankOcrText(text);
    expect(failed!.status).toBe('FAILED');
    expect(pending!.status).toBe('PENDING');
  });

  it('still returns a row for a card missing every field but the amount, with warnings', () => {
    const rows = parseVietinbankOcrText('1,000 VND');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(1_000);
    expect(rows[0]!.recipientName).toBeNull();
    expect(rows[0]!.warnings.length).toBeGreaterThan(0);
  });

  it('returns no rows when the text has no readable amount at all', () => {
    expect(parseVietinbankOcrText('this is not a bank statement')).toEqual([]);
  });

  it('tolerates a period as the thousands separator', () => {
    const rows = parseVietinbankOcrText('Nhanh 24/7\n6.500.000 VND');
    expect(rows[0]!.amount).toBe(6_500_000);
  });
});
