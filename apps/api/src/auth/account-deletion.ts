export interface CompanyUserStatus {
  id: number;
  isActive: boolean;
}

export function shouldSuspendCompanyAfterUserDeletion(
  companyUsers: CompanyUserStatus[],
  deletedUserId: number,
): boolean {
  return !companyUsers.some((member) => member.id !== deletedUserId && member.isActive);
}
