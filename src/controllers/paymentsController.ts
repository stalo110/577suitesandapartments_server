import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PNG } from 'pngjs';
import { Request, Response } from 'express';
import type { ParsedQs } from 'qs';
import { Payment } from '../models/PaymentModel';
import { Transaction } from '../models/TransactionModel';
import { Booking } from '../models/BookingModel';
import { Suite } from '../models/SuiteModel';
import { User } from '../models/UserModel';
import PaymentDispatcher from '../services/PaymentDispatcher';
import { logPayment, logPaymentError } from '../utils/paymentLogger';
import { getEnvValue, getPaymentEnvironmentSummary } from '../utils/paymentEnv';

type ReceiptData = {
  reference: string;
  bookingReference: string;
  guestName: string;
  email: string;
  phone: string;
  suiteName: string;
  suiteType: string;
  checkIn: string;
  checkOut: string;
  amount: number;
  gateway: string;
  status: string;
  createdAt: Date;
};

type ReceiptRow = {
  label: string;
  value: string;
  maxChars?: number;
};

type PngColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ReceiptLogoAsset = {
  png: PNG;
  buffer: Buffer;
};

const PNG_COLORS = {
  pageBackground: { r: 246, g: 249, b: 253, a: 255 },
  white: { r: 255, g: 255, b: 255, a: 255 },
  border: { r: 214, g: 226, b: 239, a: 255 },
  header: { r: 11, g: 37, b: 69, a: 255 },
  gold: { r: 212, g: 175, b: 55, a: 255 },
  titleLight: { r: 229, g: 239, b: 250, a: 255 },
  sectionBand: { r: 240, g: 246, b: 253, a: 255 },
  textPrimary: { r: 18, g: 38, b: 58, a: 255 },
  textMuted: { r: 94, g: 114, b: 138, a: 255 },
  success: { r: 31, g: 157, b: 85, a: 255 },
  warning: { r: 181, g: 125, b: 40, a: 255 },
  summary: { r: 236, g: 244, b: 253, a: 255 },
} satisfies Record<string, PngColor>;

const formatCurrency = (value: number) =>
  `NGN ${Number(value).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatReceiptDate = (value: Date | string, includeTime = false) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  const options: Intl.DateTimeFormatOptions = includeTime
    ? {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }
    : {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      };
  return new Intl.DateTimeFormat('en-NG', options).format(parsed);
};

const normalizeReceiptText = (value: string | null | undefined) => {
  const sanitized = String(value ?? '').trim();
  return sanitized || 'N/A';
};

const dispatcher = new PaymentDispatcher();

const normalizeGateway = (gateway?: string, reference?: string) => {
  const normalized = gateway?.toLowerCase();
  if (normalized === 'paystack' || normalized === 'flutterwave') {
    return normalized;
  }
  if (reference?.startsWith('PAY-')) {
    return 'paystack';
  }
  if (reference?.startsWith('FLW-')) {
    return 'flutterwave';
  }
  return null;
};

const toPaymentGateway = (gateway: 'paystack' | 'flutterwave') =>
  gateway === 'paystack' ? 'PAYSTACK' : 'FLUTTERWAVE';

const normalizeGatewayValue = (gateway: string | string[]): string => {
  if (Array.isArray(gateway)) {
    return gateway[0] || '';
  }
  return gateway;
};

const normalizeQueryParam = (
  value?: string | string[] | ParsedQs | (string | ParsedQs)[]
): string => {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : '';
  }
  return typeof value === 'string' ? value : '';
};

const buildCallbackBaseUrl = (req: Request) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || req.protocol;
  return `${proto}://${req.get('host')}`;
};

const mergePaymentDetails = (
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
) => ({
  ...(existing || {}),
  ...next,
});

let cachedReceiptLogoPath: string | null | undefined;
let cachedReceiptLogoPng: PNG | null | undefined;
let cachedReceiptLogoAsset: ReceiptLogoAsset | null | undefined;

