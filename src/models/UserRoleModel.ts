import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db';
import { Role } from './RoleModel';
import { User } from './UserModel';

export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare userId: number;
  declare roleId: number;
}

UserRole.init(
  {
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    roleId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  },
  {
    sequelize,
    tableName: 'user_roles',
    timestamps: false,
  }
);

User.belongsToMany(Role, {
  through: UserRole,
  as: 'rbacRoles',
  foreignKey: 'userId',
  otherKey: 'roleId',
});
Role.belongsToMany(User, {
  through: UserRole,
  as: 'users',
  foreignKey: 'roleId',
  otherKey: 'userId',
});
