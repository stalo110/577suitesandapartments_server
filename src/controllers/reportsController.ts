import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import { Request, Response } from 'express';
import { Booking } from '../models/BookingModel';
import { Payment } from '../models/PaymentModel';
import { RestaurantOrder } from '../models/RestaurantOrderModel';
import { Suite } from '../models/SuiteModel';

const parseDateRange = (req: Request) => {
  const { startDate, endDate } = req.query;
  const start = startDate ? new Date(String(startDate)) : new Date();
  if (!startDate) {
    start.setDate(start.getDate() - 30);
  }
  const end = endDate ? new Date(String(endDate)) : new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const toReportResponse = (data: any, period: { start: Date; end: Date }) => ({
  data,
  total: Array.isArray(data) ? data.length : 1,
  period: `${period.start.toISOString()} - ${period.end.toISOString()}`,
});

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const getIsoWeekLabel = (date: Date) => {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const formatMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const groupCounts = (items: Booking[], keyFn: (date: Date) => string) => {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = keyFn(item.createdAt || new Date());
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([period, total]) => ({ period, total }))
    .sort((a, b) => a.period.localeCompare(b.period));
};

interface PdfSection {
  title: string;
  lines?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
}

const REPORT_COLORS = {
  header: '#0B2545',
  gold: '#D4AF37',
  titleLight: '#E4EDF7',
  metaLight: '#C6D6E8',
  summaryBg: '#EEF4FC',
  summaryBorder: '#D6E3F0',
  sectionBg: '#F8FAFC',
  sectionBand: '#EEF4FC',
  border: '#DCE6F1',
  rowAlt: '#FBFDFF',
  textPrimary: '#12263A',
  textMuted: '#6B778C',
} as const;

let cachedReportLogoPath: string | null | undefined;

const resolveReportLogoPath = () => {
  if (cachedReportLogoPath !== undefined) {
    return cachedReportLogoPath;
  }

  const envLogoPath = process.env.RECEIPT_LOGO_PATH || process.env.REPORT_LOGO_PATH;
  const candidates = [
    envLogoPath,
    path.resolve(process.cwd(), 'Client/public/logo.png'),
    path.resolve(process.cwd(), '../Client/public/logo.png'),
    path.resolve(process.cwd(), '../../Client/public/logo.png'),
    path.resolve(__dirname, '../../../Client/public/logo.png'),
    path.resolve(__dirname, '../../../../Client/public/logo.png'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  cachedReportLogoPath = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  return cachedReportLogoPath;
};

const formatReportDate = (value: Date, includeTime = false) => {
  const formatter = new Intl.DateTimeFormat('en-NG', includeTime
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
      });
  return formatter.format(value);
};

const sanitizePdfCell = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').slice(0, 16);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const formatDatePdfCell = (value: unknown, includeTime = false) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const dateValue = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dateValue.getTime())) {
    return sanitizePdfCell(value);
  }

  return includeTime
    ? dateValue.toISOString().replace('T', ' ').slice(0, 16)
    : dateValue.toISOString().slice(0, 10);
};

const formatCurrencyPdfCell = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return sanitizePdfCell(value);
  }
  return `NGN ${amount.toFixed(2)}`;
};

const ensurePdfSpace = (
  doc: InstanceType<typeof PDFDocument>,
  requiredHeight: number
) => {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > pageBottom) {
    doc.addPage();
  }
};

const drawPdfSectionHeading = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  title: string
) => {
  const sectionHeight = 34;
  ensurePdfSpace(doc, sectionHeight + 8);
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, sectionHeight, 8).fillAndStroke(REPORT_COLORS.sectionBg, REPORT_COLORS.border);
  doc.restore();

  doc.save();
  doc
    .rect(x + 1, y + 1, width - 2, sectionHeight - 2)
    .fill(REPORT_COLORS.sectionBand);
  doc.restore();

  doc
    .fillColor(REPORT_COLORS.textPrimary)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x + 14, y + 11);

  doc.y = y + sectionHeight + 8;
};

