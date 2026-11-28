import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  keycloakTransformerExtensionPoint,
  type GroupTransformer,
  type UserTransformer,
} from '@backstage-community/plugin-catalog-backend-module-keycloak';

const BACKSTAGE_ACCESS_GROUP = 'backstage-users';

const groupTransformer: GroupTransformer = async (entity, group) => {
  return group.name === BACKSTAGE_ACCESS_GROUP ? entity : undefined;
};

const userTransformer: UserTransformer = async (entity, user, _realm, groups) => {
  const isEnabled = user.enabled === true;
  const hasEmail = Boolean(user.email?.trim());
  const isBackstageMember = groups.some(
    group =>
      group.name === BACKSTAGE_ACCESS_GROUP &&
      group.members?.includes(user.username ?? ''),
  );

  return isEnabled && hasEmail && isBackstageMember ? entity : undefined;
};

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'keycloak-group-filter',
  register(reg) {
    reg.registerInit({
      deps: { keycloak: keycloakTransformerExtensionPoint },
      async init({ keycloak }) {
        keycloak.setGroupTransformer(groupTransformer);
        keycloak.setUserTransformer(userTransformer);
      },
    });
  },
});
