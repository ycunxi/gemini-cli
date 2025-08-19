/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Part, FunctionCall } from '@google/genai';

/**
 * Parses Anthropic's <invoke> format and extracts tool calls
 */
export function parseAnthropicToolCalls(text: string): {
  textParts: string[];
  functionCalls: FunctionCall[];
} {
  const functionCalls: FunctionCall[] = [];
  const textParts: string[] = [];
  
  // Debug: log the raw text to see what we're parsing
  const hasToolTags = text.includes('<read_file>') || text.includes('<run_shell_command>') || text.includes('<invoke') || text.includes('<ls>') || text.includes('<write_file>') || text.includes('<function_calls>');
  if (hasToolTags) {
    console.log('🔍 Raw text contains tool-like tags');
    console.log('   Text length:', text.length);
    console.log('   First 200 chars:', text.substring(0, 200));
    if (text.includes('<run_shell_command>')) {
      console.log('   ✅ Contains <run_shell_command> tag');
      const startIdx = text.indexOf('<run_shell_command>');
      const endIdx = text.indexOf('</run_shell_command>');
      console.log(`   Tag position: ${startIdx} to ${endIdx}`);
    }
    if (text.includes('<function_calls>')) {
      console.log('   Found <function_calls> wrapper');
    }
    if (text.includes('<function_result>')) {
      console.log('   ⚠️ Found hallucinated <function_result> - removing');
    }
  }
  
  // First, remove any <function_result> blocks (hallucinated results)
  // These should not exist - results come from actual tool execution
  text = text.replace(/<function_result>[\s\S]*?<\/function_result>/g, '');
  
  // Extract content from <function_calls> blocks if present
  const functionCallsRegex = /<function_calls>([\s\S]*?)<\/function_calls>/g;
  const functionCallBlocks = [];
  let tempMatch;
  while ((tempMatch = functionCallsRegex.exec(text)) !== null) {
    functionCallBlocks.push(tempMatch[1]);
  }
  
  // If we found function_calls blocks, process them separately
  let processedText = text;
  if (functionCallBlocks.length > 0) {
    // Replace function_calls blocks with their contents for tool parsing
    for (const block of functionCallBlocks) {
      processedText = processedText.replace(/<function_calls>[\s\S]*?<\/function_calls>/, block);
    }
    text = processedText;
  }
  
  // Collect all tool calls with their positions
  const toolCalls: Array<{name: string, params: string, start: number, end: number}> = [];
  
  // Find invoke-style calls: <invoke name="tool_name">...</invoke>
  const invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
  let match: RegExpExecArray | null;
  
  while ((match = invokeRegex.exec(text)) !== null) {
    toolCalls.push({
      name: match[1],
      params: match[2],
      start: match.index,
      end: invokeRegex.lastIndex
    });
  }
  
  // Find direct tool calls: <tool_name>...</tool_name>
  // This regex handles tool names with underscores
  const directToolRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\1>/g;
  
  while ((match = directToolRegex.exec(text)) !== null) {
    // Skip if this overlaps with an invoke-style call
    const matchStart = match.index;
    const matchEnd = directToolRegex.lastIndex;
    
    const overlaps = toolCalls.some(tc => 
      (matchStart >= tc.start && matchStart < tc.end) ||
      (matchEnd > tc.start && matchEnd <= tc.end)
    );
    
    if (!overlaps) {
      toolCalls.push({
        name: match[1],
        params: match[2],
        start: matchStart,
        end: matchEnd
      });
    }
  }
  
  // Sort by position
  toolCalls.sort((a, b) => a.start - b.start);
  
  console.log(`   📊 Total tool calls found: ${toolCalls.length}`);
  if (toolCalls.length > 0) {
    console.log('   Tool calls:', toolCalls.map(tc => `${tc.name} at ${tc.start}-${tc.end}`));
  }
  
  // Process each tool call
  let lastIndex = 0;
  
  for (const toolCall of toolCalls) {
    // Add any text before this tool call
    if (toolCall.start > lastIndex) {
      const textBefore = text.substring(lastIndex, toolCall.start).trim();
      if (textBefore) {
        textParts.push(textBefore);
      }
    }
    
    console.log(`🎯 Found tool call: ${toolCall.name}`);
    
    // Parse parameters - handle both formats
    const args: Record<string, any> = {};
    const paramBlock = toolCall.params;
    
    // Format 1: <parameter name="param_name">value</parameter>
    const paramRegex = /<parameter\s+name="([^"]+)">([^<]*)<\/parameter>/g;
    let paramMatch;
    let hasNamedParams = false;
    
    while ((paramMatch = paramRegex.exec(paramBlock)) !== null) {
      hasNamedParams = true;
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2].trim();
      
      // Try to parse as JSON if it looks like JSON
      if (paramValue.startsWith('[') || paramValue.startsWith('{')) {
        try {
          args[paramName] = JSON.parse(paramValue);
        } catch {
          args[paramName] = paramValue;
        }
      } else {
        args[paramName] = paramValue;
      }
    }
    
    // Format 2: Direct parameter tags like <command>value</command>
    if (!hasNamedParams) {
      // Try to parse direct parameter tags
      const directParamRegex = /<(\w+)>([^<]*)<\/\1>/g;
      let directMatch;
      
      while ((directMatch = directParamRegex.exec(paramBlock)) !== null) {
        const paramName = directMatch[1];
        const paramValue = directMatch[2].trim();
        
        // Try to parse as JSON if it looks like JSON
        if (paramValue.startsWith('[') || paramValue.startsWith('{')) {
          try {
            args[paramName] = JSON.parse(paramValue);
          } catch {
            args[paramName] = paramValue;
          }
        } else {
          args[paramName] = paramValue;
        }
      }
    }
    
    // Map common parameter name variations to expected names
    const mappedArgs = { ...args };
    const toolName = toolCall.name;
    
    // Simple parameter mappings for common tools
    // read_file: path -> absolute_path
    if (toolName === 'read_file') {
      if ('path' in mappedArgs && !('absolute_path' in mappedArgs)) {
        mappedArgs['absolute_path'] = mappedArgs['path'];
        delete mappedArgs['path'];
      }
    }
    
    // run_shell_command: cmd -> command
    if (toolName === 'run_shell_command') {
      if ('cmd' in mappedArgs && !('command' in mappedArgs)) {
        mappedArgs['command'] = mappedArgs['cmd'];
        delete mappedArgs['cmd'];
      }
    }
    
    // ls: directory/dir -> path
    if (toolName === 'ls') {
      if ('directory' in mappedArgs && !('path' in mappedArgs)) {
        mappedArgs['path'] = mappedArgs['directory'];
        delete mappedArgs['directory'];
      } else if ('dir' in mappedArgs && !('path' in mappedArgs)) {
        mappedArgs['path'] = mappedArgs['dir'];
        delete mappedArgs['dir'];
      }
    }
    
    // write_file: content -> contents, path -> absolute_path
    if (toolName === 'write_file') {
      if ('content' in mappedArgs && !('contents' in mappedArgs)) {
        mappedArgs['contents'] = mappedArgs['content'];
        delete mappedArgs['content'];
      }
      if ('path' in mappedArgs && !('absolute_path' in mappedArgs)) {
        mappedArgs['absolute_path'] = mappedArgs['path'];
        delete mappedArgs['path'];
      }
    }
    
    console.log(`   Mapped args for ${toolName}:`, mappedArgs);
    
    functionCalls.push({
      name: toolName,
      args: mappedArgs,
    });
    
    lastIndex = toolCall.end;
  }
  
  // Add any remaining text after the last invoke block
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex).trim();
    if (textAfter) {
      textParts.push(textAfter);
    }
  }
  
  // If no tool calls found, return the original text
  if (functionCalls.length === 0) {
    return { textParts: [text], functionCalls: [] };
  }
  
  return { textParts, functionCalls };
}

/**
 * Converts Anthropic response with tool calls to Gemini Part format
 */
export function convertAnthropicResponseToParts(text: string): Part[] {
  const { textParts, functionCalls } = parseAnthropicToolCalls(text);
  const parts: Part[] = [];
  
  // Add text parts and function calls in the order they appear
  // For now, we'll add all text first, then all function calls
  // (Gemini typically expects function calls at the end)
  
  const combinedText = textParts.join('\n').trim();
  if (combinedText) {
    parts.push({ text: combinedText });
  }
  
  for (const functionCall of functionCalls) {
    parts.push({ functionCall });
  }
  
  return parts;
}
