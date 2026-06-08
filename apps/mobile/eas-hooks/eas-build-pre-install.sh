#!/bin/bash

echo "=========================================="
echo "EAS Build Pre-Install Hook"
echo "=========================================="

# Navigate to mobile app directory
cd "$(dirname "$0")/.."

# Create a local copy of the shared package
echo "Setting up @digilog/shared for EAS build..."

# Create a .eas-build directory
mkdir -p .eas-build

# Copy the shared package files
cp -r ../../packages/shared/dist .eas-build/shared-dist 2>/dev/null || echo "Warning: dist folder not found"
cp ../../packages/shared/package.json .eas-build/shared-package.json 2>/dev/null || echo "Warning: package.json not found"

# Create a tarball if it doesn't exist
if [ ! -f .eas-build/digilog-shared-1.0.0.tgz ]; then
    echo "Creating tarball of @digilog/shared..."
    cd ../../packages/shared
    npm pack
    mv digilog-shared-1.0.0.tgz ../../apps/mobile/.eas-build/
    cd ../../apps/mobile
fi

# Update package.json to use the tarball
echo "Updating package.json to use tarball..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.dependencies['@digilog/shared'] && pkg.dependencies['@digilog/shared'].startsWith('file:')) {
    pkg.dependencies['@digilog/shared'] = 'file:.eas-build/digilog-shared-1.0.0.tgz';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    console.log('Updated package.json successfully');
} else {
    console.log('Package.json already updated or different format');
}
"

echo "=========================================="
echo "Pre-install hook complete!"
echo "=========================================="
