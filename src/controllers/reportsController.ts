import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import { Request, Response } from 'express';
import { Booking } from '../models/BookingModel';
import { Payment } from '../models/PaymentModel';
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

const formatMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

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

const buildPdfBuffer = (title: string, periodLabel: string, sections: Array<{ title: string; lines: string[] }>) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(title);
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Period: ${periodLabel}`);
    doc.moveDown(1);

    sections.forEach((section) => {
      doc.fontSize(13).text(section.title);
      doc.moveDown(0.3);
      doc.fontSize(10);
      section.lines.forEach((line) => {
        doc.text(line);
      });
      doc.moveDown(0.8);
    });

    doc.end();
  });

export const getBookingReports = async (req: Request, res: Response) => {
  try {
    const period = parseDateRange(req);
    const bookings = await Booking.findAll({
      where: {
        createdAt: {
          [Op.between]: [period.start, period.end],
        },
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
    const payments = await Payment.findAll({
      where: {
        status: 'PAID',
        createdAt: {
          [Op.between]: [period.start, period.end],
        },
      },
      order: [['createdAt', 'DESC']],
    });

    const data = payments.map((payment) => ({
      id: String(payment.id),
      bookingId: String(payment.bookingId),
      amount: Number(payment.amount),
      gateway: payment.gateway,
      status: payment.status,
      reference: payment.reference,
      createdAt: payment.createdAt,
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
          createdAt: {
            [Op.between]: [period.start, period.end],
          },
        },
      }),
    ]);

    const occupancyRate = totalSuites > 0 ? Number(((bookings / totalSuites) * 100).toFixed(2)) : 0;

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
    const [bookings, payments, totalSuites] = await Promise.all([
      Booking.findAll({
        where: {
          createdAt: {
            [Op.between]: [period.start, period.end],
          },
        },
      }),
      Payment.findAll({
        where: {
          status: 'PAID',
          createdAt: {
            [Op.between]: [period.start, period.end],
          },
        },
      }),
      Suite.count(),
    ]);

    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter((booking) => booking.status === 'CONFIRMED').length;
    const cancelledBookings = bookings.filter((booking) => booking.status === 'CANCELLED').length;
    const pendingBookings = bookings.filter((booking) => booking.status === 'PENDING').length;

    const dailyBookings = groupCounts(bookings, formatDateKey);
    const weeklyBookings = groupCounts(bookings, getIsoWeekLabel);
    const monthlyBookings = groupCounts(bookings, formatMonthKey);

    const totalRevenue = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const paymentCount = payments.length;
    const revenueByGateway = payments.reduce<Record<string, number>>((acc, payment) => {
      acc[payment.gateway] = (acc[payment.gateway] || 0) + Number(payment.amount);
      return acc;
    }, {});

    const confirmedBookingsList = bookings.filter((booking) => booking.status === 'CONFIRMED');
    const periodStart = new Date(period.start);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(period.end);
    periodEnd.setHours(23, 59, 59, 999);
    const periodEndExclusive = new Date(periodEnd.getTime());
    periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysInPeriod = Math.max(1, Math.round((periodEndExclusive.getTime() - periodStart.getTime()) / dayMs));

    const totalBookedNights = confirmedBookingsList.reduce((sum, booking) => {
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      const overlapStart = checkIn > periodStart ? checkIn : periodStart;
      const overlapEnd = checkOut < periodEndExclusive ? checkOut : periodEndExclusive;
      const nights = Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / dayMs));
      return sum + nights;
    }, 0);

    const occupancyRate =
      totalSuites > 0 ? Number(((totalBookedNights / (totalSuites * daysInPeriod)) * 100).toFixed(2)) : 0;

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
    ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(',')),
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
    let summary: any = null;
    const period = parseDateRange(req);

    if (type === 'bookings') {
      const bookings = await Booking.findAll({
        where: {
          createdAt: {
            [Op.between]: [period.start, period.end],
          },
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
        createdAt: booking.createdAt,
      }));
    } else if (type === 'revenue') {
      const payments = await Payment.findAll({
        where: {
          status: 'PAID',
          createdAt: {
            [Op.between]: [period.start, period.end],
          },
        },
      });
      data = payments.map((payment) => ({
        id: payment.id,
        bookingId: payment.bookingId,
        amount: Number(payment.amount),
        gateway: payment.gateway,
        status: payment.status,
        reference: payment.reference,
        createdAt: payment.createdAt,
      }));
    } else if (type === 'occupancy') {
      const [totalSuites, bookings] = await Promise.all([
        Suite.count(),
        Booking.count({
          where: {
            createdAt: {
              [Op.between]: [period.start, period.end],
            },
          },
        }),
      ]);
      data = [
        {
          totalSuites,
          totalBookings: bookings,
          occupancyRate:
            totalSuites > 0 ? Number(((bookings / totalSuites) * 100).toFixed(2)) : 0,
        },
      ];
    } else if (type === 'summary') {
      const summaryResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const fakeRes = {
          json: (payload: any) => resolve(payload.data),
          status: () => ({
            json: (payload: any) => reject(new Error(payload.error)),
          }),
        } as unknown as Response;
        getSummaryReport(req, fakeRes).catch(reject);
      });

      summary = summaryResponse as any;
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
          ...(summary.bookings?.daily || []).map((row: any) => `${row.period},${row.total}`),
          '',
          'Weekly Booking Summary',
          'Week,Bookings',
          ...(summary.bookings?.weekly || []).map((row: any) => `${row.period},${row.total}`),
          '',
          'Monthly Booking Summary',
          'Month,Bookings',
          ...(summary.bookings?.monthly || []).map((row: any) => `${row.period},${row.total}`),
          '',
          'Revenue by Gateway',
          'Gateway,Amount',
          ...Object.entries(summary.revenue?.byGateway || {}).map(
            ([gateway, amount]) => `${gateway},${amount}`
          ),
        ];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="summary-report.csv"');
        return res.send(summaryLines.join('\n'));
      }

      const csv = toCsv(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
      return res.send(csv);
    }

    const periodLabel = `${period.start.toISOString()} - ${period.end.toISOString()}`;
    const sectionTitle = `${type.charAt(0).toUpperCase()}${type.slice(1)} Report`;
    let sections: Array<{ title: string; lines: string[] }>;
    if (type === 'summary' && summary) {
      sections = [
        {
          title: 'Summary',
          lines: [
            `Total bookings: ${summary.bookings?.total ?? 0}`,
            `Confirmed bookings: ${summary.bookings?.confirmed ?? 0}`,
            `Cancelled bookings: ${summary.bookings?.cancelled ?? 0}`,
            `Pending bookings: ${summary.bookings?.pending ?? 0}`,
            `Total revenue: ₦${summary.revenue?.totalRevenue ?? 0}`,
            `Payment count: ${summary.revenue?.paymentCount ?? 0}`,
            `Occupancy rate: ${summary.occupancy?.occupancyRate ?? 0}%`,
            `Total suites: ${summary.occupancy?.totalSuites ?? 0}`,
            `Total booked nights: ${summary.occupancy?.totalBookedNights ?? 0}`,
          ],
        },
        {
          title: 'Daily Booking Summary',
          lines: (summary.bookings?.daily || []).map((row: any) => `${row.period}: ${row.total}`),
        },
        {
          title: 'Weekly Booking Summary',
          lines: (summary.bookings?.weekly || []).map((row: any) => `${row.period}: ${row.total}`),
        },
        {
          title: 'Monthly Booking Summary',
          lines: (summary.bookings?.monthly || []).map((row: any) => `${row.period}: ${row.total}`),
        },
        {
          title: 'Revenue by Gateway',
          lines: Object.entries(summary.revenue?.byGateway || {}).map(
            ([gateway, amount]) => `${gateway}: ₦${amount}`
          ),
        },
      ];
    } else {
      sections = [
        {
          title: sectionTitle,
          lines: data.map((row) => JSON.stringify(row)),
        },
      ];
    }

    const pdf = await buildPdfBuffer(sectionTitle, periodLabel, sections);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
    return res.send(pdf);
  } catch (_error) {
    return res.status(500).json({ error: 'Error exporting report' });
  }
};
