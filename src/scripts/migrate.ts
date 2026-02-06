import { sequelize } from '../db';
import { GalleryItem } from '../models/GalleryModel';
import { ContactMessage } from '../models/ContactMessageModel';
import { User } from '../models/UserModel';

async function run() {
  try {
    await sequelize.authenticate();
    await GalleryItem.sync();
    await ContactMessage.sync();
    await User.sync({ alter: true });
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
