package main

import (
	"fmt"

	kubernetes "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/apiextensions"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultChartVersion = "10.18.2"
	defaultAppVersion   = "v3.6.2"
	defaultNamespace    = "argocd"
	defaultReleaseName  = "argocd"
	controlPlaneNode    = "cp"
	chartName           = "argo-cd"
	chartRepository     = "https://argoproj.github.io/argo-helm"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-argocd")
		chartVersion := configString(cfg, "chartVersion", defaultChartVersion)
		appVersion := configString(cfg, "appVersion", defaultAppVersion)
		namespaceName := configString(cfg, "namespace", defaultNamespace)
		releaseName := configString(cfg, "releaseName", defaultReleaseName)
		repoURL := configString(cfg, "gitOpsRepoURL", "https://github.com/harishSudalaimani/voidlab.git")
		repoRevision := configString(cfg, "gitOpsRevision", "main")
		appsPath := configString(cfg, "gitOpsApplicationsPath", "gitops")
		if chartVersion == "" || appVersion == "" || namespaceName == "" || releaseName == "" || repoURL == "" || repoRevision == "" || appsPath == "" {
			return fmt.Errorf("chartVersion, appVersion, namespace, releaseName, gitOpsRepoURL, gitOpsRevision, and gitOpsApplicationsPath must not be empty")
		}

		argocdNamespace, err := corev1.NewNamespace(ctx, "argocd-namespace", &corev1.NamespaceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Name: pulumi.String(namespaceName),
			},
		})
		if err != nil {
			return fmt.Errorf("create Argo CD namespace: %w", err)
		}

		values := pulumi.Map{
			"global": pulumi.Map{
				"image": pulumi.Map{
					"tag": pulumi.String(appVersion),
				},
				"nodeSelector": pulumi.Map{
					"kubernetes.io/hostname": pulumi.String(controlPlaneNode),
				},
				"tolerations": pulumi.Array{
					pulumi.Map{
						"key":      pulumi.String("node-role.kubernetes.io/control-plane"),
						"operator": pulumi.String("Exists"),
						"effect":   pulumi.String("NoSchedule"),
					},
				},
			},
			"server": pulumi.Map{
				"service": pulumi.Map{
					"type": pulumi.String("ClusterIP"),
				},
			},
			"configs": pulumi.Map{
				"cm": pulumi.Map{
					"resource.customizations.health.argoproj.io_Application": pulumi.String(`
hs = {}
hs.status = "Progressing"
hs.message = "Waiting for child Application health"
if obj.status ~= nil and obj.status.health ~= nil then
  hs.status = obj.status.health.status
  hs.message = obj.status.health.message or ""
end
return hs
`),
					"resource.customizations.health.postgresql.cnpg.io_Cluster": pulumi.String(`
hs = {}
hs.status = "Progressing"
hs.message = "Waiting for CloudNativePG Ready condition"
if obj.status ~= nil and obj.status.conditions ~= nil then
  for _, condition in ipairs(obj.status.conditions) do
    if condition.type == "Ready" then
      if condition.status == "True" then
        hs.status = "Healthy"
        hs.message = condition.message or "CloudNativePG cluster is ready"
        return hs
      elseif condition.status == "False" then
        hs.status = "Degraded"
        hs.message = condition.message or condition.reason or "CloudNativePG cluster is not ready"
        return hs
      end
    end
  end
end
return hs
`),
				},
			},
		}

		argocd, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Name:            pulumi.String(releaseName),
			Chart:           pulumi.String(chartName),
			Version:         pulumi.String(chartVersion),
			RepositoryOpts:  helm.RepositoryOptsArgs{Repo: pulumi.String(chartRepository)},
			Namespace:       pulumi.String(namespaceName),
			CreateNamespace: pulumi.Bool(false),
			Values:          values,
			SkipAwait:       pulumi.Bool(false),
			Timeout:         pulumi.Int(900),
		}, pulumi.DependsOn([]pulumi.Resource{argocdNamespace}))
		if err != nil {
			return fmt.Errorf("install Argo CD Helm release: %w", err)
		}

		bootstrapProject, err := apiextensions.NewCustomResource(ctx, "voidlab-bootstrap-project", &apiextensions.CustomResourceArgs{
			ApiVersion: pulumi.String("argoproj.io/v1alpha1"),
			Kind:       pulumi.String("AppProject"),
			Metadata: &metav1.ObjectMetaArgs{
				Name:      pulumi.String("bootstrap"),
				Namespace: pulumi.String(namespaceName),
			},
			OtherFields: kubernetes.UntypedArgs{
				"spec": map[string]interface{}{
					"description": "Root project for VoidLab GitOps configuration",
					"sourceRepos": []string{repoURL},
					"destinations": []map[string]interface{}{{
						"server":    "https://kubernetes.default.svc",
						"namespace": namespaceName,
					}},
					"clusterResourceWhitelist": []map[string]interface{}{
						{"group": "cilium.io", "kind": "CiliumClusterwideNetworkPolicy"},
						{"group": "cilium.io", "kind": "CiliumCIDRGroup"},
					},
				},
			},
		}, pulumi.DependsOn([]pulumi.Resource{argocd}))
		if err != nil {
			return fmt.Errorf("create Argo CD bootstrap AppProject: %w", err)
		}

		rootApplication, err := apiextensions.NewCustomResource(ctx, "voidlab-applications", &apiextensions.CustomResourceArgs{
			ApiVersion: pulumi.String("argoproj.io/v1alpha1"),
			Kind:       pulumi.String("Application"),
			Metadata: &metav1.ObjectMetaArgs{
				Name:      pulumi.String("voidlab-applications"),
				Namespace: pulumi.String(namespaceName),
			},
			OtherFields: kubernetes.UntypedArgs{
				"spec": map[string]interface{}{
					"project": "bootstrap",
					"source": map[string]interface{}{
						"repoURL":        repoURL,
						"targetRevision": repoRevision,
						"path":           appsPath,
						"directory": map[string]interface{}{
							"recurse": true,
							"include": "{projects/**/*.yaml,applications/**/*.yaml,policies/**/*.yaml}",
						},
					},
					"destination": map[string]interface{}{
						"server":    "https://kubernetes.default.svc",
						"namespace": namespaceName,
					},
					"syncPolicy": map[string]interface{}{
						"automated": map[string]interface{}{
							"allowEmpty": true,
							"prune":      true,
							"selfHeal":   true,
						},
					},
				},
			},
		}, pulumi.DependsOn([]pulumi.Resource{argocd, bootstrapProject}))
		if err != nil {
			return fmt.Errorf("create Argo CD GitOps root Application: %w", err)
		}

		ctx.Export("argocdNamespace", pulumi.String(namespaceName))
		ctx.Export("argocdNodeName", pulumi.String(controlPlaneNode))
		ctx.Export("argocdAppVersion", pulumi.String(appVersion))
		ctx.Export("argocdReleaseName", pulumi.String(releaseName))
		ctx.Export("argocdChartVersion", pulumi.String(chartVersion))
		ctx.Export("gitOpsRootApplication", rootApplication.Metadata.Name())
		ctx.Export("gitOpsApplicationsPath", pulumi.String(appsPath))
		ctx.Export("serverService", pulumi.String(namespaceName+"/argocd-server"))
		ctx.Export("uiPortForward", pulumi.String("kubectl -n "+namespaceName+" port-forward svc/argocd-server 8080:443"))
		return nil
	})
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}
