import { describe, it, expect } from 'vitest';
import { agent, llmOpenAIResponses } from '../../dist/volcano-agent-sdk.js';

describe('OpenAI Structured Outputs (Responses API)', () => {
  it('returns valid JSON matching the schema', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }
    
    const llm = llmOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: {
        jsonSchema: {
          name: 'order_response',
          description: 'Order information',
          schema: {
            type: 'object',
            properties: {
              item: { type: 'string' },
              price: { type: 'number' },
              category: { type: 'string' }
            },
            required: ['item', 'price', 'category'],
            additionalProperties: false
          }
        }
      }
    });

    const response = await llm.gen('Return info for an Espresso: item name, price $5.25, category Coffee');
    
    // Should be valid JSON
    const parsed = JSON.parse(response);
    
    // Should match schema
    expect(parsed).toHaveProperty('item');
    expect(parsed).toHaveProperty('price');
    expect(parsed).toHaveProperty('category');
    expect(typeof parsed.item).toBe('string');
    expect(typeof parsed.price).toBe('number');
    expect(typeof parsed.category).toBe('string');
  }, 30000);

  it('works in agent workflows with structured outputs', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }

    const llm = llmOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: {
        jsonSchema: {
          name: 'analysis_result',
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              confidence: { type: 'number' }
            },
            required: ['summary', 'confidence'],
            additionalProperties: false
          }
        }
      }
    });

    const results = await agent({ llm , hideProgress: true })
      .then({ prompt: 'Analyze this text: "The weather is great today". Return a summary and confidence (0-1).' })
      .run();

    expect(results).toBeTruthy();
    expect(results.length).toBe(1);
    expect(results[0].llmOutput).toBeTruthy();
    
    // Should be valid JSON matching schema
    const output = JSON.parse(results[0].llmOutput!);
    expect(output).toHaveProperty('summary');
    expect(output).toHaveProperty('confidence');
    expect(typeof output.confidence).toBe('number');
    expect(output.confidence).toBeGreaterThanOrEqual(0);
    expect(output.confidence).toBeLessThanOrEqual(1);
  }, 30000);

  it('supports streaming with structured outputs', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }

    const llm = llmOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: {
        jsonSchema: {
          name: 'simple_response',
          schema: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            },
            required: ['message'],
            additionalProperties: false
          }
        }
      }
    });

    let streamed = '';
    for await (const chunk of llm.genStream('Say hello in a friendly way')) {
      streamed += chunk;
    }

    // Should be valid JSON
    const parsed = JSON.parse(streamed);
    expect(parsed).toHaveProperty('message');
    expect(typeof parsed.message).toBe('string');
  }, 30000);

  it('works with tools and structured outputs', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }

    const llm = llmOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: {
        jsonSchema: {
          name: 'weather_response',
          schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              temperature: { type: 'number' }
            },
            required: ['location', 'temperature'],
            additionalProperties: false
          }
        }
      }
    });

    const tools: any = [{
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city']
      }
    }];

    const response = await llm.genWithTools(
      'What is the weather in Tokyo? Use the available tool.',
      tools
    );

    expect(response).toBeTruthy();
    expect(Array.isArray(response.toolCalls)).toBe(true);
    expect(response.toolCalls.length).toBeGreaterThan(0);
    expect(response.toolCalls[0].name).toBe('get_weather');
  }, 30000);

  it('throws error if jsonSchema is not provided', () => {
    expect(() => {
      llmOpenAIResponses({
        apiKey: 'test',
        model: 'gpt-4o-mini'
      } as any);
    }).toThrow('jsonSchema');
  });

  it('throws error if model is not provided', () => {
    expect(() => {
      llmOpenAIResponses({
        apiKey: 'test'
      } as any);
    }).toThrow('model');
  });
});