const resolveReceiptLogoPath = () => {
  if (cachedReceiptLogoPath !== undefined) {
    return cachedReceiptLogoPath;
  }
  const envLogoPath = getEnvValue('RECEIPT_LOGO_PATH');
  const candidates = [
    envLogoPath,
    path.resolve(process.cwd(), 'Client/public/logo.png'),
    path.resolve(process.cwd(), '../Client/public/logo.png'),
    path.resolve(process.cwd(), '../../Client/public/logo.png'),
    path.resolve(__dirname, '../../../Client/public/logo.png'),
    path.resolve(__dirname, '../../../../Client/public/logo.png'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  cachedReceiptLogoPath = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  return cachedReceiptLogoPath;
};

const loadReceiptLogoPng = () => {
  if (cachedReceiptLogoPng !== undefined) {
    return cachedReceiptLogoPng;
  }
  const logoPath = resolveReceiptLogoPath();
  if (!logoPath) {
    cachedReceiptLogoPng = null;
    return cachedReceiptLogoPng;
  }
  try {
    cachedReceiptLogoPng = PNG.sync.read(fs.readFileSync(logoPath));
  } catch (_error) {
    cachedReceiptLogoPng = null;
  }
  return cachedReceiptLogoPng;
};

const resizePng = (source: PNG, targetWidth: number, targetHeight: number) => {
  const resized = new PNG({ width: targetWidth, height: targetHeight });
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y / targetHeight) * source.height));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / targetWidth) * source.width));
      const sourceIndex = (source.width * sourceY + sourceX) << 2;
      const targetIndex = (targetWidth * y + x) << 2;
      resized.data[targetIndex] = source.data[sourceIndex];
      resized.data[targetIndex + 1] = source.data[sourceIndex + 1];
      resized.data[targetIndex + 2] = source.data[sourceIndex + 2];
      resized.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  return resized;
};

const getReceiptLogoAsset = () => {
  if (cachedReceiptLogoAsset !== undefined) {
    return cachedReceiptLogoAsset;
  }

  const sourceLogo = loadReceiptLogoPng();
  if (!sourceLogo) {
    cachedReceiptLogoAsset = null;
    return cachedReceiptLogoAsset;
  }

  const maxWidth = 280;
  const maxHeight = 180;
  const scale = Math.min(maxWidth / sourceLogo.width, maxHeight / sourceLogo.height, 1);
  const targetWidth = Math.max(1, Math.round(sourceLogo.width * scale));
  const targetHeight = Math.max(1, Math.round(sourceLogo.height * scale));
  const resizedLogo = resizePng(sourceLogo, targetWidth, targetHeight);
  cachedReceiptLogoAsset = {
    png: resizedLogo,
    buffer: PNG.sync.write(resizedLogo),
  };
  return cachedReceiptLogoAsset;
};

const FONT_5X7: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  '@': ['01110', '10001', '10011', '10101', '10111', '10000', '01110'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

const normalizePngText = (text: string) =>
  normalizeReceiptText(text).toUpperCase().replace(/[^A-Z0-9 @:.,\-\/()]/g, ' ');

const drawTextOnPng = (
  png: PNG,
  x: number,
  y: number,
  text: string,
  scale = 2,
  color: PngColor = PNG_COLORS.textPrimary
) => {
  const safeText = normalizePngText(text);
  let cursorX = x;
  for (const char of safeText) {
    const pattern = FONT_5X7[char] || FONT_5X7['?'];
    for (let rowIndex = 0; rowIndex < pattern.length; rowIndex += 1) {
      const row = pattern[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (row[colIndex] !== '1') {
          continue;
        }
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = cursorX + colIndex * scale + dx;
            const py = y + rowIndex * scale + dy;
            if (px < 0 || py < 0 || px >= png.width || py >= png.height) {
              continue;
            }
            const idx = (png.width * py + px) << 2;
            png.data[idx] = color.r;
            png.data[idx + 1] = color.g;
            png.data[idx + 2] = color.b;
            png.data[idx + 3] = color.a;
          }
        }
      }
    }
    cursorX += (5 + 1) * scale;
  }
};

const wrapText = (text: string, maxChars: number) => {
  const normalized = normalizeReceiptText(text);
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  const flushCurrent = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  words.forEach((word) => {
    if (!word) {
      return;
    }
    if (word.length > maxChars) {
      flushCurrent();
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      flushCurrent();
      current = word;
      return;
    }
    current = next;
  });
  flushCurrent();

  return lines.length ? lines : [normalized];
};

const fillPngRect = (
  png: PNG,
  x: number,
  y: number,
  width: number,
  height: number,
  color: PngColor
) => {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(png.width, Math.floor(x + width));
  const endY = Math.min(png.height, Math.floor(y + height));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const idx = (png.width * py + px) << 2;
      png.data[idx] = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = color.a;
    }
  }
};

