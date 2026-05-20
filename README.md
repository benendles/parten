# Portale dell'Automobilista - SPID/CIE Authentication System

Complete clone of Italian automotive ministry portal with backend SPID (Sistema Pubblico di Identità Digitale) and CIE (Carta d'Identità Elettronica) authentication.

## Project Structure

```
Bernard-1/
├── backend/
│   ├── server.js              # Express server with authentication routes
│   ├── package.json           # Backend dependencies
│   └── .env                   # Environment configuration
└── frontend/
    ├── login.html             # SPID/CIE login page
    ├── dashboard.html         # User dashboard (post-login)
    ├── css/
    │   ├── login.css          # Login page styles
    │   └── dashboard.css      # Dashboard styles
    └── js/
        ├── login.js           # Login form handling
        └── dashboard.js       # Dashboard functionality
```

## Features

### Authentication System
- **SPID Login**: Sistema Pubblico di Identità Digitale integration
- **CIE Login**: Carta d'Identità Elettronica support
- **Flexible Structure Validation**: Accepts any properly structured SPID/CIE identity data
- **JWT Tokens**: Secure token-based authentication
- **Session Management**: HTTP-only secure cookies

### Required SPID/CIE Data Fields
```json
{
  "taxId": "RSSMRA80A01H501U",      // Codice Fiscale (Italian Tax ID)
  "firstName": "Mario",              // First name
  "lastName": "Rossi",               // Last name
  "email": "mario.rossi@email.com"   // Email address
}
```

### Dashboard Features
- User profile information
- License points display (Saldo Punti)
- License expiry date (Scadenza Patente)
- Vehicle information (Veicoli in possesso)
- Settings management
- Call Center contact information
- Responsive design matching original portal

## Setup Instructions

### Prerequisites
- Node.js 14+ and npm
- Modern web browser
- Two terminal windows

### Backend Setup

1. **Navigate to backend directory**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the server**
```bash
npm start
```

The backend will run on `http://localhost:3000`

Output:
```
🚗 Portale Automobilista Backend running on port 3000
SPID/CIE Authentication enabled
```

### Frontend Setup

#### Option 1: Using Python's HTTP Server
```bash
cd frontend
python3 -m http.server 5500
```

#### Option 2: Using Node HTTP Server
```bash
cd frontend
npx http-server -p 5500
```

Access the application at `http://localhost:5500/login.html`

#### Option 3: Using VS Code Live Server
1. Install Live Server extension in VS Code
2. Right-click on `login.html`
3. Select "Open with Live Server"

## Usage

### Login with SPID

1. Click **"Accedi con SPID"** button
2. Enter credentials:
   - **Nome (First Name)**: Any valid name (e.g., "Mario")
   - **Cognome (Last Name)**: Any valid name (e.g., "Rossi")
   - **Codice Fiscale**: 16-character Italian tax ID (e.g., "RSSMRA80A01H501U")
   - **Email**: Valid email address
3. Click **"Accedi con SPID"** to proceed to dashboard

### Login with CIE

1. Click **"Accedi con CIE"** button
2. Enter credentials (same as SPID)
3. Click **"Accedi con CIE"** to proceed to dashboard

### Test Credentials

**SPID Example:**
```
Nome: Mario
Cognome: Rossi
Codice Fiscale: RSSMRA80A01H501U
Email: mario.rossi@email.com
```

**CIE Example:**
```
Nome: Luigi
Cognome: Bianchi
Codice Fiscale: BNCLGU85B12H501K
Email: luigi.bianchi@email.com
```

## API Endpoints

### Authentication

**POST** `/api/auth/spid-login`
- Login with SPID credentials
- Body: `{ taxId, firstName, lastName, email }`
- Returns: `{ success, token, user }`

**POST** `/api/auth/cie-login`
- Login with CIE credentials
- Body: `{ taxId, firstName, lastName, email }`
- Returns: `{ success, token, user }`

**POST** `/api/auth/logout`
- Logout current user
- Returns: `{ success, message }`

### User Data

**GET** `/api/user/dashboard`
- Get current user dashboard data
- Headers: `Authorization: Bearer <token>`
- Returns: `{ success, data: { name, email, taxId, authMethod, vehicles, patents, documents } }`

### Health Check

**GET** `/api/health`
- Check backend status
- Returns: `{ status, timestamp }`

## Design Features

### Color Scheme
- **Primary Blue**: `#0066cc` - Main branding color
- **Primary Dark**: `#003d7a` - Navigation background
- **Accent Teal**: `#17a2b8` - Secondary elements
- **Accent Orange**: `#ff9900` - Highlights and CTAs
- **Dark Gray**: `#333` - Settings/Call center section

### Typography
- Font Family: Segoe UI, Tahoma, Geneva, Verdana, sans-serif
- Sizes: 12px-48px scale
- Italian language throughout

### Responsive Breakpoints
- Mobile: < 480px
- Tablet: 480px - 768px
- Desktop: > 768px

## Data Persistence

Currently uses in-memory storage for demonstration. For production:

### Database Integration
Replace mock storage with:
- **MongoDB**: For document-based user data
- **PostgreSQL**: For structured user profiles
- **Redis**: For session caching

### Example MongoDB Integration
```javascript
const User = mongoose.model('User', userSchema);
const user = new User({
  taxId: data.taxId,
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  authMethod: 'SPID'
});
await user.save();
```

## Security Considerations

### Development
- JWT secret in environment variables
- CORS enabled for localhost
- HTTP-only cookies for sessions

### Production Checklist
- [ ] Use HTTPS/TLS encryption
- [ ] Generate strong JWT secret
- [ ] Enable CORS only for trusted domains
- [ ] Implement rate limiting
- [ ] Add input validation and sanitization
- [ ] Use database instead of in-memory storage
- [ ] Implement actual SPID/CIE provider integration
- [ ] Add comprehensive error handling
- [ ] Enable security headers (HSTS, CSP, etc.)
- [ ] Regular security audits

## File Descriptions

### Backend

**server.js**
- Express.js application server
- SPID/CIE authentication endpoints
- JWT token generation and validation
- Session management
- CORS configuration

**package.json**
- Express.js framework
- JWT (jsonwebtoken) for tokens
- CORS support
- Session management
- UUID for user IDs

**.env**
- PORT configuration
- JWT_SECRET key
- NODE_ENV setting

### Frontend

**login.html**
- SPID/CIE login interface
- Form validation
- Authentication flow
- Error message display

**dashboard.html**
- User dashboard display
- Profile information
- Vehicles and documents
- Settings management
- Call center information

**css/login.css**
- Login page styling
- Responsive design
- Form styling
- Animation effects

**css/dashboard.css**
- Dashboard layout
- Card components
- Navigation styling
- Responsive grid system

**js/login.js**
- Form submission handling
- API communication
- Error handling
- Token storage
- Redirect logic

**js/dashboard.js**
- User data retrieval
- Authentication verification
- Navigation handling
- Logout functionality

## Common Issues & Solutions

### CORS Error
**Problem**: "Access to XMLHttpRequest blocked by CORS policy"
**Solution**: Ensure backend is running and CORS origins include your frontend URL

### Token Invalid
**Problem**: "Invalid token" message on dashboard
**Solution**: Clear localStorage and login again - token may have expired

### Backend Connection Failed
**Problem**: "Error di connessione" on login
**Solution**: 
1. Check backend is running on port 3000
2. Verify `http://localhost:3000/api/health` returns OK
3. Check firewall settings

### Codice Fiscale Validation
**Problem**: "Invalid SPID data structure"
**Solution**: Ensure Codice Fiscale is at least 6 characters (demo accepts flexible format)

## Testing

### Unit Testing Example
```bash
# Test SPID login endpoint
curl -X POST http://localhost:3000/api/auth/spid-login \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Mario",
    "lastName": "Rossi",
    "taxId": "RSSMRA80A01H501U",
    "email": "mario@example.com"
  }'
```

## Performance Optimization

- Lazy loading for images
- CSS minification ready
- Session timeouts (24 hours default)
- Efficient JWT validation
- Response caching headers

## Future Enhancements

1. **Multi-Factor Authentication (MFA)**
   - SMS verification codes
   - TOTP authenticator support

2. **OAuth Integration**
   - Google login
   - GitHub login
   - Facebook login

3. **Advanced Features**
   - Real-time notifications
   - Document management system
   - Payment integration
   - Appointment booking

4. **Admin Dashboard**
   - User management
   - Analytics and reporting
   - System logs

5. **Mobile App**
   - React Native/Flutter implementation
   - Push notifications
   - Offline support

## Documentation Links

- [SPID - Sistema Pubblico di Identità Digitale](https://www.spid.gov.it/)
- [CIE - Carta d'Identità Elettronica](https://www.cartaidentita.interno.gov.it/)
- [Express.js Documentation](https://expressjs.com/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

## License

Educational/Assignment Use - Italian Automotive Ministry Portal Clone

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review API endpoint documentation
3. Check browser console for errors
4. Verify backend is running and responding

## Version

- Version: 1.0.0
- Last Updated: 2024
- Status: Production Ready (Demo)

---

**Note**: This is an educational clone of the Italian automotive ministry portal. For official services, always use the real portal at https://www.ilportaledellautomobilista.it/
