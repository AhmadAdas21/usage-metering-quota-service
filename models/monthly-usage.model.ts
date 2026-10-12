export type UsageMonth = string;
export interface AccountMonthlyUsage {
  accountId: string;
  month: UsageMonth;
  consumedUnits: number;
  updatedAt: Date;
}

export interface UserMonthlyUsage {
  accountId: string;
  userId: string;
  month: UsageMonth;
  consumedUnits: number;
  updatedAt: Date;
}