import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../db';
import { Booking } from './BookingModel';
import { User } from './UserModel';

export type TransactionGateway = 'paystack' | 'flutterwave';
export type TransactionStatus = 'pending' | 'success' | 'failed' | 'processing';

export class Transaction extends Model<
  InferAttributes<Transaction>,
  InferCreationAttributes<Transaction>
> {
  declare id: CreationOptional<number>;
  declare orderId: ForeignKey<Booking['id']>;
  declare userId: CreationOptional<ForeignKey<User['id']> | null>;
  declare reference: string;
  declare gateway: TransactionGateway;
  declare amount: number;
  declare currency: CreationOptional<string>;
  declare status: CreationOptional<TransactionStatus>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare booking?: Booking;
  declare user?: User;
}

Transaction.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'order_id',
      references: {
        model: 'bookings',
        key: 'id',
      },
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    reference: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    gateway: {
      type: DataTypes.ENUM('paystack', 'flutterwave'),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
    },
    status: {
      type: DataTypes.ENUM('pending', 'success', 'failed', 'processing'),
      allowNull: false,
      defaultValue: 'pending',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

Booking.hasMany(Transaction, { foreignKey: 'orderId', as: 'transactions' });
Transaction.belongsTo(Booking, { foreignKey: 'orderId', as: 'booking' });

User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
