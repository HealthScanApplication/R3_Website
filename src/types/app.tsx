export type PageType = 'home' | 'profile' | 'settings' | 'admin' | 'guides' | 'diagnostic' | 'network-test' | 'blog' | 'referral-test' | 'hardware';

export interface NavigationProps {
  onNavigateToProfile?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHome?: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToNetworkTest?: () => void;
  onNavigateToBlog?: () => void;
}

export interface User {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    avatar_url?: string;
  };
}

export interface ReferralData {
  referral_code?: string;
  created_at?: string;
  is_active?: boolean;
}

// Global window extensions
declare global {
  interface Window {
    healthscanImageBlockingLogged?: boolean;
  }
}
