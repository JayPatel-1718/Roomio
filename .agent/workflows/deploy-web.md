---
description: How to build and deploy updates to the Rooomio web app on Firebase
---

### Prerequisites
1. Ensure you have the `firebase-tools` installed: `npm install -g firebase-tools`
2. Ensure you are logged in: `firebase login`

### Steps to Deploy Updates

1. **Build the Web Project**
   This command optimizes your project and creates a `dist` folder:
   ```bash
   npm run build:web
   ```

2. **Deploy to Firebase**
   This command uploads the `dist` folder to Firebase Hosting:
   ```bash
   firebase deploy --only hosting
   ```

### Shortcut Command
You can run both steps at once using the pre-configured script:
```bash
npm run deploy:web
```

### Verification
Once the command finishes, it will provide a **Hosting URL** (e.g., `https://roomio.web.app`). Open this in your browser and press `Ctrl + F5` (Hard Refresh) to see the latest changes.
