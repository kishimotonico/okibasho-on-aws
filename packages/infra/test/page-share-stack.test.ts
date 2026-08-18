import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PageShareStack } from '../lib/page-share-stack.js';

/**
 * スタック全体のsnapshot。
 *
 * config.env / config.domains が未設定でも synth が通ることを担保する意図もあるため、
 * ここでは config を読まず env なし（region-agnostic）で合成する。
 */
function synth(): Template {
  const app = new App();
  const stack = new PageShareStack(app, 'PageShare');
  return Template.fromStack(stack);
}

describe('PageShareStack', () => {
  it('テンプレートが意図せず変化していない', () => {
    expect(synth().toJSON()).toMatchSnapshot();
  });
});
