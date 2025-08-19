#!/bin/bash

echo "Testing Anthropic model with tools in interactive mode"
echo "Commands to try:"
echo "  run pwd - Should execute pwd command" 
echo "  ls - Should list files"
echo "  Type 'exit' or '/quit' to quit"
echo "---"

export ANTHROPIC_AUTH_TOKEN=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZhZDliZGYyLTY5MDctNDdmZi1hOWRlLWUxYTljYmRmYzdhNSIsInNlY3JldCI6InJjY2ozLy8zckxEQ1ZoL0NPYlE3N3BVMllTam5PTnk2a25FNWhheWg1QXc9In0.EzUi2_3B1BVtOy4JhFJoCx3uM8BO076O7KgSfU6v8Vg
export ANTHROPIC_BASE_URL=https://llm-proxy.perflab.nvidia.com/anthropic
export ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Run in interactive mode
exec node bundle/gemini.js -m claude-sonnet-4-20250514
