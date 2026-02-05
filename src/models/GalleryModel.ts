import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../db';

export class GalleryItem extends Model<
  InferAttributes<GalleryItem>,
  InferCreationAttributes<GalleryItem>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare category: 'SUITE' | 'APARTMENT' | 'AMENITIES' | 'OTHERS';
  declare imageUrl: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GalleryItem.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM('SUITE', 'APARTMENT', 'AMENITIES', 'OTHERS'),
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'gallery_items',
  }
);
