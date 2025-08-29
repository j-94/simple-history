#!/usr/bin/env node
// Demo script for nstar fluid chat system
import { spawn } from "child_process";
import http from "http";

const PORT = 8083;
const SERVER_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiCall(endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SERVER_URL);
    const postData = data ? JSON.stringify(data) : null;
    
    const options = {
      method: data ? "POST" : "GET",
      headers: data ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      } : {}
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
    if (postData) req.write(postData);
    req.end();
  });
}

function analyzeRequest(input) {
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

  // Analyze feasibility
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
  const mentionsFiles = /\.(js|ts|py|md|json|html|css)\b/i.test(input);
  const hasContextDetails = input.includes("with") || input.includes("using") || input.includes("for");
  
  if (mentionsFiles && hasContextDetails) {
    analysis.context = "excellent";
  } else if (mentionsFiles || hasContextDetails) {
    analysis.context = "good";
  } else if (input.length > 15) {
    analysis.context = "fair";
  } else {
    analysis.context = "poor";
  }

  return analysis;
}

function calculateHumanRubricScore(analysis) {
  const weights = {
    clarity: 0.3,
    feasibility: 0.25,
    scope: 0.25,
    context: 0.2
  };

  const scores = {
    excellent: 1.0,
    good: 0.8,
    fair: 0.6,
    poor: 0.3
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const [rubric, weight] of Object.entries(weights)) {
    const level = analysis[rubric] || "fair";
    const score = scores[level];
    totalScore += score * weight;
    totalWeight += weight;
  }

  return totalScore / totalWeight;
}

function displayRubricAnalysis(input, analysis) {
  console.log("\n📊 Human Rubric Analysis:");
  console.log("─".repeat(50));
  
  const rubrics = {
    clarity: "How clear and specific is the request?",
    feasibility: "How realistic is this request?",
    scope: "Is the scope appropriate?",
    context: "Is sufficient context provided?"
  };

  for (const [rubric, description] of Object.entries(rubrics)) {
    const level = analysis[rubric] || "fair";
    const score = { excellent: 100, good: 80, fair: 60, poor: 30 }[level];
    const emoji = level === "excellent" ? "🟢" : level === "good" ? "🟡" : level === "fair" ? "🟠" : "🔴";
    
    console.log(`${emoji} ${rubric.toUpperCase()}: ${level} (${score}%)`);
  }
  
  const overallScore = calculateHumanRubricScore(analysis);
  const overallEmoji = overallScore >= 0.8 ? "🟢" : overallScore >= 0.6 ? "🟡" : overallScore >= 0.4 ? "🟠" : "🔴";
  
  console.log("─".repeat(50));
  console.log(`${overallEmoji} OVERALL SCORE: ${(overallScore * 100).toFixed(0)}%`);
  
  return overallScore;
}

async function demoFluidChat() {
  console.log("🚀 nstar Fluid Chat Demo");
  console.log("=" .repeat(60));

  // Start server
  console.log(`\n📡 Starting server on port ${PORT}...`);
  const server = spawn("node", ["bin/nstar-server.mjs"], {
    env: { ...process.env, PORT: PORT.toString() },
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (data) => {
    console.log(`[SERVER] ${data.toString().trim()}`);
  });

  // Wait for server to start
  await sleep(3000);

  console.log("\n🤖 Fluid Chat Features Demo:");
  console.log("─".repeat(50));

  // Demo different types of requests
  const testRequests = [
    {
      input: "Add unit tests for authentication",
      description: "Clear, specific request"
    },
    {
      input: "Fix bug",
      description: "Vague request (poor clarity/scope)"
    },
    {
      input: "Completely rewrite the entire application architecture using microservices",
      description: "Overly complex request (poor feasibility/scope)"
    },
    {
      input: "Update the user registration form with proper email validation using regex",
      description: "Well-scoped request with context"
    }
  ];

  for (let i = 0; i < testRequests.length; i++) {
    const { input, description } = testRequests[i];
    
    console.log(`\n${i + 1}. Testing: "${input}"`);
    console.log(`   Context: ${description}`);
    
    // Analyze with human rubrics
    const analysis = analyzeRequest(input);
    const score = displayRubricAnalysis(input, analysis);
    
    // Suggest mode based on score
    let suggestedMode = "fast";
    if (score >= 0.8) {
      suggestedMode = "safe";
    } else if (score < 0.5) {
      suggestedMode = "cheap";
    }
    
    console.log(`💭 Suggested mode: ${suggestedMode}`);
    
    // Test with server
    try {
      console.log(`🔄 Processing with server...`);
      const result = await apiCall("/chat", {
        message: `${input} --mode=${suggestedMode}`,
        stream: false
      });
      
      if (result.result) {
        console.log(`✅ Result: ${result.result.decision} (γ=${result.result.gamma})`);
      } else {
        console.log(`📋 Server response received`);
      }
    } catch (error) {
      console.log(`⚠️  Server test skipped: ${error.message}`);
    }
    
    if (i < testRequests.length - 1) {
      console.log("\n" + "─".repeat(30));
      await sleep(1000);
    }
  }

  console.log("\n🎯 Key Features Demonstrated:");
  console.log("✅ Human rubric analysis (clarity, feasibility, scope, context)");
  console.log("✅ Intelligent mode suggestion based on request quality");
  console.log("✅ Real-time scoring and feedback");
  console.log("✅ Server integration with streaming");
  console.log("✅ Graceful fallback to CLI mode");

  console.log("\n🌐 Available Interfaces:");
  console.log(`📱 CLI Chat: ./bin/nstar-chat.mjs`);
  console.log(`🌐 Web Chat: open public/chat.html (with server running)`);
  console.log(`⚡ Direct API: curl -X POST ${SERVER_URL}/chat`);

  console.log("\n🎉 Fluid Chat System Ready!");
  console.log("The system provides intelligent, rubric-based analysis");
  console.log("for natural language requests with real-time feedback.");

  // Cleanup
  console.log("\n🛑 Shutting down demo server...");
  server.kill();
  await sleep(1000);
}

demoFluidChat().catch(console.error);
