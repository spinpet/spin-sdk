const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const terser = require('@rollup/plugin-terser');
const json = require('@rollup/plugin-json');

// 环境变量
const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

// Rollup配置
module.exports = [
  // CommonJS (适用于Node.js)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/spin-sdk.cjs.js',
      format: 'cjs',
      name: 'SpinSDK',
      exports: 'named',
      sourcemap: !isProd,
    },
    external: ['@solana/web3.js', 'fs'],
    plugins: [
      json(),
      nodeResolve(),
      commonjs(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        preventAssignment: true,
      }),
      isProd && terser(),
    ],
  },
  
  // ESM (适用于现代浏览器和构建工具)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/spin-sdk.esm.js',
      format: 'es',
      sourcemap: !isProd,
    },
    external: ['@solana/web3.js', 'fs'],
    plugins: [
      json(),
      nodeResolve(),
      commonjs(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        preventAssignment: true,
      }),
      isProd && terser(),
    ],
  },
  
  // UMD (通用模块，可在浏览器中直接使用)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/spin-sdk.js',
      format: 'umd',
      name: 'SpinSDK',
      exports: 'named',
      sourcemap: !isProd,
      globals: {
        '@solana/web3.js': 'solanaWeb3',
      },
    },
    external: ['@solana/web3.js'],
    plugins: [
      json(),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        'require("fs")': 'null',
        preventAssignment: true,
      }),
      isProd && terser(),
    ],
  },
]; 