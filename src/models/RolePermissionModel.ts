import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db';
import { Permission } from './PermissionModel';
import { Role } from './RoleModel';

export class RolePermission extends Model<
  InferAttributes<RolePermission>,
  InferCreationAttributes<RolePermission>
> {
  declare roleId: number;
  declare permissionId: number;
}

RolePermission.init(
  {
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
    permissionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'permissions',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  },
  {
    sequelize,
    tableName: 'role_permissions',
    timestamps: false,
  }
);

Role.belongsToMany(Permission, {
  through: RolePermission,
  as: 'permissions',
  foreignKey: 'roleId',
  otherKey: 'permissionId',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  as: 'roles',
  foreignKey: 'permissionId',
  otherKey: 'roleId',
});
