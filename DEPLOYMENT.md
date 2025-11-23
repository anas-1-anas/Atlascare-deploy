# Deployment Guide

This guide explains how to deploy the AtlasCare application with the backend on Koyeb and frontend on Vercel.

## Backend Deployment (Koyeb)

### Prerequisites
- Koyeb account
- All required environment variables

### Environment Variables for Koyeb

Set the following environment variables in your Koyeb service settings:

#### Required Variables
```
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=your-private-key
JWT_SECRET=your-jwt-secret-min-32-characters-long
NODE_ENV=production
```

#### Optional Variables
```
HEDERA_NETWORK=testnet
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com/api/v1
SIGNATURE_SALT=your-signature-salt
CNDP_SALT=your-cndp-salt
OTP_TTL_SECONDS=300
```

#### CORS Configuration
```
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com
```

**Important:** Replace `your-vercel-app.vercel.app` with your actual Vercel deployment URL. You can add multiple origins separated by commas.

### Deployment Steps

1. Connect your GitHub repository to Koyeb
2. Select the `backend` folder as the root directory
3. Set the build command: `npm install`
4. Set the start command: `npm start`
5. Configure all environment variables listed above
6. Deploy

### Backend URL
After deployment, Koyeb will provide a URL like:
```
https://your-app-name.koyeb.app
```

**Note:** The backend URL is already configured in the frontend code. If you need to change it, see the Frontend Configuration section below.

---

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account
- Backend deployed on Koyeb

### Environment Variables for Vercel

Set the following environment variable in your Vercel project settings:

```
VITE_API_URL=https://your-koyeb-backend-url.koyeb.app
```

**Important:** 
- Replace `your-koyeb-backend-url.koyeb.app` with your actual Koyeb backend URL
- The URL should NOT have a trailing slash
- If this variable is not set, the frontend will use the default Koyeb URL configured in the code

### Deployment Steps

1. Connect your GitHub repository to Vercel
2. Set the root directory to `frontend`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Install command: `npm install`
7. Add the `VITE_API_URL` environment variable
8. Deploy

### After Deployment

1. Get your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Update the `ALLOWED_ORIGINS` environment variable in Koyeb to include your Vercel URL:
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```
3. Redeploy the backend on Koyeb (or wait for automatic redeploy)

---

## Configuration Files

### Backend CORS Configuration

The backend CORS is configured in `backend/index.js` to:
- Allow origins specified in `ALLOWED_ORIGINS` environment variable
- Allow localhost in development mode
- Support credentials and common HTTP methods

### Frontend API Configuration

The frontend API base URL is configured in `frontend/src/utils/api.js`:
- Uses `VITE_API_URL` environment variable if set
- Falls back to default Koyeb URL in production
- Uses relative paths (Vite proxy) in development

---

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Verify `ALLOWED_ORIGINS` in Koyeb includes your Vercel URL
2. Ensure the URL matches exactly (including https://)
3. Check browser console for the exact origin being blocked
4. Redeploy backend after updating environment variables

### API Connection Errors

If the frontend cannot connect to the backend:
1. Verify `VITE_API_URL` is set correctly in Vercel
2. Check that the backend URL is accessible (try opening it in a browser)
3. Verify the backend is running and healthy
4. Check Vercel build logs for any errors

### Environment Variables Not Working

- Vite requires environment variables to be prefixed with `VITE_`
- After adding/changing environment variables in Vercel, you need to redeploy
- Environment variables are injected at build time, not runtime

---

## Testing the Deployment

1. **Backend Health Check:**
   - Visit: `https://your-koyeb-backend-url.koyeb.app/api/medicines`
   - Should return JSON array of medicines

2. **Frontend:**
   - Visit your Vercel URL
   - Try logging in
   - Verify API calls work in browser DevTools Network tab

3. **CORS:**
   - Open browser console
   - Should not see any CORS errors
   - API requests should succeed

---

## Current Configuration

- **Backend URL:** `https://certain-cathyleen-atlascare-deploy-eaa43123.koyeb.app`
- **Frontend:** Configured to use the backend URL above (or `VITE_API_URL` if set)

---

## Notes

- The Vite dev server proxy (`vite.config.js`) only works in development mode
- In production, all API calls use the configured backend URL
- The backend automatically handles CORS based on the `ALLOWED_ORIGINS` environment variable
- Both platforms support automatic deployments on git push

