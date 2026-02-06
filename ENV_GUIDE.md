# 🎯 RepoScope - Environment Variables Guide

## ✅ Your Current Setup

Your `.env` file is now configured with the following:

### 1️⃣ **DATABASE_URL** ✅ (ALREADY SET)

```
DATABASE_URL="postgresql://neondb_owner:npg_4WATF8KtODeE@..."
```

- **Status**: ✅ Ready to use
- **Purpose**: Stores user accounts and repository analysis results
- **What it does**: Connects to your Neon PostgreSQL database

---

### 2️⃣ **SESSION_SECRET** ✅ (ALREADY SET)

```
SESSION_SECRET=JAGSmoonDrop27
```

- **Status**: ✅ Working, but should be changed
- **Purpose**: Signs JWT tokens for user authentication
- **Security Note**: ⚠️ Change this to something more secure and random!
- **Example**: `SESSION_SECRET=my-super-secret-random-key-$(date +%s)`

---

### 3️⃣ **GEMINI_API_KEY** ✅ (ALREADY SET)

```
GEMINI_API_KEY=AIzaSyCO3phLq2xfKp9suok3k2ZieIBc0GRxOvM
```

- **Status**: ✅ Ready to use
- **Purpose**: Powers the AI analysis of GitHub repositories
- **What it does**: Calls Google Gemini to analyze code architecture
- **Get your own**: https://aistudio.google.com/apikey (it's free!)

---

### 4️⃣ **PORT** ✅ (SET)

```
PORT=5000
```

- **Status**: ✅ Perfect
- **Purpose**: Server port number
- **Default**: 5000 if not specified

---

### 5️⃣ **NODE_ENV** ✅ (SET)

```
NODE_ENV=development
```

- **Status**: ✅ Correct for local development
- **Purpose**: Determines if Vite dev server runs or production build
- **Change to**: `production` when deploying

---

## 🚀 Replit-Specific Variables (OPTIONAL)

These are **ONLY needed if running on Replit.com** and are auto-provided by Replit:

### **REPLIT_CONNECTORS_HOSTNAME** (commented out)

- **Status**: ⚠️ Only needed on Replit
- **Purpose**: Used for GitHub OAuth connector via Replit's service
- **If running locally**: You don't need this

### **REPL_IDENTITY** (commented out)

- **Status**: ⚠️ Only needed on Replit
- **Purpose**: Replit authentication token
- **If running locally**: You don't need this

### **WEB_REPL_RENEWAL** (commented out)

- **Status**: ⚠️ Only needed on Replit deployments
- **Purpose**: Deployment authentication
- **If running locally**: You don't need this

### **AI_INTEGRATIONS_GEMINI_API_KEY** (SET to same as GEMINI_API_KEY)

- **Status**: ✅ Set to your Gemini key
- **Purpose**: Used by `server/replit_integrations/image/client.ts` for image generation
- **Note**: This is redundant with your main GEMINI_API_KEY, but keeping it set doesn't hurt

---

## 📝 Summary

### ✅ **You're Good to Go!**

Your app should work with the current setup. Here's what you have:

| Variable         | Status     | Required?   | Purpose                           |
| ---------------- | ---------- | ----------- | --------------------------------- |
| `DATABASE_URL`   | ✅ Set     | ✅ Yes      | Database connection               |
| `SESSION_SECRET` | ✅ Set     | ✅ Yes      | JWT auth (change to secure value) |
| `GEMINI_API_KEY` | ✅ Set     | ✅ Yes      | AI analysis                       |
| `PORT`           | ✅ Set     | ⚪ Optional | Server port (defaults to 5000)    |
| `NODE_ENV`       | ✅ Set     | ⚪ Optional | Dev/Prod mode                     |
| `REPLIT_*`       | ❌ Not set | ⚪ Optional | Only for Replit.com               |

---

## 🎮 Next Steps

1. **Test your app**:

   ```bash
   npm run dev
   ```

2. **Make SESSION_SECRET more secure** (recommended):
   - Change it to a long random string
   - Example: `SESSION_SECRET=your-super-secret-key-$(openssl rand -hex 32)`

3. **If GitHub connector fails**:
   - The app needs Replit-specific env vars OR you need to modify `server/github.ts` to use a personal GitHub token instead
   - On Replit, these are auto-provided
   - Locally, you might need to create a GitHub Personal Access Token

---

## 🐛 Troubleshooting

### Error: "GEMINI_API_KEY is not configured"

- Check that `GEMINI_API_KEY` is set in `.env`
- Restart your dev server after changing `.env`

### Error: "GitHub not connected"

- This means Replit connector vars are missing
- **If on Replit**: Make sure GitHub connector is set up in Replit secrets
- **If running locally**: You'll need to modify the GitHub integration or use Replit

### Database connection errors

- Verify your `DATABASE_URL` is correct
- Check that your Neon database is running
- Run: `npm run db:push` to sync the schema

---

## 🔒 Security Reminders

1. **Never commit `.env` to git** - it contains secrets!
2. **Change SESSION_SECRET** to something random and secure
3. **Rotate your GEMINI_API_KEY** if it gets exposed
4. **Keep DATABASE_URL private** - it has your database password

---

**You're all set! Your app should work now.** 🎉
