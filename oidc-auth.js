/**
 * OIDC (OpenID Connect) PKCE Client for Local Web Application & Amazon Connect
 * 
 * Features:
 * - Reads config dynamically from server (.env via /api/config)
 * - Standard Authorization Code Flow with PKCE (Proof Key for Code Exchange)
 * - Zero external dependencies - uses native browser crypto (SubtleCrypto)
 * - Exposes OidcAuth.getIdToken() and OidcAuth.getUser() for Amazon Connect authenticate callback
 */

class OidcAuthClient {
  constructor() {
    this.config = {
      issuer: '',
      clientId: '',
      redirectUri: window.location.origin,
      scopes: 'openid email profile'
    };
    this.user = null;
    this.endpoints = null;
    this.STORAGE_KEY = 'oidc_session';
    this.PKCE_KEY = 'oidc_pkce_state';
  }

  /**
   * Initializes OIDC by loading config from /api/config and checking for login redirect callback
   */
  async init() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.oidc) {
        this.config.issuer = data.oidc.issuer || '';
        this.config.clientId = data.oidc.clientId || '';
        this.config.redirectUri = data.oidc.redirectUri || window.location.origin;
        this.config.scopes = data.oidc.scopes || 'openid email profile';
      }
    } catch (e) {
      console.warn('[OIDC] Could not fetch /api/config, using defaults', e);
    }

    // Check if user is already logged in from previous session
    this.loadStoredSession();

    // Check if browser URL has authorization code callback (?code=...&state=...)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      await this.handleCallback(code, state);
    }

    this.dispatchStateChange();
    return this.isAuthenticated();
  }

  /**
   * Generates a cryptographically random string
   */
  generateRandomString(length = 64) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  /**
   * Computes SHA-256 hash and encodes in Base64URL for PKCE code_challenge
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Discovers OIDC endpoints via /.well-known/openid-configuration
   */
  async getEndpoints() {
    if (this.endpoints) return this.endpoints;
    
    const issuer = this.config.issuer.replace(/\/+$/, '');
    if (!issuer || issuer.includes('YOUR_USER_POOL_ID')) {
      // Fallback dummy endpoints
      return {
        authorization_endpoint: `${issuer}/oauth2/authorize`,
        token_endpoint: `${issuer}/oauth2/token`,
        userinfo_endpoint: `${issuer}/oauth2/userInfo`
      };
    }

    try {
      const res = await fetch(`${issuer}/.well-known/openid-configuration`);
      if (res.ok) {
        this.endpoints = await res.json();
        return this.endpoints;
      }
    } catch (e) {
      console.warn('[OIDC] Discovery failed, falling back to standard paths:', e);
    }

    // Fallback standard Cognito / OIDC endpoints
    return {
      authorization_endpoint: `${issuer}/oauth2/authorize`,
      token_endpoint: `${issuer}/oauth2/token`,
      userinfo_endpoint: `${issuer}/oauth2/userInfo`
    };
  }

  /**
   * Starts the OIDC Login flow (redirects browser to IdP)
   */
  async login() {
    if (!this.config.issuer || this.config.issuer.includes('YOUR_USER_POOL_ID')) {
      // Prompt user or simulate mock login if .env is not yet updated
      const useMock = confirm('Your VITE_OIDC_ISSUER is currently set to the default placeholder in .env.\n\nWould you like to simulate a successful OIDC login locally for testing?');
      if (useMock) {
        this.simulateMockLogin();
        return;
      }
      alert('Please update VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID in your .env file with your actual provider details.');
      return;
    }

    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateRandomString(32);

    // Save PKCE verifier and state in session storage
    sessionStorage.setItem(this.PKCE_KEY, JSON.stringify({
      codeVerifier,
      state,
      returnUrl: window.location.pathname
    }));

    const endpoints = await this.getEndpoints();
    const authUrl = new URL(endpoints.authorization_endpoint);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config.scopes);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    console.log('[OIDC] Redirecting to login:', authUrl.toString());
    window.location.href = authUrl.toString();
  }

  /**
   * Handles redirect callback with authorization code
   */
  async handleCallback(code, state) {
    const pkceRaw = sessionStorage.getItem(this.PKCE_KEY);
    if (!pkceRaw) {
      console.error('[OIDC] No PKCE state found in sessionStorage');
      return;
    }

    const pkce = JSON.parse(pkceRaw);
    sessionStorage.removeItem(this.PKCE_KEY);

    if (pkce.state !== state) {
      console.error('[OIDC] State mismatch error! CSRF attack possible.');
      return;
    }

    try {
      const endpoints = await this.getEndpoints();
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code: code,
        code_verifier: pkce.codeVerifier
      });

      const res = await fetch(endpoints.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!res.ok) {
        throw new Error(`Token exchange failed: ${res.statusText}`);
      }

      const tokenData = await res.json();
      this.processTokenResponse(tokenData);

      // Clean URL parameters
      window.history.replaceState({}, document.title, pkce.returnUrl || window.location.pathname);
    } catch (err) {
      console.error('[OIDC] Error during token exchange:', err);
      alert(`OIDC login error: ${err.message}`);
    }
  }

  /**
   * Decodes JWT without external library
   */
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return {};
    }
  }

  processTokenResponse(tokenData) {
    const claims = tokenData.id_token ? this.parseJwt(tokenData.id_token) : {};
    
    this.user = {
      idToken: tokenData.id_token,
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      profile: {
        email: claims.email || claims['cognito:username'] || claims.sub || 'authenticated-user@company.com',
        name: claims.name || claims.preferred_username || claims.email || 'Corporate User',
        sub: claims.sub || 'usr-123456',
        claims
      }
    };

    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.user));
    this.dispatchStateChange();
  }

  /**
   * Simulates a local mock login with a valid JWT structure for offline prototype testing
   */
  simulateMockLogin() {
    const mockClaims = {
      sub: 'usr-corp-984210',
      email: 'rahul.corp@clientcompany.com',
      name: 'Rahul Sharma (Corporate OIDC)',
      iss: this.config.issuer || 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mock',
      aud: this.config.clientId || 'client-app-123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify(mockClaims)).replace(/=/g, '');
    const dummySignature = 'mock-signature-oidc-verified-token-preview';
    const mockJwt = `${header}.${payload}.${dummySignature}`;

    this.processTokenResponse({
      id_token: mockJwt,
      access_token: 'mock-access-token-bearer-123',
      expires_in: 3600
    });
  }

  logout() {
    this.user = null;
    sessionStorage.removeItem(this.STORAGE_KEY);
    this.dispatchStateChange();
  }

  loadStoredSession() {
    const raw = sessionStorage.getItem(this.STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          this.user = parsed;
        } else {
          sessionStorage.removeItem(this.STORAGE_KEY);
        }
      } catch (e) {
        sessionStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  isAuthenticated() {
    return !!(this.user && this.user.idToken && this.user.expiresAt > Date.now());
  }

  getUser() {
    return this.user;
  }

  getIdToken() {
    return this.user ? this.user.idToken : null;
  }

  getAccessToken() {
    return this.user ? this.user.accessToken : null;
  }

  dispatchStateChange() {
    window.dispatchEvent(new CustomEvent('oidc:change', {
      detail: {
        isAuthenticated: this.isAuthenticated(),
        user: this.user
      }
    }));
  }
}

// Global Singleton Instance
window.OidcAuth = new OidcAuthClient();

