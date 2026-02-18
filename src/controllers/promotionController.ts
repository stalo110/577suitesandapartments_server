import { Request, Response } from 'express';
import { Promotion, PromotionAppliesTo } from '../models/PromotionModel';
import { PromotionSuite } from '../models/PromotionSuiteModel';
import { Suite } from '../models/SuiteModel';
import { derivePromotionStatus } from '../utils/promotionUtils';

const VALID_APPLIES_TO: PromotionAppliesTo[] = [
  'all_suites',
  'all_apartments',
  'specific_suites',
  'specific_apartments',
];

const parseSuiteIds = (value: unknown) => {
  if (!value) {
    return [] as number[];
  }

  const source = Array.isArray(value) ? value : [value];
  return source
    .map((item) => Number(item))
    .filter((suiteId) => Number.isInteger(suiteId) && suiteId > 0);
};

const serializePromotion = (promotion: Promotion) => {
  const suites = ((promotion as unknown as { suites?: Suite[] }).suites || []) as Suite[];
  return {
    id: String(promotion.id),
    name: promotion.name,
    description: promotion.description,
    discountType: promotion.discountType,
    discountValue: Number(promotion.discountValue),
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    appliesTo: promotion.appliesTo,
    status: promotion.status,
    suiteIds: suites.map((suite) => String(suite.id)),
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  };
};

const syncPromotionSuites = async (promotionId: number, suiteIds: number[]) => {
  await PromotionSuite.destroy({ where: { promotionId } });
  if (!suiteIds.length) {
    return;
  }

  await PromotionSuite.bulkCreate(
    suiteIds.map((suiteId) => ({
      promotionId,
      suiteId,
    })),
    { ignoreDuplicates: true }
  );
};

const refreshPromotionStatuses = async () => {
  const promotions = await Promotion.findAll();
  const updates = promotions
    .map((promotion) => {
      const status = derivePromotionStatus(new Date(promotion.startDate), new Date(promotion.endDate));
      if (promotion.status === status) {
        return null;
      }

      return promotion.update({ status });
    })
    .filter(Boolean) as Promise<Promotion>[];

  if (updates.length) {
    await Promise.all(updates);
  }
};

export const getPromotions = async (_req: Request, res: Response) => {
  try {
    await refreshPromotionStatuses();
    const promotions = await Promotion.findAll({
      include: [
        {
          model: Suite,
          as: 'suites',
          through: { attributes: [] },
          attributes: ['id', 'name', 'type'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json(promotions.map(serializePromotion));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching promotions' });
  }
};

export const getPromotionById = async (req: Request, res: Response) => {
  try {
    const promotion = await Promotion.findByPk(String(req.params.id), {
      include: [
        {
          model: Suite,
          as: 'suites',
          through: { attributes: [] },
          attributes: ['id', 'name', 'type'],
          required: false,
        },
      ],
    });

    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    return res.json(serializePromotion(promotion));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching promotion' });
  }
};

export const createPromotion = async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const discountValue = Number(req.body.discountValue);
    const startDate = new Date(String(req.body.startDate || ''));
    const endDate = new Date(String(req.body.endDate || ''));
    const appliesTo = String(req.body.appliesTo || '').toLowerCase() as PromotionAppliesTo;
    const suiteIds = parseSuiteIds(req.body.suiteIds);

    if (!name || Number.isNaN(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'Name and valid discount value are required' });
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ error: 'Valid start and end dates are required' });
    }

    if (!VALID_APPLIES_TO.includes(appliesTo)) {
      return res.status(400).json({ error: 'Invalid appliesTo value' });
    }

    if ((appliesTo === 'specific_suites' || appliesTo === 'specific_apartments') && !suiteIds.length) {
      return res.status(400).json({ error: 'At least one suite must be selected for specific promotions' });
    }

    const promotion = await Promotion.create({
      name,
      description,
      discountType: 'percentage',
      discountValue,
      startDate,
      endDate,
      appliesTo,
      status: derivePromotionStatus(startDate, endDate),
    });

    await syncPromotionSuites(promotion.id, suiteIds);

    const created = await Promotion.findByPk(String(promotion.id), {
      include: [
        {
          model: Suite,
          as: 'suites',
          through: { attributes: [] },
          attributes: ['id', 'name', 'type'],
          required: false,
        },
      ],
    });

    return res.status(201).json(created ? serializePromotion(created) : serializePromotion(promotion));
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating promotion' });
  }
};

export const updatePromotion = async (req: Request, res: Response) => {
  try {
    const promotion = await Promotion.findByPk(String(req.params.id));
    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    const name = req.body.name !== undefined ? String(req.body.name).trim() : promotion.name;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : promotion.description;
    const discountValue =
      req.body.discountValue !== undefined ? Number(req.body.discountValue) : Number(promotion.discountValue);
    const startDate = req.body.startDate ? new Date(String(req.body.startDate)) : new Date(promotion.startDate);
    const endDate = req.body.endDate ? new Date(String(req.body.endDate)) : new Date(promotion.endDate);
    const appliesTo =
      req.body.appliesTo !== undefined
        ? (String(req.body.appliesTo).toLowerCase() as PromotionAppliesTo)
        : promotion.appliesTo;

    if (!name || Number.isNaN(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'Name and valid discount value are required' });
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ error: 'Valid start and end dates are required' });
    }

    if (!VALID_APPLIES_TO.includes(appliesTo)) {
      return res.status(400).json({ error: 'Invalid appliesTo value' });
    }

    const suiteIds = req.body.suiteIds !== undefined
      ? parseSuiteIds(req.body.suiteIds)
      : (await PromotionSuite.findAll({ where: { promotionId: promotion.id } })).map(
          (row) => row.suiteId
        );

    if ((appliesTo === 'specific_suites' || appliesTo === 'specific_apartments') && !suiteIds.length) {
      return res.status(400).json({ error: 'At least one suite must be selected for specific promotions' });
    }

    await promotion.update({
      name,
      description,
      discountType: 'percentage',
      discountValue,
      startDate,
      endDate,
      appliesTo,
      status: derivePromotionStatus(startDate, endDate),
    });

    await syncPromotionSuites(promotion.id, suiteIds);

    const updated = await Promotion.findByPk(String(promotion.id), {
      include: [
        {
          model: Suite,
          as: 'suites',
          through: { attributes: [] },
          attributes: ['id', 'name', 'type'],
          required: false,
        },
      ],
    });

    return res.json(updated ? serializePromotion(updated) : serializePromotion(promotion));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating promotion' });
  }
};

export const deletePromotion = async (req: Request, res: Response) => {
  try {
    const promotion = await Promotion.findByPk(String(req.params.id));
    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    await PromotionSuite.destroy({ where: { promotionId: promotion.id } });
    await promotion.destroy();

    return res.json({ message: 'Promotion deleted successfully' });
  } catch (_error) {
    return res.status(500).json({ error: 'Error deleting promotion' });
  }
};
