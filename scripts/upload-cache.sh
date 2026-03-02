#!/bin/bash

# Upload Cache to Firebase Storage
# 
# This script uploads the exported cache file to Firebase Storage
# so all users can download it.
#
# Usage:
#   ./scripts/upload-cache.sh
#
# Prerequisites:
#   - Firebase CLI installed: npm install -g firebase-tools
#   - Logged in to Firebase: firebase login
#   - Cache file exists: cache/noise-readings-master-cache.json

CACHE_FILE="cache/noise-readings-master-cache.json"
BUCKET="noise-pollution-mapper-9ad3d.appspot.com"
DESTINATION="cache/noise-readings-master-cache.json"

# Check if cache file exists
if [ ! -f "$CACHE_FILE" ]; then
  echo "❌ Error: Cache file not found!"
  echo ""
  echo "Please run the export script first:"
  echo "  node scripts/export-cache.js"
  echo ""
  exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
  echo "❌ Error: Firebase CLI not found!"
  echo ""
  echo "Install it with:"
  echo "  npm install -g firebase-tools"
  echo ""
  exit 1
fi

echo "🚀 Uploading cache to Firebase Storage..."
echo ""
echo "📁 File: $CACHE_FILE"
echo "🗑️  Bucket: $BUCKET"
echo "📍 Destination: $DESTINATION"
echo ""

# Upload to Firebase Storage
firebase storage:upload "$CACHE_FILE" --bucket "$BUCKET" --destination "$DESTINATION"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Upload completed successfully!"
  echo ""
  echo "📝 Cache file is now available at:"
  echo "   https://firebasestorage.googleapis.com/v0/b/$BUCKET/o/$DESTINATION?alt=media"
  echo ""
  echo "🎯 Users can now download this file to get all readings instantly!"
  echo ""
else
  echo ""
  echo "❌ Upload failed!"
  echo ""
  echo "Make sure you:"
  echo "  1. Are logged in to Firebase: firebase login"
  echo "  2. Have correct bucket name"
  echo "  3. Have storage rules configured"
  echo ""
  exit 1
fi
