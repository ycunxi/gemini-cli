/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { IModelProvider, toGenerateContentResponse, extractPrompt } from './base.js';

/**
 * Adapter that wraps any IModelProvider to implement ContentGenerator
 */
export class ModelProviderAdapter implements ContentGenerator {
  constructor(private provider: IModelProvider) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const prompt = extractPrompt(request);
    // Pass the full config to the provider so it can handle JSON requests
    const config = request.config;
    
    const providerResponse = await this.provider.generateContent(prompt, config);
    return toGenerateContentResponse(providerResponse);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    if (!this.provider.generateContentStream) {
      // Fallback to non-streaming if provider doesn't support it
      const response = await this.generateContent(request, userPromptId);
      return (async function* () {
        yield response;
      })();
    }

    const prompt = extractPrompt(request);
    // Pass the full config to the provider so it can handle JSON requests
    const config = request.config;
    const providerStream = this.provider.generateContentStream(prompt, config);
    
    // Convert provider stream to GenerateContentResponse stream
    return (async function* () {
      for await (const chunk of providerStream) {
        yield toGenerateContentResponse(chunk);
      }
    })();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    if (!this.provider.countTokens) {
      // Fallback estimation if provider doesn't support token counting
      const prompt = extractPrompt(request as any);
      const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      const estimatedTokens = Math.ceil(text.length / 4);
      
      const response = new CountTokensResponse();
      response.totalTokens = estimatedTokens;
      return response;
    }

    const prompt = extractPrompt(request as any);
    const result = await this.provider.countTokens(prompt);
    
    const response = new CountTokensResponse();
    response.totalTokens = result.totalTokens;
    return response;
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    if (!this.provider.embedContent) {
      throw new Error('Embeddings not supported by this provider');
    }

    // Extract text from the request
    let text = '';
    if ('content' in request && request.content) {
      const content = request.content;
      if (typeof content === 'string') {
        text = content;
      } else if (typeof content === 'object' && content !== null && 'parts' in content) {
        const parts = (content as any).parts;
        text = parts.map((p: any) => p.text || '').join(' ');
      }
    } else if ('contents' in request) {
      const contents = (request as any).contents;
      if (Array.isArray(contents)) {
        text = contents.map((c: any) => {
          if (typeof c === 'string') return c;
          if (c.parts) {
            return c.parts.map((p: any) => p.text || '').join(' ');
          }
          return '';
        }).join(' ');
      } else if (typeof contents === 'string') {
        text = contents;
      }
    }

    const result = await this.provider.embedContent(text);
    
    const response = new EmbedContentResponse();
    // Convert number[][] to ContentEmbedding[]
    response.embeddings = result.embeddings.map(values => ({ values }));
    return response;
  }
}
