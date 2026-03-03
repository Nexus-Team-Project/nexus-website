// Mock auth flow utilities for development

export type UserType = 'existing' | 'new' | 'pre-provisioned';

export interface IdentifyUserResult {
  type: UserType;
  name: string;
  orgId?: string;
  orgName?: string;
}

// Simulated known users for development
const MOCK_EXISTING_USERS: Record<string, { name: string }> = {
  'existing@example.com': { name: 'משתמש קיים' },
};

const MOCK_PRE_PROVISIONED_USERS: Record<string, { name: string; orgId: string; orgName: string }> = {
  'org@company.com': { name: 'משתמש ארגוני', orgId: 'org-001', orgName: 'Company Ltd' },
};

export async function identifyUser(email: string): Promise<IdentifyUserResult> {
  // Simulate async API call
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (MOCK_EXISTING_USERS[email]) {
    return {
      type: 'existing',
      name: MOCK_EXISTING_USERS[email].name,
    };
  }

  if (MOCK_PRE_PROVISIONED_USERS[email]) {
    const user = MOCK_PRE_PROVISIONED_USERS[email];
    return {
      type: 'pre-provisioned',
      name: user.name,
      orgId: user.orgId,
      orgName: user.orgName,
    };
  }

  return {
    type: 'new',
    name: email.split('@')[0],
  };
}

interface FlowUser {
  email: string;
  name: string;
  type: UserType;
  orgId?: string;
  orgName?: string;
}

const SESSION_KEY = 'nexus_flow_user';
const RETURN_URL_KEY = 'nexus_flow_return_url';

export const flowSession = {
  setUser(user: FlowUser) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  },

  getUser(): FlowUser | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FlowUser;
    } catch {
      return null;
    }
  },

  clearUser() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  setReturnUrl(url: string) {
    sessionStorage.setItem(RETURN_URL_KEY, url);
  },

  getReturnUrl(): string {
    return sessionStorage.getItem(RETURN_URL_KEY) || '/he';
  },

  clearReturnUrl() {
    sessionStorage.removeItem(RETURN_URL_KEY);
  },
};