const drawPngRectBorder = (
  png: PNG,
  x: number,
  y: number,
  width: number,
  height: number,
  borderColor: PngColor,
  borderWidth = 1
) => {
  fillPngRect(png, x, y, width, borderWidth, borderColor);
  fillPngRect(png, x, y + height - borderWidth, width, borderWidth, borderColor);
  fillPngRect(png, x, y, borderWidth, height, borderColor);
  fillPngRect(png, x + width - borderWidth, y, borderWidth, height, borderColor);
};

const drawPngImage = (
  target: PNG,
  source: PNG,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const drawWidth = Math.min(Math.floor(width), target.width - Math.floor(x));
  const drawHeight = Math.min(Math.floor(height), target.height - Math.floor(y));
  if (drawWidth <= 0 || drawHeight <= 0) {
    return;
  }

  const offsetX = Math.max(0, Math.floor(x));
  const offsetY = Math.max(0, Math.floor(y));

  for (let dy = 0; dy < drawHeight; dy += 1) {
    const sy = Math.floor((dy / drawHeight) * source.height);
    for (let dx = 0; dx < drawWidth; dx += 1) {
      const sx = Math.floor((dx / drawWidth) * source.width);
      const sidx = (source.width * sy + sx) << 2;
      const alpha = source.data[sidx + 3] / 255;
      if (alpha <= 0) {
        continue;
      }

      const tx = offsetX + dx;
      const ty = offsetY + dy;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) {
        continue;
      }
      const tidx = (target.width * ty + tx) << 2;
      const inverseAlpha = 1 - alpha;

      target.data[tidx] = Math.round(source.data[sidx] * alpha + target.data[tidx] * inverseAlpha);
      target.data[tidx + 1] = Math.round(
        source.data[sidx + 1] * alpha + target.data[tidx + 1] * inverseAlpha
      );
      target.data[tidx + 2] = Math.round(
        source.data[sidx + 2] * alpha + target.data[tidx + 2] * inverseAlpha
      );
      target.data[tidx + 3] = 255;
    }
  }
};

const drawReceiptSectionPdf = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: ReceiptRow[]
) => {
  const paddingX = 16;
  const paddingY = 14;
  const labelWidth = 138;
  const rowGap = 8;
  const valueWidth = width - paddingX * 2 - labelWidth - 10;

  doc.font('Helvetica-Bold').fontSize(10);
  const rowHeights = rows.map((row) =>
    Math.max(14, doc.heightOfString(normalizeReceiptText(row.value), { width: valueWidth }))
  );
  const rowsHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);
  const sectionHeight = paddingY + 18 + 10 + rowsHeight + Math.max(0, rows.length - 1) * rowGap + paddingY;

  doc.save();
  doc.roundedRect(x, y, width, sectionHeight, 10).fillAndStroke('#F8FAFC', '#DCE6F1');
  doc.restore();

  doc.fillColor('#0B2545').font('Helvetica-Bold').fontSize(11).text(title, x + paddingX, y + paddingY);

  let rowY = y + paddingY + 28;
  rows.forEach((row, index) => {
    const rowHeight = rowHeights[index];
    doc
      .fillColor('#6B778C')
      .font('Helvetica')
      .fontSize(9)
      .text(row.label.toUpperCase(), x + paddingX, rowY + 1, { width: labelWidth });
    doc
      .fillColor('#12263A')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(normalizeReceiptText(row.value), x + paddingX + labelWidth + 10, rowY, {
        width: valueWidth,
      });
    rowY += rowHeight + rowGap;
  });

  return y + sectionHeight + 16;
};

