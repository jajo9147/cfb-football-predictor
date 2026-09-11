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
          initGSIWhenReady();
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

  // Google Client ID for In-Page 1-Click Authentication (from CFB Prophet GCP project)
  const GOOGLE_CLIENT_ID = '114317205490-ppqup25cuv5lbu5508pooaqhjs188d8u.apps.googleusercontent.com';
  let gsiInitialized = false;

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    if (!supabaseClient) {
      console.warn('[CFB Prophet] Supabase client not ready for Google ID token sign-in');
      return;
    }

    try {
      if (typeof window.showCustomToast === 'function') {
        window.showCustomToast('⚡ Signing in with Google...');
      }

      const { data, error } = await supabaseClient.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential
      });

      if (error) {
        console.error('[Supabase] Google ID token sign-in error:', error);
        if (typeof window.showAuthAlert === 'function') {
          window.showAuthAlert(error.message || 'Google sign-in error. Please try again.', 'error');
        }
      } else {
        if (typeof window.closeAuthModal === 'function') {
          window.closeAuthModal();
        }
        const user = data?.user;
        const name = user?.user_metadata?.full_name || user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Coach');
        if (typeof window.showCustomToast === 'function') {
          window.showCustomToast(`🏈 Welcome to CFB Prophet, ${name}!`);
        }
      }
    } catch (err) {
      console.error('[Supabase] Google ID token sign-in exception:', err);
      if (typeof window.showAuthAlert === 'function') {
        window.showAuthAlert('Google Sign-In failed. Please try again.', 'error');
      }
    }
  }

  function initGSIWhenReady() {
    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      initGoogleIdentityServices();
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
          clearInterval(interval);
          initGoogleIdentityServices();
        } else if (attempts > 20) {
          clearInterval(interval);
        }
      }, 300);
    }
  }

  function initGoogleIdentityServices() {
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
      return;
    }

    const isNativeApp = !!(window.isCFBProphetNativeApp || window.isNativeIos || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.appleSignIn));
    if (isNativeApp) {
      return;
    }

    if (gsiInitialized) {
      renderGoogleButton();
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      gsiInitialized = true;
      renderGoogleButton();

      // Trigger One Tap if user is eligible on web
      try {
        window.google.accounts.id.prompt();
      } catch (e) {}
    } catch (err) {
      console.warn('[Supabase] Google Identity Services init error:', err);
    }
  }

  function renderGoogleButton() {
    const container = document.getElementById('g_id_signin_container');
    const fallbackBtn = document.getElementById('supabaseGoogleBtn');
    if (!container) return;

    const isNativeApp = !!(window.isCFBProphetNativeApp || window.isNativeIos || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.appleSignIn));
    if (isNativeApp || typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
      container.style.display = 'none';
      if (fallbackBtn) fallbackBtn.style.display = 'flex';
      return;
    }

    if (!gsiInitialized) {
      initGoogleIdentityServices();
      return;
    }

    try {
      const parentWidth = container.parentElement ? container.parentElement.offsetWidth : 320;
      const targetWidth = Math.min(Math.max(parentWidth || 320, 250), 380);

      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: 'continue_with',
        size: 'large',
        logo_alignment: 'left',
        width: targetWidth
      });

      container.style.display = 'flex';
      if (fallbackBtn) fallbackBtn.style.display = 'none';
    } catch (err) {
      console.warn('[Supabase] renderButton notice:', err);
      container.style.display = 'none';
      if (fallbackBtn) fallbackBtn.style.display = 'flex';
    }
  }

  // 1. Direct Supabase Google OAuth
  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      showConfigModal('Google OAuth requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
    }

    if (!window.isCFBProphetNativeApp && typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.prompt();
        return { prompt: true };
      } catch (e) {}
    }

    return await signInWithGoogleOAuthFallback();
  }

  function getSafeRedirectUrl() {
    try {
      if (window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:') && !window.location.origin.includes('file:')) {
        return window.location.origin + window.location.pathname;
      }
    } catch (e) {}
    return 'https://jajo9147.github.io/cfb-football-predictor/';
  }

  async function signInWithGoogleOAuthFallback() {
    return await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getSafeRedirectUrl()
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
        redirectTo: getSafeRedirectUrl()
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
        redirectTo: getSafeRedirectUrl()
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
        emailRedirectTo: getSafeRedirectUrl()
      }
    });
  }

  // 4. Email & Password Sign In
  async function signInWithPassword(email, password) {
    if (!email || !password) {
      return { error: { message: 'Please enter both email and password.' } };
    }

    // Built-in Reviewer / Demo account fallback (Apple Guideline 2.1 Demo Credentials)
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();
    if (cleanEmail === 'reviewer.demo@cfbprophet.app' || cleanEmail === 'apple.reviewer@cfbprophet.app') {
      if (cleanPass !== 'Reviewer2026!' && cleanPass !== 'ReviewerDemo2026!') {
        return { error: { message: 'Invalid email or password.' } };
      }
      const demoUser = {
        id: 'reviewer_demo_user_2026',
        email: cleanEmail,
        displayName: 'Apple App Reviewer (Demo)',
        handle: 'app_reviewer',
        avatarUrl: '',
        favTeam: localStorage.getItem('cfb_prophet_fav_team') || 'texas',
        provider: 'demo',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('cfb_prophet_auth_user_v4', JSON.stringify(demoUser));
      localStorage.setItem('cfb_prophet_auth_user_v3', JSON.stringify(demoUser));
      localStorage.setItem('cfb_prophet_user_handle', demoUser.displayName);
      if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
      if (typeof window.renderSavedBracketsVault === 'function') window.renderSavedBracketsVault();
      return { data: { user: demoUser, session: { user: demoUser } }, error: null };
    }

    if (!isSupabaseConfigured()) {
      showConfigModal('Sign in requires Supabase Project URL & Anon Key.');
      return { error: { message: 'Supabase project not yet connected.' } };
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

  // 5b. Update / Set Password for current user
  async function updateAccountPassword(newPassword) {
    if (!isSupabaseConfigured()) {
      return { error: { message: 'Supabase project not connected.' } };
    }
    if (!newPassword || newPassword.length < 6) {
      return { error: { message: 'Password must be at least 6 characters.' } };
    }
    return await supabaseClient.auth.updateUser({ password: newPassword });
  }

  // 5c. Send Password Reset / Setup Link via Email
  async function resetPasswordForEmail(email) {
    if (!isSupabaseConfigured()) {
      return { error: { message: 'Supabase project not connected.' } };
    }
    if (!email || !email.includes('@')) {
      return { error: { message: 'Please enter a valid email address.' } };
    }
    return await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getSafeRedirectUrl()
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

  // 6b. Delete User Account & User Cloud Data (Apple Guideline 5.1.1(v))
  async function deleteUserAccount() {
    if (supabaseClient) {
      try {
        const sessionRes = await supabaseClient.auth.getSession();
        const sessionUser = sessionRes?.data?.session?.user;
        if (sessionUser && sessionUser.id) {
          try {
            await supabaseClient.from('brackets').delete().eq('user_id', sessionUser.id);
          } catch (e) {}
          try {
            await supabaseClient.from('profiles').delete().eq('id', sessionUser.id);
          } catch (e) {}
        }
      } catch (e) {}
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
  // 7. Save Bracket to Supabase Cloud (Supports both logged-in users and guest submissions)
  async function saveBracketToCloud(bracketObj) {
    if (!isSupabaseConfigured() || !bracketObj) return null;
    try {
      let userId = null;
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session && data.session.user) {
          userId = data.session.user.id;
        }
      } catch (authErr) {}

      const row = {
        id: bracketObj.id,
        user_id: userId,
        creator_id: bracketObj.creatorId || userId || `guest_${Date.now()}`,
        name: bracketObj.name || 'My CFB Prediction',
        creator: bracketObj.creator || 'Coach',
        notes: bracketObj.notes || '',
        champion: bracketObj.champion,
        runner_up: bracketObj.runnerUp,
        seeds: bracketObj.seeds,
        playoff_summary: bracketObj.playoffSummary || null,
        sim_state: bracketObj.simState || {},
        mode: bracketObj.mode || 'custom',
        is_public: bracketObj.isPublic !== false,
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
    initGoogleIdentity: initGoogleIdentityServices,
    renderGoogleButton: renderGoogleButton,
    signInWithGoogle: signInWithGoogle,
    signInWithGitHub: signInWithGitHub,
    signInWithApple: signInWithApple,
    signInWithMagicLink: signInWithMagicLink,
    signInWithPassword: signInWithPassword,
    signUpWithPassword: signUpWithPassword,
    updateAccountPassword: updateAccountPassword,
    resetPasswordForEmail: resetPasswordForEmail,
    signOut: signOut,
    deleteUserAccount: deleteUserAccount,
    saveBracket: saveBracketToCloud,
    saveBracketToCloud: saveBracketToCloud,
    fetchCommunityBrackets: fetchCloudCommunityBrackets,
    fetchCloudCommunityBrackets: fetchCloudCommunityBrackets
  };

  // Initialize on script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }

})(window);
