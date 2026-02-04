import dotenv from 'dotenv';

dotenv.config();

import { sequelize } from '../db';
import { ensureDemoUsers } from '../models/UserModel';

const seed = async () => {
  try {
    await sequelize.sync({ alter: true });
    await ensureDemoUsers();
    console.log('Demo users synced to vip_suites.');
  } catch (error) {
    console.error('Unable to seed demo users:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

seed();
