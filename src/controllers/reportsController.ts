import { Op } from 'sequelize';
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

const toReportResponse = (data: any[], period: { start: Date; end: Date }) => ({
  data,
  total: data.length,
  period: `${period.start.toISOString()} - ${period.end.toISOString()}`,
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

  if (format !== 'csv') {
    return res.status(400).json({ error: 'Only CSV export is supported right now' });
  }

  try {
    let data: Record<string, unknown>[] = [];
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
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const csv = toCsv(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    return res.send(csv);
  } catch (_error) {
    return res.status(500).json({ error: 'Error exporting report' });
  }
};
