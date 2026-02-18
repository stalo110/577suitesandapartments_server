import { Request, Response } from 'express';
import { TeamMember } from '../models/TeamMemberModel';

const extractUploadedImage = (file?: Express.Multer.File): string | null => {
  if (!file) {
    return null;
  }
  return (file as any).path || (file as any).secure_url || null;
};

const serializeTeamMember = (member: TeamMember) => ({
  id: String(member.id),
  name: member.name,
  role: member.role,
  imageUrl: member.imageUrl,
  displayOrder: member.displayOrder,
  isActive: member.isActive,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
});

export const getPublicTeam = async (_req: Request, res: Response) => {
  try {
    const members = await TeamMember.findAll({
      where: { isActive: true },
      order: [['displayOrder', 'ASC'], ['createdAt', 'ASC']],
    });

    return res.json(members.map(serializeTeamMember));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching team members' });
  }
};

export const getAdminTeam = async (_req: Request, res: Response) => {
  try {
    const members = await TeamMember.findAll({
      order: [['displayOrder', 'ASC'], ['createdAt', 'ASC']],
    });

    return res.json(members.map(serializeTeamMember));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching team members' });
  }
};

export const createTeamMember = async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const role = String(req.body.role || '').trim();
    const imageUrl = extractUploadedImage(req.file) || String(req.body.imageUrl || '').trim();
    const displayOrder = Number(req.body.displayOrder ?? 0);
    const isActive =
      req.body.isActive === undefined
        ? true
        : String(req.body.isActive).toLowerCase() === 'true';

    if (!name || !role || !imageUrl) {
      return res.status(400).json({ error: 'Name, role, and image are required' });
    }

    const member = await TeamMember.create({
      name,
      role,
      imageUrl,
      displayOrder: Number.isNaN(displayOrder) ? 0 : displayOrder,
      isActive,
    });

    return res.status(201).json(serializeTeamMember(member));
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating team member' });
  }
};

export const updateTeamMember = async (req: Request, res: Response) => {
  try {
    const member = await TeamMember.findByPk(String(req.params.id));
    if (!member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const uploadedImage = extractUploadedImage(req.file);
    const existingImage = req.body.existingImage ? String(req.body.existingImage).trim() : null;

    const displayOrder =
      req.body.displayOrder !== undefined
        ? Number(req.body.displayOrder)
        : member.displayOrder;

    const isActive =
      req.body.isActive !== undefined
        ? String(req.body.isActive).toLowerCase() === 'true'
        : member.isActive;

    await member.update({
      name: req.body.name !== undefined ? String(req.body.name).trim() : member.name,
      role: req.body.role !== undefined ? String(req.body.role).trim() : member.role,
      imageUrl: uploadedImage || existingImage || member.imageUrl,
      displayOrder: Number.isNaN(displayOrder) ? member.displayOrder : displayOrder,
      isActive,
    });

    return res.json(serializeTeamMember(member));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating team member' });
  }
};

export const deleteTeamMember = async (req: Request, res: Response) => {
  try {
    const member = await TeamMember.findByPk(String(req.params.id));
    if (!member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    await member.destroy();
    return res.json({ message: 'Team member deleted successfully' });
  } catch (_error) {
    return res.status(500).json({ error: 'Error deleting team member' });
  }
};