const drawReceiptSectionPng = (png: PNG, y: number, title: string, rows: ReceiptRow[]) => {
  const sectionX = 40;
  const sectionWidth = png.width - 80;
  const titleBandHeight = 34;
  const padding = 16;
  const lineHeight = 18;
  const rowGap = 6;

  const rowLines = rows.map((row) =>
    wrapText(`${row.label}: ${normalizeReceiptText(row.value)}`, row.maxChars ?? 62)
  );
  const bodyHeight = rowLines.reduce(
    (sum, lines) => sum + lines.length * lineHeight + rowGap,
    0
  );
  const sectionHeight = padding + titleBandHeight + bodyHeight + padding - rowGap;

  fillPngRect(png, sectionX, y, sectionWidth, sectionHeight, PNG_COLORS.white);
  drawPngRectBorder(png, sectionX, y, sectionWidth, sectionHeight, PNG_COLORS.border);
  fillPngRect(png, sectionX + 1, y + 1, sectionWidth - 2, titleBandHeight, PNG_COLORS.sectionBand);
  drawTextOnPng(png, sectionX + padding, y + 12, title, 2, PNG_COLORS.textPrimary);

  let rowY = y + padding + titleBandHeight + 8;
  rowLines.forEach((lines) => {
    lines.forEach((line) => {
      drawTextOnPng(png, sectionX + padding, rowY, line, 2, PNG_COLORS.textPrimary);
      rowY += lineHeight;
    });
    rowY += rowGap;
  });

  return y + sectionHeight + 14;
};

export const buildReceiptPdf = (data: ReceiptData) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logoAsset = getReceiptLogoAsset();
    const contentX = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let cursorY = doc.page.margins.top;

    const statusValue = normalizeReceiptText(data.status).toUpperCase();
    const gatewayValue = normalizeReceiptText(data.gateway).toUpperCase();
    const formattedAmount = formatCurrency(data.amount);
    const statusColor = statusValue === 'PAID' ? '#1F9D55' : '#B57D28';

    const headerHeight = 124;
    doc.save();
    doc.roundedRect(contentX, cursorY, contentWidth, headerHeight, 12).fill('#0B2545');
    doc.restore();

    if (logoAsset) {
      try {
        doc.image(logoAsset.buffer, contentX + 16, cursorY + 18, { fit: [88, 88], align: 'center' });
      } catch (_error) {
        // Ignore invalid logo files; receipt generation should continue.
      }
    }

    const titleX = contentX + (logoAsset ? 120 : 24);
    doc.fillColor('#D4AF37').font('Helvetica-Bold').fontSize(9).text('OFFICIAL PAYMENT RECEIPT', titleX, cursorY + 18);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('Payment Receipt', titleX, cursorY + 32);
    doc
      .fillColor('#E4EDF7')
      .font('Helvetica')
      .fontSize(10)
      .text('517 VIP Suites & Apartments', titleX, cursorY + 62)
      .text(`Issued: ${formatReceiptDate(data.createdAt, true)}`, titleX, cursorY + 77);

    const metaX = contentX + contentWidth - 210;
    doc.fillColor('#C6D6E8').font('Helvetica').fontSize(9).text('Receipt No.', metaX, cursorY + 22, {
      width: 190,
      align: 'right',
    });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(normalizeReceiptText(data.reference), metaX, cursorY + 34, {
      width: 190,
      align: 'right',
    });
    doc.fillColor('#C6D6E8').font('Helvetica').fontSize(9).text('Booking Ref', metaX, cursorY + 54, {
      width: 190,
      align: 'right',
    });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(normalizeReceiptText(data.bookingReference), metaX, cursorY + 66, {
      width: 190,
      align: 'right',
    });

    cursorY += headerHeight + 18;

    const summaryHeight = 86;
    const summaryColumnWidth = contentWidth / 3;
    doc.save();
    doc.roundedRect(contentX, cursorY, contentWidth, summaryHeight, 10).fillAndStroke('#EEF4FC', '#D6E3F0');
    doc.restore();
    doc.save();
    doc.moveTo(contentX + summaryColumnWidth, cursorY + 16).lineTo(contentX + summaryColumnWidth, cursorY + summaryHeight - 16);
    doc.moveTo(contentX + summaryColumnWidth * 2, cursorY + 16).lineTo(contentX + summaryColumnWidth * 2, cursorY + summaryHeight - 16);
    doc.lineWidth(1).strokeColor('#D6E3F0').stroke();
    doc.restore();

    doc.fillColor('#6B778C').font('Helvetica').fontSize(9).text('STATUS', contentX + 16, cursorY + 20);
    doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(16).text(statusValue, contentX + 16, cursorY + 38);

    doc
      .fillColor('#6B778C')
      .font('Helvetica')
      .fontSize(9)
      .text('GATEWAY', contentX + summaryColumnWidth + 16, cursorY + 20);
    doc
      .fillColor('#12263A')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(gatewayValue, contentX + summaryColumnWidth + 16, cursorY + 40);

    doc
      .fillColor('#6B778C')
      .font('Helvetica')
      .fontSize(9)
      .text('AMOUNT PAID', contentX + summaryColumnWidth * 2 + 16, cursorY + 20);
    doc
      .fillColor('#12263A')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(formattedAmount, contentX + summaryColumnWidth * 2 + 16, cursorY + 40);

    cursorY += summaryHeight + 16;

    cursorY = drawReceiptSectionPdf(doc, contentX, cursorY, contentWidth, 'Guest Details', [
      { label: 'Guest Name', value: data.guestName },
      { label: 'Email Address', value: data.email },
      { label: 'Phone Number', value: data.phone },
    ]);

    cursorY = drawReceiptSectionPdf(doc, contentX, cursorY, contentWidth, 'Booking Details', [
      { label: 'Suite', value: data.suiteName },
      { label: 'Suite Type', value: data.suiteType },
      { label: 'Check-In', value: formatReceiptDate(data.checkIn) },
      { label: 'Check-Out', value: formatReceiptDate(data.checkOut) },
    ]);

    cursorY = drawReceiptSectionPdf(doc, contentX, cursorY, contentWidth, 'Payment Details', [
      { label: 'Payment Reference', value: data.reference },
      { label: 'Booking Reference', value: data.bookingReference },
      { label: 'Payment Gateway', value: gatewayValue },
      { label: 'Payment Status', value: statusValue },
      { label: 'Amount Paid', value: formattedAmount },
    ]);

    doc
      .fillColor('#6B778C')
      .font('Helvetica')
      .fontSize(9)
      .text(
        'This is a system-generated receipt and serves as confirmation of your successful payment.',
        contentX,
        cursorY + 2,
        {
          width: contentWidth,
          align: 'center',
        }
      );
    doc
      .fillColor('#12263A')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Thank you for choosing 517 VIP Suites & Apartments.', contentX, cursorY + 18, {
        width: contentWidth,
        align: 'center',
      });

    doc.end();
  });

