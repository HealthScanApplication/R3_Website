import { useState, useEffect, type CSSProperties } from 'react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './auth/AuthModal';
import { UniversalWaitlist } from './UniversalWaitlist';
import { SocialSharingModal } from './SocialSharingModal';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { useScrollHeader } from '../hooks/useScrollHeader';
import { 
  User, 
  Settings, 
  LogOut, 
  ChevronDown,
  Shield,
  Share2,
  Compass
} from 'lucide-react';
import { isAdminUser, getAdminUserInfo } from '../utils/adminUtils';
import { oura, ouraButton } from '../config/ouraTheme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { PageType } from '../types/app';
import { HeaderMenu, R3_MENU_CSS, type MenuItemSpec } from './header/HeaderMenu';
import { HEADER_GAP, HEADER_LINK_GAP, parked, useHeaderLayout } from './header/useHeaderLayout';

// ROUTINE³ lockup — a square, single-bordered box joining the wordmark to the BETA tag,
// same joined-seam treatment as the email/Subscribe container.
export function RoutineMark({ size = 28, textColor = '#16140F', hairline = '#16140F', suffix = 'Beta' }: { size?: number; textColor?: string; hairline?: string; suffix?: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        height: size,
        border: `1px solid ${hairline}`,
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        <span style={{ fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.13em', color: textColor, whiteSpace: 'nowrap', transition: 'color 350ms ease' }}>
          ROUTINE³
        </span>
      </div>
      {suffix && <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', borderLeft: `1px solid ${hairline}`, transition: 'border-color 350ms ease' }}>
        <span style={{ fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: textColor, whiteSpace: 'nowrap', transition: 'color 350ms ease' }}>
          {suffix}
        </span>
      </div>}
    </div>
  );
}

/**
 * The header's links. `dropOrder`: the lower, the earlier a link moves into the menu when the bar is narrow.
 * Guardians is last to go: it is the way into the Guardian portal.
 */
const NAV_LINKS: { key: string; label: string; section?: string; href?: string; dropOrder: number }[] = [
  { key: 'routines', label: 'Routines', section: 'routines', dropOrder: 4 },
  { key: 'features', label: 'Features', section: 'features', dropOrder: 3 },
  { key: 'how', label: 'How It Works', section: 'how-it-works', dropOrder: 2 },
  { key: 'faq', label: 'FAQ', section: 'faq', dropOrder: 1 },
  { key: 'guardians', label: 'Guardians', href: '/guardians', dropOrder: 99 },
];

interface HeaderProps {
  onNavigateToProfile?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHome?: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToBlog?: () => void;
  onNavigateToNetworkTest?: () => void;
  currentPage?: PageType;
  isAdmin?: boolean;
  user?: any;
  authLoading?: boolean;
  hasEmailBanner?: boolean;
}

export function Header({ 
  onNavigateToProfile, 
  onNavigateToSettings, 
  onNavigateToHome, 
  onNavigateToAdmin, 
  onNavigateToBlog,
  onNavigateToNetworkTest,
  currentPage = 'home',
  isAdmin = false,
  user: propUser,
  authLoading = false,
  hasEmailBanner = false
}: HeaderProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<string | null>(null);
  const { user: contextUser, signOut } = useAuth();
  
  // Scroll header behavior
  const { isVisible, isScrolling, scrollDirection, animationState } = useScrollHeader({
    threshold: 10,
    showDelay: 150
  });
  
  // Use prop user if provided, otherwise fall back to context user
  const user = propUser || contextUser;
  // What the bar shows at the width it has: links that fit, the rest (and the account actions on a narrow bar) in the menu.
  const { layout, rowRef, logoRef, authRef, setLinkRef } = useHeaderLayout(NAV_LINKS, [user?.id, user?.email, waitlistPosition]);
  
  // FIXED: Use proper admin detection functions
  const adminInfo = getAdminUserInfo(user);
  const userIsAdmin = isAdminUser(user);

  // Debug logging (opt-in: localStorage 'hs-debug'='1') — this ran on every
  // render and flooded the console, so it's gated off by default.
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && localStorage.getItem("hs-debug") === "1") {
    console.log('🎯 Header Component Debug:', {
      propIsAdmin: isAdmin,
      userIsAdmin: userIsAdmin,
      adminInfoIsAdmin: adminInfo.isAdmin,
      hasAdminCallback: !!onNavigateToAdmin,
      userEmail: user?.email,
      adminLevel: adminInfo.level,
      hasEmailBanner,
      animationState,
      isVisible
    });
  }

  const handleSignIn = () => {
    setAuthMode('signin');
    setShowAuthModal(true);
  };

  const handleSignUp = () => {
    setAuthMode('signup');
    setShowAuthModal(true);
  };

  const handleWaitlistModal = () => {
    setShowWaitlistModal(true);
  };

  const handleReferralModal = () => {
    setShowReferralModal(true);
  };

  // Generate consistent referral code for user
  const generateConsistentReferralCode = (email: string): string => {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const positiveHash = Math.abs(hash);
    const code = positiveHash.toString(36).substring(0, 6).padEnd(6, '0');
    return `hs_${code}`;
  };

  const handleWaitlistSuccess = () => {
    setShowWaitlistModal(false);
    toast.success('Subscribed — welcome to ROUTINE³!');
    
    // Update waitlist position after successful signup
    setTimeout(() => {
      const storedPosition = localStorage.getItem('healthscan_user_position');
      if (storedPosition && storedPosition !== '0') {
        setWaitlistPosition(storedPosition);
      }
    }, 100);
  };

  // Get user's waitlist position from localStorage
  useEffect(() => {
    const updateWaitlistPosition = () => {
      const userEmail = localStorage.getItem('healthscan_user_email');
      const storedPosition = localStorage.getItem('healthscan_user_position');
      
      if (userEmail && storedPosition && storedPosition !== '0') {
        setWaitlistPosition(storedPosition);
      } else {
        setWaitlistPosition(null);
      }
    };

    // Update on mount
    updateWaitlistPosition();

    // Listen for waitlist signup events
    const handleUserSignedUp = () => {
      updateWaitlistPosition();
    };

    window.addEventListener('userSignedUp', handleUserSignedUp);
    return () => window.removeEventListener('userSignedUp', handleUserSignedUp);
  }, []);

  // Trigger shake animation periodically for header button
  useEffect(() => {
    if (!user && !waitlistPosition) { // Only shake when user is not logged in and not on waitlist
      const shakeInterval = setInterval(() => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 600);
      }, 4000); // Shake every 4 seconds

      return () => clearInterval(shakeInterval);
    } else if (user) {
      // Shake the "Refer Friends" button occasionally for logged-in users
      const referralShakeInterval = setInterval(() => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 600);
      }, 8000); // Shake every 8 seconds for refer friends button

      return () => clearInterval(referralShakeInterval);
    }
  }, [user, waitlistPosition]);

  const handleSignOut = async () => {
    await signOut();
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleNavClick = (callback?: () => void) => {
    if (callback) {
      callback();
    } else {
      console.warn('⚠️ Navigation callback is undefined');
    }
  };

  const handleSectionScroll = (sectionId: string) => {
    // If we're not on home page, navigate to home first
    if (currentPage !== 'home') {
      // Navigate to home and then scroll to section after a delay
      handleNavClick(onNavigateToHome);
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          const headerHeight = 64; // Height of fixed header
          const bannerHeight = hasEmailBanner ? 64 : 0; // Height of email banner
          const totalOffset = headerHeight + bannerHeight;
          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset - totalOffset;
          window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    } else {
      // We're already on home page, just scroll to section
      const element = document.getElementById(sectionId);
      if (element) {
        const headerHeight = 64; // Height of fixed header
        const bannerHeight = hasEmailBanner ? 64 : 0; // Height of email banner
        const totalOffset = headerHeight + bannerHeight;
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset - totalOffset;
        window.scrollTo({
          top: elementPosition,
          behavior: 'smooth'
        });
      }
    }
  };

  const handleHomeNavigation = () => {
    handleNavClick(onNavigateToHome);
    // Scroll to top when navigating to home
    if (currentPage !== 'home') {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Admin panel click handler (verbose logs gated behind localStorage 'hs-debug'='1')
  const handleAdminClick = () => {
    const dbg = process.env.NODE_ENV === "development" && typeof window !== "undefined" && localStorage.getItem("hs-debug") === "1";
    if (dbg) {
      console.log('🛡️ Admin panel clicked:', { propIsAdmin: isAdmin, userIsAdmin, adminInfoIsAdmin: adminInfo.isAdmin, adminLevel: adminInfo.level, userEmail: user?.email, hasCallback: !!onNavigateToAdmin });
    }

    // Use the most permissive admin check
    const shouldAllowAdmin = isAdmin || userIsAdmin || adminInfo.isAdmin;

    if (shouldAllowAdmin && onNavigateToAdmin) {
      toast.info('🛡️ Opening Admin Dashboard...');
      handleNavClick(onNavigateToAdmin);
    } else {
      if (dbg) console.error('❌ Admin navigation failed:', { shouldAllowAdmin, hasCallback: !!onNavigateToAdmin });

      if (!shouldAllowAdmin) {
        toast.error('🚫 Admin access denied - insufficient privileges');
      } else if (!onNavigateToAdmin) {
        toast.error('🚫 Admin navigation not available - missing callback');
      }
    }
  };

  // Show simplified header for admin and other non-home pages
  const showSimplifiedHeader = currentPage !== 'home';

  // Determine if admin button should be shown
  const showAdminButton = isAdmin || userIsAdmin || adminInfo.isAdmin;

  // The menu: the links that did not fit, then (only when the account actions are not in the bar) the account.
  const menuLinks: MenuItemSpec[] = NAV_LINKS.filter((l) => layout.overflow.includes(l.key)).map((l) => ({ key: l.key, label: l.label, href: l.href, onSelect: l.section ? () => handleSectionScroll(l.section!) : undefined }));
  const menuAccount: MenuItemSpec[] = layout.authInline ? [] : user ? [
    { key: 'dashboard', label: 'Dashboard', onSelect: () => handleNavClick(onNavigateToProfile) },
    { key: 'guardian', label: 'Guardian workspace', href: '/guardians/workspace' },
    { key: 'settings', label: 'Settings', onSelect: () => handleNavClick(onNavigateToSettings) },
    { key: 'refer', label: 'Refer a friend', onSelect: handleReferralModal },
    ...(showAdminButton ? [{ key: 'admin', label: 'Admin', tag: adminInfo.level?.toUpperCase() || 'ADMIN', onSelect: handleAdminClick }] : []),
    { key: 'signout', label: 'Sign out', onSelect: handleSignOut },
  ] : [
    { key: 'signin', label: 'Sign in', onSelect: handleSignIn },
    { key: 'subscribe', label: 'Subscribe', tone: 'primary' as const, onSelect: handleWaitlistModal },
  ];

  // Enhanced header animation classes with email banner awareness
  const getHeaderAnimationClasses = () => {
    if (animationState === 'hiding') {
      return 'animate-header-slide-up-away';
    } else if (animationState === 'showing') {
      return hasEmailBanner 
        ? 'animate-header-slide-down-return-with-banner' 
        : 'animate-header-slide-down-return';
    } else if (isVisible) {
      return hasEmailBanner ? 'header-visible-with-banner' : 'header-visible';
    } else {
      return 'header-hidden';
    }
  };

  // Frosted, light-text header while over the hero (top of the home page); reverts
  // to the cream capsule + dark text once scrolled onto the light sections below,
  // so the nav stays readable everywhere.
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const overHero = currentPage === 'home' && atTop;
  // Dark, elegant editorial text everywhere (readable on the light frosted blur).
  const navText = oura.body;
  // Shared cell for the joined header lockups (Sign in | Subscribe, Dashboard | Sign out).
  const lockupCell: React.CSSProperties = { height: 32, padding: '0 14px', border: 0, background: 'transparent', color: navText, fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 350ms ease, border-color 350ms ease' };
  const navStrong = '#16140F';
  const navHover = oura.forest;
  const navLink: CSSProperties = { fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.13em', color: navText, background: 'transparent', border: 'none', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap', padding: '8px 16px', textDecoration: 'none', transition: 'color 300ms cubic-bezier(0.4,0,0.2,1)' };
  const capsule = overHero
    // pure, neutral frosted blur — no dark tone
    ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(30px) saturate(1.3)', WebkitBackdropFilter: 'blur(30px) saturate(1.3)', border: '1px solid rgba(255,255,255,0.24)', boxShadow: '0 12px 40px -24px rgba(0,0,0,0.28)' }
    : { background: 'rgba(244,241,234,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(22,20,15,0.14)', boxShadow: '0 10px 34px -16px rgba(22,20,15,0.28)' };
  // Try / Subscribe / Refer — solid white pills with dark text
  const ctaWhite: React.CSSProperties = { background: '#FFFFFF', color: '#16140F', borderColor: '#FFFFFF', textDecorationColor: 'transparent', boxShadow: '0 2px 12px -5px rgba(0,0,0,0.35)' };

  return (
    <>
      <style>{R3_MENU_CSS}</style>
      <header
        style={{ background: 'transparent', paddingTop: 14 }}
        className={`fixed left-0 right-0 z-40 header-transition ${
          hasEmailBanner ? 'top-[var(--email-banner-height)]' : 'top-0'
        } ${getHeaderAnimationClasses()}`}
      >
        {/* Same container as the hero so the bar spans the hero width */}
        <div style={{ maxWidth: 1440, margin: '0 auto', paddingLeft: 'clamp(20px, 5vw, 72px)', paddingRight: 'clamp(20px, 5vw, 72px)' }}>
          <div
            style={{
              ...capsule,
              borderRadius: 16,
              paddingLeft: 'clamp(16px, 2vw, 28px)',
              paddingRight: 'clamp(16px, 2vw, 28px)',
              transition: 'background 350ms ease, backdrop-filter 350ms ease, border-color 350ms ease, box-shadow 350ms ease',
            }}
          >
          <div ref={rowRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: HEADER_GAP, height: 64 }}>
            {/* Lockup */}
            <div ref={logoRef as React.RefObject<HTMLDivElement>} className="flex items-center cursor-pointer flex-shrink-0" onClick={handleHomeNavigation}>
              <RoutineMark size={28} textColor={navStrong} />
            </div>

            {/* The links that fit. The rest are in the menu: Guardians is the last to go. A link that is not shown is parked
                (kept in the page, off screen) so its width stays known. */}
            <nav aria-label="Main navigation" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: HEADER_LINK_GAP }}>
              {NAV_LINKS.map((link) => {
                const style: React.CSSProperties = { ...navLink, ...(layout.inline.includes(link.key) ? {} : parked) };
                const hover = { onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = navHover; }, onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = navText; } };
                return link.href
                  ? <a key={link.key} ref={setLinkRef(link.key)} href={link.href} style={style} {...hover}>{link.label}</a>
                  : <button key={link.key} ref={setLinkRef(link.key)} type="button" onClick={() => handleSectionScroll(link.section!)} style={style} {...hover}><span style={{ fontSize: 14 }}>{link.label}</span></button>;
              })}
            </nav>

            {/* Account actions: in the bar while they fit, otherwise in the menu. */}
            <div ref={authRef as React.RefObject<HTMLDivElement>} style={layout.authInline ? { display: 'flex', alignItems: 'center', flexShrink: 0 } : parked}>
            
              {user ? (
                <div className="flex items-center space-x-3">
                  {/* User Information - Moved to left */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-2 h-auto p-2 hover:bg-gray-100"
                    >
                      <div className="hidden lg:flex flex-col items-end">
                        <span className="text-sm font-medium text-right" style={{ color: navStrong, transition: 'color 350ms ease' }}>
                          {user.user_metadata?.full_name || user.user_metadata?.name || user.email}
                        </span>
                      </div>
                      <Avatar className="w-8 h-8 avatar-with-hover-effects">
                        <AvatarImage 
                          src={user.user_metadata?.avatar_url} 
                          alt="Profile picture"
                          className="object-cover"
                        />
                        <AvatarFallback className="text-white text-sm avatar-fallback" style={{ background: oura.forest }}>
                          {getUserInitials(user.user_metadata?.name || user.email || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 r3-menu">
                    <DropdownMenuItem onClick={handleReferralModal}>
                      <Share2 className="mr-2 h-4 w-4" />
                      <span>Refer a friend</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleNavClick(onNavigateToProfile)}>
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { window.location.href = '/guardians/workspace'; }}>
                      <Compass className="mr-2 h-4 w-4" />
                      <span>Guardian</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleNavClick(onNavigateToSettings)}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    {showAdminButton && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={handleAdminClick} 
                          className="text-red-700 focus:text-red-700 focus:bg-red-50"
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          <span>Admin</span>
                          <span className="ml-auto text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                            {adminInfo.level?.toUpperCase() || 'ADMIN'}
                          </span>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {/* Signed in: Dashboard | Sign out, same joined lockup as Sign in | Subscribe */}
                  <div className="r3-lockup" style={{ display: 'flex', border: `1px solid ${navText}`, borderRadius: 2, transition: 'border-color 350ms ease' }}>
                    <button onClick={() => handleNavClick(onNavigateToProfile)} style={lockupCell}>Dashboard</button>
                    <button onClick={handleSignOut} style={{ ...lockupCell, borderLeft: `1px solid ${navText}` }}>Sign out</button>
                  </div>
                </div>
              ) : (
                // Sign in + Subscribe share one hairline box, same joined-seam treatment as the logo lockup.
                <div className={`r3-lockup ${isShaking ? 'animate-button-shake' : ''}`} style={{ display: 'flex', border: `1px solid ${navText}`, borderRadius: 2, transition: 'border-color 350ms ease' }}>
                  <button onClick={handleSignIn} style={lockupCell}>Sign in</button>
                  <button onClick={handleWaitlistModal} style={{ ...lockupCell, borderLeft: `1px solid ${navText}` }}>Subscribe</button>
                </div>
              )}
            </div>

            {layout.menu && <HeaderMenu color={navText} groups={[menuLinks, menuAccount]} />}
          </div>
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal 
        open={showAuthModal} 
        onOpenChange={setShowAuthModal}
        defaultTab={authMode === 'signin' ? 'login' : 'signup'}
      />

      {/* Waitlist Modal */}
      <Dialog open={showWaitlistModal} onOpenChange={setShowWaitlistModal}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">Subscribe to ROUTINE³</DialogTitle>
          <DialogDescription className="sr-only">
            Sign up for early access to ROUTINE³
          </DialogDescription>
          <UniversalWaitlist 
            onSignupSuccess={handleWaitlistSuccess}
          />
        </DialogContent>
      </Dialog>

      {/* Referral Modal */}
      <SocialSharingModal 
        open={showReferralModal}
        onOpenChange={setShowReferralModal}
        userEmail={user?.email}
        referralCode={user ? generateConsistentReferralCode(user.email) : undefined}
        userName={user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || ''}
      />
    </>
  );
}
