import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ChevronRight, FileText, HeartPulse, LogOut,
  Mail, Package, Plus, Salad, Sparkles, Users, Globe2, Loader2,
  Upload, Check, Instagram, Youtube, Link2, AtSign, Route, CalendarDays, Download,
  MoreHorizontal, Droplets, Activity, Bath, Sparkle, HeartHandshake, Hourglass, ChefHat, Wheat, ListChecks, CookingPot, FolderOpen, Trash2, ExternalLink, Hammer, PencilRuler, Blocks, LayoutDashboard, Play, Clock, ShieldCheck, Utensils, Dumbbell, Combine, Clapperboard, BookOpen, Podcast, GraduationCap, AudioLines } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ProtocolEditor } from '../admin/ProtocolEditor';
import { RoutineMark } from '../Header';
import { ContentStudio } from './ContentStudio';
import { CombineProtocols, DietBuilder, FitnessBuilder } from './GuardianBuilders';
import { ProtocolChildrenPanel } from './ProtocolChildrenPanel';
import { customizeProtocolRecipe } from '../../utils/protocolCopies';
import { ContentBuilder } from './ContentBuilder';
import { RoutineShareLink } from './RoutineShareLink';
import { OfferRoutineLink } from './OfferRoutineLink';
import { listOfferRoutines } from '../../utils/routineShare';
import { useGuardianPage } from './useGuardianPage';
import { getGuardianStripeConfiguration } from '../../utils/guardianStripe';
import { readCheckoutSession, saveCheckoutSession, clearCheckoutSession, checkoutReturnUrl, clearCheckoutReturnParameters } from '../../utils/guardianCheckoutSession';
import { HazardList, NutrientCoverage, RecipeFiltersPanel } from './RecipeInsights';
import { avoidViolations, filtersToBrief, type RecipeFilters, type Tier } from '../../utils/recipeNutrients';
import { buildRecipePdf } from '../../utils/recipePdf';
import { PhoneFrame } from '../mockups/PhoneFrame';
import { buildRecipesWithAI, computeNutrition, gramsFor, searchCatalogIngredients, KEY_MICROS, UNITS, type CatalogIngredient, type MacroKey, type RecipeDraft, type RecipeIngredient } from '../../utils/guideRecipeAI';
import { APP_STORE_URL } from '../../config/appLinks';
import { EventProtocolBuilder } from './EventProtocolBuilder';
import { GuardianModal } from './GuardianModal';
import { BrandKitFields } from './BrandKitFields';
import { AGE_RANGES, LIFE_STAGES } from '../../utils/audienceTaxonomy';
import { brandKitLinks, brandKitOf, defaultBrandKit, type BrandKit } from '../../utils/brandKit';
import { GuardianProducts, GuardianShop } from './GuardianProducts';
import { ActivitiesLibrary } from './ActivitiesLibrary';
import { CookingEquipment, CookingTechniques } from './CookingLibrary';
import { CatalogIngredients, CatalogRecipes, FitnessRoutines } from './CatalogBrowsers';
import { buildProtocolWithAI, foldSleepSteps, saveDraftStep, updateProtocolWithAI, listProtocolItems, createProtocol, findOrCreateProtocol, createProtocolItem, listProtocols, type AdminProtocol } from '../../utils/protocolAdmin';
import {
  recoverUpsellPayment, createGuideLead, createGuideOffer, createGuideRecipe, createGuideValueRamp, getGuideProfile, getGuideProfileBySlug,
  importGuideProfile, listGuideLeads, listGuideOffers, listGuideRecipes, listGuideValueRamps, listRoutineOwners, upsertGuideOffer, upsertGuideValueRamp, listPublicGuideProfiles, saveGuideProfile, listGuardianReviews, listGuardianReviewRequests, createGuardianReviewRequest, submitGuardianReview, setGuardianReviewStatus, createOfferPayment, confirmOfferPayment, buyUpsellOneClick, getFreeOfferDownload, requestGuardianReview, decideGuardianSite, listAllGuideProfiles, listGuardianSuggestions, setGuardianSuggestionStatus, listPublicGuardianOffers, listReviewSummaries, type AdminGuideProfile, type GuardianSuggestionRow, type GuardianReview, type GuardianReviewRequest, submitGuardianSuggestion, submitGuardianOptIn,
  createGuideLibraryFolder, createGuideLibraryItem, deleteGuideLibraryItem, getGuideFileDownloadUrl,
  listGuideLibraryFolders, listGuideLibraryItems, replaceGuideBrands, listGuideBrands, updateGuideRecipe, saveGuideRecipeDraft, listPersonalProtocolPeople, uploadGuideFile, uploadGuideImage, uploadGuideLibraryAudio,
  type GuideBrand, type GuideLead, type GuideLibraryFolder, type GuideLibraryItem, type GuideLibraryKind, type GuideOffer, type GuideProfile, type GuideRecipe,
  type GuideValueRamp, type ImportedGuideProfile,
} from '../../utils/guidePortal';
import { LIBRARY_KINDS, buildLibraryDraft, filterLibraryItems, libraryErrorMessage, libraryKindDefinition, librarySourceDocumentPath, librarySourcePrompt, librarySourceSubtitle, librarySourceUrls, type LibraryDraftInput } from '../../utils/guideLibrarySources';

const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const black = '#090A08';
const panel = '#11120F';
const acid = '#C7D8A3';
// Match AS-TRO's rendered guide route: Canela for editorial display and
// Euclid Circular A for interface and body copy.
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
function themeFont(name: string) {
  if (name === 'Archivo') return '"Archivo", sans-serif';
  if (name === 'Inter') return '"Inter", sans-serif';
  if (name === 'Fraunces') return '"Fraunces", Georgia, serif';
  if (name === 'Instrument Serif') return '"Instrument Serif", Georgia, serif';
  if (name === 'DM Sans') return '"DM Sans", sans-serif';
  if (name === 'Poppins') return '"Poppins", sans-serif';
  if (name === 'Georgia') return 'Georgia, serif';
  if (name === 'Euclid') return sans;
  return serif;
}

function parseExpertiseTags(value?: string) {
  return (value || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
}

function customerFacingOfferTitle(value: string) {
  // Older drafts were saved as "Custom Protocol"; customers see "Personalised Protocol".
  return value.replace(/^R3\s+Protocol\s*>\s*/i, '').replace(/^Custom Protocol\b/i, 'Personalised Protocol').trim();
}

function offerTitleSize(value: string) {
  const length = customerFacingOfferTitle(value).length;
  if (length > 54) return 'clamp(30px,4vw,52px)';
  if (length > 34) return 'clamp(36px,5vw,62px)';
  return 'clamp(42px,6vw,76px)';
}

function ExpertiseTags({ tags, color = '#667245', compact = false }: { tags: string[]; color?: string; compact?: boolean }) {
  if (!tags.length) return null;
  return <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexWrap: 'wrap', gap: compact ? 5 : 7, margin: compact ? '0 0 11px' : '0 0 18px' }}>
    {tags.map((tag) => <span key={tag} style={{ border: `1px solid ${color}66`, borderRadius: 999, color, padding: compact ? '4px 7px' : '6px 10px', fontSize: compact ? 6.5 : 9, fontWeight: 700, letterSpacing: '.055em', textTransform: 'uppercase', background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(5px)' }}>{tag}</span>)}
  </div>;
}

type Tab = 'home' | 'profile' | 'library' | 'leads' | 'value_ramps' | 'offer_builder' | 'products' | 'recipes' | 'diet' | 'diet_protocols' | 'fitness' | 'activities' | 'cooking' | 'equipment' | 'ingredients' | 'routines' | 'hygiene' | 'hygiene_protocols' | 'hygiene_activities' | 'beauty' | 'beauty_protocols' | 'beauty_activities' | 'wellness' | 'wellness_protocols' | 'wellness_activities' | 'longevity' | 'longevity_protocols' | 'detox' | 'detox_protocols' | 'content' | 'protocols' | 'admin';
const WORKSPACE_TABS: readonly Tab[] = ['home', 'profile', 'library', 'leads', 'value_ramps', 'offer_builder', 'products', 'recipes', 'diet', 'diet_protocols', 'fitness', 'activities', 'cooking', 'equipment', 'ingredients', 'routines', 'hygiene', 'hygiene_protocols', 'hygiene_activities', 'beauty', 'beauty_protocols', 'beauty_activities', 'wellness', 'wellness_protocols', 'wellness_activities', 'longevity', 'longevity_protocols', 'detox', 'detox_protocols', 'content', 'protocols', 'admin'];
const SETUP_STEPS = [1, 2, 3, 4, 5] as const;
type FreeOfferKind = 'ebook' | 'one_to_one_call' | 'group_call' | 'recipe_book' | 'routine' | 'in_person';
type UpsellKind = 'ebook' | 'routine' | 'routine_guidance' | 'recipe_book' | 'group_call' | 'one_to_one_call' | 'in_person' | 'festival';
type DeliveryFormat = 'Downloadable PDF' | 'Interactive Protocol' | 'PDF + Interactive Protocol' | 'Live online' | 'In person' | 'Event';
type BookingProvider = 'ROUTINE³ Booking' | 'Cal.com' | 'Google appointment schedule' | 'Calendly' | 'Other';
type StoryTemplateId = 'editorial' | 'ritual' | 'human' | 'clinical' | 'kitchen' | 'night' | 'coastal' | 'movement' | 'collage' | 'herbal' | 'future' | 'community';
type CurrencyCode = 'GBP' | 'EUR' | 'USD' | 'PLN' | 'CAD' | 'AUD' | 'NZD' | 'CHF' | 'JPY' | 'INR' | 'AED' | 'ZAR' | 'BRL' | 'MXN' | 'SEK' | 'NOK' | 'DKK' | 'CZK';
type BrandDraft = Omit<GuideBrand, 'id' | 'guide_id' | 'is_primary'> & { localId: string };
type GuardianOfferGoal = 'basic' | 'audience' | 'sell';
type HeaderStyle = 'white' | 'hidden';
type OfferNextStep = 'builder' | 'link' | 'video' | 'booking';
type BillingModel = 'one_time' | 'subscription' | 'pack_10';

// One source for audience lists: the setup and the Content builder pick from the same options.
const targetAgeRanges: Record<string, string[]> = AGE_RANGES;
const targetLifeStages: Record<string, string[]> = LIFE_STAGES;

const pricingRegions: { region: string; currency: CurrencyCode; label: string }[] = [
  { region: 'United Kingdom', currency: 'GBP', label: '🇬🇧 UK · Pound' },
  { region: 'Eurozone', currency: 'EUR', label: '🇪🇺 Eurozone · Euro' },
  { region: 'United States', currency: 'USD', label: '🇺🇸 US · Dollar' },
  { region: 'Poland', currency: 'PLN', label: '🇵🇱 Poland · Złoty' },
  { region: 'Canada', currency: 'CAD', label: '🇨🇦 Canada · Dollar' },
  { region: 'Australia', currency: 'AUD', label: '🇦🇺 Australia · Dollar' },
  { region: 'New Zealand', currency: 'NZD', label: '🇳🇿 New Zealand · Dollar' },
  { region: 'Switzerland', currency: 'CHF', label: '🇨🇭 Switzerland · Franc' },
  { region: 'Japan', currency: 'JPY', label: '🇯🇵 Japan · Yen' },
  { region: 'India', currency: 'INR', label: '🇮🇳 India · Rupee' },
  { region: 'United Arab Emirates', currency: 'AED', label: '🇦🇪 UAE · Dirham' },
  { region: 'South Africa', currency: 'ZAR', label: '🇿🇦 South Africa · Rand' },
  { region: 'Brazil', currency: 'BRL', label: '🇧🇷 Brazil · Real' },
  { region: 'Mexico', currency: 'MXN', label: '🇲🇽 Mexico · Peso' },
  { region: 'Sweden', currency: 'SEK', label: '🇸🇪 Sweden · Krona' },
  { region: 'Norway', currency: 'NOK', label: '🇳🇴 Norway · Krone' },
  { region: 'Denmark', currency: 'DKK', label: '🇩🇰 Denmark · Krone' },
  { region: 'Czech Republic', currency: 'CZK', label: '🇨🇿 Czechia · Koruna' },
];
function defaultPricingRegion() {
  if (typeof navigator === 'undefined') return pricingRegions[0];
  const country = (navigator.language.split('-')[1] || '').toUpperCase();
  const regionByCountry: Record<string, string> = { GB: 'United Kingdom', US: 'United States', PL: 'Poland', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', CH: 'Switzerland', JP: 'Japan', IN: 'India', AE: 'United Arab Emirates', ZA: 'South Africa', BR: 'Brazil', MX: 'Mexico', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', CZ: 'Czech Republic' };
  const euroCountries = ['AT','BE','HR','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU','MT','NL','PT','SK','SI','ES'];
  const region = euroCountries.includes(country) ? 'Eurozone' : regionByCountry[country];
  return pricingRegions.find((option) => option.region === region) || pricingRegions[2];
}
function formatMoney(value: number | string, currency: string = 'GBP') {
  const amount = Number(value || 0);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${currency} ${amount}`; }
}
function currencySymbol(currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((part) => part.type === 'currency')?.value || currency; }
  catch { return currency; }
}
const billingLabels: Record<BillingModel, { title: string; suffix: string; note: string }> = {
  one_time: { title: 'One-time', suffix: '', note: 'One payment for this offer' },
  subscription: { title: 'Subscription', suffix: '/ month', note: 'Recurring guidance and ongoing support' },
  pack_10: { title: '10-session pack', suffix: '/ 10 sessions', note: 'Prepaid bundle of ten sessions' },
};
const offerValueScores: Record<UpsellKind, number> = {
  ebook: 2,
  recipe_book: 3,
  routine: 3,
  routine_guidance: 4,
  one_to_one_call: 4,
  group_call: 5,
  in_person: 5,
  festival: 5,
};
function CustomerValueStars({ score, compact = false, mutedState = false }: { score: number; compact?: boolean; mutedState?: boolean }) {
  return <span aria-label={`${score} out of 5 for customer value`} title={`${score} out of 5 for customer value`} style={{ display: 'flex', alignItems: 'center', gap: compact ? 3 : 5 }}>
    <span aria-hidden="true" style={{ display: 'inline-flex', gap: 1, fontSize: compact ? 10 : 12 }}>{Array.from({ length: 5 }, (_, index) => <span key={index} style={{ color: mutedState ? muted : index < score ? acid : 'rgba(199,216,163,.24)' }}>{index < score ? '★' : '☆'}</span>)}</span>
    <span style={{ color: mutedState ? muted : ink, fontSize: compact ? 8 : 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Value</span>
  </span>;
}
function R3CreatorBenefitArt({ index, size = 58 }: { index: number; size?: number }) {
  const width = size * (2172 / 7 / 724);
  return <span aria-hidden="true" style={{ display: 'block', width, height: size, flex: `0 0 ${width}px`, backgroundImage: 'url(/images/guides/r3-creator-benefits-v1.png)', backgroundRepeat: 'no-repeat', backgroundSize: '700% 100%', backgroundPosition: `${index * 100 / 6}% 50%`, filter: 'grayscale(1) contrast(1.04)' }} />;
}
function readableText(background: string) {
  const value = background.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return '#11120F';
  const [r, g, b] = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => parseInt(part, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#11120F' : '#FFFFFF';
}

const storyTemplates: { id: StoryTemplateId; name: string; style: string; description: string; image: string; heading: string; body: string; page: string; accent: string; header: string; treatment: 'color' | 'greyscale' }[] = [
  { id: 'editorial', name: 'The Path', style: 'Modern editorial', description: 'Clean, direct and structured.', image: '/images/guides/templates/editorial-path.jpg', heading: 'Archivo', body: 'Inter', page: '#F2EFE7', accent: '#667245', header: 'white', treatment: 'greyscale' },
  { id: 'ritual', name: 'The Ritual', style: 'Botanical serif', description: 'Reflective, tactile and soulful.', image: '/images/guides/templates/botanical-ritual.jpg', heading: 'Fraunces', body: 'Instrument Serif', page: '#ECE9E0', accent: '#A56B48', header: 'tone', treatment: 'greyscale' },
  { id: 'human', name: 'The Guide', style: 'Humanist', description: 'Expressive, warm and personal.', image: '/images/guides/templates/human-guide.jpg', heading: 'Fraunces', body: 'Inter', page: '#F4F0E8', accent: '#667245', header: 'white', treatment: 'color' },
  { id: 'clinical', name: 'The Clarity', style: 'Clinical minimal', description: 'Bright, precise and evidence-led.', image: '/images/guides/templates/clinical-light.webp', heading: 'Archivo', body: 'DM Sans', page: '#F4F9FB', accent: '#39768A', header: 'white', treatment: 'color' },
  { id: 'kitchen', name: 'The Table', style: 'Culinary warmth', description: 'Sunlit, practical and nourishing.', image: '/images/guides/templates/sunlit-kitchen.webp', heading: 'Fraunces', body: 'DM Sans', page: '#F7EFE2', accent: '#A45128', header: 'tone', treatment: 'color' },
  { id: 'night', name: 'The Stillness', style: 'Nocturnal luxury', description: 'Quiet, focused and immersive.', image: '/images/guides/templates/night-focus.webp', heading: 'Instrument Serif', body: 'Inter', page: '#E8E1D7', accent: '#7B4B2A', header: 'black', treatment: 'color' },
  { id: 'coastal', name: 'The Horizon', style: 'Coastal calm', description: 'Open, restorative and spacious.', image: '/images/guides/templates/coastal-air.webp', heading: 'Instrument Serif', body: 'DM Sans', page: '#EEF3F2', accent: '#426978', header: 'white', treatment: 'color' },
  { id: 'movement', name: 'The Practice', style: 'Movement studio', description: 'Grounded, physical and disciplined.', image: '/images/guides/templates/movement-studio.webp', heading: 'Poppins', body: 'Inter', page: '#F0E8DC', accent: '#85613D', header: 'tone', treatment: 'color' },
  { id: 'collage', name: 'The Spark', style: 'Graphic collage', description: 'Bold, artistic and memorable.', image: '/images/guides/templates/paper-collage.webp', heading: 'Archivo', body: 'DM Sans', page: '#F5F0E6', accent: '#16449A', header: 'black', treatment: 'color' },
  { id: 'herbal', name: 'The Apothecary', style: 'Earth and herb', description: 'Rooted, expert and traditional.', image: '/images/guides/templates/earth-herbal.webp', heading: 'Fraunces', body: 'Instrument Serif', page: '#EEE7D9', accent: '#4F6434', header: 'black', treatment: 'color' },
  { id: 'future', name: 'The Future', style: 'Soft technology', description: 'Progressive, fluid and intelligent.', image: '/images/guides/templates/future-calm.webp', heading: 'Archivo', body: 'Poppins', page: '#EDF7F3', accent: '#327B70', header: 'tone', treatment: 'color' },
  { id: 'community', name: 'The Gathering', style: 'Community warmth', description: 'Welcoming, shared and generous.', image: '/images/guides/templates/community-table.webp', heading: 'Fraunces', body: 'DM Sans', page: '#F5EBDD', accent: '#9A5B3B', header: 'tone', treatment: 'color' },
];

const defaultAvatars = [
  { name: 'Guardian', image: '/images/guides/avatars/guardian.png' },
  { name: 'Woman', image: '/images/guides/avatars/woman.png' },
  { name: 'Man', image: '/images/guides/avatars/man.png' },
  { name: 'Grandmother', image: '/images/guides/avatars/grandmother.png' },
  { name: 'Grandfather', image: '/images/guides/avatars/grandfather.png' },
];

const bookingProviders: { value: BookingProvider; label: string; placeholder: string }[] = [
  { value: 'ROUTINE³ Booking', label: 'R3 Booking', placeholder: 'https://routine3.com/book/yourname' },
  { value: 'Cal.com', label: 'Cal.com', placeholder: 'https://cal.com/yourname' },
  { value: 'Google appointment schedule', label: 'Google Calendar', placeholder: 'https://calendar.app.google/your-booking-page' },
  { value: 'Calendly', label: 'Calendly', placeholder: 'https://calendly.com/yourname' },
  { value: 'Other', label: 'Other', placeholder: 'https://yourwebsite.com/book' },
];
const languageOptions = [
  { name: 'English', code: 'en', flag: '🇬🇧' }, { name: 'Polish', code: 'pl', flag: '🇵🇱' }, { name: 'Spanish', code: 'es', flag: '🇪🇸' },
  { name: 'French', code: 'fr', flag: '🇫🇷' }, { name: 'German', code: 'de', flag: '🇩🇪' }, { name: 'Italian', code: 'it', flag: '🇮🇹' },
  { name: 'Portuguese', code: 'pt', flag: '🇵🇹' }, { name: 'Dutch', code: 'nl', flag: '🇳🇱' }, { name: 'Arabic', code: 'ar', flag: '🇦🇪' },
];
function defaultLanguage() {
  if (typeof navigator === 'undefined') return 'English';
  const code = navigator.language.split('-')[0].toLowerCase();
  return languageOptions.find((language) => language.code === code)?.name || 'English';
}

const freeValueSuggestions: Record<FreeOfferKind, string> = {
  ebook: 'Learn one useful method they can apply today.',
  one_to_one_call: 'Leave with clarity on the right next step for their goal.',
  group_call: 'Join a useful weekly conversation, ask questions and learn alongside people working towards the same goal.',
  recipe_book: 'Make practical recipes they can use immediately.',
  routine: 'Follow a simple routine and experience an early result.',
  in_person: 'Meet in person for a short, practical session or small event.',
};

const nextStepLabels: Record<OfferNextStep, { title: string; note: string }> = {
  builder: { title: 'Build in ROUTINE³', note: 'Create an editable Recipe or Protocol' },
  link: { title: 'Open offer page', note: 'Send them to a page or checkout' },
  video: { title: 'Watch a video', note: 'Open a YouTube, Vimeo or hosted video' },
  booking: { title: 'Book a session', note: 'Use your booking calendar' },
};

const deliveryFormats: { value: DeliveryFormat; note: string; image: string }[] = [
  { value: 'Downloadable PDF', note: 'Download, save or print', image: '/images/guides/delivery/physical-pdf.png' },
  { value: 'Interactive Protocol', note: 'Follow and check off each step', image: '/images/guides/delivery/digital-app.png' },
  { value: 'PDF + Interactive Protocol', note: 'Downloadable guide with interactive steps', image: '/images/guides/delivery/physical-digital.png' },
  { value: 'Live online', note: 'Video call or live room', image: '/images/guides/delivery/live-online.png' },
  { value: 'In person', note: 'Private physical session', image: '/images/guides/delivery/in-person.png' },
  { value: 'Event', note: 'Shared physical experience', image: '/images/guides/delivery/event.png' },
];

function suggestedDelivery(kind: FreeOfferKind | UpsellKind): DeliveryFormat {
  if (kind === 'routine_guidance') return 'Interactive Protocol';
  if (kind === 'routine') return 'PDF + Interactive Protocol';
  if (kind === 'one_to_one_call' || kind === 'group_call') return 'Live online';
  if (kind === 'in_person') return 'In person';
  if (kind === 'festival') return 'Event';
  return 'Downloadable PDF';
}

const specialtyGroups = {
  Body: ['Nutrition', 'Fitness', 'Wellness', 'Yoga', 'Somatic work', 'Sleep', 'Skin', 'Gut health', 'Family health', 'Longevity', 'Breathwork'],
  Mind: ['Psychology', 'Stress', 'Focus', 'Habits', 'Confidence', 'Relationships', 'Emotional wellbeing', 'Mindfulness', 'Coaching'],
  Soul: ['Human Design', 'Astrology', 'Tarot', 'Numerology', 'Meditation', 'Spiritual practice', 'Reiki', 'Energy work', 'Sound healing', 'Purpose', 'Journaling', 'Rituals', 'Life transitions', 'Breathwork'],
} as const;
type GuideRealm = keyof typeof specialtyGroups;
// Practitioner roles offered under each selected expertise card.
const specialtyRoles: Record<string, string[]> = {
  Nutrition: ['Nutritionist', 'Dietitian', 'Herbalist', 'Naturopath', 'Health coach'], Fitness: ['Personal trainer', 'Strength coach', 'Running coach', 'Pilates instructor'], Wellness: ['Wellness coach', 'Naturopath', 'Herbalist', 'Holistic practitioner'], Yoga: ['Yoga teacher', 'Yoga therapist'], 'Somatic work': ['Somatic practitioner', 'Bodyworker', 'Massage therapist'], Sleep: ['Sleep coach', 'Sleep consultant'], Skin: ['Esthetician', 'Skin therapist', 'Dermatology nurse'], 'Gut health': ['Gut health coach', 'Nutritionist', 'Naturopath'], 'Family health': ['Doula', 'Midwife', 'Parenting coach', 'Family nutritionist'], Longevity: ['Longevity coach', 'Functional medicine practitioner'], Breathwork: ['Breathwork facilitator', 'Breath coach'],
  Psychology: ['Psychologist', 'Therapist', 'Counsellor'], Stress: ['Stress coach', 'Therapist'], Focus: ['Performance coach', 'ADHD coach'], Habits: ['Habit coach', 'Health coach'], Confidence: ['Confidence coach', 'Life coach'], Relationships: ['Relationship coach', 'Couples therapist'], 'Emotional wellbeing': ['Counsellor', 'Wellbeing coach'], Mindfulness: ['Mindfulness teacher', 'MBSR instructor'], Coaching: ['Life coach', 'Executive coach', 'Health coach'],
  'Human Design': ['Human Design reader'], Astrology: ['Astrologer'], Tarot: ['Tarot reader'], Numerology: ['Numerologist'], Meditation: ['Meditation teacher'], 'Spiritual practice': ['Spiritual guide', 'Minister'], Reiki: ['Reiki practitioner', 'Reiki master'], 'Energy work': ['Energy healer'], 'Sound healing': ['Sound healer'], Purpose: ['Purpose coach'], Journaling: ['Journaling guide'], Rituals: ['Ritual guide', 'Celebrant'], 'Life transitions': ['Transition coach', 'Death doula'],
};

const realmImages: Record<GuideRealm, string> = {
  Body: '/images/guides/body-realm.png',
  Mind: '/images/guides/mind-realm.png',
  Soul: '/images/guides/soul-realm.png',
};
const specialties = Array.from(new Set(Object.values(specialtyGroups).flat()));
const specialtyHelp: Record<string, string> = {
  Nutrition: 'Food choices and eating plans', Fitness: 'Movement, strength and mobility', Wellness: 'Everyday health and balance', Yoga: 'Movement, flexibility and presence',
  'Somatic work': 'Body awareness and regulation', Sleep: 'Rest, recovery and sleep habits', Skin: 'Skin routines and practical care', 'Gut health': 'Digestion and food support',
  'Family health': 'Healthy routines for families', Longevity: 'Habits for a longer healthy life', Breathwork: 'Breathing practices and regulation',
  Psychology: 'Understand thoughts and behaviour', Stress: 'Reduce pressure and restore calm', Focus: 'Attention, clarity and deep work', Habits: 'Build actions that last',
  Confidence: 'Self-trust and personal growth', Relationships: 'Communication and connection', 'Emotional wellbeing': 'Process feelings with care', Mindfulness: 'Awareness and grounded attention', Coaching: 'Clarity, accountability and action',
  'Human Design': 'Understand personal energy and choices', Astrology: 'Cycles, patterns and self-reflection', Tarot: 'Reflection and intuitive direction', Numerology: 'Meaning through numbers and cycles',
  Meditation: 'Stillness, awareness and presence', 'Spiritual practice': 'Meaningful everyday devotion', Reiki: 'Energy balance and relaxation', 'Energy work': 'Awareness, alignment and release',
  'Sound healing': 'Restoration through sound', Purpose: 'Direction, meaning and contribution', Journaling: 'Reflection and written clarity', Rituals: 'Intentional practices for change',
  'Life transitions': 'Support through personal change',
};
const specialtyOutcomes: Record<string, string> = {
  Nutrition: 'Eat with more confidence', Fitness: 'Build strength you can sustain', Wellness: 'Feel better in your everyday life', Yoga: 'Move with greater ease and awareness',
  'Somatic work': 'Feel safer and more at home in your body', Sleep: 'Sleep deeply and wake restored', Skin: 'Build a skin routine that works', 'Gut health': 'Support calmer, more comfortable digestion',
  'Family health': 'Create healthier rhythms for the whole family', Longevity: 'Build habits for a longer, healthier life', Breathwork: 'Use your breath to find calm and energy',
  Psychology: 'Understand your patterns and move forward', Stress: 'Feel calmer when life gets demanding', Focus: 'Protect your attention and think clearly', Habits: 'Turn good intentions into lasting habits',
  Confidence: 'Trust yourself and act with confidence', Relationships: 'Build stronger, more honest relationships', 'Emotional wellbeing': 'Meet difficult feelings with more ease', Mindfulness: 'Feel present, grounded and clear', Coaching: 'Turn clarity into meaningful action',
  'Human Design': 'Make decisions that fit your natural design', Astrology: 'Use your patterns and cycles with purpose', Tarot: 'Find clarity through guided reflection', Numerology: 'Understand the patterns shaping your path',
  Meditation: 'Create more stillness and clarity', 'Spiritual practice': 'Build a spiritual practice that feels true', Reiki: 'Restore balance and deep relaxation', 'Energy work': 'Release what feels stuck and restore balance',
  'Sound healing': 'Settle your nervous system through sound', Purpose: 'Find direction and live with more meaning', Journaling: 'Turn reflection into personal clarity', Rituals: 'Create rituals that support real change',
  'Life transitions': 'Move through change with clarity and support',
};

function guardianHeadline(topic: string, audiences: string[]) {
  const matchedTopic = Object.keys(specialtyOutcomes).find((key) => key.toLowerCase() === topic.toLowerCase());
  const outcome = matchedTopic ? specialtyOutcomes[matchedTopic] : `Feel better with practical ${topic.toLowerCase()} guidance`;
  const audience = audiences.length === 1 && audiences[0] !== 'Everyone' ? ` for ${audiences[0].toLowerCase()}` : '';
  return `${outcome}${audience}.`;
}
function guardianHeadlineSuggestions(topics: string[], audiences: string[]) {
  const topic = topics[0] || 'Wellness';
  const secondTopic = topics[1];
  const outcome = (specialtyOutcomes[topic] || `Feel better with practical ${topic.toLowerCase()} guidance`).replace(/\.$/, '');
  const outcomeLower = outcome.charAt(0).toLowerCase() + outcome.slice(1);
  const topicLower = topic.toLowerCase();
  const audience = audiences.length === 1 && audiences[0] !== 'Everyone' ? audiences[0].toLowerCase() : 'everyday life';
  const combined = secondTopic ? `${topicLower} and ${secondTopic.toLowerCase()}` : topicLower;
  return Array.from(new Set([
    guardianHeadline(topic, audiences),
    `${outcome}.`,
    `A practical path to ${outcomeLower}.`,
    `${outcome} in a way that lasts.`,
    `Make ${topicLower} work for your everyday life.`,
    `Build a ${topicLower} practice you can keep.`,
    `Simple ${topicLower}. Meaningful change.`,
    `A clearer way to approach ${topicLower}.`,
    `Turn ${topicLower} insight into daily action.`,
    `Feel supported at every step of your ${topicLower} journey.`,
    `Small ${topicLower} steps. Lasting results.`,
    `Your practical guide to better ${topicLower}.`,
    `Find what works for your body and your life.`,
    `Move from knowing to doing.`,
    `Build confidence through practical ${topicLower}.`,
    `Create everyday habits that help you thrive.`,
    `Make space for the change you need.`,
    `Feel clearer, stronger and more supported.`,
    `A grounded approach to ${combined}.`,
    `Personal guidance for real everyday change.`,
    `Start where you are. Build what works.`,
    `Support designed around you.`,
    `Practical guidance for ${audience}.`,
    `A better rhythm for your everyday life.`,
    `Turn good intentions into a practice that lasts.`,
    `Discover the next step that fits you.`,
    `Learn what helps. Keep what works.`,
    `Feel more capable in your everyday life.`,
    `Build your path with clarity and confidence.`,
    `Your next chapter starts with one useful step.`,
    `Guidance that meets you where you are.`,
  ])).slice(0, 30);
}
const SECTION_ICON = { hygiene: Bath, beauty: Sparkle, wellness: HeartHandshake, detox: Droplets, longevity: Hourglass } as const;
/** Themes the Protocols page groups by, in sidebar order. */
const PROTOCOL_THEMES = ['Diet', 'Fitness', 'Hygiene', 'Beauty', 'Wellness', 'Detox', 'Longevity', 'Other'] as const;
/** A Protocol's theme from its category, then its builder, then words in its name / description. */
function protocolTheme(x: { category?: string | null; name?: string | null; description?: string | null; builder_kind?: string | null }): typeof PROTOCOL_THEMES[number] {
  const c = `${x.category || ''} ${(x as any).builder_kind || ''}`.toLowerCase(), t = `${x.name || ''} ${x.description || ''}`.toLowerCase();
  const by = (re: RegExp) => re.test(c) || re.test(t);
  if (/diet|nutrition|meal/.test(c)) return 'Diet';
  if (/fitness|strength|cardio|hiit|recovery|mobility|workout/.test(c)) return 'Fitness';
  if (/hygiene|oral|dental/.test(c)) return 'Hygiene';
  if (/beauty|skin|hair/.test(c)) return 'Beauty';
  if (/detox|cleanse/.test(c)) return 'Detox';
  if (/longevity|performance/.test(c)) return 'Longevity';
  if (/wellness|health|sleep|mind/.test(c)) return 'Wellness';
  if (by(/\b(diet|meal|recipe|nutrition|eat|food|fasting)\b/)) return 'Diet';
  if (by(/\b(fitness|workout|training|strength|run|gym|exercise)\b/)) return 'Fitness';
  if (by(/\b(detox|cleanse|parasite)\b/)) return 'Detox';
  if (by(/\b(skin|beauty|hair|glow)\b/)) return 'Beauty';
  if (by(/\b(teeth|dental|oral|hygiene)\b/)) return 'Hygiene';
  if (by(/\b(longevity|ageing|aging)\b/)) return 'Longevity';
  if (by(/\b(sleep|stress|wellness|calm|menopause)\b/)) return 'Wellness';
  return 'Other';
}
/** Sidebar sub-pages and the family they sit under. */
const NAV_PARENT: Partial<Record<string, Tab>> = { diet: 'protocols', fitness: 'protocols', hygiene: 'protocols', beauty: 'protocols', wellness: 'protocols', detox: 'protocols', longevity: 'protocols', diet_protocols: 'diet', recipes: 'diet', ingredients: 'diet', cooking: 'diet', equipment: 'diet', routines: 'fitness', activities: 'fitness', hygiene_protocols: 'hygiene', hygiene_activities: 'hygiene', beauty_protocols: 'beauty', beauty_activities: 'beauty', wellness_protocols: 'wellness', wellness_activities: 'wellness', longevity_protocols: 'longevity', detox_protocols: 'detox' };
const nav: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: 'home', label: 'Overview', Icon: Sparkles },
  { id: 'library', label: 'Library', Icon: FolderOpen },
  { id: 'leads', label: 'Leads', Icon: Users },
  // One Offers section: the builder (each offer) and offer paths (funnels) are tabs inside it.
  { id: 'offer_builder', label: 'Offers', Icon: Package },
  { id: 'protocols', label: 'Protocols', Icon: HeartPulse },
  { id: 'diet', label: 'Diet', Icon: Utensils },
  { id: 'diet_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'recipes', label: 'Recipes', Icon: Salad },
  { id: 'ingredients', label: 'Ingredients', Icon: Wheat },
  { id: 'cooking', label: 'Cooking techniques', Icon: CookingPot },
  { id: 'equipment', label: 'Cooking equipment', Icon: ChefHat },
  { id: 'fitness', label: 'Fitness', Icon: Dumbbell },
  { id: 'routines', label: 'Protocols', Icon: ListChecks },
  { id: 'activities', label: 'Activities', Icon: Activity },
  { id: 'hygiene', label: 'Hygiene', Icon: Bath },
  { id: 'hygiene_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'hygiene_activities', label: 'Activities', Icon: Activity },
  { id: 'beauty', label: 'Beauty', Icon: Sparkle },
  { id: 'beauty_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'beauty_activities', label: 'Activities', Icon: Activity },
  { id: 'wellness', label: 'Wellness', Icon: HeartHandshake },
  { id: 'wellness_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'wellness_activities', label: 'Activities', Icon: Activity },
  { id: 'detox', label: 'Detox', Icon: Droplets },
  { id: 'detox_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'longevity', label: 'Longevity', Icon: Hourglass },
  { id: 'longevity_protocols', label: 'Protocols', Icon: ListChecks },
  { id: 'content', label: 'Content', Icon: Clapperboard },
  { id: 'profile', label: 'Profile', Icon: FileText },
];

// Shared Guardian nav: six builders, each revealing related destinations on hover.
// Used by both the public landing header and the workspace header so the two match.
type GuardianBuilder = { label: string; tab: Tab; Icon: typeof Users; sub: { label: string; tab: Tab }[] };
const GUARDIAN_BUILDERS: GuardianBuilder[] = [
  { label: 'Protocol builder', tab: 'protocols', Icon: Hammer, sub: [{ label: 'All Protocols', tab: 'protocols' }, { label: 'Library', tab: 'library' }] },
  { label: 'Diet planner', tab: 'diet', Icon: Utensils, sub: [{ label: 'Diet planner', tab: 'diet' }, { label: 'Recipes', tab: 'recipes' }, { label: 'Ingredients', tab: 'ingredients' }, { label: 'Cooking techniques', tab: 'cooking' }, { label: 'Cooking equipment', tab: 'equipment' }] },
  { label: 'Fitness planner', tab: 'fitness', Icon: Dumbbell, sub: [{ label: 'Fitness planner', tab: 'fitness' }, { label: 'Fitness routines', tab: 'routines' }, { label: 'Activities', tab: 'activities' }] },
  { label: 'Offer builder', tab: 'offer_builder', Icon: PencilRuler, sub: [{ label: 'Offer builder', tab: 'offer_builder' }, { label: 'Offer paths', tab: 'value_ramps' }, { label: 'Leads', tab: 'leads' }] },
  { label: 'Site builder', tab: 'profile', Icon: Blocks, sub: [{ label: 'Overview', tab: 'home' }, { label: 'Profile', tab: 'profile' }] },
  { label: 'Content builder', tab: 'content', Icon: Clapperboard, sub: [{ label: 'Content builder', tab: 'content' }] },
];

/** The builders in header order (Content builder last), for tests. */
export const GUARDIAN_BUILDERS_ORDER = GUARDIAN_BUILDERS.map((b) => b.label);

/**
 * One header shared by the public Guardian landing and the signed-in workspace, so both
 * sit in the same position and carry the same builder nav. `transparent` gives the landing
 * its translucent-over-hero look; `onNavigate` switches tabs in-app (workspace) instead of
 * following the href. When signed out, every link opens the sign-in modal via `onSignIn`.
 */
export function GuardianHeader({ isSignedIn, activeTab, displayName, transparent, extra, locked, onNavigate, onSignIn, onSignOut }: {
  isSignedIn: boolean;
  /** Why the builders can't open yet (e.g. setup not saved): links stay visible but don't navigate. */
  locked?: string;
  activeTab?: Tab;
  displayName?: string;
  transparent?: boolean;
  /** Page-specific controls shown before the account, e.g. the setup dashboard's Offers / Sites toggles. */
  extra?: React.ReactNode;
  onNavigate?: (tab: Tab) => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
}) {
  const edge = isSignedIn ? ink : 'rgba(245,242,234,.4)';
  const href = (tab: Tab) => (isSignedIn ? `/guardians/workspace?tab=${tab}` : '#guardian-apply');
  const go = (tab: Tab) => (event: React.MouseEvent) => {
    if (locked) { event.preventDefault(); return; }
    if (!isSignedIn) { event.preventDefault(); onSignIn?.(); return; }
    if (onNavigate) { event.preventDefault(); onNavigate(tab); }
  };
  // 31px matches the ROUTINE³ logo box (RoutineMark size 31) so the logo and builder bar line up.
  const builderLink: React.CSSProperties = { height: '100%', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 10px', color: ink, textDecoration: 'none', fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 600, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', boxSizing: 'border-box' };
  return (
    <header className="g-header" style={{ position: 'sticky', top: 0, zIndex: 50, background: transparent ? 'rgba(9,10,8,.42)' : black, backdropFilter: transparent ? 'blur(12px)' : undefined, borderBottom: `1px solid ${transparent ? 'rgba(255,255,255,.22)' : line}` }}>
      <div className="g-header-row" style={{ minHeight: 64 }}>
        <div className="g-brand">
          <span className="g-brand-full"><Brand /></span>
          {/* Phones get the short square R³ mark so the row fits. */}
          <a href="/" aria-label="ROUTINE³ Guardians" className="g-brand-r3" style={{ height: 31, minWidth: 31, padding: '0 7px', boxSizing: 'border-box', border: '1px solid rgba(245,242,234,0.58)', borderRadius: 2, placeItems: 'center', color: ink, textDecoration: 'none', fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '.06em' }}>R³</a>
        </div>
        {/* Builders are centered in the logo row: icons only, the name shows for the current page and on hover. */}
        <nav aria-label="Guardian builders" className="g-builders" style={{ display: 'flex', alignItems: 'stretch', height: 31, boxSizing: 'border-box', border: `1px solid ${edge}`, borderRadius: 2 }}>
          {GUARDIAN_BUILDERS.map((builder, index) => {
            const active = activeTab === builder.tab || builder.sub.some((item) => item.tab === activeTab);
            return <div key={builder.label} className="g-builder" style={{ position: 'relative', borderLeft: index ? `1px solid ${edge}` : 0 }}>
              <a href={locked ? undefined : href(builder.tab)} onClick={go(builder.tab)} aria-current={active ? 'page' : undefined} aria-disabled={locked ? true : undefined} aria-label={locked ? `${builder.label} · ${locked}` : builder.label} title={locked || undefined} style={{ ...builderLink, opacity: isSignedIn && !locked ? 1 : .5, cursor: locked ? 'not-allowed' : 'pointer', background: active ? 'rgba(199,216,163,.16)' : 'transparent' }}>
                <builder.Icon size={14} strokeWidth={1.8} aria-hidden="true" /><span className={active ? 'g-chip-label is-on' : 'g-chip-label'} aria-hidden="true">{builder.label}</span>
              </a>
              {isSignedIn && !locked && <div className="g-builder-menu" aria-label={builder.label} style={{ position: 'absolute', top: '100%', left: 0, minWidth: 184, background: panel, border: `1px solid ${line}`, borderRadius: 2, padding: 4, boxShadow: '0 18px 36px rgba(0,0,0,.55)' }}>
                {builder.sub.map((item) => <a key={item.label} href={href(item.tab)} onClick={go(item.tab)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', color: item.tab === activeTab ? ink : muted, textDecoration: 'none', fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: '.03em', whiteSpace: 'nowrap', background: item.tab === activeTab ? '#1C1E19' : 'transparent' }}><ChevronRight size={12} aria-hidden="true" />{item.label}</a>)}
              </div>}
            </div>;
          })}
        </nav>
        <div className="g-header-account" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          {extra}
          {isSignedIn ? <>
            {displayName && <span className="g-header-name" title={displayName} style={{ color: muted, fontSize: 11, whiteSpace: 'nowrap' }}>{displayName}</span>}
            <button type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out" style={{ border: `1px solid ${line}`, background: 'transparent', color: ink, width: 31, height: 31, flexShrink: 0, boxSizing: 'border-box', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><LogOut size={13} /></button>
          </> : <button type="button" onClick={onSignIn} style={{ ...builderLink, height: 31, border: `1px solid ${ink}`, borderRadius: 2, padding: '0 16px', background: 'transparent' }}>Sign in</button>}
        </div>
      </div>
    </header>
  );
}

const guidePlates: Record<string, string> = {
  home: '/images/guides/guide-plate.png',
  profile: '/images/guides/guide-plate.png',
  leads: '/images/guides/lead-plate.png',
  value_ramps: '/images/guides/offer-plate.png',
  offer_builder: '/images/guides/build-plate.png',
  recipes: '/images/guides/build-plate.png',
  protocols: '/images/guides/build-plate.png',
  library: '/images/guides/build-plate.png',
};

const input: React.CSSProperties = {
  width: '100%', height: 46, boxSizing: 'border-box', border: `1px solid ${line}`,
  background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 13px',
  fontFamily: sans, fontSize: 14, outline: 'none',
};
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, lineHeight: 1.35 };
// Homepage-style CTA: a label cell joined to a solid button on one shared seam.
function CtaLockup({ href, label, action, dark = false }: { href: string; label: string; action: string; dark?: boolean }) {
  const edge = dark ? '#11120F' : '#FFFFFF';
  const cell: React.CSSProperties = { height: 42, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, border: `1px solid ${edge}` };
  return (
    <a href={href} style={{ display: 'inline-flex', marginTop: 26, textDecoration: 'none', maxWidth: '100%' }}>
      <span style={{ ...cell, padding: '0 14px', letterSpacing: '0.04em', color: edge, background: dark ? 'rgba(17,18,15,0.06)' : 'rgba(255,255,255,0.16)', borderRight: 'none', borderRadius: '2px 0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ ...cell, padding: '0 16px', gap: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: dark ? '#FFFFFF' : '#16140F', background: edge, borderRadius: '0 2px 2px 0', whiteSpace: 'nowrap' }}>{action} <ArrowRight size={13} /></span>
    </a>
  );
}

const btn: React.CSSProperties = { minHeight: 44, border: `1px solid ${line}`, background: ink, color: black, padding: '0 18px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, lineHeight: 1.2 };
const compactControl: React.CSSProperties = { height: 40, fontSize: 11, fontWeight: 600, lineHeight: 1.2 };
const titleHighlight: React.CSSProperties = { display: 'inline', width: 'fit-content', background: 'rgba(245,242,234,.82)', color: black, padding: '3px 7px 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' };

interface TagArt { src: string; cols: number; rows: number; index: number; cellAspect: number }
const atlas = (src: string, cols: number, rows: number, labels: readonly string[], cellAspect = 1) => Object.fromEntries(labels.map((name, index) => [name, { src, cols, rows, index, cellAspect } as TagArt]));
function InventoryThumb({ art }: { art: TagArt }) {
  const col = art.index % art.cols;
  const row = Math.floor(art.index / art.cols);
  return <span aria-hidden="true" style={{ width: 54, height: 54, flex: '0 0 54px', backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${art.cols === 1 ? 0 : col * 100 / (art.cols - 1)}% ${art.rows === 1 ? 0 : row * 100 / (art.rows - 1)}%`, filter: 'grayscale(1) contrast(.96)' }} />;
}
function SelectCard({ orientation, eyebrow, title, copy, art, active, recommended = false, onClick }: { orientation: 'vertical' | 'horizontal'; eyebrow?: string; title: string; copy: string; art: TagArt; active: boolean; recommended?: boolean; onClick: () => void }) {
  const col = art.index % art.cols;
  const row = Math.floor(art.index / art.cols);
  const iconHeight = orientation === 'vertical' ? 46 : 52;
  const icon = <span aria-hidden="true" style={{ width: iconHeight * art.cellAspect, height: iconHeight, flex: '0 0 auto', backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${art.cols === 1 ? 0 : col * 100 / (art.cols - 1)}% ${art.rows === 1 ? 0 : row * 100 / (art.rows - 1)}%`, filter: active ? 'grayscale(1) brightness(.22)' : 'grayscale(1) contrast(.94) brightness(.94)' }} />;
  const valueIcon = <span aria-hidden="true" style={{ width: 34 * art.cellAspect, height: 34, flex: '0 0 auto', backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${art.cols === 1 ? 0 : col * 100 / (art.cols - 1)}% ${art.rows === 1 ? 0 : row * 100 / (art.rows - 1)}%`, filter: active ? 'grayscale(1) brightness(.22)' : 'grayscale(1) contrast(.94) brightness(.94)' }} />;
  const formatIcon = title === 'R3 Protocol'
    ? <span aria-hidden="true" style={{ width: 45, height: 30, flex: '0 0 45px', border: `1px solid ${active ? black : ink}`, color: active ? black : ink, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '.05em' }}>R³</span>
    : icon;
  const eyebrowText = recommended ? 'Best fit' : eyebrow;
  const eyebrowNode = eyebrowText && <span style={{ display: 'block', color: active ? black : recommended ? acid : muted, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 7 }}>{eyebrowText}</span>;
  const horizontalMeta = <span style={{ minWidth: 0 }}>{eyebrowNode}<strong style={{ display: 'block', color: active ? black : ink, fontSize: 13, lineHeight: 1.3 }}>{title}</strong><span style={{ display: 'block', color: active ? 'rgba(9,10,8,.72)' : muted, fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>{copy}</span></span>;
  return <button className="guardian-card" type="button" onClick={onClick} aria-pressed={active} style={{ minHeight: orientation === 'vertical' ? 220 : 92, width: '100%', border: `1px solid ${active ? ink : line}`, background: active ? ink : 'transparent', color: active ? black : ink, padding: orientation === 'vertical' ? 0 : 14, fontFamily: sans, cursor: 'pointer', textAlign: 'left', display: orientation === 'vertical' ? 'grid' : 'grid', gridTemplateRows: orientation === 'vertical' ? '1fr 1fr' : undefined, gridTemplateColumns: orientation === 'horizontal' ? '58px minmax(0,1fr)' : undefined, gap: orientation === 'horizontal' ? 12 : 0, alignItems: orientation === 'horizontal' ? 'center' : 'stretch', minWidth: 0 }}>
    {orientation === 'vertical' ? <><span style={{ minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><span style={{ display: 'block', color: active ? 'rgba(9,10,8,.62)' : acid, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 9 }}>Value{eyebrowText ? ` · ${eyebrowText}` : ''}</span><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{valueIcon}<strong style={{ display: 'block', color: active ? black : ink, fontSize: 13, lineHeight: 1.4 }}>{copy}</strong></span></span><span style={{ minHeight: 0, padding: 14, borderTop: `1px solid ${active ? 'rgba(9,10,8,.2)' : line}`, display: 'flex', alignItems: 'center', gap: 10 }}>{formatIcon}<span><span style={{ display: 'block', color: active ? 'rgba(9,10,8,.62)' : muted, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', marginBottom: 4 }}>FORMAT</span><strong style={{ display: 'block', fontSize: 12 }}>{title}</strong></span></span></> : <>{icon}{horizontalMeta}</>}
  </button>;
}
const specialtyArt: Record<GuideRealm, Record<string, TagArt>> = {
  Body: atlas('/images/guides/tags/body.webp', 4, 3, specialtyGroups.Body),
  Mind: atlas('/images/guides/tags/mind.webp', 3, 3, specialtyGroups.Mind),
  Soul: atlas('/images/guides/tags/soul.webp', 5, 3, specialtyGroups.Soul),
};
const audienceArt = atlas('/images/guides/tags/audience.webp', 4, 2, ['Everyone', 'Busy families', 'Women', 'Men', 'Children', 'Athletes', 'Adults 50+']);
(audienceArt as Record<string, TagArt>).Teenagers = audienceArt.Children;
const supportArt = atlas('/images/guides/tags/support-v3.webp', 3, 2, ['ROUTINE³ (physical + digital)', 'Recipes', 'Group call', '1:1 online', 'In person', 'Event']);
const offerArt: Record<string, TagArt> = atlas('/images/guides/tags/offers-v2.webp', 4, 3, ['Starter guide', 'Recipe pack', 'ROUTINE³', '1:1 call', 'Group call', 'Journey', 'Event', 'eBook', 'Recipe book', 'Team program', 'Upload', 'Paid'], .75);
const offerTypeArt = atlas('/images/guides/tags/offer-types-v3.png', 4, 2, ['routine', 'ebook', 'recipe_book', 'routine_guidance', 'festival', 'group_call', 'one_to_one_call', 'in_person']);
const freeOfferArt: Record<FreeOfferKind, TagArt> = {
  ebook: offerArt.eBook,
  one_to_one_call: offerArt['1:1 call'],
  group_call: offerArt['Group call'],
  recipe_book: offerArt['Recipe pack'],
  routine: offerArt['ROUTINE³'],
  in_person: offerTypeArt.in_person,
};
const freeOfferImages: Record<FreeOfferKind, string> = {
  ebook: '/images/guides/generated/lead-pdf-guide-v2.webp',
  one_to_one_call: '/images/guides/generated/lead-private-call-v2.webp',
  group_call: '/images/guides/generated/lead-community-call-v2.webp',
  recipe_book: '/images/guides/generated/lead-recipes-v2.webp',
  routine: '/images/guides/generated/r3-protocol-card.png',
  in_person: '/images/guides/delivery/in-person.png',
};
const deliveryCardArt: Record<DeliveryFormat, TagArt> = {
  'Downloadable PDF': offerArt['Starter guide'],
  'Interactive Protocol': offerArt['ROUTINE³'],
  'PDF + Interactive Protocol': supportArt['ROUTINE³ (physical + digital)'],
  'Live online': supportArt['Group call'],
  'In person': supportArt['In person'],
  Event: supportArt.Event,
};

// One card spec for every setup stage (Guidance, Audience, Offers): same size, image, divider and selected state.
const CHOICE_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: 10 };
const CHOICE_CARD_HEIGHT = 156;
function choiceCardStyle(active: boolean): React.CSSProperties {
  return { position: 'relative', height: CHOICE_CARD_HEIGHT, overflow: 'hidden', padding: 0, border: `1px solid ${active ? acid : line}`, background: active ? '#20251B' : 'rgba(245,242,234,.04)', color: ink, fontFamily: sans, cursor: 'pointer', display: 'grid', gridTemplateColumns: '92px 1px minmax(0,1fr)', gap: 0, alignItems: 'stretch', textAlign: 'left', minWidth: 0, width: '100%', boxSizing: 'border-box' };
}
function ChoiceCheck() {
  return <span aria-hidden="true" style={{ position: 'absolute', top: 8, left: 8, width: 18, height: 18, display: 'grid', placeItems: 'center', border: `1px solid ${acid}`, borderRadius: '50%', color: acid }}><Check size={10} strokeWidth={2.5} /></span>;
}
function ChoiceText({ title, description, footer, active }: { title: string; description?: string; footer?: string; active: boolean }) {
  return <span style={{ minWidth: 0, padding: '24px 14px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</span>
    {description && <span title={description} style={{ color: muted, fontSize: 10, lineHeight: 1.45, marginTop: 5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</span>}
    {footer && <span style={{ display: 'block', color: active ? acid : muted, fontSize: 8.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{footer}</span>}
  </span>;
}

function TagChoice({ text, description, active, art, onClick, badge }: { text: string; description?: string; active: boolean; art: TagArt; onClick: () => void; compact?: boolean; largeText?: boolean; badge?: string; tone?: 'accent' | 'free'; checkRight?: number; showCheck?: boolean }) {
  const col = art.index % art.cols;
  const row = Math.floor(art.index / art.cols);
  return <button className="guardian-card" type="button" onClick={onClick} aria-pressed={active} style={choiceCardStyle(active)}>
    {active && <ChoiceCheck />}
    {badge && <span style={{ position: 'absolute', top: 9, right: 10, color: badge === 'FREE' ? acid : '#C88A66', fontSize: 8, fontWeight: 700, letterSpacing: '.14em' }}>{badge}</span>}
    <span role="img" aria-label="" style={{ width: 64, height: 64, justifySelf: 'center', alignSelf: 'center', backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${art.cols === 1 ? 0 : col * 100 / (art.cols - 1)}% ${art.rows === 1 ? 0 : row * 100 / (art.rows - 1)}%`, filter: 'grayscale(1) contrast(.92)' }} />
    <span aria-hidden="true" style={{ alignSelf: 'stretch', background: line }} />
    <ChoiceText title={text} description={description} active={active} />
  </button>;
}

function CreatorChoiceCard({ badge, title, description, footer, active, art, image, onClick, onInfo, corner, order }: { creator: string; avatarUrl?: string; badge: string; byline: string; title: string; description: string; footer: string; active: boolean; art?: TagArt; image?: string; onClick: () => void; onInfo?: () => void; corner?: string; order?: number }) {
  const col = art ? art.index % art.cols : 0;
  const row = art ? Math.floor(art.index / art.cols) : 0;
  return <div style={{ position: 'relative', minWidth: 0 }}>
    <button className="guardian-card" type="button" onClick={onClick} aria-pressed={active} style={choiceCardStyle(active)}>
      {active && (order ? <span aria-label={`Selected #${String(order).padStart(2, '0')}`} style={{ position: 'absolute', top: 8, left: 8, padding: '4px 7px', background: ink, color: black, fontSize: 9, fontWeight: 800, letterSpacing: '.06em' }}>#{String(order).padStart(2, '0')}</span> : <ChoiceCheck />)}
      {active && corner && <span style={{ position: 'absolute', top: 12, left: 34, color: acid, fontSize: 8, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{corner}</span>}
      <span style={{ position: 'absolute', top: 9, right: onInfo ? 54 : 10, color: active ? acid : muted, fontSize: 8, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{badge}</span>
      {image ? <img src={image} alt="" loading="lazy" style={{ width: 64, height: 64, objectFit: 'contain', justifySelf: 'center', alignSelf: 'center' }} /> : art ? <span role="img" aria-label="" style={{ width: 64, height: 64, justifySelf: 'center', backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${col * 100 / Math.max(1, art.cols - 1)}% ${row * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.94)', alignSelf: 'center' }} /> : <span />}
      <span aria-hidden="true" style={{ alignSelf: 'stretch', background: line }} />
      <ChoiceText title={title} description={description} footer={footer} active={active} />
    </button>
    {onInfo && <button type="button" onClick={onInfo} style={{ position: 'absolute', top: 6, right: 8, height: 20, border: `1px solid ${line}`, background: 'transparent', color: ink, padding: '0 7px', fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Info</button>}
  </div>;
}

type PreviewDevice = 'desktop' | 'mobile';
const PREVIEW_SIZES: Record<PreviewDevice, { width: number; height: number }> = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

/** Renders a site preview at a real device size and scales it to fit, so every preview keeps the same ratio. */
function PreviewFrame({ device, children }: { device: PreviewDevice; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    if (!outer.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(outer.current);
    return () => observer.disconnect();
  }, []);
  const size = PREVIEW_SIZES[device];
  const maxShownWidth = device === 'mobile' ? Math.min(available, 360) : available;
  const scale = available ? Math.min(1, maxShownWidth / size.width) : 0;
  return <div ref={outer} style={{ width: '100%' }}>
    <div style={{ position: 'relative', width: size.width * scale, height: size.height * scale, margin: '0 auto', overflow: 'hidden', border: `1px solid ${line}`, borderRadius: device === 'mobile' ? 22 : 4, background: '#F2EFE7' }}>
      <div className="pv-inner" style={{ containerType: 'inline-size', position: 'absolute', top: 0, left: 0, width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: 'top left', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  </div>;
}

/** Joined Desktop | Mobile toggle, same lockup style as the headers. */
function DeviceToggle({ value, onChange }: { value: PreviewDevice; onChange: (device: PreviewDevice) => void }) {
  return <div role="group" aria-label="Preview size" style={{ display: 'inline-flex', border: `1px solid ${line}`, borderRadius: 2 }}>
    {(['desktop', 'mobile'] as const).map((device, index) => <button type="button" key={device} aria-pressed={value === device} onClick={() => onChange(device)} style={{ height: 30, padding: '0 14px', border: 0, borderLeft: index ? `1px solid ${line}` : 0, background: value === device ? ink : 'transparent', color: value === device ? black : muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{device}</button>)}
  </div>;
}

function FunnelStage({ number, eyebrow, title, copy, art, last = false, aside, children }: { number: string; eyebrow: string; title: string; copy: string; art?: TagArt; last?: boolean; children: React.ReactNode; aside?: React.ReactNode }) {
  const artCol = art ? art.index % art.cols : 0;
  const artRow = art ? Math.floor(art.index / art.cols) : 0;
  return <div style={{ position: 'relative', padding: '0 0 34px 44px', borderLeft: last ? '1px solid transparent' : `1px solid ${line}` }}>
    <span aria-hidden="true" style={{ position: 'absolute', left: -16, top: -2, width: 30, height: 30, borderRadius: '50%', border: `1px solid ${acid}`, background: black, color: acid, display: 'grid', placeItems: 'center', fontFamily: sans, fontSize: 9, fontWeight: 700 }}>{number}</span>
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>{aside && <div style={{ flex: '0 0 320px', maxWidth: '100%' }}>{aside}</div>}<div style={{ flex: '1 1 360px', minWidth: 0 }}>
    <div style={{ ...label, color: acid }}>{eyebrow}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '9px 0 8px' }}>{art && <span aria-hidden="true" style={{ width: 48 * art.cellAspect, height: 48, flex: `0 0 ${48 * art.cellAspect}px`, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${artCol * 100 / Math.max(1, art.cols - 1)}% ${artRow * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.94)' }} />}<h2 style={{ color: ink, fontFamily: serif, fontSize: 32, fontWeight: 300, lineHeight: 1.05, margin: 0 }}>{title}</h2></div>
    <p style={{ color: muted, fontSize: 13, lineHeight: 1.6, margin: '0 0 19px', maxWidth: 720 }}>{copy}</p>
    {children}
    </div></div>
  </div>;
}

function DeliveryPicker({ value, recommended, onChange }: { value: DeliveryFormat[]; recommended: DeliveryFormat; onChange: (value: DeliveryFormat[]) => void }) {
  const toggle = (option: DeliveryFormat) => onChange(value.includes(option) ? (value.length === 1 ? value : value.filter((item) => item !== option)) : [...value, option]);
  return <div style={{ marginTop: 12 }}>
    <label style={label}>Value unlocked at this level <span style={{ color: acid }}>· choose all that apply · suggested: {recommended}</span></label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 7 }}>
      {deliveryFormats.map((option) => { const active = value.includes(option.value); return <SelectCard key={option.value} orientation="horizontal" title={option.value} copy={option.note} art={deliveryCardArt[option.value]} active={active} recommended={recommended === option.value} onClick={() => toggle(option.value)} />; })}
    </div>
  </div>;
}

function FreeOfferCard({ eyebrow, title, copy, art, active, recommended = false, onClick }: { eyebrow: string; title: string; copy: string; art: TagArt; active: boolean; recommended?: boolean; onClick: () => void }) {
  return <SelectCard orientation="vertical" eyebrow={eyebrow} title={title} copy={copy} art={art} active={active} recommended={recommended} onClick={onClick} />;
}

function Brand({ centered = false }: { centered?: boolean }) {
  return <a href="/" aria-label="ROUTINE³ Guardians" style={{ width: 'fit-content', margin: centered ? '0 auto' : undefined, textDecoration: 'none', display: 'block' }}><RoutineMark size={31} textColor={ink} hairline="rgba(245,242,234,0.58)" suffix="Guardians" /></a>;
}

function SocialUrlField({ label: text, value, placeholder, Icon, onChange }: { label: string; value: string; placeholder: string; Icon: typeof Globe2; onChange: (value: string) => void }) {
  return <div>
    <label style={label}>{text} <span style={{ color: muted }}>· optional</span></label>
    <div style={{ position: 'relative' }}>
      <Icon aria-hidden="true" size={15} strokeWidth={1.5} style={{ position: 'absolute', left: 13, top: 16, color: muted, pointerEvents: 'none' }} />
      <input type="url" style={{ ...input, paddingLeft: 40 }} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  </div>;
}

function AuthPanel({ bare = false, initialMode = 'signup', initialEmail = '', onModalClose }: { bare?: boolean; initialMode?: 'login' | 'signup'; initialEmail?: string; onModalClose?: () => void }) {
  const authFormId = useId();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    if (mode === 'login') {
      const result = await signIn(email, password);
      if (result.error) setError(result.error.helpMessage || result.error.message || 'Could not sign in');
      else window.location.assign('/guardians/workspace');
      setBusy(false);
      return;
    }

    // Existing HealthScan users are already valid guide users. Sign them into
    // the same account first; GuidePortal will then open guide onboarding when
    // no guide profile exists yet.
    const login = await signIn(email, password);
    if (!login.error) { window.location.assign('/guardians/workspace'); return; }

    const result = await signUp(email, password, name);
    if (result.error) {
      const message = String(result.error.message || result.error.error_description || '');
      if (/already registered|already exists|user_already_exists/i.test(message) || result.error.status === 422) {
        setMode('login');
        setError('This HealthScan account already exists. Check the password, then sign in to activate its Guardian profile.');
      } else {
        setError(result.error.helpMessage || result.error.message || 'Could not create the account');
      }
    } else {
      setError('Check your email to confirm the account, then sign in to create your Guardian profile.');
    }
    setBusy(false);
  }
  const actions = <>
    <button form={authFormId} disabled={busy} style={{ ...btn, width: '100%', opacity: busy ? .55 : 1 }}>{busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create Guardian account'} <ArrowRight size={14} /></button>
    <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ border: 0, background: 'none', color: muted, width: '100%', marginTop: 15, cursor: 'pointer', fontFamily: sans, fontSize: 12 }}>{mode === 'login' ? 'New Guardian? Create an account' : 'Already have an account? Sign in'}</button>
  </>;
  const form = (
    <form id={authFormId} onSubmit={submit} style={onModalClose ? {} : bare ? { maxWidth: 460, width: '100%' } : { border: `1px solid ${line}`, background: panel, padding: 'clamp(24px,4vw,48px)', maxWidth: 460 }}>
      {!bare && <><div style={{ ...label, color: acid }}>{mode === 'login' ? 'Sign in' : 'Step 1 · Create your account'}</div>
      <h2 style={{ margin: '12px 0 10px', fontFamily: serif, fontSize: 'clamp(32px,4vw,52px)', fontWeight: 300, lineHeight: 1, letterSpacing: '-0.045em' }}>{mode === 'login' ? 'Welcome back, Guardian.' : 'Build with ROUTINE³.'}</h2>
      <p style={{ color: muted, fontFamily: sans, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>{mode === 'login' ? 'Pick up where you left off: your Protocols, offers and site are waiting.' : 'Create your profile, collect leads, and publish paid resources, recipes and protocols from one workspace.'}</p></>}
      {mode === 'signup' && <div style={{ marginBottom: 12 }}><label style={label}>Your name</label><input value={name} onChange={(e) => setName(e.target.value)} required style={input} /></div>}
      <div style={{ marginBottom: 12 }}><label style={label}>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} /></div>
      <div style={{ marginBottom: 16 }}><label style={label}>Password</label><input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required style={input} /></div>
      {error && <div style={{ color: '#F0A7A7', fontSize: 12, fontFamily: sans, marginBottom: 14 }}>{error}</div>}
      {!onModalClose && actions}
    </form>
  );
  return onModalClose ? <GuardianModal label={mode === 'login' ? 'Sign in' : 'Sign up'} onClose={onModalClose} panelStyle={{ background: black, color: ink, fontFamily: sans }} footer={actions} footerStyle={{ borderColor: line }}>{form}</GuardianModal> : form;
}

const guardianDirectoryTypes = [
  { label: 'Herbalist', pattern: /herb|botanical|plant medicine|naturopath/i },
  { label: 'Life coach', pattern: /life coach|coaching|mindset|personal development/i },
  { label: 'Nutritionist', pattern: /nutrition|meal|diet|food|recipe/i },
  { label: 'Fitness coach', pattern: /fitness|movement|strength|athlet|yoga/i },
  { label: 'Wellness practitioner', pattern: /wellness|health|sleep|breath|somatic|longevity/i },
];

function directoryTypesFor(guardian: GuideProfile) {
  const searchable = `${guardian.headline} ${guardian.bio} ${guardian.specialties.join(' ')}`;
  const matches = guardianDirectoryTypes.filter((type) => type.pattern.test(searchable)).map((type) => type.label);
  return matches.length ? matches : ['Wellness practitioner'];
}

function SuggestGuardianModal({ type, onClose }: { type: string; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', instagram: '', tiktok: '', youtube: '', website: '', note: '', suggester_email: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });
  const hasSocial = [form.instagram, form.tiktok, form.youtube, form.website].some((value) => value.trim());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      await submitGuardianSuggestion({ guardian_type: type, ...form });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 42, border: '1px solid rgba(17,18,15,.24)', borderRadius: 2, padding: '0 12px', fontFamily: sans, fontSize: 13, background: '#FFF', color: '#11120F', outline: 'none' };
  const lab: React.CSSProperties = { display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#66645F', margin: '0 0 6px' };
  const socials: [keyof typeof form, string, string][] = [['instagram', 'Instagram', '@handle'], ['tiktok', 'TikTok', '@handle'], ['youtube', 'YouTube', 'Channel URL'], ['website', 'Website', 'https://']];
  return (
    <GuardianModal label={`Suggest a ${type.toLowerCase()}`} onClose={onClose} panelStyle={{ background: '#F2EFE7', color: '#11120F', fontFamily: sans }} header={<span>Suggest a Guardian · {type}</span>} footer={status === 'sent' ? <button type="button" onClick={onClose} style={{ ...btn, width: '100%', background: '#11120F', color: '#FFF' }}>Done</button> : <button form="guardian-suggestion" disabled={status === 'sending' || !hasSocial || !form.name.trim()} style={{ ...btn, width: '100%', background: '#11120F', color: '#FFF', opacity: status === 'sending' || !hasSocial || !form.name.trim() ? .5 : 1 }}>{status === 'sending' ? 'Sending' : 'Send suggestion'} <ArrowRight size={13} /></button>}>
      <form id="guardian-suggestion" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <div><span style={{ color: '#667245', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>Suggest a Guardian · {type}</span><h3 style={{ fontFamily: serif, fontSize: 34, fontWeight: 300, lineHeight: 1, margin: '10px 0 18px' }}>Who should we invite?</h3></div>
        </div>
        {status === 'sent' ? <>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>Thank you. We will review {form.name.trim() || 'them'} and reach out.</p>
        </> : <>
          <div style={{ marginBottom: 12 }}><label style={lab}>Their name</label><input required value={form.name} onChange={set('name')} style={field} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 12 }}>
            {socials.map(([key, name, hint]) => <div key={key}><label style={lab}>{name}</label><input value={form[key]} onChange={set(key)} placeholder={hint} style={field} /></div>)}
          </div>
          <div style={{ marginBottom: 12 }}><label style={lab}>Why them? (optional)</label><textarea value={form.note} onChange={set('note')} rows={3} style={{ ...field, height: 'auto', padding: 12, resize: 'vertical' }} /></div>
          <div style={{ marginBottom: 16 }}><label style={lab}>Your email (optional)</label><input type="email" value={form.suggester_email} onChange={set('suggester_email')} style={field} /></div>
          {!hasSocial && <p style={{ fontSize: 11, color: '#66645F', margin: '0 0 12px' }}>Add at least one social link or website so we can find them.</p>}
          {status === 'error' && <p style={{ fontSize: 12, color: '#A23B3B', margin: '0 0 12px' }}>We could not send that just now. Please try again.</p>}
        </>}
      </form>
    </GuardianModal>
  );
}

function PublicGuidePage({ isSignedIn }: { isSignedIn: boolean }) {
  const { signOut } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [heroEmail, setHeroEmail] = useState('');
  useEffect(() => {
    if (!authMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAuthMode(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authMode]);
  const [guardians, setGuardians] = useState<GuideProfile[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryOffers, setDirectoryOffers] = useState<GuideOffer[]>([]);
  const [reviewSummaries, setReviewSummaries] = useState<Record<string, { rating: number; reviewCount: number }>>({});
  const [activeType, setActiveType] = useState('All');
  useEffect(() => {
    listPublicGuideProfiles().then(setGuardians).catch(() => setGuardians([])).finally(() => setDirectoryLoading(false));
    listPublicGuardianOffers().then(setDirectoryOffers).catch(() => setDirectoryOffers([]));
    listReviewSummaries().then(setReviewSummaries).catch(() => setReviewSummaries({}));
  }, []);
  const [offerFilter, setOfferFilter] = useState<'all' | 'free' | 'paid'>('all');
  const availableTypes = ['All', ...guardianDirectoryTypes.map((type) => type.label)];
  const visibleGuardians = activeType === 'All' ? guardians : guardians.filter((guardian) => directoryTypesFor(guardian).includes(activeType));
  const guardianCta = isSignedIn ? '/guardians/workspace' : '#guardian-apply';
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const suggestTypes = activeType === 'All' ? guardianDirectoryTypes.map((type) => type.label) : [activeType];
  return (
    <div style={{ minHeight: '100vh', background: black, color: ink, fontFamily: sans }}>
      <GuardianHeader transparent isSignedIn={isSignedIn} onSignIn={() => setAuthMode('login')} onSignOut={() => signOut()} />
      {authMode && <AuthPanel key={authMode} initialMode={authMode} initialEmail={heroEmail.trim()} onModalClose={() => setAuthMode(null)} />}
      <main>
        <section style={{ position: 'relative', minHeight: 'calc(100svh - 65px)', display: 'grid', alignItems: 'center', overflow: 'hidden', backgroundImage: 'linear-gradient(rgba(9,10,8,.22),rgba(9,10,8,.84)),url(/images/guides/templates/community-table.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div style={{ width: '100%', boxSizing: 'border-box', padding: 'clamp(54px,8vh,90px) clamp(20px,6vw,90px)' }}>
            <div style={{ maxWidth: 860 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: acid, marginBottom: 28 }}>LEARN · BUILD · GUIDE</div>
              <h1 style={{ margin: 0, fontFamily: serif, fontWeight: 300, fontSize: 'clamp(64px,10vw,142px)', lineHeight: .84, letterSpacing: '-0.055em' }}>Become a Guardian.</h1>
              <p style={{ maxWidth: 650, margin: '30px 0 10px', fontSize: 'clamp(18px,2vw,25px)', lineHeight: 1.4, fontWeight: 600 }}>Turn what you know into guidance people can follow.</p>
              <p style={{ maxWidth: 650, margin: 0, color: 'rgba(245,242,234,.72)', fontSize: 14, lineHeight: 1.7 }}>Create your public page, build your offers, collect leads, and publish guides, recipes and interactive Protocols with ROUTINE³.</p>
              {isSignedIn
                ? <CtaLockup href={guardianCta} label="Your Guardian workspace" action="Open workspace" />
                : /* Email capture is the first sign-up field: it opens the sign-up modal pre-filled. */
                  <form onSubmit={(event) => { event.preventDefault(); setAuthMode('signup'); }} style={{ display: 'flex', marginTop: 26, maxWidth: 480 }}>
                    <input type="email" required value={heroEmail} onChange={(event) => setHeroEmail(event.target.value)} placeholder="you@email.com" aria-label="Your email" style={{ flex: 1, minWidth: 0, height: 42, boxSizing: 'border-box', padding: '0 14px', border: '1px solid #FFFFFF', borderRight: 'none', borderRadius: '2px 0 0 2px', background: 'rgba(255,255,255,0.16)', color: '#FFFFFF', fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 13, fontWeight: 600, outline: 'none' }} />
                    <button type="submit" style={{ height: 42, boxSizing: 'border-box', padding: '0 16px', border: '1px solid #FFFFFF', borderRadius: '0 2px 2px 0', background: '#FFFFFF', color: '#16140F', fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>Become a Guardian <ArrowRight size={13} /></button>
                  </form>}
            </div>
          </div>
        </section>
        <section id="guardian-value" style={{ padding: 'clamp(70px,10vw,130px) clamp(20px,6vw,90px)', background: black, color: ink }}>
          <div style={{ maxWidth: 1320, margin: '0 auto' }}>
            <span style={{ color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.15em' }}>WHY BUILD ON ROUTINE³</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(42px,6vw,78px)', fontWeight: 300, lineHeight: .95, margin: '16px 0 18px', maxWidth: 900 }}>Your knowledge, running every day in someone’s routine.</h2>
            <p style={{ color: muted, fontSize: 15, lineHeight: 1.7, maxWidth: 640, margin: '0 0 clamp(40px,6vw,70px)' }}>Most guidance ends when the call or the PDF does. On ROUTINE³ it becomes a Protocol people follow in the app, and you see how it is going.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,250px),1fr))', borderTop: '1px solid rgba(255,255,255,.18)' }}>
              {[
                ['01', 'A health database to build on', 'Start from a catalogue of foods, ingredients, recipes, supplements and activities instead of a blank page. Every step you add is already structured, timed and explained.'],
                ['02', 'A platform people already use', 'Your Protocols live inside the ROUTINE³ app, with reminders, a daily timeline and check-offs. People follow your guidance where they plan their day, not in a forgotten download.'],
                ['03', 'A coaching feedback loop', 'See which steps get done and where people drop off. Adjust the Protocol, add a check-in, or offer one-to-one support at the moment it is needed.'],
                ['04', 'Revenue you share in', 'Sell guides, programmes and calls through your offers, and earn a share when the people you bring in join ROUTINE³. Your page does the selling between sessions.'],
              ].map(([n, title, body]) => <div key={n} style={{ padding: 'clamp(24px,3vw,34px) clamp(0px,2vw,26px) 0 0', borderRight: '1px solid rgba(255,255,255,.1)', paddingLeft: 'clamp(0px,1.5vw,22px)' }}>
                <span style={{ color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.12em' }}>{n}</span>
                <h3 style={{ fontFamily: serif, fontSize: 'clamp(26px,2.4vw,32px)', fontWeight: 300, lineHeight: 1.05, margin: '14px 0 12px' }}>{title}</h3>
                <p style={{ color: muted, fontSize: 13, lineHeight: 1.65, margin: '0 0 28px' }}>{body}</p>
              </div>)}
            </div>
          </div>
        </section>
        <section id="guardian-directory" style={{ padding: 'clamp(70px,10vw,130px) clamp(20px,6vw,90px)', background: '#F2EFE7', color: '#11120F' }}>
          <div style={{ maxWidth: 1320, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 24, flexWrap: 'wrap', marginBottom: 26 }}><div><span style={{ color: '#667245', fontSize: 10, fontWeight: 700, letterSpacing: '.15em' }}>THE ROUTINE³ NETWORK</span><h2 style={{ fontFamily: serif, fontSize: 'clamp(46px,7vw,86px)', fontWeight: 300, lineHeight: .92, margin: '15px 0 0' }}>Meet the Guardians.</h2></div><a href={guardianCta} style={{ ...btn, background: '#11120F', color: '#FFF', borderColor: '#11120F', textDecoration: 'none' }}>{isSignedIn ? 'Open workspace' : 'Apply to join'} <ArrowRight size={13} /></a></div>
            <div aria-label="Filter Guardians by type" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 18, marginBottom: 22 }}>
              {availableTypes.map((type) => <button type="button" key={type} onClick={() => setActiveType(type)} aria-pressed={activeType === type} style={{ flex: '0 0 auto', minHeight: 38, padding: '0 14px', border: `1px solid ${activeType === type ? '#11120F' : 'rgba(17,18,15,.24)'}`, borderRadius: 3, background: activeType === type ? '#11120F' : 'transparent', color: activeType === type ? '#FFF' : '#11120F', fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{type}</button>)}
            </div>
            {directoryLoading ? <p style={{ color: '#686762' }}>Loading Guardians…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
              {visibleGuardians.map((guardian) => <a className="guardian-directory-card" key={guardian.user_id} href={`/guardians/${guardian.slug}`} style={{ minHeight: 390, border: '1px solid rgba(17,18,15,.18)', borderRadius: 6, background: '#FFF', color: '#11120F', textDecoration: 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 220, background: '#171812', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>{guardian.avatar_url ? <img src={guardian.avatar_url} alt={guardian.display_name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src="/images/guides/guide-plate.png" alt="" loading="lazy" style={{ width: 150, height: 150, objectFit: 'contain', filter: 'grayscale(1)' }} />}</div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: 1 }}><span style={{ color: '#667245', fontSize: 8, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{directoryTypesFor(guardian).join(' · ')}</span><h3 style={{ fontFamily: serif, fontSize: 30, fontWeight: 300, lineHeight: 1, margin: '12px 0 8px' }}>{guardian.display_name}</h3><p style={{ color: '#66645F', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{guardian.headline || guardian.bio}</p><span style={{ marginTop: 'auto', paddingTop: 20, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7 }}>View Guardian <ArrowRight size={12} /></span></div>
              </a>)}
              {suggestTypes.map((type) => <div key={type} style={{ minHeight: 390, border: '1.5px dashed rgba(17,18,15,.32)', borderRadius: 6, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundImage: 'radial-gradient(rgba(17,18,15,.16) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
                <div><span style={{ color: '#667245', fontSize: 8, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{type}</span><h3 style={{ fontFamily: serif, fontSize: 30, fontWeight: 300, lineHeight: 1, margin: '12px 0 8px' }}>Know a great {type.toLowerCase()}?</h3><p style={{ color: '#66645F', fontSize: 12, lineHeight: 1.5, margin: 0 }}>Tell us who should be guiding people here. We will reach out and invite them.</p></div>
                <button type="button" onClick={() => setSuggesting(type)} style={{ ...btn, background: '#11120F', color: '#FFF', borderColor: '#11120F', borderRadius: 2, width: '100%' }}>Suggest {/^[aeiou]/i.test(type) ? 'an' : 'a'} {type.toLowerCase()} <ArrowRight size={13} /></button>
              </div>)}
            </div>}
            {suggesting && <SuggestGuardianModal type={suggesting} onClose={() => setSuggesting(null)} />}
          </div>
        </section>
        {/* Inverted section: every Guardian's published offers. Free ones lead into that Guardian's sign-up funnel. */}
        {(() => {
          const byId = new Map(guardians.map((g) => [g.user_id, g]));
          const shown = directoryOffers.filter((offer) => byId.has(offer.guide_id) && (offerFilter === 'all' || offer.access_model === offerFilter) && (activeType === 'All' || directoryTypesFor(byId.get(offer.guide_id)!).includes(activeType)));
          if (!directoryOffers.some((offer) => byId.has(offer.guide_id))) return null;
          return <section id="guardian-offers" style={{ padding: 'clamp(70px,10vw,130px) clamp(20px,6vw,90px)', background: black, color: ink }}>
            <div style={{ maxWidth: 1320, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 24, flexWrap: 'wrap', marginBottom: 26 }}>
                <div><span style={{ color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>From the Guardians</span><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(46px,7vw,92px)', lineHeight: .95, margin: '14px 0 0' }}>Start with their offers.</h2></div>
                <div aria-label="Filter offers" style={{ display: 'flex', gap: 7 }}>{(['all', 'free', 'paid'] as const).map((value) => <button type="button" key={value} onClick={() => setOfferFilter(value)} aria-pressed={offerFilter === value} style={{ height: 34, padding: '0 14px', border: `1px solid ${offerFilter === value ? ink : line}`, background: offerFilter === value ? ink : 'transparent', color: offerFilter === value ? black : ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{value === 'all' ? 'All' : value === 'free' ? 'Free' : 'Paid'}</button>)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,300px),1fr))', gap: 18 }}>
                {shown.map((offer) => { const g = byId.get(offer.guide_id)!; const free = offer.access_model === 'free'; return <ProductCard key={offer.id} {...(reviewSummaries[offer.guide_id] || {})} kind={offer.kind} eyebrow={audienceLabel(g.social_links?.audience_details) || 'Everyone'} title={customerFacingOfferTitle(offer.title)} copy={(offer.description || '').split(' Delivery:')[0] || undefined} price={free ? 'Free' : offer.price_cents ? formatMoney(offer.price_cents / 100, offer.currency || 'GBP') : 'Paid'} name={g.display_name} avatarUrl={g.avatar_url} accent="#667245" cta={free ? 'Get it free' : 'View offer'} href={`/guardians/${encodeURIComponent(g.slug)}${free ? '#start' : '#offers'}`} />; })}
              </div>
              {!shown.length && <p style={{ color: muted }}>No offers match this filter yet.</p>}
            </div>
          </section>;
        })()}
        {!isSignedIn && <section id="guardian-apply" style={{ padding: 'clamp(70px,10vw,130px) clamp(20px,6vw,90px)', background: black }}><div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 'clamp(34px,7vw,100px)', alignItems: 'center' }}><div><span style={{ color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.15em' }}>BECOME A GUARDIAN</span><h2 style={{ fontFamily: serif, fontSize: 'clamp(48px,7vw,86px)', fontWeight: 300, lineHeight: .92, margin: '16px 0' }}>Build your place in the network.</h2><p style={{ color: muted, lineHeight: 1.65, maxWidth: 540 }}>Use your existing ROUTINE³ account or create one to build your Guardian profile and first Protocol.</p></div><AuthPanel bare /></div></section>}
      </main>
    </div>
  );
}

const SUPPORT_KINDS: GuideOffer['kind'][] = ['one_to_one_call', 'group_call', 'in_person', 'journey', 'festival', 'team_program'];

/** Default funnel order: the ramp's own order when published, else free → paid by price → personal support. */
function orderFunnelOffers(offers: GuideOffer[], ramp: GuideValueRamp | null): GuideOffer[] {
  if (ramp?.offer_ids?.length) {
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    const ordered = ramp.offer_ids.map((id) => byId.get(id)).filter(Boolean) as GuideOffer[];
    if (ordered.length) return ordered;
  }
  const rank = (offer: GuideOffer) => (offer.access_model === 'free' ? 0 : SUPPORT_KINDS.includes(offer.kind) ? 2 : 1);
  return [...offers].sort((a, b) => rank(a) - rank(b) || (a.price_cents || 0) - (b.price_cents || 0));
}

const CONSENT_TEXT = 'Send me occasional emails with new guidance and offers. Unsubscribe any time.';

// Real checkout on the public page: first paid offer takes the card with Stripe's Payment Element
// (saved for later with consent), then each following offer is a one-click upsell on that card.
// Stripe.js must load from js.stripe.com (Stripe's requirement), so no npm dependency is needed.
let stripeScript: Promise<any> | null = null;
function loadStripeJs(key: string): Promise<any> {
  stripeScript ??= new Promise((resolve, reject) => {
    if ((window as any).Stripe) return resolve((window as any).Stripe);
    const tag = document.createElement('script');
    tag.src = 'https://js.stripe.com/v3/'; tag.async = true;
    tag.onload = () => resolve((window as any).Stripe); tag.onerror = () => { stripeScript = null; reject(new Error('Could not load payments.')); };
    document.head.appendChild(tag);
  });
  return stripeScript.then((Stripe) => Stripe(key));
}
export function OfferCheckout({ offer, upsells, profile, accent, onClose, onFreshCheckout, reviews = [], videos = {} }: { offer: GuideOffer; upsells: GuideOffer[]; profile: GuideProfile; accent: string; onClose: () => void; onFreshCheckout?: (offer: GuideOffer) => void; reviews?: GuardianReview[]; videos?: Record<string, string> }) {
  const checkoutFormId = useId();
  const [recovery] = useState(() => readCheckoutSession(offer.id));
  const [stage, setStage] = useState<'details' | 'card' | 'paying' | 'pending' | 'upsell' | 'done'>(recovery ? 'pending' : 'details');
  const [email, setEmail] = useState(recovery?.email || '');
  const [name, setName] = useState(recovery?.name || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [purchaseId, setPurchaseId] = useState(recovery?.purchaseId || '');
  const [pendingUpsell, setPendingUpsell] = useState(recovery?.pendingUpsell);
  const [upsellFailed, setUpsellFailed] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [bought, setBought] = useState<string[]>(() => [offer, ...upsells].filter(item => recovery?.boughtOfferIds?.includes(item.id)).map(item => item.id));
  const [upsellIndex, setUpsellIndex] = useState(0);
  const [seconds, setSeconds] = useState(600);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const discountEndsAt = useRef(recovery?.discountEndsAt || 0);
  const remember = (id = purchaseId, pending: typeof pendingUpsell = undefined, boughtOfferIds = bought) => saveCheckoutSession({ offerId: offer.id, purchaseId: id, email, name, pendingUpsell: pending, boughtOfferIds, discountEndsAt: discountEndsAt.current });
  useEffect(() => { if (recovery) clearCheckoutReturnParameters(); }, [recovery]);
  const showPaymentForm = stage === 'card' || stage === 'paying';
  useEffect(() => {
    if (!showPaymentForm || !elementsRef.current || !mountRef.current) return;
    setCardReady(false);
    let disposed = false;
    const failed = () => {
      if (disposed) return;
      setCardReady(false);
      setMessage('The secure payment form could not load. Please check your connection or browser settings, then close checkout and try again. No payment has been submitted.');
    };
    const timeout = window.setTimeout(failed, 15000);
    const element = elementsRef.current.create('payment', { layout: 'tabs' });
    element.on('ready', () => {
      if (disposed) return;
      window.clearTimeout(timeout); setCardReady(true); setMessage('');
    });
    element.on('loaderror', () => { window.clearTimeout(timeout); failed(); });
    element.mount(mountRef.current);
    return () => { disposed = true; window.clearTimeout(timeout); element.destroy(); };
  }, [showPaymentForm]);
  const money = (cents: number, currency = offer.currency || 'GBP') => formatMoney(cents / 100, currency);
  const upsell = upsells[upsellIndex];
  useEffect(() => { if (stage !== 'upsell') return; const update = () => setSeconds(Math.max(0, Math.floor((discountEndsAt.current - Date.now()) / 1000))); update(); const t = window.setInterval(update, 1000); return () => window.clearInterval(t); }, [stage]);
  async function authenticate(clientSecret: string) {
    if (!stripeRef.current) {
      const config = getGuardianStripeConfiguration();
      if (!config.enabled || !config.publishableKey) throw new Error('Checkout is unavailable.');
      stripeRef.current = await loadStripeJs(config.publishableKey);
    }
    const { error } = await stripeRef.current.handleNextAction({ clientSecret });
    if (error) throw new Error(error.message || 'Payment authentication was not completed.');
  }
  async function start(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const config = getGuardianStripeConfiguration();
      if (!config.enabled || !config.publishableKey) throw new Error(config.error || 'Checkout is unavailable.');
      const stripe = await loadStripeJs(config.publishableKey);
      if (!stripe) throw new Error('Could not load payments.');
      const intent = await createOfferPayment(offer.id, email, name);
      setPurchaseId(intent.purchase_id);
      remember(intent.purchase_id);
      stripeRef.current = stripe;
      elementsRef.current = stripe.elements({ clientSecret: intent.client_secret!, appearance: { theme: 'stripe', variables: { colorPrimary: '#111827', colorBackground: '#F6F8FA', colorText: '#111827', borderRadius: '12px', fontFamily: 'Poppins, Inter, system-ui, sans-serif' } }, fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap' }] });
      setStage('card');
    } catch (err: any) { setMessage(err?.message || 'Could not start checkout.'); }
    finally { setBusy(false); }
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!cardReady || stage !== 'card') return;
    setStage('paying'); setMessage('');
    try {
      const { error, paymentIntent } = await stripeRef.current.confirmPayment({ elements: elementsRef.current, redirect: 'if_required', confirmParams: { return_url: checkoutReturnUrl(offer.id), receipt_email: email } });
      if (error) { setMessage(error.message || 'Payment failed.'); setStage('card'); return; }
      if (paymentIntent?.status === 'succeeded') await verifyPurchase();
      else { setMessage('Payment is processing. Check its status before attempting another payment.'); setStage('pending'); }
    } catch { setMessage('Payment status could not be verified. Check its status before attempting another payment.'); setStage('pending'); }
  }
  async function verifyPurchase() {
    setBusy(true); setMessage('');
    try {
      let result = pendingUpsell && !pendingUpsell.purchaseId
        ? await recoverUpsellPayment(purchaseId, pendingUpsell.offerId)
        : await confirmOfferPayment(pendingUpsell?.purchaseId || purchaseId);
      if (pendingUpsell && result.status === 'requires_action') {
        const existing = await recoverUpsellPayment(purchaseId, pendingUpsell.offerId);
        if (existing.client_secret) {
          await authenticate(existing.client_secret);
          result = await confirmOfferPayment(existing.purchase_id);
        }
      }
      if (result.status === 'paid') {
        if (pendingUpsell) {
          const index = upsells.findIndex(item => item.id === pendingUpsell.offerId);
          const item = upsells[index];
          if (!item) throw new Error('The follow-on offer is no longer available.');
          setBought(current => current.includes(item.id) ? current : [...current, item.id]);
          setPendingUpsell(undefined);
          const ids = [...new Set([...bought, item.id])];
          remember(purchaseId, undefined, ids);
          if (index + 1 < upsells.length) { setUpsellIndex(index + 1); setStage('upsell'); }
          else { clearCheckoutSession(); setStage('done'); }
          return;
        }
        setBought(current => current.includes(offer.id) ? current : [offer.id, ...current]);
        discountEndsAt.current = 'discount_ends_at' in result && typeof result.discount_ends_at === 'number' ? result.discount_ends_at : 0;
        setSeconds(Math.max(0, Math.floor((discountEndsAt.current - Date.now()) / 1000)));
        const purchasedIds = [...new Set([offer.id, ...bought])];
        remember(purchaseId, undefined, purchasedIds);
        const next = upsells.findIndex(item => !purchasedIds.includes(item.id));
        if (next < 0) { clearCheckoutSession(); setStage('done'); }
        else { setUpsellIndex(next); setStage('upsell'); }
      } else if (result.status === 'failed') {
        if (pendingUpsell) {
          setUpsellFailed(true); setMessage('The follow-on payment was not completed. Your original order is confirmed. You can finish here or start a separate checkout at the listed price with another payment method.'); setStage('pending');
        } else {
          setMessage('Payment was not completed. Please check your payment method and try again.');
          if (!elementsRef.current) { clearCheckoutSession(); setStage('details'); } else setStage('card');
        }
      } else { setMessage('Payment is processing. Check its status before attempting another payment.'); setStage('pending'); }
    } catch { setMessage('Order confirmation is unavailable. Check payment status before attempting another payment.'); setStage('pending'); }
    finally { setBusy(false); }
  }
  async function acceptUpsell() {
    if (!upsell) return; setBusy(true); setMessage('');
    const unresolved = { purchaseId: '', offerId: upsell.id };
    setPendingUpsell(unresolved); remember(purchaseId, unresolved);
    try {
      let result = await buyUpsellOneClick(purchaseId, upsell.id, upsellPrice);
      const pending = { purchaseId: result.purchase_id, offerId: upsell.id };
      setPendingUpsell(pending); remember(purchaseId, pending);
      if (result.status === 'requires_action' && result.client_secret) {
        await authenticate(result.client_secret);
        result = { ...result, status: (await confirmOfferPayment(result.purchase_id)).status };
      }
      if (result.status !== 'paid') { setUpsellFailed(result.status === 'failed'); setMessage(result.status === 'failed' ? 'The follow-on payment was not completed. Your original order is confirmed. Start a separate checkout at the listed price to use another method.' : 'Payment is processing. Check its status before attempting another payment.'); setStage('pending'); return; }
      setPendingUpsell(undefined);
      setBought((current) => current.includes(upsell.id) ? current : [...current, upsell.id]);
      remember(purchaseId, undefined, [...new Set([...bought, upsell.id])]);
      nextUpsell();
    } catch (err: any) {
      setMessage(err?.message || 'Payment status could not be verified. Check its status before attempting another payment.');
      if (err?.message?.includes('Offer price changed')) { setPendingUpsell(undefined); remember(purchaseId); discountEndsAt.current = 0; setSeconds(0); setStage('upsell'); }
      else setStage('pending');
    }
    finally { setBusy(false); }
  }
  const nextUpsell = () => { if (upsellIndex + 1 < upsells.length) setUpsellIndex(upsellIndex + 1); else { clearCheckoutSession(); setStage('done'); } };
  // Same look as the ROUTINE³ app's sign-up and paywall screens (see APP tokens).
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 56, border: `1px solid ${APP.border}`, borderRadius: 12, padding: '0 16px', fontFamily: APP.font, fontSize: 16, background: APP.alt, color: APP.text, outline: 'none' };
  const code = `${(profile.display_name.split(' ')[0] || 'Guardian').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10)}30`;
  const legal = <p style={{ color: APP.muted, fontSize: 11, margin: '10px 0 0', textAlign: 'center' }}>Payments are processed securely by Stripe. By paying you agree to the <span style={{ color: '#0EA5E9' }}>Terms</span> and <span style={{ color: '#0EA5E9' }}>Privacy Policy</span>.</p>;
  const upsellPrice = upsell ? (seconds ? Math.round(upsell.price_cents * (1 - COUPON_RATE)) : upsell.price_cents) : 0;
  const footer = stage === 'pending' ? <div style={{ display: 'grid', gap: 8 }}><button type="button" disabled={busy} onClick={verifyPurchase} style={appButton}>{busy ? 'Checking…' : 'Check payment status'}</button>{upsellFailed && pendingUpsell && onFreshCheckout && <button type="button" onClick={() => { const item = upsells.find(entry => entry.id === pendingUpsell.offerId); if (item) { clearCheckoutSession(); onFreshCheckout(item); } }} style={appButton}>Use another payment method · listed price</button>}</div>
    : stage === 'done' ? <button type="button" onClick={onClose} style={appButton}>Done</button>
    : stage === 'upsell' ? <button type="button" disabled={busy} onClick={acceptUpsell} style={{ ...appButton, opacity: busy ? .6 : 1 }}>{busy ? 'Adding…' : seconds ? 'Get limited offer' : 'Get it now'}</button>
    : <button form={checkoutFormId} disabled={stage === 'details' ? busy : stage === 'paying' || !cardReady} style={{ ...appButton, opacity: (busy || stage === 'paying' || (stage === 'card' && !cardReady)) ? .6 : 1 }}>{stage === 'details' ? busy ? 'Loading…' : 'Continue to payment' : stage === 'paying' ? 'Paying…' : `Pay ${money(offer.price_cents)}`}</button>;
  return <GuardianModal label="Checkout" onClose={stage === 'upsell' ? nextUpsell : onClose} header={<span style={{ fontSize: 12 }}>Secure checkout</span>} footer={footer} panelStyle={{ background: APP.bg, color: APP.text, fontFamily: APP.font, textAlign: 'center' }} bodyStyle={{ padding: 0 }} footerStyle={{ borderColor: APP.border }}>
      {stage === 'upsell' && upsell ? <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {videos[upsell.kind] && <video src={videos[upsell.kind]} controls playsInline style={{ flex: '1 1 100%', width: '100%', aspectRatio: '16 / 9', maxHeight: 380, objectFit: 'cover', background: '#111827' }} />}
        <div style={{ flex: '1 1 100%', background: seconds ? APP.greenSoft : APP.alt, color: '#000', padding: '10px 48px 10px 16px', fontSize: 12, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Clock size={14} strokeWidth={2.4} />{seconds ? <>30% off · ends in {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')} · code {code} applied</> : 'Offer ended'}</div>
        {/* Wide like the builder's upsell: offer on the left, price on top and CTA pinned to the bottom of the right panel. */}
        <div style={{ flex: '1 1 340px', minWidth: 0, padding: '56px 28px 28px', display: 'grid', alignContent: 'start', justifyItems: 'start', textAlign: 'left' }}>
          <AppOfferImage kind={upsell.kind} size={110} align="left" />
          <div style={{ margin: '12px 0 2px' }}><OfferFormatTag kind={upsell.kind} /></div>
          <h2 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 700, lineHeight: '34px', letterSpacing: -0.8, margin: '14px 0 8px' }}>{upsell.title}</h2>
          <p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, lineHeight: '19px', margin: 0 }}>{upsell.description || 'The next step in your journey.'}</p>
        </div>
        <div {...tiltHandlers(6)} style={tiltStyle({ flex: '1 1 320px', minWidth: 0, margin: 16, alignSelf: 'stretch', justifyContent: 'center', padding: '44px 22px 22px', background: APP.surface, borderRadius: 16, boxShadow: '0 2px 8px rgba(17,24,39,.08)', display: 'flex', flexDirection: 'column', gap: 14 })}><GlowLayer />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, padding: '6px 0 4px' }}>
            {seconds > 0 && <span style={{ color: APP.faint, fontSize: 20, fontWeight: 500, textDecoration: 'line-through' }}>{money(upsell.price_cents, upsell.currency)}</span>}
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.8 }}>{money(upsellPrice, upsell.currency)}</span>
          </div>
        </div>
      {reviews.length > 0 && <div style={{ flex: '1 1 calc(100% - 32px)', minWidth: 0, textAlign: 'left', margin: '0 16px', padding: '16px 0 18px', borderTop: `1px solid ${APP.border}` }}><ReviewRail reviews={reviews} accent={APP.greenDark} /></div>}
      </div> : stage === 'pending' ? <div style={{ padding: '48px 24px 26px' }}>
        <h2 style={{ fontFamily: APP.font, fontSize: 26, margin: '0 0 12px' }}>Payment confirmation pending</h2>
        <p style={{ color: APP.muted }}>{pendingUpsell ? 'Your original order is confirmed. The follow-on payment is not confirmed yet.' : 'Your order is not confirmed yet.'} Checking status will not charge you again.</p>
      </div> : stage === 'done' ? <div style={{ padding: '48px 24px 26px' }}>
        <span style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={26} /></span>
        <h2 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 600, margin: '0 0 4px' }}>You’re all set!</h2>
        <p style={{ color: APP.muted, fontSize: 16, fontWeight: 600, margin: '0 0 18px', overflowWrap: 'anywhere' }}>{message || `Payment confirmed for ${email}`}</p>
        <div style={{ background: APP.surface, border: `1px solid ${APP.border}`, borderRadius: 12, padding: '6px 16px', textAlign: 'left', marginBottom: 18 }}>{bought.map((id) => <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontSize: 15, fontWeight: 600 }}><span style={{ width: 22, height: 22, flex: '0 0 22px', borderRadius: '50%', border: '1.5px solid #262626', display: 'grid', placeItems: 'center' }}><Check size={13} strokeWidth={2.5} /></span>{[offer, ...upsells].find(item => item.id === id)?.title}</div>)}</div>
      </div> : <div style={{ padding: '44px 24px 24px' }}>
        <AppOfferImage kind={offer.kind} size={80} />
        <div style={{ margin: '12px 0 2px' }}><OfferFormatTag kind={offer.kind} /></div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>{profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: APP.border, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{(profile.display_name || 'G')[0]}</span>}<span style={{ color: APP.muted, fontSize: 13, fontWeight: 500 }}>{profile.display_name}</span></span>
        <h2 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 600, lineHeight: '34px', letterSpacing: -0.5, margin: '0 0 4px' }}>{offer.title}</h2>
        <p style={{ color: APP.muted, fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>{money(offer.price_cents)} · secure checkout</p>
        {stage === 'details' ? <form id={checkoutFormId} onSubmit={start} style={{ display: 'grid', gap: 0, textAlign: 'left' }}>
          <input required placeholder="First name" aria-label="First name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, borderRadius: '12px 12px 0 0' }} />
          <input required type="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...field, borderRadius: '0 0 12px 12px', marginTop: -1 }} />
        </form> : <form id={checkoutFormId} onSubmit={pay} style={{ display: 'grid', gap: 12, textAlign: 'left' }}>
          <div ref={mountRef} style={{ background: APP.surface, border: `1px solid ${APP.border}`, borderRadius: 12, padding: 14 }} />
          {!cardReady && !message && <p role="status">Loading secure payment form…</p>}
          <span style={{ color: APP.muted, fontSize: 11, lineHeight: 1.5 }}>Where supported, Stripe saves your payment method securely for follow-on offers.</span>
        </form>}
        {legal}
      </div>}
      {message && stage !== 'done' && <p role="alert" style={{ color: '#EF4444', fontSize: 12, margin: '0 20px 16px', textAlign: 'left' }}>{message}</p>}
  </GuardianModal>;
}
function GuardianFunnel({ profile, offers, ramp, accent, headingFont, reviews = [], headlineStyle = 'editorial' }: { headlineStyle?: HeadlineStyle; reviews?: GuardianReview[]; profile: GuideProfile; offers: GuideOffer[]; ramp: GuideValueRamp | null; accent: string; headingFont: string }) {
  const ordered = orderFunnelOffers(offers, ramp);
  const entry = ordered.find((offer) => offer.access_model === 'free') || null;
  const nextPaid = ordered.find((offer) => offer.access_model === 'paid' && !SUPPORT_KINDS.includes(offer.kind)) || null;
  const support = ordered.find((offer) => SUPPORT_KINDS.includes(offer.kind)) || null;
  const [form, setForm] = useState({ name: '', email: '', goal: '', consent: false });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [checkoutOffer, setCheckoutOffer] = useState<GuideOffer | null>(null);
  useEffect(() => {
    const returnedOffer = new URL(window.location.href).searchParams.get('guardian_checkout');
    if (!returnedOffer) return;
    const returned = offers.find(item => item.id === returnedOffer && item.access_model === 'paid' && item.status === 'published');
    if (returned && readCheckoutSession(returned.id)) setCheckoutOffer(returned);
    else clearCheckoutReturnParameters();
  }, [offers]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  // Uploaded files live in a private bucket: ask guardian-files for a 1-hour link after opt-in.
  async function downloadEntryFile() {
    if (!entry?.file_path) return;
    if (/^https?:\/\//.test(entry.file_path)) { window.open(entry.file_path, '_blank', 'noopener'); return; }
    const tab = window.open('', '_blank'); // open now so popup blockers allow it, then point it at the file
    setDownloading(true); setDownloadError('');
    try { const url = await getFreeOfferDownload(entry.id, form.email); if (tab) tab.location.href = url; else window.location.href = url; }
    catch (err: any) { tab?.close(); setDownloadError(err?.message || 'Could not prepare the download.'); }
    finally { setDownloading(false); }
  }
  const stripeConfig = getGuardianStripeConfiguration();
  // The environment must pass validation and the release hold before opening Stripe checkout.
  const sellsHere = (offer: GuideOffer) => stripeConfig.enabled && offer.access_model === 'paid' && offer.price_cents > 0 && !offer.booking_url;
  const openOffer = (offer: GuideOffer) => (event: React.MouseEvent) => { if (sellsHere(offer)) { event.preventDefault(); setCheckoutOffer(offer); } };
  const paidAfter = (offer: GuideOffer) => ordered.slice(ordered.indexOf(offer) + 1).filter(sellsHere);
  const price = (offer: GuideOffer) => offer.access_model === 'free' ? 'Free' : offer.price_cents ? formatMoney(offer.price_cents / 100, offer.currency || 'GBP') : 'Enquire';
  const offerHref = (offer: GuideOffer) => offer.booking_url || offer.affiliate_url || '#start';
  async function optIn(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      await submitGuardianOptIn(profile.user_id, { name: form.name, email: form.email, goal: form.goal || null, marketingConsent: form.consent, consentText: CONSENT_TEXT, sourceOfferId: entry?.id, valueRampId: ramp?.id });
      setState('done');
    } catch {
      setState('error');
    }
  }
  const eyebrow: React.CSSProperties = { color: accent, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 46, border: '1px solid #11120F', borderRadius: 2, padding: '0 14px', fontFamily: 'inherit', fontSize: 14, background: '#FFF', color: '#11120F', outline: 'none' };
  const solid: React.CSSProperties = { minHeight: 46, border: '1px solid #11120F', borderRadius: 2, background: '#11120F', color: '#FFF', padding: '0 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', cursor: 'pointer' };
  const steps = [entry, nextPaid, support].filter(Boolean) as GuideOffer[];
  // Pitch videos saved by the builder in social_links.offer_videos ('free' = lead magnet).
  const offerVideos = (() => { try { return JSON.parse(String((profile.social_links as Record<string, unknown> | null)?.offer_videos || '{}')) as Record<string, string>; } catch { return {} as Record<string, string>; } })();
  const leadVideo = offerVideos.free || '';
  return <>
    {checkoutOffer && <OfferCheckout key={checkoutOffer.id} offer={checkoutOffer} upsells={paidAfter(checkoutOffer)} profile={profile} accent={accent} reviews={reviews} videos={offerVideos} onFreshCheckout={setCheckoutOffer} onClose={() => setCheckoutOffer(null)} />}
    {!stripeConfig.enabled && ordered.some(offer => offer.access_model === 'paid' && offer.price_cents > 0 && !offer.booking_url) && <p role="status" style={{ padding: '16px 24px', textAlign: 'center', color: accent }}>{stripeConfig.error}</p>}
    {steps.length > 0 && <section id="offers" style={{ padding: `clamp(60px,9vw,120px) ${PAGE_X}`, borderTop: '1px solid rgba(17,18,15,.2)' }}>
      {/* App-style heading (Poppins, like the ROUTINE³ paywall): green label, bold title, muted subtitle. */}
      <div style={{ fontFamily: APP.font, textAlign: 'center', margin: '0 auto 28px', maxWidth: 640 }}>
        <span style={{ display: 'block', color: APP.greenDark, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{ramp?.problem ? ramp.problem : `Work with ${profile.display_name}`}</span>
        <h2 style={{ ...HEADLINE_STYLES[headlineStyle].section, margin: '0 0 8px' }}>Your path, step by step{headlineStyle === 'editorial' ? '.' : ''}</h2>
        <p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, margin: 0 }}>Start free, then go deeper when you’re ready.</p>
      </div>
      {/* Same app-style offer cards as the hero, one per step of the path. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),360px))', justifyContent: 'center', gap: 18 }}>
        {steps.map((offer, index) => { const free = index === 0 && offer.access_model === 'free'; return <ProductCard key={offer.id} {...reviewStats(reviews)} audience={audienceLabel(profile.social_links?.audience_details)} kind={offer.kind} eyebrow={`Step ${index + 1} · ${free ? 'Start free' : SUPPORT_KINDS.includes(offer.kind) ? 'Personal support' : 'Go deeper'}`} title={customerFacingOfferTitle(offer.title)} copy={offer.description || 'The next step in your journey.'} price={price(offer)} name={profile.display_name} avatarUrl={profile.avatar_url} accent={accent} cta={free ? 'Get it free' : sellsHere(offer) ? 'Get it now' : 'See what is included'} href={free ? '#start' : offerHref(offer)} onClick={free ? () => document.getElementById('start')?.scrollIntoView({ behavior: 'smooth' }) : sellsHere(offer) ? () => setCheckoutOffer(offer) : undefined} />; })}
      </div>
    </section>}
    {entry && <section id="start" style={{ padding: `clamp(60px,9vw,120px) ${PAGE_X}` }}>
      {/* Same wide ROUTINE³ app-style card as the builder's sign-up preview: offer left, form in a white panel right. */}
      <div {...tiltHandlers(3)} style={tiltStyle({ position: 'relative', maxWidth: 880, margin: '0 auto', background: APP.bg, color: APP.text, fontFamily: APP.font, borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 50px rgba(17,24,39,.14)', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' })}><GlowLayer />
        <span style={{ position: 'absolute', zIndex: 2, top: 16, left: 16, background: '#000', color: '#FFF', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600, letterSpacing: .5 }}>FREE</span>
        <div style={{ flex: '1 1 340px', minWidth: 0, padding: '56px 28px 28px', display: 'grid', alignContent: 'start', justifyItems: 'start', textAlign: 'left' }}>
          {leadVideo && state !== 'done' ? <video src={leadVideo} controls playsInline style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', background: '#000', borderRadius: 12, marginBottom: 12 }} /> : <AppOfferImage kind={entry.kind} size={110} align="left" />}
          <div style={{ margin: '12px 0 2px' }}><OfferFormatTag kind={entry.kind} /></div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>{profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: APP.border, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{(profile.display_name || 'G')[0]}</span>}<span style={{ color: APP.muted, fontSize: 13, fontWeight: 500 }}>{profile.display_name}</span></span>
          <h2 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 600, lineHeight: '34px', letterSpacing: -0.5, margin: '0 0 6px' }}>{state === 'done' ? 'You’re in!' : entry.title}</h2>
          <p style={{ color: APP.muted, fontSize: 16, fontWeight: 600, lineHeight: 1.45, margin: 0 }}>{state === 'done' ? `${entry.title} runs as a daily routine in the ROUTINE³ app, with reminders, so you keep going.` : entry.description || 'Get the guide and the interactive routine that goes with it.'}</p>
        </div>
        <div {...tiltHandlers(6)} style={tiltStyle({ flex: '1 1 320px', minWidth: 0, margin: 16, alignSelf: 'stretch', justifyContent: 'center', padding: '24px 22px 20px', background: APP.surface, borderRadius: 16, boxShadow: '0 2px 8px rgba(17,24,39,.08)', display: 'flex', flexDirection: 'column', gap: 12 })}><GlowLayer />
          {state === 'done' ? <>
            {!nextPaid && <span style={{ width: 52, height: 52, margin: '0 auto 4px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={24} /></span>}
            {nextPaid && <div style={{ border: `2px solid ${APP.green}`, borderRadius: 12, overflow: 'hidden', textAlign: 'center' }}>
              <div style={{ background: APP.greenSoft, color: '#000', padding: '7px 0', fontSize: 11, fontWeight: 600, letterSpacing: .5, textTransform: 'uppercase' }}>Ready to go further? · {price(nextPaid)}</div>
              <div style={{ padding: '12px 14px 14px' }}>
                <strong style={{ display: 'block', fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>{nextPaid.title}</strong>
                <p style={{ color: APP.muted, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>{nextPaid.description || 'The complete programme, step by step.'}</p>
                <a href={offerHref(nextPaid)} onClick={openOffer(nextPaid)} style={{ ...appButton, minHeight: 48, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>See what is included</a>
              </div>
            </div>}
          </> : <form onSubmit={optIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: APP.text, fontSize: 18, fontWeight: 600, margin: '0 0 2px', textAlign: 'center' }}>Enter your email to get it free</p>
            <div>
              <input required placeholder="First name" aria-label="First name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 56, border: `1px solid ${APP.border}`, borderRadius: '12px 12px 0 0', padding: '0 16px', fontFamily: APP.font, fontSize: 16, background: APP.alt, color: APP.text, outline: 'none' }} />
              <label style={{ display: 'flex', alignItems: 'center', height: 56, marginTop: -1, padding: '0 16px', background: APP.alt, border: `1px solid ${APP.border}`, borderRadius: '0 0 12px 12px', boxSizing: 'border-box' }}><Mail size={18} color={APP.muted} style={{ marginRight: 12, flex: '0 0 auto' }} /><input required type="email" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontFamily: APP.font, fontSize: 16, color: APP.text }} /></label>
            </div>
            <div role="radiogroup" aria-label="Main goal (optional)" style={{ display: 'flex', gap: 8 }}>
              {['Health', 'Beauty', 'Fitness'].map((goal) => <button type="button" key={goal} role="radio" aria-checked={form.goal === goal} onClick={() => setForm({ ...form, goal: form.goal === goal ? '' : goal })} style={{ flex: 1, height: 40, border: `1px solid ${form.goal === goal ? APP.green : APP.border}`, borderRadius: 12, background: form.goal === goal ? APP.greenSoft : APP.alt, color: APP.text, fontFamily: APP.font, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{goal}</button>)}
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: APP.muted, cursor: 'pointer', textAlign: 'left' }}><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} style={{ width: 20, height: 20, flex: '0 0 20px', margin: 0, accentColor: '#22C55E' }} />{CONSENT_TEXT}</label>
            {state === 'error' && <p role="alert" style={{ color: '#EF4444', fontSize: 12, margin: 0 }}>We could not sign you up just now. Please try again.</p>}
            <button disabled={state === 'sending'} style={{ ...appButton, borderRadius: 12, background: APP.text, fontSize: 16, fontWeight: 600, opacity: state === 'sending' ? .6 : 1 }}>{state === 'sending' ? 'Sending…' : 'Get free access'}</button>
            <p style={{ fontSize: 11, color: APP.muted, margin: 0, textAlign: 'center' }}>We use your email to send your access. Marketing emails only if you tick the box.</p>
          </form>}
        </div>
      </div>
      {/* Delivery card, same as the builder preview: status left, ways to open it right. */}
      {state === 'done' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', maxWidth: 880, margin: '16px auto 0', boxSizing: 'border-box', padding: '16px 18px', background: APP.surface, border: `1px solid ${APP.border}`, borderRadius: 16, fontFamily: APP.font, color: APP.text }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}><span style={{ width: 32, height: 32, flex: '0 0 32px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={16} strokeWidth={2.5} /></span><span style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{entry.title} is ready</strong><span style={{ color: APP.muted, fontSize: 12 }}>Sent to {form.email}</span></span></span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entry.file_path && <button type="button" onClick={downloadEntryFile} disabled={downloading} style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.alt, color: APP.text }}><Download size={16} />{downloading ? 'Preparing…' : 'PDF'}</button>}
          <a href={entry.booking_url || APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Open in ROUTINE³" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.alt, color: APP.text }}>Open in <RoutineMark size={20} textColor="#111827" hairline="#111827" suffix="" /></a>
        </span>
      </div>}
      {downloadError && <p role="alert" style={{ maxWidth: 880, margin: '8px auto 0', color: '#EF4444', fontFamily: APP.font, fontSize: 12 }}>{downloadError}</p>}
      {reviews.length > 0 && <div style={{ maxWidth: 880, margin: '24px auto 0', paddingTop: 20, borderTop: '1px solid rgba(17,24,39,.14)' }}><ReviewRail reviews={reviews} accent={APP.greenDark} /></div>}
    </section>}
    <footer style={{ padding: `28px ${PAGE_X}`, borderTop: '1px solid rgba(17,18,15,.2)', color: '#66645F', fontSize: 11, lineHeight: 1.6 }}>
      {profile.display_name} shares general wellbeing guidance, not medical advice. Speak to your GP or doctor before changing medication, diet or exercise, and about any health concern. Individual results vary.
    </footer>
  </>;
}

type SiteHeroCard = { key: string; eyebrow?: string; title: string; copy?: string; href?: string; onClick?: () => void; kind?: string; price?: string };
const productArt = (kind?: string): TagArt | undefined => kind ? (offerTypeArt as Record<string, TagArt>)[kind] || (freeOfferArt as Record<string, TagArt>)[kind] : undefined;
// Light version of the dashboard offer card (art, author, title, value stars, price) for the public site and funnel.
// Review stats for offer cards: average + count of published reviews, or nothing when there are none.
const reviewStats = (reviews: GuardianReview[]) => { const live = reviews.filter((r) => r.status === 'published'); return live.length ? { rating: live.reduce((sum, r) => sum + r.rating, 0) / live.length, reviewCount: live.length } : {}; };
function ProductCard({ kind, eyebrow, title, copy, price, name, avatarUrl, accent, cta = 'View', href, onClick, rating, reviewCount = 0, audience, imageUrl }: { imageUrl?: string | null; audience?: string; rating?: number; reviewCount?: number; kind?: string; eyebrow?: string; title: string; copy?: string; price?: string; name: string; avatarUrl?: string | null; accent: string; cta?: string; href?: string; onClick?: () => void }) {
  const art = productArt(kind);
  const stars = kind && kind in offerValueScores ? offerValueScores[kind as UpsellKind] : 2;
  // Self-contained tilt + cursor glow so it works on the public page too (no parent handler there).
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50, on: false });
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const b = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - b.left) / b.width; const y = (event.clientY - b.top) / b.height;
    setTilt({ x: (.5 - y) * 8, y: (x - .5) * 10, gx: x * 100, gy: y * 100, on: true });
  };
  // App-style offer card (matches the sign-up/upsell pages): image, format tag, Guardian, title, value, stars, black CTA.
  return <div onPointerMove={move} onPointerLeave={() => setTilt({ x: 0, y: 0, gx: 50, gy: 50, on: false })} style={{ position: 'relative', overflow: 'hidden', textAlign: 'left', fontFamily: APP.font, color: APP.text, background: APP.bg, border: `1px solid ${tilt.on ? APP.green : APP.border}`, borderRadius: 20, boxShadow: tilt.on ? '0 22px 50px rgba(17,24,39,.2)' : '0 14px 36px rgba(17,24,39,.12)', transform: `perspective(900px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)${tilt.on ? ' translateY(-2px)' : ''}`, transition: tilt.on ? 'box-shadow 180ms ease, border-color 180ms ease' : 'transform 260ms ease, box-shadow 220ms ease, border-color 220ms ease', willChange: 'transform', display: 'flex', flexDirection: 'column' }}>
    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', opacity: tilt.on ? 1 : 0, transition: 'opacity 200ms ease', background: `radial-gradient(260px circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,.55), transparent 70%)`, mixBlendMode: 'soft-light' }} />
    {price && <span style={{ position: 'absolute', zIndex: 2, top: 14, left: 14, background: '#000', color: '#FFF', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600, letterSpacing: .5, textTransform: 'uppercase' }}>{price}</span>}
    {/* Format and audience tags sit in the top-right corner, opposite the price badge. */}
    <div style={{ position: 'absolute', zIndex: 2, top: 14, right: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: '62%' }}>
      <OfferFormatTag kind={kind} />
      {audience && <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 999, background: APP.surface, border: `1px solid ${APP.border}`, color: APP.text, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{audience}</span>}
    </div>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: `${audience ? 76 : 50}px 18px 6px` }}>
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" style={{ width: 84, height: 84, borderRadius: 16, objectFit: 'cover', display: 'block' }} /> : <AppOfferImage kind={kind} size={84} align="left" />}
    </div>
    <div style={{ padding: '10px 18px 0' }}>
      {eyebrow && <span style={{ display: 'block', color: APP.greenDark, fontSize: 11, fontWeight: 600, letterSpacing: .5, textTransform: 'uppercase', marginBottom: 4 }}>{eyebrow}</span>}
      <strong style={{ display: 'block', fontSize: 20, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.3 }}>{title}</strong>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 6 }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 22, height: 22, borderRadius: '50%', background: APP.border, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 600 }}>{(name || 'G')[0]}</span>}<span style={{ color: APP.muted, fontSize: 12, fontWeight: 500 }}>{name}</span></span>
      {copy && <span style={{ display: 'block', color: APP.muted, fontSize: 13, fontWeight: 500, lineHeight: 1.5, marginTop: 6 }}>{copy}</span>}
      {reviewCount > 0 && rating ? <span aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}><span aria-hidden="true" style={{ fontSize: 13, letterSpacing: 1 }}>{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ color: i < Math.round(rating) ? APP.greenDark : APP.border }}>★</span>)}</span><span style={{ color: APP.text, fontSize: 12, fontWeight: 600 }}>{rating.toFixed(1)}</span><span style={{ color: APP.muted, fontSize: 11, fontWeight: 500 }}>({reviewCount})</span></span> : null}
    </div>
    <div style={{ marginTop: 'auto', marginRight: 14, marginBottom: 14, marginLeft: 14, paddingTop: 0 }} /><div style={{ margin: '0 14px 14px', padding: 12, background: APP.surface, borderRadius: 14, boxShadow: '0 2px 8px rgba(17,24,39,.06)' }}>
      <a href={href || '#'} onClick={onClick ? (event) => { event.preventDefault(); onClick(); } : undefined} style={{ ...appButton, minHeight: 50, borderRadius: 12, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>{cta === 'View' ? (price === 'Free' ? 'Get it free' : 'View offer') : cta}</a>
    </div>
  </div>;
}

/** Guardian profile hero, shared by the published mini-site and the builder preview so both are identical. */
// Public page gutter: lines every section up with the hero's 1240px inner container.
const PAGE_X = 'max(clamp(24px,6vw,84px), calc((100% - 1240px) / 2 + clamp(24px,6vw,84px)))';
// Three headline styles a Guardian can pick for their site (saved as social_links.theme_headline_style).
type HeadlineStyle = 'editorial' | 'app' | 'statement';
const HEADLINE_STYLES: Record<HeadlineStyle, { label: string; hero: React.CSSProperties; section: React.CSSProperties; stripStop?: boolean }> = {
  editorial: { label: 'Editorial serif', hero: { fontFamily: serif, fontWeight: 300, fontSize: 'clamp(46px,7cqw,96px)', lineHeight: .95, letterSpacing: '-.035em', color: '#11120F' }, section: { fontFamily: serif, fontWeight: 300, fontSize: 'clamp(36px,5vw,58px)', lineHeight: 1, letterSpacing: '-.02em', color: '#11120F' } },
  app: { label: 'App bold', stripStop: true, hero: { fontFamily: "'Poppins', 'Inter', sans-serif", fontWeight: 700, fontSize: 'clamp(36px,5.2cqw,60px)', lineHeight: 1.08, letterSpacing: '-.03em', color: '#111827' }, section: { fontFamily: "'Poppins', 'Inter', sans-serif", fontWeight: 700, fontSize: 'clamp(28px,4vw,36px)', lineHeight: 1.2, letterSpacing: -0.8, color: '#111827' } },
  statement: { label: 'Statement caps', stripStop: true, hero: { fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 700, fontSize: 'clamp(34px,5cqw,64px)', lineHeight: 1, letterSpacing: '.02em', textTransform: 'uppercase', color: '#11120F' }, section: { fontFamily: '"Archivo", "Inter", sans-serif', fontWeight: 700, fontSize: 'clamp(24px,3.4vw,34px)', lineHeight: 1.1, letterSpacing: '.04em', textTransform: 'uppercase', color: '#11120F' } },
};
const headlineStyleOf = (value?: string | null): HeadlineStyle => value === 'app' || value === 'statement' ? value : 'editorial';
// ROUTINE³ iOS app look (mobile repo: Paywall.tsx, SignUpScreen.tsx, designTokens.ts) for the sign-up and upsell pages.
const APP = { bg: '#F2F4F7', surface: '#FFFFFF', alt: '#F6F8FA', text: '#111827', muted: '#6B7280', faint: '#9CA3AF', border: '#E5E7EB', green: '#10B981', greenDark: '#047857', greenSoft: '#86EFAC', font: "'Poppins', 'Inter', sans-serif" };
const appButton: React.CSSProperties = { width: '100%', minHeight: 56, border: 0, borderRadius: 16, background: '#000', color: '#FFF', fontFamily: APP.font, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: '8px 16px', boxSizing: 'border-box' };
// Format tag for Protocol offers: printable PDF plus the interactive version in the ROUTINE³ app.
const ProtocolFormatTag = () => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: APP.text, fontFamily: APP.font, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 18, padding: '0 8px', border: '1px solid #111827', borderRadius: 2, fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', boxSizing: 'border-box' }}><FileText size={11} />PDF</span><span aria-hidden="true" style={{ color: APP.muted }}>+</span><RoutineMark size={18} textColor="#111827" hairline="#111827" suffix="" /></span>;
const isProtocolKind = (kind?: string) => kind === 'routine' || kind === 'routine_guidance';
// Every offer gets a format tag: app-delivered plans are PDF + ROUTINE³, others name their format.
const APP_PLAN_KINDS = ['routine', 'routine_guidance', 'program', 'journey', 'team_program', 'lead_magnet'];
const boxTag: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 18, padding: '0 8px', border: '1px solid #111827', borderRadius: 2, fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', boxSizing: 'border-box', color: '#111827', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const OTHER_FORMATS: Record<string, string> = { lead: 'Lead', ebook: 'PDF', recipe_book: 'PDF', one_to_one_call: '1:1 call', group_call: 'Group call', in_person: 'In person', festival: 'Event', product: 'Product' };
function OfferFormatTag({ kind }: { kind?: string }) {
  if (!kind || APP_PLAN_KINDS.includes(kind)) return <ProtocolFormatTag />;
  const name = OTHER_FORMATS[kind] || 'Online';
  return <span style={boxTag}>{name === 'PDF' && <FileText size={11} />}{name}</span>;
}
// Audience line from the offer-creation flow (social_links.audience_details), e.g. "Women · 32–55 · Menopause".
type AudienceDetail = { min?: number; max?: number; stages?: string[] };
/** "Women · 45–64" from a Protocol's target_gender and the "Age: Adults 45–64." line the builder writes into its description. */
function protocolAudience(protocol: { target_gender?: string | null; description?: string | null }): string {
  const d = protocol.description || '';
  const gender = /Population:\s*([^.]+)\./.exec(d)?.[1]?.trim() || (protocol.target_gender && protocol.target_gender !== 'all' ? protocol.target_gender : '');
  const age = /Age:\s*(?:Adults\s*)?([^.]+)\./.exec(d)?.[1]?.trim() || '';
  return [gender && gender.charAt(0).toUpperCase() + gender.slice(1), age].filter(Boolean).join(' · ');
}

function audienceLabel(details?: Record<string, AudienceDetail> | string | null, groups?: string[]): string {
  let map: Record<string, AudienceDetail> = {};
  if (typeof details === 'string') { try { map = JSON.parse(details); } catch { map = {}; } } else if (details) map = details;
  // Only audiences the Guardian actually picked: the builder keeps default ranges for every group.
  const picked = groups && groups.length ? groups : Object.keys(map);
  const group = picked.find((g) => g !== 'Everyone') || picked[0];
  if (!group) return '';
  const d = map[group] || {};
  const name = group === 'Busy families' ? 'Families' : group;
  const ages = d.min != null && d.max != null ? `${d.min}–${d.max}${d.max >= 90 ? '+' : ''}` : '';
  return [name, ages, (d.stages || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
}
function AppOfferImage({ kind, size = 96, align = 'center' }: { kind?: string; size?: number; align?: 'center' | 'left' }) {
  const m = align === 'left' ? '0' : '0 auto';
  const art = productArt(kind);
  if (kind === 'routine' || kind === 'routine_guidance' || !art) return <img src="/images/guides/generated/r3-protocol-card.png" alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'block', margin: m }} />;
  return <span aria-hidden="true" style={{ display: 'block', margin: m, width: size * art.cellAspect, height: size, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${(art.index % art.cols) * 100 / Math.max(1, art.cols - 1)}% ${Math.floor(art.index / art.cols) * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.95) invert(.88)' }} />;
}
// Tilt + cursor glow for any card: writes CSS variables on the element (no re-render), so it is cheap on big cards.
function tiltHandlers(strength = 6) {
  return {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return;
      const el = event.currentTarget; const b = el.getBoundingClientRect();
      const x = (event.clientX - b.left) / b.width; const y = (event.clientY - b.top) / b.height;
      el.style.setProperty('--rx', `${((.5 - y) * strength).toFixed(2)}deg`); el.style.setProperty('--ry', `${((x - .5) * strength * 1.2).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`); el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`); el.style.setProperty('--go', '1');
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => { const el = event.currentTarget; ['--rx', '--ry'].forEach((v) => el.style.setProperty(v, '0deg')); el.style.setProperty('--go', '0'); },
  };
}
const tiltStyle = (base: React.CSSProperties): React.CSSProperties => ({
  ...base,
  position: base.position || 'relative',
  transform: 'perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))',
  transition: 'transform 220ms ease, box-shadow 220ms ease',
  willChange: 'transform',
  boxShadow: `${base.boxShadow ? `${base.boxShadow}, ` : ''}0 0 0 1px rgba(34,197,94,calc(var(--go,0) * .55)), 0 0 calc(var(--go,0) * 30px) rgba(34,197,94,.28)`,
});
const GlowLayer = () => <span aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', borderRadius: 'inherit', opacity: 'var(--go,0)' as any, transition: 'opacity 200ms ease', background: 'radial-gradient(320px circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.6), transparent 65%)', mixBlendMode: 'soft-light' }} />;
const COUPON_RATE = .3;
const SAMPLE_REVIEWS: GuardianReview[] = [
  { id: 's1', guide_id: '', reviewer_name: 'Sample · Claire', rating: 5, body: 'Sleeping through the night for the first time in months. Simple steps I could actually keep.', status: 'published', created_at: '' },
  { id: 's2', guide_id: '', reviewer_name: 'Sample · Amira', rating: 5, body: 'Clear, kind and practical. The daily routine in the app kept me on track.', status: 'published', created_at: '' },
  { id: 's3', guide_id: '', reviewer_name: 'Sample · Jo', rating: 4, body: 'Felt calmer by day three. Loved the printable plan.', status: 'published', created_at: '' },
];
// Horizontal rail of review cards with stars. `sample` marks preview-only placeholder reviews.
function ReviewRail({ reviews, accent, title = 'What people say', sample = false }: { reviews: GuardianReview[]; accent: string; title?: string; sample?: boolean }) {
  if (!reviews.length) return null;
  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return <section aria-label="Reviews" style={{ width: '100%', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 10 }}><span style={{ color: accent, fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{title}</span><span style={{ color: '#55564F', fontSize: 11 }}><span style={{ color: accent }}>★</span> {average.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}{sample ? ' · sample' : ''}</span></div>
    {/* Slow auto-scroll: the list is doubled so the loop is seamless; pauses on hover, static for reduced motion. */}
    <style>{`@keyframes review-marquee{to{transform:translateX(-50%)}}.review-rail{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}.review-track{display:flex;width:max-content;animation:review-marquee var(--rail-duration) linear infinite}.review-rail:hover .review-track{animation-play-state:paused}@media (prefers-reduced-motion:reduce){.review-rail{overflow-x:auto}.review-track{animation:none}}`}</style>
    <div className="review-rail" style={{ paddingBottom: 6 }}><div className="review-track" style={{ ['--rail-duration' as string]: `${Math.max(30, reviews.length * 12)}s` } as React.CSSProperties}>
      {[...reviews, ...reviews].map((r, index) => <figure key={`${r.id}-${index}`} {...tiltHandlers(8)} aria-hidden={index >= reviews.length || undefined} style={tiltStyle({ flex: '0 0 250px', marginRight: 10, marginTop: 0, marginBottom: 0, marginLeft: 0, border: '1px solid rgba(17,18,15,.16)', background: 'rgba(255,255,255,.75)', borderRadius: 4, padding: '12px 14px', display: 'grid', gap: 8, alignContent: 'start' })}><GlowLayer />
        <span aria-label={`${r.rating} out of 5 stars`} style={{ fontSize: 12, letterSpacing: 1 }}>{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ color: i < r.rating ? accent : 'rgba(17,18,15,.2)' }}>★</span>)}</span>
        <blockquote style={{ margin: 0, color: '#2B2C27', fontSize: 12, lineHeight: 1.55 }}>{r.body}</blockquote>
        <figcaption style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#55564F', fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}><span aria-hidden="true" style={{ width: 24, height: 24, flex: '0 0 24px', borderRadius: '50%', background: `${accent}26`, color: accent, display: 'grid', placeItems: 'center', fontFamily: serif, fontSize: 12, fontWeight: 400, letterSpacing: 0 }}>{(r.reviewer_name.replace(/^Sample · /, '').trim()[0] || '?').toUpperCase()}</span>{r.reviewer_name}</figcaption>
      </figure>)}
    </div></div>
  </section>;
}
// Opened from a one-time review link (?review=<token>): star rating + text, then reveals the thank-you code.
function ReviewForm({ token, guardianName, accent }: { token: string; guardianName: string; accent: string }) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState('sending'); setMessage('');
    try { setCode(await submitGuardianReview(token, { name, rating, body })); setState('done'); }
    catch (err: any) { setMessage(err?.message || 'Could not send your review.'); setState('error'); }
  }
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #11120F', borderRadius: 2, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, background: '#FFF', color: '#11120F', outline: 'none' };
  return <section id="review" style={{ padding: `clamp(40px,7vw,90px) ${PAGE_X}`, borderBottom: '1px solid rgba(17,18,15,.2)' }}>
    <div style={{ maxWidth: 560 }}>
      <span style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Share your experience</span>
      {state === 'done' ? <>
        <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(36px,5vw,56px)', lineHeight: 1, margin: '14px 0 12px' }}>Thank you.</h2>
        <p style={{ color: '#66645F', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>Your review helps others find {guardianName}. Here is your thank-you code for your next offer:</p>
        <button type="button" onClick={() => navigator.clipboard?.writeText(code).catch(() => {})} style={{ border: `1px dashed ${accent}`, background: '#FFF', padding: '12px 16px', fontSize: 22, fontWeight: 700, letterSpacing: '.1em', cursor: 'pointer', color: '#11120F' }}>{code}</button>
      </> : <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(36px,5vw,56px)', lineHeight: 1, margin: '0 0 4px' }}>How was your time with {guardianName}?</h2>
        <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRating(n)} style={{ border: 0, background: 'none', padding: 2, fontSize: 30, lineHeight: 1, cursor: 'pointer', color: n <= rating ? accent : 'rgba(17,18,15,.2)' }}>★</button>)}</div>
        <input required maxLength={80} placeholder="Your first name" aria-label="Your first name" value={name} onChange={(e) => setName(e.target.value)} style={field} />
        <textarea required minLength={3} maxLength={1200} placeholder="What changed for you?" aria-label="Your review" value={body} onChange={(e) => setBody(e.target.value)} style={{ ...field, minHeight: 110, resize: 'vertical' }} />
        {state === 'error' && <p role="alert" style={{ color: '#8A3D31', fontSize: 12, margin: 0 }}>{message}</p>}
        <button disabled={state === 'sending'} style={{ height: 46, width: 'fit-content', padding: '0 20px', border: '1px solid #11120F', borderRadius: 2, background: '#11120F', color: '#FFF', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{state === 'sending' ? 'Sending…' : 'Send review and get my code'}</button>
      </form>}
    </div>
  </section>;
}
// Guardian side: create one-time review links (with a thank-you code) and moderate reviews.
function ReviewsPanel({ userId, slug }: { userId: string; slug: string }) {
  const [reviews, setReviews] = useState<GuardianReview[]>([]);
  const [requests, setRequests] = useState<GuardianReviewRequest[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => { listGuardianReviews(userId).then(setReviews).catch(() => {}); listGuardianReviewRequests(userId).then(setRequests).catch(() => {}); }, [userId]);
  const linkFor = (token: string) => `${window.location.origin}/guardians/${encodeURIComponent(slug)}?review=${token}`;
  async function create() {
    setBusy(true); setError('');
    try {
      const code = `THANKS${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const request = await createGuardianReviewRequest(userId, { customer_email: email, customer_name: name, discount_code: code });
      setRequests((current) => [request, ...current]); setEmail(''); setName('');
    } catch (e: any) { setError(e?.message || 'Could not create a review link.'); }
    finally { setBusy(false); }
  }
  const copy = (token: string) => { navigator.clipboard?.writeText(linkFor(token)).catch(() => {}); setCopied(token); window.setTimeout(() => setCopied(''), 1500); };
  const toggle = async (review: GuardianReview) => { const status = review.status === 'published' ? 'hidden' : 'published'; await setGuardianReviewStatus(review.id, status).catch(() => {}); setReviews((current) => current.map((r) => r.id === review.id ? { ...r, status } : r)); };
  const small: React.CSSProperties = { ...btn, minHeight: 34, height: 34, fontSize: 9, background: 'transparent', color: ink };
  return <section style={{ border: `1px solid ${line}`, background: panel, padding: 16, marginBottom: 22 }}>
    <label style={{ ...label, color: ink }}>Reviews <span style={{ color: acid }}>· ask buyers for a review, thank them with a discount code</span></label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <input style={{ ...input, flex: '1 1 180px' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name (optional)" />
      <input style={{ ...input, flex: '1 1 220px' }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (optional)" />
      <button type="button" onClick={create} disabled={busy} style={btn}>{busy ? 'Creating…' : 'Create review link'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#F0A7A7', fontSize: 11, margin: '8px 0 0' }}>{error}</p>}
    {requests.length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>{requests.slice(0, 8).map((r) => <div key={r.token} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${line}`, paddingTop: 8, fontSize: 11 }}>
      <span style={{ flex: '1 1 200px', color: ink }}>{r.customer_name || r.customer_email || 'Customer'} <span style={{ color: muted }}>· code {r.discount_code} · {r.used_at ? 'reviewed' : 'waiting'}</span></span>
      {!r.used_at && <><button type="button" onClick={() => copy(r.token)} style={small}>{copied === r.token ? 'Copied' : 'Copy link'}</button>{r.customer_email && <a href={`mailto:${r.customer_email}?subject=${encodeURIComponent('Could you share a quick review?')}&body=${encodeURIComponent(`Hi ${r.customer_name || ''},\n\nThank you for working with me. Would you share a short review? It takes a minute, and you will get a thank-you discount code (${r.discount_code}) for your next offer.\n\n${linkFor(r.token)}`)}`} style={{ ...small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Email it</a>}</>}
    </div>)}</div>}
    {reviews.length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 14 }}><span style={label}>Received</span>{reviews.map((r) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${line}`, paddingTop: 8, fontSize: 11, opacity: r.status === 'hidden' ? .5 : 1 }}><span style={{ color: acid }}>{'★'.repeat(r.rating)}</span><span style={{ flex: 1, color: ink }}>{r.body} <span style={{ color: muted }}>· {r.reviewer_name}</span></span><button type="button" onClick={() => toggle(r)} style={small}>{r.status === 'published' ? 'Hide' : 'Show'}</button></div>)}</div>}
  </section>;
}
function GuardianSiteHero({ name, avatarUrl, specialties, headline, tags, bio, accent, headingFont, background, backgroundIsVideo = false, greyscale = false, cards, headlineStyle = 'editorial', reviewSummary = {}, audience }: { audience?: string; reviewSummary?: { rating?: number; reviewCount?: number }; headlineStyle?: HeadlineStyle; name: string; avatarUrl?: string | null; specialties: string[]; headline: string; tags: string[]; bio: string; accent: string; headingFont: string; background?: string | null; backgroundIsVideo?: boolean; greyscale?: boolean; cards: SiteHeroCard[] }) {
  return <section style={{ position: 'relative', overflow: 'hidden', minHeight: 'min(720px,calc(100vh - 64px))', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'center', backgroundImage: background && !backgroundIsVideo ? `linear-gradient(rgba(242,239,231,.66),rgba(242,239,231,.66)),url(${background})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', backgroundBlendMode: greyscale ? 'luminosity' : 'normal', color: '#11120F' }}>
    {background && backgroundIsVideo && <><video src={background} autoPlay muted loop playsInline aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: greyscale ? 'grayscale(1)' : 'none' }} /><span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(242,239,231,.66)' }} /></>}
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1240, margin: '0 auto', boxSizing: 'border-box', padding: 'clamp(40px,7cqw,96px) clamp(24px,6cqw,84px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 'clamp(28px,5cqw,72px)', alignItems: 'center' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', filter: greyscale ? 'grayscale(1)' : 'none' }} /> : <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#D7D4CC', display: 'grid', placeItems: 'center', fontFamily: headingFont, fontSize: 24 }}>{(name || 'G').charAt(0)}</span>}
          <span style={{ fontFamily: APP.font }}><strong style={{ display: 'block', fontSize: 15, fontWeight: 600, color: APP.text }}>{name || 'Your name'}</strong><span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 600, color: APP.greenDark }}>{specialties.slice(0, 3).join(' · ') || 'Personal guidance'}</span></span>
        </div>
        {/* Headline in the Guardian's chosen style (editorial serif, app bold or statement caps). */}
        <h1 style={{ ...HEADLINE_STYLES[headlineStyle].hero, margin: '0 0 16px' }}>{HEADLINE_STYLES[headlineStyle].stripStop ? (headline || name).replace(/\.$/, '') : (headline || name)}</h1>
        <ExpertiseTags tags={tags} color={accent} />
        <p style={{ fontFamily: APP.font, color: APP.muted, fontSize: 16, fontWeight: 500, lineHeight: 1.55, maxWidth: 560, margin: 0 }}>{bio}</p>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <span style={{ fontFamily: APP.font, color: APP.greenDark, fontSize: 15, fontWeight: 600 }}>Explore my offers</span>
        {cards.map((card) => <ProductCard key={card.key} {...reviewSummary} audience={audience} kind={card.kind} eyebrow={card.eyebrow} title={card.title} copy={card.copy} price={card.price} name={name} avatarUrl={avatarUrl} accent={accent} href={card.href} onClick={card.onClick} />)}
      </div>
    </div>
  </section>;
}

/** Guardian site header, shared by the published mini-site and the builder preview. */
function GuardianSiteHeader({ brandName, path, right }: { brandName?: string; path?: string; right?: React.ReactNode }) {
  return <header style={{ minHeight: 64, background: '#FFFFFF', color: '#11120F', borderBottom: '1px solid rgba(17,18,15,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '0 clamp(20px,6cqw,84px)', flexWrap: 'wrap' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><RoutineMark size={32} textColor="#16140F" hairline="#16140F" />{brandName && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em' }}>{brandName}</span>}</span>
    {right ?? (path && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: '#66645F' }}>{path}</span>)}
  </header>;
}

export function GuardianWebsite({ slug, isSignedIn }: { slug: string; isSignedIn: boolean }) {
  const pathSlug = window.location.pathname.match(/\/value-ramp\/([^/]+)\/?$/)?.[1];
  const [reviews, setReviews] = useState<GuardianReview[]>([]);
  const reviewToken = new URLSearchParams(window.location.search).get('review') || '';
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [offers, setOffers] = useState<GuideOffer[]>([]);
  const [valueRamps, setValueRamps] = useState<GuideValueRamp[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    getGuideProfileBySlug(slug).then(async (found) => {
      setProfile(found);
      setOffers(found ? await listGuideOffers(found.user_id) : []);
      setValueRamps(found ? await listGuideValueRamps(found.user_id).catch(() => []) : []);
      setReviews(found ? await listGuardianReviews(found.user_id).catch(() => []) : []);
    }).catch(() => { setProfile(null); setOffers([]); }).finally(() => setLoading(false));
  }, [slug]);
  if (loading) return <div style={{ minHeight: '100vh', background: black, color: ink, display: 'grid', placeItems: 'center', fontFamily: sans }}>Building Guardian page…</div>;
  const publishedRamps = valueRamps.filter(ramp => ramp.status === 'published');
  const selectedRamp = pathSlug ? publishedRamps.find(ramp => encodeURIComponent(ramp.slug) === pathSlug) : publishedRamps[0];
  if (!profile || (pathSlug && !selectedRamp)) return <div style={{ minHeight: '100vh', background: black, color: ink, display: 'grid', placeItems: 'center', padding: 24, fontFamily: sans, textAlign: 'center' }}><div><Brand /><h1 style={{ fontFamily: serif, fontSize: 48, fontWeight: 300, margin: '48px 0 12px' }}>This page is not published yet.</h1><a href="/guardians" style={{ color: acid }}>Return to Guardians</a></div></div>;
  const freeOffers = offers.filter((offer) => offer.access_model === 'free');
  const socials = profile.social_links || {};
  const publicHeadingFont = serif;
  const publicBodyFont = sans;
  const publicPageColor = socials.theme_page_color || '#F2EFE7';
  const publicAccent = socials.theme_accent_color || '#667245';
  const publicLanguage = languageOptions.find((language) => language.name === socials.language)?.code || 'en';
  const publicBackgroundIsVideo = socials.theme_background_type === 'video' || /\.(mp4|webm)(?:\?|$)/i.test(socials.theme_background || '');
  const publicGreyscale = socials.theme_image_treatment === 'greyscale';
  const publicHeadlineStyle = headlineStyleOf(socials.theme_headline_style);
  const publicHeaderStyle: HeaderStyle = socials.theme_header_style === 'hidden' ? 'hidden' : 'white';
  const publicHeaderBackground = '#FFFFFF';
  const publicHeaderText = '#11120F';
  const publicExpertiseTags = parseExpertiseTags(socials.expertise_tags);
  return <div lang={publicLanguage} dir={publicLanguage === 'ar' ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: publicPageColor, color: '#11120F', fontFamily: publicBodyFont }}>
    {publicHeaderStyle !== 'hidden' && <header style={{ minHeight: 64, background: publicHeaderBackground, color: publicHeaderText, borderBottom: '1px solid rgba(17,18,15,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '0 clamp(20px,6vw,84px)', flexWrap: 'wrap' }}>
      <a href="/" aria-label="ROUTINE³" style={{ color: publicHeaderText, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}><RoutineMark size={32} textColor="#16140F" hairline="#16140F" />{socials.brand_name && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em' }}>{socials.brand_name}</span>}</a>
      <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
        {socials.instagram && <a href={socials.instagram} aria-label="Instagram" title="Instagram" style={{ color: publicHeaderText, display: 'grid', placeItems: 'center' }}><Instagram size={15} /></a>}
        {socials.tiktok && <a href={socials.tiktok} aria-label="TikTok" title="TikTok" style={{ color: publicHeaderText, display: 'grid', placeItems: 'center' }}><AtSign size={15} /></a>}
        {socials.youtube && <a href={socials.youtube} aria-label="YouTube" title="YouTube" style={{ color: publicHeaderText, display: 'grid', placeItems: 'center' }}><Youtube size={16} /></a>}
        {socials.linktree && <a href={socials.linktree} aria-label="Linktree" title="Linktree" style={{ color: publicHeaderText, display: 'grid', placeItems: 'center' }}><Link2 size={15} /></a>}
        {socials.website && <a href={socials.website} aria-label="Website" title="Website" style={{ color: publicHeaderText, display: 'grid', placeItems: 'center' }}><Globe2 size={15} /></a>}
        {isSignedIn && <a href="/guardians/workspace" style={{ color: publicHeaderText, fontSize: 10, fontWeight: 700 }}>Guardian workspace →</a>}
      </div>
    </header>}
    <main>
      {/* Shared with the builder preview, so what Guardians build is what they publish. */}
      <GuardianSiteHero audience={audienceLabel(profile.social_links?.audience_details)} reviewSummary={reviewStats(reviews)} headlineStyle={publicHeadlineStyle} name={profile.display_name} avatarUrl={profile.avatar_url} specialties={profile.specialties} headline={profile.headline || profile.display_name} tags={publicExpertiseTags} bio={profile.bio} accent={publicAccent} headingFont={publicHeadingFont} background={socials.theme_background} backgroundIsVideo={publicBackgroundIsVideo} greyscale={publicGreyscale}
        cards={valueRamps.filter((ramp) => ramp.status === 'published').length ? valueRamps.filter((ramp) => ramp.status === 'published').map((ramp) => ({ key: ramp.id, eyebrow: ramp.problem || undefined, title: customerFacingOfferTitle(offers.find((offer) => offer.id === ramp.offer_ids[0])?.title || ramp.name), copy: offers.find((offer) => offer.id === ramp.offer_ids[0])?.description || '', kind: offers.find((offer) => offer.id === ramp.offer_ids[0])?.kind, price: offers.find((offer) => offer.id === ramp.offer_ids[0])?.access_model === 'free' ? 'Free' : undefined, href: pathSlug === encodeURIComponent(ramp.slug) ? '#offers' : `/guardians/${profile.slug}/value-ramp/${encodeURIComponent(ramp.slug)}` })) : freeOffers.slice(0, 1).map((offer) => ({ key: offer.id, eyebrow: profile.specialties.slice(0, 2).join(' · '), title: customerFacingOfferTitle(offer.title), copy: offer.description || '', kind: offer.kind, price: 'Free', href: '#start' }))} />
      {reviewToken && <ReviewForm token={reviewToken} guardianName={profile.display_name} accent={publicAccent} />}
      <GuardianFunnel key={selectedRamp?.id || 'default'} headlineStyle={publicHeadlineStyle} reviews={reviews.filter((r) => r.status === 'published')} profile={profile} offers={offers} ramp={selectedRamp || null} accent={publicAccent} headingFont={publicHeadingFont} />
      <GuardianShop guideId={profile.user_id} guardianSlug={profile.slug} guardianName={profile.display_name} pagePadding={PAGE_X} />
    </main>
  </div>;
}

function Onboarding({ userId, accessToken, name, email, accountAvatarUrl, hasProfile = false, onDone }: { userId: string; accessToken: string; name: string; email: string; accountAvatarUrl?: string | null; hasProfile?: boolean; onDone: (p: GuideProfile) => void }) {
  const [step, setStep] = useGuardianPage<number>('step', SETUP_STEPS, 1);
  const [displayName, setDisplayName] = useState(name);
  const { signOut } = useAuth();
  const [mainLanguage, setMainLanguage] = useState(defaultLanguage());
  const [contactEmail, setContactEmail] = useState(email);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [linktreeUrl, setLinktreeUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(accountAvatarUrl || null);
  const [activeBrandId, setActiveBrandId] = useState('personal');
  const [brandKit, setBrandKit] = useState<BrandKit>(defaultBrandKit()); // the active brand's look
  const [brandProfiles, setBrandProfiles] = useState<BrandDraft[]>([{ localId: 'personal', name: name || 'Personal brand', kind: 'personal', logo_url: accountAvatarUrl || null, contact_email: email, whatsapp_phone: '', website_url: '', social_links: {}, language: defaultLanguage(), pricing_region: defaultPricingRegion().region, currency: defaultPricingRegion().currency }]);
  const [bookingProvider, setBookingProvider] = useState<BookingProvider>('ROUTINE³ Booking');
  const [bookingUrl, setBookingUrl] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [realm, setRealm] = useState<GuideRealm>('Body');
  const [audience, setAudience] = useState<string[]>(['Everyone']);
  // Per-gender targeting: age range plus (for women) life stages. Saved with the profile on publish.
  const [audienceDetails, setAudienceDetails] = useState<Record<string, { min: number; max: number; stages: string[] }>>({
    Everyone: { min: 18, max: 80, stages: [] }, Women: { min: 18, max: 80, stages: [] }, Men: { min: 18, max: 80, stages: [] }, Children: { min: 4, max: 12, stages: [] }, Teenagers: { min: 13, max: 19, stages: [] }, Athletes: { min: 16, max: 45, stages: [] }, 'Busy families': { min: 0, max: 80, stages: [] },
  });
  // Chips under each audience card (Women's life stages, Men's, children's stages, athletes' focus, family mix).
  const AUDIENCE_CHIPS: Record<string, { label: string; options: string[] }> = {
    Women: { label: 'Life stage', options: ['Pregnancy', 'Postpartum', 'Premenopause', 'Perimenopause', 'Menopause', 'Postmenopause'] },
    Men: { label: 'Life stage', options: ['Fatherhood', 'Midlife', 'Andropause', 'Healthy ageing'] },
    Children: { label: 'Stage', options: ['Infancy', 'Toddler', 'Early childhood', 'Middle childhood'] },
    Teenagers: { label: 'Stage', options: ['Puberty', 'Adolescence', 'Exams', 'Young adult'] },
    Athletes: { label: 'Focus', options: ['Endurance', 'Strength', 'Team sport', 'Recovery', 'Competition'] },
    'Busy families': { label: 'Family mix', options: ['Young kids', 'Teens', 'Multi-generational'] },
  };
  const describeAudience = (group: string) => { const d = audienceDetails[group]; return d ? `${group} ${d.min}–${d.max}${d.stages.length ? ` · ${d.stages.join(', ')}` : ''}` : group; };
  const [format, setFormat] = useState<string[]>(['Protocol (Physical + Interactive)']);
  const [intro, setIntro] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(accountAvatarUrl || defaultAvatars[0].image);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundType, setBackgroundType] = useState<'image' | 'video'>('image');
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [storyTemplate, setStoryTemplate] = useState<StoryTemplateId>('editorial');
  const [siteStyleStage, setSiteStyleStage] = useState(0);
  const [offerEditStage, setOfferEditStage] = useState(0);
  const [pageColor, setPageColor] = useState('#F2EFE7');
  const [accentColor, setAccentColor] = useState('#667245');
  const [imageTreatment, setImageTreatment] = useState<'color' | 'greyscale'>('color');
  const [selectedHeadline, setSelectedHeadline] = useState('');
  const [expertiseTags, setExpertiseTags] = useState<string[]>([]);
  const [expertiseTagDraft, setExpertiseTagDraft] = useState('');
  const [funnelPreviewStage, setFunnelPreviewStage] = useState(0);
  const [funnelUnlockedStage, setFunnelUnlockedStage] = useState(0);
  const [funnelPageState, setFunnelPageState] = useState<'offer' | 'checkout' | 'access' | 'post_purchase' | 'complete'>('checkout');
  const [funnelTimerSeconds, setFunnelTimerSeconds] = useState(600);
  const [funnelPurchases, setFunnelPurchases] = useState<string[]>([]);
  const [leadCaptureValue, setLeadCaptureValue] = useState('');
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>('white');
  const [headlineStyle, setHeadlineStyle] = useState<HeadlineStyle>('editorial');
  const [pricingRegion, setPricingRegion] = useState(defaultPricingRegion().region);
  const [currency, setCurrency] = useState<CurrencyCode>(defaultPricingRegion().currency);
  const [offerGoal, setOfferGoal] = useState<GuardianOfferGoal>('basic');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // Re-open with what was last published: theme, photo and copy, so publishing again keeps them.
  const [savedStatus, setSavedStatus] = useState<GuideProfile['status'] | null>(null);
  useEffect(() => {
    getGuideProfile(userId).then((saved) => {
      if (!saved) return;
      const links = saved.social_links || {};
      setSavedStatus(saved.status);
      if (saved.display_name) setDisplayName(saved.display_name);
      if (saved.avatar_url) setAvatarUrl(saved.avatar_url);
      if (saved.contact_email) setContactEmail(saved.contact_email);
      if (links.theme_background) setBackgroundUrl(links.theme_background);
      if (links.theme_background_type === 'image' || links.theme_background_type === 'video') setBackgroundType(links.theme_background_type);
      if (links.theme_image_treatment === 'color' || links.theme_image_treatment === 'greyscale') setImageTreatment(links.theme_image_treatment);
      setHeadlineStyle(headlineStyleOf(links.theme_headline_style));
      if (links.theme_header_style === 'white' || links.theme_header_style === 'hidden') setHeaderStyle(links.theme_header_style as HeaderStyle);
      if (links.theme_page_color) setPageColor(links.theme_page_color);
      if (links.theme_accent_color) setAccentColor(links.theme_accent_color);
      if (links.brand_name) setBrandName(links.brand_name);
      if (links.logo_url) setLogoUrl(links.logo_url);
      if (links.expertise_tags) setExpertiseTags(parseExpertiseTags(links.expertise_tags));
      if (links.offer_videos) { try { setOfferVideos(JSON.parse(String(links.offer_videos))); } catch { /* ignore bad JSON */ } }
      if (links.roles) setRoles(String(links.roles).split(',').filter(Boolean));
    }).catch(() => {});
  }, [userId]);
  // Saved brands come back (they were written on publish but never read): the personal brand stays active and
  // takes its kit; business brands keep theirs for when they are selected.
  // Publishing replaces every brand, so it waits for this load: a failed load must not wipe saved business brands.
  const [brandsLoaded, setBrandsLoaded] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    setBrandsLoaded('loading');
    listGuideBrands(userId).then((saved) => {
      setBrandsLoaded('ok');
      if (!saved.length) return;
      const drafts: BrandDraft[] = saved.map((b) => ({ localId: b.kind === 'personal' ? 'personal' : `brand-${b.id}`, name: b.name, kind: b.kind, logo_url: b.logo_url, contact_email: b.contact_email, whatsapp_phone: b.whatsapp_phone, website_url: b.website_url, social_links: b.social_links || {}, language: b.language, pricing_region: b.pricing_region, currency: b.currency as BrandDraft['currency'] }));
      setBrandProfiles((current) => [drafts.find((d) => d.localId === 'personal') || current.find((d) => d.localId === 'personal')!, ...drafts.filter((d) => d.localId !== 'personal')].filter(Boolean));
      const personal = drafts.find((d) => d.localId === 'personal');
      if (personal) setBrandKit(brandKitOf(personal.social_links));
    }).catch(() => setBrandsLoaded('failed'));
  }, [userId]);
  // Existing items shown under each step ("In your workspace").
  const [related, setRelated] = useState<{ leads: GuideLead[]; offers: GuideOffer[]; ramps: GuideValueRamp[]; protocols: AdminProtocol[] }>({ leads: [], offers: [], ramps: [], protocols: [] });
  useEffect(() => {
    Promise.all([
      listGuideLeads(userId).catch(() => []),
      listGuideOffers(userId).catch(() => []),
      listGuideValueRamps(userId).catch(() => []),
      listProtocols(accessToken, userId).catch(() => []),
    ]).then(([leads, offers, ramps, protocols]) => setRelated({ leads, offers, ramps, protocols }));
  }, [userId, accessToken]);
  const [offerPlanStage, setOfferPlanStage] = useState(0);
  const [showProtocolInfo, setShowProtocolInfo] = useState(false);
  const [summaryView, setSummaryView] = useState<'offers' | 'sites' | null>(null);
  const [inventoryMenu, setInventoryMenu] = useState<string | null>(null);
  const [offerAccess, setOfferAccess] = useState<Record<UpsellKind, 'free' | 'paid'>>({ ebook: 'paid', routine: 'paid', routine_guidance: 'paid', recipe_book: 'paid', group_call: 'paid', one_to_one_call: 'paid', in_person: 'paid', festival: 'paid' });
  const [importedProfile, setImportedProfile] = useState<ImportedGuideProfile | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingOffer, setUploadingOffer] = useState(false);
  const [freeOfferType, setFreeOfferType] = useState<FreeOfferKind>('routine');
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<FreeOfferKind[]>(['routine']);
  const [freeDelivery, setFreeDelivery] = useState<DeliveryFormat[]>(['Downloadable PDF', 'Interactive Protocol']);
  const [leadMagnetTitle, setLeadMagnetTitle] = useState('Starter Protocol');
  const [freeAudienceValue, setFreeAudienceValue] = useState(freeValueSuggestions.routine);
  const [leadMagnetPath, setLeadMagnetPath] = useState<string | null>(null);
  const [protocolBrief, setProtocolBrief] = useState('');
  const [protocolSourceUrls, setProtocolSourceUrls] = useState('');
  const [protocolGoal, setProtocolGoal] = useState('');
  const [protocolTypes, setProtocolTypes] = useState<string[]>(['Wellness']);
  const [audienceProblemsByGroup, setAudienceProblemsByGroup] = useState<Record<string, string[]>>({ Everyone: ['Sleep problems', 'Low energy'] });
  const [audienceProblemDrafts, setAudienceProblemDrafts] = useState<Record<string, string>>({});
  const [rampAudience, setRampAudience] = useState('Everyone');
  const [rampProblem, setRampProblem] = useState('Sleep problems');
  const [audienceSetupStage, setAudienceSetupStage] = useState(0);
  const [freeOfferSetupStage, setFreeOfferSetupStage] = useState(0);
  const [showAllEntryOffers, setShowAllEntryOffers] = useState(false);
  const [paidOfferSetupStages, setPaidOfferSetupStages] = useState<Partial<Record<UpsellKind, number>>>({});
  const [onboardingProtocol, setOnboardingProtocol] = useState<AdminProtocol | null>(null);
  const [onboardingProtocolRevision, setOnboardingProtocolRevision] = useState(0);
  const [protocolBuilderOpen, setProtocolBuilderOpen] = useState(false);
  const [protocolEditorVisible, setProtocolEditorVisible] = useState(false);
  const [creatingProtocol, setCreatingProtocol] = useState(false);
  // Matches the default 'basic' goal: free guide -> paid Protocol.
  const [selectedUpsells, setSelectedUpsells] = useState<UpsellKind[]>(['routine']);
  const [showAddOfferOptions, setShowAddOfferOptions] = useState(false);
  // Short pitch video per offer ('free' = lead magnet), shown as the upsell on the previous step's download page.
  const [couponCopied, setCouponCopied] = useState(false);
  const [guardianReviews, setGuardianReviews] = useState<GuardianReview[]>([]);
  useEffect(() => { if (userId) listGuardianReviews(userId).then((rows) => setGuardianReviews(rows.filter((r) => r.status === 'published'))).catch(() => {}); }, [userId]);
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [offerVideos, setOfferVideos] = useState<Record<string, string>>({});
  const [uploadingVideo, setUploadingVideo] = useState('');
  const [upsellDrafts, setUpsellDrafts] = useState<Record<UpsellKind, { title: string; price: string; url: string; delivery: DeliveryFormat[]; audienceValue: string; nextStep: OfferNextStep; billingModel: BillingModel }>>({
    ebook: { title: 'Complete guide', price: '29', url: '', delivery: ['Downloadable PDF'], audienceValue: 'Learn the complete method and apply it at your own pace.', nextStep: 'link', billingModel: 'one_time' },
    routine: { title: 'Personalised Protocol', price: '49', url: '', delivery: ['PDF + Interactive Protocol'], audienceValue: 'A Protocol shaped around them, in print and in the ROUTINE³ app.', nextStep: 'builder', billingModel: 'one_time' },
    routine_guidance: { title: 'Personalised Protocol + call', price: '79', url: '', delivery: ['Interactive Protocol', 'Live online'], audienceValue: 'A Protocol shaped around them, plus a one-to-one call to set it up.', nextStep: 'builder', billingModel: 'one_time' },
    recipe_book: { title: 'Recipe collection', price: '24', url: '', delivery: ['Downloadable PDF'], audienceValue: 'Make a complete collection of practical recipes with confidence.', nextStep: 'builder', billingModel: 'one_time' },
    group_call: { title: 'Personal Protocol + weekly coaching + daily feedback', price: '299', url: '', delivery: ['Interactive Protocol', 'Live online'], audienceValue: 'Your coach sees the Protocol activity you choose to share, reviews progress daily and suggests timely changes, with a private coaching call every week.', nextStep: 'booking', billingModel: 'subscription' },
    one_to_one_call: { title: 'Personalised R3 Protocol + private call', price: '104', url: '', delivery: ['Interactive Protocol', 'Live online'], audienceValue: 'Receive a custom Protocol and one private call to refine it around your needs and agree the next actions.', nextStep: 'booking', billingModel: 'one_time' },
    in_person: { title: 'In-person session', price: '349', url: '', delivery: ['In person'], audienceValue: 'Experience tailored hands-on support and individual attention.', nextStep: 'booking', billingModel: 'pack_10' },
    festival: { title: 'Three-day in-person retreat', price: '1500', url: '', delivery: ['Event'], audienceValue: 'Spend three focused days at a country hotel with in-person coaching, practical sessions, accommodation and a personal plan to take home.', nextStep: 'booking', billingModel: 'one_time' },
  });
  const [routineGender, setRoutineGender] = useState('Women');
  const [routineAge, setRoutineAge] = useState('Adults 45–64');
  const [routineLifeStage, setRoutineLifeStage] = useState('Menopause');
  const activeStoryTemplate = storyTemplates.find((template) => template.id === storyTemplate) || storyTemplates[0];
  const effectiveBackground = backgroundUrl || activeStoryTemplate.image;
  const previewHeaderBackground = '#FFFFFF';
  const previewHeaderText = '#11120F';

  function currentBrandDraft(): BrandDraft {
    const current = brandProfiles.find((brand) => brand.localId === activeBrandId);
    return {
      localId: activeBrandId,
      name: displayName.trim() || current?.name || 'Untitled brand',
      kind: current?.kind || 'business',
      logo_url: logoUrl,
      contact_email: contactEmail.trim(),
      whatsapp_phone: whatsappPhone.trim(),
      website_url: websiteUrl.trim(),
      social_links: { instagram: instagramUrl.trim(), tiktok: tiktokUrl.trim(), youtube: youtubeUrl.trim(), linktree: linktreeUrl.trim(), ...brandKitLinks(brandKit) },
      language: mainLanguage,
      pricing_region: pricingRegion,
      currency,
    };
  }

  function loadBrand(brand: BrandDraft) {
    setActiveBrandId(brand.localId); setDisplayName(brand.name); setLogoUrl(brand.logo_url); setAvatarUrl(brand.logo_url);
    setContactEmail(brand.contact_email); setWhatsappPhone(brand.whatsapp_phone); setWebsiteUrl(brand.website_url);
    setInstagramUrl(brand.social_links.instagram || ''); setTiktokUrl(brand.social_links.tiktok || '');
    setYoutubeUrl(brand.social_links.youtube || ''); setLinktreeUrl(brand.social_links.linktree || '');
    setMainLanguage(brand.language); setPricingRegion(brand.pricing_region); setCurrency(brand.currency);
    setBrandKit(brandKitOf(brand.social_links));
  }

  function selectBrand(localId: string) {
    const savedCurrent = currentBrandDraft();
    const updated = brandProfiles.map((brand) => brand.localId === activeBrandId ? savedCurrent : brand);
    setBrandProfiles(updated);
    const next = updated.find((brand) => brand.localId === localId);
    if (next) loadBrand(next);
  }

  function addBrand() {
    const savedCurrent = currentBrandDraft();
    const localId = `brand-${Date.now()}`;
    const next: BrandDraft = { localId, name: 'New brand', kind: 'business', logo_url: null, contact_email: contactEmail, whatsapp_phone: '', website_url: '', social_links: {}, language: mainLanguage, pricing_region: pricingRegion, currency };
    setBrandProfiles([...brandProfiles.map((brand) => brand.localId === activeBrandId ? savedCurrent : brand), next]);
    loadBrand(next);
  }

  function removeActiveBrand() {
    if (brandProfiles.length === 1 || activeBrandId === 'personal') return;
    const remaining = brandProfiles.filter((brand) => brand.localId !== activeBrandId);
    setBrandProfiles(remaining);
    loadBrand(remaining[0]);
  }

  function addExpertiseTags(raw: string) {
    const additions = raw.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!additions.length) return;
    setExpertiseTags((current) => Array.from(new Set([...current, ...additions])).slice(0, 10));
    setExpertiseTagDraft('');
  }

  function toggleAudienceProblem(group: string, problem: string) {
    setAudienceProblemsByGroup((current) => {
      const selected = current[group] || [];
      return { ...current, [group]: selected.includes(problem) ? selected.filter((item) => item !== problem) : [...selected, problem] };
    });
  }

  function addAudienceProblem(group: string) {
    const problem = (audienceProblemDrafts[group] || '').trim();
    if (!problem) return;
    setAudienceProblemsByGroup((current) => ({ ...current, [group]: Array.from(new Set([...(current[group] || []), problem])).slice(0, 12) }));
    setAudienceProblemDrafts((current) => ({ ...current, [group]: '' }));
  }

  function tiltCard(event: React.PointerEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.guardian-card');
    if (!card || event.pointerType === 'touch') return;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    card.style.setProperty('--card-rotate-x', `${(-y * 7).toFixed(2)}deg`);
    card.style.setProperty('--card-rotate-y', `${(x * 9).toFixed(2)}deg`);
  }

  function resetTilt(event: React.PointerEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.guardian-card');
    if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    card.style.setProperty('--card-rotate-x', '0deg');
    card.style.setProperty('--card-rotate-y', '0deg');
  }

  function applyStoryTemplate(id: StoryTemplateId) {
    const template = storyTemplates.find((item) => item.id === id);
    if (!template) return;
    setStoryTemplate(id);
    setBackgroundUrl(null);
    setBackgroundType('image');
    setPageColor(template.page);
    setAccentColor(template.accent);
    setImageTreatment(template.treatment);
  }
  const [guidanceReviewCadence, setGuidanceReviewCadence] = useState('Daily review');
  const [eventsPerYear, setEventsPerYear] = useState('1');
  const [importMessage, setImportMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audiences = ['Everyone', 'Busy families', 'Women', 'Men', 'Children', 'Teenagers', 'Athletes'];
  const audienceHelp: Record<string, string> = {
    Everyone: 'General guidance that works for most people',
    'Busy families': 'Parents fitting health around family life',
    Women: 'Cycles, pregnancy, menopause and more',
    Men: 'Strength, energy and long-term health',
    Children: 'Healthy habits for growing kids',
    Teenagers: 'Sleep, skin, food and focus through the teen years',
    Athletes: 'Training, recovery and performance',
  };
  const audienceProblemSuggestions = ['Sleep problems', 'Hot flushes', 'Low energy', 'Brain fog', 'Stress or anxiety', 'Weight changes', 'Digestive discomfort', 'Skin changes', 'Pain or mobility', 'Fitness confidence', 'Meal planning', 'Healthy routines'];
  const audienceProblemSuggestionsByGroup: Record<string, string[]> = {
    Everyone: audienceProblemSuggestions,
    'Busy families': ['Sleep problems', 'Low energy', 'Stress or anxiety', 'Meal planning', 'Healthy routines', 'Digestive discomfort'],
    Women: ['Hot flushes', 'Sleep problems', 'Low energy', 'Brain fog', 'Stress or anxiety', 'Weight changes', 'Skin changes', 'Healthy routines'],
    Men: ['Low energy', 'Stress or anxiety', 'Weight changes', 'Fitness confidence', 'Sleep problems', 'Healthy routines'],
    Children: ['Sleep problems', 'Digestive discomfort', 'Skin changes', 'Meal planning', 'Healthy routines', 'Pain or mobility'],
    Teenagers: ['Skin breakouts', 'Exam stress', 'Sleep problems', 'Screen time', 'Meal planning', 'Fitness confidence'],
    Athletes: ['Fitness confidence', 'Pain or mobility', 'Low energy', 'Meal planning', 'Digestive discomfort', 'Healthy routines'],
  };
  // Age shapes the problems: a group's age range adds kid, teen or healthy-ageing problems.
  // New problems borrow the closest existing card art.
  const AGE_PROBLEM_ART: Record<string, string> = { 'Picky eating': 'Meal planning', 'Bedtime routine': 'Sleep problems', 'Screen time': 'Brain fog', 'Focus at school': 'Brain fog', 'Growing pains': 'Pain or mobility', 'Exam stress': 'Stress or anxiety', 'Skin breakouts': 'Skin changes', 'Joint stiffness': 'Pain or mobility', 'Bone health': 'Pain or mobility', 'Memory': 'Brain fog', 'Balance and falls': 'Fitness confidence', 'Heart health': 'Low energy', 'Morning sickness': 'Digestive discomfort', 'Prenatal nutrition': 'Meal planning', 'Postpartum recovery': 'Low energy', 'Newborn sleep': 'Sleep problems', 'Cycle symptoms': 'Hormone changes', 'Hot flushes': 'Hormone changes', 'Night sweats': 'Sleep problems', 'Mood swings': 'Stress or anxiety', 'Weight changes': 'Meal planning', 'Muscle building': 'Fitness confidence', 'Testosterone': 'Hormone changes', 'Belly fat': 'Meal planning', 'Prostate health': 'Healthy routines', 'Work stress': 'Stress or anxiety', 'Feeding routines': 'Meal planning', 'Tantrums': 'Stress or anxiety', 'Body changes': 'Skin changes', 'Endurance fuel': 'Meal planning', 'Strength gains': 'Fitness confidence', 'Injury recovery': 'Pain or mobility', 'Pre-game nerves': 'Stress or anxiety', 'Hydration': 'Healthy routines' };
  // One realm tag per problem (top-right of the card): BODY, MIND, SOUL, or ALL when it spans all three.
  const PROBLEM_REALM: Record<string, string> = {
    'Stress or anxiety': 'MIND', 'Brain fog': 'MIND', 'Memory': 'MIND', 'Focus at school': 'MIND', 'Exam stress': 'MIND', 'Screen time': 'MIND', 'Mood swings': 'MIND', 'Work stress': 'MIND', 'Pre-game nerves': 'MIND', 'Tantrums': 'MIND', 'Fitness confidence': 'MIND',
    'Healthy routines': 'ALL', 'Low energy': 'ALL', 'Sleep problems': 'ALL', 'Postpartum recovery': 'ALL', 'Hormone changes': 'ALL', 'Bedtime routine': 'SOUL', 'Newborn sleep': 'SOUL',
  };
  const problemRealm = (problem: string) => PROBLEM_REALM[problem] || 'BODY';
  // Life-stage / focus chips map to their own short problem list (replaces the generic cards when chosen).
  const STAGE_PROBLEMS: Record<string, string[]> = {
    Pregnancy: ['Morning sickness', 'Prenatal nutrition', 'Sleep problems'], Postpartum: ['Postpartum recovery', 'Newborn sleep', 'Low energy'], Premenopause: ['Cycle symptoms', 'Skin changes', 'Stress or anxiety'], Perimenopause: ['Hot flushes', 'Mood swings', 'Sleep problems'], Menopause: ['Hot flushes', 'Night sweats', 'Weight changes'], Postmenopause: ['Bone health', 'Heart health', 'Joint stiffness'],
    Fatherhood: ['Low energy', 'Sleep problems', 'Work stress'], Midlife: ['Belly fat', 'Work stress', 'Heart health'], Andropause: ['Testosterone', 'Low energy', 'Mood swings'], 'Healthy ageing': ['Prostate health', 'Memory', 'Joint stiffness'],
    Infancy: ['Feeding routines', 'Bedtime routine'], Toddler: ['Picky eating', 'Tantrums', 'Bedtime routine'], 'Early childhood': ['Picky eating', 'Screen time'], 'Middle childhood': ['Focus at school', 'Growing pains'], Puberty: ['Body changes', 'Skin breakouts'], Adolescence: ['Exam stress', 'Sleep problems'], Exams: ['Exam stress', 'Focus at school'], 'Young adult': ['Meal planning', 'Stress or anxiety'],
    Endurance: ['Endurance fuel', 'Hydration'], Strength: ['Strength gains', 'Muscle building'], 'Team sport': ['Pre-game nerves', 'Injury recovery'], Recovery: ['Injury recovery', 'Sleep problems'], Competition: ['Pre-game nerves', 'Endurance fuel'],
  };
  const ageProblems = (group: string): string[] => {
    const d = audienceDetails[group];
    if (!d) return [];
    const stageProblems = d.stages.flatMap((stage) => STAGE_PROBLEMS[stage] || []);
    const band = [
      ...(d.min < 13 ? ['Picky eating', 'Bedtime routine', 'Focus at school'] : []),
      ...(d.min < 20 && d.max >= 13 ? ['Exam stress', 'Skin breakouts'] : []),
      ...(group === 'Men' && d.min < 30 ? ['Muscle building'] : []),
      ...(group === 'Men' && d.max >= 40 ? ['Testosterone', 'Heart health'] : []),
      ...(group === 'Women' && d.min < 45 && !d.stages.length ? ['Cycle symptoms'] : []),
      ...(d.max >= 50 ? ['Joint stiffness', 'Bone health'] : []),
    ];
    return [...stageProblems, ...band];
  };
  // Age slider (and women's life stages) stacked directly under each selected audience card.
  const agePanel = (g: string) => { const d = audienceDetails[g]; const set = (patch: Partial<typeof d>) => setAudienceDetails((current) => ({ ...current, [g]: { ...current[g], ...patch } })); return <div style={{ border: `1px solid ${line}`, borderTop: 0, background: 'rgba(245,242,234,.04)', padding: '10px 12px 12px', display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Ages</span>
      <div className="age-range" style={{ flex: '1 1 120px', minWidth: 100 }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: line }} />
        <span aria-hidden="true" style={{ position: 'absolute', top: 10, height: 2, background: acid, left: `${d.min / (g === 'Children' ? 12 : g === 'Teenagers' ? 19 : 90) * 100}%`, right: `${100 - d.max / (g === 'Children' ? 12 : g === 'Teenagers' ? 19 : 90) * 100}%` }} />
        <input type="range" aria-label={`${g} minimum age`} min={0} max={g === 'Children' ? 12 : g === 'Teenagers' ? 19 : 90} value={d.min} onChange={(e) => set({ min: Math.min(Number(e.target.value), d.max - 1) })} />
        <input type="range" aria-label={`${g} maximum age`} min={0} max={g === 'Children' ? 12 : g === 'Teenagers' ? 19 : 90} value={d.max} onChange={(e) => set({ max: Math.max(Number(e.target.value), d.min + 1) })} />
      </div>
      <span style={{ color: ink, fontSize: 13, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{d.min}–{d.max}{d.max >= 90 ? '+' : ''}</span>
    </div>
    {AUDIENCE_CHIPS[g] && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ flexBasis: '100%', color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{AUDIENCE_CHIPS[g].label}</span>
      {AUDIENCE_CHIPS[g].options.map((stage) => { const on = d.stages.includes(stage); return <button type="button" key={stage} aria-pressed={on} onClick={() => { const stages = on ? d.stages.filter((x) => x !== stage) : [...d.stages, stage]; set({ stages }); if (!on && (g === 'Women' || g === 'Men')) setRoutineLifeStage(stage); }} style={{ height: 26, padding: '0 9px', border: `1px solid ${on ? acid : line}`, borderRadius: 2, background: on ? '#20251B' : 'transparent', color: on ? acid : ink, fontFamily: sans, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{stage}</button>; })}
    </div>}
  </div>; };
  const audienceProblems = Array.from(new Set(audience.flatMap((group) => audienceProblemsByGroup[group] || [])));
  const audienceProblemArt = atlas('/images/guides/tags/body.webp', 4, 3, audienceProblemSuggestions);
  const formats: { label: string; value: string; description: string; art: TagArt }[] = [
    { label: 'Protocol (Physical + Interactive)', value: 'PHYSICAL + APP', description: 'A guide to keep with interactive steps in the app', art: supportArt['ROUTINE³ (physical + digital)'] },
    { label: 'Protocol + Guidance', value: 'INTERACTIVE', description: 'Review progress and suggest the next action', art: offerArt['ROUTINE³'] },
    { label: 'Recipes', value: 'DOWNLOAD', description: 'Practical recipes people can use at home', art: supportArt.Recipes },
    { label: 'Group call', value: 'LIVE GROUP', description: 'Teach, discuss and answer together', art: supportArt['Group call'] },
    { label: '1:1 online', value: 'PRIVATE LIVE', description: 'Tailored guidance for one person', art: supportArt['1:1 online'] },
    { label: 'In person', value: 'PHYSICAL', description: 'Hands-on personal support', art: supportArt['In person'] },
    { label: 'Event', value: 'PHYSICAL EVENT', description: 'A shared immersive experience', art: supportArt.Event },
  ];
  const freeOfferCta: Record<FreeOfferKind, string> = { ebook: 'Get the guide', recipe_book: 'Get the recipes', routine: 'Start the Protocol', group_call: 'Join the group call', one_to_one_call: 'Book a call', in_person: 'Book your place' };
  const upsellSuggestions: { kind: UpsellKind; label: string; value: string; why: string; art: TagArt }[] = [
    { kind: 'ebook', label: 'Complete guide', value: 'Complete method', why: 'Learn the complete method and apply it at your own pace.', art: offerArt.eBook },
    { kind: 'recipe_book', label: 'Practical recipe collection', value: 'Practical toolkit', why: 'Use a complete collection of practical recipes whenever you need them.', art: offerArt['Recipe book'] },
    { kind: 'routine', label: 'Personalised Protocol', value: 'Personalised plan', why: 'A Protocol shaped around them, in print and in the ROUTINE³ app.', art: offerArt['ROUTINE³'] },
    { kind: 'routine_guidance', label: 'Personalised Protocol + call', value: 'Personalised plan + call', why: 'A personalised Protocol plus a one-to-one call to set it up.', art: offerArt['ROUTINE³'] },
    { kind: 'festival', label: 'Three-day in-person retreat', value: 'Premium', why: 'Spend three focused days at a country hotel with coaching, practical sessions and accommodation.', art: offerArt.Event },
    { kind: 'group_call', label: 'Personal Protocol + weekly coaching + daily feedback', value: 'Ongoing', why: 'Share selected Protocol activity with your coach for daily feedback, timely adjustments and a private call every week.', art: offerArt['Group call'] },
    { kind: 'one_to_one_call', label: 'Personal Protocol + private call', value: 'Guided', why: 'Refine your custom Protocol in one private coaching call and leave with agreed next actions.', art: offerArt['1:1 call'] },
    { kind: 'in_person', label: 'In person', value: 'Highest', why: 'Receive tailored hands-on support and the Guardian’s full attention.', art: supportArt['In person'] },
  ];
  const offerValueTags: Record<UpsellKind, string> = {
    ebook: 'Complete method',
    recipe_book: 'Practical toolkit',
    routine: 'General plan',
    routine_guidance: 'Specific plan',
    one_to_one_call: 'Personal refinement',
    group_call: 'Ongoing adaptation',
    in_person: 'Private support',
    festival: 'Immersive support',
  };
  const freeValueTags: Record<FreeOfferKind, string> = {
    ebook: 'Lead magnet',
    recipe_book: 'Recipe sampler',
    routine: 'Starter Protocol',
    group_call: 'Community builder',
    one_to_one_call: 'Discovery',
    in_person: 'Meet in person',
  };
  const freeOfferTypes: { value: FreeOfferKind; label: string; eyebrow: string; copy: string }[] = [
    { value: 'routine', label: 'Protocol / Routine', eyebrow: 'DIGITAL / PRINTED', copy: 'A daily routine in the ROUTINE³ app, with a printable PDF.' },
    { value: 'ebook', label: 'Guide', eyebrow: 'DIGITAL / PRINTED', copy: 'A digital or printed guide that teaches one useful idea.' },
    { value: 'recipe_book', label: 'Recipe book', eyebrow: 'DIGITAL / PRINTED', copy: 'A digital or printed recipe book with practical meals.' },
    { value: 'group_call', label: 'Group video call', eyebrow: 'COMMUNITY', copy: 'A recurring video call that brings people back each week.' },
    { value: 'one_to_one_call', label: 'Personal call', eyebrow: 'DISCOVERY', copy: 'A short one-to-one call to find the right next step.' },
    { value: 'in_person', label: 'In-person meeting or event', eyebrow: 'HIGH VALUE', copy: 'Very valuable to give away. Usually best as a paid offer.' },
  ];
  const websiteGoal = offerGoal === 'audience' ? 'Collect leads' : 'Sell an offer';
  const headlineSuggestions = useMemo(() => guardianHeadlineSuggestions(chosen, audience), [chosen, audience]);
  const generatedHeadline = selectedHeadline || headlineSuggestions[0];
  useEffect(() => { setSelectedHeadline(''); }, [chosen.join('|'), audience.join('|')]);
  const suggestedFreeOffer = useMemo(() => {
    const subject = chosen[0] || 'wellness';
    if (format.includes('Group call')) return { kind: 'group_call' as const, title: `Free Tuesday ${subject.toLowerCase()} community call` };
    if (format.includes('Recipes') || chosen.includes('Nutrition')) return { kind: 'recipe_book' as const, title: `3 free ${subject} recipes` };
    if (format.includes('1:1 online') || format.includes('In person')) return { kind: 'one_to_one_call' as const, title: `A free ${subject} discovery call` };
    if (format.includes('Protocol (Physical + Interactive)') || chosen.includes('Breathwork')) return { kind: 'routine' as const, title: `A free 3-day ${subject} Protocol` };
    return { kind: 'ebook' as const, title: `A free introduction to ${subject}` };
  }, [chosen, format]);
  const pickStyle = (active: boolean): React.CSSProperties => ({ minHeight: 44, padding: '0 13px', border: `1px solid ${active ? ink : line}`, color: active ? black : ink, background: active ? ink : 'transparent', fontFamily: sans, fontSize: 11, fontWeight: 600, cursor: 'pointer' });
  async function importPublicProfile(urls: string[]) {
    if (!urls.length) return;
    setImporting(true); setImportMessage('');
    try {
      const imported = await importGuideProfile(urls, accessToken);
      setImportedProfile(imported);
      if (imported.name) setDisplayName(imported.name);
      if (imported.bio) setIntro(imported.bio);
      if (imported.avatarUrl) { setAvatarUrl(imported.avatarUrl); setLogoUrl(imported.avatarUrl); }
      const searchable = `${imported.headline} ${imported.bio} ${imported.topics.join(' ')}`.toLowerCase();
      const inferred = specialties.filter((specialty) => imported.topics.includes(specialty) || searchable.includes(specialty.toLowerCase().replace(' health', '')));
      if (inferred.length) {
        setChosen((current) => Array.from(new Set([...current, ...inferred])));
        const inferredRealm = (Object.keys(specialtyGroups) as GuideRealm[]).find((key) => specialtyGroups[key].some((option) => inferred.includes(option)));
        if (inferredRealm) setRealm(inferredRealm);
      }
      if (/family|parent|children|kids/.test(searchable)) setAudience(['Busy families']);
      else if (/women|female|mother/.test(searchable)) setAudience(['Women']);
      else if (/athlete|sport|fitness/.test(searchable)) setAudience(['Athletes']);
      setImportMessage(`Imported from ${imported.sources.map((source) => source.site).join(', ')}. Review anything you want to change.`);
    } catch (e: any) {
      setImportMessage(e.message || 'Nothing could be imported. Continue with the quick choices below.');
    } finally { setImporting(false); }
  }

  async function uploadPortrait(file?: File) {
    if (!file) return;
    setUploading(true); setImportMessage('');
    try {
      const url = await uploadGuideImage(userId, file);
      setAvatarUrl(url);
      setLogoUrl(url);
      setImportMessage('Profile image uploaded.');
    } catch (e: any) {
      setImportMessage(e.message || 'Could not upload that profile image.');
    } finally { setUploading(false); }
  }

  async function uploadBackground(file?: File) {
    if (!file) return;
    setUploadingBackground(true); setImportMessage('');
    try {
      setBackgroundUrl(await uploadGuideImage(userId, file));
      setBackgroundType(file.type.startsWith('video/') ? 'video' : 'image');
    } catch (e: any) {
      setImportMessage(e.message || 'Could not upload that background.');
    } finally { setUploadingBackground(false); }
  }

  async function uploadOfferVideo(key: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Choose an MP4 or WebM video.'); return; }
    setUploadingVideo(key); setError('');
    try { const url = await uploadGuideImage(userId, file); setOfferVideos((current) => ({ ...current, [key]: url })); }
    catch (e: any) { setError(e.message || 'Could not upload that video.'); }
    finally { setUploadingVideo(''); }
  }
  const offerVideoField = (key: string) => <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Pitch video · MP4 / WebM, 25 MB</span><div style={{ display: 'flex', gap: 6 }}><label style={{ ...btn, ...compactControl, flex: 1, minHeight: 36, boxSizing: 'border-box', background: 'transparent', color: offerVideos[key] ? acid : ink, borderColor: line, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Play size={12} />{uploadingVideo === key ? 'Uploading…' : offerVideos[key] ? 'Replace video' : 'Upload video'}<input type="file" accept="video/mp4,video/webm" hidden onChange={(event) => { uploadOfferVideo(key, event.target.files?.[0]); event.target.value = ''; }} /></label>{offerVideos[key] && <button type="button" onClick={() => setOfferVideos(({ [key]: _, ...rest }) => rest)} style={{ ...btn, ...compactControl, minHeight: 36, background: 'transparent', color: muted, borderColor: line }}>Remove</button>}</div></div>;

  async function uploadLeadMagnet(file?: File) {
    if (!file) return;
    setUploadingOffer(true); setError('');
    try { setLeadMagnetPath(await uploadGuideFile(userId, file)); }
    catch (e: any) { setError(e.message || 'Could not upload that file.'); }
    finally { setUploadingOffer(false); }
  }

  async function continueSetup() {
    setError('');
    if (step === 1 && !displayName.trim()) { setError('Add the name people should call you.'); return; }
    if (step === 1 && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) { setError('Add a valid contact email.'); return; }
    if (step === 2 && !chosen.length) { setError('Choose at least one area you can help with.'); return; }
    if (step === 3 && !audience.length) { setError('Choose at least one audience.'); return; }
    if (step === 1) {
      setBrandProfiles((current) => current.map((brand) => brand.localId === activeBrandId ? currentBrandDraft() : brand));
      const profileUrls = Array.from(new Set([instagramUrl, tiktokUrl, youtubeUrl, linktreeUrl, websiteUrl].map((value) => value.trim()).filter(Boolean)));
      if (profileUrls.length) await importPublicProfile(profileUrls);
    }
    setStep((current) => Math.min(5, current + 1));
  }

  function toggleAudience(value: string) {
    const selecting = !audience.includes(value);
    if (selecting) {
      if (value === 'Women') setRoutineGender('Women');
      if (value === 'Men') setRoutineGender('Men');
      if (value === 'Children') { setRoutineAge('Children 6–12'); setRoutineLifeStage('Not specified'); }
      if (value === 'Teenagers') { setRoutineAge('Teens 13–17'); setRoutineLifeStage('Not specified'); }
      if (value === 'Athletes') setProtocolTypes((current) => Array.from(new Set([...current, 'Fitness'])));
      if (value === 'Busy families') setProtocolTypes((current) => Array.from(new Set([...current, 'Meals / nutrition'])));
    }
    setAudience((current) => {
      if (value === 'Everyone') return current.includes('Everyone') ? [] : ['Everyone'];
      const withoutEveryone = current.filter((item) => item !== 'Everyone');
      return withoutEveryone.includes(value) ? withoutEveryone.filter((item) => item !== value) : [...withoutEveryone, value];
    });
  }

  function toggleUpsell(kind: UpsellKind) {
    setSelectedUpsells((current) => current.includes(kind) ? (current.length === 1 ? current : current.filter((item) => item !== kind)) : [...current, kind]);
  }

  function addValuePathOffer(kind: UpsellKind) {
    if (offerAccess[kind] === 'paid') {
      const highestPaidPrice = selectedUpsells.reduce((highest, selectedKind) => offerAccess[selectedKind] === 'paid' ? Math.max(highest, Number(upsellDrafts[selectedKind].price || 0)) : highest, 0);
      const currentPrice = Number(upsellDrafts[kind].price || 0);
      if (currentPrice <= highestPaidPrice) updateUpsell(kind, { price: String(Math.ceil((highestPaidPrice + 20) / 5) * 5) });
    }
    toggleUpsell(kind);
    setShowAddOfferOptions(false);
  }

  function applyOfferGoal(goal: GuardianOfferGoal) {
    setOfferGoal(goal);
    if (goal === 'audience') {
      const subject = chosen[0]?.toLowerCase() || 'wellbeing';
      setFreeOfferType('group_call');
      setSelectedLeadMagnets(['group_call']);
      setFreeDelivery(['Live online']);
      setLeadMagnetTitle(`Free Tuesday ${subject} community call`);
      setFreeAudienceValue(`Join me every Tuesday to talk about ${subject}, ask questions and learn one useful action to try that week.`);
      setSelectedUpsells(['one_to_one_call']);
    } else if (goal === 'basic') {
      // Simplest ramp: a free starter Protocol, then one paid Protocol. No calls to schedule.
      setFreeOfferType('routine');
      setSelectedLeadMagnets(['routine']);
      setFreeDelivery(['Downloadable PDF', 'Interactive Protocol']);
      setLeadMagnetTitle('Starter Protocol');
      setFreeAudienceValue(freeValueSuggestions.routine);
      setSelectedUpsells(['routine']);
    } else {
      setFreeOfferType('ebook');
      setSelectedLeadMagnets(['ebook']);
      setFreeDelivery(['Downloadable PDF']);
      setLeadMagnetTitle('Free starter guide');
      setFreeAudienceValue(freeValueSuggestions.ebook);
      setSelectedUpsells(['one_to_one_call']);
    }
  }

  function toggleFormat(value: string) {
    setFormat((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleProtocolType(value: string) {
    setProtocolTypes((current) => current.includes(value)
      ? current.length === 1 ? current : current.filter((item) => item !== value)
      : [...current, value]);
  }

  function updateUpsell(kind: UpsellKind, patch: Partial<{ title: string; price: string; url: string; delivery: DeliveryFormat[]; audienceValue: string; nextStep: OfferNextStep; billingModel: BillingModel }>) {
    setUpsellDrafts((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!displayName.trim()) throw new Error('Add the name people should call you.');
      if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim())) throw new Error('Add a valid contact email.');
      if (!chosen.length) throw new Error('Choose at least one area you can help with.');
      if (brandsLoaded === 'loading') throw new Error('Your saved brands are still loading. Try again in a moment.');
      if (brandsLoaded === 'failed') throw new Error('Your saved brands could not be loaded, so publishing is paused to avoid overwriting them. Reload the page to try again.');
      const slug = guardianSlug;
      const audienceText = audience.join(', ').toLowerCase();
      const headline = generatedHeadline;
      const bio = intro.trim() || `I help ${audienceText} with ${chosen.join(', ').toLowerCase()} through ${format.join(', ').toLowerCase()}.`;
      const profile = await saveGuideProfile({ user_id: userId, slug, display_name: displayName, headline, bio, avatar_url: avatarUrl, contact_email: contactEmail.trim(), whatsapp_phone: whatsappPhone.trim(), social_links: { instagram: instagramUrl.trim(), tiktok: tiktokUrl.trim(), youtube: youtubeUrl.trim(), linktree: linktreeUrl.trim(), website: websiteUrl.trim(), language: mainLanguage, pricing_region: pricingRegion, currency, site_goal: websiteGoal, booking_provider: bookingProvider, booking_url: bookingUrl.trim(), brand_name: brandName.trim() || displayName.trim(), logo_url: logoUrl || '', expertise_tags: expertiseTags.join(','), offer_videos: JSON.stringify(offerVideos), roles: roles.join(','), audience_details: JSON.stringify(Object.fromEntries(audience.filter((g) => audienceDetails[g]).map((g) => [g, audienceDetails[g]]))), theme_template: storyTemplate, theme_background: effectiveBackground, theme_background_type: backgroundType, theme_image_treatment: imageTreatment, theme_header_style: headerStyle, theme_headline_style: headlineStyle, theme_heading: 'Canela', theme_body: 'Euclid', theme_page_color: pageColor, theme_accent_color: accentColor }, specialties: chosen, status: savedStatus === 'approved' ? 'approved' : 'submitted', onboarding_step: 5 });
      const selectedBrand = currentBrandDraft();
      const brandsToSave = brandProfiles.map((brand) => brand.localId === activeBrandId ? selectedBrand : brand);
      await replaceGuideBrands(userId, brandsToSave.map(({ localId, ...brand }) => ({ ...brand, is_primary: localId === activeBrandId })));
      // Republishing updates the offers saved last time (matched by type + free/paid) instead of duplicating them.
      const [existingOffers, existingRecipes] = await Promise.all([listGuideOffers(userId).catch(() => [] as GuideOffer[]), listGuideRecipes(userId).catch(() => [] as GuideRecipe[])]);
      const claimed = new Set<string>();
      const existingIdFor = (kind: string, access: 'free' | 'paid') => { const match = existingOffers.find((offer) => offer.kind === kind && offer.access_model === access && !claimed.has(offer.id)); if (match) claimed.add(match.id); return match?.id || null; };
      const drafts: Promise<GuideOffer>[] = [];
      const protocolSourceList = protocolSourceUrls.split(/\n|,/).map((value) => value.trim()).filter(Boolean);
      const protocolTargetGoal = protocolGoal.trim() || audienceProblems[0] || chosen[0] || 'General wellbeing';
      const protocolContext = [
        protocolBrief.trim() && `Build brief: ${protocolBrief.trim()}.`,
        protocolSourceList.length && `Source URLs: ${protocolSourceList.join(', ')}.`,
        leadMagnetPath && `Source file: ${leadMagnetPath}.`,
        `Audiences: ${audience.join(', ')}.`,
        `Goal: ${protocolTargetGoal}.`,
        audienceProblems.length && `Problems by audience: ${audience.map((group) => `${group}: ${(audienceProblemsByGroup[group] || []).join(', ')}`).join('; ')}.`,
        `Content types: ${protocolTypes.join(', ')}.`,
      ].filter(Boolean).join(' ');
      if (leadMagnetTitle.trim()) {
        const freeOfferIsCall = freeOfferType === 'one_to_one_call' || freeOfferType === 'group_call';
        drafts.push(upsertGuideOffer(userId, { status: 'published', kind: freeOfferType, title: leadMagnetTitle.trim(), description: `${freeAudienceValue.trim()} Delivery: ${freeDelivery.join(', ')}.${freeOfferType === 'routine' ? ` ${protocolContext}` : ''}`.trim(), price_cents: 0, currency, affiliate_url: null, access_model: 'free', file_path: freeOfferIsCall ? null : leadMagnetPath, booking_url: freeOfferIsCall ? bookingUrl.trim() || null : null }, existingIdFor(freeOfferType, 'free')));
      }
      selectedLeadMagnets.filter((kind) => kind !== freeOfferType).forEach((kind) => {
        const option = freeOfferTypes.find((item) => item.value === kind);
        const isCall = kind === 'one_to_one_call' || kind === 'group_call';
        drafts.push(upsertGuideOffer(userId, { status: 'published', kind, title: `Free ${option?.label || 'guide'}`, description: `${freeValueSuggestions[kind]} Delivery: ${suggestedDelivery(kind)}.`, price_cents: 0, currency, affiliate_url: null, access_model: 'free', file_path: null, booking_url: isCall ? bookingUrl.trim() || null : null }, existingIdFor(kind, 'free')));
      });
      orderedUpsells.forEach((kind) => {
        const suggestion = upsellSuggestions.find((item) => item.kind === kind);
        const draft = upsellDrafts[kind];
        if (!draft.title.trim()) return;
        const targeting = kind === 'routine' || kind === 'routine_guidance' || kind === 'group_call'
          ? ` Target audiences: ${audience.join(', ')}. Problems: ${audience.map((group) => `${group}: ${(audienceProblemsByGroup[group] || []).join(', ')}`).join('; ')}. Goal: ${chosen[0] || 'general wellbeing'}.${kind === 'group_call' ? ` Coach review: ${guidanceReviewCadence.toLowerCase()}. Shared activity: Protocol completion and voluntary check-ins; private account and health data remain excluded.` : ''}`
          : kind === 'festival' ? ` Frequency: ${eventsPerYear} event${eventsPerYear === '1' ? '' : 's'} per year.` : '';
        const destination = draft.url.trim() || (draft.nextStep === 'booking' ? bookingUrl.trim() : '');
        const access = offerAccess[kind];
        const billing = access === 'paid' ? ` Payment model: ${billingLabels[draft.billingModel].title}${billingLabels[draft.billingModel].suffix}.` : '';
        drafts.push(upsertGuideOffer(userId, { status: 'published', kind, title: draft.title.trim(), description: `${draft.audienceValue.trim() || suggestion?.why || ''} Delivery: ${draft.delivery.join(', ')}. Next action: ${nextStepLabels[draft.nextStep].title}.${billing}${targeting}`.trim() || null, price_cents: access === 'free' ? 0 : Math.max(0, Math.round(Number(draft.price || 0) * 100)), currency, affiliate_url: null, access_model: access, file_path: null, booking_url: destination || null }, existingIdFor(kind, access)));
      });
      const savedOffers = drafts.length ? await Promise.all(drafts) : [];
      // The offer path the site links to, with offers in funnel order (Promise.all keeps push order).
      await upsertGuideValueRamp(userId, { name: customerFacingOfferTitle(leadMagnetTitle.trim() || suggestedFreeOffer.title), slug: valueRampSlug, audience: rampTargetAudience, problem: rampTargetProblem, offer_ids: savedOffers.map((offer) => offer.id), status: 'published' });
      const wantsRecipes = freeOfferType === 'recipe_book' || selectedUpsells.some((kind) => kind === 'recipe_book' && upsellDrafts[kind].nextStep === 'builder');
      const wantsRoutine = freeOfferType === 'routine' || selectedUpsells.some((kind) => (kind === 'routine' || kind === 'routine_guidance') && upsellDrafts[kind].nextStep === 'builder');
      const recipeBuilderKind = selectedUpsells.find((kind) => kind === 'recipe_book' && upsellDrafts[kind].nextStep === 'builder');
      const protocolBuilderKind = selectedUpsells.find((kind) => (kind === 'routine' || kind === 'routine_guidance') && upsellDrafts[kind].nextStep === 'builder');
      const recipeTitle = recipeBuilderKind ? upsellDrafts[recipeBuilderKind].title : leadMagnetTitle.trim() || suggestedFreeOffer.title;
      if (wantsRecipes && !existingRecipes.some((recipe) => recipe.title === recipeTitle)) await createGuideRecipe(userId, { title: recipeBuilderKind ? upsellDrafts[recipeBuilderKind].title : leadMagnetTitle.trim() || suggestedFreeOffer.title, description: recipeBuilderKind ? upsellDrafts[recipeBuilderKind].audienceValue : freeAudienceValue.trim() || 'Recipe collection draft', meal_slot: 'any' });
      if (wantsRoutine && !onboardingProtocol) await findOrCreateProtocol(accessToken, { user_id: userId, name: protocolBuilderKind ? upsellDrafts[protocolBuilderKind].title : leadMagnetTitle.trim() || suggestedFreeOffer.title, description: `${protocolBuilderKind ? upsellDrafts[protocolBuilderKind].audienceValue : freeAudienceValue.trim()} ${protocolContext}`.trim(), target_gender: audience.length === 1 && (audience[0] === 'Women' || audience[0] === 'Men') ? audience[0] : 'Everyone', total_days: 3 });
      // New and unpublished sites go to the admin for a check before they appear publicly.
      if (profile.status !== 'approved') await requestGuardianReview().catch(() => null);
      window.history.pushState({}, '', `/guardians/${profile.slug}/value-ramp/${valueRampSlug}`);
      onDone(profile);
    } catch (e: any) { setError(e.message?.includes('guide_profiles') ? 'Guardian database is not installed yet. Apply the portal migration first.' : e.message); }
    finally { setBusy(false); }
  }
  const steps = [
    { n: 1, label: 'Profile', title: 'Start with what you know.', copy: 'Add your name and any public profile you want us to learn from.', image: '/images/guides/guide-plate.png' },
    { n: 2, label: 'Guidance', title: 'Where can you help?', copy: 'Choose the areas where your experience is most useful.', image: '/images/guides/build-plate.png' },
    { n: 3, label: 'Audience', title: 'Who do you help?', copy: 'Tell us who you work with and the problems you help solve.', image: '/images/guides/lead-plate.png' },
    { n: 4, label: 'Offers', title: 'Build your offers.', copy: 'Plan the journey, then build every free and paid offer it contains.', image: '/images/guides/offer-plate.png' },
    { n: 5, label: 'Site', title: 'Build your site.', copy: 'Preview the customer journey, then publish.', image: '/images/guides/guide-plate.png' },
  ];
  const activeStep = steps[step - 1];
  const rampAudienceOptions = audience.length ? audience : ['Everyone'];
  // A specific group (e.g. Women) beats the 'Everyone' default, so the path matches the audience chip on the cards.
  const specificAudience = rampAudienceOptions.find((group) => group !== 'Everyone');
  const rampTargetAudience = rampAudience === 'Everyone' && specificAudience ? specificAudience : rampAudienceOptions.includes(rampAudience) ? rampAudience : rampAudienceOptions[0];
  const rampProblemOptions = audienceProblemsByGroup[rampTargetAudience] || [];
  const rampTargetProblem = rampProblemOptions.includes(rampProblem) ? rampProblem : rampProblemOptions[0] || chosen[0] || 'wellbeing';
  const routineAgeOptions = targetAgeRanges[routineGender] || targetAgeRanges.Everyone;
  const routineLifeStageOptions = targetLifeStages[routineGender] || targetLifeStages.Everyone;
  const routineNameTopic = rampTargetProblem.toLowerCase().replace(/ problems?$/, '').replace(/ changes?$/, ' balance');
  const routineNameLifeStage = routineLifeStage !== 'Not specified' ? `${routineLifeStage.toLowerCase()} ` : '';
  const routineNameAudience = routineGender === 'Everyone' ? rampTargetAudience.toLowerCase() : routineGender.toLowerCase();
  const routineTitlePrefix = '';
  const suggestedRoutineName = `${routineTitlePrefix}7-day ${routineNameLifeStage}${routineNameTopic} challenge for ${routineNameAudience}`;
  const leadMagnetIdeas = [
    `${routineTitlePrefix}3-day ${routineNameTopic} reset for ${routineNameAudience}`,
    `${routineTitlePrefix}5-day ${routineNameLifeStage}${routineNameTopic} starter plan`,
    `${routineTitlePrefix}7-day ${routineNameLifeStage}${routineNameTopic} challenge for ${routineNameAudience}`,
    `${routineTitlePrefix}14-day ${routineNameTopic} foundations`,
    `${routineTitlePrefix}Morning ${routineNameTopic} routine`,
    `${routineTitlePrefix}Evening ${routineNameTopic} routine`,
    `${routineTitlePrefix}${rampTargetProblem} first-aid plan`,
    `${routineTitlePrefix}${routineNameLifeStage}${routineNameTopic} daily checklist`,
    `${routineTitlePrefix}${routineNameTopic} habit tracker`,
    `${routineTitlePrefix}${routineNameTopic} self-assessment and action plan`,
    `${routineTitlePrefix}Weekend ${routineNameTopic} reset`,
    `${routineTitlePrefix}30-day ${routineNameTopic} roadmap`,
    `${routineTitlePrefix}${routineNameTopic} quick-start guide for ${routineNameAudience}`,
    `${routineTitlePrefix}Five changes for better ${routineNameTopic}`,
    `${routineTitlePrefix}${routineNameLifeStage}${routineNameTopic} myth and action guide`,
    `${routineTitlePrefix}Personal ${routineNameTopic} planner`,
    `${routineTitlePrefix}${routineNameTopic} preparation guide`,
    `${routineTitlePrefix}${routineNameTopic} progress journal`,
  ];
  const guardianSlug = displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || userId.slice(0, 8);
  const valueRampSlug = (leadMagnetTitle || suggestedRoutineName).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'value-ramp';
  const publishedSitePath = `/guardians/${guardianSlug}/value-ramp/${valueRampSlug}`;
  useEffect(() => {
    if (rampAudience !== rampTargetAudience) setRampAudience(rampTargetAudience);
    if (rampProblem !== rampTargetProblem) setRampProblem(rampTargetProblem);
  }, [rampAudience, rampProblem, rampTargetAudience, rampTargetProblem]);
  useEffect(() => {
    if (freeOfferType === 'routine') setLeadMagnetTitle(suggestedRoutineName);
  }, [freeOfferType, suggestedRoutineName]);
  const perspectiveTitle = activeStep.title;
  const activeStepImage = step === 2 ? realmImages[realm] : activeStep.image;
  const activeFreeOfferArt = freeOfferArt[freeOfferType];
  const activeFreeOfferArtCol = activeFreeOfferArt.index % activeFreeOfferArt.cols;
  const activeFreeOfferArtRow = Math.floor(activeFreeOfferArt.index / activeFreeOfferArt.cols);
  const orderedUpsells = [...selectedUpsells].sort((a, b) => {
    const accessOrder = Number(offerAccess[a] === 'paid') - Number(offerAccess[b] === 'paid');
    return accessOrder || Number(upsellDrafts[a].price || 0) - Number(upsellDrafts[b].price || 0);
  });
  const offerCards = [...upsellSuggestions]
    .sort((a, b) => Number(offerAccess[a.kind] === 'paid') - Number(offerAccess[b.kind] === 'paid') || Number(upsellDrafts[a.kind].price || 0) - Number(upsellDrafts[b.kind].price || 0));
  const funnelStages = [
    { amount: 0, kind: freeOfferType as string, price: 'Free', video: offerVideos.free, title: leadMagnetTitle || suggestedFreeOffer.title, value: freeAudienceValue, meta: `Free · ${freeDelivery.join(' + ')}`, action: freeOfferCta[freeOfferType] },
    ...orderedUpsells.map((kind) => ({ amount: offerAccess[kind] === 'free' ? 0 : Number(upsellDrafts[kind].price || 0), kind: kind as string, price: offerAccess[kind] === 'free' ? 'Free' : formatMoney(upsellDrafts[kind].price, currency), video: offerVideos[kind], title: upsellDrafts[kind].title, value: upsellDrafts[kind].audienceValue, meta: `${offerAccess[kind] === 'free' ? 'Free' : `${formatMoney(upsellDrafts[kind].price, currency)}${billingLabels[upsellDrafts[kind].billingModel].suffix}`} · ${kind === 'one_to_one_call' ? 'Limited offer · 30% off · ' : ''}${upsellDrafts[kind].delivery.join(' + ')}`, action: nextStepLabels[upsellDrafts[kind].nextStep].title })),
  ];
  const leadEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadCaptureValue.trim());
  const builtOfferCount = Number(freeOfferSetupStage >= 2) + orderedUpsells.filter((kind) => (paidOfferSetupStages[kind] || 0) >= 3).length;
  const totalOfferCount = orderedUpsells.length + 1;
  const openOfferEditor = (kind?: UpsellKind) => {
    const targetId = kind ? `offer-builder-${kind}` : 'offer-builder-entry';
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  async function openProtocolBuilder(kind?: 'routine' | 'routine_guidance') {
    if (onboardingProtocol) { setProtocolEditorVisible(false); setProtocolBuilderOpen(true); return; }
    setCreatingProtocol(true); setError('');
    try {
      const draft = kind ? upsellDrafts[kind] : null;
      const protocol = await findOrCreateProtocol(accessToken, {
        user_id: userId,
        name: draft?.title.trim() || leadMagnetTitle.trim() || suggestedRoutineName,
        description: `${draft?.audienceValue.trim() || freeAudienceValue.trim()} Audience: ${rampTargetAudience}. Population: ${routineGender}. Age: ${routineAge}. Health stage: ${routineLifeStage}. Goal: ${rampTargetProblem}.${protocolBrief.trim() ? ` Creator brief: ${protocolBrief.trim()}` : ''}${protocolSourceUrls.trim() ? ` Sources: ${protocolSourceUrls.trim().replace(/\n+/g, ', ')}` : ''}`.trim(),
        target_gender: routineGender,
        total_days: 7,
      });
      setOnboardingProtocol(protocol);
      setProtocolEditorVisible(false);
      setProtocolBuilderOpen(true);
    } catch (e: any) { setError(e.message || 'Could not create the Protocol draft.'); }
    finally { setCreatingProtocol(false); }
  }
  const protocolBuilderRequest = `Build a practical 7-day ${rampTargetProblem.toLowerCase()} Protocol for ${routineGender.toLowerCase()}, age ${routineAge}, at the ${routineLifeStage.toLowerCase()} stage. Use ROUTINE³ health database items and smart lists where suitable. Group meals as breakfast, lunch, dinner, snack or drink; group activities as fitness, wellness or hygiene. Include safe timings, amounts, adaptations, cautions and when to seek clinical advice.${protocolBrief.trim() ? ` Creator brief: ${protocolBrief.trim()}` : ''}${protocolSourceUrls.trim() ? ` Sources to consider: ${protocolSourceUrls.trim().replace(/\n+/g, ', ')}.` : ''}`;
  const activeFunnelStage = funnelStages[Math.min(funnelPreviewStage, funnelStages.length - 1)];
  const postPurchaseOffer = funnelStages[funnelPreviewStage + 1];
  const couponCode = `${((displayName || 'Guardian').split(' ')[0] || 'Guardian').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10)}30`;
  // One-click upsell page: same two-column card as the sign-up, a single "Add to my order" action
  // (payment already on file), 30% off while the timer runs, then the reviews rail.
  const upsellCard = (offer: (typeof funnelStages)[number], onYes: () => void, onNo: () => void) => {
    const live = funnelTimerSeconds > 0;
    const amount = offer.amount || 0;
    const total = live ? Math.round(amount * (1 - COUPON_RATE) * 100) / 100 : amount;
    const benefits = (offer.meta.split(' · ').slice(1).join(' · ') || 'Personal plan').split(/ \+ |, /).filter(Boolean).slice(0, 4);
    return <div {...tiltHandlers(3)} style={tiltStyle({ width: '100%', maxWidth: 880, margin: '0 auto', background: APP.bg, borderRadius: 24, overflow: 'hidden', fontFamily: APP.font, color: APP.text, textAlign: 'center', boxShadow: '0 20px 50px rgba(17,24,39,.18)', position: 'relative' })}><GlowLayer />
      {/* Pitch video sits above the urgency banner; a placeholder frame shows until the Guardian uploads one. */}
      <div style={{ position: 'relative', aspectRatio: '16 / 9', maxHeight: 380, width: '100%', background: '#111827', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>{offer.video ? <video src={offer.video} controls playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <>{avatarUrl && <img src={avatarUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .35, filter: 'grayscale(1)' }} />}<span style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', background: '#FFF', color: '#000', display: 'grid', placeItems: 'center' }}><Play size={24} fill="currentColor" /></span><span style={{ position: 'absolute', left: 16, bottom: 12, color: '#FFF', fontSize: 12, fontWeight: 600 }}>A message from {displayName || 'your Guardian'}</span></>}</div>
      {/* Urgency banner across the whole card: discount, countdown and the code already applied. */}
      <div style={{ background: live ? APP.greenSoft : APP.alt, color: '#000', padding: '10px 16px', fontSize: 12, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Clock size={14} strokeWidth={2.4} />{live ? <>30% off · ends in {String(Math.floor(funnelTimerSeconds / 60)).padStart(2, '0')}:{String(funnelTimerSeconds % 60).padStart(2, '0')} · code {couponCode} applied</> : 'Offer ended'}</div>
      <button type="button" aria-label="No thanks" onClick={onNo} style={{ position: 'absolute', zIndex: 2, top: 12, right: 12, width: 36, height: 36, border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.9)', color: APP.text, fontSize: 22, cursor: 'pointer' }}>×</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}><div style={{ flex: '1 1 340px', minWidth: 0, padding: '56px 28px 28px', display: 'grid', alignContent: 'start', justifyItems: 'start', textAlign: 'left' }}>
        <AppOfferImage kind={offer.kind} size={110} align="left" />
        <div style={{ margin: '12px 0 2px' }}><OfferFormatTag kind={offer.kind} /></div>
        <h3 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 700, lineHeight: '34px', letterSpacing: -0.8, margin: '14px 0 8px' }}>{customerFacingOfferTitle(offer.title)}</h3>
        <p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, lineHeight: '19px', margin: '0 0 14px' }}>{offer.value}</p>
      </div>
      <div {...tiltHandlers(6)} style={tiltStyle({ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignSelf: 'stretch', gap: 14, margin: 16, padding: '44px 22px 22px', background: APP.surface, borderRadius: 16, boxShadow: '0 2px 8px rgba(17,24,39,.08)' })}><GlowLayer />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, padding: '6px 0 4px' }}>
            {live && amount > 0 && <span style={{ color: APP.faint, fontSize: 20, fontWeight: 500, textDecoration: 'line-through' }}>{formatMoney(amount, currency)}</span>}
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.8 }}>{amount ? formatMoney(total, currency) : 'Free'}</span>
          </div>
      <div>
        <button type="button" onClick={onYes} style={{ ...appButton, fontSize: 17, fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Clock size={18} strokeWidth={2.4} />{live ? <>Get limited offer · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{`${String(Math.floor(funnelTimerSeconds / 60)).padStart(2, '0')}:${String(funnelTimerSeconds % 60).padStart(2, '0')}`}</span></> : 'Get it now'}</span></button>
      </div>
      </div></div>
      <div style={{ textAlign: 'left', margin: '0 16px', padding: '16px 0 18px', borderTop: `1px solid ${APP.border}` }}><ReviewRail reviews={guardianReviews.length ? guardianReviews : SAMPLE_REVIEWS} sample={!guardianReviews.length} accent={APP.greenDark} /></div>
    </div>;
  };
  useEffect(() => {
    if (!(funnelPageState === 'post_purchase' || (funnelPageState === 'access' && postPurchaseOffer)) || funnelTimerSeconds <= 0) return;
    const timer = window.setInterval(() => setFunnelTimerSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [funnelPageState, funnelTimerSeconds]);

  function confirmFunnelOffer() {
    setFunnelPageState('checkout');
  }

  function completeFunnelCheckout() {
    if (funnelPreviewStage === 0 && !leadEmailIsValid) return;
    setFunnelPurchases((current) => current.includes(activeFunnelStage.title) ? current : [...current, activeFunnelStage.title]);
    setCouponApplied(false); setCouponInput(''); setCouponError('');
    setFunnelTimerSeconds(600);
    setFunnelPageState('access');
  }
  // Coupon: 30% off the next offer while the timer runs.
  function applyCoupon(code = couponInput) {
    if (code.trim().toUpperCase() !== couponCode) { setCouponError('That code is not valid.'); return; }
    if (!funnelTimerSeconds) { setCouponError('This offer has expired.'); return; }
    setCouponInput(couponCode); setCouponApplied(true); setCouponError('');
  }

  function continueAfterAccess() {
    if (funnelPreviewStage >= funnelStages.length - 1) { setFunnelPageState('complete'); return; }
    setFunnelTimerSeconds(600);
    setFunnelPageState('post_purchase');
  }

  function resolvePostPurchase(accepted: boolean) {
    const nextIndex = funnelPreviewStage + 1;
    setFunnelUnlockedStage((current) => Math.max(current, nextIndex));
    setFunnelPreviewStage(nextIndex);
    // Accepting goes to checkout with the coupon already applied (if the timer is still running).
    // One click: the upsell is bought with the payment already on file; no second checkout page.
    if (accepted && postPurchaseOffer) { setFunnelPurchases((current) => current.includes(postPurchaseOffer.title) ? current : [...current, postPurchaseOffer.title]); setFunnelTimerSeconds(600); setFunnelPageState('access'); }
    else if (nextIndex >= funnelStages.length - 1) setFunnelPageState('complete');
    else setFunnelPageState('offer');
  }
  if (onboardingProtocol && protocolBuilderOpen) return <div style={{ minHeight: '100vh', background: '#F5F4EF', color: '#151515', fontFamily: sans }}>
    <header style={{ minHeight: 64, borderBottom: '1px solid #C9C6BC', padding: '10px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: '#11120F' }}><Brand /><span style={{ color: muted, fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>R3 Protocol Builder</span><button type="button" onClick={() => { setProtocolEditorVisible(false); setProtocolBuilderOpen(false); }} style={{ ...btn, minHeight: 38, background: 'transparent', color: ink }}>← Back to Offers</button></header>
    <main style={{ padding: 'clamp(16px,3vw,34px)' }}>
      <section aria-label="Selected Protocol offer" style={{ maxWidth: 1120, margin: '0 auto 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 18, alignItems: 'stretch' }}>
        <div style={{ minHeight: 360, border: `1px solid ${acid}`, background: '#20251B', color: ink, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <span style={{ position: 'absolute', zIndex: 2, top: 16, left: 16, width: 30, height: 30, border: `1px solid ${acid}`, borderRadius: '50%', display: 'grid', placeItems: 'center', color: acid, fontSize: 8, fontWeight: 700 }}>01</span>
          <span style={{ position: 'absolute', zIndex: 2, top: 16, right: 16, background: ink, color: black, padding: '10px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Lead magnet · Free</span>
          <div style={{ flex: '1 1 auto', padding: '68px clamp(22px,4vw,48px) 28px', display: 'grid', gridTemplateColumns: 'minmax(150px,220px) minmax(0,1fr)', gap: 'clamp(22px,4vw,46px)', alignItems: 'center' }}>
            <img src="/images/guides/generated/r3-protocol-card.png" alt="Printed Protocol and interactive ROUTINE³ app" style={{ display: 'block', width: '100%', maxWidth: 220, aspectRatio: '1', objectFit: 'contain' }} />
            <span><span style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${line}` }} /> : <span style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${line}`, fontFamily: serif }}>{(displayName || 'G')[0]}</span>}<span style={{ color: muted, fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>By {displayName || 'your Guardian'}</span></span><strong style={{ display: 'block', fontSize: 'clamp(21px,3vw,32px)', lineHeight: 1.16 }}>{onboardingProtocol.name || leadMagnetTitle}</strong><span style={{ display: 'block', marginTop: 11, color: muted, fontSize: 11, lineHeight: 1.55 }}>{freeAudienceValue}</span><span style={{ display: 'block', marginTop: 14 }}><CustomerValueStars score={5} compact /></span></span>
          </div>
          <div style={{ borderTop: `1px solid ${line}`, minHeight: 58, padding: '0 22px', background: 'rgba(245,242,234,.025)', display: 'flex', alignItems: 'center' }}><strong style={{ color: acid, fontSize: 9, letterSpacing: '.09em', textTransform: 'uppercase' }}>R3 Protocol · Step 01</strong></div>
        </div>
        <div style={{ border: '1px solid #C9C6BC', background: '#FFF', color: '#151515', padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><span><span style={{ display: 'block', color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase' }}>Selected offer</span><h2 style={{ fontFamily: serif, fontSize: 30, fontWeight: 300, lineHeight: 1.1, margin: '10px 0' }}>Build its Protocol.</h2><p style={{ color: '#686762', fontSize: 11, lineHeight: 1.6, margin: 0 }}>The audience, source material and generated ROUTINE³ steps below belong to this offer.</p></span><span style={{ color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{protocolEditorVisible ? 'Editing Protocol' : 'Setup in progress'}</span></div>
      </section>
      <GuardianProtocolAI
        accessToken={accessToken}
        protocol={onboardingProtocol}
        ownerId={userId}
        initialRequest={protocolBuilderRequest}
        initialSourceUrls={protocolSourceUrls}
        initialSourcePath={leadMagnetPath}
        audienceProfile={{ audience: rampTargetAudience, population: routineGender, age: routineAge, stage: routineLifeStage, problem: rampTargetProblem }}
        progressive
        onBuilt={() => { setOnboardingProtocolRevision((value) => value + 1); setFreeOfferSetupStage(2); }}
        onRevealEditor={() => setProtocolEditorVisible(true)}
      />
      {protocolEditorVisible && <ProtocolEditor key={`${onboardingProtocol.id}-${onboardingProtocolRevision}`} accessToken={accessToken} initialProtocolId={onboardingProtocol.id} ownerId={userId} />}
    </main>
  </div>;
  const leadMagnetCard = () => (() => { const art = freeOfferArt[freeOfferType]; return <div className="guardian-card" style={{ width: 320, flex: '0 0 320px', border: `1px solid ${acid}`, background: '#20251B', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ position: 'absolute', zIndex: 2, top: 10, left: 10, padding: '4px 7px', background: ink, color: black, fontSize: 9, fontWeight: 800, letterSpacing: '.06em' }}>#01</span>
                  <span style={{ position: 'absolute', zIndex: 2, top: 10, right: 10, background: ink, color: black, padding: '8px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Lead magnet · Free</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridTemplateRows: '128px 1px auto', alignItems: 'stretch' }}>{freeOfferType === 'routine' ? <img src="/images/guides/generated/r3-protocol-card.png" alt="Printed Protocol and interactive ROUTINE³ app" style={{ display: 'block', width: 84, height: 84, objectFit: 'contain', alignSelf: 'end', justifySelf: 'center', marginBottom: 10 }} /> : <span aria-hidden="true" style={{ display: 'block', alignSelf: 'end', justifySelf: 'center', marginBottom: 10, width: 76 * art.cellAspect, height: 76, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${(art.index % art.cols) * 100 / Math.max(1, art.cols - 1)}% ${Math.floor(art.index / art.cols) * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.92)' }} />}<span aria-hidden="true" style={{ background: line }} /><span style={{ padding: '14px 14px 16px', minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 25, height: 25, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${line}` }} /> : <span style={{ width: 25, height: 25, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${line}`, fontFamily: serif }}>{(displayName || 'G')[0]}</span>}<span style={{ color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>By {displayName || 'your Guardian'}</span></span><strong style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>{customerFacingOfferTitle(leadMagnetTitle) || 'Lead magnet'}</strong><span style={{ display: 'block', marginTop: 8, color: muted, fontSize: 10, lineHeight: 1.5 }}>{freeAudienceValue}</span><span style={{ display: 'block', marginTop: 10 }}><CustomerValueStars score={offerValueScores[freeOfferType]} compact /></span></span></div>
                  {/* Same boxes as the paid steps, read-only: a lead magnet is always free. */}
                  <div aria-label="Lead magnet access and price" style={{ borderTop: `1px solid ${line}`, marginTop: 'auto', padding: 10, background: 'rgba(245,242,234,.025)', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                    {[['Access', 'Free'], ['Payment', 'None']].map(([name, value]) => <div key={name}><span style={{ ...label, display: 'block', marginBottom: 5 }}>{name}</span><span style={{ ...input, ...compactControl, background: black, display: 'flex', alignItems: 'center', color: muted }}>{value}</span></div>)}
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>No charge</span><span style={{ ...input, ...compactControl, background: black, display: 'flex', alignItems: 'center', color: muted, opacity: .45 }}>{currencySymbol(currency)} 0</span></div>
                    {offerVideoField('free')}<span style={{ ...btn, ...compactControl, width: '100%', minHeight: 40, gridColumn: '1 / -1', boxSizing: 'border-box', background: 'transparent', color: acid, borderColor: line, cursor: 'default' }}>Lead magnet · Step 01</span>
                  </div>
                </div>; })();
  const paidOfferCard = (offer: (typeof offerCards)[number]) => {
                const art = offerTypeArt[offer.kind];
                const access = offerAccess[offer.kind];
                const suggestedPrice = upsellDrafts[offer.kind].price;
                const inPath = true;
                const stageNumber = orderedUpsells.indexOf(offer.kind) + 2;
                return <div className="guardian-card" style={{ width: 320, flex: '0 0 320px', border: `1px solid ${inPath ? acid : line}`, background: inPath ? '#20251B' : '#0D0E0C', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ position: 'absolute', zIndex: 2, top: 10, left: 10, padding: '4px 7px', background: ink, color: black, fontSize: 9, fontWeight: 800, letterSpacing: '.06em' }}>{inPath ? `#${String(stageNumber).padStart(2, '0')}` : '+'}</span>
                  <span style={{ position: 'absolute', zIndex: 2, top: 10, right: 10, background: ink, color: black, padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{access === 'free' ? 'Free' : `${formatMoney(suggestedPrice, currency)}${billingLabels[upsellDrafts[offer.kind].billingModel].suffix}`}</span>
                  <div style={{ ...({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridTemplateRows: '128px 1px auto', alignItems: 'stretch' } as React.CSSProperties), color: ink, fontFamily: sans, textAlign: 'left' }}>
                    <span role="img" aria-label={`${offer.label} illustration`} style={{ display: 'block', alignSelf: 'end', justifySelf: 'center', marginBottom: 10, width: 76, height: 76, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${(art.index % art.cols) * 100 / Math.max(1, art.cols - 1)}% ${Math.floor(art.index / art.cols) * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.98)' }} />
                    <span aria-hidden="true" style={{ background: line }} />
                    <span style={{ padding: '14px 14px 16px', minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${line}` }} /> : <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${line}`, fontFamily: serif, fontSize: 11 }}>{(displayName || 'G').charAt(0)}</span>}<span style={{ color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>By {displayName || 'you'}</span></span><strong style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>{offer.label}</strong><span style={{ display: 'block', color: muted, fontSize: 9, lineHeight: 1.45, marginTop: 6 }}>{offer.why}</span><span style={{ display: 'block', marginTop: 8 }}><CustomerValueStars score={offerValueScores[offer.kind]} compact /></span></span>
                  </div>
                  <div aria-label={`${offer.label} access and price`} style={{ borderTop: `1px solid ${line}`, marginTop: 'auto', padding: 10, background: 'rgba(245,242,234,.025)', display: 'grid', gridTemplateColumns: access === 'paid' ? 'repeat(2,minmax(0,1fr))' : '1fr', gap: 8 }}>
                    <div><label style={{ ...label, marginBottom: 5 }}>Access</label><select aria-label={`${offer.label} access`} value={access} onChange={(event) => setOfferAccess((current) => ({ ...current, [offer.kind]: event.target.value as 'free' | 'paid' }))} style={{ ...input, ...compactControl, paddingRight: 38, background: black }}><option value="free">Free</option><option value="paid">Paid</option></select></div>
                    {access === 'paid' && <div><label style={{ ...label, marginBottom: 5 }}>Payment</label><select aria-label={`${offer.label} payment model`} value={upsellDrafts[offer.kind].billingModel} onChange={(event) => updateUpsell(offer.kind, { billingModel: event.target.value as BillingModel })} style={{ ...input, ...compactControl, paddingRight: 38, background: black }}><option value="one_time">One time</option><option value="subscription">Monthly</option><option value="pack_10">10 sessions</option></select></div>}
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>{access === 'free' ? 'No charge' : `Suggested · ${formatMoney(suggestedPrice, currency)}${billingLabels[upsellDrafts[offer.kind].billingModel].suffix}`}</span><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 12, top: 13, color: access === 'free' ? line : muted, fontSize: 11 }}>{currencySymbol(currency)}</span><input aria-label={`${offer.label} price`} type="number" min="0" step="1" disabled={access === 'free'} value={access === 'free' ? '0' : upsellDrafts[offer.kind].price} onChange={(event) => updateUpsell(offer.kind, { price: event.target.value })} style={{ ...input, ...compactControl, paddingLeft: 34, background: black, opacity: access === 'free' ? .45 : 1 }} /></div></div>
                    {offerVideoField(offer.kind)}<button type="button" onClick={() => inPath ? toggleUpsell(offer.kind) : addValuePathOffer(offer.kind)} style={{ ...btn, ...compactControl, width: '100%', minHeight: 40, gridColumn: '1 / -1', background: inPath ? 'transparent' : ink, color: inPath ? ink : black }}>{inPath ? 'Remove' : 'Add'}{!inPath && <ArrowRight size={14} />}</button>
                  </div>
                </div>;
  };
  return <div onPointerMove={tiltCard} onPointerOut={resetTilt} style={{ minHeight: '100vh', background: black, color: ink, padding: '30px clamp(20px,6vw,90px)', fontFamily: sans }}>
    <style>{`@keyframes guardian-orbit{to{transform:rotate(360deg)}}.guardian-image-loader{animation:guardian-orbit 1.8s linear infinite}.guardian-card{--card-rotate-x:0deg;--card-rotate-y:0deg;transition:transform 160ms ease,border-color 180ms ease,box-shadow 180ms ease,background-color 180ms ease;transform-origin:center;transform-style:preserve-3d;will-change:transform;text-align:left}.guardian-card>span[aria-hidden="true"],.guardian-card [role="img"]{margin-left:0!important;margin-right:0!important}.guardian-card img{transition:filter 180ms ease;filter:grayscale(1) contrast(.92)!important}.guardian-card:hover{transform:perspective(700px) translateY(-5px) rotateX(var(--card-rotate-x)) rotateY(var(--card-rotate-y));box-shadow:0 16px 30px rgba(0,0,0,.3)}.guardian-card:not([aria-pressed="true"]):not([aria-disabled="true"]):hover{border-color:#A56B48!important;background-color:#171811!important}.guardian-card:hover img{filter:grayscale(0) contrast(1.02) saturate(1.08)!important}.guardian-card[aria-disabled="true"]:hover{transform:none;box-shadow:none}.guardian-card:focus-visible{outline:2px solid #C7D8A3;outline-offset:3px}@media(prefers-reduced-motion:reduce){.guardian-card,.guardian-image-loader{transition:none;animation:none}.guardian-card:hover{transform:none!important}}`}</style>
    {/* Same shared header as the landing and tool pages; negative margins cancel this page's padding so it spans full width. */}
    {/* maxWidth none: the site CSS caps every element at 100% under 768px, which would undo the full bleed. */}
    <div style={{ position: 'sticky', top: 0, zIndex: 50, margin: '-30px calc(-1 * clamp(20px,6vw,90px)) 0', maxWidth: 'none' }}>
      {/* Until a profile is saved every ?tab= URL re-renders this setup, so builder links would just reload it and drop unsaved answers. */}
      <GuardianHeader isSignedIn displayName={displayName} locked={hasProfile ? undefined : 'finish setup to open the builders'} onSignOut={() => signOut()} extra={<>
        <button type="button" onClick={() => setSummaryView('offers')} style={{ padding: 0, border: 0, borderBottom: summaryView === 'offers' ? `1px solid ${ink}` : '1px solid transparent', background: 'transparent', color: summaryView === 'offers' ? ink : muted, cursor: 'pointer', fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Offers <span style={{ color: acid }}>{builtOfferCount}/{totalOfferCount}</span></button>
        <button type="button" onClick={() => setSummaryView('sites')} style={{ padding: 0, border: 0, borderBottom: summaryView === 'sites' ? `1px solid ${ink}` : '1px solid transparent', background: 'transparent', color: summaryView === 'sites' ? ink : muted, cursor: 'pointer', fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Sites <span style={{ color: acid }}>2</span></button>
        <span aria-hidden="true" style={{ width: 1, height: 14, background: line }} />
      </>} />
    </div>
    <div aria-label="Guardian setup progress" style={{ maxWidth: 1100, margin: '42px auto 0', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}` }}>
      {steps.map((item) => <button type="button" key={item.n} onClick={() => { setSummaryView(null); setStep(item.n); }} aria-current={!summaryView && step === item.n ? 'step' : undefined} style={{ height: 54, border: 0, borderRight: item.n < 5 ? `1px solid ${line}` : 0, background: !summaryView && step === item.n ? ink : 'transparent', color: !summaryView && step === item.n ? black : item.n < step ? acid : muted, fontFamily: sans, cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{String(item.n).padStart(2, '0')} · {item.label}</button>)}
    </div>
    {summaryView && <section style={{ maxWidth: 1100, margin: '52px auto', border: `1px solid ${line}`, background: panel }}>
      <div style={{ padding: 22, borderBottom: `1px solid ${line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span><span style={{ ...label, color: acid }}>{summaryView === 'offers' ? 'Offer inventory' : 'Site inventory'}</span><h1 style={{ margin: '7px 0 0', fontFamily: serif, fontWeight: 300, fontSize: 42 }}>{summaryView === 'offers' ? 'All offers' : 'All sites'}</h1></span>
        <button type="button" onClick={() => { setInventoryMenu(null); setSummaryView(null); }} style={{ ...btn, background: 'transparent', color: ink }}>Back to setup</button>
      </div>
      {summaryView === 'offers' ? <div><div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}`, background: '#171913' }}>
        <span style={{ ...label, color: acid, marginBottom: 7 }}>Offers</span>
        <h2 style={{ margin: '0 0 14px', fontFamily: serif, fontSize: 28, fontWeight: 300 }}>{leadMagnetTitle || suggestedRoutineName}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {[['Audience', rampTargetAudience], ['Gender', routineGender], ['Age', routineAge], ['Life stage', routineLifeStage], ['Problem', rampTargetProblem]].map(([key, value]) => <span key={key} style={{ border: `1px solid ${line}`, padding: '7px 9px', color: muted, fontSize: 8, lineHeight: 1.3 }}><strong style={{ color: ink, textTransform: 'uppercase', letterSpacing: '.08em' }}>{key}</strong> · {value}</span>)}
        </div>
      </div><div style={{ marginLeft: 24, borderLeft: `1px solid ${acid}` }}>{[
        { key: 'lead', title: leadMagnetTitle || 'Entry offer', meta: `${freeOfferTypes.find((item) => item.value === freeOfferType)?.label} · Free`, built: freeOfferSetupStage >= 2, art: freeOfferArt[freeOfferType], kind: undefined as UpsellKind | undefined },
        ...orderedUpsells.map((kind) => ({ key: kind, title: upsellDrafts[kind].title, meta: `${offerAccess[kind] === 'paid' ? `${formatMoney(upsellDrafts[kind].price, currency)}${billingLabels[upsellDrafts[kind].billingModel].suffix}` : 'Free'} · ${upsellSuggestions.find((item) => item.kind === kind)?.label || kind}`, built: (paidOfferSetupStages[kind] || 0) >= 3, art: offerTypeArt[kind], kind })),
      ].map((offer) => {
        const openBuilder = (createContent: boolean) => {
          setInventoryMenu(null);
          setSummaryView(null);
          setStep(4);
          setOfferPlanStage(2);
          if (createContent) offer.kind ? setPaidOfferSetupStages((current) => ({ ...current, [offer.kind!]: Math.max(1, current[offer.kind!] || 0) })) : setFreeOfferSetupStage((current) => Math.max(1, current));
          openOfferEditor(offer.kind);
        };
        const offerIndex = offer.key === 'lead' ? 0 : orderedUpsells.indexOf(offer.kind!) + 1;
        return <div key={offer.key} style={{ position: 'relative', minHeight: 96, padding: '16px 18px', borderBottom: `1px solid ${line}`, display: 'grid', gridTemplateColumns: '32px 54px minmax(0,1fr) auto auto', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 28, height: 28, marginLeft: -33, border: `1px solid ${acid}`, borderRadius: '50%', background: panel, color: acid, display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800 }}>{String(offerIndex + 1).padStart(2, '0')}</span>
          <InventoryThumb art={offer.art} />
          <span><strong style={{ display: 'block', color: ink, fontSize: 13 }}>{offer.title}</strong><span style={{ display: 'block', color: muted, fontSize: 9, marginTop: 4 }}>{offer.meta}</span><span style={{ display: 'block', color: acid, fontSize: 7, marginTop: 7, letterSpacing: '.07em', textTransform: 'uppercase' }}>{rampTargetAudience} · {routineGender} · {routineAge} · {rampTargetProblem}</span></span>
          <span style={{ color: offer.built ? acid : '#D49A74', fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{offer.built ? 'Built' : 'Draft'}</span>
          <button type="button" aria-label={`Actions for ${offer.title}`} aria-expanded={inventoryMenu === offer.key} onClick={() => setInventoryMenu((current) => current === offer.key ? null : offer.key)} style={{ width: 38, height: 38, border: `1px solid ${line}`, background: 'transparent', color: ink, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><MoreHorizontal size={19} /></button>
          {inventoryMenu === offer.key && <div role="menu" style={{ position: 'absolute', zIndex: 8, right: 18, top: 60, width: 158, border: `1px solid ${line}`, background: black, boxShadow: '0 14px 28px rgba(0,0,0,.42)', padding: 4 }}>
            <button type="button" role="menuitem" onClick={() => openBuilder(false)} style={{ width: '100%', border: 0, background: 'transparent', color: ink, padding: '10px 12px', textAlign: 'left', fontFamily: sans, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
            <button type="button" role="menuitem" onClick={() => openBuilder(true)} style={{ width: '100%', border: 0, borderTop: `1px solid ${line}`, background: 'transparent', color: ink, padding: '10px 12px', textAlign: 'left', fontFamily: sans, fontWeight: 700, cursor: 'pointer' }}>Create content</button>
          </div>}
        </div>;
      })}</div>
      <ContentStudio creator={displayName} avatar={avatarUrl} audience={audience.map(describeAudience).join(' · ') || rampTargetAudience} problem={rampTargetProblem} siteUrl={publishedSitePath}
        offers={[{ title: customerFacingOfferTitle(leadMagnetTitle || suggestedRoutineName), free: true, description: freeAudienceValue }, ...orderedUpsells.map((kind) => ({ title: upsellDrafts[kind].title, free: offerAccess[kind] !== 'paid', price: formatMoney(upsellDrafts[kind].price, currency), description: upsellDrafts[kind].audienceValue }))]} />
      </div> : <div style={{ padding: 22, display: 'grid', gap: 10 }}>
        {[
          { key: 'profile-site', type: 'Profile site', title: `${displayName || 'Guardian'} profile`, path: `/guardians/${guardianSlug}`, previewId: 'profile-site-preview' },
          { key: 'funnel-site', type: 'Offer funnel', title: leadMagnetTitle || 'Offer site', path: publishedSitePath, previewId: 'value-ramp-funnel-preview' },
        ].map((site) => <div key={site.key} style={{ position: 'relative', border: `1px solid ${line}`, minHeight: 92, padding: 14, display: 'grid', gridTemplateColumns: '82px minmax(0,1fr) auto auto', gap: 16, alignItems: 'center' }}>
          <img src={effectiveBackground} alt="" style={{ width: 82, height: 62, objectFit: 'cover', filter: 'grayscale(1)' }} />
          <span><span style={{ display: 'block', color: acid, fontSize: 7, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 5 }}>{site.type}</span><strong style={{ display: 'block', color: ink, fontSize: 13 }}>{site.title}</strong><code style={{ display: 'block', color: muted, fontSize: 9, marginTop: 6 }}>{site.path}</code></span>
          <span style={{ color: '#D49A74', fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Draft</span>
          <button type="button" aria-label={`Actions for ${site.title}`} aria-expanded={inventoryMenu === site.key} onClick={() => setInventoryMenu((current) => current === site.key ? null : site.key)} style={{ width: 38, height: 38, border: `1px solid ${line}`, background: 'transparent', color: ink, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><MoreHorizontal size={19} /></button>
          {inventoryMenu === site.key && <div role="menu" style={{ position: 'absolute', zIndex: 8, right: 14, top: 64, width: 158, border: `1px solid ${line}`, background: black, boxShadow: '0 14px 28px rgba(0,0,0,.42)', padding: 4 }}>
            <button type="button" role="menuitem" onClick={() => { setInventoryMenu(null); setSummaryView(null); setStep(5); setSiteStyleStage(site.key === 'profile-site' ? 0 : 2); }} style={{ width: '100%', border: 0, background: 'transparent', color: ink, padding: '10px 12px', textAlign: 'left', fontFamily: sans, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
            <button type="button" role="menuitem" onClick={() => { setInventoryMenu(null); setSummaryView(null); setStep(5); window.setTimeout(() => document.getElementById(site.previewId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} style={{ width: '100%', border: 0, borderTop: `1px solid ${line}`, background: 'transparent', color: ink, padding: '10px 12px', textAlign: 'left', fontFamily: sans, fontWeight: 700, cursor: 'pointer' }}>Preview and test</button>
          </div>}
        </div>)}
      </div>}
    </section>}
    {!summaryView && <form onSubmit={submit} style={{ maxWidth: step === 5 ? 1440 : 1100 /* step 05 shows two side-by-side previews */, margin: '52px auto', minHeight: 'calc(100vh - 220px)' }}>
      <div style={{ display: 'block' }}>
        <aside style={{ display: 'none' }}>
          <div style={{ ...label, color: acid }}>Step {step} · {activeStep.label}</div>
          <img src={activeStepImage} alt="" style={{ width: '100%', maxWidth: 220, height: 220, objectFit: 'contain', filter: 'grayscale(1) contrast(.92) brightness(.8)', opacity: .92, margin: '12px 0 18px' }} />
          <p style={{ color: muted, fontSize: 12, lineHeight: 1.65, maxWidth: 220, margin: 0 }}>{activeStep.copy}</p>
        </aside>
        <section style={{ width: '100%', maxWidth: step === 5 ? 1440 : 920, minWidth: 0, margin: '0 auto' }}>
          <header style={{ maxWidth: 720, margin: '0 auto 44px', textAlign: 'center' }}>
            <div style={{ ...label, color: acid }}>Guardian setup · {step} of 5</div>
            <img src={activeStepImage} alt="" style={{ display: 'block', width: 138, height: 138, objectFit: 'contain', filter: 'grayscale(1) contrast(.92) brightness(.86)', margin: '18px auto 14px' }} />
            <h1 style={{ color: ink, fontFamily: serif, fontSize: 'clamp(44px,7vw,76px)', fontWeight: 300, lineHeight: .98, margin: 0 }}>{perspectiveTitle}</h1>
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.6, margin: '14px auto 0', maxWidth: 600 }}>{activeStep.copy}</p>
          </header>

      {step === 1 && <>
      {/* Brand picker: one quiet line. Most Guardians publish under their own name, so it should not compete with the form. */}
      <div aria-label="Publishing brand" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 0 16px', marginBottom: 20, borderBottom: `1px solid ${line}` }}>
        <span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 4 }}>Publishing as</span>
        {brandProfiles.map((brand) => { const active = brand.localId === activeBrandId; const visibleName = (active ? displayName : brand.name) || 'Untitled brand'; const visibleLogo = active ? logoUrl : brand.logo_url; return <button type="button" key={brand.localId} onClick={() => selectBrand(brand.localId)} aria-pressed={active} title={brand.kind === 'personal' ? 'Personal brand' : 'Business brand'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px 0 4px', border: `1px solid ${active ? ink : line}`, borderRadius: 2, background: active ? 'rgba(245,242,234,.08)' : 'transparent', color: active ? ink : muted, fontFamily: sans, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <span style={{ position: 'relative', width: 20, height: 20, display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${line}`, fontFamily: serif, fontSize: 11 }}>{visibleName.trim().charAt(0)}{visibleLogo && <img src={visibleLogo} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
          {visibleName}
        </button>; })}
        <button type="button" onClick={addBrand} style={{ border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '0 6px' }}><Plus size={12} /> Add brand</button>
        {activeBrandId !== 'personal' && <button type="button" onClick={removeActiveBrand} style={{ border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', padding: '0 6px', marginLeft: 'auto' }}>Remove brand</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div><label style={label}>{activeBrandId === 'personal' ? 'Your public name' : 'Brand name'}</label><div style={{ position: 'relative' }}>{avatarUrl && <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', zIndex: 1, left: 9, top: 7, width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${line}` }} />}<input style={{ ...input, paddingLeft: avatarUrl ? 48 : 12 }} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></div></div>
        <div><label style={label}>Main language</label><div style={{ position: 'relative' }}><span aria-hidden="true" style={{ position: 'absolute', zIndex: 1, left: 11, top: 11, fontSize: 16 }}>{languageOptions.find((language) => language.name === mainLanguage)?.flag || '🌐'}</span><select style={{ ...input, paddingLeft: 42 }} value={mainLanguage} onChange={(event) => setMainLanguage(event.target.value)}>{languageOptions.map((language) => <option key={language.code} value={language.name}>{language.name}</option>)}</select></div></div>
        <div><label style={label}>Pricing region</label><select style={input} value={pricingRegion} onChange={(event) => { const option = pricingRegions.find((item) => item.region === event.target.value); if (option) { setPricingRegion(option.region); setCurrency(option.currency); } }}>{pricingRegions.map((option) => <option key={option.region} value={option.region}>{option.label}</option>)}</select></div>
      </div>
      {/* Profile image: one compact row, like the brand line above. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        {avatarUrl ? <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" style={{ width: 36, height: 36, objectFit: 'cover', border: `1px solid ${line}` }} /> : <span aria-hidden="true" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, color: muted, fontFamily: serif, fontSize: 16 }}>{displayName.trim().charAt(0) || 'B'}</span>}
        <span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Profile image · optional</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{uploading ? 'Uploading' : avatarUrl ? 'Replace' : 'Upload'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadPortrait(event.target.files?.[0])} style={{ display: 'none' }} />
        </label>
        {importMessage && <p style={{ color: importMessage.startsWith('Imported') ? acid : muted, fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>{importMessage}</p>}
      </div>
      <p style={{ color: muted, fontSize: 10, lineHeight: 1.5, margin: '9px 0 0' }}>Language applies to your page and content. Pricing region sets the currency for every paid stage.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 18 }}>
        <div><label style={label}>Contact email</label><input type="email" style={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com" required /></div>
        <div><label style={label}>WhatsApp number <span style={{ color: muted }}>· optional</span></label><input type="tel" inputMode="tel" style={input} value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="+44 7700 900000" /></div>
      </div>
      <p style={{ color: muted, fontSize: 10, lineHeight: 1.5, margin: '9px 0 0' }}>If you add WhatsApp, include the international country code. These details can be changed before your Guardian page is published.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 22 }}>
        <SocialUrlField label="Instagram" Icon={Instagram} value={instagramUrl} onChange={setInstagramUrl} placeholder="https://instagram.com/yourname" />
        <SocialUrlField label="TikTok" Icon={AtSign} value={tiktokUrl} onChange={setTiktokUrl} placeholder="https://tiktok.com/@yourname" />
        <SocialUrlField label="YouTube" Icon={Youtube} value={youtubeUrl} onChange={setYoutubeUrl} placeholder="https://youtube.com/@yourname" />
        <SocialUrlField label="Linktree" Icon={Link2} value={linktreeUrl} onChange={setLinktreeUrl} placeholder="https://linktr.ee/yourname" />
        <SocialUrlField label="Personal website" Icon={Globe2} value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://yourwebsite.com" />
      </div>
      {/* The selected brand's look: logo, background, typeface and buttons. */}
      <BrandKitFields userId={userId} brandName={displayName} kit={brandKit} onChange={setBrandKit} logoUrl={logoUrl} onLogo={setLogoUrl} accessToken={accessToken} facts={{ about: intro, tags: expertiseTags, audience: audience.join(', ') }} />
      {importedProfile?.topics.length ? <div style={{ borderTop: `1px solid ${line}`, paddingTop: 18, marginTop: 24 }}><span style={label}>Detected guidance</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{importedProfile.topics.map((topic) => <span key={topic} style={{ border: `1px solid ${acid}`, color: acid, padding: '6px 9px', fontSize: 10 }}>{topic}</span>)}</div></div> : null}
      <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 24 }}>
        <label style={{ ...label, color: ink }}>How should clients book with you? <span style={{ color: muted }}>· optional</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 7, marginBottom: 10 }}>
          {bookingProviders.map((provider) => <button type="button" key={provider.value} onClick={() => setBookingProvider(provider.value)} style={{ ...pickStyle(bookingProvider === provider.value), whiteSpace: 'nowrap', minWidth: 0 }}>{provider.label}</button>)}
        </div>
        <input type="url" style={input} value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} placeholder={bookingProviders.find((provider) => provider.value === bookingProvider)?.placeholder} />
        <p style={{ color: muted, fontSize: 9, lineHeight: 1.5, margin: '8px 0 0' }}>This becomes the default booking link for live guidance, group calls, 1:1 sessions and in-person offers.</p>
      </div>
      </>}

      {step === 2 && <div>
        <label style={label}>What can you help with?</label>
        <div role="tablist" aria-label="Guidance area" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: `1px solid ${line}`, marginBottom: 12 }}>
          {(Object.keys(specialtyGroups) as GuideRealm[]).map((item, index) => {
            const count = specialtyGroups[item].filter((option) => chosen.includes(option)).length;
            const active = realm === item;
            return <button type="button" role="tab" aria-selected={active} key={item} onClick={() => setRealm(item)} style={{ minHeight: 46, border: 0, borderLeft: index ? `1px solid ${line}` : 0, background: active ? ink : 'transparent', color: active ? black : ink, fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '.12em', cursor: 'pointer' }}>{item.toUpperCase()}{count ? ` · ${count}` : ''}</button>;
          })}
        </div>
        <div role="tabpanel" style={{ ...CHOICE_GRID, alignContent: 'flex-start' }}>
          {specialtyGroups[realm].map((s) => <div key={s} style={{ display: 'grid', alignContent: 'start' }}><TagChoice text={s} description={specialtyHelp[s]} active={chosen.includes(s)} art={specialtyArt[realm][s]} onClick={() => setChosen((v) => v.includes(s) ? v.filter((x) => x !== s) : [...v, s])} />{chosen.includes(s) && specialtyRoles[s] && <div style={{ border: `1px solid ${line}`, borderTop: 0, background: 'rgba(245,242,234,.04)', padding: '10px 12px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 2 }}>Your role</span>{specialtyRoles[s].map((r) => { const on = roles.includes(r); return <button key={r} type="button" aria-pressed={on} onClick={() => setRoles((v) => on ? v.filter((x) => x !== r) : [...v, r])} style={{ height: 26, padding: '0 10px', border: `1px solid ${on ? acid : line}`, background: on ? '#20251B' : 'transparent', color: on ? acid : ink, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{r}</button>; })}</div>}</div>)}
        </div>
        {chosen.length > 0 && <div style={{ color: muted, fontSize: 10, lineHeight: 1.5, marginTop: 8 }}>Selected: {chosen.join(' · ')}</div>}
      </div>}

      {step === 3 && <>
        {audienceSetupStage > 0 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Audience</span><strong style={{ color: ink, fontSize: 12, fontWeight: 600 }}>{audience.map(describeAudience).join(' · ')}</strong></span><button type="button" onClick={() => setAudienceSetupStage(0)} style={{ ...btn, minHeight: 36, height: 36, background: 'transparent', color: ink, fontSize: 9 }}>Edit</button></div>}
        {audienceSetupStage === 0 && <div>
          <style>{`.age-range{position:relative;height:22px}.age-range input[type=range]{position:absolute;inset:0;width:100%;margin:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none}.age-range input[type=range]::-webkit-slider-thumb{pointer-events:auto;-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${ink};border:2px solid ${black};cursor:pointer}.age-range input[type=range]::-moz-range-thumb{pointer-events:auto;width:16px;height:16px;border-radius:50%;background:${ink};border:2px solid ${black};cursor:pointer}`}</style>
          <label style={label}>Who do you help?</label>
          <div style={{ ...CHOICE_GRID, alignItems: 'start' }}>{['Everyone', 'Busy families'].map((x) => <div key={x} style={{ display: 'grid', alignContent: 'start' }}><TagChoice text={x === 'Busy families' ? 'Families' : x} description={audienceHelp[x]} active={audience.includes(x)} art={audienceArt[x]} onClick={() => toggleAudience(x)} />{audience.includes(x) && agePanel(x)}</div>)}</div>
          <label style={{ ...label, marginTop: 18 }}>Individuals <span style={{ color: muted }}>· age range and stage for each</span></label>
          <div style={{ ...CHOICE_GRID, alignItems: 'start' }}>{['Women', 'Men', 'Children', 'Teenagers', 'Athletes'].map((x) => <div key={x} style={{ display: 'grid', alignContent: 'start' }}><TagChoice text={x} description={audienceHelp[x]} active={audience.includes(x)} art={audienceArt[x]} onClick={() => toggleAudience(x)} />{audience.includes(x) && audienceDetails[x] && agePanel(x)}</div>)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 14 }}><button type="button" onClick={() => setStep(2)} style={{ ...btn, background: 'transparent', color: ink }}>← Back</button><button type="button" disabled={!audience.length} onClick={() => setAudienceSetupStage(1)} style={btn}>Continue <ArrowRight size={14} /></button></div>
        </div>}
        {audienceSetupStage > 1 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Problems by audience</span><strong style={{ color: ink, fontSize: 12, fontWeight: 600 }}>{audience.map((group) => `${group}: ${(audienceProblemsByGroup[group] || []).join(', ')}`).join(' · ')}</strong></span><button type="button" onClick={() => setAudienceSetupStage(1)} style={{ ...btn, minHeight: 36, height: 36, background: 'transparent', color: ink, fontSize: 9 }}>Edit</button></div>}
        {audienceSetupStage === 1 && <div>
          <label style={label}>What problems do you help each audience with? <span style={{ color: acid }}>· choose more than one</span></label>
          <div style={{ display: 'grid', gap: 14 }}>{audience.map((group) => { const fromAge = ageProblems(group); const selectedNow = audienceProblemsByGroup[group] || []; const suggestions = Array.from(new Set([...fromAge, ...(audienceProblemSuggestionsByGroup[group] || audienceProblemSuggestions)])).slice(0, fromAge.length ? Math.max(6, fromAge.length) : 6).concat(selectedNow.filter((x) => audienceProblemSuggestions.includes(x) || ageProblems(group).includes(x) || Object.values(STAGE_PROBLEMS).some((l) => l.includes(x)))).filter((x, i, all) => all.indexOf(x) === i); const selected = audienceProblemsByGroup[group] || []; const customProblems = selected.filter((problem) => !suggestions.includes(problem)); return <section key={group} style={{ border: `1px solid ${line}`, padding: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><span aria-hidden="true" style={{ width: 36, height: 36, flex: '0 0 36px', backgroundImage: `url(${audienceArt[group].src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${audienceArt[group].cols * 100}% ${audienceArt[group].rows * 100}%`, backgroundPosition: `${(audienceArt[group].index % audienceArt[group].cols) * 100 / Math.max(1, audienceArt[group].cols - 1)}% ${Math.floor(audienceArt[group].index / audienceArt[group].cols) * 100 / Math.max(1, audienceArt[group].rows - 1)}%`, filter: 'grayscale(1) contrast(.94)' }} /><strong style={{ color: ink, fontSize: 14 }}>{group}</strong><span style={{ color: muted, fontSize: 9 }}>{selected.length} selected</span></div>{audienceDetails[group] && <div style={{ marginBottom: 10 }}>{agePanel(group)}</div>}<div style={CHOICE_GRID}>{suggestions.map((problem) => <TagChoice key={problem} text={problem} description={`Support ${group === 'Everyone' ? 'anyone' : group.toLowerCase()} with ${problem.toLowerCase()}`} active={selected.includes(problem)} badge={problemRealm(problem)} art={audienceProblemArt[problem] || audienceProblemArt[AGE_PROBLEM_ART[problem]] || audienceProblemArt['Healthy routines']} onClick={() => toggleAudienceProblem(group, problem)} />)}</div><div style={{ display: 'flex', gap: 7, marginTop: 9 }}><input style={input} value={audienceProblemDrafts[group] || ''} onChange={(event) => setAudienceProblemDrafts((current) => ({ ...current, [group]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addAudienceProblem(group); } }} placeholder={`Add another issue for ${group.toLowerCase()}`} /><button type="button" onClick={() => addAudienceProblem(group)} disabled={!(audienceProblemDrafts[group] || '').trim()} style={{ ...btn, flex: '0 0 auto' }}>Add</button></div>{customProblems.length > 0 && <div style={{ ...CHOICE_GRID, marginTop: 10 }}>{customProblems.map((problem) => <TagChoice key={problem} text={problem} description="Your own issue · click to remove" active art={audienceArt[group]} onClick={() => toggleAudienceProblem(group, problem)} />)}</div>}</section>; })}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 14 }}><button type="button" onClick={() => setAudienceSetupStage(0)} style={{ ...btn, background: 'transparent', color: ink }}>← Back</button><button type="button" disabled={audience.some((group) => !(audienceProblemsByGroup[group] || []).length)} onClick={() => { setError(''); setOfferPlanStage(0); setStep(4); }} style={btn}>Continue to offers <ArrowRight size={14} /></button></div>
        </div>}
      </>}

      {step === 4 && <>
        <div style={{ border: `1px solid ${line}`, background: panel, padding: 16, marginBottom: 28 }}>
          {(() => { const stageCopy = [
            { title: 'Choose a business goal', copy: 'Decide whether this offer system should convert your current audience or help you build a larger one.' },
            { title: 'Choose your lead magnets', copy: 'Select one or more useful free offers that introduce your expertise and give people a reason to continue.' },
            { title: 'Build your offers', copy: 'Arrange increasingly valuable offers from the first free win through paid knowledge and personal support.' },
          ][offerPlanStage]; return <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 12, alignItems: 'center', marginBottom: 16 }}><img src={['/images/guides/offer-plate.png', '/images/guides/lead-plate.png', '/images/guides/build-plate.png'][offerPlanStage]} alt="" style={{ width: 52, height: 52, objectFit: 'contain', filter: 'grayscale(1) contrast(.94)' }} /><span><strong style={{ display: 'block', color: ink, fontFamily: serif, fontSize: 22, fontWeight: 400, lineHeight: 1.15 }}>{stageCopy.title}</strong><span style={{ display: 'block', maxWidth: 650, marginTop: 5, color: muted, fontSize: 9, lineHeight: 1.5 }}>{stageCopy.copy}</span></span></div>; })()}
          {offerPlanStage === 0 && <div>
          <label style={{ ...label, color: acid }}>Business goal</label>
          <div style={CHOICE_GRID}>
            {([
              { value: 'basic', eyebrow: 'Basic', title: 'Start simple', copy: 'One free Protocol that leads to one paid Protocol. Nothing to schedule.', image: '/images/guides/build-plate.png', flow: ['Free Protocol', 'Paid Protocol'] },
              { value: 'sell', eyebrow: 'Convert', title: 'Convert your audience', copy: 'Move from a useful free win into paid knowledge and personal support.', image: '/images/guides/offer-plate.png', flow: ['Free value', 'Paid Protocol', 'Personal support'] },
              { value: 'audience', eyebrow: 'Grow', title: 'Build your audience', copy: 'Lead with generous free value and recurring reasons to come back.', image: '/images/guides/lead-plate.png', flow: ['Free resource', 'Group call', 'Community'] },
            ] as const).map((goal) => <CreatorChoiceCard key={goal.value} creator={displayName || 'Your Guardian'} avatarUrl={avatarUrl} badge={goal.eyebrow} byline="Business goal" title={goal.title} description={goal.copy} footer={goal.flow.join(' → ')} active={offerGoal === goal.value} image={goal.image} onClick={() => applyOfferGoal(goal.value)} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 18 }}><button type="button" onClick={() => setStep(3)} style={{ ...btn, width: '100%', background: 'transparent', color: ink }}>← Back to audience</button><button type="button" onClick={() => setOfferPlanStage(1)} style={{ ...btn, width: '100%' }}>Continue <ArrowRight size={14} /></button></div>
          </div>}
          {offerPlanStage === 1 && <div>
            <div style={{ border: `1px solid ${line}`, padding: 11, marginBottom: 16, display: 'grid', gridTemplateColumns: '46px minmax(0,1fr) auto', gap: 11, alignItems: 'center' }}><img src={offerGoal === 'sell' ? '/images/guides/offer-plate.png' : offerGoal === 'basic' ? '/images/guides/build-plate.png' : '/images/guides/lead-plate.png'} alt="" style={{ width: 46, height: 46, objectFit: 'contain', filter: 'grayscale(1) contrast(.94)' }} /><span><span style={{ display: 'block', color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Selected business goal</span><strong style={{ display: 'block', color: ink, fontSize: 12, marginTop: 4 }}>{offerGoal === 'sell' ? 'Convert your audience' : offerGoal === 'basic' ? 'Start simple' : 'Build your audience'}</strong><span style={{ display: 'block', color: muted, fontSize: 8, marginTop: 3 }}>{offerGoal === 'sell' ? 'Free value → paid Protocol → personal support' : offerGoal === 'basic' ? 'Free Protocol → paid Protocol' : 'Free resource → group call → community'}</span></span><button type="button" onClick={() => setOfferPlanStage(0)} style={{ ...btn, minHeight: 34, height: 34, background: 'transparent', color: ink, padding: '0 11px', fontSize: 8 }}>Edit</button></div>
            <label style={label}>Choose lead magnets <span style={{ color: acid }}>· one or more</span></label>
            <div style={CHOICE_GRID}>{freeOfferTypes.map((offer) => { const active = selectedLeadMagnets.includes(offer.value); const toggle = () => { setSelectedLeadMagnets((current) => active ? current.length === 1 ? current : current.filter((item) => item !== offer.value) : [...current, offer.value]); if (!active) setFreeOfferType(offer.value); }; return <CreatorChoiceCard key={offer.value} creator={displayName || 'Your Guardian'} avatarUrl={avatarUrl} badge={offer.eyebrow} byline={offer.label} title={offer.label} description={offer.copy} footer={`Lead magnet · ${offer.label}`} order={active ? selectedLeadMagnets.indexOf(offer.value) + 1 : undefined} active={active} image={freeOfferImages[offer.value]} onClick={toggle} onInfo={offer.value === 'routine' ? () => setShowProtocolInfo(true) : undefined} />; })}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 18 }}><button type="button" onClick={() => setOfferPlanStage(0)} style={{ ...btn, width: '100%', background: 'transparent', color: ink }}>← Back</button><button type="button" onClick={() => setOfferPlanStage(2)} style={{ ...btn, width: '100%' }}>Continue <ArrowRight size={14} /></button></div>
            {showProtocolInfo && <GuardianModal label="R3 Protocol information" closeLabel="Close R3 Protocol information" onClose={() => setShowProtocolInfo(false)} panelStyle={{ background: panel, color: ink, border: `1px solid ${acid}` }} footerStyle={{ borderColor: line }} footer={<div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}><button type="button" onClick={() => { setSelectedLeadMagnets((current) => current.includes('routine') ? current : ['routine', ...current]); setFreeOfferType('routine'); setFreeDelivery(['Downloadable PDF', 'Interactive Protocol']); setShowProtocolInfo(false); }} style={{ ...btn, flex: '1 1 200px', minHeight: 48 }}>Use R3 Protocol <ArrowRight size={14} /></button><a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ ...btn, flex: '1 1 200px', minHeight: 48, boxSizing: 'border-box', background: 'transparent', color: ink, textDecoration: 'none', textAlign: 'center' }}>View ROUTINE³ on the App Store <ArrowRight size={14} /></a></div>}>
                <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 18, alignItems: 'center', marginRight: 42 }}><R3CreatorBenefitArt index={0} size={96} /><span><span style={{ color: acid, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>R3 Protocol · A remarkable creator opportunity</span><h3 id="r3-protocol-info-title" style={{ margin: '9px 0 0', fontFamily: serif, fontSize: 32, fontWeight: 400, lineHeight: 1.08 }}>Build guidance that keeps working between every conversation.</h3></span></div>
                <p style={{ margin: '14px 0 18px', color: muted, fontSize: 11, lineHeight: 1.55 }}>Give people a printable Protocol and a living digital twin in ROUTINE³. Earn recurring revenue, personalise the experience and support progress day by day.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 8 }}>
                  {[
                    ['General and specific Protocols', 'Publish a proven general Protocol, then shape specific versions around each person’s goals, age, life stage and needs.', 1],
                    ['Earn recurring revenue', 'Receive 30% of recurring ROUTINE³ subscription revenue from people attributed to your Protocol.', 2],
                    ['Private, link-only access', 'Keep Protocols out of public discovery and share access only through links you control.', 3],
                    ['See progress with permission', 'When a user opts in, see what they complete each day and where support is needed.', 4],
                    ['Adapt the next days live', 'Edit upcoming actions and refine the Protocol as the person progresses.', 5],
                    ['Re-export the latest PDF', 'Users can create a fresh printable copy whenever their Protocol changes.', 6],
                  ].map(([title, copy, artIndex]) => <div key={title} style={{ border: `1px solid ${line}`, padding: 13, display: 'grid', gridTemplateColumns: '58px minmax(0,1fr)', gap: 11, alignItems: 'center' }}><span style={{ minWidth: 58, display: 'grid', placeItems: 'center' }}><R3CreatorBenefitArt index={Number(artIndex)} /></span><span><strong style={{ display: 'block', color: acid, fontSize: 11 }}>{title}</strong><span style={{ display: 'block', marginTop: 6, color: muted, fontSize: 9, lineHeight: 1.5 }}>{copy}</span></span></div>)}
                </div>
            </GuardianModal>}
          </div>}
          {offerPlanStage === 2 && <div>
            <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginBottom: 16 }}>
              <label style={{ ...label, color: acid }}>Create these offers for</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: 9 }}>
                <div><label style={{ ...label, marginBottom: 5 }}>Audience</label><select value={rampTargetAudience} onChange={(event) => { const nextAudience = event.target.value; setRampAudience(nextAudience); setRampProblem((audienceProblemsByGroup[nextAudience] || [])[0] || ''); }} style={{ ...input, paddingRight: 38 }}>{rampAudienceOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div><label style={{ ...label, marginBottom: 5 }}>Sex / population</label><select value={routineGender} onChange={(event) => { const nextPopulation = event.target.value; setRoutineGender(nextPopulation); setRoutineAge((targetAgeRanges[nextPopulation] || targetAgeRanges.Everyone)[0]); setRoutineLifeStage((targetLifeStages[nextPopulation] || targetLifeStages.Everyone)[0]); }} style={{ ...input, paddingRight: 38 }}>{Object.keys(targetAgeRanges).map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div><label style={{ ...label, marginBottom: 5 }}>Age range</label><select value={routineAge} onChange={(event) => setRoutineAge(event.target.value)} style={{ ...input, paddingRight: 38 }}>{routineAgeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div><label style={{ ...label, marginBottom: 5 }}>Health / life stage</label><select value={routineLifeStage} onChange={(event) => setRoutineLifeStage(event.target.value)} style={{ ...input, paddingRight: 38 }}>{routineLifeStageOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div><label style={{ ...label, marginBottom: 5 }}>Problem</label><select value={rampTargetProblem} onChange={(event) => setRampProblem(event.target.value)} style={{ ...input, paddingRight: 38 }}>{rampProblemOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              </div>
              <div style={{ marginTop: 12, borderLeft: `2px solid ${acid}`, padding: '3px 0 3px 10px' }}>
                <label htmlFor="value-ramp-name" style={{ display: 'block', color: muted, fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Lead magnet name <span style={{ color: acid }}>· choose an idea or type your own</span></label>
                <input id="value-ramp-name" list="lead-magnet-ideas" value={leadMagnetTitle} onChange={(event) => setLeadMagnetTitle(event.target.value)} onBlur={() => { if (freeOfferType === 'routine' && leadMagnetTitle.trim() && !leadMagnetTitle.trim().startsWith(routineTitlePrefix)) setLeadMagnetTitle(`${routineTitlePrefix}${leadMagnetTitle.trim()}`); }} placeholder={suggestedRoutineName} style={{ ...input, height: 42, minHeight: 42, fontSize: 12 }} />
                <datalist id="lead-magnet-ideas">{leadMagnetIdeas.map((idea) => <option key={idea} value={idea} />)}</datalist>
                <span style={{ display: 'block', color: muted, fontSize: 8, lineHeight: 1.4, marginTop: 6 }}>Suggested: {suggestedRoutineName}</span>
                <details style={{ marginTop: 10 }}><summary style={{ color: acid, fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Browse {leadMagnetIdeas.length} lead magnet ideas</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 6, marginTop: 9 }}>{leadMagnetIdeas.map((idea) => <button type="button" key={idea} onClick={() => setLeadMagnetTitle(idea)} aria-pressed={leadMagnetTitle === idea} style={{ minHeight: 48, border: `1px solid ${leadMagnetTitle === idea ? acid : line}`, background: leadMagnetTitle === idea ? 'rgba(199,216,163,.1)' : 'transparent', color: ink, padding: '8px 10px', fontFamily: sans, fontSize: 9, lineHeight: 1.35, textAlign: 'left', cursor: 'pointer' }}>{idea}</button>)}</div></details>
              </div>
            </div>
            <label style={{ ...label, color: ink }}>Your offers <span style={{ color: acid }}>· value rises at every step</span></label>
            <p style={{ color: muted, fontSize: 9, lineHeight: 1.5, margin: '-1px 0 12px' }}>Add or remove steps in one continuous customer journey.</p>
            <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, minWidth: 'max-content' }}>
                {leadMagnetCard()}
                {offerCards.filter((offer) => selectedUpsells.includes(offer.kind)).map((offer) => <Fragment key={offer.kind}><span aria-hidden="true" style={{ width: 34, flex: '0 0 34px', alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: acid }}><ArrowRight size={22} strokeWidth={1.4} /></span>{paidOfferCard(offer)}</Fragment>)}
                {offerCards.some((offer) => !selectedUpsells.includes(offer.kind)) && <Fragment><span aria-hidden="true" style={{ width: 34, flex: '0 0 34px', alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: line }}><ArrowRight size={22} strokeWidth={1.4} /></span><div style={{ width: 320, flex: '0 0 320px', border: `1px dashed ${muted}`, background: 'transparent', display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => setShowAddOfferOptions((current) => !current)} aria-expanded={showAddOfferOptions} style={{ minHeight: 190, flex: '1 1 auto', border: 0, background: 'transparent', color: ink, fontFamily: sans, cursor: 'pointer', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '38px 20px 24px' }}><span><span style={{ width: 48, height: 48, margin: '0 auto 14px', border: `1px solid ${ink}`, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 25, fontWeight: 300 }}>+</span><strong style={{ display: 'block', fontSize: 16 }}>Add next offer</strong><span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 7 }}>{offerCards.filter((offer) => !selectedUpsells.includes(offer.kind)).length} options available</span></span></button>
                  {showAddOfferOptions && <div style={{ display: 'grid', gap: 6, padding: '0 10px 10px' }}>{offerCards.filter((offer) => !selectedUpsells.includes(offer.kind)).map((offer) => { const art = offerTypeArt[offer.kind]; return <button type="button" key={offer.kind} onClick={() => addValuePathOffer(offer.kind)} style={{ minHeight: 58, border: `1px solid ${line}`, background: panel, color: ink, padding: '8px 10px', fontFamily: sans, cursor: 'pointer', display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', alignItems: 'center', gap: 9, textAlign: 'left' }}><span aria-hidden="true" style={{ width: 38, height: 38, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${(art.index % art.cols) * 100 / Math.max(1, art.cols - 1)}% ${Math.floor(art.index / art.cols) * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.98)' }} /><span><strong style={{ display: 'block', fontSize: 10 }}>{offer.label}</strong><span style={{ display: 'block', color: muted, fontSize: 8, marginTop: 3 }}>{offerAccess[offer.kind] === 'free' ? 'Free' : `${formatMoney(upsellDrafts[offer.kind].price, currency)}${billingLabels[upsellDrafts[offer.kind].billingModel].suffix}`}</span></span><Plus size={14} /></button>; })}</div>}
                  <div style={{ borderTop: `1px solid ${line}`, minHeight: 50, marginTop: 'auto', padding: 10, background: 'rgba(245,242,234,.025)', display: 'flex', alignItems: 'center' }}><strong style={{ color: muted, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase' }}>Next value step</strong></div>
                </div></Fragment>}
              </div>
            </div>
          </div>}
        </div>
        {offerPlanStage === 2 && <>
        <section style={{ border: `1px solid ${line}`, background: panel, marginBottom: 30 }}>
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><span><span style={{ ...label, color: acid, marginBottom: 4 }}>Offer build queue</span><strong style={{ color: ink, fontFamily: serif, fontSize: 25, fontWeight: 400 }}>{builtOfferCount} of {totalOfferCount} built</strong></span><span style={{ color: muted, fontSize: 9 }}>Finish each offer before publishing the offer site.</span></div>
          <div style={{ overflowX: 'auto' }}><div role="table" aria-label="Offers to build" style={{ minWidth: 760 }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.5fr) 120px 120px 120px 105px 130px', borderBottom: `1px solid ${line}`, padding: '9px 14px', color: muted, fontSize: 7, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{['Offer','Type','Access','Payment','Price','Status'].map((heading) => <span role="columnheader" key={heading}>{heading}</span>)}</div>
            <div role="row" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(220px,1.5fr) 120px 120px 120px 105px 130px', alignItems: 'center', borderBottom: `1px solid ${line}`, padding: '13px 14px', boxSizing: 'border-box', color: ink, fontFamily: sans, textAlign: 'left' }}><strong role="cell" style={{ fontSize: 11 }}>{leadMagnetTitle || 'Entry offer'}</strong><span role="cell" style={{ color: muted, fontSize: 9 }}>{freeOfferTypes.find((item) => item.value === freeOfferType)?.label}</span><span role="cell" style={{ fontSize: 9 }}>Free</span><span role="cell" style={{ color: muted, fontSize: 9 }}>No payment</span><span role="cell" style={{ fontSize: 9 }}>{formatMoney(0, currency)}</span><button type="button" role="cell" onClick={() => freeOfferType === 'routine' ? openProtocolBuilder() : openOfferEditor()} disabled={creatingProtocol} style={{ ...btn, minHeight: 46, padding: '0 12px', background: acid, color: black, borderColor: acid, fontSize: 8 }}>{creatingProtocol ? <><Loader2 size={12} className="animate-spin" /> Creating</> : freeOfferType === 'routine' ? <>{onboardingProtocol ? 'Open builder' : 'Build Protocol'} <ArrowRight size={13} /></> : <>{freeOfferSetupStage >= 2 ? 'Edit offer' : 'Build offer'} <ArrowRight size={13} /></>}</button></div>
            {orderedUpsells.map((kind) => { const draft = upsellDrafts[kind]; const access = offerAccess[kind]; const built = (paidOfferSetupStages[kind] || 0) >= 3; return <button type="button" role="row" key={kind} onClick={() => openOfferEditor(kind)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(220px,1.5fr) 120px 120px 120px 105px 130px', alignItems: 'center', border: 0, borderBottom: `1px solid ${line}`, padding: '13px 14px', background: 'transparent', color: ink, fontFamily: sans, textAlign: 'left', cursor: 'pointer' }}><strong role="cell" style={{ fontSize: 11 }}>{draft.title}</strong><span role="cell" style={{ color: muted, fontSize: 9 }}>{upsellSuggestions.find((item) => item.kind === kind)?.label || kind.replaceAll('_', ' ')}</span><span role="cell" style={{ fontSize: 9 }}>{access === 'paid' ? 'Paid' : 'Free'}</span><span role="cell" style={{ color: muted, fontSize: 9 }}>{access === 'paid' ? billingLabels[draft.billingModel].title : 'No payment'}</span><span role="cell" style={{ fontSize: 9 }}>{access === 'paid' ? `${formatMoney(draft.price, currency)}${billingLabels[draft.billingModel].suffix}` : formatMoney(0, currency)}</span><span role="cell" style={{ color: built ? acid : '#D49A74', fontSize: 8, fontWeight: 800, textTransform: 'uppercase' }}>{built ? 'Built · Edit' : 'To build →'}</span></button>; })}
          </div></div>
        </section>
        <div id="offer-builder-entry" style={{ scrollMarginTop: 20 }}><FunnelStage number="01" eyebrow="Free · Build trust" title="Give your audience one useful win." copy="Choose one useful result, name it clearly, then decide how people receive it." art={freeOfferArt[freeOfferType]} aside={leadMagnetCard()}>
          {freeOfferSetupStage > 0 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Entry offer</span><strong style={{ color: ink, fontSize: 12, fontWeight: 600 }}>{freeOfferTypes.find((offer) => offer.value === freeOfferType)?.label}</strong></span><button type="button" onClick={() => setFreeOfferSetupStage(0)} style={{ ...btn, minHeight: 36, height: 36, background: 'transparent', color: ink, fontSize: 9 }}>Edit</button></div>}
          {freeOfferSetupStage === 0 && <><label style={label}>Choose the entry offer</label>
          {!showAllEntryOffers && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: 10 }}>
            <FreeOfferCard eyebrow="LEAD MAGNET · RECOMMENDED" title={suggestedFreeOffer.title} copy="Best fit for this audience." active recommended art={freeOfferArt[suggestedFreeOffer.kind]} onClick={() => { setFreeOfferType(suggestedFreeOffer.kind); setFreeDelivery(suggestedFreeOffer.kind === 'routine' ? ['Downloadable PDF', 'Interactive Protocol'] : [suggestedDelivery(suggestedFreeOffer.kind)]); setFreeAudienceValue(freeValueSuggestions[suggestedFreeOffer.kind]); setLeadMagnetTitle(suggestedFreeOffer.title); setFreeOfferSetupStage(1); }} />
            {[0, 1].map((n) => <button key={n} type="button" onClick={() => setShowAllEntryOffers(true)} style={{ minHeight: 156, border: `1px dashed ${line}`, background: 'transparent', color: muted, fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><span><span style={{ display: 'block', fontSize: 26, fontWeight: 300, color: ink, marginBottom: 6 }}>+</span>Add another</span></button>)}
          </div>}
          {showAllEntryOffers && <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(145px,1fr))', gap: 0, minWidth: 870, borderTop: `1px solid ${line}`, borderLeft: `1px solid ${line}` }}>
              {[...freeOfferTypes].sort((offer) => Number(offer.value !== 'routine')).map((offer) => <FreeOfferCard key={offer.value} eyebrow={offer.eyebrow} title={offer.label} copy={offer.copy} active={freeOfferType === offer.value} art={freeOfferArt[offer.value]} onClick={() => { setFreeOfferType(offer.value); setFreeDelivery(offer.value === 'routine' ? ['Downloadable PDF', 'Interactive Protocol'] : [suggestedDelivery(offer.value)]); setFreeAudienceValue(freeValueSuggestions[offer.value]); setFreeOfferSetupStage(1); }} />)}
            </div>
            <button type="button" onClick={() => setShowAllEntryOffers(false)} style={{ ...btn, marginTop: 10, background: 'transparent', color: ink }}>← Back to recommended</button>
          </div>}</>}
          {freeOfferSetupStage > 1 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Offer</span><strong style={{ color: ink, fontSize: 12, fontWeight: 600 }}>{leadMagnetTitle}</strong><span style={{ display: 'block', color: muted, fontSize: 9, marginTop: 3 }}>{freeAudienceValue}</span></span><button type="button" onClick={() => setFreeOfferSetupStage(1)} style={{ ...btn, minHeight: 36, height: 36, background: 'transparent', color: ink, fontSize: 9 }}>Edit</button></div>}
          {freeOfferSetupStage === 1 && <div>
          <label style={label}>Offer name</label>
          <div style={{ position: 'relative' }}><span aria-hidden="true" style={{ position: 'absolute', left: 9, top: 6, width: 30 * activeFreeOfferArt.cellAspect, height: 30, backgroundImage: `url(${activeFreeOfferArt.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${activeFreeOfferArt.cols * 100}% ${activeFreeOfferArt.rows * 100}%`, backgroundPosition: `${activeFreeOfferArtCol * 100 / Math.max(1, activeFreeOfferArt.cols - 1)}% ${activeFreeOfferArtRow * 100 / Math.max(1, activeFreeOfferArt.rows - 1)}%`, filter: 'grayscale(1) contrast(.94)', pointerEvents: 'none' }} /><input style={{ ...input, paddingLeft: 18 + 30 * activeFreeOfferArt.cellAspect }} value={leadMagnetTitle} onChange={(e) => setLeadMagnetTitle(e.target.value)} placeholder="Name your free offer" /></div>
          <div style={{ marginTop: 10 }}><label style={label}>Customer value / outcome <span style={{ color: acid }}>· what changes for them?</span></label><textarea style={{ ...input, minHeight: 76, height: 76, paddingTop: 12, resize: 'vertical' }} value={freeAudienceValue} onChange={(e) => setFreeAudienceValue(e.target.value)} placeholder="Describe the useful result your audience receives" /></div>
          {freeOfferType === 'routine' && <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 12 }}>
            <label style={{ ...label, color: ink }}>Build your R3 Protocol</label>
            <p style={{ color: muted, fontSize: 9, lineHeight: 1.5, margin: '0 0 12px' }}>Type your knowledge, add source links or attach a file. These details become the brief for the AI Protocol builder.</p>
            <div><label style={label}>What should this Protocol include?</label><textarea style={{ ...input, minHeight: 92, height: 92, paddingTop: 12, resize: 'vertical' }} value={protocolBrief} onChange={(event) => setProtocolBrief(event.target.value)} placeholder="Describe the steps, advice, cautions and experience you want the R3 Protocol builder to use." /></div>
            <div style={{ marginTop: 10 }}><label style={label}>Source URLs <span style={{ color: muted }}>· one per line</span></label><textarea style={{ ...input, minHeight: 70, height: 70, paddingTop: 12, resize: 'vertical' }} value={protocolSourceUrls} onChange={(event) => setProtocolSourceUrls(event.target.value)} placeholder={'https://yourwebsite.com/article\nhttps://youtube.com/watch?v=...'} /></div>
          </div>}
          <button type="button" disabled={!leadMagnetTitle.trim() || !freeAudienceValue.trim()} onClick={() => setFreeOfferSetupStage(2)} style={{ ...btn, marginTop: 14 }}>Continue <ArrowRight size={14} /></button>
          </div>}
          {freeOfferSetupStage === 2 && <div>
          <DeliveryPicker value={freeDelivery} recommended={suggestedDelivery(freeOfferType)} onChange={setFreeDelivery} />
          {freeOfferType !== 'one_to_one_call' && freeOfferType !== 'group_call' ? <div style={{ border: `1px dashed ${line}`, padding: 14, marginTop: 10 }}>
            <label style={{ ...label, color: ink }}>Upload source material <span style={{ color: muted }}>· optional</span></label>
            <p style={{ color: muted, fontSize: 10, lineHeight: 1.55, margin: '0 0 10px' }}>Attach a PDF, EPUB or ZIP. The Protocol builder will preserve it with the draft so it can become structured recipes, a recipe book or guided steps.</p>
            <label style={{ ...btn, height: 38, boxSizing: 'border-box', background: 'transparent', color: ink, fontSize: 9 }}>
              {uploadingOffer ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{uploadingOffer ? 'Uploading' : leadMagnetPath ? 'Source file attached' : 'Upload source file'}
              <input type="file" accept="application/pdf,application/epub+zip,application/zip,.pdf,.epub,.zip" onChange={(event) => uploadLeadMagnet(event.target.files?.[0])} style={{ display: 'none' }} />
            </label>
          </div> : <div style={{ border: `1px dashed ${line}`, padding: 14, marginTop: 10, color: muted, fontSize: 10, lineHeight: 1.5 }}>No file needed. Add the booking link below.</div>}
          {freeOfferType === 'routine' && <button type="button" onClick={() => openProtocolBuilder()} disabled={creatingProtocol} style={{ ...btn, width: '100%', minHeight: 62, marginTop: 14, background: acid, color: black, borderColor: acid, fontSize: 12 }}>{creatingProtocol ? <><Loader2 size={16} className="animate-spin" /> Creating Protocol</> : <><HeartPulse size={17} /> {onboardingProtocol ? 'Open Protocol Builder' : 'Build Protocol in ROUTINE³'} <ArrowRight size={17} /></>}</button>}
          </div>}
        </FunnelStage></div>
        {orderedUpsells.map((kind, index) => {
          const offer = upsellSuggestions.find((item) => item.kind === kind);
          const draft = upsellDrafts[kind];
          const access = offerAccess[kind];
          const previousPaidValue = orderedUpsells.slice(0, index).reduce((highest, previousKind) => offerAccess[previousKind] === 'paid' ? Math.max(highest, Number(upsellDrafts[previousKind].price || 0)) : highest, 0);
          const nextSteps: OfferNextStep[] = kind === 'recipe_book' || kind === 'routine' || kind === 'routine_guidance' ? ['builder', 'link', 'video'] : kind === 'one_to_one_call' || kind === 'group_call' || kind === 'in_person' || kind === 'festival' ? ['booking', 'link', 'video'] : ['link', 'video'];
          const offerSetupStage = paidOfferSetupStages[kind] || 0;
          const setOfferSetupStage = (stage: number) => setPaidOfferSetupStages((current) => ({ ...current, [kind]: stage }));
          if (!offer) return null;
          const offerImage = offerTypeArt[kind];
          const offerImageCol = offerImage.index % offerImage.cols;
          const offerImageRow = Math.floor(offerImage.index / offerImage.cols);
          return <div id={`offer-builder-${kind}`} key={kind} style={{ scrollMarginTop: 20 }}><FunnelStage number={String(index + 2).padStart(2, '0')} eyebrow={`Value · ${offer.value.split(' · ')[0]} · ${access === 'free' ? 'Free' : `${formatMoney(draft.price, currency)}${billingLabels[draft.billingModel].suffix}`} · ${pricingRegion}`} title={draft.audienceValue || 'Define the result they receive.'} copy={`${draft.title || offer.label} · ${offer.why}`} art={offerImage} aside={paidOfferCard(offer)}>
            <div style={{ marginBottom: 12 }}><CustomerValueStars score={offerValueScores[kind]} /></div>
            {offerSetupStage > 0 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Offer</span><strong style={{ color: ink, fontSize: 12 }}>{draft.title} · {access === 'free' ? 'Free' : formatMoney(draft.price, currency)}</strong></span><button type="button" onClick={() => setOfferSetupStage(0)} style={{ ...btn, ...compactControl, minHeight: 40, background: 'transparent', color: ink }}>Edit</button></div>}
            {offerSetupStage === 0 && <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1fr) minmax(125px,155px) minmax(145px,180px) minmax(105px,140px)', gap: 9, alignItems: 'start' }}>
              <div><label style={{ ...label, minHeight: 14 }}>Offer name</label><div style={{ position: 'relative' }}><span aria-hidden="true" style={{ position: 'absolute', left: 9, top: 6, width: 30 * offerImage.cellAspect, height: 30, backgroundImage: `url(${offerImage.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${offerImage.cols * 100}% ${offerImage.rows * 100}%`, backgroundPosition: `${offerImageCol * 100 / Math.max(1, offerImage.cols - 1)}% ${offerImageRow * 100 / Math.max(1, offerImage.rows - 1)}%`, filter: 'grayscale(1) contrast(.94)', pointerEvents: 'none' }} /><input style={{ ...input, paddingLeft: 18 + 30 * offerImage.cellAspect }} value={draft.title} onChange={(e) => updateUpsell(kind, { title: e.target.value })} /></div></div>
              <div><label style={{ ...label, minHeight: 14 }}>Access</label><select style={input} value={access} onChange={(event) => setOfferAccess((current) => ({ ...current, [kind]: event.target.value as 'free' | 'paid' }))}><option value="free">Free</option><option value="paid">Paid</option></select></div>
              <div><label style={{ ...label, minHeight: 14 }}>Format</label><select aria-label={`${offer.label} payment format`} disabled={access === 'free'} value={draft.billingModel} onChange={(event) => updateUpsell(kind, { billingModel: event.target.value as BillingModel })} style={{ ...input, paddingRight: 36, opacity: access === 'free' ? .45 : 1 }}><option value="one_time">One time</option><option value="subscription">Subscription · monthly</option><option value="pack_10">Prepaid · 10 sessions</option></select></div>
              <div><label style={{ ...label, minHeight: 14 }}>Price · {currency}</label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 12, top: 15, color: access === 'free' ? line : muted, fontSize: 12 }}>{currencySymbol(currency)}</span><input type="number" min="0" step="0.01" disabled={access === 'free'} style={{ ...input, paddingLeft: 34, opacity: access === 'free' ? .45 : 1 }} value={access === 'free' ? '0' : draft.price} onChange={(e) => updateUpsell(kind, { price: e.target.value })} /></div>{access === 'paid' && <span style={{ display: 'block', color: Number(draft.price || 0) > previousPaidValue ? acid : '#C98662', fontSize: 7, lineHeight: 1.35, marginTop: 5 }}>{Number(draft.price || 0) > previousPaidValue ? `Value rises from ${formatMoney(previousPaidValue, currency)}` : `Suggested minimum: ${formatMoney(previousPaidValue + 20, currency)}`}</span>}</div>
            </div>
            <button type="button" disabled={!draft.title.trim()} onClick={() => setOfferSetupStage(1)} style={{ ...btn, marginTop: 14 }}>Continue <ArrowRight size={14} /></button>
            </div>}
            {offerSetupStage > 1 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Value and payment</span><strong style={{ color: ink, fontSize: 12 }}>{access === 'paid' ? billingLabels[draft.billingModel].title : 'Free'} · {draft.audienceValue}</strong></span><button type="button" onClick={() => setOfferSetupStage(1)} style={{ ...btn, ...compactControl, minHeight: 40, background: 'transparent', color: ink }}>Edit</button></div>}
            {offerSetupStage === 1 && <div>
            <div style={{ marginTop: 10 }}><label style={label}>Customer value / outcome <span style={{ color: acid }}>· what changes for them?</span></label><textarea style={{ ...input, minHeight: 76, height: 76, paddingTop: 12, resize: 'vertical' }} value={draft.audienceValue} onChange={(e) => updateUpsell(kind, { audienceValue: e.target.value })} placeholder="Describe the result, benefit or transformation" /></div>
            <button type="button" disabled={!draft.audienceValue.trim()} onClick={() => setOfferSetupStage(2)} style={{ ...btn, marginTop: 14 }}>Continue <ArrowRight size={14} /></button>
            </div>}
            {offerSetupStage > 2 && <div style={{ border: `1px solid ${line}`, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ ...label, marginBottom: 3 }}>Visitor action</span><strong style={{ color: ink, fontSize: 12 }}>{nextStepLabels[draft.nextStep].title}</strong></span><button type="button" onClick={() => setOfferSetupStage(2)} style={{ ...btn, ...compactControl, minHeight: 40, background: 'transparent', color: ink }}>Edit</button></div>}
            {offerSetupStage === 2 && <div>
            <div style={{ marginTop: 12 }}>
              <label style={label}>What happens next? <span style={{ color: acid }}>· choose the visitor action</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 7 }}>
                {nextSteps.map((nextStep) => { const active = draft.nextStep === nextStep; return <button className="guardian-card" type="button" key={nextStep} onClick={() => updateUpsell(kind, { nextStep })} aria-pressed={active} style={{ ...pickStyle(active), minHeight: 58, justifyContent: 'flex-start', textAlign: 'left' }}><span><strong style={{ display: 'block', fontSize: 9 }}>{nextStepLabels[nextStep].title}</strong><span style={{ display: 'block', marginTop: 4, color: active ? 'rgba(9,10,8,.65)' : muted, fontSize: 8, lineHeight: 1.35 }}>{nextStepLabels[nextStep].note}</span></span></button>; })}
              </div>
            </div>
            {draft.nextStep === 'builder' ? <div style={{ marginTop: 10, padding: 12, border: `1px solid ${acid}`, background: 'rgba(199,216,163,.08)' }}><strong style={{ display: 'block', color: acid, fontSize: 9 }}>{kind === 'recipe_book' ? 'Recipe Builder will be created' : 'Protocol Builder will be created'}</strong><span style={{ display: 'block', color: muted, fontSize: 8, lineHeight: 1.45, marginTop: 4 }}>After setup, the Guardian can add images, audio, ingredients or steps and publish when ready.</span></div> : <div style={{ marginTop: 10 }}><label style={label}>{draft.nextStep === 'booking' ? 'Booking link' : draft.nextStep === 'video' ? 'Video link' : 'Offer or checkout link'} <span style={{ color: muted }}>· optional</span></label><input type="url" style={input} value={draft.url} onChange={(e) => updateUpsell(kind, { url: e.target.value })} placeholder={draft.nextStep === 'booking' ? bookingUrl || 'https://cal.com/yourname' : draft.nextStep === 'video' ? 'https://youtube.com/watch?v=...' : 'https://yourwebsite.com/offer'} /></div>}
            <button type="button" onClick={() => setOfferSetupStage(3)} style={{ ...btn, marginTop: 14 }}>Continue <ArrowRight size={14} /></button>
            </div>}
            {offerSetupStage === 3 && <div>
            <DeliveryPicker value={draft.delivery} recommended={suggestedDelivery(kind)} onChange={(delivery) => updateUpsell(kind, { delivery })} />
            {(kind === 'routine' || kind === 'routine_guidance') && draft.nextStep === 'builder' && <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 10 }}>
              <label style={{ ...label, color: ink }}>{kind === 'routine_guidance' ? 'R3 Protocol + guidance setup' : 'R3 Protocol setup'}</label>
              <p style={{ color: muted, fontSize: 9, lineHeight: 1.45, margin: '0 0 10px' }}>{kind === 'routine_guidance' ? 'With their permission, the Guardian sees routine completion and check-ins, then suggests adjustments and the next action.' : 'Personalise this routine using the Guardian’s selected goal, gender and age range.'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 }}>
                <div><label style={label}>Sex / population</label><select style={{ ...input, paddingRight: 38 }} value={routineGender} onChange={(event) => { const nextPopulation = event.target.value; setRoutineGender(nextPopulation); setRoutineAge((targetAgeRanges[nextPopulation] || targetAgeRanges.Everyone)[0]); setRoutineLifeStage((targetLifeStages[nextPopulation] || targetLifeStages.Everyone)[0]); }}>{Object.keys(targetAgeRanges).map((item) => <option key={item}>{item}</option>)}</select></div>
                <div><label style={label}>Age range</label><select style={{ ...input, paddingRight: 38 }} value={routineAge} onChange={(event) => setRoutineAge(event.target.value)}>{routineAgeOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div><label style={label}>Health / life stage</label><select style={{ ...input, paddingRight: 38 }} value={routineLifeStage} onChange={(event) => setRoutineLifeStage(event.target.value)}>{routineLifeStageOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div><label style={label}>Primary goal</label><input style={input} readOnly value={chosen[0] || 'General wellbeing'} /></div>
                {kind === 'routine_guidance' && <div><label style={label}>Guardian review</label><select style={input} value={guidanceReviewCadence} onChange={(e) => setGuidanceReviewCadence(e.target.value)}><option>Real-time</option><option>Daily review</option><option>Weekly review</option></select></div>}
              </div>
              {kind === 'routine_guidance' && <div style={{ marginTop: 10, borderTop: `1px solid ${line}`, paddingTop: 10, color: acid, fontSize: 9, lineHeight: 1.5 }}>Shared with the Guardian: completed routine items and voluntary check-ins. Private account and health data remain outside this offer.</div>}
              <button type="button" onClick={() => openProtocolBuilder(kind)} disabled={creatingProtocol} style={{ ...btn, marginTop: 14 }}>
                {creatingProtocol ? <><Loader2 size={14} className="animate-spin" /> Creating Protocol</> : <>{onboardingProtocol ? 'Open Protocol Builder' : 'Build Protocol'} <ArrowRight size={14} /></>}
              </button>
            </div>}
            {kind === 'group_call' && <div style={{ border: `1px solid ${acid}`, background: 'rgba(199,216,163,.08)', padding: 14, marginTop: 10 }}>
              <label style={{ ...label, color: ink }}>Transparent Protocol coaching</label>
              <p style={{ color: muted, fontSize: 9, lineHeight: 1.5, margin: '0 0 10px' }}>The customer chooses to share Protocol completion and check-ins. Their coach uses that activity to give daily feedback, suggest changes and prepare for the weekly private call.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 }}>
                <div><label style={label}>Coach review</label><select style={input} value={guidanceReviewCadence} onChange={(e) => setGuidanceReviewCadence(e.target.value)}><option>Daily review</option><option>Real-time</option><option>Weekly review</option></select></div>
                <div><label style={label}>Private coaching</label><input style={input} readOnly value="One call every week" /></div>
              </div>
              <div style={{ marginTop: 10, borderTop: `1px solid ${line}`, paddingTop: 10, color: acid, fontSize: 9, lineHeight: 1.5 }}>Shared only with permission: completed Protocol items and voluntary check-ins. Private account and health data stay outside the coaching view.</div>
            </div>}
            {kind === 'festival' && <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 10 }}>
              <label style={{ ...label, color: ink }}>Event plan</label>
              <p style={{ color: muted, fontSize: 9, lineHeight: 1.45, margin: '0 0 10px' }}>Keep the event rare and valuable. We recommend one flagship event per year, with two as the maximum.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                {['1', '2'].map((count) => <button type="button" key={count} onClick={() => setEventsPerYear(count)} style={{ ...pickStyle(eventsPerYear === count), height: 52 }}>{count} event{count === '1' ? '' : 's'} per year{count === '1' ? ' · recommended' : ''}</button>)}
              </div>
              <p style={{ color: acid, fontSize: 9, lineHeight: 1.45, margin: '10px 0 0' }}>Suggested starting value: {formatMoney(1000, currency)}–{formatMoney(2000, currency)}. Default: {formatMoney(1500, currency)}.</p>
            </div>}
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ color: muted, fontSize: 9 }}>Step {index + 2} of the visitor journey</span>
              <button type="button" onClick={() => toggleUpsell(kind)} style={{ ...btn, height: 34, padding: '0 13px', background: 'transparent', color: ink, borderColor: line, fontSize: 8 }}>Remove</button>
            </div>
          </FunnelStage></div>;
        })}
        </>}
      </>}

      {step === 5 && <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 }}><span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Preview on</span><DeviceToggle value={previewDevice} onChange={setPreviewDevice} /></div>
        <FunnelStage number="01" eyebrow="Site 01 · Your profile" title={`${displayName || 'Your'}${displayName ? '’s' : ''} story.`} copy="Your profile site: who you are, and every published offer path.">
          {/* Builder left, live preview right (stacks on narrow screens). */}
          <div className="g-split" style={{ border: `1px solid ${line}`, background: panel, padding: 16 }}>
          <div>
            <label style={{ ...label, color: ink }}>Style your page</label>
            <div role="tablist" aria-label="Site style steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${line}`, marginBottom: 16 }}>
              {['Story', 'Identity', 'Background', 'Colors'].map((title, index) => <button type="button" role="tab" aria-selected={siteStyleStage === index} key={title} onClick={() => setSiteStyleStage(index)} style={{ minHeight: 44, border: 0, borderLeft: index ? `1px solid ${line}` : 0, background: siteStyleStage === index ? ink : 'transparent', color: siteStyleStage === index ? black : index < siteStyleStage ? acid : muted, fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{String(index + 1).padStart(2, '0')} · {title}</button>)}
            </div>
            {siteStyleStage === 0 && <>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Story headline <span style={{ color: acid }}>· 30 tailored suggestions</span></label>
              <select style={{ ...input, marginBottom: 7 }} value={headlineSuggestions.includes(generatedHeadline) ? generatedHeadline : ''} onChange={(event) => setSelectedHeadline(event.target.value)}>
                <option value="" disabled>Custom headline</option>
                {headlineSuggestions.map((headline, index) => <option key={headline} value={headline}>{String(index + 1).padStart(2, '0')} · {headline}</option>)}
              </select>
              <input style={input} value={generatedHeadline} onChange={(event) => setSelectedHeadline(event.target.value)} placeholder="Write your own outcome-led headline" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Expertise tags <span style={{ color: muted }}>· shown under your headline</span></label>
              <div style={{ display: 'flex', gap: 7 }}><input style={input} value={expertiseTagDraft} onChange={(event) => setExpertiseTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addExpertiseTags(expertiseTagDraft); } }} placeholder="Hypnosis, compassionate care, equity" /><button type="button" onClick={() => addExpertiseTags(expertiseTagDraft)} disabled={!expertiseTagDraft.trim()} style={{ ...btn, height: 46, padding: '0 13px' }}>Add</button></div>
              {expertiseTags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{expertiseTags.map((tag) => <button type="button" key={tag} onClick={() => setExpertiseTags((current) => current.filter((item) => item !== tag))} title={`Remove ${tag}`} style={{ border: `1px solid ${line}`, background: 'transparent', color: ink, padding: '5px 8px', fontFamily: sans, fontSize: 8, cursor: 'pointer' }}>{tag} ×</button>)}</div>}
            </div>
            <div style={{ marginBottom: 14 }}><label style={label}>Your brand name</label><input style={input} value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Your name, practice or studio" /></div>
            <button type="button" onClick={() => setSiteStyleStage(1)} style={btn}>Continue <ArrowRight size={14} /></button>
            </>}
            {siteStyleStage === 1 && <>
            <label style={label}>Headline style</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7, marginBottom: 16 }}>
              {(Object.keys(HEADLINE_STYLES) as HeadlineStyle[]).map((value) => { const active = headlineStyle === value; const look = HEADLINE_STYLES[value]; return <button className="guardian-card" type="button" key={value} onClick={() => setHeadlineStyle(value)} aria-pressed={active} style={{ minWidth: 0, minHeight: 64, padding: '8px 9px', border: `1px solid ${active ? acid : line}`, background: active ? '#20251B' : 'transparent', color: ink, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'block', fontFamily: look.hero.fontFamily, fontWeight: look.hero.fontWeight, textTransform: look.hero.textTransform, letterSpacing: value === 'statement' ? '.04em' : '-.02em', fontSize: 20, lineHeight: 1, color: ink }}>Aa</span>
                <strong style={{ display: 'block', marginTop: 6, fontFamily: sans, fontSize: 8 }}>{look.label}</strong>
              </button>; })}
            </div>
            <label style={label}>Header and navigation</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7, marginBottom: 16 }}>
              {([['white', 'White header'], ['hidden', 'No header']] as const).map(([value, text]) => { const active = headerStyle === value; return <button className="guardian-card" type="button" key={value} onClick={() => setHeaderStyle(value)} aria-pressed={active} style={{ minWidth: 0, minHeight: 54, padding: 7, border: `1px solid ${active ? acid : line}`, background: 'transparent', color: ink, cursor: 'pointer', fontFamily: sans, textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22, padding: '0 6px', background: value === 'hidden' ? 'transparent' : '#FFFFFF', color: value === 'hidden' ? muted : '#11120F', border: '1px solid rgba(127,127,127,.25)', fontSize: 6, fontWeight: 700, letterSpacing: '.1em' }}><span>{value === 'hidden' ? 'FULL BLEED' : 'R³ LOGO'}</span><span>{value === 'hidden' ? 'NO NAV' : 'MENU'}</span></span>
                <strong style={{ display: 'block', marginTop: 6, fontSize: 8 }}>{text}</strong>
              </button>; })}
            </div>
            <label style={label}>Choose an avatar</label>
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
              {defaultAvatars.map((avatar) => { const active = avatarUrl === avatar.image; return <button className="guardian-card" type="button" key={avatar.name} onClick={() => setAvatarUrl(avatar.image)} aria-pressed={active} style={{ position: 'relative', width: 100, flex: '0 0 100px', minHeight: 94, padding: '8px 6px 7px', border: `1px solid ${active ? acid : line}`, background: active ? acid : 'transparent', color: active ? black : ink, cursor: 'pointer', fontFamily: sans }}>
                {active && <span style={{ position: 'absolute', top: 5, right: 5, width: 17, height: 17, display: 'grid', placeItems: 'center', background: black, color: acid }}><Check size={10} /></span>}
                <img src={avatar.image} alt="" style={{ display: 'block', width: 58, height: 58, maxWidth: '100%', objectFit: 'contain', margin: '0 auto 5px', filter: active ? 'grayscale(1) brightness(.25)' : 'grayscale(1) contrast(.95) brightness(.9)' }} />
                <span style={{ display: 'block', fontSize: 8, fontWeight: 700, lineHeight: 1.2, textAlign: 'center' }}>{avatar.name}</span>
              </button>; })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><button type="button" onClick={() => setSiteStyleStage(0)} style={{ ...btn, background: 'transparent', color: ink }}>← Back</button><button type="button" onClick={() => setSiteStyleStage(2)} style={btn}>Continue <ArrowRight size={14} /></button></div>
            </>}
            {siteStyleStage === 2 && <>
            <label style={label}>Choose a story template</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 14, scrollSnapType: 'x mandatory' }}>
              {storyTemplates.map((template) => { const active = storyTemplate === template.id && !backgroundUrl; return <button className="guardian-card" type="button" key={template.id} onClick={() => applyStoryTemplate(template.id)} aria-pressed={active} style={{ position: 'relative', width: 180, flex: '0 0 180px', scrollSnapAlign: 'start', padding: 0, overflow: 'hidden', border: `1px solid ${active ? acid : line}`, background: active ? acid : '#0D0E0C', color: active ? black : ink, textAlign: 'left', cursor: 'pointer', fontFamily: sans }}>
                <img src={template.image} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', objectPosition: 'center' }} />
                {active && <span style={{ position: 'absolute', top: 7, right: 7, width: 19, height: 19, display: 'grid', placeItems: 'center', background: black, color: acid }}><Check size={11} /></span>}
                <span style={{ display: 'block', padding: '10px 11px 11px' }}><span style={{ display: 'block', color: active ? 'rgba(9,10,8,.62)' : acid, fontSize: 7, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 5 }}>{template.style}</span><strong style={{ display: 'block', fontSize: 11 }}>{template.name}</strong><span style={{ display: 'block', marginTop: 5, color: active ? 'rgba(9,10,8,.65)' : muted, fontSize: 8, lineHeight: 1.4 }}>{template.description}</span></span>
              </button>; })}
            </div>
            <label style={{ ...label, color: ink }}>Use your own background</label>
            <label style={{ ...btn, height: 40, background: 'transparent', color: ink, fontSize: 8, marginBottom: 14 }}>{uploadingBackground ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}{backgroundUrl ? 'Replace background' : 'Upload photo or video'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => uploadBackground(event.target.files?.[0])} style={{ display: 'none' }} /></label>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><button type="button" onClick={() => setSiteStyleStage(1)} style={{ ...btn, background: 'transparent', color: ink }}>← Back</button><button type="button" onClick={() => setSiteStyleStage(3)} style={btn}>Continue <ArrowRight size={14} /></button></div>
            </>}
            {siteStyleStage === 3 && <>
            <label style={label}>Image style</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7, marginBottom: 16 }}>
              {(['color', 'greyscale'] as const).map((treatment) => { const active = imageTreatment === treatment; return <button className="guardian-card" type="button" key={treatment} onClick={() => setImageTreatment(treatment)} aria-pressed={active} style={{ ...pickStyle(active), minHeight: 48, justifyContent: 'flex-start', textAlign: 'left' }}>
                <span style={{ width: 24, height: 24, flex: '0 0 auto', border: `1px solid ${active ? 'rgba(9,10,8,.3)' : line}`, background: treatment === 'color' ? 'linear-gradient(135deg,#A56B48 0 33%,#C7D8A3 33% 66%,#507785 66%)' : 'linear-gradient(135deg,#E8E8E4 0 33%,#999 33% 66%,#242522 66%)' }} />
                <span><strong style={{ display: 'block', fontSize: 10, textTransform: 'capitalize' }}>{treatment}</strong><span style={{ display: 'block', marginTop: 3, color: active ? 'rgba(9,10,8,.65)' : muted, fontSize: 8 }}>{treatment === 'color' ? 'Keep photography in full color' : 'Use a restrained black-and-white treatment'}</span></span>
              </button>; })}
            </div>
            <label style={label}>Fine tune your colors</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(150px,1fr))', gap: 9 }}>
              <div><label style={label}>Page color</label><input type="color" style={{ ...input, padding: 5 }} value={pageColor} onChange={(e) => setPageColor(e.target.value)} /></div>
              <div><label style={label}>Accent color</label><input type="color" style={{ ...input, padding: 5 }} value={accentColor} onChange={(e) => setAccentColor(e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <label style={{ ...btn, height: 36, background: 'transparent', color: ink, fontSize: 8 }}><Upload size={11} />{avatarUrl ? 'Replace avatar' : 'Upload avatar'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadPortrait(event.target.files?.[0])} style={{ display: 'none' }} /></label>
              <button type="button" onClick={() => setSiteStyleStage(2)} style={{ ...btn, height: 36, background: 'transparent', color: ink, fontSize: 8 }}>← Background</button>
            </div>
            </>}
          </div>
          <div id="profile-site-preview" className="g-sticky" style={{ scrollMarginTop: 20 }}><span style={{ ...label, display: 'block', color: acid, marginBottom: 7 }}>Profile site preview <span style={{ color: muted }}>· shows every published offer path</span></span><PreviewFrame device={previewDevice}><div style={{ flex: '1 0 auto', background: pageColor, fontFamily: sans }}>
            {headerStyle !== 'hidden' && <GuardianSiteHeader brandName={brandName.trim()} path={`routine3.com/${displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'your-name'}`} />}
            <GuardianSiteHero audience={audienceLabel(audienceDetails, audience)} reviewSummary={reviewStats(guardianReviews)} headlineStyle={headlineStyle} name={displayName} avatarUrl={avatarUrl} specialties={chosen} headline={generatedHeadline} tags={expertiseTags} bio={intro || `A practical ${chosen.slice(0, 2).join(' and ').toLowerCase() || 'guidance'} path shaped for ${audience.join(' and ').toLowerCase()}.`} accent={accentColor} headingFont={serif} background={effectiveBackground} backgroundIsVideo={backgroundType === 'video'} greyscale={imageTreatment === 'greyscale'}
              cards={[{ key: 'first', eyebrow: rampTargetProblem, title: customerFacingOfferTitle(leadMagnetTitle || suggestedFreeOffer.title), copy: freeAudienceValue, kind: freeOfferType, price: 'Free', onClick: () => document.getElementById('value-ramp-funnel-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }]} />
          </div></PreviewFrame></div>
          </div>
        </FunnelStage>
        <FunnelStage number="02" eyebrow="Site 02 · First offer path" title={`${rampTargetAudience} · ${rampTargetProblem} → ${customerFacingOfferTitle(leadMagnetTitle || 'your first offer')}`} copy="Audience, problem, solution: the page a visitor lands on, from the free offer through to the next one." last>
        <div id="value-ramp-funnel-preview" style={{ scrollMarginTop: 20, border: `1px solid ${line}`, background: panel, padding: 16, marginBottom: 24 }}>
          <div className="g-split"><div>
          {/* Same pattern as "Style your page": edit what the offer pages say, who they're for, media and upsells. */}
          <label style={{ ...label, color: ink }}>Edit your offer</label>
          <div role="tablist" aria-label="Offer page steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${line}`, marginBottom: 16 }}>
            {['Offer', 'Audience', 'Media', 'Upsells'].map((title, index) => <button type="button" role="tab" aria-selected={offerEditStage === index} key={title} onClick={() => { setOfferEditStage(index); if (index === 3 && funnelStages.length > 1) { setFunnelUnlockedStage(funnelStages.length - 1); setFunnelPreviewStage(1); setFunnelPageState('offer'); } else { setFunnelPreviewStage(0); setFunnelPageState('checkout'); } }} style={{ minHeight: 44, border: 0, borderLeft: index ? `1px solid ${line}` : 0, background: offerEditStage === index ? ink : 'transparent', color: offerEditStage === index ? black : index < offerEditStage ? acid : muted, fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{String(index + 1).padStart(2, '0')} · {title}</button>)}
          </div>
          {offerEditStage === 0 && <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            <div><label style={label}>Free offer name <span style={{ color: muted }}>· the big title on the sign-up page</span></label><input style={input} value={leadMagnetTitle} onChange={(e) => setLeadMagnetTitle(e.target.value)} placeholder="Name your free offer" /></div>
            <div><label style={label}>Value line <span style={{ color: muted }}>· what changes for them</span></label><textarea style={{ ...input, minHeight: 70, height: 70, paddingTop: 12, resize: 'vertical' }} value={freeAudienceValue} onChange={(e) => setFreeAudienceValue(e.target.value)} placeholder="Sleep through the night again in 7 days" /></div>
            <span style={{ color: muted, fontSize: 9 }}>Format: {isProtocolKind(freeOfferType) || APP_PLAN_KINDS.includes(freeOfferType) ? 'PDF + ROUTINE³ app' : OTHER_FORMATS[freeOfferType] || 'Online'} · change it in step 04 · Offers.</span>
          </div>}
          {offerEditStage === 1 && <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            <div className="g-split" style={{ gap: 8 }}>
              <div><label style={label}>Who it's for</label><select style={input} value={rampTargetAudience} onChange={(e) => setRampAudience(e.target.value)}>{rampAudienceOptions.map((g) => <option key={g} value={g}>{g === 'Busy families' ? 'Families' : g}</option>)}</select></div>
              <div><label style={label}>Problem it solves</label><select style={input} value={rampTargetProblem} onChange={(e) => setRampProblem(e.target.value)}>{(rampProblemOptions.length ? rampProblemOptions : [rampTargetProblem]).map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>
            {audienceDetails[rampTargetAudience] && agePanel(rampTargetAudience)}
            <span style={{ color: muted, fontSize: 9 }}>Shown on the cards as <strong style={{ color: ink }}>{audienceLabel(audienceDetails, [rampTargetAudience]) || rampTargetAudience}</strong>. Add more audiences in step 03 · Audience.</span>
          </div>}
          {offerEditStage === 2 && <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            <div><label style={label}>Free offer · pitch video <span style={{ color: muted }}>· plays on the sign-up page</span></label>{offerVideoField('free')}</div>
            {orderedUpsells.map((kind) => <div key={kind}><label style={label}>{customerFacingOfferTitle(upsellDrafts[kind].title)} · pitch video <span style={{ color: muted }}>· plays above the limited offer</span></label>{offerVideoField(kind)}</div>)}
          </div>}
          {offerEditStage === 3 && <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
            {!orderedUpsells.length && <span style={{ color: muted, fontSize: 10 }}>No paid offers yet. Add one in step 04 · Offers.</span>}
            {orderedUpsells.map((kind, index) => <div key={kind} style={{ border: `1px solid ${line}`, padding: 12, display: 'grid', gap: 8 }}>
              <span style={{ ...label, color: acid, marginBottom: 0 }}>Upsell {index + 1}{offerAccess[kind] === 'free' ? ' · free' : ''}</span>
              <div className="g-split" style={{ gap: 8 }}>
                <div><label style={label}>Name</label><input style={input} value={upsellDrafts[kind].title} onChange={(e) => updateUpsell(kind, { title: e.target.value })} /></div>
                {offerAccess[kind] !== 'free' && <div><label style={label}>Price · {currency} <span style={{ color: muted }}>· 30% off in the timer</span></label><input style={input} inputMode="decimal" value={upsellDrafts[kind].price} onChange={(e) => updateUpsell(kind, { price: e.target.value.replace(/[^0-9.]/g, '') })} /></div>}
              </div>
              <div><label style={label}>Value line</label><textarea style={{ ...input, minHeight: 60, height: 60, paddingTop: 10, resize: 'vertical' }} value={upsellDrafts[kind].audienceValue} onChange={(e) => updateUpsell(kind, { audienceValue: e.target.value })} /></div>
            </div>)}
          </div>}
          <label style={{ ...label, color: acid }}>Offer funnel preview <span style={{ color: muted }}>· test purchase and access</span></label>
          <div aria-label="Customer journey stages" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', border: `1px solid ${line}`, margin: '10px 0 14px' }}>
            {/* Every part of the flow, free and paid, is clickable so the Guardian can jump straight to it. */}
            {(() => {
              const steps: { title: string; detail: string; stage: number; page: typeof funnelPageState }[] = [
                { title: 'Sign up', detail: customerFacingOfferTitle(funnelStages[0].title), stage: 0, page: 'checkout' },
                { title: 'Delivery + next offer', detail: 'Free offer delivered, upsell shown', stage: 0, page: 'access' },
                ...funnelStages.slice(1).flatMap((stage, k) => [
                  { title: `Upsell ${k + 1}`, detail: `${customerFacingOfferTitle(stage.title)} · ${stage.price}`, stage: k + 1, page: 'offer' as const },
                  { title: `Bought ${k + 1}`, detail: k + 2 < funnelStages.length ? 'Confirmed, next upsell shown' : 'Confirmed', stage: k + 1, page: 'access' as const },
                ]),
                { title: 'Complete', detail: 'Order summary', stage: Math.max(0, funnelStages.length - 1), page: 'complete' },
              ];
              const go = (step: (typeof steps)[number]) => {
                if (!leadEmailIsValid) setLeadCaptureValue('you@example.com');
                setFunnelUnlockedStage(funnelStages.length - 1);
                setFunnelPreviewStage(step.stage);
                setFunnelTimerSeconds(600);
                // Jumping ahead counts the offers before (and including) this step as bought, so summaries list them.
                setFunnelPurchases(step.page === 'complete' ? funnelStages.map((stage) => stage.title) : step.page === 'access' ? funnelStages.slice(0, step.stage + 1).map((stage) => stage.title) : []);
                setFunnelPageState(step.page);
              };
              return steps.map((step, index) => {
                const current = step.page === funnelPageState && (step.page === 'complete' || step.stage === funnelPreviewStage);
                return <button type="button" key={`${step.title}-${index}`} onClick={() => go(step)} aria-current={current ? 'step' : undefined} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, borderTop: index ? `1px solid ${line}` : 0, background: current ? ink : 'transparent', color: current ? black : step.stage > 0 ? ink : acid, cursor: 'pointer', fontFamily: sans }}>
                  <strong style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 8 }}><span>{String(index + 1).padStart(2, '0')} · {step.title}</span>{step.stage > 0 && step.page === 'offer' && <span style={{ opacity: .7 }}>PAID</span>}</strong>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 7, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: current ? black : muted }}>{step.detail}</span>
                </button>;
              });
            })()}
          </div>
          <span style={{ ...label, display: 'block', marginBottom: 7 }}>Preview an offer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', padding: '0 0 14px' }}>
            {funnelStages.map((stage, index) => { const unlocked = index <= funnelUnlockedStage; return <button type="button" key={`${stage.title}-${index}`} disabled={!unlocked} onClick={() => { setFunnelPreviewStage(index); setFunnelPageState(index === 0 ? 'checkout' : 'offer'); }} aria-current={funnelPreviewStage === index ? 'step' : undefined} aria-label={unlocked ? `Preview stage ${index + 1}: ${stage.title}` : `Stage ${index + 1} locked`} title={unlocked ? stage.title : 'Complete the current action to reveal this stage'} style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', border: `1px solid ${index <= funnelPreviewStage ? acid : line}`, background: funnelPreviewStage === index ? acid : 'transparent', color: funnelPreviewStage === index ? black : index < funnelPreviewStage ? acid : muted, fontFamily: sans, fontSize: 8, fontWeight: 700, cursor: unlocked ? 'pointer' : 'not-allowed', opacity: unlocked ? 1 : .4 }}>{unlocked ? String(index + 1).padStart(2, '0') : '—'}</button>; })}
          </div>
          <button type="button" onClick={() => { setFunnelPreviewStage(0); setFunnelUnlockedStage(0); setFunnelPageState('checkout'); setFunnelTimerSeconds(600); setFunnelPurchases([]); setLeadCaptureValue(''); }} style={{ marginTop: 4, border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 10, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Restart visitor journey</button>
          </div><div className="g-sticky"><PreviewFrame device={previewDevice}>
          <div style={{ flex: '1 0 auto', width: '100%', maxWidth: '100%', minHeight: '100%', boxSizing: 'border-box', border: `1px solid ${line}`, borderRadius: 5, backgroundColor: '#F2EFE7', backgroundImage: backgroundType === 'image' ? `linear-gradient(rgba(242,239,231,.84),rgba(242,239,231,.84)),url(${effectiveBackground})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', color: '#11120F', padding: 'clamp(22px,5cqw,52px)', display: 'grid', alignItems: 'center', overflow: 'hidden' }}>
            {funnelPageState === 'offer' && funnelPreviewStage > 0 && upsellCard(activeFunnelStage, () => { setFunnelPurchases((current) => current.includes(activeFunnelStage.title) ? current : [...current, activeFunnelStage.title]); setFunnelTimerSeconds(600); setFunnelPageState('access'); }, () => { const next = funnelPreviewStage + 1; if (next >= funnelStages.length) setFunnelPageState('complete'); else { setFunnelUnlockedStage((c) => Math.max(c, next)); setFunnelPreviewStage(next); } })}
            {funnelPageState === 'offer' && funnelPreviewStage === 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 'clamp(28px,6cqw,80px)', alignItems: 'center' }}><div style={{ minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(17,18,15,.22)' }} /> : <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(17,18,15,.22)', fontFamily: serif }}>{(displayName || 'G')[0]}</span>}<span style={{ color: '#55564F', fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{displayName || 'Your Guardian'} <ChevronRight size={10} style={{ display: 'inline', verticalAlign: '-2px' }} /> {funnelPreviewStage === 0 && freeOfferType === 'routine' ? 'Protocol' : 'Offer'}</span></span><span style={{ color: accentColor, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Step {funnelPreviewStage + 1} · {activeFunnelStage.price}</span>{/* Headline is the value; the offer title lives on the card beside it. */}<h3 style={{ fontFamily: serif, fontSize: offerTitleSize(activeFunnelStage.value || activeFunnelStage.title), fontWeight: 300, lineHeight: .95, margin: '18px 0 0', overflowWrap: 'anywhere' }}>{activeFunnelStage.value || customerFacingOfferTitle(activeFunnelStage.title)}</h3></div><div>{activeFunnelStage.video && <video src={activeFunnelStage.video} controls playsInline style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', background: '#11120F', borderRadius: 4, margin: '0 0 18px' }} />}<ProductCard {...reviewStats(guardianReviews)} audience={audienceLabel(audienceDetails, audience)} kind={activeFunnelStage.kind} title={customerFacingOfferTitle(activeFunnelStage.title)} copy={activeFunnelStage.meta.split(' · ').slice(1).join(' · ') || undefined} price={activeFunnelStage.price} name={displayName || 'your Guardian'} avatarUrl={avatarUrl} accent={accentColor} cta={activeFunnelStage.action} onClick={confirmFunnelOffer} /></div></div>}
            {funnelPageState === 'checkout' && funnelPreviewStage === 0 && <div {...tiltHandlers(3)} style={tiltStyle({ width: '100%', maxWidth: 880, margin: '0 auto', background: APP.bg, borderRadius: 24, overflow: 'hidden', boxSizing: 'border-box', fontFamily: APP.font, color: APP.text, textAlign: 'center', boxShadow: '0 20px 50px rgba(17,24,39,.18)', position: 'relative' })}><GlowLayer />
              <span style={{ position: 'absolute', zIndex: 2, top: 16, left: 16, background: '#000', color: '#FFF', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600, letterSpacing: .5 }}>FREE</span>
              {/* Wide on desktop: offer on the left, email form in a white panel on the right; stacks on phones. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}><div style={{ flex: '1 1 340px', minWidth: 0, padding: '56px 28px 28px', display: 'grid', alignContent: 'start', justifyItems: 'start', textAlign: 'left' }}>
              <AppOfferImage kind={activeFunnelStage.kind} size={110} align="left" />
              <div style={{ margin: '12px 0 2px' }}><OfferFormatTag kind={activeFunnelStage.kind} /></div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: APP.border, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{(displayName || 'G')[0]}</span>}<span style={{ color: APP.muted, fontSize: 13, fontWeight: 500 }}>{displayName || 'Your Guardian'}</span></span>
              <h3 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 600, lineHeight: '34px', letterSpacing: -0.5, margin: '0 0 4px' }}>{customerFacingOfferTitle(activeFunnelStage.title)}</h3>
              <p style={{ color: APP.muted, fontSize: 16, fontWeight: 600, margin: 0 }}>{activeFunnelStage.value || 'Enter your email to get it free'}</p>
              </div><div {...tiltHandlers(6)} style={tiltStyle({ flex: '1 1 320px', minWidth: 0, margin: 16, alignSelf: 'stretch', justifyContent: 'center', padding: '24px 22px 20px', background: APP.surface, borderRadius: 16, boxShadow: '0 2px 8px rgba(17,24,39,.08)', display: 'flex', flexDirection: 'column' })}><GlowLayer />
              <p style={{ color: APP.text, fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>Enter your email to get it free</p>
              <div>
              <label style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 16px', background: leadCaptureValue ? APP.surface : APP.alt, border: `${leadCaptureValue ? 2 : 1}px solid ${leadCaptureValue ? APP.text : APP.border}`, borderRadius: 12, textAlign: 'left', boxSizing: 'border-box' }}><Mail size={18} color={APP.muted} style={{ marginRight: 12, flex: '0 0 auto' }} /><input type="email" inputMode="email" autoComplete="email" value={leadCaptureValue} onChange={(event) => setLeadCaptureValue(event.target.value)} placeholder="Email" aria-label="Your email" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontFamily: APP.font, fontSize: 16, color: APP.text }} /></label>
              {leadCaptureValue && !leadEmailIsValid && <span role="alert" style={{ display: 'block', textAlign: 'left', color: '#EF4444', fontSize: 12, margin: '6px 0 0 16px' }}>Enter a valid email address.</span>}
              <button type="button" disabled={!leadEmailIsValid} onClick={completeFunnelCheckout} style={{ ...appButton, borderRadius: 12, marginTop: 16, background: '#000', color: '#FFF', fontSize: 16, fontWeight: 600, cursor: leadEmailIsValid ? 'pointer' : 'default' }}>Get free access</button>
              <p style={{ color: APP.muted, fontSize: 11, margin: '12px 0 0' }}>By continuing you agree to the <span style={{ color: '#0EA5E9' }}>Terms</span> and <span style={{ color: '#0EA5E9' }}>Privacy Policy</span></p>
              </div>
              </div></div>
              <div style={{ textAlign: 'left', margin: '0 16px', padding: '16px 0 18px', borderTop: `1px solid ${APP.border}` }}><ReviewRail reviews={guardianReviews.length ? guardianReviews : SAMPLE_REVIEWS} sample={!guardianReviews.length} accent={APP.greenDark} /></div>
            </div>}
            {funnelPageState === 'checkout' && funnelPreviewStage > 0 && <div style={{ width: '100%', maxWidth: 1040, margin: '0 auto', textAlign: 'left', display: 'grid', gap: 20 }}><div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', border: '1px solid rgba(17,18,15,.18)', background: 'rgba(255,255,255,.72)', borderRadius: 5, overflow: 'hidden', boxShadow: '0 14px 36px rgba(17,18,15,.08)' }}><span style={{ position: 'absolute', zIndex: 2, top: 12, right: 12, background: '#11120F', color: '#FFF', padding: '7px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{funnelPreviewStage === 0 ? 'Free' : activeFunnelStage.price}</span><div style={{ flex: '1 1 300px', maxWidth: '100%', display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(17,18,15,.035)', borderRight: '1px solid rgba(17,18,15,.12)', minHeight: 180 }}>{(() => { const art = productArt(activeFunnelStage.kind); return activeFunnelStage.kind === 'routine' ? <img src="/images/guides/generated/r3-protocol-card.png" alt="Printed Protocol and the ROUTINE³ app" style={{ display: 'block', width: '80%', maxWidth: 220, height: 'auto', aspectRatio: '1', objectFit: 'contain', margin: 0 }} /> : art ? <span aria-hidden="true" style={{ display: 'block', margin: 0, width: 130 * art.cellAspect, height: 130, backgroundImage: `url(${art.src})`, backgroundRepeat: 'no-repeat', backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`, backgroundPosition: `${(art.index % art.cols) * 100 / Math.max(1, art.cols - 1)}% ${Math.floor(art.index / art.cols) * 100 / Math.max(1, art.rows - 1)}%`, filter: 'grayscale(1) contrast(.95) invert(.88)' }} /> : null; })()}</div><div style={{ flex: '999 1 320px', padding: 'clamp(18px,3cqw,30px)', minWidth: 0 }}>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(17,18,15,.22)' }} /> : <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(17,18,15,.22)', fontFamily: serif }}>{(displayName || 'G')[0]}</span>}<span style={{ color: '#55564F', fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{displayName || 'Your Guardian'}</span></span></div>{funnelPreviewStage !== 0 && <span style={{ color: accentColor, fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Secure checkout</span>}
              <div style={{ margin: '12px 0 12px' }}><h3 style={{ fontFamily: serif, fontSize: 'clamp(30px,4.2cqw,50px)', fontWeight: 300, lineHeight: .98, margin: 0 }}>{customerFacingOfferTitle(activeFunnelStage.title)}</h3></div>
              {funnelPreviewStage === 0 ? <><p style={{ color: '#66645F', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>Enter your email to receive the free offer.</p>{/* Joined email + button, same seam as the homepage Subscribe control. */}<div style={{ maxWidth: 460, margin: '0 0 8px', display: 'flex' }}><input type="email" inputMode="email" autoComplete="email" required value={leadCaptureValue} onChange={(event) => setLeadCaptureValue(event.target.value)} placeholder="you@example.com" aria-label="Your email" aria-invalid={Boolean(leadCaptureValue) && !leadEmailIsValid} style={{ flex: 1, minWidth: 0, height: 44, boxSizing: 'border-box', border: `1px solid ${leadCaptureValue && !leadEmailIsValid ? '#A5463A' : '#11120F'}`, borderRight: 'none', borderRadius: '2px 0 0 2px', background: 'rgba(255,255,255,.7)', color: '#11120F', padding: '0 14px', fontFamily: sans, fontSize: 12, outline: 'none' }} /><button type="button" disabled={!leadEmailIsValid} onClick={completeFunnelCheckout} style={{ height: 44, boxSizing: 'border-box', padding: '0 16px', border: '1px solid #11120F', borderRadius: '0 2px 2px 0', background: '#11120F', color: '#FFFFFF', fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: leadEmailIsValid ? 'pointer' : 'default', opacity: leadEmailIsValid ? 1 : .55 }}>Send it <ArrowRight size={13} /></button></div>{leadCaptureValue && !leadEmailIsValid && <span role="alert" style={{ display: 'block', color: '#8A3D31', fontSize: 9, marginBottom: 10 }}>Enter a valid email address.</span>}</> : <>{(() => { const amount = activeFunnelStage.amount || 0; const total = couponApplied ? Math.round(amount * (1 - COUPON_RATE) * 100) / 100 : amount; return <>
                <div style={{ maxWidth: 420, margin: '0 0 18px', border: '1px solid rgba(17,18,15,.2)', background: 'rgba(255,255,255,.6)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: 13 }}><span>{customerFacingOfferTitle(activeFunnelStage.title)}</span><span>{formatMoney(amount, currency)}</span></div>
                  {couponApplied && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 12px', fontSize: 13, color: accentColor }}><span>Coupon {couponCode} · 30% off</span><span>−{formatMoney(Math.round((amount - total) * 100) / 100, currency)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid rgba(17,18,15,.15)', fontSize: 15, fontWeight: 700 }}><span>Total</span><span>{couponApplied && <s style={{ color: '#8A887F', fontWeight: 400, marginRight: 8 }}>{formatMoney(amount, currency)}</s>}{formatMoney(total, currency)}</span></div>
                  <div style={{ display: 'flex', borderTop: '1px solid rgba(17,18,15,.15)' }}><input aria-label="Coupon code" value={couponInput} onChange={(event) => { setCouponInput(event.target.value.toUpperCase()); setCouponApplied(false); setCouponError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') applyCoupon(); }} placeholder="Coupon code" style={{ flex: 1, minWidth: 0, height: 42, border: 0, background: 'transparent', padding: '0 14px', fontFamily: sans, fontSize: 12, letterSpacing: '.08em', outline: 'none', color: '#11120F' }} /><button type="button" onClick={() => applyCoupon()} disabled={!couponInput.trim() || couponApplied} style={{ height: 42, border: 0, borderLeft: '1px solid rgba(17,18,15,.15)', background: 'transparent', padding: '0 14px', fontFamily: sans, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: couponApplied ? accentColor : '#11120F', cursor: 'pointer' }}>{couponApplied ? 'Applied' : 'Apply'}</button></div>
                </div>
                {couponError && <span role="alert" style={{ display: 'block', color: '#8A3D31', fontSize: 11, margin: '-8px 0 12px' }}>{couponError}</span>}
                <button type="button" onClick={completeFunnelCheckout} style={{ ...btn, minHeight: 52, padding: '0 22px', background: accentColor, color: readableText(accentColor), borderColor: accentColor }}>Pay {formatMoney(total, currency)} <ArrowRight size={14} /></button>
              </>; })()}</>}
            </div></div>
              <ReviewRail reviews={guardianReviews.length ? guardianReviews : SAMPLE_REVIEWS} sample={!guardianReviews.length} accent={accentColor} />
            </div>}
            {/* Order confirmation (no more upsells), app style. */}
            {funnelPageState === 'access' && !postPurchaseOffer && <div style={tiltStyle({ width: '100%', maxWidth: 520, margin: '0 auto', background: APP.bg, color: APP.text, fontFamily: APP.font, borderRadius: 24, padding: '36px 24px 24px', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 20px 50px rgba(17,24,39,.18)' })} {...tiltHandlers(3)}><GlowLayer /><span style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={26} strokeWidth={2.5} /></span><h3 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: '0 0 4px' }}>{funnelPreviewStage === 0 ? `${customerFacingOfferTitle(activeFunnelStage.title)} is ready` : 'Purchase confirmed'}</h3><p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, margin: '0 0 18px' }}>{funnelPreviewStage === 0 ? `Sent to ${leadCaptureValue}` : `${customerFacingOfferTitle(activeFunnelStage.title)} · receipt sent to ${leadCaptureValue || 'your email'}`}</p>{funnelPurchases.length > 0 && <div style={{ background: APP.surface, borderRadius: 16, padding: '4px 16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(17,24,39,.06)' }}>{funnelPurchases.map((title: string) => { const stage = funnelStages.find((x) => x.title === title); return <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: `1px solid ${APP.border}`, fontSize: 15, fontWeight: 600, textAlign: 'left' }}><span style={{ width: 22, height: 22, flex: '0 0 22px', borderRadius: '50%', border: '1.5px solid #262626', display: 'grid', placeItems: 'center' }}><Check size={13} strokeWidth={2.5} /></span><span style={{ flex: 1, minWidth: 0 }}>{customerFacingOfferTitle(title)}</span><span style={{ color: APP.muted, fontSize: 13 }}>{stage?.price || ''}</span></div>; })}</div>}{funnelPreviewStage === 0 && <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{freeDelivery.includes('Downloadable PDF') && <button type="button" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.surface, color: APP.text }}><Download size={16} />PDF</button>}{freeDelivery.includes('Interactive Protocol') && <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.surface, color: APP.text }}>Open in <RoutineMark size={20} textColor="#111827" hairline="#111827" suffix="" /></a>}</div>}<button type="button" onClick={continueAfterAccess} style={{ ...appButton, borderRadius: 12, fontSize: 16, fontWeight: 600 }}>Continue</button></div>}
            {/* Upsell hero: the next offer's video leads; the delivered offer sits in a fixed footer bar. */}
            {funnelPageState === 'access' && postPurchaseOffer && <div style={{ width: '100%', display: 'grid', gap: 22 }}>
              {upsellCard(postPurchaseOffer, () => resolvePostPurchase(true), () => resolvePostPurchase(false))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', width: '100%', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box', padding: '16px 18px', background: APP.surface, border: `1px solid ${APP.border}`, borderRadius: 16, fontFamily: APP.font, color: APP.text }}>
                {/* Delivery: one line of status on the left, the two ways to open it on the right. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}><span style={{ width: 32, height: 32, flex: '0 0 32px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={16} strokeWidth={2.5} /></span><span style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{funnelPreviewStage === 0 ? `${customerFacingOfferTitle(funnelStages[0].title)} is ready` : 'Purchase confirmed'}</strong><span style={{ color: APP.muted, fontSize: 12 }}>{funnelPreviewStage === 0 ? `Sent to ${leadCaptureValue}` : 'Access details are ready.'}</span></span></span>
                {funnelPreviewStage === 0 && <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {freeDelivery.includes('Downloadable PDF') && <button type="button" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.alt, color: APP.text }}><Download size={16} />PDF</button>}
                  {freeDelivery.includes('Interactive Protocol') && <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Open in ROUTINE³" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: `1px solid ${APP.border}`, background: APP.alt, color: APP.text }}>Open in <RoutineMark size={20} textColor="#111827" hairline="#111827" suffix="" /></a>}
                  {!freeDelivery.some((delivery) => delivery === 'Downloadable PDF' || delivery === 'Interactive Protocol') && <button type="button" style={{ height: 44, padding: '0 16px', borderRadius: 12, fontFamily: APP.font, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', border: 0, background: '#000', color: '#FFF' }}>{freeOfferCta[freeOfferType]}</button>}
                </span>}
              </div>
            </div>}
            {funnelPageState === 'post_purchase' && postPurchaseOffer && <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: accentColor, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}><Check size={15} /> Free Protocol delivered</span><h3 style={{ fontFamily: serif, fontSize: 'clamp(42px,6cqw,70px)', fontWeight: 300, lineHeight: .98, margin: '18px 0 12px' }}>Get your personalised Protocol and call for 30% off.</h3>{postPurchaseOffer.video && <video src={postPurchaseOffer.video} controls playsInline style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', background: '#11120F', borderRadius: 4, margin: '0 auto 18px', maxWidth: 560 }} />}<p style={{ color: '#66645F', fontSize: 14, lineHeight: 1.6, margin: '0 auto 18px', maxWidth: 600 }}>Add <strong>{customerFacingOfferTitle(postPurchaseOffer.title)}</strong> for a plan adapted to your needs and a private call with {displayName || 'your Guardian'}. Your free download is already yours.</p><div style={{ display: 'inline-block', border: `1px solid ${accentColor}`, padding: '8px 12px', color: funnelTimerSeconds ? accentColor : '#8A3D31', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 18 }}>{funnelTimerSeconds ? `30% off · ${String(Math.floor(funnelTimerSeconds / 60)).padStart(2, '0')}:${String(funnelTimerSeconds % 60).padStart(2, '0')}` : 'Limited offer expired'}</div><div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}><button type="button" disabled={!funnelTimerSeconds} onClick={() => resolvePostPurchase(true)} style={{ ...btn, minHeight: 52, padding: '0 22px', background: accentColor, color: readableText(accentColor), borderColor: accentColor, opacity: funnelTimerSeconds ? 1 : .45 }}>Yes, add {postPurchaseOffer.meta.split(' · ')[0]} <ArrowRight size={14} /></button><button type="button" onClick={() => resolvePostPurchase(false)} style={{ ...btn, minHeight: 52, padding: '0 18px', background: 'transparent', color: '#11120F', borderColor: 'rgba(17,18,15,.35)' }}>No thanks, continue</button></div></div>}
            {/* Final order summary, app style. */}
            {funnelPageState === 'complete' && <div style={tiltStyle({ width: '100%', maxWidth: 520, margin: '0 auto', background: APP.bg, color: APP.text, fontFamily: APP.font, borderRadius: 24, padding: '36px 24px 24px', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 20px 50px rgba(17,24,39,.18)' })} {...tiltHandlers(3)}><GlowLayer /><span style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', background: APP.greenSoft, color: '#000', display: 'grid', placeItems: 'center' }}><Check size={26} strokeWidth={2.5} /></span><h3 style={{ fontFamily: APP.font, fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: '0 0 4px' }}>You’re all set!</h3><p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, margin: '0 0 18px' }}>{funnelPurchases.length} offer{funnelPurchases.length === 1 ? '' : 's'} in your order · receipt sent to {leadCaptureValue || 'your email'}</p>{funnelPurchases.length > 0 && <div style={{ background: APP.surface, borderRadius: 16, padding: '4px 16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(17,24,39,.06)' }}>{funnelPurchases.map((title: string) => { const stage = funnelStages.find((x) => x.title === title); return <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: `1px solid ${APP.border}`, fontSize: 15, fontWeight: 600, textAlign: 'left' }}><span style={{ width: 22, height: 22, flex: '0 0 22px', borderRadius: '50%', border: '1.5px solid #262626', display: 'grid', placeItems: 'center' }}><Check size={13} strokeWidth={2.5} /></span><span style={{ flex: 1, minWidth: 0 }}>{customerFacingOfferTitle(title)}</span><span style={{ color: APP.muted, fontSize: 13 }}>{stage?.price || ''}</span></div>; })}</div>}<a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ ...appButton, borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Open in <RoutineMark size={20} textColor="#FFFFFF" hairline="rgba(255,255,255,.7)" suffix="" /></span></a></div>}
          </div>
          </PreviewFrame></div></div>
        </div>
        </FunnelStage>
        {/* Setup details stay available but collapsed: the step should end on Publish, not a wall of summary. */}
        <details style={{ borderTop: `1px solid ${line}`, marginTop: 8, paddingTop: 14 }}>
          <summary style={{ cursor: 'pointer', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Review setup summary</summary>
          <div style={{ marginTop: 16 }}>
        <div><label style={label}>Add one personal sentence <span style={{ color: muted }}>· optional</span></label><input style={input} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Why people come to you — or leave this blank" /></div>
        <div style={{ borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, padding: '22px 0', marginTop: 28, display: 'grid', gap: 13 }}>
          <div><span style={label}>Guardian</span><span style={{ fontFamily: serif, fontSize: 26 }}>{displayName}</span></div>
          <div><span style={label}>Main language</span><span style={{ color: ink, fontSize: 12 }}>{mainLanguage}</span></div>
          <div><span style={label}>Contact</span><span style={{ color: ink, fontSize: 12 }}>{[contactEmail, whatsappPhone].filter(Boolean).join(' · ')}</span></div>
          {bookingUrl && <div><span style={label}>Booking</span><span style={{ color: ink, fontSize: 12 }}>{bookingProvider} · {bookingUrl}</span></div>}
          <div><span style={label}>Guidance</span><span style={{ color: ink, fontSize: 12 }}>{chosen.join(' · ')}</span></div>
          <div><span style={label}>Audience and format</span><span style={{ color: ink, fontSize: 12 }}>{audience.join(' · ')} · {format.join(' · ')}</span></div>
          {(leadMagnetTitle || orderedUpsells.length > 0) && <div><span style={label}>Offer ladder · {pricingRegion}</span><span style={{ color: ink, fontSize: 12 }}>{[leadMagnetTitle && `Free: ${leadMagnetTitle} · ${freeDelivery.join(' + ')}`, ...orderedUpsells.map((kind) => `${upsellDrafts[kind].title} · ${offerAccess[kind] === 'free' ? 'Free' : `${formatMoney(upsellDrafts[kind].price, currency)}${billingLabels[upsellDrafts[kind].billingModel].suffix}`} · ${upsellDrafts[kind].delivery.join(' + ')}`)].filter(Boolean).join(' → ')}</span></div>}
          <div><span style={label}>Website goal</span><span style={{ color: ink, fontSize: 12 }}>{websiteGoal}</span></div>
        </div>
          </div>
        </details>
        <div style={{ border: `1px solid ${acid}`, background: '#20251B', padding: 16, marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0, display: 'grid', gap: 8 }}>
            <span style={{ ...label, color: acid, marginBottom: 0 }}>Publishing</span>
            {[['Profile site', `/guardians/${guardianSlug}`], ['First offer path', publishedSitePath]].map(([text, path]) => <a key={text} href={path} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'baseline', gap: 10, color: ink, textDecoration: 'none' }}><span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', minWidth: 104 }}>{text}</span><code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, overflowWrap: 'anywhere', borderBottom: `1px solid ${line}` }}>{path}</code><ExternalLink size={11} /></a>)}
          </span>
          <button type="submit" disabled={busy} style={{ ...btn, flex: '0 0 auto' }}>{busy ? 'Publishing…' : 'Publish site'} <ArrowRight size={14} /></button>
        </div>
      </>}

      {error && <p style={{ color: '#F0A7A7', fontSize: 12 }}>{error}</p>}
      {step !== 3 && step !== 5 && (step !== 4 || offerPlanStage === 2) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', alignItems: 'center', gap: 12, marginTop: 34 }}>
        {step > 1 ? <button type="button" onClick={() => { setError(''); if (step === 3) setAudienceSetupStage(1); else if (step === 4) setOfferPlanStage(1); else setStep((current) => current - 1); }} style={{ ...btn, width: '100%', background: 'transparent', color: ink }}>← Back</button> : <span />}
        {(step !== 4 || offerPlanStage === 2) && (step !== 5 || freeOfferSetupStage === 2) ? step < 5 ? <button type="button" onClick={continueSetup} disabled={importing} style={{ ...btn, width: '100%' }}>{importing ? <><Loader2 size={14} className="animate-spin" /> Reading profiles</> : <>Continue <ArrowRight size={14} /></>}</button> : <button disabled={busy} style={{ ...btn, width: '100%' }}>{busy ? 'Creating your Guardian' : 'Create my Guardian profile'} <ArrowRight size={14} /></button> : <span />}
      </div>}
        </section>
      </div>
    </form>}
    {!summaryView && <StepRelated step={step} guardianSlug={guardianSlug} displayName={displayName} related={related} audience={audienceLabel(audienceDetails, audience)} />}
  </div>;
}

/** Below the fold of each setup step: the Guardian's existing items for that stage. */
function StepRelated({ step, guardianSlug, displayName, related, audience = '' }: { audience?: string;  step: number; guardianSlug: string; displayName: string; related: { leads: GuideLead[]; offers: GuideOffer[]; ramps: GuideValueRamp[]; protocols: AdminProtocol[] } }) {
  const open = (href: string) => () => { window.location.href = href; };
  const offerImage = (offer: GuideOffer) => offer.access_model === 'free' ? '/images/guides/lead-plate.png' : '/images/guides/offer-plate.png';
  const rampRows = related.ramps.map((ramp) => ({ key: ramp.id, title: ramp.name, meta: `${[ramp.audience, ramp.problem].filter(Boolean).join(' · ')} · ${ramp.offer_ids.length} offers · ${ramp.status}`, image: '/images/guides/offer-plate.png', href: `/guardians/${guardianSlug}/value-ramp/${ramp.slug}` }));
  const sections: Record<number, { title: string; tab: string; rows: { key: string; title: string; meta: string; image?: string | null; href: string }[] }> = {
    1: { title: 'Your sites', tab: 'value_ramps', rows: [{ key: 'profile', title: `${displayName || 'Your'} profile site`, meta: `/guardians/${guardianSlug}`, image: '/images/guides/guide-plate.png', href: `/guardians/${guardianSlug}` }, ...rampRows] },
    2: { title: 'Your Protocols', tab: 'protocols', rows: related.protocols.map((protocol) => ({ key: protocol.id, title: protocol.name, meta: `${protocol.total_days || 1} days · ${protocol.is_public ? 'Published' : 'Draft'}`, image: protocol.image_url, href: '/guardians/workspace?tab=protocols' })) },
    3: { title: 'Your leads', tab: 'leads', rows: related.leads.map((lead) => ({ key: lead.id, title: lead.name, meta: `${lead.email} · ${lead.goal || 'No goal yet'} · ${lead.stage}`, href: '/guardians/workspace?tab=leads' })) },
    4: { title: 'Your offers', tab: 'offer_builder', rows: related.offers.map((offer) => ({ key: offer.id, title: offer.title, meta: [APP_PLAN_KINDS.includes(offer.kind) ? 'PDF + ROUTINE³' : OTHER_FORMATS[offer.kind] || offer.kind.replaceAll('_', ' '), offer.access_model === 'free' ? 'Free' : offer.price_cents ? formatMoney(offer.price_cents / 100, offer.currency || 'GBP') : 'Paid', audience, offer.status].filter(Boolean).join(' · '), image: offerImage(offer), href: '/guardians/workspace?tab=offer_builder' })) },
    5: { title: 'Your offer paths', tab: 'value_ramps', rows: rampRows },
  };
  const section = sections[step];
  if (!section) return null;
  return <section aria-label={section.title} style={{ maxWidth: 1100, margin: '0 auto 80px', borderTop: `1px solid ${line}`, paddingTop: 28 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
      <span style={{ ...label, color: acid, marginBottom: 0 }}>In your workspace · {section.title} · {section.rows.length}</span>
      <a href={`/guardians/workspace?tab=${section.tab}`} style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Open all →</a>
    </div>
    {section.rows.length ? section.rows.slice(0, 8).map((row) => <Row key={row.key} title={row.title} meta={row.meta} image={row.image} action="Open" onClick={open(row.href)} />) : <p style={{ color: muted, fontSize: 12 }}>Nothing here yet. What you create in this step will appear here.</p>}
  </section>;
}

function Empty({ title, copy, action, image }: { title: string; copy: string; action?: React.ReactNode; image?: string }) {
  return <div style={{ border: `1px solid ${line}`, padding: 38, textAlign: 'center', background: panel }}>{image && <img src={image} alt="" loading="lazy" style={{ width: 104, height: 104, objectFit: 'contain', filter: 'grayscale(1) contrast(.9) brightness(.78)', opacity: .85, marginBottom: 14 }} />}<h3 style={{ fontFamily: serif, fontSize: 28, fontWeight: 300, margin: '0 0 8px' }}>{title}</h3><p style={{ color: muted, fontSize: 13, margin: '0 0 20px' }}>{copy}</p>{action}</div>;
}

/** Saved Guardian recipe → editable draft (older recipes stored ingredients/method as plain lines). */
function recipeToDraft(recipe: GuideRecipe): RecipeDraft {
  const ingredients = (recipe.ingredients || []).map((item: any): RecipeIngredient => typeof item === 'string'
    ? { name: item, amount: 0, unit: 'g', grams: 0, ingredient_id: null, catalog_name: null, per100: null }
    : { name: item.name || '', amount: Number(item.amount) || 0, unit: item.unit || 'g', grams: Number(item.grams) || 0, preparation: item.preparation, ingredient_id: item.ingredient_id ?? null, catalog_name: item.catalog_name ?? null, image_url: item.image_url ?? null, per100: item.per100 ?? null });
  return { title: recipe.title, description: recipe.description || '', meal_slot: recipe.meal_slot || 'any', servings: recipe.servings || 1, prep_time: recipe.prep_time ?? null, cook_time: recipe.cook_time ?? null, ingredients, instructions: (recipe.instructions || []).map((s: any) => typeof s === 'string' ? s : String(s?.text || '')), image_url: recipe.image_url || null };
}

function draftToRow(draft: RecipeDraft, bookIds: string[]) {
  const n = computeNutrition(draft.ingredients, draft.servings);
  return {
    title: draft.title.trim(), description: draft.description.trim() || null, meal_slot: draft.meal_slot, image_url: draft.image_url,
    ingredients: draft.ingredients.filter((i) => i.name.trim()).map(({ name, amount, unit, grams, preparation, ingredient_id, catalog_name, image_url, per100 }) => ({ name, amount, unit, grams, preparation, ingredient_id, catalog_name, image_url, per100 })),
    instructions: draft.instructions.map((s) => s.trim()).filter(Boolean),
    servings: draft.servings, prep_time: draft.prep_time, cook_time: draft.cook_time,
    nutrition_per_serving: { ...n.perServing, serving_size_g: n.servingWeight }, nutrition_total: { ...n.total, total_weight_g: n.totalWeight, matched_ingredients: n.matched, ingredient_count: n.count },
    offer_ids: bookIds,
  };
}

function downloadRecipePdf(recipes: RecipeDraft[], opts: { bookTitle?: string; author?: string } = {}) {
  const { doc, filename } = buildRecipePdf(recipes, opts);
  doc.save(filename);
}

/** The recipe as it appears in the ROUTINE³ app (detail tray) or as the printable PDF, like the Protocol editor's preview. */
function RecipePreview({ draft, author = '', avatarUrl = null }: { draft: RecipeDraft; author?: string; avatarUrl?: string | null }) {
  const [mode, setMode] = useState<'card' | 'app' | 'pdf'>('card');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== 'pdf') return;
    let url: string | null = null;
    const timer = window.setTimeout(() => { try { url = URL.createObjectURL(buildRecipePdf([draft]).doc.output('blob')); setPdfUrl(url); } catch { setPdfUrl(null); } }, 400);
    return () => { window.clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [mode, draft]);
  const n = computeNutrition(draft.ingredients, draft.servings);
  const total = (draft.prep_time || 0) + (draft.cook_time || 0);
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px', borderRadius: 12, background: APP.alt, border: `1px solid ${APP.border}`, fontSize: 11, fontWeight: 500, color: APP.text, textTransform: 'capitalize' };
  return <div style={{ position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
    <div role="group" aria-label="Preview" style={{ display: 'inline-flex', border: `1px solid ${line}`, borderRadius: 6, overflow: 'hidden' }}>
      {(['card', 'app', 'pdf'] as const).map((m, i) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} style={{ height: 30, padding: '0 16px', border: 0, borderLeft: i ? `1px solid ${line}` : 0, background: mode === m ? ink : 'transparent', color: mode === m ? black : ink, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', cursor: 'pointer' }}>{m === 'card' ? 'CARD' : m === 'app' ? 'APP' : 'PDF'}</button>)}
    </div>
    {mode === 'card' ? <div style={{ width: 300 }}><ProductCard kind="recipe_book" imageUrl={draft.image_url} eyebrow={[draft.meal_slot && draft.meal_slot !== 'any' ? draft.meal_slot.charAt(0).toUpperCase() + draft.meal_slot.slice(1) : 'Any meal', n.perServing.energy_kcal ? `${Math.round(n.perServing.energy_kcal)} kcal` : '', total ? `${total} min` : ''].filter(Boolean).join(' · ')} title={draft.title || 'Untitled recipe'} copy={draft.description.length > 110 ? `${draft.description.slice(0, 110).replace(/\s+\S*$/, '')}…` : draft.description || undefined} name={author} avatarUrl={avatarUrl} accent={acid} cta="Open recipe" /></div>
    : mode === 'pdf' ? <>
      <div style={{ width: 290, aspectRatio: '210 / 297', background: '#FFF', border: `1px solid ${line}` }}>{pdfUrl ? <iframe title="Printable recipe PDF" src={`${pdfUrl}#toolbar=0&view=FitH`} style={{ width: '100%', height: '100%', border: 0 }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: APP.faint, fontSize: 12 }}>Building PDF…</div>}</div>
      <button type="button" onClick={() => downloadRecipePdf([draft])} style={{ ...btn, minHeight: 34 }}><FileText size={12} /> Download PDF</button>
    </> : <PhoneFrame width={290} screenBg={APP.bg}>
      <div className="phone-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto', fontFamily: APP.font, color: APP.text, background: APP.bg }}>
        <div style={{ height: 190, background: '#E5E7EB', position: 'relative' }}>{draft.image_url && <img src={draft.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
        <div style={{ position: 'relative', marginTop: -22, background: APP.surface, borderRadius: '22px 22px 0 0', padding: '10px 16px 28px', minHeight: 400 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: APP.border, margin: '0 auto 12px' }} />
          <div style={{ fontSize: 10, fontWeight: 600, color: APP.greenDark, textTransform: 'uppercase', letterSpacing: '.08em' }}>Recipe</div>
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, margin: '2px 0 8px', letterSpacing: -0.3 }}>{draft.title || 'Untitled recipe'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{draft.meal_slot !== 'any' && <span style={chip}>{draft.meal_slot}</span>}{total > 0 && <span style={chip}>⏱ {total} min</span>}<span style={chip}>{draft.servings} serving{draft.servings === 1 ? '' : 's'}</span></div>
          {draft.description && <p style={{ fontSize: 12, color: APP.muted, lineHeight: 1.5, margin: '10px 0 0' }}>{draft.description}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 14 }}>{([['energy_kcal', 'kcal', ''], ['protein_g', 'Protein', 'g'], ['carbohydrates_g', 'Carbs', 'g'], ['fats_g', 'Fat', 'g']] as Array<[MacroKey, string, string]>).map(([key, name, unit]) => <div key={key} style={{ background: APP.alt, borderRadius: 12, padding: '8px 4px', textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 700 }}>{n.perServing[key] != null ? Math.round(n.perServing[key]!) : '–'}{unit}</div><div style={{ fontSize: 9, color: APP.muted }}>{name}</div></div>)}</div>
          <div style={{ fontSize: 9, color: APP.faint, marginTop: 4, textAlign: 'center' }}>per serving · {n.servingWeight} g</div>
          <div style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px' }}>Ingredients</div>
          {draft.ingredients.filter((i) => i.name.trim()).map((item, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${APP.border}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: APP.alt, overflow: 'hidden', flexShrink: 0 }}>{item.image_url && <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>{item.catalog_name || item.name}</span>
            <span style={{ fontSize: 11, color: APP.muted, whiteSpace: 'nowrap' }}>{+item.amount.toFixed(2)} {item.unit}</span>
          </div>)}
          <div style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px' }}>Steps</div>
          {draft.instructions.filter((s) => s.trim()).map((step, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0' }}><span style={{ width: 22, height: 22, borderRadius: 11, background: '#000', color: '#FFF', fontSize: 11, fontWeight: 600, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 12, lineHeight: 1.5 }}>{step}</span></div>)}
        </div>
      </div>
    </PhoneFrame>}
    <p style={{ fontSize: 10, fontStyle: 'italic', color: muted, margin: 0, textAlign: 'center', maxWidth: 270 }}>{mode === 'card' ? 'The recipe card as it shows in your recipe list, books and offers.' : mode === 'app' ? 'Live preview: the recipe as it appears in the ROUTINE³ app.' : 'Printable PDF, one page per recipe.'}</p>
  </div>;
}

function NutritionPanel({ draft, avoid = [] }: { draft: RecipeDraft; avoid?: string[] }) {
  const n = computeNutrition(draft.ingredients, draft.servings);
  const [tier, setTier] = useState<Tier>(15);
  const broken = avoidViolations(draft.ingredients, avoid);
  const macro: Array<[MacroKey, string, string]> = [['energy_kcal', 'kcal', ''], ['protein_g', 'Protein', 'g'], ['carbohydrates_g', 'Carbs', 'g'], ['fats_g', 'Fat', 'g'], ['fiber_g', 'Fibre', 'g'], ['sugar_g', 'Sugar', 'g']];
  const micros = KEY_MICROS.filter(([key]) => n.perServing.micros?.[key] != null);
  const cell = (value: number | undefined, unit: string) => value == null ? '—' : `${value}${unit}`;
  return <div style={{ border: `1px solid ${line}`, padding: 16, background: '#0D0E0B' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div style={{ ...label, color: acid, margin: 0 }}>Nutrition · calculated from the ROUTINE³ database</div><span style={{ color: n.matched === n.count ? acid : '#E8B86A', fontSize: 10 }}>{n.matched} of {n.count} ingredients matched</span></div>
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 12 }}><thead><tr style={{ color: muted, textAlign: 'right' }}><th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}></th><th style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Per serving ({n.servingWeight} g)</th><th style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Whole recipe ({n.totalWeight} g)</th></tr></thead>
      <tbody>{macro.map(([key, name, unit]) => <tr key={key} style={{ borderTop: `1px solid ${line}`, textAlign: 'right' }}><td style={{ textAlign: 'left', padding: '6px 0', color: muted }}>{name}</td><td style={{ color: ink, fontWeight: key === 'energy_kcal' ? 700 : 400 }}>{cell(n.perServing[key], unit)}</td><td style={{ color: muted }}>{cell(n.total[key], unit)}</td></tr>)}
      {micros.length > 0 && <tr style={{ borderTop: `1px solid ${line}` }}><td colSpan={3} style={{ ...label, margin: 0, padding: '12px 0 4px', fontSize: 9, color: n.microMatched === n.matched ? muted : '#E8B86A' }}>Micronutrients · from {n.microMatched} of {n.count} ingredients with micronutrient data</td></tr>}{micros.map(([key, name]) => { const unit = key.split('_').pop() === 'iu' ? ' IU' : ` ${key.split('_').pop()}`; return <tr key={key} style={{ borderTop: `1px solid ${line}`, textAlign: 'right' }}><td style={{ textAlign: 'left', padding: '5px 0', color: muted }}>{name}</td><td>{n.perServing.micros![key]}{unit}</td><td style={{ color: muted }}>{n.total.micros![key]}{unit}</td></tr>; })}</tbody></table>
    {n.matched < n.count && <p style={{ color: muted, fontSize: 10, margin: '10px 0 0' }}>Unmatched ingredients add no nutrition. Pick a database match for each to complete the totals.</p>}
    {broken.length > 0 && <p style={{ color: '#E88A7A', fontSize: 11, margin: '10px 0 0', fontWeight: 700 }}>Uses avoided ingredients: {broken.join(', ')}. Swap them before saving.</p>}
    <NutrientCoverage micros={n.perServing.micros} macros={{ protein_g: n.perServing.protein_g, fiber_g: n.perServing.fiber_g }} tier={tier} onTier={setTier} />
    <HazardList hazards={n.hazards} allergens={n.allergens} />
  </div>;
}

function IngredientMatch({ item, onPick }: { item: RecipeIngredient; onPick: (match: CatalogIngredient) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(item.name);
  const [results, setResults] = useState<CatalogIngredient[]>([]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => { searchCatalogIngredients(term, 8).then(setResults).catch(() => setResults([])); }, 250); return () => clearTimeout(t); }, [term, open]);
  return <div style={{ position: 'relative' }}>
    <button type="button" onClick={() => setOpen(!open)} title="Change database match" style={{ border: `1px solid ${item.ingredient_id ? line : '#E8B86A'}`, background: 'transparent', color: item.ingredient_id ? acid : '#E8B86A', fontSize: 10, padding: '4px 8px', borderRadius: 3, cursor: 'pointer', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.catalog_name ? `✓ ${item.catalog_name}` : 'No match · pick one'}</button>
    {open && <div style={{ position: 'absolute', zIndex: 5, top: 30, right: 0, width: 260, background: panel, border: `1px solid ${line}`, padding: 8, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
      <input autoFocus style={{ ...input, minHeight: 34 }} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search ingredients" />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>{results.map((r) => <button key={r.id} type="button" onClick={() => { onPick(r); setOpen(false); }} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', border: 0, background: 'transparent', color: ink, padding: '7px 4px', fontSize: 11, cursor: 'pointer', textAlign: 'left', borderBottom: `1px solid ${line}` }}><span>{r.name_common}</span><span style={{ color: muted }}>{r.per100?.energy_kcal != null ? `${r.per100.energy_kcal} kcal/100g` : 'no data'}</span></button>)}{!results.length && <div style={{ color: muted, fontSize: 11, padding: 6 }}>No ingredients found.</div>}</div>
    </div>}
  </div>;
}

function RecipeDraftEditor({ draft, onChange, onRemove, onSave, saving, savedLabel, avoid = [], author }: { author?: string; draft: RecipeDraft; onChange: (draft: RecipeDraft) => void; onRemove: () => void; onSave: () => void; saving: boolean; savedLabel?: string; avoid?: string[] }) {
  const set = (patch: Partial<RecipeDraft>) => onChange({ ...draft, ...patch });
  const setItem = (index: number, patch: Partial<RecipeIngredient>) => {
    const ingredients = draft.ingredients.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      if (patch.amount != null || patch.unit != null || patch.per100 !== undefined) next.grams = gramsFor(next.amount, next.unit, next.piece_weight_g ? { piece_weight_g: next.piece_weight_g, piece_label: next.piece_label } : null, item.amount > 0 ? item.grams * (next.amount / item.amount) : item.grams);
      return next;
    });
    set({ ingredients });
  };
  const small: React.CSSProperties = { ...input, minHeight: 34, padding: '0 8px', fontSize: 12 };
  return <article style={{ border: `1px solid ${line}`, background: panel, padding: 22, marginTop: 16, display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <div style={{ flex: '1 1 520px', minWidth: 0 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 18 }}>
      <div style={{ width: 120, height: 120, border: `1px solid ${line}`, background: '#171812', overflow: 'hidden', display: 'grid', placeItems: 'center', color: muted, fontFamily: serif, fontSize: 40 }}>{draft.image_url ? <img src={draft.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : draft.title.charAt(0)}</div>
      <div><input style={{ ...input, fontFamily: serif, fontSize: 26, minHeight: 50 }} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        <textarea style={{ ...input, height: 60, paddingTop: 10, marginTop: 8, fontSize: 12 }} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginTop: 14 }}>
      <div><label style={label}>Meal</label><select style={small} value={draft.meal_slot} onChange={(e) => set({ meal_slot: e.target.value })}>{['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'dessert', 'any'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
      <div><label style={label}>Servings</label><input type="number" min={1} style={small} value={draft.servings} onChange={(e) => set({ servings: Math.max(1, Number(e.target.value) || 1) })} /></div>
      <div><label style={label}>Prep · min</label><input type="number" min={0} style={small} value={draft.prep_time ?? ''} onChange={(e) => set({ prep_time: e.target.value === '' ? null : Number(e.target.value) })} /></div>
      <div><label style={label}>Cook · min</label><input type="number" min={0} style={small} value={draft.cook_time ?? ''} onChange={(e) => set({ cook_time: e.target.value === '' ? null : Number(e.target.value) })} /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 18 }}>
      <div>
        <label style={label}>Ingredients · amounts matched to the database</label>
        {draft.ingredients.map((item, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '62px 78px minmax(0,1fr) auto 22px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <input type="number" min={0} style={small} value={item.amount} onChange={(e) => setItem(index, { amount: Number(e.target.value) || 0 })} />
          <select style={small} value={item.unit} onChange={(e) => setItem(index, { unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          <div style={{ minWidth: 0 }}><input style={small} value={item.name} onChange={(e) => setItem(index, { name: e.target.value })} /><div style={{ color: muted, fontSize: 9, marginTop: 2 }}>{item.grams} g{item.per100?.energy_kcal != null ? ` · ${Math.round(item.per100.energy_kcal * item.grams / 100)} kcal` : ''}{item.preparation ? ` · ${item.preparation}` : ''}</div></div>
          <IngredientMatch item={item} onPick={(match) => setItem(index, { ingredient_id: match.id, catalog_name: match.name_common, image_url: match.image_url, per100: match.per100, piece_weight_g: match.piece_weight_g, piece_label: match.piece_label })} />
          <button type="button" aria-label="Remove ingredient" onClick={() => set({ ingredients: draft.ingredients.filter((_, i) => i !== index) })} style={{ border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}>×</button>
        </div>)}
        <button type="button" onClick={() => set({ ingredients: [...draft.ingredients, { name: '', amount: 0, unit: 'g', grams: 0, ingredient_id: null, catalog_name: null, per100: null }] })} style={{ ...btn, minHeight: 32, background: 'transparent', color: ink, marginTop: 4 }}><Plus size={12} /> Ingredient</button>
        <label style={{ ...label, marginTop: 18 }}>Method · one step per line</label>
        <textarea style={{ ...input, height: 170, paddingTop: 10, lineHeight: 1.55, fontSize: 12 }} value={draft.instructions.join('\n')} onChange={(e) => set({ instructions: e.target.value.split('\n') })} />
      </div>
      <NutritionPanel draft={draft} avoid={avoid} />
    </div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
      <button type="button" onClick={onSave} disabled={saving || !draft.title.trim()} style={btn}>{saving ? 'Saving…' : savedLabel ? 'Save changes' : 'Save recipe'}</button>
      <button type="button" onClick={onRemove} style={{ ...btn, background: 'transparent', color: muted }}>Discard</button>
      {savedLabel && <span style={{ color: acid, fontSize: 11 }}>{savedLabel}</span>}
    </div>
    </div>
    <RecipePreview draft={draft} author={author} />
  </article>;
}

function GuardianRecipeAI({ userId, accessToken, offers, recipes, author, onSaved }: { userId: string; accessToken: string; offers: GuideOffer[]; recipes: GuideRecipe[]; author?: string; onSaved: (recipe: GuideRecipe) => void }) {
  const books = offers.filter((offer) => offer.kind === 'recipe_book');
  // A recipe idea sent from the Diet planner arrives as a ready brief.
  const [brief, setBrief] = useState(() => { try { const b = sessionStorage.getItem('guardian:recipe-brief') || ''; sessionStorage.removeItem('guardian:recipe-brief'); return b; } catch { return ''; } });
  const [count, setCount] = useState(3);
  const [mealSlot, setMealSlot] = useState('');
  const [urls, setUrls] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Array<RecipeDraft & { key: number; savedId?: string; saving?: boolean; savedLabel?: string }>>([]);
  const [bookId, setBookId] = useState(books[0]?.id || '');
  useEffect(() => { if (!bookId && books[0]) setBookId(books[0].id); }, [books.length]);
  const [filters, setFilters] = useState<RecipeFilters>({ diets: [], useIngredients: [], avoidIngredients: [], boost: [], limit: [] });
  const [tier, setTier] = useState<Tier>(15);
  const [showFilters, setShowFilters] = useState(false);
  const filterBrief = filtersToBrief(filters);
  const activeFilters = filters.diets.length + filters.useIngredients.length + filters.avoidIngredients.length + filters.boost.length + filters.limit.length;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setMessage('');
    try { const uploaded = await Promise.all(Array.from(files).slice(0, 4 - photos.length).map((file) => uploadGuideImage(userId, file))); setPhotos([...photos, ...uploaded].slice(0, 4)); }
    catch (error: any) { setMessage(error?.message || 'Photo upload failed.'); }
    finally { setUploading(false); }
  }
  async function build() {
    setBuilding(true); setMessage('');
    try {
      const goal = filters.boost.length >= 10 ? `\nTogether the ${count} recipes should cover as many of these essential nutrients as possible, each recipe bringing different ones.` : '';
      const result = await buildRecipesWithAI(accessToken, { message: [brief.trim() || `Create ${count} recipes.`, filterBrief, goal].filter(Boolean).join('\n'), count, mealSlot: mealSlot || undefined, sourceUrls: urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u)), imageUrls: photos });
      setDrafts([...result.recipes.map((recipe, i) => ({ ...recipe, key: Date.now() + i })), ...drafts]);
      setMessage(result.summary || `${result.recipes.length} recipe${result.recipes.length === 1 ? '' : 's'} drafted. Review the amounts and database matches, then save.`);
    } catch (error: any) { setMessage(error?.message || 'Could not build recipes.'); }
    finally { setBuilding(false); }
  }
  async function save(key: number) {
    const draft = drafts.find((d) => d.key === key); if (!draft) return;
    const patch = (p: Partial<typeof draft>) => setDrafts((current) => current.map((d) => d.key === key ? { ...d, ...p } : d));
    patch({ saving: true });
    try {
      const { recipe, savedNutrition } = await saveGuideRecipeDraft(userId, draftToRow(draft, bookId ? [bookId] : []), draft.savedId);
      onSaved(recipe);
      const book = books.find((b) => b.id === bookId);
      patch({ saving: false, savedId: recipe.id, savedLabel: savedNutrition ? `Saved${book ? ` to “${book.title}”` : ''}.` : 'Saved. Servings, timings, nutrition and book link need the recipe nutrition migration on this environment.' });
    } catch (error: any) { patch({ saving: false, savedLabel: error?.message || 'Could not save.' }); }
  }
  const unsaved = drafts.filter((d) => !d.savedId);
  return <section style={{ border: `1px solid ${line}`, padding: 24, marginTop: 28, background: 'linear-gradient(180deg,#14160F,#0D0E0B)' }}>
    <div style={{ ...label, color: acid }}>AI recipe builder</div>
    <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 32, margin: '4px 0 6px' }}>Describe the recipes. AI drafts them, the database does the maths.</h2>
    <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 16px', maxWidth: 680 }}>Add photos of dishes or handwritten recipes and links to recipes you like. Every ingredient is matched to the ROUTINE³ ingredient database, and nutrition is calculated from those values.</p>
    <textarea style={{ ...input, height: 96, paddingTop: 12 }} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. High-protein breakfasts for women in perimenopause, under 15 minutes, no dairy" />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 10 }}>
      <div><label style={label}>How many recipes</label><select style={input} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
      <div><label style={label}>Meal</label><select style={input} value={mealSlot} onChange={(e) => setMealSlot(e.target.value)}><option value="">Mixed</option>{['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'dessert'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
      <div><label style={label}>Recipe book</label><select style={input} value={bookId} onChange={(e) => setBookId(e.target.value)}><option value="">Not in a book yet</option>{books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>{bookId && (() => { const inBook = recipes.filter((r) => r.offer_ids?.includes(bookId)); return <button type="button" disabled={!inBook.length} onClick={() => downloadRecipePdf(inBook.map(recipeToDraft), { bookTitle: books.find((b) => b.id === bookId)?.title, author })} style={{ border: 0, background: 'transparent', color: inBook.length ? acid : muted, fontSize: 10, padding: '6px 0 0', cursor: inBook.length ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileText size={11} /> {inBook.length ? `Download book PDF · ${inBook.length} recipe${inBook.length === 1 ? '' : 's'}` : 'No recipes in this book yet'}</button>; })()}</div>
    </div>
    <label style={{ ...label, marginTop: 12 }}>Source links · optional</label>
    <input style={input} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://… (space-separated, up to 3)" />
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      {photos.map((url) => <span key={url} style={{ position: 'relative', width: 56, height: 56, border: `1px solid ${line}` }}><img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((p) => p !== url))} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: 10, border: 0, background: ink, color: black, cursor: 'pointer', fontSize: 11 }}>×</button></span>)}
      {photos.length < 4 && <label style={{ ...btn, background: 'transparent', color: ink }}>{uploading ? 'Uploading…' : '+ Photos'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} /></label>}
      <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ ...btn, background: 'transparent', color: activeFilters ? acid : ink }}>Filters{activeFilters ? ` · ${activeFilters}` : ''}</button>
      <button type="button" onClick={build} disabled={building || uploading || (!brief.trim() && !activeFilters)} style={{ ...btn, marginLeft: 'auto' }}>{building ? 'Building recipes…' : `Build ${count} recipe${count === 1 ? '' : 's'}`}</button>
    </div>
    {showFilters && <RecipeFiltersPanel value={filters} onChange={setFilters} tier={tier} onTier={setTier} />}
    {message && <p style={{ color: muted, fontSize: 12, marginTop: 12 }}>{message}</p>}
    {drafts.length > 1 && (() => {
      // The set of drafted recipes together: one serving of each, so a Guardian sees which essentials the set still misses.
      const sums: Record<string, number> = {}; let protein = 0, fiber = 0;
      for (const d of drafts) { const n = computeNutrition(d.ingredients, d.servings).perServing; protein += n.protein_g || 0; fiber += n.fiber_g || 0; for (const [k, v] of Object.entries(n.micros || {})) sums[k] = (sums[k] || 0) + v; }
      return <div style={{ border: `1px solid ${line}`, padding: 14, marginTop: 12 }}><NutrientCoverage micros={sums} macros={{ protein_g: protein, fiber_g: fiber }} tier={tier} onTier={setTier} title={`These ${drafts.length} recipes together · one serving each · % daily value`} /></div>;
    })()}
    {unsaved.length > 1 && <button type="button" onClick={() => unsaved.forEach((d) => save(d.key))} style={{ ...btn, marginTop: 10 }}>Save all {unsaved.length}</button>}
    {drafts.map((draft) => <RecipeDraftEditor key={draft.key} draft={draft} saving={!!draft.saving} savedLabel={draft.savedLabel} onChange={(next) => setDrafts((current) => current.map((d) => d.key === draft.key ? { ...d, ...next } : d))} onRemove={() => setDrafts((current) => current.filter((d) => d.key !== draft.key))} onSave={() => save(draft.key)} avoid={filters.avoidIngredients} author={author} />)}
  </section>;
}

function RecipeBuilder({ recipe, userId, offers, onBack, onSaved }: { recipe: GuideRecipe; userId: string; offers: GuideOffer[]; onBack: () => void; onSaved: (recipe: GuideRecipe) => void }) {
  const books = offers.filter((offer) => offer.kind === 'recipe_book');
  const [draft, setDraft] = useState<RecipeDraft>(() => recipeToDraft(recipe));
  const [bookIds, setBookIds] = useState<string[]>(recipe.offer_ids || []);
  const [status, setStatus] = useState<GuideRecipe['status']>(recipe.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setSaving(true); setMessage('');
    try {
      const { recipe: saved } = await saveGuideRecipeDraft(userId, { ...draftToRow(draft, bookIds), status }, recipe.id);
      onSaved(saved); setMessage('Recipe saved.');
    } catch (error: any) { setMessage(error.message || 'Could not save this recipe.'); }
    finally { setSaving(false); }
  }
  return <div>
    <button type="button" onClick={onBack} style={{ ...btn, marginBottom: 22, background: 'transparent', color: ink }}>← Recipes</button>
    <div style={{ ...label, color: acid }}>Recipe builder</div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 10 }}>
      <div style={{ minWidth: 180 }}><label style={label}>Status</label><select style={input} value={status} onChange={(event) => setStatus(event.target.value as GuideRecipe['status'])}><option value="draft">Draft</option><option value="submitted">Ready for review</option><option value="published">Published</option></select></div>
      {books.length > 0 && <div><label style={label}>In recipe books</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{books.map((book) => { const on = bookIds.includes(book.id); return <button key={book.id} type="button" aria-pressed={on} onClick={() => setBookIds(on ? bookIds.filter((id) => id !== book.id) : [...bookIds, book.id])} style={{ ...btn, minHeight: 36, background: on ? acid : 'transparent', color: on ? black : ink }}>{book.title}</button>; })}</div></div>}
      {message && <span style={{ color: /saved/i.test(message) ? acid : '#E8B86A', fontSize: 11 }}>{message}</span>}
    </div>
    <RecipeDraftEditor draft={draft} onChange={setDraft} onRemove={onBack} onSave={save} saving={saving} savedLabel={message && /saved/i.test(message) ? message : undefined} />
  </div>;
}

function GuardianProtocolAI({ accessToken, protocol, ownerId, initialRequest, initialSourceUrls = '', initialSourcePath = null, audienceProfile, progressive = false, onBuilt, onRevealEditor }: {
  accessToken: string;
  protocol: AdminProtocol;
  ownerId?: string;
  initialRequest?: string;
  initialSourceUrls?: string;
  initialSourcePath?: string | null;
  audienceProfile?: { audience: string; population: string; age: string; stage: string; problem: string };
  progressive?: boolean;
  onBuilt: () => void;
  onRevealEditor?: () => void;
}) {
  const [request, setRequest] = useState(initialRequest || 'Build a practical Protocol for this selected profile. Include safe daily actions, useful adaptations, and when to seek clinical advice.');
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState('');
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [sourceUrls, setSourceUrls] = useState(initialSourceUrls);
  const [sourcePath, setSourcePath] = useState<string | null>(initialSourcePath);
  const [sourceFileName, setSourceFileName] = useState(initialSourcePath?.split('/').pop() || '');
  const [uploadingSource, setUploadingSource] = useState(false);

  async function attachSource(file?: File) {
    if (!file || !ownerId) return;
    setUploadingSource(true);
    setMessage('');
    try {
      const path = await uploadGuideFile(ownerId, file);
      setSourcePath(path);
      setSourceFileName(file.name);
    } catch (error: any) {
      setMessage(error?.message || 'The source file could not be uploaded.');
    } finally {
      setUploadingSource(false);
    }
  }

  async function buildDraft() {
    if (!request.trim()) return;
    setBuilding(true);
    setMessage('');
    try {
      const sources = [sourceUrls.trim() && `Reference websites: ${sourceUrls.trim().replace(/\n+/g, ', ')}`, sourcePath && `Uploaded reference document: ${sourcePath}`].filter(Boolean).join('\n');
      const draft = await buildProtocolWithAI(accessToken, protocol.id, `${request.trim()}${sources ? `\n\n${sources}` : ''}`);
      const steps = foldSleepSteps(draft.steps);
      // Shared saver: actions with their rule_do / rule_dont children, or top-level rules (protocolRules.ts).
      for (const [index, step] of steps.entries()) await saveDraftStep(accessToken, protocol.id, step, index + 1);
      setMessage(`${draft.summary} Added ${steps.length} editable draft steps. Review them before publishing.`);
      setStage(2);
      onBuilt();
    } catch (error: any) {
      setMessage(error?.message || 'The AI draft could not be created.');
    } finally {
      setBuilding(false);
    }
  }

  if (progressive) return <section style={{ border: '1px solid #C9C6BC', background: '#FFF', maxWidth: 1120, margin: '0 auto 18px' }}>
    <div style={{ padding: '14px 18px', borderBottom: '1px solid #D7D4CB', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {['01 Profile & sources', '02 AI brief', '03 Review'].map((title, index) => <div key={title} style={{ color: stage === index ? '#151515' : '#8A8881', fontSize: 9, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}><span style={{ display: 'inline-block', width: 8, height: 8, marginRight: 7, borderRadius: '50%', background: stage >= index ? '#6E7C4B' : '#D7D4CB' }} />{title}</div>)}
    </div>
    {stage === 0 && <div style={{ padding: 'clamp(20px,4vw,46px)' }}>
      <div style={{ color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase' }}>Known audience</div>
      <h1 style={{ fontFamily: serif, fontSize: 'clamp(34px,5vw,58px)', fontWeight: 300, margin: '8px 0 10px' }}>Start with the selected profile.</h1>
      <p style={{ color: '#686762', fontSize: 12, lineHeight: 1.6, maxWidth: 680, margin: '0 0 24px' }}>Confirm the audience already defined in your offers, then add trusted source material for this Protocol.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', border: '1px solid #D7D4CB', marginBottom: 26 }}>
        {Object.entries(audienceProfile || { audience: 'Everyone', population: protocol.target_gender || 'Everyone', age: 'Not specified', stage: 'Not specified', problem: protocol.name }).map(([key, value]) => <div key={key} style={{ minHeight: 84, padding: 14, borderRight: '1px solid #D7D4CB' }}><span style={{ display: 'block', color: '#77756F', fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 9 }}>{key}</span><strong style={{ fontSize: 13 }}>{value}</strong></div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div><label style={{ ...label, color: '#5F5D57' }}>Website addresses</label><textarea value={sourceUrls} onChange={(event) => setSourceUrls(event.target.value)} placeholder={'https://example.com/research\nhttps://example.com/guidance'} style={{ width: '100%', minHeight: 118, boxSizing: 'border-box', resize: 'vertical', border: '1px solid #C9C6BC', background: '#F5F4EF', color: '#151515', padding: 12, fontFamily: sans, fontSize: 12, lineHeight: 1.55 }} /><span style={{ display: 'block', color: '#77756F', fontSize: 9, marginTop: 6 }}>Add one trusted page per line.</span></div>
        <div><label style={{ ...label, color: '#5F5D57' }}>Reference PDF</label><label style={{ minHeight: 116, border: '1px dashed #A9A69D', background: '#F5F4EF', display: 'grid', placeItems: 'center', padding: 12, cursor: uploadingSource ? 'wait' : 'pointer', textAlign: 'center' }}><input type="file" accept="application/pdf,.pdf" disabled={uploadingSource || !ownerId} onChange={(event) => { void attachSource(event.target.files?.[0]); event.currentTarget.value = ''; }} style={{ display: 'none' }} /><span><Upload size={20} style={{ margin: '0 auto 8px' }} /><strong style={{ display: 'block', fontSize: 12 }}>{uploadingSource ? 'Uploading PDF…' : sourceFileName || 'Upload a PDF'}</strong><span style={{ display: 'block', color: '#77756F', fontSize: 9, marginTop: 5 }}>{sourcePath ? 'Attached to this Protocol' : 'PDF up to 50 MB'}</span></span></label></div>
      </div>
      {message && <p role="alert" style={{ color: '#9A3C3C', fontSize: 10, margin: '12px 0 0' }}>{message}</p>}
      <button type="button" onClick={() => { setMessage(''); setStage(1); }} style={{ ...btn, marginTop: 24, background: '#151515', color: '#FFF', borderColor: '#151515' }}>Continue to AI brief <ArrowRight size={14} /></button>
    </div>}
    {stage === 1 && <div style={{ padding: 'clamp(20px,4vw,46px)' }}>
      <div style={{ color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase' }}>Build instructions</div>
      <h1 style={{ fontFamily: serif, fontSize: 'clamp(34px,5vw,58px)', fontWeight: 300, margin: '8px 0 10px' }}>Review the AI brief.</h1>
      <p style={{ color: '#686762', fontSize: 11, margin: '0 0 18px' }}>{sourcePath || sourceUrls.trim() ? 'The selected profile and attached sources will be included.' : 'The selected profile will be used. No external sources are attached.'}</p>
      <textarea aria-label="Tell AI what to build" value={request} onChange={(event) => setRequest(event.target.value)} style={{ width: '100%', minHeight: 150, boxSizing: 'border-box', resize: 'vertical', border: '1px solid #C9C6BC', background: '#F5F4EF', color: '#151515', padding: 14, fontFamily: sans, fontSize: 12, lineHeight: 1.6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 16 }}><button type="button" onClick={() => { setMessage(''); setStage(0); }} disabled={building} style={{ ...btn, width: '100%', justifyContent: 'center', background: '#FFF', color: '#151515', borderColor: '#AAA79E' }}>← Back</button><button type="button" onClick={buildDraft} disabled={building || !request.trim()} style={{ ...btn, width: '100%', justifyContent: 'center', background: '#151515', color: '#FFF', borderColor: '#151515' }}>{building ? <><Loader2 size={13} className="animate-spin" /> Building draft</> : <><Sparkles size={13} /> Build Protocol</>}</button></div>
      {message && <p role="alert" style={{ color: message.includes('could not') || message.includes('failed') ? '#9A3C3C' : '#5D6545', fontSize: 10, margin: '12px 0 0' }}>{message}</p>}
    </div>}
    {stage === 2 && <div style={{ padding: 'clamp(28px,5vw,58px)', textAlign: 'center' }}><span style={{ width: 50, height: 50, margin: '0 auto 18px', borderRadius: '50%', background: '#6E7C4B', color: '#FFF', display: 'grid', placeItems: 'center' }}><Check size={24} /></span><div style={{ color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase' }}>Draft created</div><h1 style={{ fontFamily: serif, fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, margin: '8px 0 10px' }}>Your Protocol is ready to review.</h1><p style={{ color: '#686762', fontSize: 11, lineHeight: 1.6, maxWidth: 650, margin: '0 auto 22px' }}>{message}</p><button type="button" onClick={onRevealEditor} style={{ ...btn, background: '#151515', color: '#FFF', borderColor: '#151515' }}>Review and edit Protocol <ArrowRight size={14} /></button></div>}
  </section>;

  return <section style={{ border: '1px solid #C9C6BC', background: '#FFF', padding: 18, marginBottom: 18 }}>
    <div style={{ color: '#6E7C4B', fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase' }}>AI Protocol Builder</div>
    <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 300, margin: '8px 0 6px' }}>Build for the selected profile.</h2>
    <p style={{ color: '#686762', fontSize: 11, lineHeight: 1.55, margin: '0 0 12px' }}>{protocol.description || `Profile: ${protocol.target_gender || 'Everyone'}.`}</p>
    <textarea aria-label="Tell AI what to build" value={request} onChange={(event) => setRequest(event.target.value)} style={{ width: '100%', minHeight: 92, boxSizing: 'border-box', resize: 'vertical', border: '1px solid #C9C6BC', background: '#F5F4EF', color: '#151515', padding: 12, fontFamily: sans, fontSize: 12, lineHeight: 1.5 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
      <button type="button" onClick={buildDraft} disabled={building || !request.trim()} style={{ ...btn, height: 38, background: '#151515', color: '#FFF', borderColor: '#151515' }}>{building ? <><Loader2 size={13} className="animate-spin" /> Building draft</> : <><Sparkles size={13} /> Build with AI</>}</button>
      <span style={{ color: message.includes('could not') || message.includes('failed') ? '#9A3C3C' : '#5D6545', fontSize: 10, lineHeight: 1.4, flex: '1 1 280px' }}>{message || 'AI uses the audience, life stage, goal and Protocol description saved with this offer.'}</span>
    </div>
  </section>;
}

const offerBuilderTypes = [
  { kind: 'routine', title: 'R3 Protocol', eyebrow: 'Routine database', copy: 'Build a printable PDF and interactive app twin from linked meals, activities, supplements and smart lists.', Icon: HeartPulse },
  { kind: 'ebook', title: 'PDF guide', eyebrow: 'Profile + sources', copy: 'Turn your profile links and uploaded documents into a focused downloadable guide.', Icon: FileText },
  { kind: 'recipe_book', title: 'Recipe collection', eyebrow: 'Meals', copy: 'Build recipes grouped as breakfast, lunch, dinner, snack or drink.', Icon: Salad },
  { kind: 'one_to_one_call', title: '1:1 booking', eyebrow: 'Private live', copy: 'Send a client to your saved booking page for individual support.', Icon: CalendarDays },
  { kind: 'group_call', title: 'Group call', eyebrow: 'Live group', copy: 'Create a shared session using your saved booking link.', Icon: Users },
  { kind: 'in_person', title: 'In-person offer', eyebrow: 'Physical', copy: 'Package an appointment, workshop or local experience.', Icon: Globe2 },
] as const;

function OfferBuilder({ profile, protocols, offers, recipes = [], librarySources = [], onOpenProtocols, onCreated }: { profile: GuideProfile; protocols: AdminProtocol[]; offers: GuideOffer[]; recipes?: GuideRecipe[]; librarySources?: GuideLibraryItem[]; onOpenProtocols: () => void; onCreated: (offer: GuideOffer) => void }) {
  const { user } = useAuth();
  // Which routine each offer delivers (owner-only table). Quiet when the database update is not applied yet.
  const [offerRoutines, setOfferRoutines] = useState<Record<string, string>>({});
  useEffect(() => { listOfferRoutines(profile.user_id).then(setOfferRoutines).catch(() => setOfferRoutines({})); }, [profile.user_id, offers.length]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function build(kind: typeof offerBuilderTypes[number]['kind'], title: string) {
    if (kind === 'routine') { onOpenProtocols(); return; }
    if (!user) return;
    setBusy(kind); setMessage('');
    try {
      const booking = kind === 'one_to_one_call' || kind === 'group_call' ? profile.social_links?.booking_url || null : null;
      const sourceNote = librarySources.length ? ` Sources: ${librarySources.map((source) => source.title).join(', ')}.` : '';
      const created = await createGuideOffer(user.id, { kind, title, description: `${offerBuilderTypes.find((item) => item.kind === kind)?.copy || ''}${sourceNote}`.trim() || null, price_cents: 0, affiliate_url: null, access_model: kind === 'ebook' || kind === 'recipe_book' ? 'free' : 'paid', file_path: librarySources.find((source) => source.kind === 'pdf')?.file_path || null, booking_url: booking });
      onCreated(created); setMessage(`${title} created. Open Offers to place it in a customer journey.`);
    } catch (error: any) { setMessage(error?.message || 'Could not create this offer.'); }
    finally { setBusy(''); }
  }
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><img src={guidePlates.offer_builder} alt="" style={{ width: 74, height: 74, objectFit: 'contain', filter: 'grayscale(1) contrast(.9) brightness(.74)' }} /><div><div style={{ ...label, color: acid }}>Reusable building blocks</div><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, margin: '8px 0 0' }}>Offer builder</h1></div></div>
    <p style={{ color: muted, maxWidth: 720, lineHeight: 1.6 }}>Create the things people receive. Reuse any offer across more than one offer path.</p>
    {librarySources.length > 0 && <div style={{ border: `1px solid ${acid}`, background: '#1B2017', color: acid, padding: 13, marginTop: 18, fontSize: 11 }}><strong>{librarySources.length} Library source{librarySources.length === 1 ? '' : 's'} attached:</strong> {librarySources.map((source) => source.title).join(', ')}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 28 }}>{offerBuilderTypes.map(({ kind, title, eyebrow, copy, Icon }) => <button key={kind} type="button" onClick={() => build(kind, title)} disabled={busy === kind} style={{ minHeight: 220, border: `1px solid ${line}`, background: panel, color: ink, padding: 22, textAlign: 'left', cursor: 'pointer', fontFamily: sans, display: 'flex', flexDirection: 'column' }}><span style={{ width: 48, height: 48, border: `1px solid ${line}`, display: 'grid', placeItems: 'center', color: acid }}><Icon size={22} /></span><span style={{ ...label, color: acid, margin: '24px 0 7px' }}>{eyebrow}</span><strong style={{ fontSize: 22 }}>{title}</strong><span style={{ color: muted, fontSize: 12, lineHeight: 1.55, marginTop: 8 }}>{copy}</span><span style={{ marginTop: 'auto', paddingTop: 18, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{busy === kind ? 'Creating...' : kind === 'routine' ? 'Open R3 builder →' : 'Create offer →'}</span></button>)}</div>
    {message && <p style={{ color: acid, fontSize: 11, marginTop: 16 }}>{message}</p>}
    <section style={{ borderTop: `1px solid ${line}`, marginTop: 38, paddingTop: 24 }}><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 32, margin: 0 }}>R3 outputs</h2><p style={{ color: muted, fontSize: 12 }}>Every R3 Protocol can be edited against the full Routine database, exported as a PDF and delivered through web or iOS.</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a href={APP_STORE_URL} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Open iOS app <ArrowRight size={13} /></a><button type="button" onClick={onOpenProtocols} style={{ ...btn, background: 'transparent', color: ink }}>Manage {protocols.length} Protocols</button><span style={{ ...btn, background: 'transparent', color: muted, cursor: 'default' }}><Download size={13} /> PDF export inside builder</span></div></section>
    {offers.length > 0 && <section style={{ marginTop: 34 }}><div style={label}>Created offers · {offers.length}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18, marginTop: 12 }}>{offers.map((offer) => { const free = offer.access_model === 'free'; return <div key={offer.id}><ProductCard kind={offer.kind} imageUrl={offer.cover_url || (offer.kind === 'recipe_book' ? recipes.find((r) => r.image_url && r.offer_ids?.includes(offer.id))?.image_url : null)} eyebrow={[audienceLabel(profile.social_links?.audience_details) || 'Everyone', offer.status === 'published' ? 'Published' : 'Draft'].join(' · ')} title={customerFacingOfferTitle(offer.title)} copy={(offer.description || '').split(' Delivery:')[0].slice(0, 120) || undefined} price={free ? 'Free' : offer.price_cents ? formatMoney(offer.price_cents / 100, offer.currency || 'GBP') : 'Paid'} name={profile.display_name} avatarUrl={profile.avatar_url} accent={acid} cta={profile.slug ? 'View on your site' : 'View offer'} href={profile.slug ? `/guardians/${encodeURIComponent(profile.slug)}#offers` : undefined} /><OfferRoutineLink offer={offer} protocols={protocols} guideId={profile.user_id} guardianSlug={profile.slug} linkedProtocolId={offerRoutines[offer.id]} onChange={(offerId, protocolId) => setOfferRoutines((current) => { const next = { ...current }; if (protocolId) next[offerId] = protocolId; else delete next[offerId]; return next; })} /></div>; })}</div></section>}
  </>;
}

const LIBRARY_KIND_ICONS: Record<GuideLibraryKind, typeof FileText> = { pdf: Upload, url: Link2, transcript: FileText, book: BookOpen, podcast: Podcast, paper: GraduationCap, audio: AudioLines };

export function GuideLibrary({ guideId, selectedIds, onSelectedIds, onUse }: { guideId: string; selectedIds: string[]; onSelectedIds: (ids: string[]) => void; onUse: (destination: 'protocol' | 'pdf', sources: GuideLibraryItem[]) => void }) {
  const [folders, setFolders] = useState<GuideLibraryFolder[]>([]);
  const [items, setItems] = useState<GuideLibraryItem[]>([]);
  const [folder, setFolder] = useState('all');
  const [kindFilter, setKindFilter] = useState<GuideLibraryKind | 'all'>('all');
  const [mode, setMode] = useState<GuideLibraryKind | null>(null);
  const [folderName, setFolderName] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fields, setFields] = useState<LibraryDraftInput['fields']>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedFolder = folder === 'all' || folder === 'unfiled' ? null : folder;
  const visibleItems = filterLibraryItems(items, folder, kindFilter);
  const kindDefinition = mode ? libraryKindDefinition(mode) : null;
  const richMode = mode === 'book' || mode === 'podcast' || mode === 'paper' || mode === 'audio' ? mode : null;

  useEffect(() => {
    Promise.all([listGuideLibraryFolders(guideId), listGuideLibraryItems(guideId)])
      .then(([nextFolders, nextItems]) => { setFolders(nextFolders); setItems(nextItems); })
      .catch((error) => setMessage(error?.message || 'Could not open the library. Apply the latest database migration and try again.'));
  }, [guideId]);

  function resetForm() { setMode(null); setTitle(''); setUrl(''); setTranscript(''); setFields({}); setPendingFile(null); }

  async function addFolder() {
    if (!folderName.trim()) return;
    setBusy(true); setMessage('');
    try { const created = await createGuideLibraryFolder(guideId, folderName.trim()); setFolders((current) => [...current, created]); setFolder(created.id); setFolderName(''); }
    catch (error: any) { setMessage(error?.message || 'Could not create that folder.'); }
    finally { setBusy(false); }
  }

  async function addItem(file?: File) {
    if (!mode) return;
    setBusy(true); setMessage('');
    try {
      let created: GuideLibraryItem;
      if (richMode) {
        // Validate the form before uploading anything, then attach the stored file.
        buildLibraryDraft(richMode, { title, fields, notes: transcript, file: pendingFile ? { path: 'pending', name: pendingFile.name } : null });
        const path = pendingFile ? await (richMode === 'audio' ? uploadGuideLibraryAudio(guideId, pendingFile) : uploadGuideFile(guideId, pendingFile)) : null;
        const draft = buildLibraryDraft(richMode, { title, fields, notes: transcript, file: path && pendingFile ? { path, name: pendingFile.name } : null });
        created = await createGuideLibraryItem(guideId, { folder_id: selectedFolder, kind: richMode, ...draft });
      } else {
        let filePath: string | null = null;
        const body = transcript.trim() || null;
        let itemTitle = title.trim();
        if (mode === 'pdf') {
          if (!file) throw new Error('Choose a PDF first.');
          filePath = await uploadGuideFile(guideId, file);
          itemTitle ||= file.name.replace(/\.pdf$/i, '');
        }
        if (mode === 'url') {
          if (!url.trim()) throw new Error('Add a website address first.');
          new URL(url.trim());
          itemTitle ||= new URL(url.trim()).hostname.replace(/^www\./, '');
        }
        if (mode === 'transcript' && !body) throw new Error('Paste or import a transcript first.');
        itemTitle ||= 'Untitled transcript';
        created = await createGuideLibraryItem(guideId, { folder_id: selectedFolder, kind: mode, title: itemTitle, source_url: mode === 'url' ? url.trim() : null, file_path: filePath, transcript: body, metadata: null });
      }
      setItems((current) => [created, ...current]); resetForm(); setMessage(`${created.title} saved to the library.`);
    } catch (error: any) { setMessage(error?.message === 'Invalid URL' ? 'Enter a complete URL, including https://.' : libraryErrorMessage(error, mode)); }
    finally { setBusy(false); }
  }

  function importTranscript(file?: File) {
    if (!file) return;
    file.text().then((text) => { setTranscript(text); setTitle((current) => current || file.name.replace(/\.(txt|md)$/i, '')); });
  }

  async function openItem(item: GuideLibraryItem) {
    if (item.kind === 'transcript' && item.transcript) {
      const href = URL.createObjectURL(new Blob([item.transcript], { type: 'text/plain' }));
      const anchor = document.createElement('a'); anchor.href = href; anchor.download = `${item.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'transcript'}.txt`; anchor.click(); URL.revokeObjectURL(href);
      return;
    }
    // Private uploads (PDFs, audio, attached paper PDFs) open through a short-lived signed URL.
    if (item.file_path && (item.kind === 'pdf' || item.kind === 'audio' || (item.kind === 'paper' && !item.source_url))) { window.open(await getGuideFileDownloadUrl(item.file_path), '_blank', 'noopener,noreferrer'); return; }
    if (item.source_url) window.open(item.source_url, '_blank', 'noopener,noreferrer');
  }

  const filterButton = (active: boolean) => ({ width: '100%', border: 0, background: active ? '#25291F' : 'transparent', color: active ? acid : muted, padding: '11px 10px', textAlign: 'left' as const, fontFamily: sans, cursor: 'pointer' });

  return <section>
    <div style={{ minHeight: 230, border: `1px solid ${line}`, padding: 'clamp(24px,4vw,46px)', background: panel, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 180px', alignItems: 'center', gap: 24 }}><div><div style={{ ...label, color: acid }}>Source library</div><h1 style={{ fontFamily: serif, fontSize: 'clamp(42px,6vw,72px)', lineHeight: .95, fontWeight: 300, margin: '12px 0 16px' }}>Build from what you trust.</h1><p style={{ color: muted, lineHeight: 1.6, maxWidth: 650, margin: 0 }}>Keep PDFs, webpages, transcripts, books, podcasts, research papers and audio organised, then select the sources that should inform your next Protocol or PDF guide.</p></div><FolderOpen size={128} strokeWidth={.7} color={acid} style={{ opacity: .7 }} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', border: `1px solid ${line}`, borderTop: 0 }}>
      <aside style={{ padding: 18, borderRight: `1px solid ${line}` }}><div style={{ ...label, color: ink }}>Folders</div>{[['all','All sources'],['unfiled','Unfiled']].map(([id, name]) => <button key={id} onClick={() => setFolder(id)} style={filterButton(folder === id)}>{name}</button>)}{folders.map((entry) => <button key={entry.id} onClick={() => setFolder(entry.id)} style={filterButton(folder === entry.id)}>{entry.name}</button>)}<div style={{ display: 'flex', gap: 6, marginTop: 16 }}><input aria-label="New folder name" style={{ ...input, height: 38, minWidth: 0 }} value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="New folder" /><button type="button" onClick={addFolder} disabled={busy || !folderName.trim()} style={{ ...btn, width: 40, minHeight: 38, padding: 0 }}><Plus size={14} /></button></div>
        <div style={{ ...label, color: ink, marginTop: 26 }}>Types</div>
        <button type="button" onClick={() => setKindFilter('all')} style={filterButton(kindFilter === 'all')}>All types</button>
        {LIBRARY_KINDS.map(({ kind, plural }) => { const Icon = LIBRARY_KIND_ICONS[kind]; const count = items.filter((item) => item.kind === kind).length; return <button key={kind} type="button" aria-pressed={kindFilter === kind} onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)} style={{ ...filterButton(kindFilter === kind), display: 'flex', alignItems: 'center', gap: 9 }}><Icon size={14} strokeWidth={1.6} /><span style={{ flex: 1 }}>{plural}</span><span style={{ fontSize: 10, opacity: count ? 1 : .45 }}>{count}</span></button>; })}
      </aside>
      <div style={{ padding: 'clamp(18px,3vw,32px)' }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{LIBRARY_KINDS.map(({ kind, addLabel }) => { const Icon = LIBRARY_KIND_ICONS[kind]; return <button key={kind} type="button" onClick={() => { if (mode === kind) resetForm(); else { resetForm(); setMode(kind); } setMessage(''); }} style={{ ...btn, background: mode === kind ? acid : 'transparent', color: mode === kind ? black : ink }}><Icon size={14} />{addLabel}</button>; })}</div>
        {mode && kindDefinition && <div style={{ border: `1px solid ${line}`, background: '#0D0E0C', padding: 18, marginTop: 14 }}><label style={label}>{kindDefinition.titleLabel}</label><input style={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kindDefinition.titlePlaceholder} />
          {mode === 'pdf' && <label style={{ ...btn, width: '100%', boxSizing: 'border-box', marginTop: 10, background: acid }}><input type="file" accept="application/pdf,.pdf" hidden disabled={busy} onChange={(event) => { void addItem(event.target.files?.[0]); event.currentTarget.value = ''; }} />{busy ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} Choose PDF and save</label>}
          {mode === 'url' && <><label style={{ ...label, marginTop: 12 }}>Website address</label><input type="url" style={input} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/research" /><button type="button" onClick={() => void addItem()} disabled={busy || !url.trim()} style={{ ...btn, marginTop: 10, background: acid }}>Save webpage</button></>}
          {mode === 'transcript' && <><label style={{ ...label, marginTop: 12 }}>Transcript</label><textarea style={{ ...input, height: 150, paddingTop: 12, resize: 'vertical' }} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste transcript text here" /><div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><label style={{ ...btn, background: 'transparent', color: ink }}><input type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(event) => { importTranscript(event.target.files?.[0]); event.currentTarget.value = ''; }} />Import .txt or .md</label><button type="button" onClick={() => void addItem()} disabled={busy || !transcript.trim()} style={{ ...btn, background: acid }}>Save transcript</button></div></>}
          {richMode && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0 12px' }}>{kindDefinition.fields.map((field) => <div key={field.key}><label style={{ ...label, marginTop: 12 }}>{field.label}</label><input style={input} type={field.inputMode === 'url' ? 'url' : 'text'} inputMode={field.inputMode} value={fields[field.key] || ''} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /></div>)}</div>
            {kindDefinition.file && <label style={{ ...btn, width: '100%', boxSizing: 'border-box', marginTop: 12, background: 'transparent', color: pendingFile ? acid : ink }}><input type="file" accept={kindDefinition.file.accept} hidden disabled={busy} onChange={(event) => { setPendingFile(event.target.files?.[0] || null); event.currentTarget.value = ''; }} />{mode === 'audio' ? <AudioLines size={14} /> : <Upload size={14} />}{pendingFile ? pendingFile.name : kindDefinition.file.label}</label>}
            {kindDefinition.notes && <><label style={{ ...label, marginTop: 12 }}>{kindDefinition.notes} <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional, used by the AI)</span></label><textarea style={{ ...input, height: 110, paddingTop: 12, resize: 'vertical' }} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={`Paste ${kindDefinition.notes.toLowerCase()} here`} /></>}
            <button type="button" onClick={() => void addItem()} disabled={busy} style={{ ...btn, marginTop: 12, background: acid }}>{busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Save {kindDefinition.label.toLowerCase()}</button>
          </>}
        </div>}
        {message && <p role="status" style={{ color: message.includes('saved') ? acid : '#F0A7A7', fontSize: 11 }}>{message}</p>}
        {selectedIds.length > 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, marginTop: 18, border: `1px solid ${acid}`, background: '#1B2017', flexWrap: 'wrap' }}><strong style={{ fontSize: 12, color: acid }}>{selectedIds.length} source{selectedIds.length === 1 ? '' : 's'} selected</strong><span style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => onUse('protocol', items.filter((item) => selectedIds.includes(item.id)))} style={{ ...btn, background: acid }}>Use in Protocol</button><button type="button" onClick={() => onUse('pdf', items.filter((item) => selectedIds.includes(item.id)))} style={{ ...btn }}>Use in PDF</button></span></div>}
        <div style={{ marginTop: 20 }}>{visibleItems.length ? visibleItems.map((item) => { const active = selectedIds.includes(item.id); const KindIcon = LIBRARY_KIND_ICONS[item.kind] || FileText; const canOpen = item.kind === 'transcript' ? !!item.transcript : !!(item.source_url || item.file_path); return <article key={item.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 13, alignItems: 'center', borderTop: `1px solid ${line}`, padding: '16px 2px' }}><input aria-label={`Select ${item.title}`} type="checkbox" checked={active} onChange={() => onSelectedIds(active ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id])} style={{ width: 18, height: 18, accentColor: acid }} /><div style={{ minWidth: 0 }}><span style={{ color: acid, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><KindIcon size={11} strokeWidth={2} />{libraryKindDefinition(item.kind).label} · {folders.find((entry) => entry.id === item.folder_id)?.name || 'Unfiled'}</span><h3 style={{ fontFamily: serif, fontSize: 23, fontWeight: 300, margin: '5px 0 3px' }}>{item.title}</h3><span style={{ color: muted, fontSize: 10, overflowWrap: 'anywhere' }}>{librarySourceSubtitle(item)}</span></div><div style={{ display: 'flex', gap: 6 }}><button type="button" title={item.kind === 'transcript' ? 'Download transcript' : 'Open source'} disabled={!canOpen} onClick={() => void openItem(item)} style={{ ...btn, width: 38, minHeight: 38, padding: 0, background: 'transparent', color: ink, opacity: canOpen ? 1 : .35 }}>{item.kind === 'transcript' ? <Download size={14} /> : <ExternalLink size={14} />}</button><button type="button" title="Delete source" onClick={async () => { await deleteGuideLibraryItem(item.id); setItems((current) => current.filter((entry) => entry.id !== item.id)); onSelectedIds(selectedIds.filter((id) => id !== item.id)); }} style={{ ...btn, width: 38, minHeight: 38, padding: 0, background: 'transparent', color: muted }}><Trash2 size={14} /></button></div></article>; }) : <Empty title={kindFilter === 'all' ? 'This folder is empty' : `No ${libraryKindDefinition(kindFilter).plural.toLowerCase()} here yet`} copy="Upload a PDF, save a webpage, or add a transcript, book, podcast, paper or audio." />}</div>
      </div>
    </div>
  </section>;
}

/** Fixed bottom bar: plain-language AI updates to the open Protocol, with a Library folder as reference. */
function ProtocolAIBar({ accessToken, protocolId, guideId, onUpdated }: { accessToken: string; protocolId: string; guideId: string; onUpdated: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [folders, setFolders] = useState<GuideLibraryFolder[]>([]);
  const [libraryItems, setLibraryItems] = useState<GuideLibraryItem[]>([]);
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  // Long pasted text (an email, a leaflet) opens the dated-Protocol builder instead of a one-line edit.
  const [pasted, setPasted] = useState('');
  const isLongText = (text: string) => text.length > 240 || /\n.*\n/.test(text);
  useEffect(() => {
    Promise.all([listGuideLibraryFolders(guideId), listGuideLibraryItems(guideId)]).then(([f, i]) => { setFolders(f); setLibraryItems(i); }).catch(() => {});
  }, [guideId]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!instruction.trim() || busy) return;
    setBusy(true); setResult('');
    try {
      const refs = libraryItems.filter((item) => folderId && item.folder_id === folderId).map((item) => librarySourcePrompt(item)).join('\n');
      const items = await listProtocolItems(accessToken, protocolId);
      const r = await updateProtocolWithAI(accessToken, protocolId, instruction, items, refs);
      setResult(`${r.updated} updated · ${r.added} added · ${r.hidden} hidden${r.summary ? ` — ${r.summary}` : ''}`);
      setInstruction('');
      onUpdated();
    } catch (e: any) {
      setResult(`Could not update: ${e?.message || e}`);
    } finally { setBusy(false); }
  }
  const field: React.CSSProperties = { height: 42, boxSizing: 'border-box', border: `1px solid ${line}`, background: black, color: ink, fontFamily: sans, fontSize: 13, padding: '0 12px', outline: 'none', borderRadius: 2 };
  return <form onSubmit={send} data-protocol-id={protocolId} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, background: 'rgba(9,10,8,.96)', borderTop: `1px solid ${line}`, padding: '10px clamp(16px,4vw,48px)', backdropFilter: 'blur(10px)' }}>
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Sparkles size={16} color={acid} />
      <select aria-label="Reference folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ ...field, width: 200 }}>
        <option value="">No reference folder</option>
        {folders.map((folder) => <option key={folder.id} value={folder.id}>📁 {folder.name} ({libraryItems.filter((item) => item.folder_id === folder.id).length})</option>)}
      </select>
      <a href="/guardians/workspace?tab=library" style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap' }}>Open library ↗</a>
      <input value={instruction} onChange={(e) => setInstruction(e.target.value)} onPaste={(e) => { const text = e.clipboardData.getData('text'); if (isLongText(text)) { e.preventDefault(); setPasted(text); } }} placeholder="Ask AI to change this Protocol, or paste any text (an email, a prep sheet) to build a dated Protocol" aria-label="AI instruction" style={{ ...field, flex: '1 1 320px', minWidth: 0 }} />
      {isLongText(instruction) && <button type="button" onClick={() => setPasted(instruction)} style={{ ...btn, height: 42, minHeight: 42, borderRadius: 2, background: 'transparent', color: acid, border: `1px solid ${acid}` }}>Build dated Protocol</button>}
      <button type="submit" disabled={busy || !instruction.trim()} style={{ ...btn, height: 42, minHeight: 42, borderRadius: 2, opacity: busy || !instruction.trim() ? .5 : 1 }}>{busy ? <><Loader2 size={13} className="animate-spin" /> Updating</> : <>Update with AI <ArrowRight size={13} /></>}</button>
    </div>
    {result && <div style={{ maxWidth: 1180, margin: '6px auto 0', color: result.startsWith('Could not') ? '#F0A7A7' : acid, fontSize: 11 }}>{result}</div>}
    {pasted && <EventProtocolBuilder accessToken={accessToken} protocolId={protocolId} initialText={pasted} onClose={() => setPasted('')} onApplied={(message) => { setPasted(''); setInstruction(''); setResult(message); onUpdated(); }} />}
  </form>;
}

// Admin: review Guardian sites (publish / unpublish, with an email to the Guardian) and triage suggestions.
function GuardianAdminPanel() {
  const [profiles, setProfiles] = useState<AdminGuideProfile[]>([]);
  const [suggestions, setSuggestions] = useState<GuardianSuggestionRow[]>([]);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = () => { listAllGuideProfiles().then(setProfiles).catch((e) => setError(e.message)); listGuardianSuggestions().then(setSuggestions).catch((e) => setError(e.message)); };
  useEffect(load, []);
  async function decide(profile: AdminGuideProfile, status: 'approved' | 'paused') {
    const note = status === 'paused' ? window.prompt(`Optional note to ${profile.display_name} (sent by email):`) || '' : '';
    setBusyId(profile.user_id); setNotice(''); setError('');
    try {
      const result = await decideGuardianSite(profile.user_id, status, note);
      setNotice(`${profile.display_name} ${status === 'approved' ? 'published' : 'unpublished'}${result.email.sent ? ' · email sent' : ` · email not sent (${result.email.reason || 'unknown'})`}.`);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setBusyId(''); }
  }
  const chip = (status: string) => <span style={{ padding: '3px 8px', border: `1px solid ${status === 'approved' ? acid : status === 'submitted' ? '#C88A66' : line}`, color: status === 'approved' ? acid : status === 'submitted' ? '#C88A66' : muted, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{status === 'approved' ? 'Live' : status === 'submitted' ? 'Waiting for review' : status === 'paused' ? 'Unpublished' : 'Draft'}</span>;
  const ordered = [...profiles].sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'));
  const date = (v?: string | null) => v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  const small: React.CSSProperties = { ...btn, minHeight: 34, height: 34, fontSize: 9, padding: '0 12px' };
  return <>
    <div style={{ ...label, color: acid }}>Guardian admin</div>
    <h1 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(40px,5vw,64px)', lineHeight: .95, margin: '15px 0 18px' }}>Review Guardian sites.</h1>
    {notice && <p style={{ color: acid, fontSize: 12 }}>{notice}</p>}
    {error && <p role="alert" style={{ color: '#F0A7A7', fontSize: 12 }}>{error}</p>}
    <section style={{ border: `1px solid ${line}`, marginBottom: 26 }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${line}`, ...label, marginBottom: 0 }}>Sites · {profiles.filter((p) => p.status === 'submitted').length} waiting</div>
      {ordered.map((p) => <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderBottom: `1px solid ${line}` }}>
        <span style={{ flex: '1 1 220px', minWidth: 0 }}><strong style={{ display: 'block', color: ink, fontSize: 13 }}>{p.display_name}</strong><span style={{ color: muted, fontSize: 10 }}>{p.contact_email || 'no email'}{p.review_requested_at ? ` · asked ${date(p.review_requested_at)}` : ''}{p.reviewed_at ? ` · reviewed ${date(p.reviewed_at)}` : ''}</span></span>
        {chip(p.status)}
        <a href={`/guardians/${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener noreferrer" style={{ ...small, background: 'transparent', color: ink, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View site</a>
        {p.status !== 'approved' && <button type="button" disabled={busyId === p.user_id} onClick={() => decide(p, 'approved')} style={small}>Publish</button>}
        {p.status === 'approved' && <button type="button" disabled={busyId === p.user_id} onClick={() => decide(p, 'paused')} style={{ ...small, background: 'transparent', color: ink }}>Unpublish</button>}
      </div>)}
      {!profiles.length && <p style={{ color: muted, fontSize: 11, padding: 14, margin: 0 }}>No Guardian sites yet.</p>}
    </section>
    <section style={{ border: `1px solid ${line}` }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${line}`, ...label, marginBottom: 0 }}>Suggested Guardians · {suggestions.filter((x) => x.status === 'new').length} new</div>
      {suggestions.map((x) => <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderBottom: `1px solid ${line}` }}>
        <span style={{ flex: '1 1 260px', minWidth: 0 }}><strong style={{ display: 'block', color: ink, fontSize: 13 }}>{x.name} <span style={{ color: muted, fontWeight: 500 }}>· {x.guardian_type}</span></strong><span style={{ color: muted, fontSize: 10 }}>{[x.instagram, x.tiktok, x.youtube, x.website].filter(Boolean).join(' · ')}{x.suggester_email ? ` · from ${x.suggester_email}` : ''} · {date(x.created_at)}</span>{x.note && <span style={{ display: 'block', color: ink, fontSize: 11, marginTop: 4 }}>{x.note}</span>}</span>
        <select aria-label={`Status for ${x.name}`} value={x.status} onChange={async (e) => { const status = e.target.value as GuardianSuggestionRow['status']; await setGuardianSuggestionStatus(x.id, status).catch((err) => setError(err.message)); setSuggestions((cur) => cur.map((row) => row.id === x.id ? { ...row, status } : row)); }} style={{ ...input, width: 140, height: 34, minHeight: 34, fontSize: 11 }}>{['new', 'contacted', 'invited', 'dismissed'].map((v) => <option key={v} value={v}>{v}</option>)}</select>
      </div>)}
      {!suggestions.length && <p style={{ color: muted, fontSize: 11, padding: 14, margin: 0 }}>No suggestions yet.</p>}
    </section>
  </>;
}

export function Workspace({ profile, onProfile }: { profile: GuideProfile; onProfile: (p: GuideProfile) => void }) {
  const { user, accessToken, signOut } = useAuth();
  // Deep links from the public Guardians nav, e.g. /guardians/workspace?tab=protocols
  const [tab, setTab] = useGuardianPage<Tab>('tab', WORKSPACE_TABS, 'home');
  const isAdminUser = ['true', '1', 'yes', true].includes((user?.app_metadata as any)?.is_admin) || (user?.app_metadata as any)?.role === 'admin';
  const navItems = isAdminUser ? [...nav, { id: 'admin' as Tab, label: 'Admin', Icon: ShieldCheck as typeof Users }] : nav;
  // Sidebar sections the Guardian opened with their chevron; the current page's own branch is always open.
  const [navOpen, setNavOpen] = useState<string[]>([]);
  // Sections folded by hand while on their branch; cleared on navigation so the new page's branch opens.
  const [navClosed, setNavClosed] = useState<string[]>([]);
  useEffect(() => { setNavClosed([]); }, [tab]);
  const [leads, setLeads] = useState<GuideLead[]>([]);
  const [offers, setOffers] = useState<GuideOffer[]>([]);
  const [recipes, setRecipes] = useState<GuideRecipe[]>([]);
  const [protocols, setProtocols] = useState<AdminProtocol[]>([]);
  const [combining, setCombining] = useState(false);
  const [valueRamps, setValueRamps] = useState<GuideValueRamp[]>([]);
  const [routineOwners, setRoutineOwners] = useState<Map<string, { name: string; avatarUrl: string | null; relation: string | null }>>(new Map());
  const [editorProtocolId, setEditorProtocolId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [parentContext, setParentContext] = useState<string | null>(null);
  const [childPlanId, setChildPlanId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const refreshProtocols = () => { if (accessToken && user) return listProtocols(accessToken, user.id).then(setProtocols).catch((e) => setCopyError(e.message)); return Promise.resolve(); };
  const returnToParent = () => { setTab('protocols'); setProtocolId(parentContext); setEditorProtocolId(null); setRecipeId(null); setChildPlanId(null); setParentContext(null); setProtocolRevision((v) => v + 1); refreshProtocols(); };
  const customizeRecipe = async (id: string, itemId: string) => {
    if (!accessToken) return;
    setCopyError('');
    try {
      const recipe = await customizeProtocolRecipe(accessToken, id, itemId);
      setRecipes((rows) => [recipe, ...rows.filter((r) => r.id !== recipe.id)]);
      setParentContext(recipe.parent_protocol_id || id); setRecipeId(recipe.id); setTab('recipes'); setProtocolId(null);
    } catch (e) { setCopyError((e as Error).message); }
  };
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGoal, setNewGoal] = useState('');
  useEffect(() => { setAdding(false); setNewTitle(''); setNewEmail(''); setNewGoal(''); setCreateError(''); }, [tab]);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [protocolView, setProtocolView] = useState<'cards' | 'list'>('cards');
  const [recipeView, setRecipeView] = useState<'cards' | 'list'>('cards');
  useEffect(() => {
    const closeEditors = () => { setProtocolId(null); setEditorProtocolId(null); setRecipeId(null); setChildPlanId(null); setParentContext(null); setCombining(false); };
    window.addEventListener('popstate', closeEditors);
    return () => window.removeEventListener('popstate', closeEditors);
  }, []);
  const [personalPeople, setPersonalPeople] = useState<Map<string, { name: string; imageUrl: string | null }>>(new Map());
  useEffect(() => { if (user) listPersonalProtocolPeople(user.id).then(setPersonalPeople).catch(() => {}); }, [user?.id, protocols.length]);
  useEffect(() => { setEditorProtocolId(null); }, [protocolId]);
  const [protocolRevision, setProtocolRevision] = useState(0);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [builderLibrarySources, setBuilderLibrarySources] = useState<GuideLibraryItem[]>([]);
  useEffect(() => { if (!user) return; Promise.all([listGuideLeads(user.id), listGuideOffers(user.id), listGuideRecipes(user.id), accessToken ? listProtocols(accessToken, user.id) : Promise.resolve([])]).then(([l,o,r,p]) => { setLeads(l); setOffers(o); setRecipes(r); setProtocols(p); }).catch(() => {}); listGuideValueRamps(user.id).then(setValueRamps).catch(() => setValueRamps([])); listRoutineOwners(user.id, profile.display_name, profile.avatar_url).then(setRoutineOwners).catch(() => {}); }, [user?.id, accessToken]);
  const metric = useMemo(() => [{ n: leads.length, l: 'Leads' }, { n: valueRamps.length, l: 'Offers' }, { n: offers.length + recipes.length + protocols.length, l: 'Items' }, { n: protocols.length, l: 'R3 Protocols' }], [leads.length, offers.length, recipes.length, protocols.length, valueRamps.length]);
  async function quickAdd() {
    if (!user || !newTitle.trim() || creating) return;
    setCreating(true); setCreateError('');
    try {
      if (tab === 'leads') { const x = await createGuideLead(user.id, { name: newTitle, email: newEmail, goal: newGoal || null }); setLeads([x, ...leads]); }
      if (tab === 'value_ramps') { const base = newTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'value-ramp'; const x = await createGuideValueRamp(user.id, { name: newTitle.trim(), slug: `${base}-${Date.now().toString().slice(-5)}`, audience: 'Everyone', problem: newGoal.trim() || profile.specialties[0] || 'Wellbeing' }); setValueRamps([x, ...valueRamps]); }
      if (tab === 'recipes') { const x = await createGuideRecipe(user.id, { title: newTitle, description: newGoal || null, meal_slot: 'breakfast' }); setRecipes([x, ...recipes]); }
      if (tab === 'protocols' && accessToken) { const x = await createProtocol(accessToken, { user_id: user.id, name: newTitle }); setProtocols([x, ...protocols]); setProtocolId(x.id); }
      setNewTitle(''); setNewEmail(''); setNewGoal('');
      setAdding(false);
    } catch (error) { setCreateError((error as Error).message || 'Could not create this item. Please try again.'); }
    finally { setCreating(false); }
  }
  return <div style={{ minHeight: '100vh', background: black, color: ink, fontFamily: sans }}>
    <GuardianHeader isSignedIn activeTab={tab} displayName={profile.display_name} onNavigate={(next) => { setTab(next); setProtocolId(null); setRecipeId(null); setChildPlanId(null); setParentContext(null); }} onSignOut={signOut} />
    {/* Profile → Site setup steps, kept as workspace context under the shared header. */}
    <div aria-label="Guardian setup steps" style={{ padding: '0 clamp(20px,6vw,90px)', borderBottom: `1px solid ${line}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${GUARDIAN_STEP_LABELS.length},1fr)` }}>
        {GUARDIAN_STEP_LABELS.map((stepLabel, index) => <a key={stepLabel} href={guardianStepHref(stepLabel, index)} style={{ height: 50, display: 'grid', placeItems: 'center', borderRight: index < GUARDIAN_STEP_LABELS.length - 1 ? `1px solid ${line}` : 0, color: muted, textDecoration: 'none', fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{String(index + 1).padStart(2, '0')} · {stepLabel}</a>)}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', minHeight: 'calc(100vh - 63px)' }}>
      <div className="g-railwrap">
        <aside className="g-rail" aria-label="Guardian sections"><a href="/guardians/workspace" title="Dashboard" style={{ display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 20px', marginBottom: 10, borderBottom: `1px solid ${line}`, color: ink, textDecoration: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}><LayoutDashboard size={16} style={{ flex: '0 0 auto' }} /><span className="g-rlabel">Dashboard</span></a>{navItems.map(({ id, label: n, Icon }) => {
          // Sub-pages sit under their family (Diet: Recipes, Cooking techniques, Cooking equipment; Fitness: Activities) as
          // smaller child rows on a tree line; the parent stays lit while one of its children is open.
          // Tree: Protocols > Diet / Fitness / Hygiene / Beauty / Wellness / Longevity > their pages. Each level indents
          // 10px (the collapsed rail is 64px wide); ancestor lines run on through the rows below them.
          const chain = (x: string): string[] => { const p = NAV_PARENT[x]; return p ? [...chain(p), p] : []; };
          const ancestors = chain(id), depth = ancestors.length, parent = ancestors[depth - 1];
          // Children stay folded unless every ancestor is open (opened with its chevron, or on the current page's branch).
          const isOpen = (x: string) => !navClosed.includes(x) && (navOpen.includes(x) || x === tab || chain(tab).includes(x));
          if (!ancestors.every(isOpen)) return null;
          const hasChildren = Object.values(NAV_PARENT).includes(id as Tab);
          const on = tab === id || (id === 'offer_builder' && tab === 'value_ramps');
          const family = chain(tab).includes(id);
          const siblingsAfter = (x: string) => { const i = navItems.findIndex((y) => y.id === x); return navItems.slice(i + 1).some((y) => NAV_PARENT[y.id] === NAV_PARENT[x]); };
          const lineX = (level: number) => 31 + (level - 1) * 10;
          return <div key={id} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>

            {ancestors.slice(1).map((a, k) => siblingsAfter(a) && <span key={a} aria-hidden="true" style={{ position: 'absolute', left: lineX(k + 1), top: 0, bottom: 0, borderLeft: `1px solid ${line}` }} />)}
            {parent && <span aria-hidden="true" style={{ position: 'absolute', left: lineX(depth), top: 0, bottom: siblingsAfter(id) ? 0 : '50%', borderLeft: `1px solid ${line}` }} />}
            {parent && <span aria-hidden="true" style={{ position: 'absolute', left: lineX(depth), top: '50%', width: 6, borderTop: `1px solid ${line}` }} />}
            <button onClick={() => { setTab(id); setProtocolId(null); setRecipeId(null); setChildPlanId(null); setParentContext(null); }} title={n} aria-current={on ? 'page' : undefined} style={{ flex: 1, minWidth: 0, height: depth ? 34 : 42, border: 0, background: on ? '#1C1E19' : 'transparent', color: on || family ? ink : muted, display: 'flex', alignItems: 'center', gap: depth ? 10 : 12, padding: depth ? '0 20px 0 22px' : '0 20px', cursor: 'pointer', fontFamily: sans, fontSize: depth ? 10 : 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>            <Icon size={depth ? 13 : 16} style={{ flex: '0 0 auto', marginLeft: depth ? 6 + depth * 10 : 0, color: on ? acid : undefined }} /><span className="g-rlabel" style={{ flex: 1, textAlign: 'left' }}>{n}</span></button>
            {hasChildren && <button type="button" aria-label={`${isOpen(id) ? 'Fold' : 'Unfold'} ${n}`} aria-expanded={isOpen(id)} className="g-rlabel" onClick={() => { if (isOpen(id)) { setNavOpen((o) => o.filter((x) => x !== id)); setNavClosed((c) => [...c, id]); } else { setNavClosed((c) => c.filter((x) => x !== id)); setNavOpen((o) => [...o, id]); } }} style={{ border: 0, background: 'transparent', color: muted, cursor: 'pointer', padding: '0 14px 0 4px', display: 'inline-flex', alignItems: 'center' }}><ChevronRight size={12} style={{ transform: isOpen(id) ? 'rotate(90deg)' : undefined, transition: 'transform .15s ease' }} /></button>}
          </div>; })}</aside>
      </div>
      {/* overflow-x clip, not hidden: hidden makes main a scroll container and breaks sticky columns inside (Diet planner). */}
      <main style={{ padding: 'clamp(26px,5vw,68px)', overflowX: 'clip' }}>
        {createError && <p role="alert" style={{ color: '#E8B86A' }}>{createError}</p>}
        {tab === 'admin' && isAdminUser && <GuardianAdminPanel />}
        {tab === 'home' && <><div style={{ ...label, color: acid }}>Guardian workspace</div><h1 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(44px,6vw,76px)', lineHeight: .95, margin: '15px 0 18px' }}>Build what people follow.</h1><p style={{ color: muted, maxWidth: 650, lineHeight: 1.6 }}>Create reusable offers, then arrange them into as many audience-specific offer paths as you need.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', borderTop: `1px solid ${line}`, marginTop: 55 }}>{metric.map((m) => <div key={m.l} style={{ borderRight: `1px solid ${line}`, padding: '25px 18px 25px 0' }}><div style={{ fontFamily: serif, fontSize: 42 }}>{m.n}</div><div style={{ ...label, margin: '7px 0 0' }}>{m.l}</div></div>)}</div><div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>{nav.slice(1,5).map(({ id, label: title }) => <button key={id} onClick={() => setTab(id)} style={{ border: `1px solid ${line}`, background: panel, color: ink, minHeight: 210, padding: 22, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}><span><img src={guidePlates[id]} alt="" style={{ width: 86, height: 86, objectFit: 'contain', filter: 'grayscale(1) contrast(.9) brightness(.75)', opacity: .82 }} /><span style={{ display: 'block', fontFamily: serif, fontSize: 25, fontWeight: 300, marginTop: 12 }}>{title}</span></span><ChevronRight size={17} color={muted} /></button>)}</div></>}
        {/* Site builder: the same profile and brand fields as setup step 01. */}
        {tab === 'profile' && user && <><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 350 }}>Site builder</h1><SiteProfileForm userId={user.id} profile={profile} onProfile={onProfile} /></>}
        {tab === 'library' && user && <GuideLibrary guideId={user.id} selectedIds={selectedLibraryIds} onSelectedIds={setSelectedLibraryIds} onUse={(destination, sources) => { setBuilderLibrarySources(sources); setTab(destination === 'protocol' ? 'protocols' : 'offer_builder'); }} />}
        {(tab === 'offer_builder' || tab === 'value_ramps' || tab === 'products') && !protocolId && !recipeId && <div role="tablist" aria-label="Offers" style={{ display: 'inline-flex', border: `1px solid ${line}`, marginBottom: 18 }}>{([['offer_builder', 'Offer builder'], ['value_ramps', 'Offer paths'], ['products', 'My products']] as const).map(([id, text], index) => <button type="button" role="tab" key={id} aria-selected={tab === id} onClick={() => setTab(id)} style={{ height: 36, padding: '0 16px', border: 0, borderLeft: index ? `1px solid ${line}` : 0, background: tab === id ? ink : 'transparent', color: tab === id ? black : ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{text}</button>)}</div>}
        {tab === 'offer_builder' && <OfferBuilder profile={profile} protocols={protocols} offers={offers} recipes={recipes} librarySources={builderLibrarySources} onOpenProtocols={() => setTab('protocols')} onCreated={(offer) => setOffers((current) => [offer, ...current])} />}
        {tab === 'products' && user && <GuardianProducts guideId={user.id} guardianSlug={profile.slug} commissionPercent={profile.commission_percent} protocols={protocols} />}
        {tab === 'leads' && !protocolId && !recipeId && user && <ReviewsPanel userId={user.id} slug={profile.slug} />}
        {tab === 'protocols' && !protocolId && protocols.length > 1 && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button onClick={() => setCombining(!combining)} style={{ ...btn, background: 'transparent', color: ink }}><Combine size={14} /> Combine for a person</button></div>}
        {tab === 'protocols' && !protocolId && combining && accessToken && user && <CombineProtocols accessToken={accessToken} ownerId={user.id} protocols={protocols} leads={leads} onClose={() => setCombining(false)} onSaved={(saved) => setProtocols((current) => [saved, ...current])} onOpen={(id) => { setCombining(false); setProtocolId(id); }} />}
        {(['leads','value_ramps','recipes','protocols'] as Tab[]).includes(tab) && !protocolId && !recipeId && <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 20 }}><div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><img src={guidePlates[tab]} alt="" style={{ width: 74, height: 74, objectFit: 'contain', filter: 'grayscale(1) contrast(.9) brightness(.74)', opacity: .86 }} /><div><div style={{ ...label, color: acid }}>{tab === 'value_ramps' ? 'Customer journeys' : 'Build'}</div><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, margin: '8px 0 0' }}>{tab === 'value_ramps' ? 'Offer paths' : tab === 'protocols' ? 'Protocol builder' : tab.charAt(0).toUpperCase() + tab.slice(1)}</h1></div></div><button onClick={() => setAdding(!adding)} style={btn}><Plus size={14} /> Add {tab === 'value_ramps' ? 'Offer path' : tab === 'protocols' ? 'Protocol' : tab.slice(0,-1)}</button></div>{adding && <div style={{ display: 'grid', gridTemplateColumns: tab === 'leads' ? '1fr 1fr 1.2fr auto' : '1fr 1.4fr auto', gap: 9, margin: '28px 0' }}><input style={input} placeholder={tab === 'leads' ? 'Name' : tab === 'value_ramps' ? 'Ramp name' : 'Title'} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />{tab === 'leads' && <input style={input} type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />}<input style={input} placeholder={tab === 'value_ramps' ? 'Audience problem or goal' : tab === 'leads' ? 'Goal' : 'Short description'} value={newGoal} onChange={(e) => setNewGoal(e.target.value)} /><button onClick={quickAdd} disabled={creating || !newTitle.trim()} style={btn}>{creating ? 'Creating…' : 'Create'}</button></div>}<div style={{ marginTop: 30 }}>{tab === 'leads' && (leads.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>{leads.map((x) => <ProductCard key={x.id} kind="lead" imageUrl="/images/guides/lead-plate.png" eyebrow={[x.stage.charAt(0).toUpperCase() + x.stage.slice(1), new Date(x.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].join(' · ')} title={x.name} copy={x.goal || 'No goal yet'} name={x.email} accent={acid} cta="Email" href={`mailto:${x.email}`} />)}</div> : <Empty image={guidePlates.leads} title="No leads yet" copy="Add a lead or share your public guide page." />)}{tab === 'value_ramps' && (valueRamps.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 12 }}>{valueRamps.map((ramp) => <article key={ramp.id} style={{ border: `1px solid ${line}`, background: panel, padding: 22, minHeight: 220, display: 'flex', flexDirection: 'column' }}><Route size={24} color={acid} /><div style={{ ...label, color: acid, marginTop: 24 }}>{ramp.audience} · {ramp.problem}</div><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 29, margin: '4px 0 8px' }}>{ramp.name}</h2><p style={{ color: muted, fontSize: 11, lineHeight: 1.5 }}>{ramp.offer_ids.length} reusable offers · {ramp.status}</p><a aria-label={`Open offer path ${ramp.name}`} href={`/guardians/${profile.slug}/value-ramp/${encodeURIComponent(ramp.slug)}`} style={{ marginTop: 'auto', color: ink, fontSize: 9, fontWeight: 800 }}>Open offer path →</a></article>)}</div> : <Empty image={guidePlates.value_ramps} title="Create your first offer path" copy="Choose one audience problem, then arrange reusable offers from a free first win to deeper support." action={<button type="button" onClick={() => setAdding(true)} style={btn}>Create offer path</button>} />)}{tab === 'recipes' && accessToken && <GuardianRecipeAI userId={user.id} accessToken={accessToken} offers={offers} recipes={recipes} author={profile.display_name} onSaved={(saved) => setRecipes((current) => [saved, ...current.filter((r) => r.id !== saved.id)])} />}{tab === 'recipes' && (recipes.length ? (() => {
          const kcal = (x: GuideRecipe) => { const v = Number((x.nutrition_per_serving as any)?.energy_kcal); return Number.isFinite(v) && v > 0 ? `${Math.round(v)} kcal` : ''; };
          const meta = (x: GuideRecipe) => [x.meal_slot && x.meal_slot !== 'any' ? x.meal_slot.charAt(0).toUpperCase() + x.meal_slot.slice(1) : 'Any meal', kcal(x), x.status === 'published' ? 'Published' : x.status === 'submitted' ? 'Ready for review' : 'Draft'].filter(Boolean).join(' · ');
          const short = (d?: string | null) => { const t = (d || '').replace(/\s+/g, ' ').trim(); return t.length > 110 ? `${t.slice(0, 110).replace(/\s+\S*$/, '')}…` : t || undefined; };
          return <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, margin: '34px 0 14px', flexWrap: 'wrap' }}><div><div style={{ ...label, color: acid, margin: 0 }}>Your recipes</div><p style={{ color: muted, fontSize: 12, margin: '6px 0 0' }}>{recipes.length} recipe{recipes.length === 1 ? '' : 's'} for your recipe books, Protocols and offers.</p></div><div role="group" aria-label="View" style={{ display: 'inline-flex', border: `1px solid ${line}`, borderRadius: 4, overflow: 'hidden' }}>{(['cards', 'list'] as const).map((v, i) => <button key={v} type="button" aria-pressed={recipeView === v} onClick={() => setRecipeView(v)} style={{ height: 32, padding: '0 14px', border: 0, borderLeft: i ? `1px solid ${line}` : 0, background: recipeView === v ? ink : 'transparent', color: recipeView === v ? black : ink, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{v}</button>)}</div></div>
            {recipeView === 'cards'
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>{recipes.map((x) => <ProductCard key={x.id} kind="recipe_book" imageUrl={x.image_url} eyebrow={meta(x)} title={x.title} copy={short(x.description)} name={profile.display_name} avatarUrl={profile.avatar_url} accent={acid} cta="Open builder" onClick={() => setRecipeId(x.id)} />)}</div>
              : recipes.map((x) => <Row key={x.id} image={x.image_url} title={x.title} meta={meta(x)} action="Open builder" onClick={() => setRecipeId(x.id)} />)}
          </>;
        })() : <Empty image={guidePlates.recipes} title="No recipes yet" copy="Create a meal, drink or snack and reuse it in Protocols and offers." />)}{tab === 'protocols' && (protocols.length ? (() => {
            // Family routines (partner, child…) nest under the Guardian's own routine.
            const isFamily = (x: AdminProtocol) => { const r = routineOwners.get(x.id)?.relation; return !!r && r !== 'self'; };
            const family = protocols.filter(isFamily);
            const ownRoutineId = protocols.find((x) => routineOwners.get(x.id)?.relation === 'self')?.id;
            const rows: { x: AdminProtocol; child: boolean }[] = [];
            for (const x of protocols) {
              if (isFamily(x) && ownRoutineId) continue;
              rows.push({ x, child: false });
              if (x.id === ownRoutineId) family.forEach((f) => rows.push({ x: f, child: true }));
            }
            // Split: the Guardian's own (and family) routines vs Protocols built for other people.
            const personal = rows.filter(({ x }) => routineOwners.has(x.id));
            const others = protocols.filter((x) => !routineOwners.has(x.id));
            // Personal Protocols are built for one named person; general ones are for an audience or offer.
            const forPeople = others.filter((x) => personalPeople.has(x.id));
            const forOthers = others.filter((x) => !personalPeople.has(x.id));
            const sectionHead = (title: string, copy: string, extra?: React.ReactNode) => <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, margin: '34px 0 14px', flexWrap: 'wrap' }}><div><div style={{ ...label, color: acid, margin: 0 }}>{title}</div><p style={{ color: muted, fontSize: 12, margin: '6px 0 0' }}>{copy}</p></div>{extra}</div>;
            const viewToggle = <div role="group" aria-label="View" style={{ display: 'inline-flex', border: `1px solid ${line}`, borderRadius: 4, overflow: 'hidden' }}>{(['cards', 'list'] as const).map((v, i) => <button key={v} type="button" aria-pressed={protocolView === v} onClick={() => setProtocolView(v)} style={{ height: 32, padding: '0 14px', border: 0, borderLeft: i ? `1px solid ${line}` : 0, background: protocolView === v ? ink : 'transparent', color: protocolView === v ? black : ink, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{v}</button>)}</div>;
            const meta = (x: AdminProtocol) => `${x.total_days || 1} days · ${x.is_public ? 'Published' : 'Draft'} · PDF + app twin`;
            const shortCopy = (d?: string | null) => { const t = (d || '').replace(/\s+/g, ' ').trim(); return t.length > 110 ? `${t.slice(0, 110).replace(/\s+\S*$/, '')}…` : t || undefined; };
            return <>
              {forPeople.length > 0 && <>{sectionHead('Personal Protocols', `${forPeople.length} Protocol${forPeople.length === 1 ? '' : 's'} built for one person.`, viewToggle)}
                {protocolView === 'cards'
                  ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>{forPeople.map((x) => { const person = personalPeople.get(x.id)!; return <ProductCard key={x.id} kind="routine" imageUrl={person.imageUrl || x.image_url} eyebrow={['Personal', `${x.total_days || 1} days`, x.is_public ? 'Published' : 'Draft'].join(' · ')} title={x.name.replace(/\s*·\s*Personal Protocol$/i, '') + '’s Protocol'} copy={shortCopy(x.description)} name={person.name} avatarUrl={person.imageUrl} accent={acid} cta="Open R3 builder" onClick={() => setProtocolId(x.id)} />; })}</div>
                  : forPeople.map((x) => { const person = personalPeople.get(x.id)!; return <Row key={x.id} image={person.imageUrl || x.image_url} title={x.name} meta={`${person.name} · ${meta(x)}`} action="Open R3 builder" onClick={() => setProtocolId(x.id)} />; })}</>}
              {forOthers.length > 0 && <>{sectionHead('General Protocols', `${forOthers.length} Protocol${forOthers.length === 1 ? '' : 's'} for an audience or offer, by theme.`, forPeople.length ? undefined : viewToggle)}
                {PROTOCOL_THEMES.map((theme) => { const list = forOthers.filter((x) => protocolTheme(x) === theme); if (!list.length) return null; return <div key={theme} style={{ marginBottom: 26 }}>
                  <h3 style={{ ...label, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px' }}>{theme}<span style={{ color: muted, fontWeight: 400 }}>· {list.length}</span></h3>
                  {protocolView === 'cards'
                    ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>{list.map((x) => <ProductCard key={x.id} kind="routine" eyebrow={[protocolAudience(x) || 'Everyone', `${x.total_days || 1} days`, x.is_public ? 'Published' : 'Draft'].join(' · ')} title={x.name.replace(/^R3 Protocol\s*>\s*/i, '')} imageUrl={x.image_url} copy={(() => { const d = (x.description || '').replace(/\s+/g, ' ').trim(); return d.length > 110 ? `${d.slice(0, 110).replace(/\s+\S*$/, '')}…` : d || undefined; })()} name={profile.display_name} avatarUrl={profile.avatar_url} accent={acid} cta="Open R3 builder" onClick={() => setProtocolId(x.id)} />)}</div>
                    : list.map((x) => <Row key={x.id} image={x.image_url} title={x.name} meta={meta(x)} action="Open R3 builder" onClick={() => setProtocolId(x.id)} />)}
                </div>; })}</>}
              {personal.length > 0 && sectionHead('Your routines', 'Your own routine and your family’s.')}
              {personal.map(({ x, child }) => { const owner = routineOwners.get(x.id); const row = <Row key={x.id} image={owner?.avatarUrl || x.image_url} title={owner && /^your routine$/i.test(x.name.trim()) ? `${owner.name}’s routine` : x.name} meta={`${owner ? `${child && owner.relation ? `${owner.relation.charAt(0).toUpperCase()}${owner.relation.slice(1)} · ` : ''}Personal routine · ` : ''}${x.total_days || 1} days · ${x.is_public ? 'Published' : 'Draft'} · PDF + app twin`} action="Open R3 builder" onClick={() => setProtocolId(x.id)} />;
              return child ? <div key={x.id} style={{ marginLeft: 40, paddingLeft: 16, borderLeft: `1px solid ${line}` }}>{row}</div> : row; })}
            </>;
          })() : <Empty image={guidePlates.protocols} title="No Protocol drafts yet" copy="Build against the full Routine database with timings, quantities, linked records and PDF export." />)}</div></>}
        {tab === 'content' && <ContentBuilder profile={profile} offers={offers} protocols={protocols} recipes={recipes} />}
        {parentContext && <button type="button" onClick={returnToParent} style={{ ...btn, marginBottom: 16 }}>← Back to parent Protocol</button>}
        {copyError && <p role="alert">{copyError}</p>}
        {tab === 'diet' && accessToken && user && <DietBuilder key={childPlanId || 'diet'} initialProtocolId={childPlanId} accessToken={accessToken} ownerId={user.id} protocols={protocols} recipes={recipes} onSaved={(saved) => setProtocols((current) => [saved, ...current.filter((p) => p.id !== saved.id)])} onOpen={(id) => { setTab('protocols'); setProtocolId(id); }} />}
        {tab === 'activities' && accessToken && <ActivitiesLibrary accessToken={accessToken} />}
        {tab === 'cooking' && accessToken && <CookingTechniques accessToken={accessToken} />}
        {tab === 'ingredients' && accessToken && <CatalogIngredients accessToken={accessToken} />}
        {tab === 'routines' && accessToken && <FitnessRoutines accessToken={accessToken} />}
        {tab === 'diet_protocols' && accessToken && <FitnessRoutines accessToken={accessToken} section="diet" Icon={Salad} />}
        {(['hygiene', 'beauty', 'wellness', 'detox', 'longevity'] as const).map((sec) => (tab === sec || tab === `${sec}_protocols`) && accessToken && <FitnessRoutines key={sec} accessToken={accessToken} section={sec} Icon={SECTION_ICON[sec]} />)}
        {tab === 'hygiene_activities' && accessToken && <ActivitiesLibrary key="hygiene" accessToken={accessToken} lockGroup="hygiene" />}
        {tab === 'beauty_activities' && accessToken && <ActivitiesLibrary key="beauty" accessToken={accessToken} lockGroup="beauty" />}
        {tab === 'wellness_activities' && accessToken && <ActivitiesLibrary key="wellness" accessToken={accessToken} lockGroup="wellness" />}
        {tab === 'recipes' && !recipeId && accessToken && <CatalogRecipes accessToken={accessToken} />}
        {tab === 'equipment' && accessToken && <CookingEquipment accessToken={accessToken} />}
        {tab === 'fitness' && accessToken && user && <FitnessBuilder key={childPlanId || 'fitness'} initialProtocolId={childPlanId} accessToken={accessToken} ownerId={user.id} protocols={protocols} onSaved={(saved) => setProtocols((current) => [saved, ...current.filter((p) => p.id !== saved.id)])} onOpen={(id) => { setTab('protocols'); setProtocolId(id); }} />}
        {tab === 'recipes' && recipeId && <RecipeBuilder key={recipeId} recipe={recipes.find((recipe) => recipe.id === recipeId)!} userId={user.id} offers={offers} onBack={() => setRecipeId(null)} onSaved={(saved) => setRecipes((current) => current.map((recipe) => recipe.id === saved.id ? saved : recipe))} />}
        {tab === 'protocols' && protocolId && accessToken && user && <div style={{ background: '#F5F4EF', color: '#151515', padding: 18, minHeight: 700 }}>
          <button onClick={() => setProtocolId(null)} style={{ ...btn, marginBottom: 14, background: '#151515', color: '#FFF' }}>← Protocols</button>
          <RoutineShareLink tone="light" guardianSlug={profile.slug} protocolId={editorProtocolId || protocolId} protocolName={protocols.find((protocol) => protocol.id === (editorProtocolId || protocolId))?.name} />
          <ProtocolChildrenPanel token={accessToken} ownerId={user.id} parentId={editorProtocolId || protocolId} protocols={protocols} onChanged={refreshProtocols} onEdit={(kind, id) => { setParentContext(editorProtocolId || protocolId); setChildPlanId(id); setTab(kind); setProtocolId(null); refreshProtocols(); }} />
          {protocols.find((protocol) => protocol.id === protocolId) && <GuardianProtocolAI accessToken={accessToken} protocol={protocols.find((protocol) => protocol.id === protocolId)!} ownerId={user.id} initialSourceUrls={librarySourceUrls(builderLibrarySources).join('\n')} initialSourcePath={librarySourceDocumentPath(builderLibrarySources)} initialRequest={builderLibrarySources.length ? `Build a practical Protocol using these Library sources:\n${builderLibrarySources.map((source) => librarySourcePrompt(source, 4000)).join('\n')}` : undefined} onBuilt={() => setProtocolRevision((value) => value + 1)} />}
          <ProtocolEditor key={`${protocolId}-${protocolRevision}`} accessToken={accessToken} initialProtocolId={editorProtocolId || protocolId} ownerId={user.id} onSelectedChange={setEditorProtocolId} onCustomizeRecipe={customizeRecipe} />
          <div style={{ height: 90 }} />
          <ProtocolAIBar key={editorProtocolId || protocolId} accessToken={accessToken} protocolId={editorProtocolId || protocolId} guideId={user.id} onUpdated={() => setProtocolRevision((value) => value + 1)} />
        </div>}
      </main>
    </div>
  </div>;
}

/**
 * Site builder profile: the same fields as setup step 01 (brand picker, name and image, language, pricing region,
 * contact, socials, brand kit, booking), plus headline, expertise tags and bio for the personal brand. The personal
 * brand edits the profile; a business brand edits its own guide_brands row. Save writes the profile and all brands.
 */
type SiteBrand = Omit<GuideBrand, 'id' | 'guide_id'> & { key: string };
function SiteProfileForm({ userId, profile, onProfile }: { userId: string; profile: GuideProfile; onProfile: (p: GuideProfile) => void }) {
  const { accessToken } = useAuth();
  const links = profile.social_links || {};
  const setLinks = (patch: Record<string, string>) => onProfile({ ...profile, social_links: { ...links, ...patch } });
  const [brands, setBrands] = useState<SiteBrand[]>([]);            // business brands
  const [personalKit, setPersonalKit] = useState<BrandKit>(defaultBrandKit());
  // The saved personal brand row. When a business brand is primary, the profile mirrors that business, so the
  // personal brand is kept from this row on save rather than rebuilt from the profile.
  const [personalRow, setPersonalRow] = useState<Omit<GuideBrand, 'id' | 'guide_id'> | null>(null);
  const [active, setActive] = useState('personal');
  const [busy, setBusy] = useState<'save' | 'upload' | null>(null);
  const [message, setMessage] = useState('');
  // Saving replaces every brand row, so it waits until the saved brands have loaded; a failed load blocks it.
  const [brandsLoaded, setBrandsLoaded] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    let live = true;
    setBrandsLoaded('loading');
    listGuideBrands(userId).then((saved) => {
      if (!live) return;
      const personal = saved.find((b) => b.kind === 'personal');
      if (personal) { const { id: _id, guide_id: _g, ...row } = personal; setPersonalRow(row); setPersonalKit(brandKitOf(personal.social_links)); }
      setBrands(saved.filter((b) => b.kind !== 'personal').map(({ id, guide_id, ...b }) => ({ ...b, key: `brand-${id}` })));
      setBrandsLoaded('ok');
    }).catch(() => { if (live) setBrandsLoaded('failed'); });
    return () => { live = false; };
  }, [userId]);
  const biz = brands.find((b) => b.key === active);
  const patchBiz = (patch: Partial<SiteBrand>) => setBrands((list) => list.map((b) => (b.key === active ? { ...b, ...patch } : b)));
  // One view of the fields for whichever brand is selected.
  const v = biz
    ? { name: biz.name, image: biz.logo_url, logo: biz.logo_url, email: biz.contact_email, whatsapp: biz.whatsapp_phone, language: biz.language || 'English', region: biz.pricing_region || 'United Kingdom', social: { ...biz.social_links, website: biz.website_url }, kit: brandKitOf(biz.social_links) }
    : { name: profile.display_name, image: profile.avatar_url, logo: links.logo_url || null, email: profile.contact_email || '', whatsapp: profile.whatsapp_phone || '', language: links.language || 'English', region: links.pricing_region || 'United Kingdom', social: links, kit: personalKit };
  const set = {
    name: (x: string) => (biz ? patchBiz({ name: x }) : onProfile({ ...profile, display_name: x })),
    image: (x: string | null) => (biz ? patchBiz({ logo_url: x }) : onProfile({ ...profile, avatar_url: x })),
    logo: (x: string | null) => (biz ? patchBiz({ logo_url: x }) : setLinks({ logo_url: x || '' })),
    email: (x: string) => (biz ? patchBiz({ contact_email: x }) : onProfile({ ...profile, contact_email: x })),
    whatsapp: (x: string) => (biz ? patchBiz({ whatsapp_phone: x }) : onProfile({ ...profile, whatsapp_phone: x })),
    language: (x: string) => (biz ? patchBiz({ language: x }) : setLinks({ language: x })),
    region: (x: string) => { const o = pricingRegions.find((r) => r.region === x); if (!o) return; biz ? patchBiz({ pricing_region: x, currency: o.currency }) : setLinks({ pricing_region: x, currency: o.currency }); },
    social: (key: string, x: string) => (biz ? (key === 'website' ? patchBiz({ website_url: x }) : patchBiz({ social_links: { ...biz.social_links, [key]: x } })) : setLinks({ [key]: x })),
    kit: (kit: BrandKit) => (biz ? patchBiz({ social_links: { ...biz.social_links, ...brandKitLinks(kit) } }) : setPersonalKit(kit)),
  };
  const addBrand = () => {
    const key = `brand-new-${Date.now()}`;
    setBrands((list) => [...list, { key, name: 'New brand', kind: 'business', logo_url: null, contact_email: profile.contact_email || '', whatsapp_phone: '', website_url: '', social_links: {}, language: v.language, pricing_region: v.region, currency: pricingRegions.find((r) => r.region === v.region)?.currency || 'GBP', is_primary: false }]);
    setActive(key);
  };
  const removeBrand = () => { setBrands((list) => list.filter((b) => b.key !== active)); setActive('personal'); };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    setBusy('upload'); setMessage('');
    try { set.image(await uploadGuideImage(userId, file)); } catch (e) { setMessage((e as Error).message || 'Upload failed.'); } finally { setBusy(null); }
  };
  const save = async () => {
    if (brandsLoaded !== 'ok') return; // never overwrite brands that were not loaded
    setBusy('save'); setMessage('');
    try {
      const saved = await saveGuideProfile(profile);
      onProfile(saved);
      const l = saved.social_links || {};
      const personal = personalRow && brands.some((b) => b.is_primary)
        ? { ...personalRow, social_links: { ...(personalRow.social_links || {}), ...brandKitLinks(personalKit) }, is_primary: false }
        : { name: saved.display_name, kind: 'personal' as const, logo_url: l.logo_url || saved.avatar_url || null, contact_email: saved.contact_email || '', whatsapp_phone: saved.whatsapp_phone || '', website_url: l.website || '',
          social_links: { instagram: l.instagram || '', tiktok: l.tiktok || '', youtube: l.youtube || '', linktree: l.linktree || '', ...brandKitLinks(personalKit) },
          language: l.language || 'English', pricing_region: l.pricing_region || 'United Kingdom', currency: l.currency || 'GBP', is_primary: !brands.some((b) => b.is_primary) };
      await replaceGuideBrands(userId, [personal, ...brands.map(({ key, ...b }) => b)]);
      setMessage('Saved.');
    } catch (e) { setMessage(`Could not save: ${(e as Error).message || 'try again'}`); }
    finally { setBusy(null); }
  };
  const isPersonal = !biz;
  return <div style={{ maxWidth: 820 }}>
    <div aria-label="Publishing brand" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 0 16px', marginBottom: 20, borderBottom: `1px solid ${line}` }}>
      <span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 4 }}>Publishing as</span>
      {[{ key: 'personal', name: profile.display_name || 'Personal brand', img: profile.avatar_url }, ...brands.map((b) => ({ key: b.key, name: b.name || 'Untitled brand', img: b.logo_url }))].map((b) => <button key={b.key} type="button" aria-pressed={active === b.key} onClick={() => setActive(b.key)} style={{ border: `1px solid ${active === b.key ? ink : line}`, background: 'transparent', color: active === b.key ? ink : muted, padding: '5px 9px', fontFamily: sans, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <span style={{ width: 18, height: 18, border: `1px solid ${line}`, overflow: 'hidden', display: 'grid', placeItems: 'center', fontFamily: serif, fontSize: 10 }}>{b.img ? <img src={b.img} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b.name.trim().charAt(0)}</span>{b.name}</button>)}
      <button type="button" onClick={addBrand} style={{ border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Plus size={12} />Add brand</button>
      {!isPersonal && <button type="button" onClick={removeBrand} style={{ border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Remove brand</button>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      <div><label style={label}>{isPersonal ? 'Your public name' : 'Brand name'}</label><input style={input} value={v.name} onChange={(e) => set.name(e.target.value)} /></div>
      <div><label style={label}>Main language</label><div style={{ position: 'relative' }}><span aria-hidden="true" style={{ position: 'absolute', zIndex: 1, left: 11, top: 11, fontSize: 16 }}>{languageOptions.find((l) => l.name === v.language)?.flag || '🌐'}</span><select aria-label="Main language" style={{ ...input, paddingLeft: 42 }} value={v.language} onChange={(e) => set.language(e.target.value)}>{languageOptions.map((l) => <option key={l.code} value={l.name}>{l.name}</option>)}</select></div></div>
      <div><label style={label}>Pricing region</label><select aria-label="Pricing region" style={input} value={v.region} onChange={(e) => set.region(e.target.value)}>{pricingRegions.map((r) => <option key={r.region} value={r.region}>{r.label}</option>)}</select></div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
      {v.image ? <img src={v.image} alt="Profile" referrerPolicy="no-referrer" style={{ width: 36, height: 36, objectFit: 'cover', border: `1px solid ${line}` }} /> : <span aria-hidden="true" style={{ width: 36, height: 36, border: `1px solid ${line}` }} />}
      <span style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{isPersonal ? 'Profile image' : 'Brand image'} · optional</span>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {busy === 'upload' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{busy === 'upload' ? 'Uploading' : v.image ? 'Replace' : 'Upload'}
        <input type="file" aria-label={isPersonal ? 'Upload profile image' : 'Upload brand image'} accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(e.target.files?.[0])} style={{ display: 'none' }} />
      </label>
    </div>
    <p style={{ color: muted, fontSize: 10, lineHeight: 1.5, margin: '9px 0 0' }}>Language applies to your page and content. Pricing region sets the currency for every paid stage.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 18 }}>
      <div><label style={label}>Contact email</label><input type="email" style={input} value={v.email} onChange={(e) => set.email(e.target.value)} /></div>
      <div><label style={label}>WhatsApp number <span style={{ color: muted }}>· optional</span></label><input type="tel" inputMode="tel" style={input} value={v.whatsapp} onChange={(e) => set.whatsapp(e.target.value)} placeholder="+44 7700 900000" /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 22 }}>
      <SocialUrlField label="Instagram" Icon={Instagram} value={v.social.instagram || ''} onChange={(x) => set.social('instagram', x)} placeholder="https://instagram.com/yourname" />
      <SocialUrlField label="TikTok" Icon={AtSign} value={v.social.tiktok || ''} onChange={(x) => set.social('tiktok', x)} placeholder="https://tiktok.com/@yourname" />
      <SocialUrlField label="YouTube" Icon={Youtube} value={v.social.youtube || ''} onChange={(x) => set.social('youtube', x)} placeholder="https://youtube.com/@yourname" />
      <SocialUrlField label="Linktree" Icon={Link2} value={v.social.linktree || ''} onChange={(x) => set.social('linktree', x)} placeholder="https://linktr.ee/yourname" />
      <SocialUrlField label={isPersonal ? 'Personal website' : 'Website'} Icon={Globe2} value={v.social.website || ''} onChange={(x) => set.social('website', x)} placeholder="https://yourwebsite.com" />
    </div>
    <BrandKitFields userId={userId} brandName={v.name} kit={v.kit} onChange={set.kit} logoUrl={v.logo} onLogo={set.logo} accessToken={accessToken} facts={{ about: isPersonal ? profile.bio || profile.headline : '', tags: isPersonal ? parseExpertiseTags(links.expertise_tags) : [] }} />
    {isPersonal && <>
      <div style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 24 }}>
        <label style={{ ...label, color: ink }}>How should clients book with you? <span style={{ color: muted }}>· optional</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 7, marginBottom: 10 }}>
          {bookingProviders.map((p) => { const on = (links.booking_provider || 'ROUTINE³ Booking') === p.value; return <button type="button" key={p.value} onClick={() => setLinks({ booking_provider: p.value })} style={{ ...btn, height: 38, padding: '0 9px', background: on ? acid : 'transparent', color: on ? black : ink, borderColor: on ? acid : line, fontSize: 8, whiteSpace: 'nowrap', minWidth: 0 }}>{p.label}</button>; })}
        </div>
        <label style={label}>Booking page URL</label>
        <input type="url" style={input} value={links.booking_url || ''} onChange={(e) => setLinks({ booking_url: e.target.value })} placeholder={bookingProviders.find((p) => p.value === (links.booking_provider || 'ROUTINE³ Booking'))?.placeholder} />
      </div>
      <label style={{ ...label, marginTop: 18 }}>Headline</label><input style={input} value={profile.headline} onChange={(e) => onProfile({ ...profile, headline: e.target.value })} />
      <label style={{ ...label, marginTop: 18 }}>Expertise tags <span style={{ color: muted }}>· separate with commas</span></label><input style={input} value={links.expertise_tags || ''} onChange={(e) => setLinks({ expertise_tags: e.target.value })} placeholder="Hypnosis, compassionate care, equity" />
      <div style={{ marginTop: 8 }}><ExpertiseTags tags={parseExpertiseTags(links.expertise_tags)} color={acid} compact /></div>
      <label style={{ ...label, marginTop: 18 }}>Bio</label><textarea style={{ ...input, height: 150, paddingTop: 12 }} value={profile.bio} onChange={(e) => onProfile({ ...profile, bio: e.target.value })} />
    </>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
      <button type="button" onClick={save} disabled={busy === 'save' || brandsLoaded !== 'ok'} style={{ ...btn, opacity: brandsLoaded === 'ok' ? 1 : .5 }}>{busy === 'save' ? 'Saving…' : brandsLoaded === 'loading' ? 'Loading brands…' : 'Save profile and brands'}</button>
      {brandsLoaded === 'failed' && <span role="alert" style={{ color: '#E8B86A', fontSize: 12 }}>Your saved brands could not be loaded, so saving is paused to avoid overwriting them. Reload the page to try again.</span>}
      {message && <span role={message.startsWith('Could not') ? 'alert' : 'status'} style={{ color: message.startsWith('Could not') ? '#E8B86A' : acid, fontSize: 12 }}>{message}</span>}
    </div>
  </div>;
}

const GUARDIAN_STEP_LABELS = ['Profile', 'Guidance', 'Audience', 'Offers', 'Site', 'Content'];
/** Steps 1–5 are the setup flow; 06 opens the Content builder. */
const guardianStepHref = (label: string, index: number) => (label === 'Content' ? '/guardians/workspace?tab=content' : `/guardians/workspace?step=${index + 1}`);

function Row({ title, meta, action, onClick, image }: { title: string; meta: string; action?: string; onClick?: () => void; image?: string | null }) { const content = <><div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}><span aria-hidden="true" style={{ position: 'relative', width: 56, height: 56, flex: '0 0 56px', display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${line}`, background: '#171812', color: muted, fontFamily: serif, fontSize: 22 }}>{title.replace(/^R3 Protocol\s*>\s*/i, '').trim().charAt(0)}{image && <img src={image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}</span><div style={{ minWidth: 0 }}><div style={{ fontFamily: serif, fontSize: 22 }}>{title}</div><div style={{ color: muted, fontSize: 11, marginTop: 5 }}>{meta}</div></div></div><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{action}<ChevronRight size={16} /></span></>; return onClick ? <button type="button" onClick={onClick} style={{ width: '100%', border: 0, borderTop: `1px solid ${line}`, padding: '18px 4px', background: 'transparent', color: ink, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>{content}</button> : <div style={{ borderTop: `1px solid ${line}`, padding: '18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{content}</div>; }

// Scopes Guardian styling; globals.css exempts `.guardian-ui button` from the forced 16px button size.
export function GuidePortal() {
  return <div className="guardian-ui"><style>{`.guardian-builders-bar::-webkit-scrollbar{display:none}.g-split{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:20px;align-items:start}.g-split>.g-sticky{position:sticky;top:16px}@media (max-width: 960px){.g-split{grid-template-columns:minmax(0,1fr)}.g-split>.g-sticky{position:static}}
    /* The app shell sets overflow-x:hidden on body and (inline, App.tsx) on #main-content, which makes
       them scroll containers and stops the sticky header. clip keeps sideways overflow hidden without that;
       !important is needed to beat main's inline style, and :has() keeps it to Guardian pages. */
    body:has(.guardian-ui),#main-content:has(.guardian-ui){overflow-x:clip!important;overflow-y:visible!important}
    /* Diet planner: stacked by default; from 1200px the macros/nutrients/hazards become one sticky column beside the
       planner (the week grid scrolls sideways inside its column when it needs more room). */
    .g-diet-split{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}
    @media (min-width:1200px){.g-diet-split{grid-template-columns:minmax(0,1fr) clamp(320px,28vw,380px);grid-template-areas:"plan side"}.g-diet-split>.g-diet-plan{grid-area:plan}.g-diet-split>.g-diet-side{grid-area:side;position:sticky;top:80px;max-height:calc(100vh - 96px);overflow-y:auto;overscroll-behavior:contain}.g-diet-side .g-macro-strip{grid-template-columns:1fr!important}.g-diet-side .g-macro-strip>div{border-right:0!important;border-bottom:1px solid rgba(245,242,234,0.24)}}
    /* Fitness planner: an opened exercise shows beside the week as in the app (stacked under 1200px). */
    .g-fit-split{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
    @media (min-width:1200px){.g-fit-split.has-detail{grid-template-columns:minmax(0,1fr) 340px}.g-fit-split.has-detail>.g-fit-detail{position:sticky;top:80px}}
    /* Shared header: builder dropdowns reveal on hover/focus */
    .g-header-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;padding:0 clamp(20px,5vw,72px)}
    .g-brand{justify-self:start;display:flex}
    /* The account side may shrink: a long name truncates, then hides, so Sign out never leaves the screen. */
    .g-header-account{justify-self:end;min-width:0;max-width:100%}
    .g-header-name{min-width:0;max-width:22ch;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}
    @media (max-width:1100px){.g-header-name{display:none}}
    .g-brand-r3{display:none}
    .g-builders{flex-wrap:nowrap}
    /* Icon-only chips; the name slides out for the current page and on hover/keyboard focus. */
    .g-chip-label{display:inline-block;overflow:hidden;max-width:0;opacity:0;margin-left:-7px;transition:max-width .45s cubic-bezier(.65,0,.35,1),opacity .35s cubic-bezier(.65,0,.35,1),margin-left .45s cubic-bezier(.65,0,.35,1)}
    .g-chip-label.is-on,.g-builder:hover .g-chip-label,.g-builder:has(:focus-visible) .g-chip-label{max-width:180px;opacity:1;margin-left:0}
    @media (max-width:720px){.g-header-row{grid-template-columns:auto 1fr;row-gap:10px;padding-top:10px;padding-bottom:10px}.g-builders{grid-column:1/-1;grid-row:2;justify-self:center}.g-brand-full{display:none}.g-brand-r3{display:inline-grid}.g-header-name{display:none}}
    .g-builder-menu{opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .14s ease,transform .14s ease,visibility .14s;z-index:60}
    .g-builder:hover>.g-builder-menu,.g-builder:has(:focus-visible)>.g-builder-menu{opacity:1;visibility:visible;transform:translateY(0)}
    /* Collapsible icon rail: 64px, widens to 224px on hover/focus and pushes the page aside (no overlay) */
    .g-railwrap{position:relative;width:64px;transition:width .18s ease}
    .g-railwrap:hover,.g-railwrap:has(:focus-visible){width:224px}
    /* overflow-y:auto: on short screens (phone landscape) the grid row can be shorter than the ~512px of links;
       the rail scrolls on its own instead of clipping them. Scrollbar hidden so the 64px icon column stays aligned. */
    .g-rail{position:absolute;inset:0;width:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;background:${black};border-right:1px solid ${line};padding:20px 0;z-index:30;}
    .g-rail::-webkit-scrollbar{display:none}
    .g-rlabel{opacity:0;transition:opacity .14s ease}
    .g-railwrap:hover .g-rail .g-rlabel,.g-rail:has(:focus-visible) .g-rlabel{opacity:1}
    @media (prefers-reduced-motion:reduce){.g-railwrap,.g-rail,.g-rlabel,.g-builder-menu,.g-chip-label{transition:none}}`}</style><GuidePortalRoutes /></div>;
}

function GuidePortalRoutes() {
  const { user, accessToken, loading } = useAuth();
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const isWorkspaceRoute = pathname === '/guardians/workspace';
  const routeSlug = pathname.match(/^\/guardians\/([^/]+)(?:\/value-ramp\/[^/]+)?$/)?.[1] || null;
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!user) { setProfile(null); setChecking(false); return; }
    setChecking(true); getGuideProfile(user.id).then(setProfile).catch(() => setProfile(null)).finally(() => setChecking(false));
  }, [user?.id]);
  if (routeSlug && !isWorkspaceRoute) return <GuardianWebsite slug={decodeURIComponent(routeSlug)} isSignedIn={Boolean(user)} />;
  if (!isWorkspaceRoute) return <PublicGuidePage isSignedIn={Boolean(user)} />;
  if (loading || checking) return <div style={{ minHeight: '100vh', background: black, color: ink, display: 'grid', placeItems: 'center', fontFamily: sans }}>Opening Guardian workspace…</div>;
  if (!user) return <PublicGuidePage isSignedIn={false} />;
  // The step builder (Profile → Guidance → Audience → Offers → Site) is the Guardian dashboard.
  // The tool views (Library, Leads, Recipes…) open from its header via ?tab=.
  const wantsTool = new URLSearchParams(window.location.search).has('tab');
  if (accessToken && (!profile || !wantsTool)) return <Onboarding userId={user.id} accessToken={accessToken} hasProfile={Boolean(profile)} name={user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Guardian'} email={user.email || ''} accountAvatarUrl={user.user_metadata?.avatar_url || user.user_metadata?.picture || null} onDone={(p) => { setProfile(p); window.location.assign('/guardians/workspace?tab=home'); }} />;
  if (!profile) return <div style={{ minHeight: '100vh', background: black, color: ink, display: 'grid', placeItems: 'center', fontFamily: sans }}>Opening Guardian setup…</div>;
  return <Workspace profile={profile} onProfile={setProfile} />;
}
