import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../db';
import { Suite } from './SuiteModel';

export class Booking extends Model<InferAttributes<Booking>, InferCreationAttributes<Booking>> {
  declare id: CreationOptional<number>;
  declare suiteId: number;
  declare guestName: string;
  declare email: string;
  declare phone: string;
  declare checkIn: Date;
  declare checkOut: Date;
  declare totalAmount: number;
  declare mealOrderName: CreationOptional<string>;
  declare mealOrderAmount: CreationOptional<number>;
  declare otherOrderName: CreationOptional<string>;
  declare otherOrderAmount: CreationOptional<number>;
  declare numberOfGuests: number;
  declare status: CreationOptional<'PENDING' | 'CONFIRMED' | 'CANCELLED'>;
  declare paymentStatus: CreationOptional<'UNPAID' | 'PAID'>;
  declare bookingReference: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Booking.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    suiteId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'suites',
        key: 'id',
      },
    },
    guestName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    checkIn: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    checkOut: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    mealOrderName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: '',
    },
    mealOrderAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    otherOrderName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: '',
    },
    otherOrderAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    numberOfGuests: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    paymentStatus: {
      type: DataTypes.ENUM('UNPAID', 'PAID'),
      allowNull: false,
      defaultValue: 'UNPAID',
    },
    bookingReference: {
      type: DataTypes.STRING(60),
      allowNull: false,
      unique: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'bookings',
  }
);

Suite.hasMany(Booking, { foreignKey: 'suiteId', as: 'bookings' });
Booking.belongsTo(Suite, { foreignKey: 'suiteId', as: 'suite' });