const drawPdfTable = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  sectionTitle: string,
  headers: string[],
  rows: string[][]
) => {
  if (!headers.length) {
    return;
  }

  const columnCount = headers.length;
  const columnWidth = width / columnCount;
  const headerHeight = 24;
  const rowHeight = 22;
  const textPaddingX = 6;
  const textPaddingY = 7;

  const drawHeader = () => {
    ensurePdfSpace(doc, headerHeight + rowHeight);
    const y = doc.y;

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellX = x + columnIndex * columnWidth;
      const cellValue = sanitizePdfCell(headers[columnIndex] ?? '');
      doc
        .rect(cellX, y, columnWidth, headerHeight)
        .fillAndStroke(REPORT_COLORS.summaryBg, REPORT_COLORS.border);
      doc
        .fillColor(REPORT_COLORS.header)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(cellValue, cellX + textPaddingX, y + textPaddingY, {
          width: columnWidth - textPaddingX * 2,
          lineBreak: false,
          ellipsis: true,
        });
    }

    doc.y = y + headerHeight;
  };

  const drawRow = (cells: string[], rowIndex: number) => {
    const y = doc.y;
    const backgroundColor = rowIndex % 2 === 0 ? '#FFFFFF' : REPORT_COLORS.rowAlt;

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellX = x + columnIndex * columnWidth;
      const cellValue = sanitizePdfCell(cells[columnIndex] ?? '');

      doc
        .rect(cellX, y, columnWidth, rowHeight)
        .fillAndStroke(backgroundColor, REPORT_COLORS.border);

      doc
        .fillColor(REPORT_COLORS.textPrimary)
        .font('Helvetica')
        .fontSize(8.5)
        .text(cellValue, cellX + textPaddingX, y + textPaddingY, {
          width: columnWidth - textPaddingX * 2,
          lineBreak: false,
          ellipsis: true,
        });
    }

    doc.y = y + rowHeight;
  };

  drawHeader();

  const tableRows = rows.length
    ? rows
    : [
        [
          'No records found for selected period.',
          ...new Array(Math.max(0, columnCount - 1)).fill(''),
        ],
      ];

  tableRows.forEach((row, rowIndex) => {
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + rowHeight > pageBottom) {
      doc.addPage();
      drawPdfSectionHeading(doc, x, width, `${sectionTitle} (Continued)`);
      drawHeader();
    }
    drawRow(row, rowIndex);
  });

  doc.moveDown(0.7);
};

const drawPdfLineSection = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  lines: string[]
) => {
  const contentLines = lines.length ? lines : ['No data available.'];
  const sectionHeight = Math.max(42, contentLines.length * 16 + 24);
  ensurePdfSpace(doc, sectionHeight + 10);
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, sectionHeight, 8).fillAndStroke('#FFFFFF', REPORT_COLORS.border);
  doc.restore();

  let lineY = y + 12;
  contentLines.forEach((line) => {
    doc
      .fillColor(REPORT_COLORS.textPrimary)
      .font('Helvetica')
      .fontSize(10)
      .text(line, x + 14, lineY, { width: width - 28 });
    lineY += 16;
  });

  doc.y = y + sectionHeight + 10;
};

