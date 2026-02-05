import { Op } from 'sequelize';
import { Request, Response } from 'express';
import { Suite } from '../models/SuiteModel';
import { Booking } from '../models/BookingModel';

const parseStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (_error) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const serializeSuite = (suite: Suite) => ({
  id: String(suite.id),
  name: suite.name,
  type: suite.type,
  price: Number(suite.price),
  description: suite.description,
  maxGuests: suite.maxGuests,
  images: parseStringArray(suite.images),
  amenities: parseStringArray(suite.amenities),
  isAvailable: suite.isAvailable,
  createdAt: suite.createdAt,
  updatedAt: suite.updatedAt,
});

export const checkAvailability = async (req: Request, res: Response) => {
  try {
    const { checkIn, checkOut, guests } = req.body;

    if (!checkIn || !checkOut) {
      return res.status(400).json({ error: 'checkIn and checkOut are required' });
    }

    const overlaps = await Booking.findAll({
      where: {
        status: { [Op.ne]: 'CANCELLED' },
        checkIn: { [Op.lt]: checkOut },
        checkOut: { [Op.gt]: checkIn },
      },
      attributes: ['suiteId'],
    });

    const bookedSuiteIds = overlaps.map((booking) => booking.suiteId);

    const suites = await Suite.findAll({
      where: {
        isAvailable: true,
        ...(guests ? { maxGuests: { [Op.gte]: Number(guests) } } : {}),
        ...(bookedSuiteIds.length ? { id: { [Op.notIn]: bookedSuiteIds } } : {}),
      },
      order: [['createdAt', 'DESC']],
    });

    return res.json({ available: suites.map(serializeSuite), total: suites.length });
  } catch (_error) {
    return res.status(500).json({ error: 'Error checking availability' });
  }
};
