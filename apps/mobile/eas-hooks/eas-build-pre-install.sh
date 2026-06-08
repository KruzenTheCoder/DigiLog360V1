#!/bin/bash

echo "Running EAS pre-install hook for monorepo..."

# Navigate to monorepo root
cd ../../..

# Install dependencies at the root
npm ci

# Build the shared package
cd packages/shared
npm run build

# Return to mobile directory
cd ../../apps/mobile

echo "Pre-install hook complete!"
