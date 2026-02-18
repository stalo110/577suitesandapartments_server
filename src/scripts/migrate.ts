import { sequelize } from '../db';
import { Booking } from '../models/BookingModel';
import { GalleryItem } from '../models/GalleryModel';
import { ContactMessage } from '../models/ContactMessageModel';
import { OrderItem } from '../models/OrderItemModel';
import { Permission } from '../models/PermissionModel';
import { Promotion } from '../models/PromotionModel';
import { PromotionSuite } from '../models/PromotionSuiteModel';
import { RestaurantOrder } from '../models/RestaurantOrderModel';
import { RolePermission } from '../models/RolePermissionModel';
import { Role } from '../models/RoleModel';
import { Suite } from '../models/SuiteModel';
import { TeamMember } from '../models/TeamMemberModel';
import { User } from '../models/UserModel';
import { UserRole } from '../models/UserRoleModel';
import { Transaction } from '../models/TransactionModel';
import { up as createTransactionsTable } from '../db/migrations/202602120001_create_transactions_table';

const getTableNames = (tables: unknown[]) =>
  tables.map((table) => {
    if (typeof table === 'string') {
      return table;
    }
    if (table && typeof table === 'object' && 'tableName' in table) {
      return String((table as { tableName?: string }).tableName);
    }
    return '';
  });

async function run() {
  try {
    await sequelize.authenticate();

    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const tableNames = getTableNames(tables).filter(Boolean);

    if (!tableNames.includes('transactions')) {
      await createTransactionsTable(queryInterface, sequelize);
    }

    await Suite.sync({ alter: true });
    await Booking.sync({ alter: true });
    await GalleryItem.sync({ alter: true });
    await ContactMessage.sync({ alter: true });
    await Role.sync({ alter: true });
    await Permission.sync({ alter: true });
    await User.sync({ alter: true });
    await UserRole.sync({ alter: true });
    await RolePermission.sync({ alter: true });
    await TeamMember.sync({ alter: true });
    await Promotion.sync({ alter: true });
    await PromotionSuite.sync({ alter: true });
    await RestaurantOrder.sync({ alter: true });
    await OrderItem.sync({ alter: true });
    await Transaction.sync({ alter: false });
    // Add other model syncs here if needed.

    console.log('Migrations completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
