# 🚀 DEPLOY AUTOMATIC CACHE EXPORT

## 📋 OVERVIEW

This Cloud Function automatically exports ALL noise readings to Firebase Storage **EVERY DAY at 2:00 AM UTC**.

**NO manual intervention needed!**

---

## 🔧 SETUP (ONE TIME ONLY)

### **Step 1: Install Dependencies**

```bash
cd functions
npm install
```

### **Step 2: Build Functions**

```bash
npm run build
```

### **Step 3: Deploy to Firebase**

```bash
firebase deploy --only functions:exportCacheDaily,functions:exportCacheWeekly
```

**That's it!** The function will now run automatically every day.

---

## ⏰ SCHEDULE

| Function | Schedule | Time Zone | Purpose |
|----------|----------|-----------|---------|
| **exportCacheDaily** | `0 2 * * *` | UTC | Daily export at 2:00 AM |
| **exportCacheWeekly** | `0 3 * * 1` | UTC | Weekly backup on Monday 3:00 AM |

---

## 📊 WHAT HAPPENS

### **Every Day at 2:00 AM UTC:**
```
1. Cloud Function wakes up automatically
2. Fetches ALL noise readings from Firestore
3. Creates cache JSON file
4. Uploads to Firebase Storage
5. Makes file available for download
6. Goes back to sleep
```

### **Users Experience:**
```
1. User opens map
2. Clicks "Download All Readings"
3. Gets latest cache (auto-updated daily)
4. Instant load forever
```

---

## 🔍 MONITORING

### **Check Function Logs:**
```bash
firebase functions:log --only exportCacheDaily
```

### **View in Firebase Console:**
1. Go to Firebase Console
2. Select your project
3. Click **Functions** in left sidebar
4. See `exportCacheDaily` and `exportCacheWeekly`
5. View logs, execution history, errors

---

## 💰 COST

**Cloud Functions Free Tier:**
- 2 million invocations/month FREE
- Your usage: 2 invocations/day = 60/month
- **Cost: $0.00** (well within free tier!)

**Storage Cost:**
- 10MB cache file
- Firebase Storage: 5GB FREE
- **Cost: $0.00**

---

## ✅ VERIFICATION

### **After Deployment:**

1. **Check Functions List:**
   ```bash
   firebase functions:list
   ```
   
   Should show:
   - `exportCacheDaily`
   - `exportCacheWeekly`

2. **Test Manual Invocation:**
   ```bash
   firebase functions:call exportCacheDaily
   ```

3. **Check Storage:**
   - Go to Firebase Console → Storage
   - Should see: `cache/noise-readings-master-cache.json`
   - Updated daily!

---

## 🔄 UPDATE CACHE MANUALLY (If Needed)

If you need to update cache immediately (don't wait for scheduled run):

```bash
firebase functions:call exportCacheDaily
```

Or via Firebase Console:
1. Go to Functions
2. Click `exportCacheDaily`
3. Click "Run function"

---

## 📝 SUMMARY

**Before (Manual):**
- ❌ Admin must remember to export weekly
- ❌ Easy to forget
- ❌ Data becomes stale

**After (Automatic):**
- ✅ Runs automatically every day
- ✅ Never forgets
- ✅ Data always fresh (max 1 day old)
- ✅ Zero maintenance!

---

## 🎯 NEXT STEPS

1. Deploy functions: `firebase deploy --only functions:exportCacheDaily,functions:exportCacheWeekly`
2. Test: `firebase functions:call exportCacheDaily`
3. Verify: Check Firebase Storage for cache file
4. Done! Never worry about cache again!
