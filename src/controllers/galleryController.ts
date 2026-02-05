import { Request, Response } from 'express';
import { GalleryItem } from '../models/GalleryModel';
import { Suite } from '../models/SuiteModel';

const CATEGORY_OPTIONS = ['SUITE', 'APARTMENT', 'AMENITIES', 'OTHERS'] as const;
type GalleryCategory = (typeof CATEGORY_OPTIONS)[number];

const normalizeCategory = (value: unknown): GalleryCategory | null => {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toUpperCase();
  if (CATEGORY_OPTIONS.includes(normalized as GalleryCategory)) {
    return normalized as GalleryCategory;
  }
  return null;
};

const extractUploadedImage = (file?: Express.Multer.File): string | null => {
  if (!file) {
    return null;
  }
  return (file as any).path || (file as any).secure_url || null;
};

const serializeGalleryItem = (item: GalleryItem) => ({
  id: String(item.id),
  name: item.name,
  category: item.category,
  imageUrl: item.imageUrl,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeSuiteGalleryItems = (suite: Suite) => {
  const images = Array.isArray(suite.images) ? suite.images : [];
  return images
    .filter(Boolean)
    .map((imageUrl, index) => ({
      id: `suite-${suite.id}-${index}`,
      name: suite.name,
      category: suite.type,
      imageUrl,
    }));
};

export const getGalleryItems = async (_req: Request, res: Response) => {
  try {
    const items = await GalleryItem.findAll({ order: [['createdAt', 'DESC']] });
    if (items.length > 0) {
      return res.json(items.map(serializeGalleryItem));
    }

    const suites = await Suite.findAll({ order: [['createdAt', 'DESC']] });
    const fallbackItems = suites.flatMap(serializeSuiteGalleryItems);
    return res.json(fallbackItems);
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching gallery items' });
  }
};

export const getGalleryItemsAdmin = async (_req: Request, res: Response) => {
  try {
    const items = await GalleryItem.findAll({ order: [['createdAt', 'DESC']] });
    return res.json(items.map(serializeGalleryItem));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching gallery items' });
  }
};

export const getGalleryItemById = async (req: Request, res: Response) => {
  try {
    const item = await GalleryItem.findByPk(String(req.params.id));
    if (!item) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }
    return res.json(serializeGalleryItem(item));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching gallery item' });
  }
};

export const createGalleryItem = async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const category = normalizeCategory(req.body.category);
    const imageUrl = extractUploadedImage(req.file);

    if (!name || !category || !imageUrl) {
      return res.status(400).json({
        error: 'Name, category, and image are required',
      });
    }

    const item = await GalleryItem.create({ name, category, imageUrl });
    return res.status(201).json(serializeGalleryItem(item));
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating gallery item' });
  }
};

export const updateGalleryItem = async (req: Request, res: Response) => {
  try {
    const item = await GalleryItem.findByPk(String(req.params.id));
    if (!item) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
    const category = req.body.category !== undefined ? normalizeCategory(req.body.category) : null;
    if (req.body.category !== undefined && !category) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const uploadedImage = extractUploadedImage(req.file);
    const existingImageProvided = Object.prototype.hasOwnProperty.call(req.body, 'existingImage');
    const existingImage = existingImageProvided ? String(req.body.existingImage || '') : undefined;

    const imageUrl = uploadedImage ?? existingImage ?? item.imageUrl;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image is required' });
    }

    await item.update({
      name: name ?? item.name,
      category: category ?? item.category,
      imageUrl,
    });

    return res.json(serializeGalleryItem(item));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating gallery item' });
  }
};

export const deleteGalleryItem = async (req: Request, res: Response) => {
  try {
    const item = await GalleryItem.findByPk(String(req.params.id));
    if (!item) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }
    await item.destroy();
    return res.json({ message: 'Gallery item deleted successfully' });
  } catch (_error) {
    return res.status(500).json({ error: 'Error deleting gallery item' });
  }
};
