import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripStyleBlocks,
  listDisabledOpeningTags,
  listDataDisabledOpeningTags,
  findOpeningTag
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
        <button type="button" disabled="true" className="btn-disabled-true">Non-standard boolean string</button>
        <input type="text" disabled="disabled" className="input-disabled-str" />
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
        <span foo-data-disabled="true">Non-matching prefix</span>
        <button type="button" data-disabled="true" className="btn-with-data">Button</button>
      </div>
    `;
    const tags = listDataDisabledOpeningTags(html);
    assert.equal(tags.length, 2);
    assert.ok(tags[0].startsWith('<div') && tags[0].includes('className="wrapper-1"'));
    assert.ok(tags[1].startsWith('<button') && tags[1].includes('className="btn-with-data"'));
  });

  it('findOpeningTag finds opening tag preceding marker for given tag name', () => {
    const html = '<div className="container"><button type="button" className="btn-target" disabled="">Click</button></div>';
    const tag = findOpeningTag(html, 'className="btn-target"', 'button');
    assert.equal(tag, '<button type="button" className="btn-target" disabled="">');
  });

  it('findOpeningTag extracts self-closing input tags correctly', () => {
    const html = '<div className="wrap"><input type="text" className="usage usage-readonly" readOnly placeholder="choose" /></div>';
    const tag = findOpeningTag(html, 'className="usage usage-readonly"', 'input');
    assert.equal(tag, '<input type="text" className="usage usage-readonly" readOnly placeholder="choose" />');
  });

  it('findOpeningTag throws error when marker is not found in HTML', () => {
    const html = '<div><input type="text" className="usage" /></div>';
    assert.throws(
      () => findOpeningTag(html, 'non-existent-marker', 'input'),
      /Marker "non-existent-marker" not found in HTML \(target tag: <input>\)/
    );
  });

  it('findOpeningTag throws error when opening tag does not precede marker', () => {
    const html = '<div><span className="info-marker">Text</span></div>';
    assert.throws(
      () => findOpeningTag(html, 'className="info-marker"', 'input'),
      /Opening tag "<input>" preceding marker "className="info-marker"" not found in HTML/
    );
  });

  it('findOpeningTag throws error when marker only exists inside style block', () => {
    const html = '<div><style jsx>{`.btn-style-only { color: blue; }`}</style><button className="btn-normal">OK</button></div>';
    assert.throws(
      () => findOpeningTag(html, '.btn-style-only', 'button'),
      /Marker "\.btn-style-only" not found in HTML \(target tag: <button>\)/
    );
  });

  it('findOpeningTag returns the nearest preceding opening tag and not the first tag or subsequent tags', () => {
    const html = '<div><button id="btn-1" className="btn-first">First</button><button id="btn-2" data-testid="target-btn">Target</button><button id="btn-3" className="btn-last">Last</button></div>';
    const tag = findOpeningTag(html, 'data-testid="target-btn"', 'button');
    assert.equal(tag, '<button id="btn-2" data-testid="target-btn">');
  });
});
