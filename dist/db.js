"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = exports.sequelize = void 0;
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database = process.env.DB_NAME || 'vip_suites';
const username = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
exports.sequelize = new sequelize_1.Sequelize(database, username, password, {
    host,
    port,
    dialect: 'mysql',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    timezone: '+01:00',
    define: {
        freezeTableName: true,
        underscored: false,
    },
});
async function connectDB() {
    await exports.sequelize.authenticate();
}
exports.connectDB = connectDB;
