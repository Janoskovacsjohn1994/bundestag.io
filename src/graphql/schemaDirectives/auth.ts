/* eslint no-underscore-dangle: [0] */
/* eslint no-param-reassign: [0] */

import { SchemaDirectiveVisitor } from 'graphql-tools';
import {
  defaultFieldResolver,
  GraphQLObjectType,
  GraphQLField,
  GraphQLInterfaceType,
} from 'graphql';

class AuthDirective extends SchemaDirectiveVisitor {
  visitObject(type: GraphQLObjectType) {
    this.ensureFieldsWrapped(type);
    type._requiredAuthRole = this.args.requires;
  }
  // Visitor methods for nested types like fields and arguments
  // also receive a details object that provides information about
  // the parent and grandparent types.
  visitFieldDefinition(
    field: GraphQLField<any, any>,
    details: {
      objectType: GraphQLObjectType | GraphQLInterfaceType;
    },
  ) {
    this.ensureFieldsWrapped(details.objectType);
    field._requiredAuthRole = this.args.requires;
  }

  ensureFieldsWrapped(objectType: GraphQLObjectType | GraphQLInterfaceType) {
    // Mark the GraphQLObjectType object to avoid re-wrapping:
    if (objectType._authFieldsWrapped) return;
    objectType._authFieldsWrapped = true;

    const fields = objectType.getFields();

    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName];
      const { resolve = defaultFieldResolver } = field;
      field.resolve = async (...args) => {
        // Get the required Role from the field first, falling back
        // to the objectType if no Role is required by the field:
        const requiredRole = field._requiredAuthRole || objectType._requiredAuthRole;

        if (!requiredRole) {
          return resolve.apply(this, args);
        }

        const [, , context] = args;
        let allow = true;
        if (requiredRole === 'BACKEND') {
          if (
            !context.req.headers['bio-auth-token'] ||
            context.req.headers['bio-auth-token'] !== process.env.BIO_EDIT_TOKEN
          ) {
            global.Log.warn(
              `Connection to Bio blocked from ${context.req.connection.remoteAddress} for role 'BACKEND'`,
            );
            allow = false;
          }
        }
        if (!allow) {
          throw new Error(`not authorized ${context.req.connection.remoteAddress}`);
        }

        return resolve.apply(this, args);
      };
    });
  }
}

export default AuthDirective;
