/**
 * AWS IAM Identity Center (IDC) OIDC Authentication Client
 * 
 * Modeled directly after amazon-connect/ai-agents-lab-amazon-connect:
 * - OIDC Authorization Code Flow with PKCE (Proof Key for Code Exchange)
 * - Scope: 'sso:account:access'
 * - Direct authorization URL redirection (no .well-known discovery calls that cause 403 on AWS SSO-OIDC)
 * - Token exchange proxy via local /api/idc-token to handle AWS SSO-OIDC CORS restrictions
 * - User display name resolution & token claims extraction
 */

// Storage keys matching amazon-connect/ai-agents-lab-amazon-connect
const STORAGE_KEY_VERIFIER = 'oidc_code_verifier';
const STORAGE_KEY_STATE = 'oidc_state';
const STORAGE_KEY_TOKEN = 'oidc_access_token';
const STORAGE_KEY_USER = 'oidc_user_profile';

class IdcOidcAuthClient {
  constructor() {
    this.config = {
      issuerUrl: '',
      clientId: '',
      clientSecret: '',
      redirectUri: window.location.origin,
      region: 'eu-west-1',
      scope: 'sso:account:access',
      authBypass: false
    };
    this.user = null;
    this.accessToken = null;
  }

  /**
   * Initializes the OIDC client:
   * 1. Loads configuration from server (/api/config)
   * 2. Checks for dev bypass mode
   * 3. Checks for redirect callback (?code=...&state=...)
   * 4. Loads existing stored session
   */
  async init() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.oidc) {
        this.config.issuerUrl = data.oidc.issuerUrl || data.oidc.issuer || '';
        this.config.clientId = data.oidc.clientId || '';
        this.config.clientSecret = data.oidc.clientSecret || '';
        this.config.redirectUri = data.oidc.redirectUri || window.location.origin;
        this.config.region = data.oidc.region || 'eu-west-1';
        this.config.scope = data.oidc.scopes || 'sso:account:access';
        this.config.authBypass = data.oidc.authBypass || false;
      }
    } catch (e) {
      console.warn('[IDC OIDC] Could not fetch /api/config:', e);
    }

    // Dev bypass mode from .env (VITE_AUTH_BYPASS=true)
    if (this.config.authBypass) {
      console.log('[IDC OIDC] Dev bypass mode active (VITE_AUTH_BYPASS=true)');
      this.simulateMockLogin('dev-bypass-user@company.com');
      return true;
    }

    // Check if returning from redirect with auth code (?code=...&state=...)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      console.log('[IDC OIDC] Detected authorization code callback, exchanging token...');
      await this.handleCallback(code, state);
    } else {
      // Load previous session
      this.loadStoredSession();
    }

    this.dispatchStateChange();
    return this.isAuthenticated();
  }

  /**
   * Generates a cryptographically random code verifier for PKCE (RFC 7636)
   */
  generateCodeVerifier(length = 64) {
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
   * Derives S256 code challenge from verifier using Web Crypto API
   */
  async deriveCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Generates random state parameter
   */
  generateState() {
    return this.generateCodeVerifier(32);
  }

  /**
   * Builds the authorization URL matching ai-agents-lab-amazon-connect
   */
  buildAuthorizeUrl(challenge, state) {
    let baseUrl = this.config.issuerUrl.trim().replace(/\/+$/, '');
    
    // Auto-prepend https:// if missing
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    // Format endpoint: IAM Identity Center authorize endpoint
    const authorizeEndpoint = baseUrl.endsWith('/authorize') ? baseUrl : `${baseUrl}/authorize`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
      scope: this.config.scope || 'sso:account:access'
    });

    return `${authorizeEndpoint}?${params.toString()}`;
  }

  /**
   * Initiates OIDC Authorization Code Flow with PKCE
   * Directly redirects to IDC authorization endpoint (NO .well-known call!)
   */
  async login() {
    if (!this.config.issuerUrl || !this.config.clientId || this.config.clientId.includes('YOUR_')) {
      const proceedMock = confirm(
        'VITE_OIDC_ISSUER_URL or VITE_OIDC_CLIENT_ID is not configured in .env yet.\n\n' +
        'Would you like to simulate a successful IDC login locally for testing?'
      );
      if (proceedMock) {
        this.simulateMockLogin();
      }
      return;
    }

    try {
      const verifier = this.generateCodeVerifier();
      const challenge = await this.deriveCodeChallenge(verifier);
      const state = this.generateState();

      // Store in sessionStorage to survive redirect
      sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);
      sessionStorage.setItem(STORAGE_KEY_STATE, state);

      const authorizeUrl = this.buildAuthorizeUrl(challenge, state);
      console.log('[IDC OIDC] Redirecting to IDC authorization endpoint:', authorizeUrl);

      // Redirect browser directly to IAM Identity Center
      window.location.href = authorizeUrl;
    } catch (err) {
      console.error('[IDC OIDC] Login initiation error:', err);
      alert(`Could not initiate OIDC login: ${err.message}`);
    }
  }

  /**
   * Handles callback after IAM Identity Center redirects back with ?code=...&state=...
   */
  async handleCallback(code, state) {
    const storedState = sessionStorage.getItem(STORAGE_KEY_STATE);

    if (state !== storedState) {
      console.error('[IDC OIDC] Security error: state mismatch');
      alert('Security error: state mismatch during OIDC callback');
      return;
    }

    const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
    if (!verifier) {
      console.error('[IDC OIDC] Missing code verifier in session storage');
      return;
    }

    try {
      // Exchange code for token via local proxy /api/idc-token to handle CORS
      const tokenPayload = {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        code: code,
        redirectUri: this.config.redirectUri,
        codeVerifier: verifier,
        region: this.config.region,
        issuerUrl: this.config.issuerUrl
      };

      console.log('[IDC OIDC] Exchanging code for token via /api/idc-token...');
      const response = await fetch('/api/idc-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenPayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error_description || errorData.error || response.statusText);
      }

      const tokenData = await response.json();
      const accessToken = tokenData.accessToken || tokenData.access_token || tokenData.idToken || tokenData.id_token;

      if (!accessToken) {
        throw new Error('No access token received from token exchange');
      }

      this.accessToken = accessToken;
      sessionStorage.setItem(STORAGE_KEY_TOKEN, accessToken);

      // Clean session storage
      sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
      sessionStorage.removeItem(STORAGE_KEY_STATE);

      // Decode claims and resolve display name
      const claims = this.decodeTokenClaims(accessToken);
      const displayName = this.resolveDisplayName(claims);

      this.user = {
        accessToken: accessToken,
        idToken: tokenData.idToken || tokenData.id_token || accessToken,
        expiresIn: tokenData.expiresIn || 3600,
        expiresAt: Date.now() + (tokenData.expiresIn || 3600) * 1000,
        profile: {
          name: displayName,
          email: claims.email || (displayName.includes('@') ? displayName : 'authenticated-user@company.com'),
          claims: claims
        }
      };

      sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));

      // Clean query params from URL (remove ?code=...&state=...)
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log('[IDC OIDC] Successfully authenticated as:', displayName);
    } catch (err) {
      console.error('[IDC OIDC] Token exchange failed:', err);
      alert(`OIDC Token exchange error: ${err.message}`);
    }
  }

  /**
   * Decodes JWT without signature verification (matches ai-agents-lab-amazon-connect)
   */
  decodeTokenClaims(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return {};
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (e) {
      console.warn('[IDC OIDC] Failed to decode JWT claims, using fallback');
      return {};
    }
  }

  /**
   * Resolves display name using fallback chain (matches ai-agents-lab-amazon-connect):
   * name -> email -> preferred_username -> sub -> "User"
   */
  resolveDisplayName(claims) {
    if (typeof claims.name === 'string' && claims.name.length > 0) {
      return claims.name;
    }
    if (typeof claims.email === 'string' && claims.email.length > 0) {
      return claims.email;
    }
    if (typeof claims.preferred_username === 'string' && claims.preferred_username.length > 0) {
      return claims.preferred_username;
    }
    if (typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.includes('@')) {
      return claims.sub;
    }
    return 'IAM Identity Center User';
  }

  simulateMockLogin(customEmail = 'rahul.idc@clientcompany.com') {
    const mockClaims = {
      sub: 'usr-idc-89214',
      email: customEmail,
      name: 'Rahul Sharma (IDC Verified)',
      iss: this.config.issuerUrl || 'https://oidc.eu-west-1.amazonaws.com',
      client_id: this.config.clientId || 'client-idc-app',
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify(mockClaims)).replace(/=/g, '');
    const mockToken = `${header}.${payload}.mock-signature-idc-authenticated-token`;

    this.accessToken = mockToken;
    this.user = {
      accessToken: mockToken,
      idToken: mockToken,
      expiresAt: Date.now() + 3600 * 1000,
      profile: {
        name: mockClaims.name,
        email: mockClaims.email,
        claims: mockClaims
      }
    };

    sessionStorage.setItem(STORAGE_KEY_TOKEN, mockToken);
    sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
    this.dispatchStateChange();
  }

  logout() {
    this.user = null;
    this.accessToken = null;
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_USER);
    sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEY_STATE);
    this.dispatchStateChange();
  }

  loadStoredSession() {
    const raw = sessionStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          this.user = parsed;
          this.accessToken = parsed.accessToken;
        } else {
          this.logout();
        }
      } catch (e) {
        this.logout();
      }
    }
  }

  isAuthenticated() {
    return !!(this.user && this.accessToken && this.user.expiresAt > Date.now());
  }

  getUser() {
    return this.user;
  }

  getIdToken() {
    return this.user ? (this.user.idToken || this.user.accessToken) : null;
  }

  getAccessToken() {
    return this.accessToken;
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

// Global Singleton
window.OidcAuth = new IdcOidcAuthClient();
