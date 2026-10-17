export interface CreateAccountRequest {
  name: string;
  planId: string;
}

export interface AccountResponse {
  id: string;
  name: string;
  planId: string;
  createdAt: string;
}

export interface CreateAccountResponse {
  account: AccountResponse;
  apiKey: string;
}