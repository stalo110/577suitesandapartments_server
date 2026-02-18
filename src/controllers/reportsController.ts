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

const buildPdfBuffer = (
  title: string,
  periodLabel: string,
  sections: Array<{ title: string; lines: string[] }>
) =>
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
    let summary: any = null;
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
      const summaryResponse = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const fakeRes = {
            json: (payload: any) => resolve(payload.data),
            status: () => ({
              json: (payload: any) => reject(new Error(payload.error)),
            }),
          } as unknown as Response;
          getSummaryReport(req, fakeRes).catch(reject);
        }
      );

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
          ...(summary.bookings?.daily || []).map(
            (row: any) => `${row.period},${row.total}`
          ),
          '',
          'Weekly Booking Summary',
          'Week,Bookings',
          ...(summary.bookings?.weekly || []).map(
            (row: any) => `${row.period},${row.total}`
          ),
          '',
          'Monthly Booking Summary',
          'Month,Bookings',
          ...(summary.bookings?.monthly || []).map(
            (row: any) => `${row.period},${row.total}`
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
          lines: (summary.bookings?.daily || []).map(
            (row: any) => `${row.period}: ${row.total}`
          ),
        },
        {
          title: 'Weekly Booking Summary',
          lines: (summary.bookings?.weekly || []).map(
            (row: any) => `${row.period}: ${row.total}`
          ),
        },
        {
          title: 'Monthly Booking Summary',
          lines: (summary.bookings?.monthly || []).map(
            (row: any) => `${row.period}: ${row.total}`
          ),
        },
        {
          title: 'Revenue by Channel',
          lines: Object.entries(summary.revenue?.byGateway || {}).map(
            ([channel, amount]) => `${channel}: ₦${amount}`
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-report.pdf"`
    );
    return res.send(pdf);
  } catch (_error) {
    return res.status(500).json({ error: 'Error exporting report' });
  }
};
