import { registerDecorator, ValidationOptions } from 'class-validator';

/** Validates that a numeric field is an exact multiple of `factor`. E.g. revenue-share
 * percentages, which the product only accepts in 5% increments. */
export function IsMultipleOf(
  factor: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMultipleOf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [factor],
      validator: {
        validate(value: unknown, args) {
          const [expectedFactor] = (args?.constraints ?? [factor]) as [number];
          return typeof value === 'number' && value % expectedFactor === 0;
        },
        defaultMessage(args) {
          const [expectedFactor] = (args?.constraints ?? [factor]) as [number];
          return `${args?.property ?? propertyName} must be a multiple of ${expectedFactor}`;
        },
      },
    });
  };
}