const drawPdfReportHeader = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  title: string,
  periodLabel: string,
  sectionCount: number,
  recordCount: number
) => {
  const logoPath = resolveReportLogoPath();
  let cursorY = doc.page.margins.top;
  const headerHeight = 126;

  doc.save();
  doc.roundedRect(x, cursorY, width, headerHeight, 12).fill(REPORT_COLORS.header);
  doc.restore();

  if (logoPath) {
    try {
      doc.image(logoPath, x + 16, cursorY + 18, { fit: [88, 88], align: 'center' });
    } catch (_error) {
      // Ignore logo rendering failure and continue report generation.
    }
  }

  const titleX = x + (logoPath ? 120 : 24);
  doc
    .fillColor(REPORT_COLORS.gold)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('OFFICIAL REPORT EXPORT', titleX, cursorY + 18);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(title, titleX, cursorY + 32, {
      width: width - (titleX - x) - 200,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .fillColor(REPORT_COLORS.titleLight)
    .font('Helvetica')
    .fontSize(10)
    .text('517 VIP Suites & Apartments', titleX, cursorY + 62)
    .text(`Period: ${periodLabel}`, titleX, cursorY + 77)
    .text(`Generated: ${formatReportDate(new Date(), true)}`, titleX, cursorY + 92);

  const metaX = x + width - 198;
  doc
    .fillColor(REPORT_COLORS.metaLight)
    .font('Helvetica')
    .fontSize(9)
    .text('SECTIONS', metaX, cursorY + 26, { width: 178, align: 'right' });
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(String(sectionCount), metaX, cursorY + 38, { width: 178, align: 'right' });
  doc
    .fillColor(REPORT_COLORS.metaLight)
    .font('Helvetica')
    .fontSize(9)
    .text('RECORDS', metaX, cursorY + 58, { width: 178, align: 'right' });
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(String(recordCount), metaX, cursorY + 70, { width: 178, align: 'right' });

  cursorY += headerHeight + 18;

  const summaryHeight = 78;
  const summaryColumnWidth = width / 3;
  doc.save();
  doc
    .roundedRect(x, cursorY, width, summaryHeight, 10)
    .fillAndStroke(REPORT_COLORS.summaryBg, REPORT_COLORS.summaryBorder);
  doc.restore();

  doc.save();
  doc
    .moveTo(x + summaryColumnWidth, cursorY + 14)
    .lineTo(x + summaryColumnWidth, cursorY + summaryHeight - 14);
  doc
    .moveTo(x + summaryColumnWidth * 2, cursorY + 14)
    .lineTo(x + summaryColumnWidth * 2, cursorY + summaryHeight - 14);
  doc.lineWidth(1).strokeColor(REPORT_COLORS.summaryBorder).stroke();
  doc.restore();

  doc
    .fillColor(REPORT_COLORS.textMuted)
    .font('Helvetica')
    .fontSize(9)
    .text('REPORT TYPE', x + 16, cursorY + 20);
  doc
    .fillColor(REPORT_COLORS.textPrimary)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(title, x + 16, cursorY + 37, {
      width: summaryColumnWidth - 26,
      lineBreak: false,
      ellipsis: true,
    });

  doc
    .fillColor(REPORT_COLORS.textMuted)
    .font('Helvetica')
    .fontSize(9)
    .text('SECTIONS', x + summaryColumnWidth + 16, cursorY + 20);
  doc
    .fillColor(REPORT_COLORS.textPrimary)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(String(sectionCount), x + summaryColumnWidth + 16, cursorY + 38);

  doc
    .fillColor(REPORT_COLORS.textMuted)
    .font('Helvetica')
    .fontSize(9)
    .text('TOTAL RECORDS', x + summaryColumnWidth * 2 + 16, cursorY + 20);
  doc
    .fillColor(REPORT_COLORS.textPrimary)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(String(recordCount), x + summaryColumnWidth * 2 + 16, cursorY + 38);

  return cursorY + summaryHeight + 16;
};

const buildPdfBuffer = (
  title: string,
  periodLabel: string,
  sections: PdfSection[]
) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentX = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalRecords = sections.reduce((sum, section) => {
      if (section.table) {
        return sum + section.table.rows.length;
      }
      if (section.lines) {
        return sum + section.lines.length;
      }
      return sum;
    }, 0);

    doc.y = drawPdfReportHeader(
      doc,
      contentX,
      contentWidth,
      title,
      periodLabel,
      sections.length,
      totalRecords
    );

    sections.forEach((section) => {
      drawPdfSectionHeading(doc, contentX, contentWidth, section.title);

      if (section.table) {
        drawPdfTable(doc, contentX, contentWidth, section.title, section.table.headers, section.table.rows);
        return;
      }

      drawPdfLineSection(doc, contentX, contentWidth, section.lines || []);
    });

    ensurePdfSpace(doc, 54);
    const footerY = doc.y;
    doc.save();
    doc.roundedRect(contentX, footerY, contentWidth, 44, 8).fillAndStroke('#FFFFFF', REPORT_COLORS.border);
    doc.restore();

    doc
      .fillColor(REPORT_COLORS.textMuted)
      .font('Helvetica')
      .fontSize(9)
      .text(
        'This report is system-generated and intended for internal administrative use.',
        contentX + 12,
        footerY + 12,
        { width: contentWidth - 24, align: 'center' }
      );
    doc
      .fillColor(REPORT_COLORS.textPrimary)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('517 VIP Suites & Apartments', contentX + 12, footerY + 25, {
        width: contentWidth - 24,
        align: 'center',
      });

    doc.end();
  });

