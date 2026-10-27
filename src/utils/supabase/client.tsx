import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';
import { withDefaultHeaders } from './requestHeaders';

const supabaseUrl = `https://${projectId}.supabase.co`;

// Simple singleton instance with instance tracking
let supabaseInstance: SupabaseClient | null = null;
let instanceCount = 0;
let creationTimestamp: string | null = null;

/**
 * Create Supabase client with proper configuration
 */
function createSupabaseClient(): SupabaseClient {
  instanceCount++;
  const currentTimestamp = new Date().toISOString();
  
  console.log(`🔧 Creating Supabase client instance #${instanceCount} at ${currentTimestamp}...`);
  
  // Warn if multiple instances are being created
  if (instanceCount > 1) {
    console.warn(`⚠️ Multiple Supabase client instances detected! This is instance #${instanceCount}`);
    console.warn(`⚠️ First instance was created at: ${creationTimestamp}`);
    console.warn(`⚠️ Current instance being created at: ${currentTimestamp}`);
    console.warn('⚠️ This may cause authentication conflicts. Use getSupabaseClient() instead of creating new instances.');
    
    // Log stack trace to help identify where multiple instances are coming from
    console.trace('🔍 Stack trace for multiple instance creation:');
  }
  
  if (!creationTimestamp) {
    creationTimestamp = currentTimestamp;
  }
  
  const instance = createClient(supabaseUrl, publicAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'healthscan-supabase-auth',
      // Reduce retry attempts to prevent hanging
      retryDelayMs: 2000,
      storage: {
        getItem: (key: string) => {
          try {
            return localStorage.getItem(key);
          } catch (error) {
            console.warn(`Failed to get localStorage item ${key}:`, error);
            return null;
          }
        },
        setItem: (key: string, value: string) => {
          try {
            localStorage.setItem(key, value);
          } catch (error) {
            console.warn(`Failed to set localStorage item ${key}:`, error);
          }
        },
        removeItem: (key: string) => {
          try {
            localStorage.removeItem(key);
          } catch (error) {
            console.warn(`Failed to remove localStorage item ${key}:`, error);
          }
        },
      }
    },
    global: {
      headers: {
        'X-HealthScan-Client': 'web-v2',
        'X-Client-Info': `healthscan-web/${projectId}`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      fetch: (url, options = {}) => {
        // Determine timeout based on operation type
        const isAuthOperation = url.includes('/auth/');
        const isRealtimeOperation = url.includes('/realtime');
        const isStorageOperation = url.includes('/storage/');
        
        // Set appropriate timeout based on operation
        let timeoutMs = 30000; // Default 30 seconds for database operations
        if (isAuthOperation) {
          timeoutMs = 15000; // 15 seconds for auth
        } else if (isRealtimeOperation) {
          timeoutMs = 5000; // 5 seconds for realtime
        } else if (isStorageOperation) {
          timeoutMs = 45000; // 45 seconds for file uploads
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`⏰ Request timeout (${timeoutMs}ms) for:`, url);
          controller.abort();
        }, timeoutMs);

        // Merge via the Headers API: supabase-js v2.9x passes a Headers INSTANCE,
        // which `{...headers}` spreads to {} — silently dropping apikey/Authorization
        // ("No API key found in request"). new Headers() handles both shapes.
        // withDefaultHeaders keeps a file upload's multipart type: forcing JSON on it broke every storage upload.
        const mergedHeaders = withDefaultHeaders(options.headers as HeadersInit | undefined, options.body);

        return fetch(url, {
          ...options,
          signal: options.signal || controller.signal,
          headers: mergedHeaders,
        }).finally(() => {
          clearTimeout(timeoutId);
        }).catch((error) => {
          // Check for refresh token errors and clear storage
          if (error.message?.includes('Invalid Refresh Token') || 
              error.message?.includes('Refresh Token Not Found') ||
              error.message?.includes('refresh_token_not_found') ||
              error.message?.includes('invalid_refresh_token')) {
            console.warn('🔄 Invalid refresh token detected in fetch - clearing storage');
            
            // Clear stored tokens
            try {
              localStorage.removeItem('supabase.auth.token');
              sessionStorage.removeItem('supabase.auth.token');
              localStorage.removeItem('healthscan-supabase-auth-token');
              localStorage.removeItem('healthscan_auth_token');
              localStorage.removeItem('healthscan_refresh_token');
              localStorage.removeItem('healthscan_session');
              
              // Notify app of auth change
              window.dispatchEvent(new CustomEvent('authNavigateToHome'));
            } catch (cleanupError) {
              console.error('Error clearing tokens during fetch error:', cleanupError);
            }
          }
          
          // Don't log every network error as it creates noise
          if (error.name === 'AbortError') {
            console.warn('⏰ Request timed out for:', url);
          } else if (!error.message?.includes('Failed to fetch')) {
            console.warn('🌐 Network error:', error.message || error);
          }
          throw error; // Re-throw original error
        });
      }
    }
  });

  console.log('✅ Supabase client created successfully');
  return instance;
}

