'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const picomatch = require('./');

test('dangerous repeated wildcard extglobs are bounded and literalized', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const pm = require('./');
    for (const pattern of ['+(*)', '+(*a)', '*(*)', '*(*a)', '+(*a|b)', '+(a*)', '+(**a)', '+(*?a)', 'x+(*a)y', '+(ab|abab)', '*(ab|abab)', '+(abc|abcabc)', '+(a|aa)', '+(a|?a)', '*(a|?a)', '+(a|[a]a)', '*(a|[a]a)', '+(+(ab))', '*(+(ab))', '+(a|"aa")']) {
      for (const opts of [{}, { maxExtglobRecursion: false }]) {
        const match = pm(pattern, opts);
        for (const unit of ['a', 'ab', 'abc']) {
          assert.equal(match(unit.repeat(64) + '!'), false, pattern);
        }
        assert.equal(match(pattern), true, pattern + ' should match literally');
      }
    }
  `], { cwd: __dirname, timeout: 3000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('normal glob syntax and literal extglobs retain their semantics', () => {
  for (const [pattern, yes, no] of [
    ['src/**/*.ts', 'src/nested/index.ts', 'src/index.js'],
    ['**/*.{ts,tsx}', 'src/index.tsx', 'src/index.css'],
    ['file?.[jt]s', 'file1.js', 'file10.js'],
    ['+(ab)', 'abab', 'aba'],
    ['*(ab)', 'abab', 'abc'],
    ['@(foo|bar).ts', 'bar.ts', 'baz.ts'],
    ['!(*.test).ts', 'main.ts', 'main.test.ts'],
    ['+(\\*)', '**', 'aa'],
    ['+(*(a)|*(b))', 'abba', 'abc']
  ]) {
    assert.equal(picomatch(pattern)(yes), true, `${pattern}: ${yes}`);
    assert.equal(picomatch(pattern)(no), false, `${pattern}: ${no}`);
  }
});
