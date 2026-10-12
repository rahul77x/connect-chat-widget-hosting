#!/usr/bin/env python3
"""
Local Development & Amazon Connect Authentication Server (Python 3)

Capabilities:
1. Serves the static website files (index.html, styles.css, app.js, screenshot).
2. Implements /api/chat-auth: Issues signed JWT tokens for Amazon Connect Authenticated Chat.
3. Implements /api/start-chat: Demonstrates AWS Connect StartChatContact API proxy.

Zero external dependencies required - uses Python standard library!
Run with: python server.py
"""

import http.server
import socketserver
import os
import json
import time
import hmac
import hashlib
import base64
import uuid

# Load .env file automatically on startup
def load_env_file(filepath=None):
    if filepath is None:
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip().strip('"').strip("'")
                        if key not in os.environ:
                            os.environ[key] = val
        except Exception as e:
            print(f"Warning: could not read .env: {e}")

load_env_file()

PORT = int(os.environ.get("PORT", 3000))
JWT_SECRET = os.environ.get("CONNECT_JWT_SECRET", "prototype-amazon-connect-secret-key-2026").encode("utf-8")
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def create_connect_jwt(claims: dict) -> dict:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    
    payload = {
        "sub": claims.get("customerId", "BOI-CUST-984210"),
        "iat": now,
        "exp": now + 3600,
        "attributes": {
            "customerName": claims.get("customerName", "Rahul Sharma"),
            "customerId": claims.get("customerId", "BOI-CUST-984210"),
            "accountType": claims.get("accountType", "Premium Savings"),
            "authenticated": "true",
            "source": "Local-Prototype-Dev-Python"
        }
    }
    
    encoded_header = base64url_encode(json.dumps(header).encode("utf-8"))
    encoded_payload = base64url_encode(json.dumps(payload).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    
    signature = hmac.new(JWT_SECRET, signing_input, hashlib.sha256).digest()
    encoded_signature = base64url_encode(signature)
    
    token = f"{encoded_header}.{encoded_payload}.{encoded_signature}"
    return {"token": token, "payload": payload}

class ConnectAuthHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        if self.path == '/api/idc-token':
            region = body.get("region") or os.environ.get("VITE_AWS_REGION", "eu-west-1")
            client_id = body.get("clientId") or os.environ.get("VITE_OIDC_CLIENT_ID", "")
            client_secret = body.get("clientSecret") or os.environ.get("VITE_OIDC_CLIENT_SECRET", "")
            code = body.get("code", "")
            redirect_uri = body.get("redirectUri") or os.environ.get("VITE_OIDC_REDIRECT_URI", f"http://localhost:{PORT}")
            code_verifier = body.get("codeVerifier", "")

            # AWS SSO OIDC Token Endpoint (matches CreateTokenCommand in ai-agents-lab)
            token_url = f"https://oidc.{region}.amazonaws.com/token"
            token_payload = {
                "clientId": client_id,
                "grantType": "authorization_code",
                "code": code,
                "redirectUri": redirect_uri,
                "codeVerifier": code_verifier
            }
            if client_secret:
                token_payload["clientSecret"] = client_secret

            import urllib.request
            import urllib.error

            req_data = json.dumps(token_payload).encode('utf-8')
            token_req = urllib.request.Request(
                token_url,
                data=req_data,
                headers={"Content-Type": "application/json"}
            )

            try:
                with urllib.request.urlopen(token_req) as resp:
                    resp_body = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(resp_body)
                    return
            except urllib.error.HTTPError as e:
                err_body = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(err_body)
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        if self.path == '/api/chat-auth':
            result = create_connect_jwt(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response_data = {
                "success": True,
                "message": "Authentication token generated successfully for local Amazon Connect session.",
                "jwtToken": result["token"],
                "claims": result["payload"],
                "expiresInSeconds": 3600
            }
            self.wfile.write(json.dumps(response_data, indent=2).encode('utf-8'))
            return

        if self.path == '/api/start-chat':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response_data = {
                "success": True,
                "mode": "Local Prototype Response",
                "ContactId": str(uuid.uuid4()),
                "ParticipantId": str(uuid.uuid4()),
                "ParticipantToken": base64url_encode(uuid.uuid4().bytes + uuid.uuid4().bytes),
                "participantDetails": {
                    "DisplayName": body.get("participantName", "Authenticated Customer"),
                    "CustomerId": body.get("customerId", "BOI-CUST-984210")
                },
                "note": "In production, call AWS Connect StartChatContactCommand using AWS SDK (boto3)."
            }
            self.wfile.write(json.dumps(response_data, indent=2).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/config':
            config_data = {
                "oidc": {
                    "issuerUrl": os.environ.get("VITE_OIDC_ISSUER_URL") or os.environ.get("VITE_OIDC_ISSUER", ""),
                    "clientId": os.environ.get("VITE_OIDC_CLIENT_ID", ""),
                    "clientSecret": os.environ.get("VITE_OIDC_CLIENT_SECRET", ""),
                    "redirectUri": os.environ.get("VITE_OIDC_REDIRECT_URI", f"http://localhost:{PORT}"),
                    "region": os.environ.get("VITE_AWS_REGION", "eu-west-1"),
                    "scopes": os.environ.get("VITE_OIDC_SCOPES", "sso:account:access"),
                    "authBypass": os.environ.get("VITE_AUTH_BYPASS", "").lower() == "true"
                },
                "connect": {
                    "snippetUrl": os.environ.get("CONNECT_SNIPPET_URL", ""),
                    "snippetId": os.environ.get("CONNECT_SNIPPET_ID", ""),
                    "region": os.environ.get("AWS_REGION", "eu-west-1")
                }
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(config_data, indent=2).encode('utf-8'))
            return

        if self.path == '/api/chat-auth':
            result = create_connect_jwt({})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response_data = {
                "success": True,
                "jwtToken": result["token"],
                "claims": result["payload"]
            }
            self.wfile.write(json.dumps(response_data, indent=2).encode('utf-8'))
            return

        # SPA Routing: Serve index.html for /oauth/callback routes
        import urllib.parse
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/oauth/callback') or parsed.path == '/callback':
            self.path = '/index.html'
            return super().do_GET()

        return super().do_GET()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ConnectAuthHandler) as httpd:
        print("=============================================================")
        print(f"[*] Amazon Connect Chat Widget Local Server Running (Python)")
        print("=============================================================")
        print(f">> Website URL:          http://localhost:{PORT}")
        print(f">> Auth Endpoint:        http://localhost:{PORT}/api/chat-auth")
        print(f">> StartChat Endpoint:   http://localhost:{PORT}/api/start-chat")
        print("-------------------------------------------------------------")
        print("NOTE on Amazon Connect Origin Whitelist:")
        print(f"  Make sure http://localhost:{PORT} is added to Approved Origins")
        print("  in AWS Console -> Amazon Connect -> Approved Origins!")
        print("=============================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

