#!/usr/bin/env node

/**
 * Demo: Comparing Stateless vs Persistent Aider Service
 * This demonstrates the performance and token usage differences
 */

// Simulated metrics
const REPO_SCAN_TIME = 3000; // 3 seconds to scan repository
const MAP_BUILD_TIME = 1000; // 1 second to build repo map  
const EDIT_TIME = 1000;      // 1 second to apply edit
const STARTUP_TIME = 2000;   // 2 seconds to start Aider

class StatelessAider {
  async execute(instruction) {
    console.log(`\n📝 Executing: "${instruction}"`);
    
    // Every call does everything from scratch
    console.log("  ⏳ Starting Aider process...");
    await sleep(STARTUP_TIME);
    
    console.log("  🔍 Scanning repository (1000 files)...");
    await sleep(REPO_SCAN_TIME);
    
    console.log("  🗺️  Building repository map...");
    await sleep(MAP_BUILD_TIME);
    
    console.log("  ✏️  Applying edit...");
    await sleep(EDIT_TIME);
    
    console.log("  ❌ Aider process exits");
    
    const totalTime = STARTUP_TIME + REPO_SCAN_TIME + MAP_BUILD_TIME + EDIT_TIME;
    return { time: totalTime, tokens: 5000 };
  }
}

class PersistentAiderService {
  constructor() {
    this.started = false;
    this.repoMap = null;
    this.context = [];
  }
  
  async start() {
    if (this.started) return;
    
    console.log("\n🚀 Starting Aider Service (once)");
    console.log("  ⏳ Starting Aider process...");
    await sleep(STARTUP_TIME);
    
    console.log("  🔍 Scanning repository (1000 files)...");
    await sleep(REPO_SCAN_TIME);
    
    console.log("  🗺️  Building repository map...");
    await sleep(MAP_BUILD_TIME);
    this.repoMap = "CACHED_REPO_MAP";
    
    console.log("  ✅ Aider service ready (keeps running)");
    this.started = true;
  }
  
  async execute(instruction) {
    await this.start();
    
    console.log(`\n📝 Executing: "${instruction}"`);
    console.log("  ♻️  Using cached repo map");
    console.log("  📚 Context available:", this.context.length, "previous operations");
    console.log("  ✏️  Applying edit...");
    await sleep(EDIT_TIME);
    
    // Add to context
    this.context.push(instruction);
    console.log("  ✅ Done (Aider still running)");
    
    return { time: EDIT_TIME, tokens: 500 };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log("=" .repeat(60));
  console.log("AIDER INTEGRATION COMPARISON DEMO");
  console.log("=" .repeat(60));
  
  const operations = [
    "Add error handling to calculate_total function",
    "Add logging to all functions",
    "Add type hints to function parameters",
    "Refactor validate_items to use list comprehension",
    "Add docstrings to all functions"
  ];
  
  // Stateless approach
  console.log("\n🔴 STATELESS APPROACH (Current Implementation)");
  console.log("-".repeat(60));
  
  const stateless = new StatelessAider();
  let statelessTotalTime = 0;
  let statelessTotalTokens = 0;
  
  for (const op of operations) {
    const result = await stateless.execute(op);
    statelessTotalTime += result.time;
    statelessTotalTokens += result.tokens;
  }
  
  // Persistent service approach
  console.log("\n🟢 PERSISTENT SERVICE APPROACH (Proposed)");
  console.log("-".repeat(60));
  
  const service = new PersistentAiderService();
  let serviceTotalTime = STARTUP_TIME + REPO_SCAN_TIME + MAP_BUILD_TIME; // Initial startup
  let serviceTotalTokens = 1000; // Initial scan tokens
  
  for (const op of operations) {
    const result = await service.execute(op);
    serviceTotalTime += result.time;
    serviceTotalTokens += result.tokens;
  }
  
  // Results comparison
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESULTS COMPARISON");
  console.log("=".repeat(60));
  
  console.log("\n⏱️  Time Comparison:");
  console.log(`  Stateless:    ${statelessTotalTime / 1000}s total`);
  console.log(`  Service:      ${serviceTotalTime / 1000}s total`);
  console.log(`  Improvement:  ${((1 - serviceTotalTime/statelessTotalTime) * 100).toFixed(0)}% faster`);
  
  console.log("\n💰 Token Usage Comparison:");
  console.log(`  Stateless:    ${statelessTotalTokens.toLocaleString()} tokens`);
  console.log(`  Service:      ${serviceTotalTokens.toLocaleString()} tokens`);
  console.log(`  Savings:      ${((1 - serviceTotalTokens/statelessTotalTokens) * 100).toFixed(0)}% fewer tokens`);
  
  console.log("\n🎯 Key Benefits of Persistent Service:");
  console.log("  ✓ Repository scanned only once");
  console.log("  ✓ Map cached and reused");
  console.log("  ✓ Context maintained between operations");
  console.log("  ✓ Incremental updates instead of full rescans");
  console.log("  ✓ Can leverage Aider's conversation history");
  
  console.log("\n💡 Real-World Impact:");
  const costPerToken = 0.00001; // Example cost
  const savedTokens = statelessTotalTokens - serviceTotalTokens;
  const savedCost = savedTokens * costPerToken;
  console.log(`  For 100 operations/day: Save ${(savedTokens * 20).toLocaleString()} tokens (~$${(savedCost * 20).toFixed(2)})`);
  console.log(`  For 1000 operations/day: Save ${(savedTokens * 200).toLocaleString()} tokens (~$${(savedCost * 200).toFixed(2)})`);
}

// Run the demo
runDemo().catch(console.error);
