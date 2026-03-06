import { DataTypes, QueryInterface, Sequelize } from 'sequelize';

const tableExists = async (queryInterface: QueryInterface, tableName: string) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const resolveReferenceIdType = async (queryInterface: QueryInterface, tableName: string) => {
  try {
    const table = await queryInterface.describeTable(tableName);
    const idColumn = table.id as { type?: string } | undefined;
    const normalizedType = String(idColumn?.type || '').toUpperCase();

    if (normalizedType.includes('BIGINT')) {
      return normalizedType.includes('UNSIGNED') ? DataTypes.BIGINT.UNSIGNED : DataTypes.BIGINT;
    }

    return normalizedType.includes('UNSIGNED') ? DataTypes.INTEGER.UNSIGNED : DataTypes.INTEGER;
  } catch {
    return DataTypes.INTEGER.UNSIGNED;
  }
};

export const up = async (queryInterface: QueryInterface, _sequelize: Sequelize) => {
  const hasBookingsTable = await tableExists(queryInterface, 'bookings');
  const hasUsersTable = await tableExists(queryInterface, 'users');

  const bookingIdType = await resolveReferenceIdType(queryInterface, 'bookings');
  const userIdType = await resolveReferenceIdType(queryInterface, 'users');

  const orderIdColumn: Record<string, unknown> = {
    type: bookingIdType,
    allowNull: false,
    ...(hasBookingsTable
      ? {
          references: {
            // In this codebase, bookings are the order source of truth.
            model: 'bookings',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        }
      : {}),
  };

  const userIdColumn: Record<string, unknown> = {
    type: userIdType,
    allowNull: true,
    ...(hasUsersTable
      ? {
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        }
      : {}),
  };

  await queryInterface.createTable('transactions', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    order_id: orderIdColumn as any,
    user_id: userIdColumn as any,
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex('transactions', ['reference'], {
    name: 'transactions_reference_index',
    unique: true,
  });
  await queryInterface.addIndex('transactions', ['order_id'], {
    name: 'transactions_order_id_index',
  });
  await queryInterface.addIndex('transactions', ['user_id'], {
    name: 'transactions_user_id_index',
  });
  await queryInterface.addIndex('transactions', ['status'], {
    name: 'transactions_status_index',
  });
};

export const down = async (queryInterface: QueryInterface) => {
  await queryInterface.dropTable('transactions');
};
