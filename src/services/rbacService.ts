import { Permission } from '../models/PermissionModel';
import { Role } from '../models/RoleModel';
import { RolePermission } from '../models/RolePermissionModel';
import { User } from '../models/UserModel';
import { UserRole } from '../models/UserRoleModel';

interface PermissionSeed {
  name: string;
  resource: string;
  action: string;
}

const PERMISSIONS: PermissionSeed[] = [
  { name: 'all_access', resource: '*', action: '*' },
  { name: 'manage_bookings', resource: 'bookings', action: 'write' },
  { name: 'manage_suites', resource: 'suites', action: 'write' },
  { name: 'manage_restaurant_orders', resource: 'restaurant_orders', action: 'write' },
  { name: 'manage_promotions', resource: 'promotions', action: 'write' },
  { name: 'view_reports', resource: 'reports', action: 'read' },
  { name: 'view_finance', resource: 'finance', action: 'read' },
  { name: 'manage_messages', resource: 'messages', action: 'write' },
  { name: 'manage_gallery', resource: 'gallery', action: 'write' },
  { name: 'manage_security', resource: 'security', action: 'write' },
  { name: 'manage_users', resource: 'users', action: 'write' },
  { name: 'manage_team', resource: 'team', action: 'write' },
  { name: 'view_reviews', resource: 'reviews', action: 'read' },
];

const ROLE_DEFINITIONS: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: 'IT Personnel',
    description: 'Primary admin with full security and user management access',
    permissions: ['all_access'],
  },
  {
    name: 'Receptionist',
    description: 'Front desk operations for bookings and restaurant orders',
    permissions: ['manage_bookings', 'manage_restaurant_orders', 'manage_messages'],
  },
  {
    name: 'Managing Director',
    description: 'Executive oversight over operations and financial insights',
    permissions: ['view_reports', 'view_finance', 'manage_promotions', 'view_reviews'],
  },
];

const normalizeRoleName = (roleName: string) => roleName.trim().toLowerCase();

export const ensureDefaultRolesAndPermissions = async () => {
  const permissionByName = new Map<string, Permission>();
  for (const permission of PERMISSIONS) {
    const [record] = await Permission.findOrCreate({
      where: { name: permission.name },
      defaults: permission,
    });
    permissionByName.set(permission.name, record);
  }

  const roleByName = new Map<string, Role>();
  for (const roleDefinition of ROLE_DEFINITIONS) {
    const [role] = await Role.findOrCreate({
      where: { name: roleDefinition.name },
      defaults: {
        name: roleDefinition.name,
        description: roleDefinition.description,
      },
    });

    roleByName.set(roleDefinition.name, role);

    await RolePermission.destroy({ where: { roleId: role.id } });
    const permissionIds = roleDefinition.permissions
      .map((permissionName) => permissionByName.get(permissionName)?.id)
      .filter((permissionId): permissionId is number => Boolean(permissionId));

    if (permissionIds.length) {
      await RolePermission.bulkCreate(
        permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        { ignoreDuplicates: true }
      );
    }
  }

  const adminUsers = await User.findAll({ where: { role: 'ADMIN' } });
  if (!adminUsers.length) {
    return;
  }

  const itRole = roleByName.get('IT Personnel');
  if (!itRole) {
    return;
  }

  const demoAdminEmail = (process.env.DEMO_ADMIN_EMAIL || 'admin@517vipsuites.com').toLowerCase();
  const receptionistRole = roleByName.get('Receptionist');

  for (const admin of adminUsers) {
    const existingAssignments = await UserRole.findAll({ where: { userId: admin.id } });
    if (existingAssignments.length) {
      continue;
    }

    const shouldBeIt = admin.email.toLowerCase() === demoAdminEmail;
    const defaultRoleId = shouldBeIt
      ? itRole.id
      : receptionistRole?.id || itRole.id;

    await UserRole.create({
      userId: admin.id,
      roleId: defaultRoleId,
    });
  }
};

export const setUserPrimaryRole = async (userId: number, roleName: string) => {
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) {
    throw new Error('Role not found');
  }

  await UserRole.destroy({ where: { userId } });
  await UserRole.create({ userId, roleId: role.id });

  return role;
};

export const getUserRoleNames = async (userId: number) => {
  const roleAssignments = await UserRole.findAll({ where: { userId } });
  if (!roleAssignments.length) {
    return [];
  }

  const roles = await Role.findAll({
    where: {
      id: roleAssignments.map((assignment) => assignment.roleId),
    },
  });

  return roles.map((role) => role.name);
};

export const getUserPermissionNames = async (userId: number) => {
  const roleAssignments = await UserRole.findAll({ where: { userId } });
  if (!roleAssignments.length) {
    return [];
  }

  const roleIds = roleAssignments.map((assignment) => assignment.roleId);
  const rolePermissions = await RolePermission.findAll({
    where: {
      roleId: roleIds,
    },
  });

  if (!rolePermissions.length) {
    return [];
  }

  const permissionIds = Array.from(new Set(rolePermissions.map((rolePermission) => rolePermission.permissionId)));
  const permissions = await Permission.findAll({
    where: {
      id: permissionIds,
    },
  });

  return permissions.map((permission) => permission.name);
};

export const userHasPermission = async (userId: number, permissionName: string) => {
  const permissionNames = await getUserPermissionNames(userId);
  return (
    permissionNames.includes('all_access') ||
    permissionNames.includes(permissionName)
  );
};

export const getAllRolesWithPermissions = async () => {
  const roles = await Role.findAll({ order: [['name', 'ASC']] });

  const roleIds = roles.map((role) => role.id);
  const rolePermissions = await RolePermission.findAll({ where: { roleId: roleIds } });
  const permissionIds = Array.from(new Set(rolePermissions.map((value) => value.permissionId)));
  const permissions = await Permission.findAll({ where: { id: permissionIds } });
  const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));

  return roles.map((role) => {
    const linkedPermissionNames = rolePermissions
      .filter((rolePermission) => rolePermission.roleId === role.id)
      .map((rolePermission) => permissionById.get(rolePermission.permissionId)?.name)
      .filter((name): name is string => Boolean(name));

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: linkedPermissionNames,
    };
  });
};

export const resolvePrimaryRoleName = (roleNames: string[]) => {
  if (!roleNames.length) {
    return '';
  }

  const normalized = roleNames.map(normalizeRoleName);
  const itIndex = normalized.findIndex((name) => name === normalizeRoleName('IT Personnel'));
  if (itIndex >= 0) {
    return roleNames[itIndex];
  }

  return roleNames[0];
};
