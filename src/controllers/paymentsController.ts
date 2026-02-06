import PDFDocument from 'pdfkit';
import { PNG } from 'pngjs';
import { Request, Response } from 'express';
import { Payment } from '../models/PaymentModel';
import { Booking } from '../models/BookingModel';
import { Suite } from '../models/SuiteModel';
import {
  sendAdminPaymentNotification,
  sendPaymentConfirmationEmail,
} from '../utils/mailer';

const formatCurrency = (value: number) => `₦${Number(value).toLocaleString()}`;

const FONT_5X7: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
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

const drawTextOnPng = (png: PNG, x: number, y: number, text: string, scale = 2) => {
  const color = { r: 0, g: 0, b: 0, a: 255 };
  let cursorX = x;
  const upper = text.toUpperCase();
  for (const char of upper) {
    const pattern = FONT_5X7[char] || FONT_5X7['?'];
    pattern.forEach((row, rowIndex) => {
      row.split('').forEach((pixel, colIndex) => {
        if (pixel === '1') {
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              const px = cursorX + colIndex * scale + dx;
              const py = y + rowIndex * scale + dy;
              if (px < 0 || py < 0 || px >= png.width || py >= png.height) {
                return;
              }
              const idx = (png.width * py + px) << 2;
              png.data[idx] = color.r;
              png.data[idx + 1] = color.g;
              png.data[idx + 2] = color.b;
              png.data[idx + 3] = color.a;
            }
          }
        }
      });
    });
    cursorX += (5 + 1) * scale;
  }
};

const wrapText = (text: string, maxChars: number) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = next;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines;
};

const buildReceiptPdf = (data: {
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
}) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('517 VIP Suites & Apartments');
    doc.moveDown(0.5);
    doc.fontSize(14).text('Payment Receipt');
    doc.moveDown(1);

    doc.fontSize(11).text(`Receipt Date: ${data.createdAt.toLocaleString()}`);
    doc.text(`Payment Reference: ${data.reference}`);
    doc.text(`Booking Reference: ${data.bookingReference}`);
    doc.text(`Payment Status: ${data.status}`);
    doc.text(`Gateway: ${data.gateway}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Guest Details', { underline: true });
    doc.fontSize(11).text(`Name: ${data.guestName}`);
    doc.text(`Email: ${data.email}`);
    doc.text(`Phone: ${data.phone}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Booking Details', { underline: true });
    doc.fontSize(11).text(`Suite: ${data.suiteName} (${data.suiteType})`);
    doc.text(`Check-in: ${data.checkIn}`);
    doc.text(`Check-out: ${data.checkOut}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Amount', { underline: true });
    doc.fontSize(16).text(formatCurrency(data.amount));
    doc.moveDown(1);

    doc.fontSize(10).text('Thank you for choosing 517 VIP Suites & Apartments.');
    doc.end();
  });

const buildReceiptPng = async (data: {
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
}) => {
  const width = 900;
  const height = 1200;
  const png = new PNG({ width, height });
  png.data.fill(255);

  let cursorY = 40;
  const lineHeight = 20;
  const scale = 2;
  const writeLine = (text: string) => {
    drawTextOnPng(png, 40, cursorY, text, scale);
    cursorY += lineHeight;
  };

  writeLine('517 VIP SUITES AND APARTMENTS');
  cursorY += 10;
  writeLine('PAYMENT RECEIPT');
  cursorY += 10;

  writeLine(`RECEIPT DATE: ${data.createdAt.toLocaleString()}`);
  writeLine(`PAYMENT REF: ${data.reference}`);
  writeLine(`BOOKING REF: ${data.bookingReference}`);
  writeLine(`STATUS: ${data.status}`);
  writeLine(`GATEWAY: ${data.gateway}`);
  cursorY += 10;

  writeLine('GUEST DETAILS');
  writeLine(`NAME: ${data.guestName}`);
  writeLine(`EMAIL: ${data.email}`);
  writeLine(`PHONE: ${data.phone}`);
  cursorY += 10;

  writeLine('BOOKING DETAILS');
  writeLine(`SUITE: ${data.suiteName} (${data.suiteType})`);
  writeLine(`CHECK-IN: ${data.checkIn}`);
  writeLine(`CHECK-OUT: ${data.checkOut}`);
  cursorY += 10;

  writeLine(`AMOUNT: ${formatCurrency(data.amount)}`);
  cursorY += 10;

  writeLine('THANK YOU FOR CHOOSING 517 VIP SUITES.');
  cursorY += 10;

  const messageLines = wrapText(`Message: ${data.status}`, 40);
  messageLines.forEach((line) => writeLine(line));

  return PNG.sync.write(png);
};

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const { bookingId, amount, gateway } = req.body;
    const parsedBookingId = Number(bookingId);

    if (!['PAYSTACK', 'FLUTTERWAVE'].includes(gateway)) {
      return res.status(400).json({ error: 'Unsupported payment gateway' });
    }

    const booking = await Booking.findByPk(parsedBookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const reference = `PAY${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const transactionId = `${gateway}-${Date.now()}`;

    const payment = await Payment.create({
      bookingId: parsedBookingId,
      amount,
      gateway,
      reference,
      transactionId,
      status: 'PENDING',
      paymentDetails: {
        providerReference: reference,
        checkoutUrl: `${process.env.PUBLIC_CLIENT_URL || 'http://localhost:3039'}/checkout`,
      },
    });

    return res.status(201).json({
      id: String(payment.id),
      reference,
      transactionId,
      amount: Number(payment.amount),
      gateway,
      checkoutUrl: (payment.paymentDetails as Record<string, unknown>)?.checkoutUrl,
    });
  } catch (_error) {
    return res.status(400).json({ error: 'Error initializing payment' });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;

    const payment = await Payment.findOne({ where: { reference } });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await payment.update({ status: 'PAID' });
    await Booking.update(
      { status: 'CONFIRMED', paymentStatus: 'PAID' },
      { where: { id: Number(payment.bookingId) } }
    );

    const booking = await Booking.findByPk(payment.bookingId, {
      include: [{ model: Suite, as: 'suite' }],
    });
    const suite = booking?.suite;
    if (booking && suite) {
      try {
        await Promise.all([
          sendPaymentConfirmationEmail(
            booking.email,
            booking.guestName,
            suite.name,
            Number(payment.amount),
            payment.reference
          ),
          sendAdminPaymentNotification(
            booking.guestName,
            booking.email,
            suite.name,
            Number(payment.amount),
            payment.reference
          ),
        ]);
      } catch (emailError) {
        console.error('Failed to send payment emails:', emailError);
      }
    }

    return res.json({
      id: String(payment.id),
      bookingId: String(payment.bookingId),
      amount: Number(payment.amount),
      gateway: payment.gateway,
      status: payment.status,
      reference: payment.reference,
      createdAt: payment.createdAt,
    });
  } catch (_error) {
    return res.status(400).json({ error: 'Error verifying payment' });
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
