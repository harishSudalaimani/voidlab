import {
  ApiRef,
  AnyApiFactory,
  BackstageIdentityApi,
  configApiRef,
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  OpenIdConnectApi,
  oauthRequestApiRef,
  ProfileInfoApi,
  SessionApi,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import {
  ScmAuth,
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
} from '@backstage/integration-react';

export const keycloakAuthApiRef: ApiRef<
  OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi
> = createApiRef({ id: 'auth.keycloak' });

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: keycloakAuthApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
    },
    factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
      OAuth2.create({
        configApi,
        discoveryApi,
        oauthRequestApi,
        environment: configApi.getOptionalString('auth.environment'),
        provider: {
          id: 'oidc',
          title: 'Keycloak',
          icon: () => null,
        },
        defaultScopes: ['openid', 'profile', 'email'],
      }),
  }),
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
];
