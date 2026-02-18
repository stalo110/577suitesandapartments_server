import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import {
  createTeamMember,
  deleteTeamMember,
  getAdminTeam,
  getPublicTeam,
  updateTeamMember,
} from '../controllers/teamController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.get('/team', getPublicTeam);
router.get('/public/team', getPublicTeam);
router.get('/api/public/team', getPublicTeam);

const registerAdminRoutes = (basePath: string) => {
  router.get(
    `${basePath}/team`,
    authenticate,
    authorizePermission('manage_team'),
    getAdminTeam
  );
  router.post(
    `${basePath}/team`,
    authenticate,
    authorizePermission('manage_team'),
    uploadImages.single('image'),
    createTeamMember
  );
  router.put(
    `${basePath}/team/:id`,
    authenticate,
    authorizePermission('manage_team'),
    uploadImages.single('image'),
    updateTeamMember
  );
  router.delete(
    `${basePath}/team/:id`,
    authenticate,
    authorizePermission('manage_team'),
    deleteTeamMember
  );
};

registerAdminRoutes('/admin');
registerAdminRoutes('/api/admin');

export default router;
