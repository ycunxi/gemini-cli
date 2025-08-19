/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aider Integration for Gemini CLI
 * 
 * This integrates Aider's token-efficient editing capabilities into Gemini CLI,
 * allowing the model to use Aider's unified diff format and repository map
 * for more efficient code modifications.
 */

import { spawn, execSync } from 'child_process';
import { 
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind, 
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome
} from './tools.js';
import { Config } from '../config/config.js';

interface AiderEditParams {
  /**
   * The editing instruction in natural language
   */
  instruction: string;
  
  /**
   * Files to include in the edit context
   */
  files?: string[];
  
  /**
   * Whether to use whole file edit mode (less efficient) or diff mode (default)
   */
  whole_file?: boolean;
  
  /**
   * Additional context files to read but not edit
   */
  read_only_files?: string[];
  
  /**
   * Whether to auto-commit changes
   */
  auto_commit?: boolean;
}

interface AiderRepoMapParams {
  /**
   * Directory to map (defaults to current workspace)
   */
  directory?: string;
  
  /**
   * Include file contents preview
   */
  include_preview?: boolean;
}

class AiderEditToolInvocation extends BaseToolInvocation<AiderEditParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: AiderEditParams,
  ) {
    super(params);
  }

  getDescription(): string {
    let description = `Aider: ${this.params.instruction}`;
    if (this.params.files && this.params.files.length > 0) {
      description += ` [files: ${this.params.files.join(', ')}]`;
    }
    return description;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Aider Edit',
      command: `aider --message "${this.params.instruction}"`,
      rootCommand: 'aider',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) {
          // User cancelled
        }
      },
    };
    return confirmationDetails;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Build Aider command
      const args = ['--yes']; // Non-interactive mode
      
      // Add model configuration if using custom provider
      if (process.env['ANTHROPIC_AUTH_TOKEN']) {
        args.push('--model', 'anthropic/claude-3-opus-20240229');
      } else if (process.env['GEMINI_API_KEY']) {
        args.push('--model', 'gemini/gemini-1.5-pro-latest');
      }
      
      // Add files to edit
      if (this.params.files && this.params.files.length > 0) {
        this.params.files.forEach(file => {
          args.push('--file', file);
        });
      }
      
      // Add read-only files for context
      if (this.params.read_only_files && this.params.read_only_files.length > 0) {
        this.params.read_only_files.forEach(file => {
          args.push('--read', file);
        });
      }
      
      // Use whole file mode if specified (less efficient)
      if (this.params.whole_file) {
        args.push('--whole');
      }
      
      // Disable auto-commit if not requested
      if (!this.params.auto_commit) {
        args.push('--no-auto-commit');
      }
      
      // Add the instruction as a message
      args.push('--message', this.params.instruction);
      
      // Execute Aider
      const result = await this.runAider(args, signal);
      
      return {
        llmContent: `Aider executed successfully:\n${result.output}`,
        returnDisplay: result.output,
      };
    } catch (error) {
      return {
        llmContent: `Aider execution failed: ${error}`,
        returnDisplay: `Error: ${error}`,
      };
    }
  }
  
  private async runAider(args: string[], signal: AbortSignal): Promise<{
    output: string;
    exitCode: number | null;
  }> {
    return new Promise((resolve, reject) => {
      const aiderProcess = spawn('aider', args, {
        cwd: this.config.getTargetDir(),
        env: { ...process.env },
      });
      
      let output = '';
      let errorOutput = '';
      
      aiderProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      aiderProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      aiderProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ output, exitCode: code });
        } else {
          reject(new Error(`Aider failed with code ${code}: ${errorOutput}`));
        }
      });
      
      signal.addEventListener('abort', () => {
        aiderProcess.kill('SIGTERM');
        reject(new Error('Aider process cancelled by user'));
      });
    });
  }
}

