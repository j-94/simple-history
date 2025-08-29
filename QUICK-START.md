# 🚀 nstar Quick Start - No Build Errors

If you're getting build errors, use the simple version:

## ✅ GUARANTEED TO WORK:

```bash
cd /tmp/nstar-demo

# Simple version (no dependencies)
./nstar-simple run "Add unit tests"
./nstar-simple chat
./nstar-simple status

# OR full version
./nstar run "Add unit tests"
./nstar chat
./nstar status
```

## 🔧 TROUBLESHOOTING:

### If you get permission errors:
```bash
chmod +x nstar nstar-simple bin/*.mjs
```

### If you get module errors:
```bash
npm install
```

### If you get path errors:
```bash
cd /tmp/nstar-demo
pwd  # Should show /tmp/nstar-demo
```

### If nothing works, use direct commands:
```bash
# Direct CLI usage
node bin/nstar.mjs run --goal="Add tests" --mode=fast

# Direct server
node bin/nstar-server.mjs

# Direct chat
node bin/nstar-chat.mjs
```

## 📱 MINIMAL WORKING COMMANDS:

```bash
# 1. Basic task
node bin/nstar.mjs run --goal="Your task here"

# 2. Add context
echo "Your context" | node bin/nstar.mjs paste

# 3. Start server
node bin/nstar-server.mjs
```

## ✅ WHAT SHOULD WORK:

- ✅ `./nstar-simple run "task"` - Always works
- ✅ `node bin/nstar.mjs run --goal="task"` - Direct node call
- ✅ Basic CLI functionality
- ✅ Context management
- ✅ Policy enforcement

## ❌ WHAT MIGHT FAIL:

- ❌ Web interface (needs server)
- ❌ Streaming features (needs EventSource)
- ❌ Complex chat (needs dependencies)

**Use `./nstar-simple` for guaranteed functionality!**
