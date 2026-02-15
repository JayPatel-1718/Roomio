---
description: How to deploy the Rooomio web app to Vercel
---

### Option 1: Using the Vercel CLI (Fastest)

1. **Install Vercel CLI** (if you haven't):
   ```bash
   npm install -g vercel
   ```

2. **Login**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   Run the following command in your project root:
   ```bash
   vercel
   ```
   *   **Set up and deploy?** Yes
   *   **Which scope?** [Your Name]
   *   **Link to existing project?** No
   *   **Project name?** rooomio
   *   **Which directory?** ./
   *   **Want to modify settings?** **Yes**
       *   **Build Command:** `npx expo export -p web`
       *   **Output Directory:** `dist`

### Option 2: Using GitHub (Recommended)

1. **Push your code to GitHub**.
2. Go to [vercel.com](https://vercel.com) and click **"Add New" -> "Project"**.
3. Import your repository.
4. In the **Build & Development Settings**:
   *   **Framework Preset:** Other
   *   **Build Command:** `npx expo export -p web`
   *   **Output Directory:** `dist`
5. Click **Deploy**.

### Routing Tip
The `vercel.json` file I created handles "Deep Linking". This means if you refresh the page while on `/dashboard`, it won't show a 404 error; it will correctly reload the app.
