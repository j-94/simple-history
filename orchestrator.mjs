#!/usr/bin/env node
// Simple orchestrator loop with task graph and events

import { EventEmitter } from 'events';
import fs from 'fs';

class TaskGraph {
  constructor() {
    this.tasks = new Map();
    this.dependencies = new Map();
    this.completed = new Set();
  }

  addTask(id, task) {
    this.tasks.set(id, task);
    this.dependencies.set(id, new Set());
  }

  addDependency(taskId, dependsOn) {
    if (!this.dependencies.has(taskId)) {
      this.dependencies.set(taskId, new Set());
    }
    this.dependencies.get(taskId).add(dependsOn);
  }

  getReadyTasks() {
    const ready = [];
    for (const [taskId, deps] of this.dependencies) {
      if (!this.completed.has(taskId)) {
        const allDepsMet = Array.from(deps).every(dep => this.completed.has(dep));
        if (allDepsMet) {
          ready.push(taskId);
        }
      }
    }
    return ready;
  }

  markCompleted(taskId) {
    this.completed.add(taskId);
  }

  isComplete() {
    return this.completed.size === this.tasks.size;
  }
}

class Orchestrator extends EventEmitter {
  constructor() {
    super();
    this.graph = new TaskGraph();
    this.running = false;
    this.events = [];
  }

  log(event, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...data
    };
    this.events.push(entry);
    this.emit('log', entry);
    console.log(`[${entry.timestamp}] ${event}:`, data);
  }

  addTask(id, fn, deps = []) {
    this.graph.addTask(id, fn);
    deps.forEach(dep => this.graph.addDependency(id, dep));
    this.log('task_added', { id, dependencies: deps });
  }

  async executeTask(taskId) {
    const task = this.graph.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    this.log('task_start', { taskId });
    
    try {
      const result = await task();
      this.graph.markCompleted(taskId);
      this.log('task_complete', { taskId, result });
      this.emit('task_complete', { taskId, result });
      return result;
    } catch (error) {
      this.log('task_error', { taskId, error: error.message });
      this.emit('task_error', { taskId, error });
      throw error;
    }
  }

  async run() {
    this.running = true;
    this.log('orchestrator_start');

    while (!this.graph.isComplete() && this.running) {
      const readyTasks = this.graph.getReadyTasks();
      
      if (readyTasks.length === 0) {
        this.log('orchestrator_blocked', { 
          remaining: this.graph.tasks.size - this.graph.completed.size 
        });
        break;
      }

      // Execute ready tasks in parallel
      const promises = readyTasks.map(taskId => this.executeTask(taskId));
      await Promise.allSettled(promises);
    }

    this.log('orchestrator_complete', { 
      completed: this.graph.completed.size,
      total: this.graph.tasks.size
    });
    
    this.running = false;
    return this.events;
  }

  stop() {
    this.running = false;
    this.log('orchestrator_stop');
  }

  getStatus() {
    return {
      running: this.running,
      tasks: {
        total: this.graph.tasks.size,
        completed: this.graph.completed.size,
        remaining: this.graph.tasks.size - this.graph.completed.size
      },
      ready: this.graph.getReadyTasks(),
      events: this.events.length
    };
  }
}

// Example usage
async function demo() {
  const orchestrator = new Orchestrator();

  // Listen to events
  orchestrator.on('log', (entry) => {
    // Could send to external systems, databases, etc.
  });

  // Define tasks
  orchestrator.addTask('init', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'System initialized';
  });

  orchestrator.addTask('load_config', async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { config: 'loaded' };
  }, ['init']);

  orchestrator.addTask('setup_db', async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return 'Database ready';
  }, ['load_config']);

  orchestrator.addTask('start_server', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'Server started on port 8080';
  }, ['setup_db']);

  orchestrator.addTask('health_check', async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'All systems healthy';
  }, ['start_server']);

  // Run the orchestrator
  console.log('🚀 Starting orchestrator...');
  const events = await orchestrator.run();
  
  console.log('\n📊 Final Status:', orchestrator.getStatus());
  console.log('\n📝 Event Log:');
  events.forEach(event => {
    console.log(`  ${event.timestamp}: ${event.event}`);
  });
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (command === 'demo') {
    demo().catch(console.error);
  } else {
    console.log(`
🎯 Simple Orchestrator with Task Graph and Events

Usage:
  node orchestrator.mjs demo    # Run demo
  
Features:
  • Task graph with dependencies
  • Event-driven execution
  • Parallel task execution
  • Status monitoring
  • Event logging

Example:
  const orchestrator = new Orchestrator();
  orchestrator.addTask('task1', async () => 'done');
  orchestrator.addTask('task2', async () => 'done', ['task1']);
  await orchestrator.run();
`);
  }
}

export { Orchestrator, TaskGraph };
