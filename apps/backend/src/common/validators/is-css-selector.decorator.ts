import { registerDecorator, ValidationOptions } from 'class-validator';
import selectorParser from 'postcss-selector-parser';

const PSEUDO_CLASSES = new Set(
  (
    'active any-link autofill checked default defined dir disabled empty enabled first-child first-of-type ' +
    'focus focus-visible focus-within fullscreen has hover indeterminate in-range invalid is lang last-child last-of-type link modal not ' +
    'nth-child nth-last-child nth-last-of-type nth-of-type only-child only-of-type optional out-of-range picture-in-picture placeholder-shown ' +
    'popover-open read-only read-write required root scope target user-invalid user-valid valid visited where -webkit-any -webkit-autofill'
  ).split(' '),
);

export function isCssSelector(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000)
    return false;
  try {
    const root = selectorParser().astSync(value);
    let valid = root.nodes.length > 0;
    root.each((selector) => {
      if (
        !selector.nodes.length ||
        selector.first?.type === 'combinator' ||
        selector.last?.type === 'combinator'
      )
        valid = false;
    });
    root.walk((node) => {
      if (node.type === 'nesting') valid = false;
      if (node.type === 'selector' && !node.nodes.length) valid = false;
      if (
        node.type === 'combinator' &&
        !['', '>', '+', '~'].includes(node.value.trim())
      )
        valid = false;
      if (
        node.type === 'pseudo' &&
        !PSEUDO_CLASSES.has(node.value.slice(1).toLowerCase())
      )
        valid = false;
    });
    return valid;
  } catch {
    return false;
  }
}

export function IsCssSelector(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isCssSelector',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: isCssSelector,
        defaultMessage: (args) =>
          `${args?.property} must be a nonblank CSS selector supported by document.querySelector`,
      },
    });
}