const buildReceiptPng = async (data: ReceiptData) => {
  const width = 900;
  const height = 1200;
  const png = new PNG({ width, height });
  fillPngRect(png, 0, 0, width, height, PNG_COLORS.pageBackground);

  const statusValue = normalizeReceiptText(data.status).toUpperCase();
  const gatewayValue = normalizeReceiptText(data.gateway).toUpperCase();
  const formattedAmount = formatCurrency(data.amount);
  const statusColor = statusValue === 'PAID' ? PNG_COLORS.success : PNG_COLORS.warning;

  fillPngRect(png, 0, 0, width, 190, PNG_COLORS.header);
  fillPngRect(png, 0, 188, width, 2, PNG_COLORS.gold);

  const logoAsset = getReceiptLogoAsset();
  if (logoAsset) {
    drawPngImage(png, logoAsset.png, 36, 22, 138, 138);
  }

  const titleX = logoAsset ? 190 : 48;
  drawTextOnPng(png, titleX, 46, 'PAYMENT RECEIPT', 4, PNG_COLORS.white);
  drawTextOnPng(png, titleX, 98, '517 VIP SUITES AND APARTMENTS', 2, PNG_COLORS.gold);
  drawTextOnPng(png, titleX, 126, `RECEIPT NO: ${data.reference}`, 2, PNG_COLORS.titleLight);
  drawTextOnPng(
    png,
    titleX,
    152,
    `ISSUED: ${formatReceiptDate(data.createdAt, true)}`,
    2,
    PNG_COLORS.titleLight
  );

  let cursorY = 216;
  fillPngRect(png, 40, cursorY, 820, 92, PNG_COLORS.summary);
  drawPngRectBorder(png, 40, cursorY, 820, 92, PNG_COLORS.border);
  fillPngRect(png, 313, cursorY + 14, 1, 64, PNG_COLORS.border);
  fillPngRect(png, 586, cursorY + 14, 1, 64, PNG_COLORS.border);

  drawTextOnPng(png, 64, cursorY + 24, 'STATUS', 2, PNG_COLORS.textMuted);
  drawTextOnPng(png, 64, cursorY + 52, statusValue, 3, statusColor);

  drawTextOnPng(png, 340, cursorY + 24, 'GATEWAY', 2, PNG_COLORS.textMuted);
  drawTextOnPng(png, 340, cursorY + 52, gatewayValue, 3, PNG_COLORS.textPrimary);

  drawTextOnPng(png, 612, cursorY + 24, 'AMOUNT', 2, PNG_COLORS.textMuted);
  drawTextOnPng(png, 612, cursorY + 52, formattedAmount, 3, PNG_COLORS.textPrimary);

  cursorY += 112;
  cursorY = drawReceiptSectionPng(png, cursorY, 'GUEST DETAILS', [
    { label: 'Guest Name', value: data.guestName, maxChars: 64 },
    { label: 'Email Address', value: data.email, maxChars: 64 },
    { label: 'Phone Number', value: data.phone, maxChars: 64 },
  ]);

  cursorY = drawReceiptSectionPng(png, cursorY, 'BOOKING DETAILS', [
    { label: 'Suite Name', value: data.suiteName, maxChars: 64 },
    { label: 'Suite Type', value: data.suiteType, maxChars: 64 },
    { label: 'Check In', value: formatReceiptDate(data.checkIn), maxChars: 64 },
    { label: 'Check Out', value: formatReceiptDate(data.checkOut), maxChars: 64 },
  ]);

  cursorY = drawReceiptSectionPng(png, cursorY, 'PAYMENT DETAILS', [
    { label: 'Payment Reference', value: data.reference, maxChars: 64 },
    { label: 'Booking Reference', value: data.bookingReference, maxChars: 64 },
    { label: 'Payment Gateway', value: gatewayValue, maxChars: 64 },
    { label: 'Amount Paid', value: formattedAmount, maxChars: 64 },
  ]);

  fillPngRect(png, 40, cursorY, 820, 66, PNG_COLORS.white);
  drawPngRectBorder(png, 40, cursorY, 820, 66, PNG_COLORS.border);
  drawTextOnPng(
    png,
    58,
    cursorY + 18,
    'THIS RECEIPT IS SYSTEM GENERATED AND CONFIRMS YOUR SUCCESSFUL PAYMENT.',
    2,
    PNG_COLORS.textMuted
  );
  drawTextOnPng(
    png,
    58,
    cursorY + 40,
    'THANK YOU FOR CHOOSING 517 VIP SUITES AND APARTMENTS.',
    2,
    PNG_COLORS.textPrimary
  );

  return PNG.sync.write(png);
};

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const { bookingId, amount, gateway, email } = req.body;
    const parsedBookingId = Number(bookingId);

    if (!parsedBookingId || Number.isNaN(parsedBookingId)) {
      return res.status(400).json({ error: 'Invalid bookingId' });
    }

    const normalizedGateway = normalizeGateway(gateway);
    if (!normalizedGateway) {
      return res.status(400).json({ error: 'Unsupported payment gateway' });
    }

    const paymentEnvSummary = getPaymentEnvironmentSummary();
    if (normalizedGateway === 'paystack' && !paymentEnvSummary.paystack.secretFormatValid) {
      return res.status(500).json({
        error:
          'Payment gateway configuration error: PAYSTACK_SECRET_KEY is missing or invalid. Please set a valid Paystack secret key (sk_test_... or sk_live_...).',
      });
    }
    if (normalizedGateway === 'flutterwave' && !paymentEnvSummary.flutterwave.secretFormatValid) {
      return res.status(500).json({
        error:
          'Payment gateway configuration error: FLUTTERWAVE_SECRET_KEY is missing or invalid. Please set a valid Flutterwave secret key (FLWSECK_TEST-..., FLWSECK_LIVE-..., or FLWSECK-...).',
      });
    }

    const booking = await Booking.findByPk(parsedBookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const customerEmail = email || booking.email;
    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    const totalAmount = Number(booking.totalAmount);
    if (amount && Number(amount) !== totalAmount) {
      await logPaymentError('payment.amount.mismatch', {
        bookingId: parsedBookingId,
        expectedAmount: totalAmount,
        providedAmount: Number(amount),
      });
    }

    await logPayment('payment.initialize.start', {
      bookingId: parsedBookingId,
      gateway: normalizedGateway,
      email: customerEmail,
    });

    const callbackBaseUrl = buildCallbackBaseUrl(req);
    const result = await dispatcher.initiate(
      booking,
      normalizedGateway,
      customerEmail,
      callbackBaseUrl
    );

    const paymentGateway = toPaymentGateway(normalizedGateway);
    const payment = await Payment.create({
      bookingId: parsedBookingId,
      amount: totalAmount,
      gateway: paymentGateway,
      reference: result.reference,
      transactionId: `${paymentGateway}-${Date.now()}`,
      status: 'PENDING',
      paymentDetails: {
        initialization: result,
      },
    });

    await logPayment('payment.initialize.success', {
      bookingId: parsedBookingId,
      gateway: normalizedGateway,
      reference: result.reference,
    });

    return res.status(201).json({
      id: String(payment.id),
      reference: result.reference,
      transactionId: payment.transactionId,
      amount: Number(payment.amount),
      gateway: payment.gateway,
      authorization_url: (result as { authorization_url?: string }).authorization_url,
      link: (result as { link?: string }).link,
    });
  } catch (error: any) {
    await logPaymentError('payment.initialize.error', { error: error.message });
    const message = error?.message || 'Error initializing payment';
    const status = message.toLowerCase().includes('timeout') ? 504 : 400;
    return res.status(status).json({ error: message });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { reference: rawReference, tx_ref: txRef, trxref, gateway } = req.body;
    const reference = String(rawReference || txRef || trxref || '');

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    const normalizedGateway = normalizeGateway(gateway, reference);
    if (!normalizedGateway) {
      return res.status(400).json({ error: 'Unsupported payment gateway' });
    }

    await logPayment('payment.verify.start', { reference, gateway: normalizedGateway });

    const result = await dispatcher.verify(reference, normalizedGateway);
    const payment = await Payment.findOne({ where: { reference } });

    if (payment) {
      await payment.update({
        status: result.success ? 'PAID' : 'FAILED',
        gateway: toPaymentGateway(normalizedGateway),
        paymentDetails: mergePaymentDetails(payment.paymentDetails as Record<string, unknown>, {
          verification: result.gateway_response,
        }),
      });
    }

    return res.json({
      id: payment ? String(payment.id) : '',
      bookingId: payment ? String(payment.bookingId) : '',
      amount: payment ? Number(payment.amount) : 0,
      gateway: payment ? payment.gateway : toPaymentGateway(normalizedGateway),
      status: payment ? payment.status : result.success ? 'PAID' : 'FAILED',
      reference,
      createdAt: payment?.createdAt,
    });
  } catch (error: any) {
    await logPaymentError('payment.verify.error', {
      reference: req.body.reference,
      error: error.message,
    });
    const message = error?.message || 'Error verifying payment';
    const status = message.toLowerCase().includes('timeout') ? 504 : 400;
    return res.status(status).json({ error: message });
  }
};

