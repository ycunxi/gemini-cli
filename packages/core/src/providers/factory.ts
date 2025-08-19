/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../core/contentGenerator.js';
import { AnthropicProvider } from './anthropic.js';
import { ModelProviderAdapter } from './adapter.js';

/**
 * Factory function to create a ContentGenerator for custom Anthropic setup
 */
export function createCustomAnthropicProvider(): ContentGenerator {
  const provider = new AnthropicProvider();
  return new ModelProviderAdapter(provider);
}

/**
 * Detect which provider to use based on environment variables and model
 */
export function detectProvider(modelName?: string): ContentGenerator | null {
  // IMPORTANT: Only use alternative providers if explicitly requested
  // Default (no model or gemini model) should ALWAYS use original Gemini path
  
  if (!modelName) {
    // No model specified = use Gemini (return null to use default path)
    return null;
  }
  
  const modelLower = modelName.toLowerCase();
  
  // Check if this is an Anthropic model request
  if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
    // Check if Anthropic is configured
    if (!process.env['ANTHROPIC_AUTH_TOKEN'] || !process.env['ANTHROPIC_BASE_URL']) {
      throw new Error(
        `Anthropic model '${modelName}' requested but environment not configured.\n` +
        `Please set:\n` +
        `  export ANTHROPIC_AUTH_TOKEN=your-token\n` +
        `  export ANTHROPIC_BASE_URL=your-base-url\n` +
        `  export ANTHROPIC_MODEL=your-model (optional)`
      );
    }
    
    console.log('🔧 Using Anthropic provider for model:', modelName);
    console.log(`   Base URL: ${process.env['ANTHROPIC_BASE_URL']}`);
    return createCustomAnthropicProvider();
  }
  
  // Check if this is a Gemini model (explicitly return null to use default path)
  if (modelLower.includes('gemini') || modelLower.includes('bison') || modelLower.includes('gecko')) {
    return null; // Use default Gemini path
  }
  
  // Unknown model type - use default Gemini path
  console.debug(`Model '${modelName}' not recognized as alternative provider, using Gemini path`);
  return null;
}
