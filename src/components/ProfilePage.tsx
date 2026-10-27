import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Slider } from './ui/slider';
import { toast } from 'sonner';
import { 
  User, 
  Mail, 
  Calendar, 
  Settings, 
  Trophy, 
  Users, 
  Gift,
  Share2,
  Award,
  Target,
  Crown,
  Sparkles,
  Bell,
  Shield,
  Heart,
  Activity,
  Scale,
  Utensils,
  AlertTriangle,
  Globe,
  Ruler,
  Save,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  ExternalLink
} from 'lucide-react';
import { ReferralTierProgress } from './ReferralTierProgress';
import { SocialSharingModal } from './SocialSharingModal';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { getSupabaseClient } from '../utils/supabase/client';
import { PhotoDropzone } from './PhotoDropzone';
import { PROFILE_PHOTO_ACCEPT, removeStoredProfilePhoto, saveProfilePhotoUrl, uploadProfilePhoto, validateProfilePhoto } from '../utils/profilePhoto';
import { loadProfilePreferences, saveProfilePreferences } from '../utils/profilePreferences';
import { Clock, CheckCircle, Users2 } from 'lucide-react';

interface ProfilePageProps {
  user: any;
  onNavigateToSettings: () => void;
  onNavigateToHome?: () => void;
}

interface UserStats {
  totalReferrals: number;
  queuePosition: number | null;
  totalRewards: number;
  currentTier: string;
  joinedDate: string;
  referralCode: string;
}

interface UserPreferences {
  // Personal Information
  fullName: string;
  dateOfBirth: string;
  gender: string;
  location: string;
  profilePictureUrl: string;
  
  // Health Profile
  healthGoals: string[];
  dietaryRestrictions: string[];
  allergies: string[];
  currentWeight: number;
  targetWeight: number;
  heightFeet: number;
  heightInches: number;
  activityLevel: string;
  
  // App Preferences
  units: string; // 'metric' | 'imperial'
  language: string;
  darkMode: boolean;
  
  // Notification Preferences
  emailUpdates: boolean;
  pushNotifications: boolean;
  referralNotifications: boolean;
  healthReminders: boolean;
  weeklyReports: boolean;
  scanReminders: boolean;
  
  // Privacy Settings
  showInLeaderboard: boolean;
  shareHealthData: boolean;
  shareReferralStats: boolean;
  publicProfile: boolean;
  
  // Scan Preferences
  autoAnalyze: boolean;
  saveHistory: boolean;
  shareWithExperts: boolean;
  detailedReports: boolean;
}


const R3_PROFILE_CSS = `
.r3-profile{background:#F2EFE7!important;color:#16140F;padding-top:110px!important}
.r3-profile h1{font-family:"Fraunces",Georgia,serif!important;font-weight:300!important;font-size:clamp(40px,6vw,64px)!important;letter-spacing:-.03em!important;line-height:1!important;margin-bottom:14px!important}
.r3-profile h2,.r3-profile h3{font-family:"Fraunces",Georgia,serif!important;font-weight:400!important;letter-spacing:-.01em;color:#16140F!important}
.r3-profile .bg-white,.r3-profile [class*="bg-white/"]{background:#FFFFFF!important;border:1px solid #16140F!important;border-radius:2px!important;box-shadow:none!important}
.r3-profile [class*="rounded"]{border-radius:2px!important}
.r3-profile .rounded-full{border-radius:999px!important}
.r3-profile [class*="shadow"]{box-shadow:none!important}
.r3-profile [class*="bg-green-"],.r3-profile [class*="bg-emerald-"],.r3-profile [class*="bg-teal-"],.r3-profile [class*="from-green"],.r3-profile [class*="from-emerald"],.r3-profile [class*="from-teal"]{background:transparent!important;background-image:none!important}
.r3-profile [class*="border-green-"],.r3-profile [class*="border-emerald-"],.r3-profile [class*="border-teal-"]{border-color:rgba(22,20,15,.35)!important}
.r3-profile [class*="text-green-"],.r3-profile [class*="text-emerald-"],.r3-profile [class*="text-teal-"]{color:#16140F!important}
.r3-profile [class*="bg-red-1"],.r3-profile [class*="bg-purple-1"],.r3-profile [class*="bg-yellow-1"],.r3-profile [class*="bg-blue-1"],.r3-profile [class*="bg-indigo-1"]{background:transparent!important;border:1px solid rgba(22,20,15,.3)!important}
.r3-profile [class*="text-red-"],.r3-profile [class*="text-purple-"],.r3-profile [class*="text-yellow-"],.r3-profile [class*="text-blue-"],.r3-profile [class*="text-indigo-"]{color:#16140F!important}
.r3-profile label{font-family:"Archivo","Inter",sans-serif!important;font-size:10px!important;font-weight:600!important;letter-spacing:.14em!important;text-transform:uppercase!important;color:#5E5A50!important}
.r3-profile input:not([type=checkbox]):not([type=radio]),.r3-profile textarea,.r3-profile [role=combobox]{background:#FFFFFF!important;border:1px solid rgba(22,20,15,.35)!important;border-radius:2px!important;box-shadow:none!important}
.r3-profile button{font-family:"Archivo","Inter",sans-serif!important;font-size:11px!important;font-weight:600!important;letter-spacing:.12em!important;text-transform:uppercase!important}
.r3-profile button[class*="bg-green"],.r3-profile button[class*="bg-emerald"],.r3-profile button[type=submit]{background:#16140F!important;color:#FFFFFF!important;border:1px solid #16140F!important;border-radius:2px!important}
.r3-profile button[class*="bg-green"] *,.r3-profile button[class*="bg-emerald"] *,.r3-profile button[type=submit] *{color:#FFFFFF!important}
.r3-profile button[class*="border"]:not([class*="bg-green"]){border-color:#16140F!important;background:transparent!important;color:#16140F!important}
.r3-profile svg{color:#16140F}
.r3-profile [class*="bg-gradient"]{background-image:none!important}
.r3-profile [role=progressbar]>div{background:#16140F!important}
`;

