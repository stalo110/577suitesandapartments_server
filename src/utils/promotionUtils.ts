import { Op } from 'sequelize';
import { Promotion } from '../models/PromotionModel';
import '../models/PromotionSuiteModel';
import { Suite } from '../models/SuiteModel';

type SuiteLike = {
  id: number;
  type: 'SUITE' | 'APARTMENT';
  price: number;
};

export const derivePromotionStatus = (startDate: Date, endDate: Date, now = new Date()) => {
  if (endDate.getTime() < now.getTime()) {
    return 'inactive' as const;
  }

  if (startDate.getTime() <= now.getTime() && endDate.getTime() >= now.getTime()) {
    return 'active' as const;
  }

  return 'inactive' as const;
};

export const calculateDiscountedPrice = (price: number, discountValue: number) => {
  const discountRatio = Math.max(0, Math.min(100, Number(discountValue))) / 100;
  const discounted = Number(price) * (1 - discountRatio);
  return Number(discounted.toFixed(2));
};

const getPromotionSuiteIds = (promotion: Promotion) => {
  const suites = ((promotion as unknown as { suites?: Suite[] }).suites || []) as Suite[];
  return new Set(suites.map((suite) => Number(suite.id)));
};

const promotionAppliesToSuite = (promotion: Promotion, suite: SuiteLike) => {
  const appliesTo = promotion.appliesTo;
  if (appliesTo === 'all_suites') {
    return suite.type === 'SUITE';
  }

  if (appliesTo === 'all_apartments') {
    return suite.type === 'APARTMENT';
  }

  const promotionSuiteIds = getPromotionSuiteIds(promotion);

  if (appliesTo === 'specific_suites') {
    return suite.type === 'SUITE' && promotionSuiteIds.has(suite.id);
  }

  if (appliesTo === 'specific_apartments') {
    return suite.type === 'APARTMENT' && promotionSuiteIds.has(suite.id);
  }

  return false;
};

export const getActivePromotionsForSuites = async (suites: SuiteLike[]) => {
  if (!suites.length) {
    return new Map<
      number,
      {
        id: string;
        name: string;
        description: string;
        discountType: 'percentage';
        discountValue: number;
        discountedPrice: number;
      }
    >();
  }

  const now = new Date();

  const promotions = await Promotion.findAll({
    where: {
      status: 'active',
      startDate: {
        [Op.lte]: now,
      },
      endDate: {
        [Op.gte]: now,
      },
    },
    include: [
      {
        model: Suite,
        as: 'suites',
        through: { attributes: [] },
        attributes: ['id', 'type'],
        required: false,
      },
    ],
    order: [['discountValue', 'DESC']],
  });

  const result = new Map<
    number,
    {
      id: string;
      name: string;
      description: string;
      discountType: 'percentage';
      discountValue: number;
      discountedPrice: number;
    }
  >();

  suites.forEach((suite) => {
    for (const promotion of promotions) {
      if (!promotionAppliesToSuite(promotion, suite)) {
        continue;
      }

      const existing = result.get(suite.id);
      const discountValue = Number(promotion.discountValue);
      if (existing && existing.discountValue >= discountValue) {
        continue;
      }

      result.set(suite.id, {
        id: String(promotion.id),
        name: promotion.name,
        description: promotion.description,
        discountType: 'percentage',
        discountValue,
        discountedPrice: calculateDiscountedPrice(Number(suite.price), discountValue),
      });
    }
  });

  return result;
};
