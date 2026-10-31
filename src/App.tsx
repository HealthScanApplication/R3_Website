import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DesignSystemProvider } from "./contexts/DesignSystemContext";
import { PageRenderer } from "./components/PageRenderer";
import { Header, RoutineMark } from "./components/Header";
import { Footer } from "./components/Footer";
import { HardwarePreorder } from "./components/HardwarePreorder";
import { HardwarePage } from "./components/hardware/HardwarePage";
import { EmailConfirmationBanner } from "./components/EmailConfirmationBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeManager } from "./components/ThemeManager";
import { Toaster } from "./components/ui/sonner";

import { useNavigation } from "./hooks/useNavigation";
import { useReferral } from "./hooks/useReferral";
import { useUrlParameterHandling } from "./hooks/useUrlParameterHandling";
import { useWindowEventHandlers } from "./hooks/useWindowEventHandlers";
import { useDocumentSetup } from "./hooks/useDocumentSetup";

import { isAdminUser } from "./utils/adminUtils";
import { 
  initializeRefreshTokenMonitoring,
  handleRefreshTokenError,
  isRefreshTokenError 
} from "./utils/refreshTokenRecovery";

// Loading screen: a flipbook of black-and-white photos from the content library, cutting frame to frame, under the
// ROUTINE³ masthead mark. Only frames that have loaded are shown, so it never flashes a blank; reduced motion holds
// the first frame.
const LOADER_FRAMES = ['11-morning-routine', '08-daily-movement', '10-healthy-eating', '04-stress-and-calm', '09-hydration', '13-focus', '12-evening-reset', '20-body-mind-soul'].map((f) => `/images/content/${f}.webp`);
export function LoadingScreen() {
  const guardian = /^\/(guardians|guides?)(\/|$)/.test(window.location.pathname);
  const [ready, setReady] = useState<string[]>([]);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let live = true;
    LOADER_FRAMES.forEach((src) => { const img = new Image(); img.onload = () => { if (live) setReady((r) => (r.includes(src) ? r : LOADER_FRAMES.filter((f) => f === src || r.includes(f)))); }; img.src = src; });
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = still ? 0 : window.setInterval(() => setFrame((n) => n + 1), 420);
    return () => { live = false; if (t) window.clearInterval(t); };
  }, []);
  const src = ready.length ? ready[frame % ready.length] : null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#16140F', color: '#F4F1EA', padding: 24 }}>
      {src && <img key={src} src={src} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', filter: 'grayscale(1) contrast(1.08) brightness(0.92)' }} />}
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 50% at 50% 50%, rgba(22,20,15,0.55), rgba(22,20,15,0.2))' }} />
      <div style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: 14 }}>
        <RoutineMark size={32} textColor="#F4F1EA" hairline="#F4F1EA" suffix={guardian ? 'Guardians' : ''} />
        <p style={{ margin: 0, color: 'rgba(244,241,234,0.78)', fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          {guardian ? 'Opening your workspace' : 'Loading'}
        </p>
      </div>
    </div>
  );
}

