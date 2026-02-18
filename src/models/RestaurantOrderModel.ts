import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../db';
import { Booking } from './BookingModel';

export type RestaurantOrderStatus = 'pending' | 'preparing' | 'delivered' | 'cancelled';
export type RestaurantOrderPaymentStatus = 'unpaid' | 'paid';
export type RestaurantOrderPaymentMethod = 'cash' | 'transfer' | 'card';

export class RestaurantOrder extends Model<
  InferAttributes<RestaurantOrder>,
  InferCreationAttributes<RestaurantOrder>
> {
  declare id: CreationOptional<number>;
  declare bookingId: CreationOptional<number | null>;
  declare roomNumber: CreationOptional<string | null>;
  declare guestName: string;
  declare guestEmail: CreationOptional<string | null>;
  declare guestPhone: CreationOptional<string | null>;
  declare orderDate: CreationOptional<Date>;
  declare status: CreationOptional<RestaurantOrderStatus>;
  declare paymentStatus: CreationOptional<RestaurantOrderPaymentStatus>;
  declare paymentMethod: CreationOptional<RestaurantOrderPaymentMethod>;
  declare totalAmount: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare booking?: Booking;
}

RestaurantOrder.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    bookingId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'bookings',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    roomNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    guestName: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    guestEmail: {
      type: DataTypes.STRING(200),
      allowNull: true,
      defaultValue: null,
    },
    guestPhone: {
      type: DataTypes.STRING(60),
      allowNull: true,
      defaultValue: null,
    },
    orderDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM('pending', 'preparing', 'delivered', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'paid'),
      allowNull: false,
      defaultValue: 'unpaid',
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'transfer', 'card'),
      allowNull: false,
      defaultValue: 'cash',
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'restaurant_orders',
  }
);

Booking.hasMany(RestaurantOrder, { foreignKey: 'bookingId', as: 'restaurantOrders' });
RestaurantOrder.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
