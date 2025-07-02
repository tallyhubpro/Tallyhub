# GitHub Repository Setup Guide

This guide will help you move the Tally Hub project to `https://github.com/tallyhubpro/Tallyhub` and set up GitHub Pages.

## 🚀 **Repository Setup Steps**

### 1. **Create the Repository**
- Go to [GitHub](https://github.com)
- Create organization account: `tallyhubpro`
- Create repository: `Tallyhub`
- Make it public (required for free GitHub Pages)

### 2. **Initialize Local Git Repository**

```bash
# Navigate to your project directory
cd "/Users/prince/Projects/Tally hub"

# Initialize git if not already done
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Tally Hub documentation and project files"

# Add the GitHub repository as origin
git remote add origin https://github.com/tallyhubpro/Tallyhub.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. **Enable GitHub Pages**

1. Go to repository: `https://github.com/tallyhubpro/Tallyhub`
2. Click **Settings** tab
3. Scroll to **Pages** section in left sidebar
4. Under **Source**, select **GitHub Actions**
5. Save the configuration

### 4. **Configure Custom Domain (Optional)**

If you own `tallyhub.pro` domain:

1. In GitHub repository settings → Pages
2. Add custom domain: `tallyhub.pro`
3. Check "Enforce HTTPS"
4. Configure DNS at your domain registrar:
   ```
   Type: CNAME
   Name: @ (or www)
   Value: tallyhubpro.github.io
   ```

## 🌐 **Your Documentation URLs**

After setup, your documentation will be available at:

- **GitHub Pages**: `https://tallyhubpro.github.io`
- **Custom Domain**: `https://tallyhub.pro` (if configured)

## 📝 **GitHub Actions Workflow**

The `.github/workflows/deploy-docs.yml` file is already configured to:

- ✅ Auto-build documentation on every push to `main`
- ✅ Deploy to GitHub Pages automatically
- ✅ Support for MkDocs Material theme
- ✅ Install all required dependencies

## 🔧 **Repository Structure**

```
Tallyhub/
├── .github/
│   └── workflows/
│       └── deploy-docs.yml     # Auto-deployment
├── docs/                       # Documentation source
│   ├── assets/                 # Images, logos, icons
│   ├── index.md               # Homepage
│   ├── features.md            # Features page
│   └── ...                    # Other documentation
├── firmware/                   # ESP32/M5Stick firmware
├── src/                       # Tally Hub server code
├── public/                    # Web interface files
├── mkdocs.yml                 # Documentation configuration
├── package.json               # Node.js dependencies
└── README.md                  # Project README
```

## 🎯 **Next Steps**

1. **Create the repository** on GitHub
2. **Push your code** using the commands above
3. **Enable GitHub Pages** in repository settings
4. **Wait for deployment** (usually takes 2-5 minutes)
5. **Visit your documentation** at the GitHub Pages URL

## 🛠️ **Development Workflow**

For future updates:

```bash
# Make changes to documentation or code
git add .
git commit -m "Update documentation"
git push origin main
```

GitHub Actions will automatically rebuild and deploy your documentation!

## 📋 **Checklist**

- [ ] Create `tallyhubpro` GitHub organization
- [ ] Create `Tallyhub` repository
- [ ] Push code to GitHub
- [ ] Enable GitHub Pages with GitHub Actions
- [ ] Verify documentation deployment
- [ ] (Optional) Configure custom domain
- [ ] Update README.md with correct links

---

**Need help?** Check the [GitHub Pages documentation](https://docs.github.com/en/pages) or [GitHub Actions guide](https://docs.github.com/en/actions).
