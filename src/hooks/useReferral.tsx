"use client";

import { useEffect, useState } from 'react';
import { trackLpView, trackReferralLinkOpen } from '../utils/eventTracking';

interface ReferralData {
  referralCode: string | null;
  hasReferral: boolean;
  isActive: boolean;
}

export function useReferral(): ReferralData {
  const [referralData, setReferralData] = useState<ReferralData>({
    referralCode: null,
    hasReferral: false,
    isActive: false
  });

  const checkReferralStatus = () => {
    // Check URL parameters for referral code first
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    // Also check for path-based referral code (e.g., /referral-code)
    const pathSegments = window.location.pathname.split('/').filter(segment => segment.length > 0);
    const pathReferralCode = pathSegments.length === 1 ? pathSegments[0] : null;
    
    // Exclude common page routes and file extensions from being treated as referral codes
    const excludedPaths = ['admin', 'profile', 'settings', 'blog', 'diagnostic', 'guide', 'guides', 'guardians', 'wearables', 'ring'];
    const excludedPatterns = [
      /\.html$/i,
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i,
      /^preview_/i,
      /^test_/i,
      /^demo_/i,
      /^example_/i,
      /^sample_/i
    ];
    
    const isValidPathReferral = pathReferralCode && 
                               !excludedPaths.includes(pathReferralCode.toLowerCase()) &&
                               !excludedPatterns.some(pattern => pattern.test(pathReferralCode)) &&
                               pathReferralCode.length >= 6 && // Assume referral codes are at least 6 chars
                               pathReferralCode.length <= 20 && // And not too long
                               /^[A-Z0-9]+$/i.test(pathReferralCode); // Only alphanumeric characters
    
    const detectedReferralCode = refCode || (isValidPathReferral ? pathReferralCode : null);
    
    if (detectedReferralCode) {
      console.log('Referral code detected from URL:', detectedReferralCode, refCode ? '(query param)' : '(path)');
      trackReferralLinkOpen(detectedReferralCode);
      // Store in localStorage for persistence
      localStorage.setItem('healthscan_pending_referral', detectedReferralCode);
      localStorage.setItem('healthscan_referral_timestamp', Date.now().toString());
      
      // Clean URL without refreshing page - redirect to home for path-based referrals
      const newUrl = refCode ? window.location.pathname : '/';
      window.history.replaceState({}, document.title, newUrl);
      
      setReferralData({
        referralCode: detectedReferralCode,
        hasReferral: true,
        isActive: true // Fresh referral from URL is always active
      });
    } else {
      // Check if there's a pending referral in localStorage
      const pendingReferral = localStorage.getItem('healthscan_pending_referral');
      const referralTimestamp = localStorage.getItem('healthscan_referral_timestamp');
      
      if (pendingReferral) {
        console.log('Pending referral code found in storage:', pendingReferral);
        
        // Check if referral is recent (within 1 week) and user hasn't signed up yet
        const isRecentReferral = referralTimestamp && 
          (Date.now() - parseInt(referralTimestamp)) < (7 * 24 * 60 * 60 * 1000);
        
        // Check if user has already signed up (if they have a referral code, they've joined)
        const userHasJoined = localStorage.getItem('healthscan_user_email') || 
                             localStorage.getItem('healthscan_referral_code');
        
        const shouldShowReferral = !!(isRecentReferral && !userHasJoined);
        
        setReferralData({
          referralCode: pendingReferral,
          hasReferral: true,
          isActive: shouldShowReferral
        });
        
        // Clean up old referrals
        if (!isRecentReferral) {
          console.log('Cleaning up old referral code');
          localStorage.removeItem('healthscan_pending_referral');
          localStorage.removeItem('healthscan_referral_timestamp');
        }
      } else {
        setReferralData({
          referralCode: null,
          hasReferral: false,
          isActive: false
        });
      }
    }
  };

  useEffect(() => {
    // Initial check
    checkReferralStatus();
    
    // Listen for referral status changes
    const handleReferralStatusChange = () => {
      console.log('Referral status changed, rechecking...');
      checkReferralStatus();
    };
    
    window.addEventListener('referralStatusChanged', handleReferralStatusChange);
    
    return () => {
      window.removeEventListener('referralStatusChanged', handleReferralStatusChange);
    };
  }, []);

  return referralData;
}

// Utility functions for referral management
export const ReferralUtils = {
  // Get current pending referral code
  getPendingReferral: (): string | null => {
    try {
      return localStorage.getItem('healthscan_pending_referral');
    } catch {
      return null;
    }
  },
  
  // Clear pending referral after successful signup
  clearPendingReferral: (): void => {
    try {
      localStorage.removeItem('healthscan_pending_referral');
      localStorage.removeItem('healthscan_referral_timestamp');
    } catch (error) {
      console.warn('Failed to clear pending referral:', error);
    }
  },
  
  // Set a referral code manually
  setPendingReferral: (code: string): void => {
    try {
      localStorage.setItem('healthscan_pending_referral', code);
      localStorage.setItem('healthscan_referral_timestamp', Date.now().toString());
    } catch (error) {
      console.warn('Failed to set pending referral:', error);
    }
  },
  
  // Check if URL has referral parameter or path-based referral
  hasReferralInUrl: (): boolean => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hasQueryParam = urlParams.has('ref');
      
      // Check for path-based referral
      const pathSegments = window.location.pathname.split('/').filter(segment => segment.length > 0);
      const excludedPaths = ['admin', 'profile', 'settings', 'blog', 'diagnostic', 'guide', 'guides', 'guardians', 'wearables', 'ring'];
      const excludedPatterns = [
        /\.html$/i,
        /\.php$/i,
        /\.asp$/i,
        /\.jsp$/i,
        /^preview_/i,
        /^test_/i,
        /^demo_/i,
        /^example_/i,
        /^sample_/i
      ];
      
      const pathReferralCode = pathSegments.length === 1 ? pathSegments[0] : null;
      const hasPathReferral = pathReferralCode && 
                             !excludedPaths.includes(pathReferralCode.toLowerCase()) &&
                             !excludedPatterns.some(pattern => pattern.test(pathReferralCode)) &&
                             pathReferralCode.length >= 6 && 
                             pathReferralCode.length <= 20 &&
                             /^[A-Z0-9]+$/i.test(pathReferralCode);
      
      return hasQueryParam || !!hasPathReferral;
    } catch {
      return false;
    }
  },
  
  // Check if referral is still valid/active
  isReferralActive: (): boolean => {
    try {
      const pendingReferral = localStorage.getItem('healthscan_pending_referral');
      const referralTimestamp = localStorage.getItem('healthscan_referral_timestamp');
      const userHasJoined = localStorage.getItem('healthscan_user_email') || 
                           localStorage.getItem('healthscan_referral_code');
      
      if (!pendingReferral || userHasJoined) return false;
      
      if (referralTimestamp) {
        const isRecent = (Date.now() - parseInt(referralTimestamp)) < (7 * 24 * 60 * 60 * 1000);
        return isRecent;
      }
      
      return false;
    } catch {
      return false;
    }
  }
};