export const verifyPaymentRedirect = async (req: Request, res: Response) => {
  const reference =
    normalizeQueryParam(req.query.reference) ||
    normalizeQueryParam(req.query.tx_ref) ||
    normalizeQueryParam(req.query.trxref);
  const gateway = normalizeQueryParam(req.query.gateway);

  if (!reference) {
    return res.status(400).json({ error: 'Reference is required' });
  }

  const normalizedGateway = normalizeGateway(gateway, reference);
  const frontendBaseRaw =
    process.env.PUBLIC_CLIENT_URL ||
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3039';
  const frontendBase = String(frontendBaseRaw).replace(/\/+$/, '');

  if (!normalizedGateway) {
    return res.redirect(`${frontendBase}/payment-failed?ref=${reference}`);
  }

  try {
    const result = await dispatcher.verify(reference, normalizedGateway);
    const payment = await Payment.findOne({ where: { reference } });

    if (payment) {
      await payment.update({
        status: result.success ? 'PAID' : 'FAILED',
        gateway: toPaymentGateway(normalizedGateway),
        paymentDetails: mergePaymentDetails(payment.paymentDetails as Record<string, unknown>, {
          verification: result.gateway_response,
        }),
      });
    }

    const redirectPath = result.success ? 'payment-success' : 'payment-failed';
    return res.redirect(`${frontendBase}/${redirectPath}?ref=${reference}&gateway=${normalizedGateway}`);
  } catch (error: any) {
    await logPaymentError('payment.verify.redirect_error', {
      reference,
      error: error.message,
    });
    return res.redirect(`${frontendBase}/payment-failed?ref=${reference}&gateway=${normalizedGateway}`);
  }
};

