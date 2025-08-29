#!/usr/bin/env node
// nstar as simple orchestrator loop with task graph and events

import { Orchestrator } from './orchestrator.mjs';
import fs from 'fs';
import { execSync } from 'child_process';

class NstarOrchestrator extends Orchestrator {
  constructor(goal, mode = 'fast') {
    super();
    this.goal = goal;
    this.mode = mode;
    this.context = [];
    this.setupTasks();
  }

  setupTasks() {
    // Define the nstar workflow as a task graph
    
    this.addTask('parse_goal', async () => {
      return {
        goal: this.goal,
        mode: this.mode,
        parsed: true
      };
    });

    this.addTask('load_context', async () => {
      // Load any context references
      return { context: this.context };
    }, ['parse_goal']);

    this.addTask('plan', async () => {
      // Generate plan based on goal
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate planning
      return {
        plan: `Plan for: ${this.goal}`,
        steps: ['analyze', 'implement', 'test'],
        confidence: 0.8
      };
    }, ['load_context']);

    this.addTask('generate_patch', async () => {
      // Generate code changes
      await new Promise(resolve => setTimeout(resolve, 200)); // Simulate generation
      return {
        patch: `// Generated code for: ${this.goal}\nconsole.log('Task completed');`,
        files: ['example.js']
      };
    }, ['plan']);

    this.addTask('validate_patch', async () => {
      // Validate the generated patch
      return {
        valid: true,
        issues: [],
        gamma: 0.75
      };
    }, ['generate_patch']);

    this.addTask('apply_patch', async () => {
      // Apply the patch (simulate)
      return {
        applied: true,
        files_changed: 1
      };
    }, ['validate_patch']);

    this.addTask('test', async () => {
      // Run tests
      return {
        tests_passed: true,
        coverage: 85
      };
    }, ['apply_patch']);

    this.addTask('decide', async () => {
      // Make final decision based on all results
      const threshold = this.mode === 'safe' ? 0.6 : this.mode === 'fast' ? 0.5 : 0.4;
      const gamma = 0.75; // From validation
      
      return {
        decision: gamma >= threshold ? 'APPLY' : 'REJECT',
        gamma,
        threshold,
        pass: gamma >= threshold
      };
    }, ['test']);
  }

  async run() {
    this.log('nstar_start', { goal: this.goal, mode: this.mode });
    
    const events = await super.run();
    
    // Extract final decision
    const decideEvent = events.find(e => e.event === 'task_complete' && e.taskId === 'decide');
    const result = decideEvent ? decideEvent.result : { decision: 'ERROR' };
    
    this.log('nstar_complete', result);
    
    return result;
  }
}

// Simple CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🎯 nstar Orchestrator - Simple Task Graph Execution

Usage:
  node nstar-orchestrator.mjs "goal" [mode]
  
Examples:
  node nstar-orchestrator.mjs "Add unit tests"
  node nstar-orchestrator.mjs "Fix bug" safe
  node nstar-orchestrator.mjs "Refactor code" fast
  
Modes:
  safe  - High confidence threshold (0.6)
  fast  - Medium confidence threshold (0.5) 
  cheap - Low confidence threshold (0.4)
`);
    return;
  }

  const goal = args[0];
  const mode = args[1] || 'fast';
  
  console.log(`🚀 Starting nstar orchestrator...`);
  console.log(`🎯 Goal: ${goal}`);
  console.log(`⚡ Mode: ${mode}\n`);
  
  const nstar = new NstarOrchestrator(goal, mode);
  
  // Listen to events for real-time feedback
  nstar.on('task_complete', ({ taskId, result }) => {
    if (taskId === 'plan') {
      console.log(`📋 Plan: ${result.plan}`);
    } else if (taskId === 'validate_patch') {
      console.log(`📊 Validation: γ=${result.gamma} (${result.valid ? 'valid' : 'invalid'})`);
    } else if (taskId === 'test') {
      console.log(`🧪 Tests: ${result.tests_passed ? 'PASSED' : 'FAILED'} (${result.coverage}% coverage)`);
    }
  });
  
  try {
    const result = await nstar.run();
    
    console.log('\n🎉 Final Result:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { NstarOrchestrator };
