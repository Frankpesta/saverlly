import { registerDecorator, ValidationOptions } from 'class-validator';

// At least 8 characters, at least one letter, at least one digit. Matches the strength bar
// shown client-side (components/dashboard/password-strength.tsx) so a password that reads as
// "weak" there is also rejected here, not just discouraged.
const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' && STRONG_PASSWORD_PATTERN.test(value)
          );
        },
        defaultMessage() {
          return 'Password must be at least 8 characters and include a letter and a number';
        },
      },
    });
  };
}
