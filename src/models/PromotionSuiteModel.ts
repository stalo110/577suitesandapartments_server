import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db';
import { Promotion } from './PromotionModel';
import { Suite } from './SuiteModel';

export class PromotionSuite extends Model<
  InferAttributes<PromotionSuite>,
  InferCreationAttributes<PromotionSuite>
> {
  declare promotionId: number;
  declare suiteId: number;
}

PromotionSuite.init(
  {
    promotionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'promotions',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    suiteId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'suites',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  },
  {
    sequelize,
    tableName: 'promotion_suites',
    timestamps: false,
  }
);

Promotion.belongsToMany(Suite, {
  through: PromotionSuite,
  as: 'suites',
  foreignKey: 'promotionId',
  otherKey: 'suiteId',
});
Suite.belongsToMany(Promotion, {
  through: PromotionSuite,
  as: 'promotions',
  foreignKey: 'suiteId',
  otherKey: 'promotionId',
});
