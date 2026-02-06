import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../db';

export type UserRole = 'ADMIN' | 'GUEST';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare resetTokenHash: CreationOptional<string | null>;
  declare resetTokenExpiresAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('ADMIN', 'GUEST'),
      allowNull: false,
      defaultValue: 'GUEST',
    },
    resetTokenHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    resetTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
  }
);

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const updatePasswordIfNeeded = async (user: User, newPassword: string) => {
  if (newPassword && !(await bcrypt.compare(newPassword, user.passwordHash))) {
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
  }
};

const findOrCreateUser = async (email: string, password: string, role: UserRole) => {
  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      email,
      passwordHash: await hashPassword(password),
      role,
    },
  });

  if (!created) {
    await updatePasswordIfNeeded(user, password);
    if (user.role !== role) {
      user.role = role;
      await user.save();
    }
  }

  return user;
};

export const ensureDemoUsers = async () => {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@517vipsuites.com';
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || 'Admin@517VIP';
  const guestEmail = process.env.DEMO_GUEST_EMAIL || 'guest@517vipsuites.com';
  const guestPassword = process.env.DEMO_GUEST_PASSWORD || 'Guest@517VIP';

  await Promise.all([
    findOrCreateUser(adminEmail, adminPassword, 'ADMIN'),
    findOrCreateUser(guestEmail, guestPassword, 'GUEST'),
  ]);
};

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
