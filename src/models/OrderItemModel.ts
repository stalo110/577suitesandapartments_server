import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../db';
import { RestaurantOrder } from './RestaurantOrderModel';

export type OrderItemType = 'food' | 'drink';

export class OrderItem extends Model<InferAttributes<OrderItem>, InferCreationAttributes<OrderItem>> {
  declare id: CreationOptional<number>;
  declare restaurantOrderId: number;
  declare itemName: string;
  declare itemType: OrderItemType;
  declare quantity: number;
  declare unitPrice: number;
  declare lineTotal: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderItem.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    restaurantOrderId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'restaurant_orders',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    itemName: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    itemType: {
      type: DataTypes.ENUM('food', 'drink'),
      allowNull: false,
      defaultValue: 'food',
    },
    quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    lineTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'order_items',
  }
);

RestaurantOrder.hasMany(OrderItem, { foreignKey: 'restaurantOrderId', as: 'items' });
OrderItem.belongsTo(RestaurantOrder, {
  foreignKey: 'restaurantOrderId',
  as: 'restaurantOrder',
});
