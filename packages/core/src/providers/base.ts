/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
  Content,
  Part,
  Candidate,
  GenerateContentResponseUsageMetadata,
  FinishReason,
} from '@google/genai';

/**
 * Base interface for all model providers to implement.
 * This is a simplified interface that providers implement,
 * and then we adapt to the ContentGenerator interface.
 */
export interface IModelProvider {
  /**
   * Generate content from the model
   */
  generateContent(
    prompt: string | Content[],
    config?: any,
  ): Promise<{
    text?: string;
    candidates?: any[];
    usageMetadata?: any;
  }>;

  /**
   * Generate content stream from the model
   */
  generateContentStream?(
    prompt: string | Content[],
    config?: any,
  ): AsyncGenerator<{
    text?: string;
    candidates?: any[];
    usageMetadata?: any;
  }>;

  /**
   * Count tokens in the input
   */
  countTokens?(prompt: string | Content[]): Promise<{ totalTokens: number }>;

  /**
   * Generate embeddings for the input
   */
  embedContent?(prompt: string): Promise<{ embeddings: number[][] }>;
}

/**
 * Helper function to convert provider responses to GenerateContentResponse
 */
export function toGenerateContentResponse(
  providerResponse: any,
): GenerateContentResponse {
  const response = new GenerateContentResponse();
  
  // If the provider returned a simple text response
  if (typeof providerResponse === 'string') {
    const textPart: Part = { text: providerResponse };
    const content: Content = {
      role: 'model',
      parts: [textPart],
    };
    const candidate: Candidate = {
      content,
      finishReason: FinishReason.STOP,
    };
    response.candidates = [candidate];
    return response;
  }

  // If the provider returned structured response
  if (providerResponse.text !== undefined || providerResponse.candidates) {
    if (providerResponse.candidates) {
      response.candidates = providerResponse.candidates;
    } else {
      const textPart: Part = { text: providerResponse.text || '' };
      const content: Content = {
        role: 'model',
        parts: [textPart],
      };
      const candidate: Candidate = {
        content,
        finishReason: providerResponse.finishReason || FinishReason.STOP,
      };
      response.candidates = [candidate];
    }
  }

  if (providerResponse.usageMetadata) {
    response.usageMetadata = providerResponse.usageMetadata as GenerateContentResponseUsageMetadata;
  }
  
  // Note: functionCalls is automatically computed by GenerateContentResponse
  // from the parts array, so we don't need to set it explicitly

  return response;
}

/**
 * Helper function to extract prompt from GenerateContentParameters
 */
export function extractPrompt(params: GenerateContentParameters): string | Content[] {
  const contents = params.contents;
  
  // If it's already a Content array, return it
  if (Array.isArray(contents)) {
    return contents as Content[];
  }
  
  // If it's a string, return it
  if (typeof contents === 'string') {
    return contents;
  }
  
  // If it's a single Content object, wrap it in an array
  if (contents && typeof contents === 'object' && 'role' in contents) {
    return [contents as Content];
  }
  
  // Default case - treat as string
  return String(contents);
}

/**
 * Helper to convert Content[] to a simple string prompt
 */
export function contentsToString(contents: Content[]): string {
  return contents
    .map(content => {
      if (content.parts) {
        return content.parts
          .map((part: any) => {
            if (typeof part === 'string') return part;
            if (part.text) return part.text;
            if (part.functionCall) return `[Function Call: ${part.functionCall.name}]`;
            if (part.functionResponse) return `[Function Response]`;
            return '';
          })
          .join('');
      }
      return '';
    })
    .join('\n');
}
