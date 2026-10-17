export interface UsageQuery {
  month: string;
}
export interface UsageSummary {
  used: number;
  remaining: number;
  monthlyAllowance: number;
}



export interface AccountUsageResponse {
  accountId: string;
  month: string;
  usage: UsageSummary;
}
export interface UserUsageResponse {
  accountId: string;
  userId: string;
  month: string;
  usage: UsageSummary;
}