type RevenueRow = {
  id: string;
  source: 'gateway_payment' | 'manual_booking' | 'restaurant_order';
  reference: string;
  bookingId: string | null;
  amount: number;
  channel: string;
  status: string;
  createdAt: Date | null;
};

type PeriodCountRow = {
  period: string;
  total: number;
};

type SummaryReportData = {
  bookings?: {
    total?: number;
    confirmed?: number;
    cancelled?: number;
    pending?: number;
    daily?: PeriodCountRow[];
    weekly?: PeriodCountRow[];
    monthly?: PeriodCountRow[];
  };
  revenue?: {
    totalRevenue?: number;
    paymentCount?: number;
    byGateway?: Record<string, number>;
    sources?: {
      gatewayPayments?: number;
      manualBookings?: number;
      restaurantOrders?: number;
    };
  };
  occupancy?: {
    totalSuites?: number;
    totalBookedNights?: number;
    daysInPeriod?: number;
    occupancyRate?: number;
  };
};

const withinRange = (period: { start: Date; end: Date }) => ({
  [Op.between]: [period.start, period.end],
});

const getRevenueRows = async (period: { start: Date; end: Date }): Promise<RevenueRow[]> => {
  const [payments, manualBookings, restaurantOrders] = await Promise.all([
    Payment.findAll({
      where: {
        status: 'PAID',
        createdAt: withinRange(period),
      },
      order: [['createdAt', 'DESC']],
    }),
    Booking.findAll({
      where: {
        manualBooking: true,
        paymentStatus: 'PAID',
        paymentMethod: {
          [Op.in]: ['cash', 'transfer'],
        },
        createdAt: withinRange(period),
      },
      order: [['createdAt', 'DESC']],
    }),
    RestaurantOrder.findAll({
      where: {
        paymentStatus: 'paid',
        createdAt: withinRange(period),
      },
      order: [['createdAt', 'DESC']],
    }),
  ]);

  const paymentRows: RevenueRow[] = payments.map((payment) => ({
    id: `payment-${payment.id}`,
    source: 'gateway_payment',
    reference: payment.reference,
    bookingId: String(payment.bookingId),
    amount: Number(payment.amount),
    channel: String(payment.gateway),
    status: payment.status,
    createdAt: payment.createdAt || null,
  }));

  const bookingRows: RevenueRow[] = manualBookings.map((booking) => ({
    id: `booking-${booking.id}`,
    source: 'manual_booking',
    reference: booking.bookingReference,
    bookingId: String(booking.id),
    amount: Number(booking.totalAmount),
    channel: String(booking.paymentMethod || 'cash').toUpperCase(),
    status: booking.paymentStatus,
    createdAt: booking.createdAt || null,
  }));

  const orderRows: RevenueRow[] = restaurantOrders.map((order) => ({
    id: `restaurant-${order.id}`,
    source: 'restaurant_order',
    reference: `RO-${order.id}`,
    bookingId: order.bookingId ? String(order.bookingId) : null,
    amount: Number(order.totalAmount),
    channel: `RESTAURANT_${String(order.paymentMethod || 'cash').toUpperCase()}`,
    status: order.paymentStatus,
    createdAt: order.createdAt || null,
  }));

  return [...paymentRows, ...bookingRows, ...orderRows].sort((a, b) => {
    const aTime = a.createdAt ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt ? b.createdAt.getTime() : 0;
    return bTime - aTime;
  });
};

