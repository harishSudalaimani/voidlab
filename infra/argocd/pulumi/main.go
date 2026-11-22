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
hs.message = "Waiting for child Application to sync and become healthy"
if obj.status ~= nil then
  if obj.status.operationState ~= nil then
    local phase = obj.status.operationState.phase or ""
    if phase == "Failed" or phase == "Error" then
      hs.status = "Degraded"
      hs.message = obj.status.operationState.message or "Child Application sync failed"
      return hs
    end
  end
  if obj.status.conditions ~= nil then
    for _, condition in ipairs(obj.status.conditions) do
      if condition.type == "ComparisonError" or condition.type == "InvalidSpecError" then
        hs.status = "Degraded"
        hs.message = condition.message or condition.type
        return hs
      end
    end
  end
  local syncStatus = ""
  local healthStatus = ""
  if obj.status.sync ~= nil then
    syncStatus = obj.status.sync.status or ""
  end
  if obj.status.health ~= nil then
    healthStatus = obj.status.health.status or ""
  end
  if healthStatus == "Degraded" then
    hs.status = "Degraded"
    hs.message = obj.status.health.message or "Child Application is degraded"
  elseif syncStatus == "Synced" and healthStatus == "Healthy" then
    hs.status = "Healthy"
    hs.message = obj.status.health.message or "Child Application is synced and healthy"
  elseif syncStatus ~= "Synced" then
    hs.message = "Waiting for child Application to sync"
  else
    hs.message = obj.status.health.message or "Waiting for child Application health"
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
							"include": "{projects/**/*.yaml,applications/**/*.yaml}",
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