class AiderRepoMapToolInvocation extends BaseToolInvocation<AiderRepoMapParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: AiderRepoMapParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const directory = this.params.directory || 'workspace';
    return `Generate repository map for ${directory}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const directory = this.params.directory || this.config.getTargetDir();
      
      // Use Aider's repo map functionality
      const args = [
        '--show-repo-map',
        '--no-pretty',
      ];
      
      const result = await this.runAiderCommand(args, directory, signal);
      
      // Parse and format the repo map
      const repoMap = this.parseRepoMap(result.output);
      
      return {
        llmContent: `Repository structure:\n${repoMap}`,
        returnDisplay: repoMap,
      };
    } catch (error) {
      return {
        llmContent: `Failed to generate repository map: ${error}`,
        returnDisplay: `Error: ${error}`,
      };
    }
  }
  
  private async runAiderCommand(
    args: string[], 
    cwd: string, 
    signal: AbortSignal
  ): Promise<{ output: string }> {
    // Similar implementation to runAider above
    return new Promise((resolve, reject) => {
      const process = spawn('aider', args, { cwd });
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ output });
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      
      signal.addEventListener('abort', () => {
        process.kill('SIGTERM');
      });
    });
  }
  
  private parseRepoMap(output: string): string {
    // Process Aider's repo map output to a clean format
    // This would parse the tree structure and format it nicely
    return output;
  }
}

/**
 * Aider Edit Tool - Uses Aider for token-efficient code editing
 */
export class AiderEditTool extends BaseDeclarativeTool<AiderEditParams, ToolResult> {
  static Name = 'aider_edit';
  
  constructor(private readonly config: Config) {
    super(
      AiderEditTool.Name,
      'Aider Edit',
      `Uses Aider for token-efficient code editing with unified diffs.
      
      Advantages over standard edit:
      - Uses unified diff format (much more token-efficient)
      - Maintains repository context map
      - Handles multiple file edits in one operation
      - Better at understanding code structure and dependencies
      
      When to use:
      - Large-scale refactoring across multiple files
      - Complex edits that require understanding code structure
      - When token usage is a concern
      - When you need to maintain git history`,
      Kind.Edit,
      {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'Natural language instruction for what to edit',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to include in the edit context',
          },
          read_only_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional files to read for context but not edit',
          },
          whole_file: {
            type: 'boolean',
            description: 'Use whole file mode instead of diff mode (less efficient)',
            default: false,
          },
          auto_commit: {
            type: 'boolean',
            description: 'Automatically commit changes after editing',
            default: false,
          },
        },
        required: ['instruction'],
      },
      false,
      false,
    );
  }
  
  protected override validateToolParams(params: AiderEditParams): string | null {
    if (!params.instruction || params.instruction.trim() === '') {
      return 'Instruction is required';
    }
    
    // Check if Aider is installed
    try {
      execSync('which aider', { stdio: 'ignore' });
    } catch {
      return 'Aider is not installed. Install with: pip install aider-chat';
    }
    
    return null;
  }
  
  protected createInvocation(params: AiderEditParams): AiderEditToolInvocation {
    return new AiderEditToolInvocation(this.config, params);
  }
}

/**
 * Aider Repository Map Tool - Generates efficient repository structure
 */
export class AiderRepoMapTool extends BaseDeclarativeTool<AiderRepoMapParams, ToolResult> {
  static Name = 'aider_repo_map';
  
  constructor(private readonly config: Config) {
    super(
      AiderRepoMapTool.Name,
      'Aider Repo Map',
      'Generates a token-efficient repository structure map using Aider',
      Kind.Read,
      {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory to map (defaults to workspace root)',
          },
          include_preview: {
            type: 'boolean',
            description: 'Include file content previews',
            default: false,
          },
        },
      },
      false,
      false,
    );
  }
  
  protected createInvocation(params: AiderRepoMapParams): AiderRepoMapToolInvocation {
    return new AiderRepoMapToolInvocation(this.config, params);
  }
}