export function ProfilePage({ user, onNavigateToSettings, onNavigateToHome }: ProfilePageProps) {
  const { user: authUser, refreshSession } = useAuth();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personal: true,
    health: false,
    preferences: false,
    notifications: false,
    privacy: false,
    scanning: false
  });

  // Profile picture upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  
  // Email verification state
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // User preferences state
  const [preferences, setPreferences] = useState<UserPreferences>({
    // Personal Information
    fullName: authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || '',
    dateOfBirth: '',
    gender: '',
    location: '',
    profilePictureUrl: authUser?.user_metadata?.avatar_url || '',
    
    // Health Profile
    healthGoals: [],
    dietaryRestrictions: [],
    allergies: [],
    currentWeight: 0,
    targetWeight: 0,
    heightFeet: 5,
    heightInches: 8,
    activityLevel: 'moderate',
    
    // App Preferences
    units: 'imperial',
    language: 'en',
    darkMode: false,
    
    // Notification Preferences
    emailUpdates: true,
    pushNotifications: true,
    referralNotifications: true,
    healthReminders: true,
    weeklyReports: false,
    scanReminders: true,
    
    // Privacy Settings
    showInLeaderboard: true,
    shareHealthData: false,
    shareReferralStats: true,
    publicProfile: false,
    
    // Scan Preferences
    autoAnalyze: true,
    saveHistory: true,
    shareWithExperts: false,
    detailedReports: true,
  });

  // Health goal options
  const healthGoalOptions = [
    'Weight Loss', 'Weight Gain', 'Muscle Building', 'Improve Energy', 
    'Better Sleep', 'Reduce Inflammation', 'Heart Health', 'Digestive Health',
    'Mental Clarity', 'Immune Support', 'Skin Health', 'Hormonal Balance'
  ];

  // Dietary restriction options
  const dietaryOptions = [
    'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo',
    'Low-Carb', 'Low-Fat', 'Mediterranean', 'Intermittent Fasting',
    'Raw Food', 'Whole30', 'FODMAP', 'Halal', 'Kosher'
  ];

  // Common allergen options
  const allergenOptions = [
    'Nuts', 'Peanuts', 'Shellfish', 'Fish', 'Eggs', 'Dairy', 'Soy',
    'Wheat/Gluten', 'Sesame', 'Sulfites', 'Food Dyes', 'MSG'
  ];

  // Fetch referred users
  const fetchReferredUsers = async () => {
    if (!authUser?.email) return;

    try {
      setLoadingReferrals(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/referred-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: authUser.email })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setReferredUsers(data.referredUsers || []);
      } else {
        setReferredUsers([]);
      }
    } catch (error) {
      console.error('Error fetching referred users:', error);
      setReferredUsers([]);
    } finally {
      setLoadingReferrals(false);
    }
  };

  // Fetch user statistics and referral data
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!authUser?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Fetch user referral stats
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/user-referral-stats`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              userId: authUser.id,
              email: authUser.email 
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          setUserStats({
            totalReferrals: data.referralCount || 0,
            queuePosition: data.queuePosition || null,
            totalRewards: data.totalRewards || 0,
            currentTier: data.currentTier || 'Tier 1',
            joinedDate: authUser.created_at || new Date().toISOString(),
            referralCode: data.referralCode || ''
          });
        } else {
          // Set default values
          setUserStats({
            totalReferrals: 0,
            queuePosition: null,
            totalRewards: 0,
            currentTier: 'Tier 1',
            joinedDate: authUser.created_at || new Date().toISOString(),
            referralCode: ''
          });
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
        setUserStats({
          totalReferrals: 0,
          queuePosition: null,
          totalRewards: 0,
          currentTier: 'Tier 1',
          joinedDate: authUser.created_at || new Date().toISOString(),
          referralCode: ''
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
    fetchReferredUsers();

    // Load saved preferences from localStorage
    const savedPreferences = localStorage.getItem('healthscan_user_preferences');
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        setPreferences(prev => ({ 
          ...prev, 
          ...parsed,
          // Ensure profile picture is loaded from user metadata if not in preferences
          profilePictureUrl: parsed.profilePictureUrl || authUser?.user_metadata?.avatar_url || ''
        }));
      } catch (error) {
        console.error('Error loading saved preferences:', error);
      }
    }

    // Update preferences when user metadata changes (like profile picture)
    if (authUser?.user_metadata?.avatar_url) {
      setPreferences(prev => ({
        ...prev,
        profilePictureUrl: authUser.user_metadata.avatar_url
      }));
    }

    // The copy saved on the account wins over this device's copy, when there is one.
    let active = true;
    if (authUser?.id) {
      loadProfilePreferences(getSupabaseClient(), authUser.id).then((saved) => {
        if (!active || !saved) return;
        setPreferences(prev => ({ ...prev, ...(saved as Partial<UserPreferences>), profilePictureUrl: String(saved.profilePictureUrl || prev.profilePictureUrl || '') }));
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [authUser]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getUserInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  // Generate referral URL for the user
  const generateReferralUrl = (email: string): string => {
    if (!email) return '';
    
    // Generate consistent referral code from email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const positiveHash = Math.abs(hash);
    const code = positiveHash.toString(36).substring(0, 6).padEnd(6, '0');
    const referralCode = `hs_${code}`;
    
    return `${window.location.origin}?ref=${referralCode}`;
  };

  // Copy referral URL to clipboard
  const copyReferralUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('💚 Referral URL copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy referral URL');
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const updatePreference = (key: keyof UserPreferences, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const toggleHealthGoal = (goal: string) => {
    setPreferences(prev => ({
      ...prev,
      healthGoals: prev.healthGoals.includes(goal)
        ? prev.healthGoals.filter(g => g !== goal)
        : [...prev.healthGoals, goal]
    }));
  };

  const toggleDietaryRestriction = (restriction: string) => {
    setPreferences(prev => ({
      ...prev,
      dietaryRestrictions: prev.dietaryRestrictions.includes(restriction)
        ? prev.dietaryRestrictions.filter(d => d !== restriction)
        : [...prev.dietaryRestrictions, restriction]
    }));
  };

  const toggleAllergy = (allergy: string) => {
    setPreferences(prev => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter(a => a !== allergy)
        : [...prev.allergies, allergy]
    }));
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      // Keep a copy on this device first, so a failed sync never loses what was typed.
      localStorage.setItem('healthscan_user_preferences', JSON.stringify(preferences));
      if (!authUser?.id) {
        toast.success('Preferences saved on this device.');
        return;
      }
      try {
        // The signed-in person's own profile row, under their own session (no server route, no user id sent for a server to trust).
        await saveProfilePreferences(getSupabaseClient(), { id: authUser.id, email: authUser.email }, preferences as unknown as Record<string, unknown>);
        toast.success('Preferences saved and synced successfully!');
      } catch (syncError: any) {
        console.error('❌ Failed to save preferences to the account:', syncError);
        toast.error(`Saved on this device, but could not be saved to your account: ${syncError?.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to save preferences:', error);
      toast.error(`Failed to save preferences: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleShareToSocial = () => {
    setShowSharingModal(true);
  };

  // Handle email verification resend
  const handleResendEmailVerification = async () => {
    if (!authUser?.email || isResendingEmail) return;
    
    setIsResendingEmail(true);
    
    try {
      console.log(`📧 Resending email verification for: ${authUser.email}`);
      
      // Import Supabase client
      const { getSupabaseClient } = await import('../utils/supabase/client');
      const supabase = getSupabaseClient();
      
      // Resend confirmation email
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: authUser.email,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      
      if (error) {
        console.error('❌ Failed to resend confirmation email:', error);
        
        if (error.message?.includes('rate limit')) {
          toast.error('Please wait before requesting another confirmation email');
        } else if (error.message?.includes('already confirmed')) {
          toast.success('Your email is already confirmed! Please refresh the page.');
        } else {
          toast.error('Failed to send confirmation email. Please try again later.');
        }
      } else {
        console.log('✅ Confirmation email sent successfully');
        toast.success('📧 Confirmation email sent! Check your inbox and spam folder.');
        
        // Show additional helpful message
        setTimeout(() => {
          toast.info('💡 Click the link in the email to verify your account', {
            duration: 6000
          });
        }, 2000);
      }
    } catch (error: any) {
      console.error('💥 Exception while resending confirmation:', error);
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const rememberPhotoLocally = (profilePictureUrl: string) => {
    const savedPreferences = localStorage.getItem('healthscan_user_preferences');
    const currentPrefs = savedPreferences ? JSON.parse(savedPreferences) : {};
    localStorage.setItem('healthscan_user_preferences', JSON.stringify({ ...currentPrefs, profilePictureUrl }));
  };

  // A chosen or dropped profile picture: straight to the person's own storage folder, then onto their account and profile.
  const handleImageFile = async (file: File) => {
    if (!authUser?.id) {
      toast.error('Sign in to change your profile picture.');
      return;
    }
    try {
      setUploadingImage(true);
      const client = getSupabaseClient();
      const previousUrl = preferences.profilePictureUrl;
      const newImageUrl = await uploadProfilePhoto(client, authUser.id, file);
      await saveProfilePhotoUrl(client, { id: authUser.id, email: authUser.email }, newImageUrl);
      setPreferences(prev => ({ ...prev, profilePictureUrl: newImageUrl }));
      rememberPhotoLocally(newImageUrl);
      void removeStoredProfilePhoto(client, authUser.id, previousUrl);
      await refreshSession();
      toast.success('Profile picture updated successfully!');
      setShowImageUpload(false);
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error?.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!authUser?.id) return;
    try {
      setUploadingImage(true);
      const client = getSupabaseClient();
      await saveProfilePhotoUrl(client, { id: authUser.id, email: authUser.email }, null);
      void removeStoredProfilePhoto(client, authUser.id, preferences.profilePictureUrl);
      setPreferences(prev => ({ ...prev, profilePictureUrl: '' }));
      rememberPhotoLocally('');
      await refreshSession();
      toast.success('Profile picture removed successfully!');
      setShowImageUpload(false);
    } catch (error: any) {
      console.error('Error removing image:', error);
      toast.error(error?.message || 'Failed to remove image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800">Loading your profile...</h2>
            <p className="text-gray-600 mt-2">Fetching your latest stats and preferences</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="r3-profile r3-lockup min-h-screen p-4 lg:p-6">
      {/* Editorial restyle (paper, ink hairlines, Fraunces + Archivo) as scoped CSS: index.css is prebuilt. */}
      <style>{R3_PROFILE_CSS}</style>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Your Profile</h1>
          <p className="text-gray-600">Manage your account, preferences, and track your ROUTINE³ journey</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Profile Overview & Stats */}
          <div className="xl:col-span-1 space-y-6">
            {/* Profile Overview Card */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div className="flex flex-col items-center text-center mb-6">
                {/* Profile Picture with Upload */}
                <div className="relative mb-4">
                  <PhotoDropzone onFile={handleImageFile} onReject={(message) => toast.error(message)} validate={validateProfilePhoto} accept={PROFILE_PHOTO_ACCEPT} disabled={uploadingImage}>
                    {({ dragging }) => (
                      <div style={{ borderRadius: '50%', outline: dragging ? '3px dashed #16140F' : 'none', outlineOffset: 3 }}>
                        <Avatar className="w-20 h-20 avatar-with-hover-effects">
                          <AvatarImage 
                            src={preferences.profilePictureUrl || authUser?.user_metadata?.avatar_url} 
                            alt="Profile picture"
                          />
                          <AvatarFallback className="bg-[var(--healthscan-green)] text-white text-xl font-bold avatar-fallback">
                            {getUserInitials(authUser?.email || 'HS')}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </PhotoDropzone>
                  
                  {/* Upload Button */}
                  <Button
                    onClick={() => setShowImageUpload(!showImageUpload)}
                    size="sm"
                    className="absolute -bottom-2 -right-2 w-8 h-8 p-0 rounded-full bg-[var(--healthscan-green)] hover:bg-[var(--healthscan-green)]/90 text-white shadow-lg"
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </Button>
                  
                  {/* Upload Options Popup */}
                  {showImageUpload && (
                    <>
                      {/* Backdrop */}
                      <div 
                        className="fixed inset-0 z-5" 
                        onClick={() => setShowImageUpload(false)}
                      />
                      <PhotoDropzone
                        className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-10 min-w-48"
                        onFile={handleImageFile}
                        onReject={(message) => toast.error(message)}
                        validate={validateProfilePhoto}
                        accept={PROFILE_PHOTO_ACCEPT}
                        disabled={uploadingImage}
                      >
                        {({ open, dragging }) => (
                          <>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full btn-standard cursor-pointer hover:bg-green-50 border-green-200"
                                disabled={uploadingImage}
                                onClick={open}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                Upload Photo
                              </Button>

                              <div
                                style={{
                                  border: `1px dashed ${dragging ? '#16140F' : 'rgba(22,20,15,.35)'}`,
                                  background: dragging ? 'rgba(22,20,15,.06)' : 'transparent',
                                  padding: '10px 8px',
                                  textAlign: 'center',
                                  fontSize: 11,
                                }}
                              >
                                {dragging ? 'Drop to upload' : 'or drag a photo here'}
                              </div>

                              {preferences.profilePictureUrl && (
                                <Button
                                  onClick={handleRemoveProfilePicture}
                                  variant="outline"
                                  size="sm"
                                  className="w-full btn-standard text-red-600 hover:bg-red-50 border-red-200"
                                  disabled={uploadingImage}
                                >
                                  <X className="w-4 h-4 mr-2" />
                                  Remove Photo
                                </Button>
                              )}

                              <Button
                                onClick={() => setShowImageUpload(false)}
                                variant="ghost"
                                size="sm"
                                className="w-full btn-standard text-gray-500 hover:bg-gray-50"
                              >
                                Cancel
                              </Button>
                            </div>

                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-500 text-center">
                                Max size: 5MB<br/>
                                JPG, PNG, WebP, GIF supported
                              </p>
                            </div>
                          </>
                        )}
                      </PhotoDropzone>
                    </>
                  )}
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {preferences.fullName || authUser?.email?.split('@')[0] || 'ROUTINE³ User'}
                </h2>
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Mail className="w-4 h-4" />
                  <span className="text-sm">{authUser?.email}</span>
                </div>
                {userStats?.joinedDate && (
                  <div className="flex items-center gap-2 text-gray-600 mb-4">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Joined {formatDate(userStats.joinedDate)}</span>
                  </div>
                )}
                
                {/* Settings Button */}
                <Button 
                  onClick={onNavigateToSettings}
                  variant="outline"
                  className="btn-standard mb-4 border-[var(--healthscan-green)]/30 hover:bg-[var(--healthscan-green)]/10"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>

                {/* Back to Home Button */}
                {onNavigateToHome && (
                  <Button 
                    onClick={onNavigateToHome}
                    variant="outline"
                    className="btn-standard w-full border-[var(--healthscan-green)]/30 hover:bg-[var(--healthscan-green)]/10"
                  >
                    ← Back to Home
                  </Button>
                )}
              </div>

              {/* Email Verification Status */}
              <div className="mb-6">
                <div className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                  authUser?.email_confirmed_at 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-orange-50 border-orange-200'
                }`}>
                  {authUser?.email_confirmed_at ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-green-800">Email Verified</p>
                        <p className="text-xs text-green-600">Your account is secure and verified</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                      <div className="text-center flex-1">
                        <p className="text-sm font-medium text-orange-800">Email Not Verified</p>
                        <p className="text-xs text-orange-600 mb-2">Check your inbox for the confirmation email</p>
                        <Button
                          onClick={handleResendEmailVerification}
                          variant="outline"
                          size="sm"
                          disabled={isResendingEmail}
                          className="text-xs bg-orange-100 border-orange-300 text-orange-800 hover:bg-orange-200"
                        >
                          {isResendingEmail ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Mail className="w-3 h-3 mr-1" />
                          )}
                          Resend Email
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* User Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-[var(--healthscan-bg-light)] rounded-lg">
                  <Trophy className="w-5 h-5 text-[var(--healthscan-green)] mx-auto mb-1" />
                  <div className="text-lg font-bold text-gray-900">{userStats?.queuePosition || 'N/A'}</div>
                  <div className="text-xs text-gray-600">Queue Position</div>
                </div>
                <div className="text-center p-3 bg-[var(--healthscan-bg-light)] rounded-lg">
                  <Users className="w-5 h-5 text-[var(--healthscan-green)] mx-auto mb-1" />
                  <div className="text-lg font-bold text-gray-900">{userStats?.totalReferrals || 0}</div>
                  <div className="text-xs text-gray-600">Referrals</div>
                </div>
                <div className="text-center p-3 bg-[var(--healthscan-bg-light)] rounded-lg">
                  <Gift className="w-5 h-5 text-[var(--healthscan-green)] mx-auto mb-1" />
                  <div className="text-lg font-bold text-gray-900">{userStats?.totalRewards || 0}</div>
                  <div className="text-xs text-gray-600">Free Weeks</div>
                </div>
                <div className="text-center p-3 bg-[var(--healthscan-bg-light)] rounded-lg">
                  <Crown className="w-5 h-5 text-[var(--healthscan-green)] mx-auto mb-1" />
                  <div className="text-lg font-bold text-gray-900">{userStats?.currentTier || 'Tier 1'}</div>
                  <div className="text-xs text-gray-600">Current Tier</div>
                </div>
              </div>

              {/* Referral Progress */}
              {userStats && (
                <ReferralTierProgress 
                  referralCount={userStats.totalReferrals}
                />
              )}
            </Card>

            {/* People You Referred Card - Updated with Refer Friends button moved below */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users2 className="w-5 h-5 text-[var(--healthscan-green)]" />
                  <h3 className="font-semibold text-gray-900">People You Referred</h3>
                </div>
                <Button
                  onClick={fetchReferredUsers}
                  variant="ghost"
                  size="sm"
                  disabled={loadingReferrals}
                  className="text-[var(--healthscan-green)] hover:bg-[var(--healthscan-bg-light)]"
                >
                  {loadingReferrals ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Full Referral URL Display */}
              {authUser?.email && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <Label className="text-sm font-medium text-green-800 mb-2 block">
                    Your Referral URL:
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={generateReferralUrl(authUser.email || '')}
                      className="text-sm bg-white border-green-300 text-green-800 font-mono"
                    />
                    <Button
                      onClick={() => copyReferralUrl(generateReferralUrl(authUser.email || ''))}
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => window.open(generateReferralUrl(authUser.email || ''), '_blank')}
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 mt-2">
                    Share this URL with friends to earn referral rewards! 🌱
                  </p>
                </div>
              )}

              {loadingReferrals ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-[var(--healthscan-green)] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading your referrals...</p>
                </div>
              ) : referredUsers.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {referredUsers.map((referredUser, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-[var(--healthscan-bg-light)] rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 avatar-with-hover-effects">
                          <AvatarFallback className="bg-[var(--healthscan-green)] text-white text-xs avatar-fallback">
                            {referredUser.email?.substring(0, 2).toUpperCase() || 'RF'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {referredUser.email || 'Friend'}
                          </div>
                          <div className="text-xs text-gray-600 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {referredUser.joined_at ? formatDate(referredUser.joined_at) : 'Recently joined'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-[var(--healthscan-green)]" />
                        <span className="text-xs text-[var(--healthscan-green)] font-medium">Joined</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 mb-6">
                  <Users2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">No referrals yet</p>
                  <p className="text-sm text-gray-500">Start sharing to see your friends here!</p>
                </div>
              )}

              {/* Refer Friends Button moved below the people list */}
              <div className="space-y-4">
                {/* Animated Gradient Refer Friends Button */}
                <div className="relative">
                  {/* Black background base */}
                  <div className="absolute inset-0 rounded-xl bg-black"></div>
                  
                  {/* Animated dark turquoise gradient overlay */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-[var(--healthscan-dark-turquoise)]/80 to-transparent animate-gradient-loop"></div>
                  
                  <Button 
                    onClick={handleShareToSocial}
                    className="relative w-full h-12 bg-transparent hover:bg-transparent border-0 text-white font-semibold px-6 rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] z-10 btn-major"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Share2 className="w-4 h-4" />
                      <span>Refer Friends</span>
                    </div>
                  </Button>
                </div>

                {/* Referral Code Display */}
                {userStats?.referralCode && (
                  <div className="bg-[var(--healthscan-bg-light)] rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">Your referral code:</div>
                    <div className="font-mono text-sm text-[var(--healthscan-green)] font-semibold">
                      {userStats.referralCode}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Share this code or use your personalized link
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column - Preferences & Settings */}
          <div className="xl:col-span-2 space-y-6">
            {/* Personal Information Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('personal')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--healthscan-green)]/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-[var(--healthscan-green)]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                    <p className="text-sm text-gray-600">Basic profile details and information</p>
                  </div>
                </div>
                {expandedSections.personal ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.personal && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">Full Name</Label>
                      <Input
                        id="fullName"
                        value={preferences.fullName}
                        onChange={(e) => updatePreference('fullName', e.target.value)}
                        className="mt-1"
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dateOfBirth" className="text-sm font-medium text-gray-700">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={preferences.dateOfBirth}
                        onChange={(e) => updatePreference('dateOfBirth', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gender" className="text-sm font-medium text-gray-700">Gender</Label>
                      <Select value={preferences.gender} onValueChange={(value: string) => updatePreference('gender', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="non-binary">Non-binary</SelectItem>
                          <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="location" className="text-sm font-medium text-gray-700">Location</Label>
                      <Input
                        id="location"
                        value={preferences.location}
                        onChange={(e) => updatePreference('location', e.target.value)}
                        className="mt-1"
                        placeholder="City, Country"
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Health Profile Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('health')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <Heart className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Health Profile</h3>
                    <p className="text-sm text-gray-600">Goals, restrictions, and health metrics</p>
                  </div>
                </div>
                {expandedSections.health ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.health && (
                <div className="mt-6 space-y-6">
                  {/* Health Goals */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">Health Goals</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {healthGoalOptions.map((goal) => (
                        <button
                          key={goal}
                          onClick={() => toggleHealthGoal(goal)}
                          className={`p-2 text-sm rounded-lg border transition-colors ${
                            preferences.healthGoals.includes(goal)
                              ? 'bg-[var(--healthscan-green)] text-white border-[var(--healthscan-green)]'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--healthscan-green)]'
                          }`}
                        >
                          {goal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dietary Restrictions */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">Dietary Preferences</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {dietaryOptions.map((diet) => (
                        <button
                          key={diet}
                          onClick={() => toggleDietaryRestriction(diet)}
                          className={`p-2 text-sm rounded-lg border transition-colors ${
                            preferences.dietaryRestrictions.includes(diet)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-blue-600'
                          }`}
                        >
                          {diet}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Allergies */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">Allergies & Intolerances</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {allergenOptions.map((allergen) => (
                        <button
                          key={allergen}
                          onClick={() => toggleAllergy(allergen)}
                          className={`p-2 text-sm rounded-lg border transition-colors ${
                            preferences.allergies.includes(allergen)
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-red-600'
                          }`}
                        >
                          {allergen}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Physical Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="currentWeight" className="text-sm font-medium text-gray-700">Current Weight</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          id="currentWeight"
                          type="number"
                          value={preferences.currentWeight || ''}
                          onChange={(e) => updatePreference('currentWeight', parseFloat(e.target.value) || 0)}
                          placeholder="150"
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-500">
                          {preferences.units === 'metric' ? 'kg' : 'lbs'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="targetWeight" className="text-sm font-medium text-gray-700">Target Weight</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          id="targetWeight"
                          type="number"
                          value={preferences.targetWeight || ''}
                          onChange={(e) => updatePreference('targetWeight', parseFloat(e.target.value) || 0)}
                          placeholder="145"
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-500">
                          {preferences.units === 'metric' ? 'kg' : 'lbs'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Height */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Height</Label>
                    {preferences.units === 'imperial' ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={preferences.heightFeet || ''}
                          onChange={(e) => updatePreference('heightFeet', parseInt(e.target.value) || 0)}
                          placeholder="5"
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-500">ft</span>
                        <Input
                          type="number"
                          value={preferences.heightInches || ''}
                          onChange={(e) => updatePreference('heightInches', parseInt(e.target.value) || 0)}
                          placeholder="8"
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-500">in</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={preferences.heightFeet ? (preferences.heightFeet * 30.48 + preferences.heightInches * 2.54).toFixed(0) : ''}
                          onChange={(e) => {
                            const cm = parseFloat(e.target.value) || 0;
                            const totalInches = cm / 2.54;
                            updatePreference('heightFeet', Math.floor(totalInches / 12));
                            updatePreference('heightInches', Math.round(totalInches % 12));
                          }}
                          placeholder="175"
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-500">cm</span>
                      </div>
                    )}
                  </div>

                  {/* Activity Level */}
                  <div>
                    <Label htmlFor="activityLevel" className="text-sm font-medium text-gray-700">Activity Level</Label>
                    <Select value={preferences.activityLevel} onValueChange={(value: string) => updatePreference('activityLevel', value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">Sedentary (little/no exercise)</SelectItem>
                        <SelectItem value="light">Light (light exercise 1-3 days/week)</SelectItem>
                        <SelectItem value="moderate">Moderate (moderate exercise 3-5 days/week)</SelectItem>
                        <SelectItem value="active">Active (hard exercise 6-7 days/week)</SelectItem>
                        <SelectItem value="very-active">Very Active (very hard exercise/physical job)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </Card>

            {/* App Preferences Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('preferences')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Settings className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">App Preferences</h3>
                    <p className="text-sm text-gray-600">Language, units, and display settings</p>
                  </div>
                </div>
                {expandedSections.preferences ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.preferences && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="units" className="text-sm font-medium text-gray-700">Units</Label>
                      <Select value={preferences.units} onValueChange={(value: string) => updatePreference('units', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="imperial">Imperial (lbs, ft/in, °F)</SelectItem>
                          <SelectItem value="metric">Metric (kg, cm, °C)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="language" className="text-sm font-medium text-gray-700">Language</Label>
                      <Select value={preferences.language} onValueChange={(value: string) => updatePreference('language', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="de">Deutsch</SelectItem>
                          <SelectItem value="it">Italiano</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Dark Mode</Label>
                      <p className="text-xs text-gray-500">Use dark theme across the app</p>
                    </div>
                    <Switch
                      checked={preferences.darkMode}
                      onCheckedChange={(checked: boolean) => updatePreference('darkMode', checked)}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Notification Preferences Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('notifications')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Bell className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                    <p className="text-sm text-gray-600">Email and push notification preferences</p>
                  </div>
                </div>
                {expandedSections.notifications ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.notifications && (
                <div className="mt-6 space-y-4">
                  {[
                    { key: 'emailUpdates', label: 'Email Updates', desc: 'Product updates and announcements' },
                    { key: 'pushNotifications', label: 'Push Notifications', desc: 'App notifications on your device' },
                    { key: 'referralNotifications', label: 'Referral Notifications', desc: 'When friends join through your referral' },
                    { key: 'healthReminders', label: 'Health Reminders', desc: 'Reminders about your health goals' },
                    { key: 'weeklyReports', label: 'Weekly Reports', desc: 'Weekly summary of your activity' },
                    { key: 'scanReminders', label: 'Scan Reminders', desc: 'Reminders to scan your food' }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">{setting.label}</Label>
                        <p className="text-xs text-gray-500">{setting.desc}</p>
                      </div>
                      <Switch
                        checked={preferences[setting.key as keyof UserPreferences] as boolean}
                        onCheckedChange={(checked: boolean) => updatePreference(setting.key as keyof UserPreferences, checked)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Privacy Settings Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('privacy')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Privacy & Sharing</h3>
                    <p className="text-sm text-gray-600">Control your data sharing and privacy</p>
                  </div>
                </div>
                {expandedSections.privacy ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.privacy && (
                <div className="mt-6 space-y-4">
                  {[
                    { key: 'showInLeaderboard', label: 'Show in Leaderboard', desc: 'Display your progress in referral leaderboards' },
                    { key: 'shareHealthData', label: 'Share Health Data', desc: 'Share anonymized health data for research' },
                    { key: 'shareReferralStats', label: 'Share Referral Stats', desc: 'Allow others to see your referral achievements' },
                    { key: 'publicProfile', label: 'Public Profile', desc: 'Make your profile visible to other users' }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">{setting.label}</Label>
                        <p className="text-xs text-gray-500">{setting.desc}</p>
                      </div>
                      <Switch
                        checked={preferences[setting.key as keyof UserPreferences] as boolean}
                        onCheckedChange={(checked: boolean) => updatePreference(setting.key as keyof UserPreferences, checked)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Scan Preferences Section */}
            <Card className="p-6 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('scanning')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Scanning Preferences</h3>
                    <p className="text-sm text-gray-600">How ROUTINE³ analyzes your food</p>
                  </div>
                </div>
                {expandedSections.scanning ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.scanning && (
                <div className="mt-6 space-y-4">
                  {[
                    { key: 'autoAnalyze', label: 'Auto-Analyze Scans', desc: 'Automatically analyze food after scanning' },
                    { key: 'saveHistory', label: 'Save Scan History', desc: 'Keep a history of your scanned items' },
                    { key: 'shareWithExperts', label: 'Share with Experts', desc: 'Allow nutrition experts to review your scans' },
                    { key: 'detailedReports', label: 'Detailed Reports', desc: 'Generate comprehensive analysis reports' }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">{setting.label}</Label>
                        <p className="text-xs text-gray-500">{setting.desc}</p>
                      </div>
                      <Switch
                        checked={preferences[setting.key as keyof UserPreferences] as boolean}
                        onCheckedChange={(checked: boolean) => updatePreference(setting.key as keyof UserPreferences, checked)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                onClick={savePreferences}
                disabled={saving}
                className="btn-major bg-[var(--healthscan-green)] hover:bg-[var(--healthscan-green)]/90 text-white px-8"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Preferences
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Social Sharing Modal */}
        <SocialSharingModal
          open={showSharingModal}
          onOpenChange={setShowSharingModal}
          userEmail={authUser?.email || ''}
          userPosition={userStats?.queuePosition}
          referralCode={userStats?.referralCode}
          referralCount={userStats?.totalReferrals || 0}
          userName={preferences.fullName || authUser?.email?.split('@')[0] || ''}
        />
      </div>
    </div>
  );
}