const getRevenueByChannel = (rows: RevenueRow[]) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.channel] = (acc[row.channel] || 0) + Number(row.amount);
    return acc;
  }, {});

export const getBookingReports = async (req: Request, res: Response) => {
  try {
    const period = parseDateRange(req);
    const bookings = await Booking.findAll({
      where: {
        createdAt: withinRange(period),
      },
      order: [['createdAt', 'DESC']],
    });

    const data = bookings.map((booking) => ({
      id: String(booking.id),
      suiteId: String(booking.suiteId),
      guestName: booking.guestName,
      email: booking.email,
      phone: booking.phone,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmount: Number(booking.totalAmount),
      numberOfGuests: booking.numberOfGuests,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      manualBooking: booking.manualBooking,
      createdAt: booking.createdAt,
    }));

    return res.json(toReportResponse(data, period));
  } catch (_error) {
    return res.status(500).json({ error: 'Error generating bookings report' });
  }
};

export const getRevenueReports = async (req: Request, res: Response) => {
  try {
    const period = parseDateRange(req);
    const rows = await getRevenueRows(period);

    const data = rows.map((row) => ({
      id: row.id,
      source: row.source,
      bookingId: row.bookingId,
      amount: Number(row.amount),
      channel: row.channel,
      reference: row.reference,
      status: row.status,
      createdAt: row.createdAt,
    }));

    return res.json(toReportResponse(data, period));
  } catch (_error) {
    return res.status(500).json({ error: 'Error generating revenue report' });
  }
};

export const getOccupancyReports = async (req: Request, res: Response) => {
  try {
    const period = parseDateRange(req);
    const [totalSuites, bookings] = await Promise.all([
      Suite.count(),
      Booking.count({
        where: {
          createdAt: withinRange(period),
        },
      }),
    ]);

    const occupancyRate =
      totalSuites > 0 ? Number(((bookings / totalSuites) * 100).toFixed(2)) : 0;

    const data = [
      {
        totalSuites,
        totalBookings: bookings,
        occupancyRate,
      },
    ];

    return res.json(toReportResponse(data, period));
  } catch (_error) {
    return res.status(500).json({ error: 'Error generating occupancy report' });
  }
};

