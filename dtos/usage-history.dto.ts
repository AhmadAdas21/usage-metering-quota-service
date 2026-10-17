import type {
  ConsumptionResult,
} from "../models/consumption-request.model";

export interface UsageHistoryQuery {
  month: string;
  page: number;
  pageSize: number;
  userId?: string;
}

export interface UsageHistoryResponse {
  accountId: string;
  month: string;
  items: ConsumptionResult[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}