import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../db';

export type PromotionDiscountType = 'percentage';
export type PromotionAppliesTo =
  | 'all_suites'
  | 'all_apartments'
  | 'specific_suites'
  | 'specific_apartments';
export type PromotionStatus = 'active' | 'inactive';

export class Promotion extends Model<
  InferAttributes<Promotion>,
  InferCreationAttributes<Promotion>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string;
  declare discountType: CreationOptional<PromotionDiscountType>;
  declare discountValue: number;
  declare startDate: Date;
  declare endDate: Date;
  declare appliesTo: PromotionAppliesTo;
  declare status: CreationOptional<PromotionStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Promotion.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    discountType: {
      type: DataTypes.ENUM('percentage'),
      allowNull: false,
      defaultValue: 'percentage',
    },
    discountValue: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    appliesTo: {
      type: DataTypes.ENUM(
        'all_suites',
        'all_apartments',
        'specific_suites',
        'specific_apartments'
      ),
      allowNull: false,
      defaultValue: 'all_suites',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'inactive',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'promotions',
  }
);
