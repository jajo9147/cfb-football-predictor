// ==========================================================================
// CFB PROPHET - SUPABASE AUTHENTICATION & CLOUD DATABASE CLIENT
// Turnkey integration with Supabase Auth, Profiles, and Cloud Brackets
// ==========================================================================

(function(window) {
  'use strict';

  // Default / Configurable Supabase credentials
  // Users can override via localStorage or environment config
  const DEFAULT_SUPABASE_URL = localStorage.getItem('cfb_prophet_supabase_url') || 'https://lkzitjcpyyjgpolqbibe.supabase.co';
  const DEFAULT_SUPABASE_KEY = localStorage.getItem('cfb_prophet_supabase_anon_key') || 'sb_publishable_kaBsPNpLFejytiqPqKDHrQ_99z0dExA';

  let supabaseClient = null;

  function initSupabase() {
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
      try {
        const url = localStorage.getItem('cfb_prophet_supabase_url') || DEFAULT_SUPABASE_URL;
        const key = localStorage.getItem('cfb_prophet_supabase_anon_key') || DEFAULT_SUPABASE_KEY;
        
        // Only initialize client if valid URL pattern
        if (url && url.startsWith('http')) {
          supabaseClient = window.supabase.createClient(url, key, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          setupAuthListener();
        }
      } catch (err) {
        console.warn('[CFB Prophet] Supabase init warning:', err);
      }
    }
  }

  function isSupabaseConfigured() {
    const url = localStorage.getItem('cfb_prophet_supabase_url') || DEFAULT_SUPABASE_URL;
    return !!(supabaseClient && url && url.startsWith('http'));
  }

  function getClient() {
    return supabaseClient;
  }

  // Auth State Listener
  function setupAuthListener() {
    if (!supabaseClient) return;

    const processSession = (session, event) => {
      if (session && session.user) {
        const user = session.user;
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || 
                         meta.name || 
                         (meta.given_name ? `${meta.given_name} ${meta.family_name || ''}`.trim() : '') ||
                         (user.email ? user.email.split('@')[0] : 'Coach');

        const localUserObj = {
          id: user.id,
          email: user.email,
          displayName: fullName,
          handle: fullName,
          avatarUrl: meta.avatar_url || meta.picture || '',
          favTeam: localStorage.getItem('cfb_prophet_fav_team') || 'usc',
          provider: user.app_metadata?.provider || 'google',
          createdAt: user.created_at
        };

        localStorage.setItem('cfb_prophet_auth_user_v4', JSON.stringify(localUserObj));
        localStorage.setItem('cfb_prophet_auth_user_v3', JSON.stringify(localUserObj));
        localStorage.setItem('cfb_prophet_user_handle', localUserObj.displayName);

        if (event === 'SIGNED_IN') {
          if (typeof window.showCustomToast === 'function') {
            window.showCustomToast(`🎉 Welcome, ${localUserObj.displayName}! Signed in.`);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('cfb_prophet_auth_user_v4');
        localStorage.removeItem('cfb_prophet_auth_user_v3');
      }

      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
      if (typeof window.renderSavedBracketsVault === 'function') {
        window.renderSavedBracketsVault();
      }
    };

    // 1. Listen for dynamic changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Supabase Auth Event]:', event, session?.user?.email);
      processSession(session, event);

      if (session && session.user) {
        // Attempt cloud profile sync in background
        fetchOrCreateProfile(session.user).catch(() => {});
      }
    });

    // 2. Immediately check current session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        processSession(session, 'INITIAL_SESSION');
      }
    }).catch(() => {});
  }

  // Profile Fetch & Upsert in public.profiles
  async function fetchOrCreateProfile(user) {
    if (!supabaseClient || !user) return null;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data && !error) return data;

      // Upsert default profile if not found
      const defaultName = user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'Coach');
      const defaultFavTeam = localStorage.getItem('cfb_prophet_fav_team') || 'usc';
      const defaultHandle = (user.email ? user.email.split('@')[0] : `coach_${Date.now().toString().slice(-4)}`).replace(/[^a-zA-Z0-9_]/g, '_');

      const { data: newProfile } = await supabaseClient
        .from('profiles')
        .upsert({
          id: user.id,
          handle: defaultHandle,
          display_name: defaultName,
          favorite_team: defaultFavTeam,
          avatar_url: user.user_metadata?.avatar_url || '',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      return newProfile;
    } catch (e) {
      console.warn('[Supabase] Profile sync notice:', e.message);
      return null;
    }
  }

  const GOOGLE_CLIENT_ID = '114317205490-ppqup25cuv5ibu5508pooqhjs188d8u.apps.googleusercontent.com';

  function initGoogleIdentityServices() {
    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (response && response.credential && supabaseClient) {
              if (typeof window.showCustomToast === 'function') {
                window.showCustomToast('🔄 Signing in with Google...');
              }
              const { data, error } = await supabaseClient.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential
              });
              if (error) {
                console.warn('[Supabase] GIS signInWithIdToken notice:', error.message);
                signInWithGoogleOAuthFallback();
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });

        const btnEl = document.getElementById('googleGsiButtonContainer');
        const manualBtn = document.getElementById('supabaseGoogleBtn');
        if (btnEl) {
          btnEl.innerHTML = '';
          window.google.accounts.id.renderButton(btnEl, {
            theme: 'filled_black',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width: 320
          });
          if (manualBtn) {
            manualBtn.style.display = 'none';
          }
        }
      } catch (e) {
        console.warn('[Supabase] Google GIS init warning:', e);
      }
    }
  }

  // 1. Google OAuth with seamless GIS One-Tap & Popup
  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      showConfigModal('Google OAuth requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }

    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            signInWithGoogleOAuthFallback();
          }
        });
        return { success: true };
      } catch(err) {
        return signInWithGoogleOAuthFallback();
      }
    }

    return signInWithGoogleOAuthFallback();
  }

  async function signInWithGoogleOAuthFallback() {
    return await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  }

  // 1b. GitHub OAuth
  async function signInWithGitHub() {
    if (!isSupabaseConfigured()) {
      showConfigModal('GitHub OAuth requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }
    return await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  }

  // 2. Apple OAuth
  async function signInWithApple() {
    // If native iOS App bridge is present, route to Swift
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.appleSignIn) {
      window.webkit.messageHandlers.appleSignIn.postMessage({});
      return { native: true };
    }

    if (!isSupabaseConfigured()) {
      showConfigModal('Apple Sign In requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }

    return await supabaseClient.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  }

  // 3. Passwordless Magic Link / OTP
  async function signInWithMagicLink(email) {
    if (!isSupabaseConfigured()) {
      showConfigModal('Magic Link requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }
    if (!email || !email.includes('@')) {
      return { error: { message: 'Please enter a valid email address.' } };
    }
    return await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
  }

  // 4. Email & Password Sign In
  async function signInWithPassword(email, password) {
    if (!isSupabaseConfigured()) {
      showConfigModal('Sign in requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }
    if (!email || !password) {
      return { error: { message: 'Please enter both email and password.' } };
    }
    return await supabaseClient.auth.signInWithPassword({ email, password });
  }

  // 5. Email & Password Sign Up (Registration)
  async function signUpWithPassword(email, password, displayName, favTeam) {
    if (!isSupabaseConfigured()) {
      showConfigModal('Sign up requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }
    if (!email || !password) {
      return { error: { message: 'Please enter both email and password.' } };
    }
    if (password.length < 6) {
      return { error: { message: 'Password must be at least 6 characters.' } };
    }
    return await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: displayName || email.split('@')[0],
          favorite_team: favTeam || 'usc'
        }
      }
    });
  }

  // 6. Sign Out
  async function signOut() {
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (e) {}
    }
    localStorage.removeItem('cfb_prophet_auth_user_v4');
    if (typeof window.updateAuthUI === 'function') {
      window.updateAuthUI();
    }
    return { success: true };
  }

  // 7. Save Bracket to Supabase Cloud
  async function saveBracketToCloud(bracketObj) {
    if (!isSupabaseConfigured() || !bracketObj) return null;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || !session.user) return null;

      const row = {
        id: bracketObj.id,
        user_id: session.user.id,
        name: bracketObj.name,
        creator: bracketObj.creator,
        notes: bracketObj.notes || '',
        champion: bracketObj.champion,
        runner_up: bracketObj.runnerUp,
        seeds: bracketObj.seeds,
        playoff_summary: bracketObj.playoffSummary || null,
        sim_state: bracketObj.simState || {},
        mode: bracketObj.mode || 'custom',
        is_public: !!bracketObj.isPublic,
        created_at: bracketObj.createdAt || new Date().toISOString()
      };

      const { data, error } = await supabaseClient
        .from('brackets')
        .upsert(row)
        .select()
        .single();

      if (error) {
        console.warn('[Supabase] Bracket cloud save notice:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[Supabase] Cloud save exception:', e.message);
      return null;
    }
  }

  // 8. Fetch Community Brackets from Supabase Cloud
  async function fetchCloudCommunityBrackets() {
    if (!isSupabaseConfigured()) return [];
    try {
      const { data, error } = await supabaseClient
        .from('brackets')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error || !data) return [];

      return data.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        creator: row.creator,
        notes: row.notes,
        champion: row.champion,
        runnerUp: row.runner_up,
        seeds: row.seeds,
        playoffSummary: row.playoff_summary,
        simState: row.sim_state,
        mode: row.mode,
        isPublic: row.is_public,
        createdAt: row.created_at,
        isCloudSynced: true
      }));
    } catch (e) {
      return [];
    }
  }

  // Configuration helper for user
  function setSupabaseConfig(url, anonKey) {
    if (url) localStorage.setItem('cfb_prophet_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('cfb_prophet_supabase_anon_key', anonKey.trim());
    initSupabase();
  }

  function showConfigModal(noticeMsg) {
    const configDrawer = document.getElementById('supabaseConfigDrawer');
    if (configDrawer) {
      configDrawer.style.display = 'block';
      const msgEl = document.getElementById('supabaseConfigNotice');
      if (msgEl && noticeMsg) msgEl.textContent = noticeMsg;
    }
  }

  // Export to Global Scope
  window.CFBProphetSupabase = {
    init: initSupabase,
    getClient: getClient,
    isConfigured: isSupabaseConfigured,
    setConfig: setSupabaseConfig,
    showConfig: showConfigModal,
    signInWithGoogle: signInWithGoogle,
    signInWithGitHub: signInWithGitHub,
    signInWithApple: signInWithApple,
    signInWithMagicLink: signInWithMagicLink,
    signInWithPassword: signInWithPassword,
    signUpWithPassword: signUpWithPassword,
    signOut: signOut,
    initGIS: initGoogleIdentityServices,
    saveBracket: saveBracketToCloud,
    fetchCommunityBrackets: fetchCloudCommunityBrackets
  };

  // Initialize on script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }

})(window);
