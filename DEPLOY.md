# Deploy to GitHub

## 🚀 Quick Deploy

```bash
# 1. Create GitHub repository
gh repo create nstar --public --description "Streaming kernel loop system with policy enforcement"

# 2. Add remote and push
git remote add origin https://github.com/yourusername/nstar.git
git branch -M main
git push -u origin main

# 3. Set up GitHub Pages (optional)
gh api repos/:owner/:repo/pages -X POST -f source[branch]=main -f source[path]=/public
```

## 📋 Manual GitHub Setup

1. **Create Repository**
   - Go to https://github.com/new
   - Repository name: `nstar`
   - Description: "Streaming kernel loop system with policy enforcement"
   - Public repository
   - Don't initialize with README (we have one)

2. **Push Code**
   ```bash
   git remote add origin https://github.com/YOURUSERNAME/nstar.git
   git branch -M main
   git push -u origin main
   ```

3. **Configure Repository**
   - Add topics: `ai`, `streaming`, `kernel`, `policy`, `automation`
   - Enable Issues and Discussions
   - Set up GitHub Pages from `/public` folder (optional)

## 🔧 Repository Settings

### Branch Protection
```bash
# Protect main branch
gh api repos/:owner/:repo/branches/main/protection \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":[]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f restrictions=null
```

### Secrets (if needed)
```bash
# Add secrets for CI/CD
gh secret set OPENAI_API_KEY --body "your-api-key"
gh secret set DEPLOY_TOKEN --body "your-deploy-token"
```

### GitHub Actions (optional)
Create `.github/workflows/test.yml`:
```yaml
name: Test nstar
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
```

## 📊 Post-Deploy Checklist

- [ ] Repository created and code pushed
- [ ] README.md displays correctly
- [ ] All executable files have correct permissions
- [ ] Dependencies install correctly (`npm install`)
- [ ] Basic functionality works (`npm test`)
- [ ] Documentation is complete
- [ ] License is appropriate
- [ ] Topics and description are set
- [ ] Issues/Discussions enabled if desired

## 🌐 Sharing

Once deployed, share your repository:
- **GitHub URL**: `https://github.com/yourusername/nstar`
- **Clone command**: `git clone https://github.com/yourusername/nstar.git`
- **NPM install**: `npm install -g nstar` (if published to npm)

## 📈 Next Steps

1. **Add CI/CD**: GitHub Actions for testing
2. **Documentation**: Wiki or GitHub Pages
3. **Community**: Contributing guidelines, issue templates
4. **Releases**: Semantic versioning and release notes
5. **NPM Package**: Publish to npm registry
