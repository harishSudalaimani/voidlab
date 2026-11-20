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
	defaultChartVersion = "10.18.0"
	defaultNamespace    = "argocd"
	chartOCI            = "oci://ghcr.io/argoproj/argo-helm/argo-cd"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-argocd")
		chartVersion := configString(cfg, "chartVersion", defaultChartVersion)
		namespaceName := configString(cfg, "namespace", defaultNamespace)
		repoURL := configString(cfg, "gitOpsRepoURL", "https://github.com/harishSudalaimani/voidlab.git")
		repoRevision := configString(cfg, "gitOpsRevision", "main")
		appsPath := configString(cfg, "gitOpsApplicationsPath", "gitops/argocd/applications")
		if chartVersion == "" || namespaceName == "" || repoURL == "" || repoRevision == "" || appsPath == "" {
			return fmt.Errorf("chartVersion, namespace, gitOpsRepoURL, gitOpsRevision, and gitOpsApplicationsPath must not be empty")
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
			"server": pulumi.Map{
				"service": pulumi.Map{
					"type": pulumi.String("ClusterIP"),
				},
			},
		}

		argocd, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Chart:           pulumi.String(chartOCI),
			Version:         pulumi.String(chartVersion),
			Namespace:       pulumi.String(namespaceName),
			CreateNamespace: pulumi.Bool(false),
			Values:          values,
			SkipAwait:       pulumi.Bool(false),
		}, pulumi.DependsOn([]pulumi.Resource{argocdNamespace}))
		if err != nil {
			return fmt.Errorf("install Argo CD Helm release: %w", err)
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
					"project": "default",
					"source": map[string]interface{}{
						"repoURL":        repoURL,
						"targetRevision": repoRevision,
						"path":           appsPath,
						"directory": map[string]interface{}{
							"recurse": true,
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
		}, pulumi.DependsOn([]pulumi.Resource{argocd}))
		if err != nil {
			return fmt.Errorf("create Argo CD GitOps root Application: %w", err)
		}

		ctx.Export("argocdNamespace", pulumi.String(namespaceName))
		ctx.Export("argocdReleaseName", argocd.Status.Name())
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