/**
 * Get the singleton Supabase client instance (synchronous)
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    console.log('🆕 First-time Supabase client creation via getSupabaseClient()');
    supabaseInstance = createSupabaseClient();
  } else {
    // Rare debug log to track access patterns
    if (Math.random() < 0.01) { // Only log 1% of calls to avoid spam
      console.log('♻️ Using existing Supabase client singleton');
    }
  }
  return supabaseInstance;
}

/**
 * Async version for compatibility (returns the sync client)
 */
export async function getSupabaseClientAsync(): Promise<SupabaseClient> {
  return getSupabaseClient();
}

/**
 * Check if client is ready (always true for sync client)
 */
export function isSupabaseReady(): boolean {
  return true;
}

/**
 * Reset the client instance
 */
export function resetSupabaseClient(): void {
  console.log('🔄 Resetting Supabase client...');
  supabaseInstance = null;
  instanceCount = 0;
  creationTimestamp = null;
  
  // Clean up old storage keys
  try {
    const oldStorageKeys = Object.keys(localStorage).filter(
      key => key.startsWith('healthscan-supabase-auth-')
    );
    oldStorageKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('Error during cleanup:', error);
  }
  
  console.log('✅ Supabase client reset complete');
}

/**
 * Get diagnostics information
 */
export function getSupabaseClientDiagnostics() {
  return {
    hasInstance: !!supabaseInstance,
    instanceCount,
    firstInstanceCreatedAt: creationTimestamp,
    url: supabaseUrl,
    projectId,
    timestamp: new Date().toISOString(),
    multipleInstancesWarning: instanceCount > 1 ? 'Multiple instances detected - this may cause auth conflicts' : null,
    recommendations: instanceCount > 1 ? [
      'Use getSupabaseClient() instead of createClient() directly',
      'Check that all components import from utils/supabase/client',
      'Avoid creating client instances in test files or components'
    ] : ['Single instance detected - good practice!']
  };
}

// WARNING: Do not export client instance directly - use getSupabaseClient() instead
// This ensures proper singleton behavior and prevents multiple instances

// Development helpers and instance monitoring
if (typeof window !== 'undefined') {
  (window as any).HealthScanSupabase = {
    getDiagnostics: getSupabaseClientDiagnostics,
    reset: resetSupabaseClient,
    getInstance: getSupabaseClient,
    getInstanceCount: () => instanceCount,
    checkForMultipleInstances: () => {
      if (instanceCount > 1) {
        console.warn(`⚠️ MULTIPLE SUPABASE INSTANCES DETECTED: ${instanceCount} instances`);
        console.warn('⚠️ This can cause "Multiple GoTrueClient instances" warnings and auth conflicts');
        console.warn('⚠️ Recommendation: Use getSupabaseClient() consistently instead of createClient()');
        return true;
      }
      return false;
    }
  };
  
  // Check for multiple instances periodically in development
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => {
      if (instanceCount > 1) {
        console.warn(`🔥 DEVELOPMENT WARNING: ${instanceCount} Supabase client instances detected!`);
        console.warn('🔥 This may cause authentication issues. Run HealthScanSupabase.reset() to fix.');
      }
    }, 5000);
  }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    console.log('🚪 Page unloading, cleaning up...');
    // Don't reset on unload to avoid auth issues
  });
}