export const getPaymentConfig = async (_req: Request, res: Response) => {
  const paystackPublicKey = getEnvValue(
    'PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_LIVE_PUBLIC_KEY',
    'PAYSTACK_PUBLIC_KEY_LIVE',
    'PAYSTACK_PUBLIC'
  );
  const flutterwavePublicKey = getEnvValue(
    'FLUTTERWAVE_PUBLIC_KEY',
    'FLUTTERWAVE_LIVE_PUBLIC_KEY',
    'FLUTTERWAVE_PUBLIC_KEY_LIVE',
    'FLW_PUBLIC_KEY',
    'FLUTTERWAVE_PUBLIC'
  );
  const summary = getPaymentEnvironmentSummary();

  await logPayment('payment.config.fetch', {
    paystack: Boolean(paystackPublicKey),
    flutterwave: Boolean(flutterwavePublicKey),
    paystack_mode: summary.paystack.secretMode,
    flutterwave_mode: summary.flutterwave.secretMode,
  });

  return res.json({
    paystackPublicKey,
    flutterwavePublicKey,
    paystackMode: summary.paystack.secretMode,
    flutterwaveMode: summary.flutterwave.secretMode,
    paystackSecretConfigured: summary.paystack.secretConfigured,
    flutterwaveSecretConfigured: summary.flutterwave.secretConfigured,
  });
};