export const getSummaryReport = async (req: Request, res: Response) => {
  try {
    const period = parseDateRange(req);
    const [bookings, totalSuites, revenueRows] = await Promise.all([
      Booking.findAll({
        where: {
          createdAt: withinRange(period),
        },
      }),
      Suite.count(),
      getRevenueRows(period),
    ]);

    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(
      (booking) => booking.status === 'CONFIRMED'
    ).length;
    const cancelledBookings = bookings.filter(
      (booking) => booking.status === 'CANCELLED'
    ).length;
    const pendingBookings = bookings.filter(
      (booking) => booking.status === 'PENDING'
    ).length;

    const dailyBookings = groupCounts(bookings, formatDateKey);
    const weeklyBookings = groupCounts(bookings, getIsoWeekLabel);
    const monthlyBookings = groupCounts(bookings, formatMonthKey);

    const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.amount), 0);
    const paymentCount = revenueRows.length;
    const revenueByGateway = getRevenueByChannel(revenueRows);

    const confirmedBookingsList = bookings.filter(
      (booking) => booking.status === 'CONFIRMED'
    );
    const periodStart = new Date(period.start);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(period.end);
    periodEnd.setHours(23, 59, 59, 999);
    const periodEndExclusive = new Date(periodEnd.getTime());
    periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysInPeriod = Math.max(
      1,
      Math.round((periodEndExclusive.getTime() - periodStart.getTime()) / dayMs)
    );

    const totalBookedNights = confirmedBookingsList.reduce((sum, booking) => {
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      const overlapStart = checkIn > periodStart ? checkIn : periodStart;
      const overlapEnd = checkOut < periodEndExclusive ? checkOut : periodEndExclusive;
      const nights = Math.max(
        0,
        Math.round((overlapEnd.getTime() - overlapStart.getTime()) / dayMs)
      );
      return sum + nights;
    }, 0);

    const occupancyRate =
      totalSuites > 0
        ? Number(((totalBookedNights / (totalSuites * daysInPeriod)) * 100).toFixed(2))
        : 0;

    const summary = {
      bookings: {
        total: totalBookings,
        confirmed: confirmedBookings,
        cancelled: cancelledBookings,
        pending: pendingBookings,
        daily: dailyBookings,
        weekly: weeklyBookings,
        monthly: monthlyBookings,
      },
      revenue: {
        totalRevenue,
        paymentCount,
        byGateway: revenueByGateway,
        sources: {
          gatewayPayments: revenueRows
            .filter((row) => row.source === 'gateway_payment')
            .reduce((sum, row) => sum + row.amount, 0),
          manualBookings: revenueRows
            .filter((row) => row.source === 'manual_booking')
            .reduce((sum, row) => sum + row.amount, 0),
          restaurantOrders: revenueRows
            .filter((row) => row.source === 'restaurant_order')
            .reduce((sum, row) => sum + row.amount, 0),
        },
      },
      occupancy: {
        totalSuites,
        totalBookedNights,
        daysInPeriod,
        occupancyRate,
      },
    };

    return res.json(toReportResponse(summary, period));
  } catch (_error) {
    return res.status(500).json({ error: 'Error generating summary report' });
  }
};

const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const escapeValue = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/\"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeValue(row[header])).join(',')
    ),
  ];
  return lines.join('\n');
};