/**
 * Retry utility with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Preserve error properties when rethrowing
      if (error.status !== undefined) {
        lastError.status = error.status;
      }
      if (error.details !== undefined) {
        lastError.details = error.details;
      }
      if (error.errorType !== undefined) {
        lastError.errorType = error.errorType;
      }
      
      console.log(`🔄 Retry operation error (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        message: error.message,
        status: error.status,
        errorType: error.errorType,
        details: error.details
      });
      
      // Don't retry on certain types of errors
      if (
        error.message?.includes('Invalid login credentials') ||
        error.message?.includes('User not found') ||
        error.status === 401 ||
        error.status === 403
      ) {
        console.log('🚫 Not retrying due to error type');
        throw error; // Don't retry auth/validation errors
      }
      
      // Don't retry validation errors, but "User already registered" should be handled as success
      if (error.status === 400) {
        console.log('🚫 Not retrying validation error');
        throw error;
      }
      
      // Don't retry "Email already registered" - this should be handled as success in the calling code
      if (error.message?.includes('Email already registered') || error.message?.includes('User already registered')) {
        console.log('🚫 Not retrying - user already exists (should be handled as success)');
        throw error;
      }
      
      // Don't retry if this is the last attempt
      if (attempt === maxRetries) {
        console.log('🚫 Max retries exceeded');
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log('🚫 Throwing final error after all retry attempts:', lastError);
  throw lastError;
}

/**
 * Enhanced error handler that provides better error messages
 */
export function handleSupabaseError(error: any, context: string = 'operation'): Error {
  if (!error) return new Error(`Unknown error during ${context}`);
  
  // Network errors
  if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
    return new Error(`Network connection issue during ${context}. Please check your internet connection and try again.`);
  }
  
  // Timeout errors - be more specific about different timeout types
  if (error.name === 'AbortError') {
    return new Error(`Request was cancelled during ${context}. This may be due to slow network or server issues.`);
  }
  
  if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('timed out')) {
    return new Error(`Request timed out during ${context}. The server may be experiencing high load.`);
  }
  
  // Server errors
  if (error.message?.includes('HTTP 500') || error.message?.includes('Internal Server Error')) {
    return new Error(`Server error during ${context}. Please try again in a few moments.`);
  }
  
  if (error.message?.includes('HTTP 503') || error.message?.includes('Service Unavailable')) {
    return new Error(`Service temporarily unavailable during ${context}. Please try again later.`);
  }
  
  // Supabase specific errors
  if (error.message?.includes('JWT') || error.message?.includes('token')) {
    return new Error(`Authentication session expired during ${context}. Please sign in again.`);
  }
  
  if (error.message?.includes('permission denied') || error.message?.includes('access denied')) {
    return new Error(`Permission denied during ${context}. You may not have access to this resource.`);
  }
  
  // Database connection errors
  if (error.message?.includes('connection') && error.message?.includes('refused')) {
    return new Error(`Database connection failed during ${context}. Please try again.`);
  }
  
  // Return original error if we can't enhance it, but make it user-friendly
  const originalMessage = error.message || String(error);
  if (originalMessage.length > 100) {
    return new Error(`An error occurred during ${context}. Please try again or contact support if the problem persists.`);
  }
  
  return error instanceof Error ? error : new Error(originalMessage);
}

console.log('📦 Supabase client manager loaded');