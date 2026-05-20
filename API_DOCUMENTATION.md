# API Documentation - Portale dell'Automobilista

## Base URL
- Development: `http://localhost:3000`
- Production: `https://api.ilportaledellautomobilista.it`

## Authentication Methods

### SPID (Sistema Pubblico di Identità Digitale)
- **Provider**: Italian Digital Identity System
- **Flow**: Federated identity authentication
- **Security Level**: High

### CIE (Carta d'Identità Elettronica)  
- **Provider**: Electronic Identity Card
- **Flow**: Smart card based authentication
- **Security Level**: High

## Endpoints

### 1. SPID Login
```
POST /api/auth/spid-login
```

**Description**: Authenticate user with SPID credentials

**Request Headers**:
```json
{
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "taxId": "RSSMRA80A01H501U",
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "SPID login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Mario Rossi",
    "email": "mario.rossi@example.com",
    "taxId": "RSSMRA80A01H501U",
    "authMethod": "SPID"
  }
}
```

**Response Error (400)**:
```json
{
  "success": false,
  "message": "Invalid SPID data structure. Required: taxId, firstName, lastName, email"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/auth/spid-login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "RSSMRA80A01H501U",
    "firstName": "Mario",
    "lastName": "Rossi",
    "email": "mario.rossi@example.com"
  }'
```

---

### 2. CIE Login
```
POST /api/auth/cie-login
```

**Description**: Authenticate user with CIE credentials

**Request Headers**:
```json
{
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "taxId": "BNCLGU85B12H501A",
  "firstName": "Luigi",
  "lastName": "Bianchi",
  "email": "luigi.bianchi@example.com"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "CIE login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Luigi Bianchi",
    "email": "luigi.bianchi@example.com",
    "taxId": "BNCLGU85B12H501A",
    "authMethod": "CIE"
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/auth/cie-login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "BNCLGU85B12H501A",
    "firstName": "Luigi",
    "lastName": "Bianchi",
    "email": "luigi.bianchi@example.com"
  }'
```

---

### 3. Get User Dashboard
```
GET /api/user/dashboard
```

**Description**: Retrieve authenticated user dashboard data

**Request Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "data": {
    "name": "Mario Rossi",
    "email": "mario.rossi@example.com",
    "taxId": "RSSMRA80A01H501U",
    "authMethod": "SPID",
    "vehicles": [
      {
        "plate": "AB123CD",
        "brand": "FIAT",
        "model": "PANDA",
        "points": 29,
        "expiryDate": "02/2021",
        "environmentalClass": "EURO5"
      }
    ],
    "patents": 1,
    "documents": 0
  }
}
```

**Response Error - Unauthorized (401)**:
```json
{
  "success": false,
  "message": "Invalid token"
}
```

**cURL Example**:
```bash
curl -X GET http://localhost:3000/api/user/dashboard \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

---

### 4. Logout
```
POST /api/auth/logout
```

**Description**: Terminate user session and invalidate token

**Request Headers**:
```json
{
  "Content-Type": "application/json"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Response Error (500)**:
```json
{
  "success": false,
  "message": "Logout failed"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 5. Health Check
```
GET /api/health
```

**Description**: Check API server status

**Response (200)**:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/health
```

---

## Data Validation Rules

### Codice Fiscale (Tax ID)
- **Format**: 16 alphanumeric characters (standard Italian format)
- **Alternative**: Minimum 6 characters for flexibility
- **Pattern**: `^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$`
- **Example**: `RSSMRA80A01H501U`

### Email
- **Format**: Valid email format
- **Required**: Always required
- **Example**: `mario.rossi@example.com`

### Names
- **FirstName**: 1+ characters, alphanumeric
- **LastName**: 1+ characters, alphanumeric
- **Required**: Both mandatory

## Error Codes

| Code | Status | Message | Solution |
|------|--------|---------|----------|
| 400 | Bad Request | Invalid SPID/CIE data | Verify all required fields are present |
| 401 | Unauthorized | No token provided | Include Authorization header |
| 401 | Unauthorized | Invalid token | Re-authenticate with login endpoint |
| 404 | Not Found | User not found | User session may have expired |
| 500 | Server Error | Internal error | Check backend logs |

## JWT Token Structure

**Header**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "taxId": "RSSMRA80A01H501U",
  "iat": 1705317045,
  "exp": 1705403445
}
```

**Expiration**: 24 hours from issue

## Rate Limiting

- **Login Endpoints**: 5 requests per minute per IP
- **Dashboard Endpoint**: 60 requests per minute per user
- **Health Check**: No limit

## CORS Policy

**Allowed Origins**:
- `http://localhost:3000`
- `http://localhost:5500`
- `http://127.0.0.1:5500`

**Allowed Methods**: GET, POST, OPTIONS

**Allowed Headers**: Content-Type, Authorization

## Example Implementation - JavaScript/Fetch

```javascript
// Login with SPID
async function loginSPID(credentials) {
  const response = await fetch('http://localhost:3000/api/auth/spid-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  return await response.json();
}

// Get Dashboard Data
async function getDashboard(token) {
  const response = await fetch('http://localhost:3000/api/user/dashboard', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return await response.json();
}

// Logout
async function logout() {
  const response = await fetch('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return await response.json();
}
```

## Example Implementation - Python/Requests

```python
import requests
import json

BASE_URL = 'http://localhost:3000/api'

# Login
def login_spid(credentials):
    response = requests.post(
        f'{BASE_URL}/auth/spid-login',
        json=credentials,
        headers={'Content-Type': 'application/json'}
    )
    return response.json()

# Get Dashboard
def get_dashboard(token):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(
        f'{BASE_URL}/user/dashboard',
        headers=headers
    )
    return response.json()

# Example usage
credentials = {
    'taxId': 'RSSMRA80A01H501U',
    'firstName': 'Mario',
    'lastName': 'Rossi',
    'email': 'mario@example.com'
}

result = login_spid(credentials)
if result['success']:
    token = result['token']
    dashboard = get_dashboard(token)
    print(dashboard)
```

## API Versioning

- **Current Version**: v1
- **Status**: Stable
- **Deprecation Policy**: 6 months notice before deprecating endpoints

## Security Headers

All responses include:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Troubleshooting

### Token Expired
**Error**: "Invalid token"
**Solution**: Re-authenticate with login endpoint

### CORS Error
**Error**: "Access to XMLHttpRequest blocked by CORS policy"
**Solution**: Ensure origin is in allowed list

### Server Not Responding
**Error**: "Connection refused"
**Solution**: Verify backend is running on port 3000

## Support & Documentation

- **Bug Reports**: Submit via GitHub Issues
- **Feature Requests**: Create discussion on GitHub
- **API Documentation**: [Full OpenAPI Spec](./openapi.yaml)

---

**Last Updated**: January 2024  
**API Version**: 1.0.0  
**Status**: ✅ Active and Production Ready
