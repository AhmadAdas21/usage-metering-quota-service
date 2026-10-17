export interface CreateUserRequest {
  externalId: string;
  planId: string;
}

export interface CreateUserResponse {
  user: {
    id: string;
    accountId: string;
    externalId: string;
    planId: string;
    createdAt: string;
  };
}