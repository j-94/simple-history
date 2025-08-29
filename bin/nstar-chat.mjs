#!/usr/bin/env node
// nstar-chat: Fluid conversational interface with human rubric integration
import fs from "fs";
import path from "path";
import readline from "readline";
import { EventSource } from "eventsource";
import http from "http";
import { appendTrace } from "../lib/ledger.mjs";
import { gammaScore, gammaThreshold } from "../lib/policy.mjs";

const ROOT = process.cwd();
const SERVER_URL = process.env.NSTAR_SERVER || "http://localhost:8080";
const r = (...p) => path.join(ROOT, ...p);

class FluidChat {
  constructor() {
    this.conversationHistory = [];
    this.contextRefs = [];
    this.currentMode = "fast";
    this.streamingEnabled = true;
    this.eventSource = null;
    this.rl = null;
    this.serverRunning = false;
    this.rubrics = this.loadRubrics();
  }

  loadRubrics() {
    return {
      clarity: {
        weight: 0.3,
        description: "How clear and specific is the request?",
        levels: {
          excellent: { score: 1.0, desc: "Crystal clear, actionable request" },
          good: { score: 0.8, desc: "Clear with minor ambiguity" },
          fair: { score: 0.6, desc: "Somewhat vague but workable" },
          poor: { score: 0.3, desc: "Very unclear or confusing" }
        }
      },
      feasibility: {
        weight: 0.25,
        description: "How realistic is this request?",
        levels: {
          excellent: { score: 1.0, desc: "Easily achievable" },
          good: { score: 0.8, desc: "Achievable with effort" },
          fair: { score: 0.6, desc: "Challenging but possible" },
          poor: { score: 0.3, desc: "Very difficult or impossible" }
        }
      },
      scope: {
        weight: 0.25,
        description: "Is the scope appropriate?",
        levels: {
          excellent: { score: 1.0, desc: "Perfect scope - not too big or small" },
          good: { score: 0.8, desc: "Good scope with minor adjustments needed" },
          fair: { score: 0.6, desc: "Scope needs refinement" },
          poor: { score: 0.3, desc: "Scope too large or too small" }
        }
      },
      context: {
        weight: 0.2,
        description: "Is sufficient context provided?",
        levels: {
          excellent: { score: 1.0, desc: "Perfect context provided" },
          good: { score: 0.8, desc: "Good context, minor gaps" },
          fair: { score: 0.6, desc: "Some context missing" },
          poor: { score: 0.3, desc: "Insufficient context" }
        }
      }
    };
  }

  async checkServerHealth() {
    try {
      const response = await this.apiCall("/status");
      this.serverRunning = response && response.server === "nstar-server";
      return this.serverRunning;
    } catch {
      this.serverRunning = false;
      return false;
    }
  }

  async apiCall(endpoint, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, SERVER_URL);
      const postData = data ? JSON.stringify(data) : null;
      
