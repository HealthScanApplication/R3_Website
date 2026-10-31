import React, { Suspense, useEffect, useState } from 'react'
import { HeroSection } from './HeroSection'
import { RoutinesSection } from './RoutinesSection'
import { AppFeaturesSection } from './AppFeaturesSection'
import { HowItWorksSection } from './HowItWorksSection'
import { FeatureShowcase } from './FeatureShowcase'
import { LaunchVideoSection } from './LaunchVideoSection'
import { SocialProofSection } from './SocialProofSection'
import { FAQSection } from './FAQSection'
import { EmailSubscribeSection } from './EmailSubscribeSection'
import { BlogPreviewSection } from './BlogPreviewSection'
import { DiscordCommunitySection } from './DiscordCommunitySection'
import { HardwarePage } from './hardware/HardwarePage'
import { isAdminUser } from '../utils/adminUtils'
import { useAdminAuth, getAccessTokenDirect } from '../contexts/AuthContext'
import { EnvironmentToggle } from './admin/EnvironmentToggle'
import { EnvironmentBanner } from './admin/EnvironmentBanner'
import { AdminWorkspace } from './admin/AdminWorkspace'

// Lazy-loaded pages (not needed on initial landing page load)
const ProfilePage = React.lazy(() => import('./ProfilePage').then(m => ({ default: m.ProfilePage })))
const SettingsPage = React.lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage })))
const NetworkDiagnostic = React.lazy(() => import('./NetworkDiagnostic').then(m => ({ default: m.NetworkDiagnostic })))
const LoginDiagnostic = React.lazy(() => import('./LoginDiagnostic').then(m => ({ default: m.LoginDiagnostic })))
const Blog = React.lazy(() => import('./Blog').then(m => ({ default: m.Blog })))
const ReferralTestPage = React.lazy(() => import('./ReferralTestPage').then(m => ({ default: m.ReferralTestPage })))
const ConvertKitTestPage = React.lazy(() => import('./ConvertKitTestPage').then(m => ({ default: m.ConvertKitTestPage })))
const EmailCaptureDebugger = React.lazy(() => import('./EmailCaptureDebugger').then(m => ({ default: m.EmailCaptureDebugger })))
const EmailCaptureTestPage = React.lazy(() => import('./EmailCaptureTestPage').then(m => ({ default: m.EmailCaptureTestPage })))
const GuidePortal = React.lazy(() => import('./guides/GuidePortal').then(m => ({ default: m.GuidePortal })))

// Loading fallback for lazy-loaded pages
function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-[var(--healthscan-green)] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

interface PageRendererProps {
  currentPage: string
  setCurrentPage: (page: string) => void
  navigateToHome: () => void
  navigateToPage: (page: string) => void
  isAdmin: boolean
  user: any
  authLoading: boolean
  hasReferral: boolean
  isActive: boolean
  referralCode: string | null
}

