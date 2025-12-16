#!/bin/bash
set -e

# Azure Updates MCP Server - Package Script
# Generates a distributable .tgz file for internal distribution

echo "🔨 Building project..."
npm run build

echo "📦 Running tests..."
npm test

echo "📦 Creating package tarball..."
npm pack

# Get package name and version from package.json
PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
TARBALL="${PACKAGE_NAME}-${VERSION}.tgz"

echo "✅ Package created: ${TARBALL}"
echo ""
echo "📋 Distribution instructions:"
echo "  1. Share the tarball with your team"
echo "  2. Install globally: npm install -g ./${TARBALL}"
echo "  3. Or run directly: npx ./${TARBALL}"
echo ""
echo "🌐 For HTTP distribution:"
echo "  Upload ${TARBALL} to your internal server and use:"
echo "  npx https://your-server.com/packages/${TARBALL}"
