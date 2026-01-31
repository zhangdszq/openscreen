#!/usr/bin/env node

/**
 * 原生模块构建脚本
 *
 * 用法:
 *   node scripts/build.js          # 构建 Release 版本
 *   node scripts/build.js --debug  # 构建 Debug 版本
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDebug = process.argv.includes('--debug');
const rootDir = path.join(__dirname, '..');

console.log('='.repeat(60));
console.log('Openscreen Native Module Builder');
console.log('='.repeat(60));
console.log('');
console.log(`Build mode: ${isDebug ? 'Debug' : 'Release'}`);
console.log(`Working directory: ${rootDir}`);
console.log('');

// 检查 Rust 环境
try {
  const rustVersion = execSync('rustc --version', { encoding: 'utf8' }).trim();
  console.log(`Rust: ${rustVersion}`);
} catch (error) {
  console.error('Error: Rust is not installed!');
  console.error('Please install Rust from https://rustup.rs/');
  process.exit(1);
}

// 检查 napi-rs CLI
try {
  execSync('npx napi --version', { encoding: 'utf8', cwd: rootDir });
} catch (error) {
  console.log('Installing @napi-rs/cli...');
  execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
}

// 构建
console.log('');
console.log('Building native module...');
console.log('');

try {
  const buildCmd = isDebug ? 'npm run build:debug' : 'npm run build';
  execSync(buildCmd, { cwd: rootDir, stdio: 'inherit' });
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Build completed successfully!');
  console.log('='.repeat(60));
  
  // 列出生成的文件
  const files = fs.readdirSync(rootDir).filter(f => f.endsWith('.node') || f === 'index.js' || f === 'index.d.ts');
  if (files.length > 0) {
    console.log('');
    console.log('Generated files:');
    files.forEach(f => console.log(`  - ${f}`));
  }
  
} catch (error) {
  console.error('');
  console.error('Build failed!');
  console.error('');
  console.error('Common issues:');
  console.error('1. Missing FFmpeg development libraries');
  console.error('   - Windows: winget install FFmpeg');
  console.error('   - macOS: brew install ffmpeg');
  console.error('   - Linux: apt install libavcodec-dev libavformat-dev');
  console.error('');
  console.error('2. Missing Visual Studio Build Tools (Windows)');
  console.error('   - winget install Microsoft.VisualStudio.2022.BuildTools');
  console.error('');
  process.exit(1);
}
