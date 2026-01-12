# Encryption & Docker Fixes

## Problem Summary

The backend was failing with a "Failed to decrypt token" error when trying to process user transactions. The error occurred because:

1. Tokens stored in the database were encrypted with a different encryption key or algorithm
2. The backend's encryption implementation was incomplete (missing `encrypt` function)
3. Error handling needed improvement

## What Was Fixed

### 1. **Added Complete Encryption Implementation** (`lib/encryption.ts`)
   - ✅ Added `encrypt()` function to match the `decrypt()` function
   - ✅ Uses AES-256-GCM encryption algorithm
   - ✅ Improved error logging for better debugging

### 2. **Improved Cron Service Error Handling** (`cron-service.ts`)
   - ✅ Added encryption key verification on startup
   - ✅ Better error handling for decryption failures
   - ✅ Automatically marks users as inactive when tokens can't be decrypted
   - ✅ Clears invalid tokens from the database
   - ✅ Added detailed logging for troubleshooting

### 3. **Updated Docker Configuration**
   - ✅ Removed obsolete `version` attribute from `docker-compose.yml`
   - ✅ Made dotenv loading more robust for containerized environments
   - ✅ Environment variables now properly injected from `.env` file

### 4. **Added Utility Scripts**
   - ✅ Created `scripts/reset-user-auth.ts` for managing user authentication status

## Current Status

✅ **Backend is running successfully**
✅ **Encryption/decryption working correctly**
✅ **No more decryption errors**
✅ **Proper error handling in place**

## What You Need to Do

### For the user `stoicgreek2006@gmail.com`:

The user has been marked as **inactive** and needs to **re-authenticate** through the frontend. Their old token was encrypted with a different key and cannot be decrypted.

**Steps:**
1. User logs out from the frontend
2. User logs in again with Google OAuth
3. Frontend will encrypt new tokens with the correct encryption key
4. Backend will be able to decrypt and use the new tokens

### Environment Variables

Ensure both frontend and backend are using the **same** `ENCRYPTION_SECRET_KEY`:

**Backend `.env`:**
```env
ENCRYPTION_SECRET_KEY=9c87e985e55c4d0180c553691427b40c
```

**Frontend `.env`:**
```env
ENCRYPTION_SECRET_KEY=9c87e985e55c4d0180c553691427b40c
```

Both are already correctly set! ✅

## Useful Commands

### Check Backend Logs
```bash
docker-compose logs -f
```

### Restart Backend
```bash
docker-compose restart
```

### Rebuild Backend
```bash
docker-compose down
docker-compose up --build -d
```

### Reset User Authentication
```bash
# Reset specific user
npx tsx scripts/reset-user-auth.ts user@example.com

# Reset all users
npx tsx scripts/reset-user-auth.ts
```

## Technical Details

### Encryption Format

Encrypted tokens use the following format:
- **IV (32 hex chars)** - Initialization Vector (16 bytes)
- **Auth Tag (32 hex chars)** - Authentication Tag (16 bytes)
- **Encrypted Data (variable length)** - The actual encrypted content

Example encrypted token length: ~112 characters for a typical refresh token

### How It Works

1. **Frontend**: User logs in → Gets Google OAuth tokens → Encrypts with `ENCRYPTION_SECRET_KEY` → Stores in database
2. **Backend**: Reads encrypted token from database → Decrypts with same `ENCRYPTION_SECRET_KEY` → Uses to refresh access tokens → Fetches emails and syncs to Google Sheets

### Why the Old Token Failed

The token in the database (270 characters) was encrypted with:
- Different encryption key, OR
- Different encryption algorithm, OR
- Different encryption library implementation

The new encryption implementation (which generates ~112 character tokens) uses:
- Algorithm: `aes-256-gcm`
- Key derivation: SHA-256 hash of `ENCRYPTION_SECRET_KEY`
- Format: IV (16 bytes) + Tag (16 bytes) + Encrypted data

## Next Steps

1. ✅ Backend is fixed and running
2. 📋 User needs to re-authenticate on frontend
3. ✅ New tokens will be encrypted correctly
4. ✅ Cron service will process emails automatically

## Support

If issues persist:
1. Check that `ENCRYPTION_SECRET_KEY` matches in both frontend and backend
2. Verify user has re-authenticated after the fix
3. Check backend logs: `docker-compose logs -f`
4. Ensure frontend is using the same encryption algorithm