export function PageRenderer({
  currentPage,
  setCurrentPage,
  navigateToHome,
  navigateToPage,
  isAdmin,
  user,
  authLoading,
  hasReferral,
  isActive,
  referralCode
}: PageRendererProps) {
  
  // Get admin auth info including access token
  const { accessToken, isAdminAuthenticated, refreshSession } = useAdminAuth()
  const [fallbackToken, setFallbackToken] = useState<string | null>(null)
  
  // Handle admin page access
  useEffect(() => {
    if (currentPage === 'admin' && !authLoading) {
      // Double-check admin status using the utility function
      const userIsAdmin = isAdminUser(user)
      
      if (!userIsAdmin) {
        console.warn('🚫 Non-admin user attempted to access admin page, redirecting to home')
        setCurrentPage('home')
        return
      }
      
      console.log('✅ Admin access granted for:', user?.email)
      console.log('🔑 Access token available:', !!accessToken)
      
      // If no access token, try to refresh session and get direct token
      if (!accessToken) {
        console.log('🔄 No access token found, attempting to refresh session...')
        refreshSession()
        
        // Also try to get token directly as fallback
        getAccessTokenDirect().then(token => {
          if (token) {
            console.log('🔑 Got fallback access token directly from Supabase')
            setFallbackToken(token)
          }
        })
      }
    }
  }, [currentPage, user, authLoading, isAdmin, setCurrentPage, accessToken, refreshSession])

  // Don't render admin page for non-admin users
  if (currentPage === 'admin' && (!user || !isAdminUser(user))) {
    return (
      <>
        {/* Hero Section */}
        <HeroSection 
          hasReferral={hasReferral}
          isActive={isActive}
          referralCode={referralCode}
        />
        
        {/* Routines Section — pick a goal, get a routine */}
        <RoutinesSection />

        {/* How It Works Section */}
        <HowItWorksSection />

        {/* App Features Section — the camera that powers routines */}
        <AppFeaturesSection />
        
        {/* Feature Showcase */}
        <FeatureShowcase />
        
        {/* Launch Video Section */}
        <LaunchVideoSection />
        
        {/* Social Proof Section */}
        <SocialProofSection />
        
        {/* FAQ Section */}
        <FAQSection />
        
        {/* Email Subscribe Section */}
        <EmailSubscribeSection />
        
        {/* Blog Preview Section */}
        <BlogPreviewSection />
        
        {/* Discord Community Section */}
        <DiscordCommunitySection />
      </>
    )
  }

  switch (currentPage) {
    case 'guides':
      return <Suspense fallback={<PageLoadingFallback />}><GuidePortal /></Suspense>

    case 'profile':
      return (
        <Suspense fallback={<PageLoadingFallback />}>
          <ProfilePage 
            user={user}
            onNavigateToSettings={() => navigateToPage('settings')}
          />
        </Suspense>
      )

    case 'settings':
      return (
        <Suspense fallback={<PageLoadingFallback />}>
          <SettingsPage 
            onNavigateBack={navigateToHome}
          />
        </Suspense>
      )

    case 'admin':
      // Additional security check
      if (!user || !isAdminUser(user)) {
        console.warn('🚫 Unauthorized admin access attempt')
        return (
          <>
            {/* Hero Section */}
            <HeroSection 
              hasReferral={hasReferral}
              isActive={isActive}
              referralCode={referralCode}
            />
            
            {/* Routines Section — pick a goal, get a routine */}
            <RoutinesSection />

            {/* How It Works Section */}
            <HowItWorksSection />

            {/* App Features Section — the camera that powers routines */}
            <AppFeaturesSection />
            
            {/* Feature Showcase */}
            <FeatureShowcase />
            
            {/* Launch Video Section */}
            <LaunchVideoSection />
            
            {/* Social Proof Section */}
            <SocialProofSection />
            
            {/* FAQ Section */}
            <FAQSection />
            
            {/* Email Subscribe Section */}
            <EmailSubscribeSection />
            
            {/* Blog Preview Section */}
            <BlogPreviewSection />
            
            {/* Discord Community Section */}
            <DiscordCommunitySection />
          </>
        )
      }

      // Use the access token from context or fallback
      const finalAccessToken = accessToken || fallbackToken
      
      if (!finalAccessToken) {
        console.error('❌ No access token available for admin dashboard')
        console.log('🔍 Admin authenticated status:', isAdminAuthenticated)
        console.log('🔍 Context access token:', !!accessToken)
        console.log('🔍 Fallback access token:', !!fallbackToken)
        console.log('🔍 User object keys:', Object.keys(user || {}))
        
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="text-center max-w-md w-full">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Token Missing</h2>
              <p className="text-gray-600 mb-4">Unable to load admin dashboard without valid access token. Please refresh to re-authenticate.</p>
              <div className="space-y-2">
                <button 
                  onClick={refreshSession}
                  className="w-full h-12 btn-standard bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Refresh Session
                </button>
                <button 
                  onClick={navigateToHome}
                  className="w-full h-12 btn-major bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Return to Home
                </button>
              </div>
            </div>
          </div>
        )
      }

      return (
        <Suspense fallback={<PageLoadingFallback />}>
          <div className="min-h-screen bg-gray-50">
            {/* Persistent production warning (only renders when on Production) */}
            <EnvironmentBanner />
            {/* Admin header with global environment switch */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-2 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Admin</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide hidden sm:inline">Data source</span>
                  <EnvironmentToggle />
                </div>
              </div>
            </div>
            {/* Mobile-optimized container with better padding */}
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 lg:py-8">
              <AdminWorkspace
                user={user}
                accessToken={finalAccessToken}
              />
            </div>
          </div>
        </Suspense>
      )

    case 'diagnostic':
      return <Suspense fallback={<PageLoadingFallback />}><NetworkDiagnostic onClose={navigateToHome} /></Suspense>
      
    case 'login-diagnostic':
      return <Suspense fallback={<PageLoadingFallback />}><LoginDiagnostic /></Suspense>

    case 'blog':
      return <Suspense fallback={<PageLoadingFallback />}><Blog onNavigateBack={navigateToHome} /></Suspense>

    case 'referral-test':
      return <Suspense fallback={<PageLoadingFallback />}><ReferralTestPage /></Suspense>

    case 'convertkit-test':
      // Admin-only page for testing ConvertKit integration
      if (!user || !isAdminUser(user)) {
        console.warn('🚫 Non-admin user attempted to access ConvertKit test page')
        navigateToHome()
        return null
      }
      return (
        <Suspense fallback={<PageLoadingFallback />}>
          <ConvertKitTestPage 
            onNavigateBack={navigateToHome}
            onNavigateToAdmin={() => navigateToPage('admin')}
          />
        </Suspense>
      )

    case 'email-debug':
      // Admin-only page for debugging email capture
      if (!user || !isAdminUser(user)) {
        console.warn('Non-admin user attempted to access email debug page')
        navigateToHome()
        return null
      }
      return <Suspense fallback={<PageLoadingFallback />}><EmailCaptureDebugger /></Suspense>

    case 'email-test':
      // Admin-only page for testing email capture
      if (!user || !isAdminUser(user)) {
        console.warn('Non-admin user attempted to access email test page')
        navigateToHome()
        return null
      }
      return <Suspense fallback={<PageLoadingFallback />}><EmailCaptureTestPage /></Suspense>

    case 'hardware':
      return <HardwarePage />

    case 'home':
    default:
      return (
        <>
          {/* Hero Section */}
          <HeroSection 
            hasReferral={hasReferral}
            isActive={isActive}
            referralCode={referralCode}
          />
          
          {/* Routines Section — pick a goal, get a routine */}
          <RoutinesSection />

          {/* How It Works Section */}
          <HowItWorksSection />

          {/* App Features Section — the camera that powers routines */}
          <AppFeaturesSection />
          
          {/* Feature Showcase */}
          <FeatureShowcase />
          
          {/* Launch Video Section */}
          <LaunchVideoSection />
          
          {/* Social Proof Section */}
          <SocialProofSection />
          
          {/* FAQ Section */}
          <FAQSection />
          
          {/* Email Subscribe Section */}
          <EmailSubscribeSection />
          
          {/* Blog Preview Section */}
          <BlogPreviewSection />
          
          {/* Discord Community Section */}
          <DiscordCommunitySection />
        </>
      )
  }
}
