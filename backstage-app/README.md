# VoidLab Backstage app

Custom Backstage `1.55.2` frontend and backend, kept outside the `gitops/` deployment tree. The frontend provides a Keycloak sign-in page; the backend registers Backstage's generic OIDC provider.

## Keycloak

Create a confidential client with ID `backstage` in the `voidlab` realm. Enable client authentication and Standard flow, disable Direct access grants, and set:

- Redirect URI: `https://backstage.kiroku.life/api/auth/oidc/handler/frame`
- Web origin: `https://backstage.kiroku.life`

The sign-in resolver allows the `harish8.com` email domain and maps the email local-part to a Backstage User entity. The current catalog entity is named `contact`; mark the Keycloak user's email as verified. Deployment secrets are read from Infisical and must not be committed here. See `gitops/README.md` for the Infisical keys and deployment steps.

## Build

Use Node 22 and Yarn 4.4.1:

```sh
yarn install --immutable
yarn tsc
yarn build:backend
docker build . -f packages/backend/Dockerfile \
  -t harbor.kiroku.life/library/voidlab-backstage:1.55.2-oidc1
```

Log in from the home LAN with a Harbor robot that can push to the `library` project, then push the tag:

```sh
docker login harbor.kiroku.life -u '<push-robot-username>'
docker push harbor.kiroku.life/library/voidlab-backstage:1.55.2-oidc1
```

The cluster uses a separate pull-only robot whose credentials are synchronized from Infisical. Publish the image before updating the GitOps deployment to reference its tag. The deployment values are in `gitops/values/platform/backstage/values.yaml`.
