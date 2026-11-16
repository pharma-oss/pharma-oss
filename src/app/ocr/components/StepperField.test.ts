import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepperField } from './StepperField';

test('StepperField renders compact-on-desktop class, decrement/increment buttons, and default decimal input attributes', () => {
  const html = renderToStaticMarkup(
    React.createElement(StepperField, {
      value: '3.5',
      onChange: () => {},
      ariaLabel: '1回量'
    })
  );

  assert.ok(html.includes('class="stepper-field compact-on-desktop"'));
  assert.ok(html.includes('aria-label="1回量を減らす"'));
  assert.ok(html.includes('aria-label="1回量を増やす"'));
  assert.ok(html.includes('tabindex="-1"') || html.includes('tabIndex="-1"'));
  assert.match(html, /<input\b[^>]*type="text"/);
  assert.match(html, /<input\b[^>]*inputMode="decimal"/);
  assert.match(html, /<input\b[^>]*aria-label="1回量"/);
  assert.match(html, /<input\b[^>]*value="3\.5"/);
  assert.equal(StepperField.displayName, 'StepperField');
});

test('StepperField applies compactOnDesktop=false, custom inputMode, className, maxLength, placeholder, and inputProps', () => {
  const html = renderToStaticMarkup(
    React.createElement(StepperField, {
      value: '14',
      onChange: () => {},
      ariaLabel: '日数',
      inputMode: 'numeric',
      inputClassName: 'days-input',
      placeholder: '日数',
      maxLength: 3,
      compactOnDesktop: false,
      inputProps: {
        'data-testid': 'dispense-days-input',
        readOnly: true
      }
    })
  );

  assert.doesNotMatch(html, /<div\b[^>]*class="[^"]*compact-on-desktop/);
  assert.ok(html.includes('class="stepper-field "'));
  assert.match(html, /<input\b[^>]*data-testid="dispense-days-input"/);
  assert.match(html, /<input\b[^>]*inputMode="numeric"/);
  assert.match(html, /<input\b[^>]*class="days-input"/);
  assert.match(html, /<input\b[^>]*placeholder="日数"/);
  assert.match(html, /<input\b[^>]*maxLength="3"/);
  assert.match(html, /<input\b[^>]*value="14"/);
  assert.match(html, /<input\b[^>]*\sreadonly=""(?=[\s/>]|$)/i);
  assert.ok(html.includes('aria-label="日数を減らす"'));
  assert.ok(html.includes('aria-label="日数を増やす"'));
});
