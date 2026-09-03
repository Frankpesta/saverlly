import {
  ValidationOptions,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { isAnnouncementLayout } from '@saverlly/shared-types';

/**
 * Accepts a value only if `parseAnnouncementLayout` can make a renderable layout out of it.
 *
 * The check lives in @saverlly/shared-types rather than here on purpose: the same function is
 * what the kiosk agent renders with, so anything this endpoint accepts is by definition something
 * the kiosk can draw. Note that passing validation is not the same as being stored verbatim
 * AnnouncementsService re-runs the parser and persists the *sanitized* result, so the database
 * never holds colors, URLs or dimensions that the renderer would have to defend against later.
 */
export function IsAnnouncementLayout(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAnnouncementLayout',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isAnnouncementLayout(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid announcement layout`;
        },
      },
    });
  };
}