export const getTransactionByReference = async (req: Request, res: Response) => {
  try {
    const reference = String(req.params.reference);
    const transaction = await Transaction.findOne({
      where: { reference },
      include: [
        { model: Booking, as: 'booking' },
        { model: User, as: 'user', attributes: ['id', 'email', 'role'] },
      ],
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    let gatewayStatus: unknown = null;
    if (req.query.fresh === 'true') {
      try {
        const result = await dispatcher.verify(
          reference,
          normalizeGatewayValue(transaction.gateway)
        );
        gatewayStatus = result.gateway_response;
      } catch (error: any) {
        await logPaymentError('transaction.lookup.fresh_failed', {
          reference,
          error: error.message,
        });
      }
    }

    const payment = await Payment.findOne({ where: { reference } });

    return res.json({
      success: true,
      data: {
        transaction: transaction.toJSON(),
        payment: payment ? payment.toJSON() : null,
        gateway_fresh_status: gatewayStatus,
      },
    });
  } catch (error: any) {
    await logPaymentError('transaction.lookup.error', {
      reference: req.params.reference,
      error: error.message,
    });
    return res.status(500).json({ error: 'Failed to fetch transaction' });
  }
};

export const getAdminPayments = async (_req: Request, res: Response) => {
  try {
    const payments = await Payment.findAll({ order: [['createdAt', 'DESC']] });
    return res.json(
      payments.map((payment) => ({
        id: String(payment.id),
        bookingId: String(payment.bookingId),
        amount: Number(payment.amount),
        gateway: payment.gateway,
        status: payment.status,
        reference: payment.reference,
        createdAt: payment.createdAt,
      }))
    );
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching payments' });
  }
};

export const downloadReceipt = async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.paymentId);
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'PAID') {
      return res.status(400).json({ error: 'Receipt is available only for confirmed payments' });
    }

    const format = String(req.params.format);
    if (!['pdf', 'png'].includes(format)) {
      return res.status(400).json({ error: 'Format must be pdf or png' });
    }

    const booking = await Booking.findByPk(payment.bookingId, {
      include: [{ model: Suite, as: 'suite' }],
    });
    if (!booking || !booking.suite) {
      return res.status(404).json({ error: 'Booking details not found' });
    }
    if (booking.paymentStatus !== 'PAID' || booking.status !== 'CONFIRMED') {
      return res.status(400).json({ error: 'Receipt is available only for confirmed payments' });
    }

    const receiptData = {
      reference: payment.reference,
      bookingReference: booking.bookingReference,
      guestName: booking.guestName,
      email: booking.email,
      phone: booking.phone,
      suiteName: booking.suite.name,
      suiteType: booking.suite.type,
      checkIn: String(booking.checkIn),
      checkOut: String(booking.checkOut),
      amount: Number(payment.amount),
      gateway: payment.gateway,
      status: payment.status,
      createdAt: payment.createdAt || new Date(),
    };

    if (format === 'pdf') {
      const pdf = await buildReceiptPdf(receiptData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt_${payment.reference}.pdf"`
      );
      return res.send(pdf);
    }

    const png = await buildReceiptPng(receiptData);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt_${payment.reference}.png"`
    );
    return res.send(png);
  } catch (_error) {
    return res.status(500).json({ error: 'Error downloading receipt' });
  }
};