export const exportReport = async (req: Request, res: Response) => {
  const { type } = req.params;
  const format = String(req.query.format || 'csv').toLowerCase();

  if (!['csv', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'Only CSV or PDF export is supported' });
  }

  try {
    let data: Record<string, unknown>[] = [];
    let summary: SummaryReportData | null = null;
    const period = parseDateRange(req);

    if (type === 'bookings') {
      const bookings = await Booking.findAll({
        where: {
          createdAt: withinRange(period),
        },
      });
      data = bookings.map((booking) => ({
        id: booking.id,
        suiteId: booking.suiteId,
        guestName: booking.guestName,
        email: booking.email,
        phone: booking.phone,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalAmount: Number(booking.totalAmount),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        manualBooking: booking.manualBooking,
        createdAt: booking.createdAt,
      }));
    } else if (type === 'revenue') {
      const revenueRows = await getRevenueRows(period);
      data = revenueRows.map((row) => ({
        id: row.id,
        source: row.source,
        bookingId: row.bookingId,
        amount: Number(row.amount),
        channel: row.channel,
        status: row.status,
        reference: row.reference,
        createdAt: row.createdAt,
      }));
    } else if (type === 'occupancy') {
      const [totalSuites, bookings] = await Promise.all([
        Suite.count(),
        Booking.count({
          where: {
            createdAt: withinRange(period),
          },
        }),
      ]);
      data = [
        {
          totalSuites,
          totalBookings: bookings,
          occupancyRate:
            totalSuites > 0
              ? Number(((bookings / totalSuites) * 100).toFixed(2))
              : 0,
        },
      ];
    } else if (type === 'summary') {
      const summaryResponse = await new Promise<SummaryReportData>(
        (resolve, reject) => {
          const fakeRes = {
            json: (payload: { data: SummaryReportData }) => resolve(payload.data),
            status: () => ({
              json: (payload: { error?: string }) =>
                reject(new Error(payload.error || 'Error generating summary report')),
            }),
          } as unknown as Response;
          getSummaryReport(req, fakeRes).catch(reject);
        }
      );

      summary = summaryResponse;
      data = [
        {
          totalBookings: summary.bookings?.total,
          confirmedBookings: summary.bookings?.confirmed,
          cancelledBookings: summary.bookings?.cancelled,
          pendingBookings: summary.bookings?.pending,
          totalRevenue: summary.revenue?.totalRevenue,
          paymentCount: summary.revenue?.paymentCount,
          occupancyRate: summary.occupancy?.occupancyRate,
          totalSuites: summary.occupancy?.totalSuites,
          totalBookedNights: summary.occupancy?.totalBookedNights,
        },
      ];
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'csv') {
      if (type === 'summary' && summary) {
        const summaryLines = [
          'Summary',
          `Total Bookings,${summary.bookings?.total ?? 0}`,
          `Confirmed Bookings,${summary.bookings?.confirmed ?? 0}`,
          `Cancelled Bookings,${summary.bookings?.cancelled ?? 0}`,
          `Pending Bookings,${summary.bookings?.pending ?? 0}`,
          `Total Revenue,${summary.revenue?.totalRevenue ?? 0}`,
          `Payment Count,${summary.revenue?.paymentCount ?? 0}`,
          `Occupancy Rate (%),${summary.occupancy?.occupancyRate ?? 0}`,
          `Total Suites,${summary.occupancy?.totalSuites ?? 0}`,
          `Total Booked Nights,${summary.occupancy?.totalBookedNights ?? 0}`,
          '',
          'Daily Booking Summary',
          'Date,Bookings',
          ...(summary.bookings?.daily || []).map(
            (row) => `${row.period},${row.total}`
          ),
          '',
          'Weekly Booking Summary',
          'Week,Bookings',
          ...(summary.bookings?.weekly || []).map(
            (row) => `${row.period},${row.total}`
          ),
          '',
          'Monthly Booking Summary',
          'Month,Bookings',
          ...(summary.bookings?.monthly || []).map(
            (row) => `${row.period},${row.total}`
          ),
          '',
          'Revenue by Channel',
          'Channel,Amount',
          ...Object.entries(summary.revenue?.byGateway || {}).map(
            ([channel, amount]) => `${channel},${amount}`
          ),
        ];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="summary-report.csv"'
        );
        return res.send(summaryLines.join('\n'));
      }

      const csv = toCsv(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${type}-report.csv"`
      );
      return res.send(csv);
    }

    const periodLabel = `${period.start.toISOString()} - ${period.end.toISOString()}`;
    const sectionTitle = `${type.charAt(0).toUpperCase()}${type.slice(1)} Report`;
    let sections: PdfSection[] = [];

    if (type === 'summary' && summary) {
      const summaryRows = [
        ['Total bookings', sanitizePdfCell(summary.bookings?.total ?? 0)],
        ['Confirmed bookings', sanitizePdfCell(summary.bookings?.confirmed ?? 0)],
        ['Cancelled bookings', sanitizePdfCell(summary.bookings?.cancelled ?? 0)],
        ['Pending bookings', sanitizePdfCell(summary.bookings?.pending ?? 0)],
        ['Total revenue', formatCurrencyPdfCell(summary.revenue?.totalRevenue ?? 0)],
        ['Payment count', sanitizePdfCell(summary.revenue?.paymentCount ?? 0)],
        ['Occupancy rate (%)', sanitizePdfCell(summary.occupancy?.occupancyRate ?? 0)],
        ['Total suites', sanitizePdfCell(summary.occupancy?.totalSuites ?? 0)],
        ['Total booked nights', sanitizePdfCell(summary.occupancy?.totalBookedNights ?? 0)],
      ];

      sections = [
        {
          title: 'Summary',
          table: {
            headers: ['Metric', 'Value'],
            rows: summaryRows,
          },
        },
        {
          title: 'Daily Booking Summary',
          table: {
            headers: ['Date', 'Bookings'],
            rows: (summary.bookings?.daily || []).map((row) => [
              sanitizePdfCell(row.period),
              sanitizePdfCell(row.total),
            ]),
          },
        },
        {
          title: 'Weekly Booking Summary',
          table: {
            headers: ['Week', 'Bookings'],
            rows: (summary.bookings?.weekly || []).map((row) => [
              sanitizePdfCell(row.period),
              sanitizePdfCell(row.total),
            ]),
          },
        },
        {
          title: 'Monthly Booking Summary',
          table: {
            headers: ['Month', 'Bookings'],
            rows: (summary.bookings?.monthly || []).map((row) => [
              sanitizePdfCell(row.period),
              sanitizePdfCell(row.total),
            ]),
          },
        },
        {
          title: 'Revenue by Channel',
          table: {
            headers: ['Channel', 'Amount'],
            rows: Object.entries(summary.revenue?.byGateway || {}).map(
              ([channel, amount]) => [sanitizePdfCell(channel), formatCurrencyPdfCell(amount)]
            ),
          },
        },
      ];
    } else if (type === 'bookings') {
      sections = [
        {
          title: sectionTitle,
          table: {
            headers: [
              'Booking ID',
              'Guest',
              'Suite ID',
              'Check In',
              'Check Out',
              'Amount',
              'Status',
              'Payment',
              'Method',
              'Created',
            ],
            rows: data.map((row) => [
              sanitizePdfCell(row.id),
              sanitizePdfCell(row.guestName),
              sanitizePdfCell(row.suiteId),
              formatDatePdfCell(row.checkIn),
              formatDatePdfCell(row.checkOut),
              formatCurrencyPdfCell(row.totalAmount),
              sanitizePdfCell(row.status),
              sanitizePdfCell(row.paymentStatus),
              sanitizePdfCell(row.paymentMethod),
              formatDatePdfCell(row.createdAt, true),
            ]),
          },
        },
      ];
    } else if (type === 'revenue') {
      sections = [
        {
          title: sectionTitle,
          table: {
            headers: [
              'Entry ID',
              'Source',
              'Reference',
              'Booking ID',
              'Amount',
              'Channel',
              'Status',
              'Created',
            ],
            rows: data.map((row) => [
              sanitizePdfCell(row.id),
              sanitizePdfCell(row.source),
              sanitizePdfCell(row.reference),
              sanitizePdfCell(row.bookingId),
              formatCurrencyPdfCell(row.amount),
              sanitizePdfCell(row.channel),
              sanitizePdfCell(row.status),
              formatDatePdfCell(row.createdAt, true),
            ]),
          },
        },
      ];
    } else if (type === 'occupancy') {
      sections = [
        {
          title: sectionTitle,
          table: {
            headers: ['Total Suites', 'Total Bookings', 'Occupancy Rate (%)'],
            rows: data.map((row) => [
              sanitizePdfCell(row.totalSuites),
              sanitizePdfCell(row.totalBookings),
              sanitizePdfCell(row.occupancyRate),
            ]),
          },
        },
      ];
    } else {
      const fallbackHeaders = data.length ? Object.keys(data[0]) : ['Result'];
      sections = [
        {
          title: sectionTitle,
          table: {
            headers: fallbackHeaders,
            rows: data.map((row) =>
              fallbackHeaders.map((header) => sanitizePdfCell(row[header]))
            ),
          },
        },
      ];
    }

    const pdf = await buildPdfBuffer(sectionTitle, periodLabel, sections);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-report.pdf"`
    );
    return res.send(pdf);
  } catch (_error) {
    return res.status(500).json({ error: 'Error exporting report' });
  }
};
