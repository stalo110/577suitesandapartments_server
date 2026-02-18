import { Request, Response } from 'express';
import { getActivePromotionsForSuites } from '../utils/promotionUtils';
import { Suite } from '../models/SuiteModel';

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

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return fallback;
};

const extractUploadedImages = (files?: Express.Multer.File[]) =>
  (files || [])
    .map((file) => file.path || (file as any).secure_url)
    .filter((url): url is string => Boolean(url));

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

const serializeSuitesWithPromotions = async (suites: Suite[]) => {
  const base = suites.map(serializeSuite);
  const promotionsMap = await getActivePromotionsForSuites(
    base.map((suite) => ({
      id: Number(suite.id),
      type: suite.type,
      price: suite.price,
    }))
  );

  return base.map((suite) => {
    const promotion = promotionsMap.get(Number(suite.id));
    return {
      ...suite,
      promotion: promotion || null,
      discountedPrice: promotion ? promotion.discountedPrice : null,
      effectivePrice: promotion ? promotion.discountedPrice : suite.price,
    };
  });
};

export const getSuites = async (_req: Request, res: Response) => {
  try {
    const suites = await Suite.findAll({ order: [['createdAt', 'DESC']] });
    return res.json(await serializeSuitesWithPromotions(suites));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching suites' });
  }
};

export const getSuiteById = async (req: Request, res: Response) => {
  try {
    const suiteId = String(req.params.id);
    const suite = await Suite.findByPk(suiteId);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }

    const [serialized] = await serializeSuitesWithPromotions([suite]);
    return res.json(serialized);
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching suite' });
  }
};

export const createSuite = async (req: Request, res: Response) => {
  try {
    const uploadedImages = extractUploadedImages(req.files as Express.Multer.File[]);
    const existingImages = parseStringArray(req.body.existingImages);

    const payload = {
      name: req.body.name,
      type: req.body.type,
      price: Number(req.body.price),
      description: req.body.description,
      maxGuests: Number(req.body.maxGuests),
      isAvailable: parseBoolean(req.body.isAvailable, true),
      amenities: parseStringArray(req.body.amenities),
      images: [...existingImages, ...uploadedImages],
    };

    const suite = await Suite.create(payload);
    const [serialized] = await serializeSuitesWithPromotions([suite]);
    return res.status(201).json(serialized);
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating suite' });
  }
};

export const updateSuite = async (req: Request, res: Response) => {
  try {
    const suiteId = String(req.params.id);
    const suite = await Suite.findByPk(suiteId);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }

    const uploadedImages = extractUploadedImages(req.files as Express.Multer.File[]);
    const existingImagesProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      'existingImages'
    );
    const existingImages = parseStringArray(req.body.existingImages);
    const baseImages = existingImagesProvided ? existingImages : suite.images || [];
    const amenitiesProvided = Object.prototype.hasOwnProperty.call(req.body, 'amenities');
    const parsedAmenities = parseStringArray(req.body.amenities);
    const payload = {
      name: req.body.name ?? suite.name,
      type: req.body.type ?? suite.type,
      price: req.body.price !== undefined ? Number(req.body.price) : Number(suite.price),
      description: req.body.description ?? suite.description,
      maxGuests:
        req.body.maxGuests !== undefined ? Number(req.body.maxGuests) : suite.maxGuests,
      isAvailable:
        req.body.isAvailable !== undefined
          ? parseBoolean(req.body.isAvailable, suite.isAvailable ?? true)
          : suite.isAvailable,
      amenities: amenitiesProvided ? parsedAmenities : suite.amenities || [],
      images: [...baseImages, ...uploadedImages],
    };

    await suite.update(payload);
    const [serialized] = await serializeSuitesWithPromotions([suite]);
    return res.json(serialized);
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating suite' });
  }
};

export const deleteSuite = async (req: Request, res: Response) => {
  try {
    const suiteId = String(req.params.id);
    const suite = await Suite.findByPk(suiteId);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }

    await suite.destroy();
    return res.json({ message: 'Suite deleted successfully' });
  } catch (_error) {
    return res.status(500).json({ error: 'Error deleting suite' });
  }
};
