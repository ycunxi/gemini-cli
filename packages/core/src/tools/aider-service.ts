/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aider Service - Maintains a persistent Aider instance for efficient operations
 * 
 * This service keeps Aider running in the background, maintaining its cache,
 * repo map, and conversation context between operations.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config } from '../config/config.js';

interface AiderCommand {
  id: string;
  instruction: string;
  files?: string[];
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

export class AiderService extends EventEmitter {
  private aiderProcess: ChildProcess | null = null;
  private commandQueue: AiderCommand[] = [];
  private currentCommand: AiderCommand | null = null;
  private outputBuffer: string = '';
  private repoMapCache: string | null = null;
  private lastRepoMapTime: number = 0;
  private readonly REPO_MAP_CACHE_TTL = 60000; // 1 minute
  
  constructor(private config: Config) {
    super();
  }

  /**
   * Start the Aider daemon process
   */
  async start(): Promise<void> {
    if (this.aiderProcess) {
      return; // Already running
    }

    console.log('🚀 Starting Aider service...');
    
    const args = [
      '--no-auto-commit',
      '--yes', // Non-interactive mode
      '--cache-prompts', // Enable prompt caching for efficiency
      '--map-tokens', '2048', // Limit repo map token usage
      '--no-pretty', // Simplify output parsing
    ];

    // Configure model based on environment
    if (process.env['ANTHROPIC_AUTH_TOKEN']) {
      args.push('--model', 'anthropic/claude-3-opus-20240229');
      args.push('--api-base', process.env['ANTHROPIC_BASE_URL'] || '');
    } else if (process.env['GEMINI_API_KEY']) {
      args.push('--model', 'gemini/gemini-1.5-pro-latest');
    }

    this.aiderProcess = spawn('aider', args, {
      cwd: this.config.getTargetDir(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.aiderProcess.stdout?.on('data', (data) => {
      this.handleOutput(data.toString());
    });

    this.aiderProcess.stderr?.on('data', (data) => {
      console.error('Aider stderr:', data.toString());
    });

    this.aiderProcess.on('close', (code) => {
      console.log(`Aider process exited with code ${code}`);
      this.aiderProcess = null;
      this.rejectAllPending(new Error('Aider process terminated'));
    });

    // Wait for Aider to be ready
    await this.waitForReady();
    
    // Pre-generate repo map
    await this.updateRepoMap();
  }

  /**
   * Stop the Aider daemon process
   */
  async stop(): Promise<void> {
    if (!this.aiderProcess) {
      return;
    }

    console.log('🛑 Stopping Aider service...');
    
    // Send exit command to Aider
    this.aiderProcess.stdin?.write('/exit\n');
    
    // Give it time to exit gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Force kill if still running
    if (this.aiderProcess) {
      this.aiderProcess.kill('SIGTERM');
      this.aiderProcess = null;
    }
  }

  /**
   * Execute an Aider command
   */
  async execute(instruction: string, files?: string[]): Promise<string> {
    if (!this.aiderProcess) {
      await this.start();
    }

    return new Promise((resolve, reject) => {
      const command: AiderCommand = {
        id: Math.random().toString(36).substr(2, 9),
        instruction,
        files,
        resolve,
        reject,
      };

      this.commandQueue.push(command);
      this.processNextCommand();
    });
  }

  /**
   * Get cached repository map or generate new one
   */
  async getRepoMap(): Promise<string> {
    const now = Date.now();
    
    // Use cache if fresh
    if (this.repoMapCache && (now - this.lastRepoMapTime) < this.REPO_MAP_CACHE_TTL) {
      return this.repoMapCache;
    }

    // Generate new repo map
    await this.updateRepoMap();
    return this.repoMapCache || '';
  }

  /**
   * Update the repository map cache
   */
  private async updateRepoMap(): Promise<void> {
    if (!this.aiderProcess) {
      return;
    }

    console.log('📊 Updating repository map...');
    
    return new Promise((resolve) => {
      const mapCommand: AiderCommand = {
        id: 'repo-map',
        instruction: '/map',
        resolve: (result) => {
          this.repoMapCache = result;
          this.lastRepoMapTime = Date.now();
          resolve();
        },
        reject: () => resolve(), // Don't fail if map generation fails
      };

      this.commandQueue.unshift(mapCommand); // Priority
      this.processNextCommand();
    });
  }

  /**
   * Process the next command in queue
   */
  private processNextCommand(): void {
    if (this.currentCommand || this.commandQueue.length === 0) {
      return;
    }

    this.currentCommand = this.commandQueue.shift()!;
    this.outputBuffer = '';

    // Add files to Aider context if specified
    if (this.currentCommand.files && this.currentCommand.files.length > 0) {
      for (const file of this.currentCommand.files) {
        this.aiderProcess?.stdin?.write(`/add ${file}\n`);
      }
    }

    // Send the instruction
    this.aiderProcess?.stdin?.write(`${this.currentCommand.instruction}\n`);
    
    // Set timeout for response
    setTimeout(() => {
      if (this.currentCommand?.id === this.currentCommand?.id) {
        this.completeCurrentCommand();
      }
    }, 30000); // 30 second timeout
  }

  /**
   * Handle output from Aider
   */
  private handleOutput(data: string): void {
    this.outputBuffer += data;

    // Check if command is complete (look for prompt)
    if (this.outputBuffer.includes('> ') || 
        this.outputBuffer.includes('Tokens:') ||
        this.outputBuffer.includes('Applied edit to')) {
      this.completeCurrentCommand();
    }
  }

  /**
   * Complete the current command
   */
  private completeCurrentCommand(): void {
    if (!this.currentCommand) {
      return;
    }

    const result = this.cleanOutput(this.outputBuffer);
    this.currentCommand.resolve(result);
    this.currentCommand = null;
    this.outputBuffer = '';

    // Process next command
    this.processNextCommand();
  }

  /**
   * Clean Aider output for return
   */
  private cleanOutput(output: string): string {
    // Remove ANSI codes
    const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Remove prompts
    return cleaned
      .replace(/^> /gm, '')
      .replace(/^Tokens:.*$/gm, '')
      .trim();
  }

  /**
   * Wait for Aider to be ready
   */
  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.outputBuffer.includes('>') || 
            this.outputBuffer.includes('Aider v')) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  /**
   * Reject all pending commands
   */
  private rejectAllPending(error: Error): void {
    if (this.currentCommand) {
      this.currentCommand.reject(error);
      this.currentCommand = null;
    }
    
    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift()!;
      command.reject(error);
    }
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.aiderProcess !== null;
  }
}

// Singleton instance
let aiderService: AiderService | null = null;

/**
 * Get or create the Aider service singleton
 */
export function getAiderService(config: Config): AiderService {
  if (!aiderService) {
    aiderService = new AiderService(config);
    
    // Clean up on process exit
    process.on('exit', () => {
      aiderService?.stop();
    });
  }
  return aiderService;
}
