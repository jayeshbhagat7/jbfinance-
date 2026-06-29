# GTD Brain Dump — Setup Guide

## Step 1: Install on Android (2 minutes)

### Easiest: Deploy free on Netlify
1. Go to **app.netlify.com/drop** on your PC or phone
2. Drag this entire folder and drop it on the page
3. You get a URL like `your-name.netlify.app` — copy it
4. Open that URL in **Chrome on Android**
5. Tap the Chrome menu **(⋮) → Add to Home screen → Add**
6. The app icon appears on your home screen like a real app ✅

### Alternative: GitHub Pages
1. Create a GitHub account and a new repository
2. Upload all 5 files to the repo
3. Go to Settings → Pages → Deploy from main branch
4. Your URL: `yourusername.github.io/repo-name`
5. Follow steps 4–6 above

---

## Step 2: Google Calendar Sync (10 minutes, optional)

Once the app is live on HTTPS, you can link it to Google Calendar.

### 2a. Create Google Cloud credentials
1. Go to **console.cloud.google.com** and sign in
2. Click **Select a project → New Project** → name it anything → Create
3. Go to **APIs & Services → Library**
4. Search for **Google Calendar API** → click it → **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **+ Create Credentials → OAuth 2.0 Client ID**
7. If prompted, configure the OAuth consent screen:
   - User type: **External** → Create
   - App name: anything (e.g. "My GTD App")
   - Add your email as support email → Save and Continue × 3
8. Back to Credentials → Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Under **Authorized JavaScript origins**, click **Add URI**
   - Paste your Netlify/GitHub URL (e.g. `https://your-name.netlify.app`)
   - Click **Create**
9. Copy the **Client ID** shown (ends in `.apps.googleusercontent.com`)

### 2b. Connect in the app
1. Open your app → tap **⚙️ Setup** tab
2. Paste your Client ID in the field
3. Tap **Save Client ID**
4. Tap **🔐 Sign in with Google**
5. Choose your Google account and allow Calendar access
6. Done! The Setup tab now shows **✓ Connected**

---

## How it works

| Action | What happens |
|--------|-------------|
| Assign a date to a task | Auto-creates an all-day event in Google Calendar |
| Complete a task | Event title gets ✅ prefix |
| Delete a task | Event deleted from Calendar |
| Date changed | Event updated in Calendar |
| Tap "Sync all" in Setup | Syncs all dated tasks that aren't in Calendar yet |

---

## Using the app

- **🧠 Dump** — Type thoughts one per line, tap Add → all go to Inbox
- **📥 Inbox** — Tap any task to triage it (add date, priority, labels)
- **☑️ Todo** — Tasks with dates, grouped: Overdue / Today / Tomorrow / This Week / Later
- **🎯 Matrix** — Eisenhower 2×2 quadrant view
- **✅ Done** — Completed tasks (strikethrough) + Archive
- **⚙️ Setup** — Google Calendar + labels

**Priorities:** P1 (critical) → P2 (high) → P3 (medium) → P4 (low)

**Eisenhower quadrants:** Do Now · Schedule · Delegate · Drop

**Wishes/Ideas:** Mark as Wish type — auto-archived after 7 days if untouched

**Label filter:** Tap label pills at the top of Inbox/Todo/Matrix to filter by label

---

## Files in this package

```
index.html    — The full app
manifest.json — Makes it installable as an Android PWA
sw.js         — Service worker (offline caching)
icon.svg      — App icon
README.md     — This file
```