      const options = {
        method: data ? "POST" : "GET",
        headers: data ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        } : {},
        timeout: 5000
      };

      const req = http.request(url, options, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            resolve(result);
          } catch (e) {
            resolve({ raw: body });
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => reject(new Error("Request timeout")));
      if (postData) req.write(postData);
      req.end();
    });
  }

  startStreaming() {
    if (!this.streamingEnabled || this.eventSource) return;

    try {
      this.eventSource = new EventSource(`${SERVER_URL}/stream`);
      
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleStreamMessage(data);
        } catch (e) {
          // Ignore parsing errors for now
        }
      };

      this.eventSource.onerror = () => {
        // Silently handle stream errors
        this.eventSource = null;
      };
    } catch {
      // Streaming not available
      this.streamingEnabled = false;
    }
  }

  handleStreamMessage(message) {
    const { type, data } = message;
    
    switch (type) {
      case "job_start":
        this.displayStreamUpdate(`🚀 Starting: ${data.goal}`);
        break;
      case "job_complete":
        if (data.result?.decision) {
          this.displayStreamUpdate(`✅ ${data.result.decision} (γ=${data.result.gamma})`);
        }
        break;
      case "trace":
        if (data.phase === "gate" && data.step === "gamma") {
          const status = data.ok ? "✅" : "❌";
          this.displayStreamUpdate(`📊 Quality Gate: ${status} ${data.note}`);
        }
        break;
    }
  }

  displayStreamUpdate(message) {
    // Clear current line and show update
    process.stdout.write(`\r\x1b[K${message}\n`);
    this.showPrompt();
  }

  analyzeRequest(input) {
    const analysis = {};
    
    // Analyze clarity
    const hasSpecificAction = /\b(add|create|implement|fix|update|remove|test)\b/i.test(input);
    const hasDetails = input.length > 20 && input.includes(" ");
    if (hasSpecificAction && hasDetails) {
      analysis.clarity = "excellent";
    } else if (hasSpecificAction) {
      analysis.clarity = "good";
    } else if (input.length > 10) {
      analysis.clarity = "fair";
    } else {
      analysis.clarity = "poor";
    }

    // Analyze feasibility (simple heuristics)
    const complexWords = /\b(refactor|migrate|rewrite|overhaul|complete)\b/i.test(input);
    const simpleWords = /\b(fix|add|update|test|document)\b/i.test(input);
    if (simpleWords && !complexWords) {
      analysis.feasibility = "excellent";
    } else if (simpleWords) {
      analysis.feasibility = "good";
    } else if (!complexWords) {
      analysis.feasibility = "fair";
    } else {
      analysis.feasibility = "poor";
    }

    // Analyze scope
    const wordCount = input.split(/\s+/).length;
    if (wordCount >= 5 && wordCount <= 15) {
      analysis.scope = "excellent";
    } else if (wordCount >= 3 && wordCount <= 20) {
      analysis.scope = "good";
    } else if (wordCount >= 2) {
      analysis.scope = "fair";
    } else {
      analysis.scope = "poor";
    }

    // Analyze context
    const hasContext = this.contextRefs.length > 0;
    const mentionsFiles = /\.(js|ts|py|md|json|html|css)\b/i.test(input);
    const hasDetails = input.includes("with") || input.includes("using") || input.includes("for");
    
    if (hasContext && (mentionsFiles || hasDetails)) {
      analysis.context = "excellent";
    } else if (hasContext || mentionsFiles || hasDetails) {
      analysis.context = "good";
    } else if (input.length > 15) {
      analysis.context = "fair";
    } else {
      analysis.context = "poor";
    }

    return analysis;
  }

  calculateHumanRubricScore(analysis) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [rubric, config] of Object.entries(this.rubrics)) {
      const level = analysis[rubric] || "fair";
      const score = config.levels[level].score;
      totalScore += score * config.weight;
      totalWeight += config.weight;
    }

    return totalScore / totalWeight;
  }

  displayRubricAnalysis(input, analysis) {
    console.log("\n📊 Human Rubric Analysis:");
    console.log("─".repeat(50));
    
    for (const [rubric, config] of Object.entries(this.rubrics)) {
      const level = analysis[rubric] || "fair";
      const levelInfo = config.levels[level];
      const emoji = level === "excellent" ? "🟢" : level === "good" ? "🟡" : level === "fair" ? "🟠" : "🔴";
      
      console.log(`${emoji} ${rubric.toUpperCase()}: ${level} (${(levelInfo.score * 100).toFixed(0)}%)`);
      console.log(`   ${levelInfo.desc}`);
    }
    
    const overallScore = this.calculateHumanRubricScore(analysis);
    const overallEmoji = overallScore >= 0.8 ? "🟢" : overallScore >= 0.6 ? "🟡" : overallScore >= 0.4 ? "🟠" : "🔴";
    
    console.log("─".repeat(50));
    console.log(`${overallEmoji} OVERALL SCORE: ${(overallScore * 100).toFixed(0)}%`);
    
    // Suggest improvements
    if (overallScore < 0.8) {
      console.log("\n💡 Suggestions for improvement:");
      for (const [rubric, config] of Object.entries(this.rubrics)) {
        const level = analysis[rubric];
        if (level === "poor" || level === "fair") {
          console.log(`   • ${config.description}`);
        }
      }
    }
    
    console.log();
    return overallScore;
  }

  suggestMode(humanScore, input) {
    const hasUrgentWords = /\b(urgent|asap|quickly|fast|now)\b/i.test(input);
    const hasSafeWords = /\b(careful|safe|production|critical|important)\b/i.test(input);
    const hasCheapWords = /\b(simple|quick|small|minor|cheap)\b/i.test(input);

    let suggestedMode = "fast"; // default

    if (hasSafeWords || humanScore >= 0.8) {
      suggestedMode = "safe";
    } else if (hasCheapWords || humanScore < 0.5) {
      suggestedMode = "cheap";
    } else if (hasUrgentWords) {
      suggestedMode = "fast";
    }

    if (suggestedMode !== this.currentMode) {
      console.log(`💭 Suggested mode: ${suggestedMode} (currently: ${this.currentMode})`);
      return suggestedMode;
    }

    return this.currentMode;
  }

  async processMessage(input) {
    // Add to conversation history
    this.conversationHistory.push({ role: "user", content: input, timestamp: new Date().toISOString() });

    // Analyze with human rubrics
    const analysis = this.analyzeRequest(input);
    const humanScore = this.displayRubricAnalysis(input, analysis);
    
    // Suggest optimal mode
    const suggestedMode = this.suggestMode(humanScore, input);
    
    // Check if user wants to change mode
    if (suggestedMode !== this.currentMode) {
      const answer = await this.askQuestion(`Switch to ${suggestedMode} mode? (y/n): `);
      if (answer.toLowerCase().startsWith('y')) {
        this.currentMode = suggestedMode;
        console.log(`✅ Switched to ${this.currentMode} mode`);
      }
    }

    // Process the request
    if (this.serverRunning) {
      await this.processWithServer(input, humanScore);
    } else {
      await this.processWithCLI(input, humanScore);
    }

    // Add response to history
    this.conversationHistory.push({ 
      role: "assistant", 
      content: "Task processed", 
      timestamp: new Date().toISOString(),
      humanScore,
      mode: this.currentMode
    });
  }

  async processWithServer(input, humanScore) {
    console.log(`🚀 Processing with server (${this.currentMode} mode)...`);
    
    try {
      const result = await this.apiCall("/chat", {
        message: `${input} --mode=${this.currentMode}`,
        context: this.contextRefs,
        stream: this.streamingEnabled
      });

      if (result.result) {
        console.log(`✅ Result: ${result.result.decision} (γ=${result.result.gamma})`);
        if (result.result.ctxRefs?.length > 0) {
          console.log(`📎 Context used: ${result.result.ctxRefs.join(", ")}`);
        }
      }
    } catch (error) {
      console.log(`❌ Server error: ${error.message}`);
      console.log("🔄 Falling back to CLI mode...");
      await this.processWithCLI(input, humanScore);
    }
  }

  async processWithCLI(input, humanScore) {
    console.log(`🔧 Processing with CLI (${this.currentMode} mode)...`);
    
    // Use CLI directly
    const { spawn } = await import("child_process");
    const args = ["run", `--goal=${input}`, `--mode=${this.currentMode}`];
    
    if (this.contextRefs.length > 0) {
      args.push(`--ctx=${this.contextRefs.join(",")}`);
    }

    const child = spawn("node", [r("bin/nstar.mjs"), ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      try {
        const result = JSON.parse(output.trim());
        console.log(`✅ Result: ${result.decision} (γ=${result.gamma})`);
        if (result.ctxRefs?.length > 0) {
          console.log(`📎 Context used: ${result.ctxRefs.join(", ")}`);
        }
      } catch {
        console.log(`📋 Raw output: ${output.trim()}`);
      }
    });
  }

  async askQuestion(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  showPrompt() {
    const modeEmoji = this.currentMode === "safe" ? "🛡️" : this.currentMode === "fast" ? "⚡" : "💰";
    const serverStatus = this.serverRunning ? "🟢" : "🔴";
    process.stdout.write(`\n${modeEmoji} nstar (${this.currentMode}) ${serverStatus} > `);
  }

  async handleSpecialCommands(input) {
    const cmd = input.toLowerCase().trim();

    if (cmd === "/help" || cmd === "help") {
      this.showHelp();
      return true;
    }

    if (cmd === "/mode") {
      const modes = ["safe", "fast", "cheap"];
      console.log(`Current mode: ${this.currentMode}`);
      console.log("Available modes:", modes.join(", "));
      const newMode = await this.askQuestion("Enter new mode: ");
      if (modes.includes(newMode.toLowerCase())) {
        this.currentMode = newMode.toLowerCase();
        console.log(`✅ Switched to ${this.currentMode} mode`);
      }
      return true;
    }

    if (cmd === "/context") {
      if (this.contextRefs.length === 0) {
        console.log("No context references loaded");
      } else {
        console.log("Current context references:");
        this.contextRefs.forEach((ref, i) => console.log(`  ${i+1}. ${ref}`));
      }
      return true;
    }

    if (cmd.startsWith("/paste")) {
      const text = await this.askQuestion("Enter text to paste (or press Enter to use clipboard): ");
      if (text.trim()) {
        const result = await this.pasteText(text);
        if (result) {
          this.contextRefs.push(result.ref);
          console.log(`✅ Added context: ${result.ref}`);
        }
      }
      return true;
    }

    if (cmd === "/history") {
      console.log("\nConversation History:");
      this.conversationHistory.slice(-5).forEach((msg, i) => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        console.log(`${i+1}. [${time}] ${msg.role}: ${msg.content.slice(0, 60)}...`);
      });
      return true;
    }

    if (cmd === "/clear") {
      console.clear();
      console.log("🧹 Chat cleared");
      return true;
    }

    if (cmd === "/quit" || cmd === "/exit") {
      console.log("👋 Goodbye!");
      process.exit(0);
    }

    return false;
  }

  async pasteText(text) {
    if (this.serverRunning) {
      try {
        return await this.apiCall("/paste", { text });
      } catch {
        // Fall back to CLI paste
      }
    }

    // CLI paste fallback
    const crypto = await import("crypto");
    const id = crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
    const pastePath = r("assets/paste", `${id}.md`);
    
    fs.mkdirSync(path.dirname(pastePath), { recursive: true });
    fs.writeFileSync(pastePath, text);
    
    return {
      id,
      ref: `ctx://paste/${id}`,
      path: pastePath
    };
  }

  showHelp() {
    console.log(`
🤖 nstar Fluid Chat - Help

CHAT COMMANDS:
  Just type naturally! The system will analyze your request with human rubrics.

SPECIAL COMMANDS:
  /help      - Show this help
  /mode      - Change execution mode (safe/fast/cheap)
  /context   - Show current context references
  /paste     - Add context from text input
  /history   - Show recent conversation
  /clear     - Clear the screen
  /quit      - Exit chat

HUMAN RUBRICS:
  📊 Clarity     - How clear and specific is your request?
  🎯 Feasibility - How realistic is this request?
  📏 Scope       - Is the scope appropriate?
  📝 Context     - Is sufficient context provided?

MODES:
  🛡️  safe  - High quality threshold (γ ≥ 0.6)
  ⚡ fast  - Balanced approach (γ ≥ 0.5)
  💰 cheap - Cost efficient (γ ≥ 0.4)

EXAMPLES:
  "Add unit tests for the authentication module"
  "Fix the bug in user registration with proper error handling"
  "Create a simple README with installation instructions"
`);
  }

  async start() {
    console.log("🚀 Starting nstar Fluid Chat...");
    
    // Check server health
    await this.checkServerHealth();
    
    if (this.serverRunning) {
      console.log("✅ Connected to nstar server");
      this.startStreaming();
    } else {
      console.log("⚠️  Server not available, using CLI mode");
    }

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ""
    });

    console.log(`
🤖 Welcome to nstar Fluid Chat!

This is an intelligent conversational interface with human rubric analysis.
Type naturally, and the system will analyze your requests for clarity, feasibility, scope, and context.

Type '/help' for commands or just start chatting!
`);

    this.showPrompt();

    this.rl.on("line", async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        this.showPrompt();
        return;
      }

      // Handle special commands
      if (await this.handleSpecialCommands(trimmed)) {
        this.showPrompt();
        return;
      }

      // Process regular message
      try {
        await this.processMessage(trimmed);
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }

      this.showPrompt();
    });

    this.rl.on("close", () => {
      if (this.eventSource) {
        this.eventSource.close();
      }
      console.log("\n👋 Chat session ended");
      process.exit(0);
    });
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const chat = new FluidChat();
  chat.start().catch(console.error);
}