// Error fallback component
function AppErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 text-center">
        <h1 className="text-xl font-bold text-red-900 mb-2">
          Application Error
        </h1>
        <p className="text-red-700 mb-4">{error.message}</p>
        <button
          onClick={resetError}
          className="w-full h-12 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full h-12 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors mt-2"
        >
          Reload Application
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showThemeManager, setShowThemeManager] =
    useState(false);

  // Global refresh token error handler using the utility
  useEffect(() => {
    const cleanupMonitoring = initializeRefreshTokenMonitoring();
    
    // Additional app-specific error handling
    const handleAuthError = (event: CustomEvent) => {
      if (event.detail && isRefreshTokenError(event.detail)) {
        console.warn('🔄 Custom auth error event with refresh token issue');
        handleRefreshTokenError(event.detail, 'custom-auth-event');
      }
    };

    // Listen for custom auth events
    window.addEventListener('refreshTokenError', handleAuthError as EventListener);

    return () => {
      cleanupMonitoring();
      window.removeEventListener('refreshTokenError', handleAuthError as EventListener);
    };
  }, []);

  // Development logging with error handling and enhanced auth debugging
  useEffect(() => {
    try {
      if (process.env.NODE_ENV === "development") {
        // Verbose dev banner is opt-in — set localStorage 'hs-debug'='1' to see it.
        // Keeps the console clean by default (the banner is reference text, not signal).
        if (typeof window !== "undefined" && localStorage.getItem("hs-debug") === "1") {
          console.group("🔧 ROUTINE³ Development Tools");
          console.log('🎨 Ctrl+Shift+T toggles the theme manager (admin only)');
          console.log('🔍 "?page=login-diagnostic" opens the login diagnostic tool');
          console.log('📧 "Invalid login credentials" / "User already registered" are expected auth responses, not errors');
          console.log('🧪 window.HealthScanAuthDebug.testConnection() tests the Supabase session');
          console.groupEnd();
        }

        // Add global helper for auth debugging
        if (typeof window !== "undefined") {
          (window as any).HealthScanAuthDebug = {
            testConnection: async () => {
              console.log(
                "🧪 Testing authentication connection...",
              );
              try {
                const { getSupabaseClient } = await import(
                  "./utils/supabase/client"
                );
                const supabase = getSupabaseClient();
                const { data, error } =
                  await supabase.auth.getSession();
                console.log("Session test result:", {
                  hasSession: !!data?.session,
                  error: error?.message,
                });
                return {
                  success: true,
                  hasSession: !!data?.session,
                  error: error?.message,
                };
              } catch (err: any) {
                console.error("Connection test failed:", err);
                return { success: false, error: err.message };
              }
            },
            getCurrentUser: async () => {
              try {
                const { getSupabaseClient } = await import(
                  "./utils/supabase/client"
                );
                const supabase = getSupabaseClient();
                const { data, error } =
                  await supabase.auth.getUser();
                console.log(
                  "Current user:",
                  data?.user || "Not logged in",
                  error?.message || "",
                );
                return {
                  user: data?.user,
                  error: error?.message,
                };
              } catch (err: any) {
                console.error("Get user failed:", err);
                return { user: null, error: err.message };
              }
            },
            resetPassword: async (email: string) => {
              console.log(
                "🔄 Initiating password reset for:",
                email,
              );
              try {
                const { getSupabaseClient } = await import(
                  "./utils/supabase/client"
                );
                const supabase = getSupabaseClient();
                const { error } =
                  await supabase.auth.resetPasswordForEmail(
                    email,
                    {
                      redirectTo: `${window.location.origin}/reset-password`,
                    },
                  );

                if (error) {
                  console.error("Password reset error:", error);
                  return {
                    success: false,
                    error: error.message,
                  };
                }

                console.log("✅ Password reset email sent");
                return {
                  success: true,
                  message: "Password reset email sent",
                };
              } catch (err: any) {
                console.error("Password reset failed:", err);
                return { success: false, error: err.message };
              }
            },
            checkUserExists: async (email: string) => {
              console.log("🔍 Checking if user exists:", email);
              try {
                const { getSupabaseClient } = await import(
                  "./utils/supabase/client"
                );
                const supabase = getSupabaseClient();

                // Use password reset to check user existence safely
                const { error } =
                  await supabase.auth.resetPasswordForEmail(
                    email,
                    {
                      redirectTo: `${window.location.origin}/test-reset`,
                    },
                  );

                if (error) {
                  if (
                    error.message?.includes("User not found")
                  ) {
                    console.log("❌ User does not exist");
                    return {
                      exists: false,
                      message: "User not found",
                    };
                  }
                  console.log(
                    "⚠️ Error checking user:",
                    error.message,
                  );
                  return {
                    exists: "unknown",
                    error: error.message,
                  };
                }

                console.log("✅ User exists");
                return { exists: true, message: "User found" };
              } catch (err: any) {
                console.error("User check failed:", err);
                return {
                  exists: "unknown",
                  error: err.message,
                };
              }
            },
            help: () => {
              console.group("🔑 Authentication Debug Commands");
              console.log(
                "HealthScanAuthDebug.testConnection() - Test if auth service is working",
              );
              console.log(
                "HealthScanAuthDebug.getCurrentUser() - Check if you are logged in",
              );
              console.log(
                "HealthScanAuthDebug.resetPassword(email) - Send password reset email",
              );
              console.log(
                "HealthScanAuthDebug.checkUserExists(email) - Check if a user account exists",
              );
              console.log(
                "HealthScanAuthDebug.help() - Show this help",
              );
              console.log("");
              console.log("📋 AUTHENTICATION STATUS GUIDE:");
              console.log(
                '✅ "Invalid login credentials" = Working correctly, wrong email/password',
              );
              console.log(
                '✅ "User already registered" = Working correctly, account already exists',
              );
              console.log(
                "✅ These are expected responses, not system errors",
              );
              console.groupEnd();
            },
          };

          // Show auth debug help after a delay
          setTimeout(() => {
            console.log(
              "💡 Type HealthScanAuthDebug.help() in console for authentication debugging commands",
            );
            console.log(
              "💡 Type HealthScanRefreshTokenRecovery.help() for refresh token debugging tools",
            );
            console.log("");
            console.log("🎯 AUTHENTICATION ERROR RESOLUTION:");
            console.log(
              '   If you see "invalid_credentials" error:',
            );
            console.log(
              "   1. Check that you are using the correct email and password",
            );
            console.log(
              "   2. Verify the account exists in the system",
            );
            console.log(
              '   3. Use the diagnostic tool by adding "?page=login-diagnostic" to the URL',
            );
            console.log("");
            console.log("🔄 REFRESH TOKEN ERROR RESOLUTION:");
            console.log(
              '   If you see "Invalid Refresh Token" error:',
            );
            console.log(
              "   1. The system automatically clears tokens and resets authentication",
            );
            console.log(
              "   2. You may need to sign in again",
            );
            console.log(
              "   3. This is normal behavior when tokens expire or become corrupted",
            );
            console.log("");
          }, 3000);
        }
      }
    } catch (error) {
      console.warn("Failed to log diagnostic info:", error);
    }
  }, []);

  // Admin check with error handling
  const isAdmin = useMemo(() => {
    try {
      return user ? isAdminUser(user) : false;
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }, [user]);

  // Navigation hooks with safe destructuring
  const navigation = useNavigation({ isAdmin });
  const referral = useReferral();

  const currentPage = navigation?.currentPage || "home";
  const isGuidePortal = currentPage === "guides";
  const setCurrentPage =
    navigation?.setCurrentPage || (() => {});
  const navigateToPage =
    navigation?.navigateToPage || (() => {});
  const navigateToHome = useCallback(
    () => setCurrentPage("home"),
    [setCurrentPage],
  );

  const hasReferral = referral?.hasReferral || false;
  const isActive = referral?.isActive || false;
  const referralCode = referral?.referralCode || null;

  // Call hooks at top level - FIXED: Moved outside of useEffect
  useUrlParameterHandling({ setCurrentPage });
  useWindowEventHandlers({ setCurrentPage, navigateToPage });
  useDocumentSetup();

  // Theme manager keyboard shortcut
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key === "T" &&
        isAdmin
      ) {
        event.preventDefault();
        setShowThemeManager((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () =>
      window.removeEventListener("keydown", handleKeydown);
  }, [isAdmin]);

  // Reset banner when user changes
  useEffect(() => {
    setBannerDismissed(false);
  }, [user?.id]);

  // Email banner visibility - Simplified and fixed logic
  const shouldShowEmailBanner = useMemo(() => {
    try {
      // Simple logic: Show banner if user exists, has email, but email is NOT confirmed in Supabase
      const hasUser = !!user;
      const hasEmail = !!user?.email;
      const isEmailConfirmed = !!user?.email_confirmed_at;
      
      const result = Boolean(
        hasUser &&
          hasEmail &&
          !isEmailConfirmed && // Only check Supabase confirmation - this is the source of truth
          !bannerDismissed &&
          !loading
      );
      
      // Clean up localStorage if email is confirmed in Supabase
      if (hasUser && hasEmail && isEmailConfirmed) {
        // Clear any old localStorage flags if email is confirmed
        localStorage.removeItem('healthscan_needs_confirmation');
        localStorage.setItem('healthscan_email_confirmed', 'true');
      }
      
      // Debug logging for email banner visibility
      if (process.env.NODE_ENV === "development") {
        console.log("📧 Email Banner Debug:", {
          hasUser,
          hasEmail,
          emailConfirmedAt: user?.email_confirmed_at,
          isEmailConfirmed,
          bannerDismissed,
          loading,
          shouldShow: result,
          userEmail: user?.email
        });
      }
      
      return result;
    } catch (error) {
      console.error(
        "Error determining email banner visibility:",
        error,
      );
      return false;
    }
  }, [user, bannerDismissed, loading]);

  // Safe banner dismissal
  const handleBannerDismiss = useCallback(() => {
    setBannerDismissed(true);
    console.log("📧 Email verification banner dismissed");
  }, []);

  // Safe navigation handlers
  const handleNavigateToProfile = useCallback(
    () => navigateToPage("profile"),
    [navigateToPage],
  );
  const handleNavigateToSettings = useCallback(
    () => navigateToPage("settings"),
    [navigateToPage],
  );
  const handleNavigateToAdmin = useCallback(
    () => navigateToPage("admin"),
    [navigateToPage],
  );
  const handleNavigateToNetworkTest = useCallback(
    () => navigateToPage("diagnostic"),
    [navigateToPage],
  );
  const handleNavigateToBlog = useCallback(
    () => navigateToPage("blog"),
    [navigateToPage],
  );

  // Helper functions
  const getMainContentClasses = useCallback(
    (page: string, hasEmailBanner: boolean) => {
      const baseClasses = "min-h-screen";
      const headerOffset = page === "home" || page === "guides" ? "" : " header-offset";
      const bannerOffset = hasEmailBanner ? " banner-offset" : "";
      
      return `${baseClasses}${headerOffset}${bannerOffset}`;
    },
    [],
  );

  const getMainContentStyles = useCallback(
    (hasEmailBanner: boolean) => ({
      overflowX: "hidden" as const,
      overflowY: "auto" as const,
      WebkitOverflowScrolling: "touch" as const,
      position: "relative" as const,
      // Remove redundant marginTop - spacing is handled by CSS classes and header positioning
    }),
    [],
  );

  // Get header classes with banner awareness
  const getHeaderClasses = useCallback(
    (hasEmailBanner: boolean) => {
      const baseClasses = "fixed top-0 left-0 right-0 z-50";
      const bannerOffset = hasEmailBanner ? " header-with-banner" : "";
      
      return `${baseClasses}${bannerOffset}`;
    },
    [],
  );

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Theme Manager Overlay (Admin Only) */}
      {showThemeManager && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="fixed inset-4 bg-[var(--background)] rounded-xl shadow-2xl overflow-auto">
            <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                🎨 Design System Manager
              </h2>
              <button
                onClick={() => setShowThemeManager(false)}
                className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <ThemeManager isAdmin={isAdmin} />
            </div>
          </div>
        </div>
      )}

      {/* Email Confirmation Banner - ALWAYS rendered first */}
      {shouldShowEmailBanner && user?.email && (
        <EmailConfirmationBanner
          userEmail={user.email}
          onDismiss={handleBannerDismiss}
        />
      )}

      {/* Header - Positioned after banner when present */}
      {!isGuidePortal && <Header
        currentPage={currentPage}
        onNavigateToHome={navigateToHome}
        onNavigateToProfile={handleNavigateToProfile}
        onNavigateToSettings={handleNavigateToSettings}
        onNavigateToAdmin={handleNavigateToAdmin}
        onNavigateToNetworkTest={handleNavigateToNetworkTest}
        onNavigateToBlog={handleNavigateToBlog}
        user={user}
        isAdmin={isAdmin}
        authLoading={loading}
        hasEmailBanner={shouldShowEmailBanner}
      />}

      {/* Main Content - Properly spaced with banner and header */}
      <main
        id="main-content"
        tabIndex={-1}
        className={getMainContentClasses(
          currentPage,
          shouldShowEmailBanner,
        )}
        style={getMainContentStyles(shouldShowEmailBanner)}
      >
        <PageRenderer
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          navigateToHome={navigateToHome}
          navigateToPage={navigateToPage}
          isAdmin={isAdmin}
          user={user}
          authLoading={loading}
          hasReferral={hasReferral}
          isActive={isActive}
          referralCode={referralCode}
        />
      </main>

      {currentPage === "home" && <HardwarePreorder />}
      {currentPage === "hardware" && <HardwarePage />}

      {/* Footer */}
      {!isGuidePortal && <Footer />}

      {/* Theme Manager Quick Access (Admin Only) */}
      {isAdmin && !showThemeManager && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={() => setShowThemeManager(true)}
            className="p-3 bg-[var(--healthscan-green)] text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
            title="Design System Manager (Ctrl+Shift+T)"
          >
            🎨
          </button>
        </div>
      )}

      {/* Toast Notifications - Positioned in bottom-right corner */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            marginBottom: "10px", // Clean bottom spacing
            marginRight: "10px", // Clean right spacing
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={AppErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <DesignSystemProvider>
          <AuthProvider>
            <ErrorBoundary fallback={AppErrorFallback}>
              <AppContent />
            </ErrorBoundary>
          </AuthProvider>
        </DesignSystemProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
