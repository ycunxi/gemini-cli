/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IModelProvider, contentsToString } from './base.js';
import { Content } from '@google/genai';
import { parseAnthropicToolCalls } from './anthropic-tool-parser.js';

/**
 * Anthropic provider implementation for NVIDIA proxy
 */
export class AnthropicProvider implements IModelProvider {
  private authToken: string;
  private baseUrl: string;
  private model: string;

  constructor(
    authToken?: string,
    baseUrl?: string,
    model?: string,
  ) {
    this.authToken = authToken || process.env['ANTHROPIC_AUTH_TOKEN'] || '';
    this.baseUrl = baseUrl || process.env['ANTHROPIC_BASE_URL'] || 'https://api.anthropic.com';
    this.model = model || process.env['ANTHROPIC_MODEL'] || 'claude-3-opus-20240229';

    if (!this.authToken) {
      throw new Error('ANTHROPIC_AUTH_TOKEN is required');
    }
  }

  async generateContent(
    prompt: string | Content[],
    config?: any,
  ): Promise<{
    text?: string;
    candidates?: any[];
    usageMetadata?: any;
  }> {
    const textPrompt = typeof prompt === 'string' 
      ? prompt 
      : contentsToString(prompt);

    // Check if this is a JSON generation request
    const isJsonRequest = config?.responseMimeType === 'application/json' || config?.responseJsonSchema;
    
    let finalPrompt = textPrompt;
    if (isJsonRequest) {
      // Add explicit JSON instructions for Anthropic
      const schema = config?.responseJsonSchema;
      if (schema) {
        finalPrompt = `${textPrompt}\n\nYou MUST respond with ONLY valid JSON that matches this schema:\n${JSON.stringify(schema, null, 2)}\n\nDo not include any explanations or text outside the JSON. Return only the JSON object.`;
      } else {
        finalPrompt = `${textPrompt}\n\nYou MUST respond with ONLY valid JSON. Do not include any explanations or text outside the JSON.`;
      }
    }

    // Convert Gemini tools to Anthropic tool format
    const anthropicTools = this.convertTools(config?.tools);
    
    const requestBody: any = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: finalPrompt,
        },
      ],
      max_tokens: config?.maxOutputTokens || 4096,
      temperature: config?.temperature || 0.7,
    };

    // Add tools if present
    if (anthropicTools && anthropicTools.length > 0) {
      requestBody.tools = anthropicTools;
      // Add tool use prompt to help Anthropic understand when to use tools
      requestBody.system = 'You are a helpful assistant that can use tools to help users. When a user asks you to perform an action like running commands, reading files, or other operations, use the appropriate tool. Always use tools when possible instead of just describing what you would do.';
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Debug: log the raw response to understand the structure
    console.log('🔬 Raw API response:', JSON.stringify(data, null, 2).substring(0, 500));
    
    // Handle tool use responses when tools are provided
    const parts: any[] = [];
    let text = '';
    const functionCalls: any[] = [];
    
    if (data.content && Array.isArray(data.content)) {
      for (const contentBlock of data.content) {
        if (contentBlock.type === 'text') {
          text += contentBlock.text || '';
          parts.push({ text: contentBlock.text });
        } else if (contentBlock.type === 'tool_use') {
          // Convert Anthropic tool_use to Gemini functionCall format
          const functionCall = {
            name: contentBlock.name,
            args: contentBlock.input || {},
          };
          functionCalls.push(functionCall);
          parts.push({ functionCall });
          console.log('🔧 Tool use detected:', contentBlock.name, 'with args:', contentBlock.input);
        }
      }
    } else {
      // Fallback to old parsing if response format is different
      text = data.content?.[0]?.text || '';
      const parsed = parseAnthropicToolCalls(text);
      if (parsed.functionCalls.length > 0) {
        functionCalls.push(...parsed.functionCalls);
        for (const fc of parsed.functionCalls) {
          parts.push({ functionCall: fc });
        }
      }
      if (text && functionCalls.length === 0) {
        parts.push({ text });
      }
    }
    
    // Debug logging
    console.log('📝 Anthropic response contains:', {
      hasText: text.length > 0,
      textLength: text.length,
      functionCallsFound: functionCalls.length,
      functionCallNames: functionCalls.map(fc => fc.name),
    });
    
    if (functionCalls.length > 0) {
      console.log('🔧 Detected tool calls:', functionCalls.map(fc => fc.name).join(', '));
      console.log('   Tool details:', JSON.stringify(functionCalls, null, 2));
    }
    
    // If no parts were created, add text
    if (parts.length === 0 && text) {
      parts.push({ text });
    }
    
    return {
      text: text,
      candidates: [{
        content: {
          role: 'model',
          parts,
        },
        finishReason: data.stop_reason === 'end_turn' ? 'STOP' : data.stop_reason,
      }],
      usageMetadata: {
        promptTokenCount: data.usage?.input_tokens,
        candidatesTokenCount: data.usage?.output_tokens,
        totalTokenCount: data.usage?.input_tokens + data.usage?.output_tokens,
      },
    };
  }

  async *generateContentStream(
    prompt: string | Content[],
    config?: any,
  ): AsyncGenerator<{
    text?: string;
    candidates?: any[];
    usageMetadata?: any;
  }> {
    const textPrompt = typeof prompt === 'string' 
      ? prompt 
      : contentsToString(prompt);

    // Check if this is a JSON generation request
    const isJsonRequest = config?.responseMimeType === 'application/json' || config?.responseJsonSchema;
    
    let finalPrompt = textPrompt;
    if (isJsonRequest) {
      // Add explicit JSON instructions for Anthropic
      const schema = config?.responseJsonSchema;
      if (schema) {
        finalPrompt = `${textPrompt}\n\nYou MUST respond with ONLY valid JSON that matches this schema:\n${JSON.stringify(schema, null, 2)}\n\nDo not include any explanations or text outside the JSON. Return only the JSON object.`;
      } else {
        finalPrompt = `${textPrompt}\n\nYou MUST respond with ONLY valid JSON. Do not include any explanations or text outside the JSON.`;
      }
    }

    // Convert Gemini tools to Anthropic tool format
    const anthropicTools = this.convertTools(config?.tools);
    
    const requestBody: any = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: finalPrompt,
        },
      ],
      max_tokens: config?.maxOutputTokens || 4096,
      temperature: config?.temperature || 0.7,
      stream: true,
    };

    // Add tools if present
    if (anthropicTools && anthropicTools.length > 0) {
      requestBody.tools = anthropicTools;
      // Add tool use prompt to help Anthropic understand when to use tools
      requestBody.system = 'You are a helpful assistant that can use tools to help users. When a user asks you to perform an action like running commands, reading files, or other operations, use the appropriate tool. Always use tools when possible instead of just describing what you would do.';
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall: { name: string; input: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield {
                text: parsed.delta.text,
                candidates: [{
                  content: {
                    role: 'model',
                    parts: [{ text: parsed.delta.text }],
                  },
                  finishReason: undefined,
                }],
              };
            } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              // Tool use block started - accumulate the tool call
              console.log('🔧 Stream: Tool use started:', parsed.content_block.name);
              currentToolCall = {
                name: parsed.content_block.name,
                input: '',
              };
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.partial_json) {
              // Accumulate tool input
              if (currentToolCall) {
                currentToolCall.input += parsed.delta.partial_json;
                console.log('🔧 Stream: Tool input delta:', parsed.delta.partial_json);
              }
            } else if (parsed.type === 'content_block_stop' && currentToolCall) {
              // Tool use block completed - emit the complete tool call
              console.log('🔧 Stream: Tool use completed:', currentToolCall.name);
              let args = {};
              try {
                args = JSON.parse(currentToolCall.input);
              } catch (e) {
                console.warn('Failed to parse tool input:', currentToolCall.input);
              }
              yield {
                text: '',
                candidates: [{
                  content: {
                    role: 'model',
                    parts: [{
                      functionCall: {
                        name: currentToolCall.name,
                        args,
                      }
                    }],
                  },
                  finishReason: undefined,
                }],
              };
              currentToolCall = null;
            } else if (parsed.type === 'message_stop') {
              // Final message with usage metadata
              yield {
                text: '',
                candidates: [{
                  content: {
                    role: 'model',
                    parts: [{ text: '' }],
                  },
                  finishReason: 'STOP',
                }],
                usageMetadata: parsed.usage ? {
                  promptTokenCount: parsed.usage.input_tokens,
                  candidatesTokenCount: parsed.usage.output_tokens,
                  totalTokenCount: parsed.usage.input_tokens + parsed.usage.output_tokens,
                } : undefined,
              };
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }

  async countTokens(prompt: string | Content[]): Promise<{ totalTokens: number }> {
    // Rough estimation for Anthropic
    const textPrompt = typeof prompt === 'string' 
      ? prompt 
      : contentsToString(prompt);
    
    // Very rough estimation: ~4 characters per token
    const estimatedTokens = Math.ceil(textPrompt.length / 4);
    
    return { totalTokens: estimatedTokens };
  }

  async embedContent(prompt: string): Promise<{ embeddings: number[][] }> {
    // Anthropic doesn't have a direct embedding API
    // You would need to use a different service for embeddings
    throw new Error('Embeddings not supported by Anthropic provider');
  }

  /**
   * Convert Gemini tool format to Anthropic tool format
   */
  private convertTools(tools?: any[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    
    const anthropicTools: any[] = [];
    
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          const anthropicTool = {
            name: func.name,
            description: func.description,
            input_schema: {
              type: 'object',
              properties: {},
              required: [],
            },
          };

          // Convert parametersJsonSchema to Anthropic format
          if (func.parametersJsonSchema) {
            const schema = func.parametersJsonSchema as any;
            if (schema.properties) {
              anthropicTool.input_schema.properties = schema.properties;
            }
            if (schema.required) {
              anthropicTool.input_schema.required = schema.required;
            }
          }

          anthropicTools.push(anthropicTool);
        }
      }
    }
    
    console.log('🔧 Converted tools for Anthropic:', anthropicTools.map(t => t.name).join(', '));
    return anthropicTools;
  }
}
