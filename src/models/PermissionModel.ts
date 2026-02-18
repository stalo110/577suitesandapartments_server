import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../db';

export class Permission extends Model<
  InferAttributes<Permission>,
  InferCreationAttributes<Permission>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare resource: string;
  declare action: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Permission.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    resource: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'permissions',
  }
);
