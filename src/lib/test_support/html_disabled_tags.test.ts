import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripStyleBlocks,
  listDisabledOpeningTags,
  listDataDisabledOpeningTags
} from './html_disabled_tags';

describe('html_disabled_tags helper functions', () => {
  it('stripStyleBlocks removes style tags and their contents completely', () => {
    const html = '<div><style jsx>{`button { color: red; }`}</style><button>OK</button></div>';
    const stripped = stripStyleBlocks(html);
    assert.equal(stripped, '<div><button>OK</button></div>');
  });

  it('listDisabledOpeningTags extracts disabled form controls in document order and respects attribute order', () => {
    const html = `
      <div>
        <button type="button" disabled="" className="btn-first">First</button>
        <input disabled="" type="text" placeholder="name" />
        <select name="choice" className="select-box" disabled=""><option>1</option></select>
        <textarea disabled="" rows={3}></textarea>
        <button type="button" className="btn-enabled">Enabled</button>
        <input type="checkbox" className="chk-enabled" />
      </div>
    `;
    const tags = listDisabledOpeningTags(html);
    assert.equal(tags.length, 4);
    assert.ok(tags[0].startsWith('<button') && tags[0].includes('className="btn-first"'));
    assert.ok(tags[1].startsWith('<input') && tags[1].includes('placeholder="name"'));
    assert.ok(tags[2].startsWith('<select') && tags[2].includes('name="choice"'));
    assert.ok(tags[3].startsWith('<textarea') && tags[3].includes('rows={3}'));
  });

  it('listDisabledOpeningTags handles self-closing tags and different attribute positions', () => {
    const html = `
      <div>
        <input type="text" disabled="" value="self-closing" />
        <input disabled="" type="number" />
        <input type="hidden" />
      </div>
    `;
    const tags = listDisabledOpeningTags(html);
    assert.equal(tags.length, 2);
    assert.ok(tags[0].includes('value="self-closing"'));
    assert.ok(tags[1].includes('type="number"'));
  });

  it('listDisabledOpeningTags does not count data-disabled, aria-disabled, or non-form controls', () => {
    const html = `
      <div>
        <button type="button" data-disabled="true" data-disabled="">Not Disabled Button</button>
        <input type="text" aria-disabled="true" aria-disabled="" />
        <div disabled="" className="non-form-element">Not a form control</div>
        <span data-disabled="true">Span</span>
      </div>
    `;
    const tags = listDisabledOpeningTags(html);
    assert.equal(tags.length, 0);
  });

  it('listDisabledOpeningTags ignores button and disabled occurrences inside style blocks', () => {
    const html = `
      <div>
        <style jsx>{\`
          <button disabled="" class="fake-in-style">Fake</button>
          button.disabled="" { opacity: 0.5; }
        \`}</style>
        <button type="button" className="real-btn">Real</button>
      </div>
    `;
    const tags = listDisabledOpeningTags(html);
    assert.equal(tags.length, 0);
  });

  it('listDataDisabledOpeningTags extracts any element with data-disabled="true" and ignores style contents', () => {
    const html = `
      <div>
        <style jsx>{\`
          <div data-disabled="true">Fake in style</div>
        \`}</style>
        <div data-disabled="true" className="wrapper-1">
          <button type="button">Inside</button>
        </div>
        <span data-disabled="false">False data-disabled</span>
        <button type="button" data-disabled="true" className="btn-with-data">Button</button>
      </div>
    `;
    const tags = listDataDisabledOpeningTags(html);
    assert.equal(tags.length, 2);
    assert.ok(tags[0].startsWith('<div') && tags[0].includes('className="wrapper-1"'));
    assert.ok(tags[1].startsWith('<button') && tags[1].includes('className="btn-with-data"'));
  });
});
